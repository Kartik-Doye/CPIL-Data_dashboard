import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generateForecast, PersistedForecastErrors } from './src/engine/forecasting.js';
import {
  runComprehensiveAnalysis,
  simulateWhatIf,
} from './src/engine/dataAnalysis.js';
import {
  getDailyView,
  getStatePeriodView,
  getTMPeriodView,
  getTypePeriodView,
  getExceptionsView,
  getDataStatusView,
  normalizeStateCode,
} from './src/engine/analyticsViews.js';
import { query, queryLoader, isLoaderConfigured, testDbConnection, getDbAuditReport, getDbConnectionDetails } from './src/engine/db.js';
import { escapeCsvCell } from './src/engine/formatting.js';
import { StationMonthlySales, StationRecord } from './src/types.js';
import { sendExecutiveBriefing, buildStationWorkbook, isEmailConfigured } from './src/engine/emailReport.js';
import { buildExecutivePdfBuffer } from './src/engine/pdfReport.js';
import http from 'http';
import cron from 'node-cron';
import {
  getWhatsAppStatus,
  getWhatsAppAuditLog,
  sendWhatsAppMessage,
  buildExecutiveWhatsAppMessage,
  buildTankerDispatchWhatsAppMessage,
} from './src/engine/whatsappService.js';
import { recommendTanker } from './src/engine/tanker.js';
import {
  loadTmTargetDailyFromFile,
  invalidateTmTargetDailyCache,
  TmTargetDailySummary,
} from './src/engine/tmTargetDaily.js';
import { initWhatsAppAutomation } from './src/engine/whatsappAutomation.js';
import {
  APP_BASE_URL,
  APP_LOCAL_HOSTNAMES,
  APP_NAME,
  APP_REQUEST_BODY_LIMIT,
  APP_TIMEZONE,
  APP_TRUSTED_HOST_SUFFIXES,
  EMAIL_CRON_EXPRESSION,
  EMAIL_SCHEDULE_LABEL,
  EMAIL_SEND_COOLDOWN_SECONDS,
  LEARNING_REFRESH_INTERVAL_MS,
  PORT,
  PRODUCT_CONFIG,
  TELEMETRY_CACHE_DURATION_MS,
  WHATSAPP_SEND_COOLDOWN_SECONDS,
} from './src/engine/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: APP_REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: APP_REQUEST_BODY_LIMIT }));
initWhatsAppAutomation(app, server, async () => {
  const telemetry = await getTelemetryData(true);
  if (!telemetry) throw new Error('PostgreSQL telemetry is unavailable; the scheduled briefing was not sent.');
  return buildExecutiveWhatsAppMessage(telemetry);
});

let cachedTelemetry: any = null;
let lastLoadedTime = 0;
let emailSendInProgress = false;
let lastEmailSentAt = 0;
let whatsappSendInProgress = false;
let lastWhatsAppSentAt = 0;
const runtimeSettings = new Map<string, any>();
const RUNTIME_SETTINGS_PATH = path.resolve(__dirname, '..', '.runtime_settings.json');

function readDiskSettings(): Record<string, any> {
  try {
    if (fs.existsSync(RUNTIME_SETTINGS_PATH)) {
      const raw = fs.readFileSync(RUNTIME_SETTINGS_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // Ignore malformed disk cache
  }
  return {};
}

function writeDiskSetting(key: string, value: any): void {
  try {
    const current = readDiskSettings();
    current[key] = value;
    fs.writeFileSync(RUNTIME_SETTINGS_PATH, JSON.stringify(current, null, 2), 'utf-8');
  } catch {
    // Ignore disk write failure
  }
}

export async function loadAppSetting<T = any>(key: string, defaultValue: T): Promise<T> {
  if (runtimeSettings.has(key)) {
    return runtimeSettings.get(key) as T;
  }
  try {
    const rows = await query<{ value: T }>('SELECT value FROM settings WHERE key = $1', [key]);
    if (rows.length > 0 && rows[0].value !== undefined && rows[0].value !== null) {
      runtimeSettings.set(key, rows[0].value);
      writeDiskSetting(key, rows[0].value);
      return rows[0].value;
    }
  } catch {
    // Table may not be installed; fall back to disk settings
  }
  const disk = readDiskSettings();
  if (disk[key] !== undefined && disk[key] !== null) {
    runtimeSettings.set(key, disk[key]);
    return disk[key] as T;
  }
  return defaultValue;
}

export async function saveAppSetting<T = any>(key: string, value: T): Promise<void> {
  runtimeSettings.set(key, value);
  writeDiskSetting(key, value);
  if (isLoaderConfigured()) {
    try {
      await queryLoader(
        `INSERT INTO settings (key, value)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(value)],
      );
    } catch {
      // Keep in-memory & disk setting if DB write is not permitted for settings
    }
  }
}

async function loadFromDatabase(requestedDate?: string): Promise<any | null> {
  const dbConnection = getDbConnectionDetails();

  try {
    // Load ALL historical dates present in PostgreSQL sale_tracker (no artificial day-window truncation)
    const historyRows = await query(`
      SELECT 
        sale_date::text as date,
        SUM(sale_qty)::float as sale_qty,
        SUM(COALESCE(net_total_collection, collection))::float as collection,
        SUM(COALESCE(paytm, 0))::float as paytm_collection,
        SUM(COALESCE(net_cash_collection, 0))::float as cash_collection,
        COUNT(DISTINCT erp_code)::int as active_stations,
        COUNT(CASE WHEN sale_qty = 0 THEN 1 END)::int as zero_sale_count
      FROM sale_tracker
      GROUP BY sale_date
      ORDER BY sale_date ASC
    `);

    if (!historyRows || historyRows.length === 0) {
      console.warn('[DATABASE] Connection successful, but table "sale_tracker" is empty. Check if you loaded data using "npm run load-sales".');
      return null;
    }

    const availableDates = historyRows.map((hr: any) => hr.date.slice(0, 10)).sort().reverse();
    const maxDate = availableDates[0];
    const activeDate = requestedDate && availableDates.includes(requestedDate) ? requestedDate : maxDate;

    console.log(`[DATABASE] Success! Found ${historyRows.length} days of history in PostgreSQL (active date: ${activeDate}).`);

    const recent7dStationRows = await query<{ erp_code: string; date: string; sale_qty: number; paytm: number; collection: number }>(`
      SELECT
        erp_code,
        sale_date::text AS date,
        SUM(sale_qty)::float AS sale_qty,
        SUM(COALESCE(paytm, 0))::float AS paytm,
        SUM(COALESCE(net_total_collection, collection, 0))::float AS collection
      FROM sale_tracker
      WHERE sale_date IN (
        SELECT DISTINCT sale_date
        FROM sale_tracker
        WHERE sale_date <= $1::date
        ORDER BY sale_date DESC
        LIMIT 7
      )
      GROUP BY erp_code, sale_date
      ORDER BY sale_date ASC, erp_code ASC
    `, [activeDate]);
    const recent7dDates = [...new Set(recent7dStationRows.map((row) => row.date.slice(0, 10)))].sort();
    const previousDate = recent7dDates.filter((d) => d < activeDate).at(-1) ?? null;
    const recent7dByStation = new Map<string, Array<{ date: string; sale_qty: number; paytm: number; collection: number }>>();
    for (const row of recent7dStationRows) {
      const code = row.erp_code;
      const list = recent7dByStation.get(code) ?? [];
      list.push({
        date: row.date.slice(0, 10),
        sale_qty: Number(row.sale_qty) || 0,
        paytm: Number(row.paytm) || 0,
        collection: Number(row.collection) || 0,
      });
      recent7dByStation.set(code, list);
    }

    const monthlySalesRows = await query(`
      SELECT
        erp_code,
        DATE_TRUNC('month', sale_date)::date::text AS month,
        SUM(sale_qty)::float AS sale_qty,
        COUNT(DISTINCT sale_date)::int AS reporting_days
      FROM sale_tracker
      WHERE sale_date <= $1::date
      GROUP BY erp_code, DATE_TRUNC('month', sale_date)
      ORDER BY month ASC, erp_code ASC
    `, [activeDate]);

    const stationMappingTable = await query<{ mapping_available: boolean }>(
      "SELECT to_regclass('public.station_contact_mapping') IS NOT NULL AS mapping_available",
    );
    const hasStationContactMapping = Boolean(stationMappingTable[0]?.mapping_available);
    if (!hasStationContactMapping) {
      console.info('[DATABASE] Station/TM mapping table is not installed; using the current sale_tracker names and TM values.');
    }

    const latestStations = await query(`
      SELECT 
        s.erp_code,
        ${hasStationContactMapping
    ? "COALESCE(NULLIF(TRIM(cm.alds_name), ''), s.alds_name)"
    : 's.alds_name'} AS alds_name,
        ${hasStationContactMapping
    ? "COALESCE(m.to_state, NULLIF(TRIM(cm.state), ''), s.state)"
    : 'COALESCE(m.to_state, s.state)'} AS state,
        ${hasStationContactMapping
    ? "COALESCE(NULLIF(TRIM(cm.tm), ''), NULLIF(TRIM(s.tm), ''), 'No TM')"
    : "COALESCE(NULLIF(TRIM(s.tm), ''), 'No TM')"} AS tm,
        COALESCE(NULLIF(TRIM(s.coordinator), ''), 'Unassigned') as coordinator,
        COALESCE(NULLIF(TRIM(s.type), ''), 'LOCO') as type,
        s.tank_cap,
        s.sale_qty::float as sale_qty,
        s.collection::float as collection,
        s.new_rate::float as new_rate,
        s.other::float as other,
        s.diff::float as diff,
        s.erp_rate::float as erp_rate,
        s.ret_test_cal::float as ret_test_cal,
        s.free_sale_litres::float as free_sale_litres,
        s.free_sale_rupees::float as free_sale_rupees,
        s.scheme::float as scheme,
        s.paytm::float as paytm,
        s.net_cash_collection::float as net_cash_collection,
        s.closing_dip_in_ltr::float as closing_dip_in_ltr,
        s.remark,
        s.net_total_collection::float as net_total_collection,
        s.effective_rsp::float as effective_rsp,
        s.collection_check::float as collection_check,
        s.scheme_as_per_ho::float as scheme_as_per_ho,
        s.free_sale_pct::float as free_sale_pct,
        s.sale_date::text as sale_date
      FROM sale_tracker s
      ${hasStationContactMapping
    ? `LEFT JOIN public.station_contact_mapping cm ON UPPER(TRIM(cm.erp_code)) = UPPER(TRIM(s.erp_code))
      LEFT JOIN state_map m ON COALESCE(NULLIF(TRIM(cm.state), ''), s.state) = m.from_state`
    : 'LEFT JOIN state_map m ON s.state = m.from_state'}
      WHERE s.sale_date = $1::date
    `, [activeDate]);

    if (!latestStations || latestStations.length === 0) {
      console.warn('[DATABASE] History found, but date query returned 0 stations. Check data consistency.');
      return null;
    }

    console.log(`[DATABASE] Loaded ${latestStations.length} stations for date: ${latestStations[0].sale_date}`);

    const activeStns = latestStations.filter((r: any) => r.sale_qty > 0);
    const networkAvgSale = activeStns.length > 0 
      ? activeStns.reduce((a: number, b: any) => a + b.sale_qty, 0) / activeStns.length 
      : PRODUCT_CONFIG.analytics.defaultStationBenchmarkLitres;
    const tmTargetDaily = await loadTmTargetDailyFromFile(
      path.resolve(__dirname, '..', 'TM Target Daily.xlsx'),
    ).catch((err) => {
      console.warn(`[TM TARGET DAILY] Could not read TM Target Daily.xlsx: ${err.message}`);
      return null;
    });
    const savedBenchmarks = await loadAppSetting<{
      tmTargets?: Record<string, number>;
      stationTargets?: Record<string, number>;
      mtimeMs?: number;
    }>('sales_benchmarks', {});
    const excelIsNewerOrPrimary =
      !savedBenchmarks.mtimeMs || (tmTargetDaily && tmTargetDaily.mtimeMs >= savedBenchmarks.mtimeMs);
    const statusBandsCfg = PRODUCT_CONFIG.analytics.statusBands;
    const activeMonthPrefix = activeDate.slice(0, 7);
    const activeYearNum = Number(activeDate.slice(0, 4)) || 2026;
    const activeMonthNum = Number(activeDate.slice(5, 7)) || 11;
    const daysInActiveMonth = new Date(Date.UTC(activeYearNum, activeMonthNum, 0)).getUTCDate() || 30;
    const elapsedDaysInMonth = Math.max(1, Number(activeDate.slice(8, 10)) || 1);
    const remainingDaysInMonth = Math.max(0, daysInActiveMonth - elapsedDaysInMonth);
    const mtdByStation = new Map<string, { sale_qty: number; reporting_days: number }>();
    for (const mRow of monthlySalesRows) {
      if (String(mRow.month || '').startsWith(activeMonthPrefix)) {
        mtdByStation.set(String(mRow.erp_code || '').trim().toUpperCase(), {
          sale_qty: Number(mRow.sale_qty) || 0,
          reporting_days: Number(mRow.reporting_days) || 1,
        });
      }
    }

    const stations: StationRecord[] = latestStations.map((r: any, i: number) => {
      const erpKey = String(r.erp_code || '').trim().toUpperCase();
      const excelStationMeta = tmTargetDaily?.stationMetaByErp[erpKey];
      const resolvedTm =
        r.tm && r.tm !== 'No TM'
          ? r.tm
          : excelStationMeta?.tm || 'No TM';
      const ssName = excelStationMeta?.ss || '';
      const saleDateStr = r.sale_date ? r.sale_date.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const stationRecent7d = recent7dByStation.get(r.erp_code) ?? [
        { date: saleDateStr, sale_qty: r.sale_qty || 0, paytm: r.paytm || 0, collection: r.net_total_collection || r.collection || 0 },
      ];
      const activeRecentDays = stationRecent7d.filter((d) => d.sale_qty > 0);
      const rolling7dBurn = activeRecentDays.length > 0
        ? Number((activeRecentDays.reduce((sum, d) => sum + d.sale_qty, 0) / activeRecentDays.length).toFixed(2))
        : (r.sale_qty > 0 ? r.sale_qty : networkAvgSale);
      const dailyBurn = rolling7dBurn > 0 ? rolling7dBurn : networkAvgSale;
      const closingDip = r.closing_dip_in_ltr || 0;
      const daysLeft = dailyBurn > 0
        ? Number((Math.max(0, closingDip) / dailyBurn).toFixed(1))
        : 99;
      
      const priorDays = stationRecent7d.filter((d) => d.date < saleDateStr && d.sale_qty > 0);
      const priorAvg = priorDays.length > 0
        ? priorDays.reduce((sum, d) => sum + d.sale_qty, 0) / priorDays.length
        : networkAvgSale;
      const trendSlope = r.sale_qty === 0
        ? -100
        : priorAvg > 0
          ? Number((((r.sale_qty - priorAvg) / priorAvg) * 100).toFixed(1))
          : 0;

      const prevDayEntry = previousDate
        ? stationRecent7d.find((d) => d.date === previousDate)
        : undefined;
      const prevDaySaleQty = prevDayEntry !== undefined ? prevDayEntry.sale_qty : null;
      const saleQty = r.sale_qty || 0;
      const dodDeltaQty = prevDaySaleQty !== null ? Number((saleQty - prevDaySaleQty).toFixed(2)) : null;
      const dodDeltaPct = prevDaySaleQty !== null && prevDaySaleQty > 0
        ? Number((((saleQty - prevDaySaleQty) / prevDaySaleQty) * 100).toFixed(1))
        : null;
      const collection = r.collection || 0;
      const netTotalCollection = r.net_total_collection || collection || 0;
      const computedEffRsp = saleQty > 0
        ? Number((netTotalCollection / saleQty).toFixed(2))
        : (r.new_rate || r.erp_rate || 0);
      const effectiveRsp = r.effective_rsp || computedEffRsp;
      const freeSaleLitres = r.free_sale_litres || 0;
      const freeSalePct = r.free_sale_pct || (saleQty > 0 ? Number(((freeSaleLitres / saleQty) * 100).toFixed(2)) : 0);
      const excelTarget = excelStationMeta?.dailyTarget;
      const stationTarget = excelIsNewerOrPrimary
        ? (excelTarget !== undefined && excelTarget > 0
          ? excelTarget
          : savedBenchmarks.stationTargets?.[r.erp_code] ??
            tmTargetDaily?.tmAvgStationTargets[resolvedTm] ??
            savedBenchmarks.tmTargets?.[resolvedTm] ??
            networkAvgSale)
        : (savedBenchmarks.stationTargets?.[r.erp_code] ??
          (excelTarget !== undefined && excelTarget > 0 ? excelTarget : undefined) ??
          savedBenchmarks.tmTargets?.[resolvedTm] ??
          tmTargetDaily?.tmAvgStationTargets[resolvedTm] ??
          networkAvgSale);
      const achievementPct = stationTarget > 0 ? Number(((saleQty / stationTarget) * 100).toFixed(1)) : 0;
      const targetVarianceQty = Number((saleQty - stationTarget).toFixed(2));
      const statusBand =
        achievementPct >= statusBandsCfg.achievedPct
          ? 'Achieved'
          : achievementPct >= statusBandsCfg.nearPct
            ? 'On track'
            : achievementPct >= statusBandsCfg.belowPct
              ? 'At risk'
              : 'Behind';

      const paytmVal = r.paytm || 0;
      const cashValRaw = r.net_cash_collection || 0;
      const cashVal = cashValRaw > 0 ? cashValRaw : Math.max(0, netTotalCollection - paytmVal);
      const paymentDenom = paytmVal + cashVal > 0 ? Math.max(netTotalCollection, paytmVal + cashVal) : netTotalCollection;
      const digitalPct = paymentDenom > 0 ? Number(((paytmVal / paymentDenom) * 100).toFixed(1)) : 0;
      const cashPct = paymentDenom > 0 ? Number(((cashVal / paymentDenom) * 100).toFixed(1)) : 0;

      // Prior 7-day Digital % vs Today's Cash Spike %
      const priorPayDays = priorDays.filter((d) => (d.collection || 0) > 0);
      const prior7dPaytmSum = priorPayDays.reduce((s, d) => s + (d.paytm || 0), 0);
      const prior7dCollSum = priorPayDays.reduce((s, d) => s + (d.collection || 0), 0);
      const prior7dDigitalPct = prior7dCollSum > 0
        ? Number(((prior7dPaytmSum / prior7dCollSum) * 100).toFixed(1))
        : digitalPct;
      const cashSpikePct = Number((prior7dDigitalPct - digitalPct).toFixed(1));

      // Month-to-Date (MTD) Cumulative Pacing & End-of-Month (EOM) Landing Projection
      const monthlyTargetVal =
        excelStationMeta?.monthlyTarget && excelStationMeta.monthlyTarget > 0
          ? excelStationMeta.monthlyTarget
          : Number((stationTarget * daysInActiveMonth).toFixed(2));
      const mtdEntry = mtdByStation.get(erpKey);
      const mtdSaleQty = mtdEntry ? mtdEntry.sale_qty : saleQty;
      const mtdReportingDays = mtdEntry ? mtdEntry.reporting_days : 1;
      const mtdProRataTarget = Number((stationTarget * elapsedDaysInMonth).toFixed(2));
      const mtdAchievementPct = mtdProRataTarget > 0
        ? Number(((mtdSaleQty / mtdProRataTarget) * 100).toFixed(1))
        : 0;
      const monthlyTargetAchievedPct = monthlyTargetVal > 0
        ? Number(((mtdSaleQty / monthlyTargetVal) * 100).toFixed(1))
        : 0;
      const requiredAskingRate = remainingDaysInMonth > 0
        ? Number((Math.max(0, monthlyTargetVal - mtdSaleQty) / remainingDaysInMonth).toFixed(2))
        : 0;
      const projectedEomSaleQty = Number((mtdSaleQty + rolling7dBurn * remainingDaysInMonth).toFixed(2));
      const projectedEomAchievementPct = monthlyTargetVal > 0
        ? Number(((projectedEomSaleQty / monthlyTargetVal) * 100).toFixed(1))
        : 0;

      return {
        id: `station-${i + 1}-${r.erp_code}`,
        erp_code: r.erp_code,
        alds_name: r.alds_name,
        type: r.type,
        coordinator: r.coordinator,
        state: normalizeStateCode(r.state),
        tm: resolvedTm,
        tank_cap: r.tank_cap || PRODUCT_CONFIG.analytics.defaultTankCapacity,
        sale_qty: saleQty,
        collection,
        new_rate: r.new_rate || 0,
        other: r.other || 0,
        diff: r.diff || 0,
        erp_rate: r.erp_rate || 0,
        ret_test_cal: r.ret_test_cal || 0,
        free_sale_litres: freeSaleLitres,
        free_sale_rupees: r.free_sale_rupees || 0,
        scheme: r.scheme || 0,
        discount: Number(((r.scheme || 0) + (r.diff || 0)).toFixed(2)),
        paytm: paytmVal,
        net_cash_collection: cashVal,
        closing_dip_in_ltr: closingDip,
        remark: r.remark || '',
        net_total_collection: netTotalCollection,
        effective_rsp: effectiveRsp,
        collection_check: r.collection_check || 0,
        scheme_as_per_ho: r.scheme_as_per_ho || 0,
        free_sale_pct: freeSalePct,
        sale_date: saleDateStr,
        days_left: daysLeft,
        rolling_7d_burn: rolling7dBurn,
        prev_day_sale_qty: prevDaySaleQty,
        dod_delta_qty: dodDeltaQty,
        dod_delta_pct: dodDeltaPct,
        trend_slope: trendSlope,
        status_band: statusBand as any,
        recent_7d_sales: stationRecent7d,
        daily_target: Number(stationTarget.toFixed(2)),
        monthly_target: monthlyTargetVal,
        target_achievement_pct: achievementPct,
        target_variance_qty: targetVarianceQty,
        ss_name: ssName,
        historical_months: excelStationMeta?.historicalMonths ?? [],
        starting_month_label: excelStationMeta?.startingMonthLabel ?? 'Month 1',
        starting_month_avg_daily: excelStationMeta?.startingMonthAvgDaily ?? 0,
        latest_month_label: excelStationMeta?.latestMonthLabel ?? 'Latest Month',
        latest_month_avg_daily: excelStationMeta?.latestMonthAvgDaily ?? 0,
        three_month_avg_daily: excelStationMeta?.threeMonthAvgDaily ?? 0,
        three_month_change_litres: excelStationMeta?.threeMonthChangeLitres ?? 0,
        three_month_change_pct: excelStationMeta?.threeMonthChangePct ?? 0,
        target_vs_starting_month_pct: excelStationMeta?.targetVsStartingMonthPct ?? 0,
        is_consecutive_3m_decline: excelStationMeta?.isConsecutive3mDecline ?? false,
        digital_pct: digitalPct,
        cash_pct: cashPct,
        mtd_sale_qty: mtdSaleQty,
        mtd_reporting_days: mtdReportingDays,
        mtd_pro_rata_target: mtdProRataTarget,
        mtd_achievement_pct: mtdAchievementPct,
        monthly_target_achieved_pct: monthlyTargetAchievedPct,
        required_asking_rate_l_per_day: requiredAskingRate,
        projected_eom_sale_qty: projectedEomSaleQty,
        projected_eom_achievement_pct: projectedEomAchievementPct,
        prior_7d_digital_pct: prior7dDigitalPct,
        cash_spike_pct: cashSpikePct,
      };
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const historyUpToDate = historyRows
      .filter((hr: any) => hr.date.slice(0, 10) <= activeDate)
      .map((hr: any) => {
        const dStr = hr.date.slice(0, 10);
        const d = new Date(`${dStr}T00:00:00Z`);
        const dow = d.getUTCDay();
        const effRsp = hr.sale_qty > 0
          ? hr.collection / hr.sale_qty
          : PRODUCT_CONFIG.analytics.fallbackRetailPricePerLitre;
        const paytmColl = Number(hr.paytm_collection) || 0;
        const rawCashColl = Number(hr.cash_collection) || 0;
        const totalColl = Number(hr.collection) || 0;
        const cashColl = rawCashColl > 0 ? rawCashColl : Math.max(0, totalColl - paytmColl);
        const denom = Math.max(totalColl, paytmColl + cashColl, 1);
        return {
          date: hr.date.slice(0, 10),
          day_name: dayNames[dow],
          sale_qty: hr.sale_qty,
          collection: hr.collection,
          effective_rsp: Math.round(effRsp * 100) / 100,
          active_stations: hr.active_stations,
          zero_sale_count: hr.zero_sale_count,
          paytm_collection: paytmColl,
          cash_collection: cashColl,
          digital_pct: totalColl > 0 ? Number(((paytmColl / denom) * 100).toFixed(1)) : 0,
          cash_pct: totalColl > 0 ? Number(((cashColl / denom) * 100).toFixed(1)) : 0,
        };
      });

    return processDataset(
      stations,
      'PostgreSQL Database (sale_tracker)',
      historyUpToDate,
      monthlySalesRows,
      recent7dDates,
      availableDates,
      previousDate,
      tmTargetDaily
    );
  } catch (err: any) {
    console.error('[DATABASE] Critical query failure:', err.message);
    return null;
  }
}

async function processDataset(
  stations: StationRecord[],
  sourceFileName: string,
  historySeries: any[],
  monthlySalesRows: StationMonthlySales[],
  recent7dDates: string[] = [],
  availableDates: string[] = [],
  previousDate: string | null = null,
  tmTargetDaily: TmTargetDailySummary | null = null
) {
  const dailyView = getDailyView(stations);
  const statesSummary = getStatePeriodView(stations);
  const tmSummary = getTMPeriodView(
    stations,
    tmTargetDaily?.tmAvgStationTargets,
    tmTargetDaily?.tmTotalDailyTargets,
  );
  const typeSummary = getTypePeriodView(stations);
  const exceptions = getExceptionsView(stations);
  const dataStatus = getDataStatusView(stations);

  const stationsTotal = stations.length;
  const zeroSaleStations = stations.filter((s) => s.sale_qty === 0);
  const stationsWithSale = stationsTotal - zeroSaleStations.length;

  const totalSaleQty = dailyView.sale_qty;
  const totalCollection = dailyView.net_total_collection;
  const averageRsp = dailyView.nominal_rsp_avg;
  const effectiveRsp = dailyView.effective_rsp_avg;
  const collectionGapPerL = Number((averageRsp - effectiveRsp).toFixed(2));

  let persistedErrors: PersistedForecastErrors | undefined;
  let learningStatus = 'Forecast feedback storage is unavailable.';
  if (isLoaderConfigured()) {
    try {
    await queryLoader(`
      UPDATE forecast_feedback AS f
      SET actual_sale_qty = s.actual_sale_qty,
          evaluated_at = NOW(),
          updated_at = NOW()
      FROM (
        SELECT sale_date, SUM(sale_qty) AS actual_sale_qty
        FROM sale_tracker
        GROUP BY sale_date
      ) AS s
      WHERE f.target_date = s.sale_date
        AND f.actual_sale_qty IS DISTINCT FROM s.actual_sale_qty
    `);
    const feedbackRows = await queryLoader<{
      horizon_day: number;
      sample_count: number;
      ensemble_bias_pct: number | null;
      linear_mape: number | null;
      holt_winters_mape: number | null;
      naive_mape: number | null;
      weekday_mape: number | null;
    }>(`
      SELECT
        (target_date - forecast_origin_date)::int AS horizon_day,
        COUNT(*) FILTER (WHERE actual_sale_qty > 0)::int AS sample_count,
        AVG((predicted_ensemble - actual_sale_qty) / NULLIF(actual_sale_qty, 0)) * 100 AS ensemble_bias_pct,
        AVG(ABS(predicted_linear - actual_sale_qty) / NULLIF(actual_sale_qty, 0)) * 100 AS linear_mape,
        AVG(ABS(predicted_holt_winters - actual_sale_qty) / NULLIF(actual_sale_qty, 0)) * 100 AS holt_winters_mape,
        AVG(ABS(predicted_naive - actual_sale_qty) / NULLIF(actual_sale_qty, 0)) * 100 AS naive_mape,
        AVG(ABS(predicted_weekday - actual_sale_qty) / NULLIF(actual_sale_qty, 0)) * 100 AS weekday_mape
      FROM forecast_feedback
      WHERE actual_sale_qty IS NOT NULL
        AND actual_sale_qty > 0
        AND target_date <= $1::date
      GROUP BY horizon_day
    `, [stations[0]?.sale_date]);
    const recentOutcomeRows = await queryLoader<{
      target_date: string;
      predicted_ensemble: number;
      predicted_linear: number;
      predicted_holt_winters: number;
      predicted_naive: number;
      predicted_weekday: number;
      actual_sale_qty: number;
      station_remark_signals?: Array<{
        station_name: string;
        erp_code: string;
        sale_qty: number;
        prior_7d_avg: number;
        change_litres: number;
        remark: string;
      }>;
    }>(`
      SELECT
        target_date::text,
        predicted_ensemble::float,
        predicted_linear::float,
        predicted_holt_winters::float,
        predicted_naive::float,
        predicted_weekday::float,
        actual_sale_qty::float
      FROM (
        SELECT DISTINCT ON (target_date)
          target_date,
          forecast_origin_date,
          predicted_ensemble,
          predicted_linear,
          predicted_holt_winters,
          predicted_naive,
          predicted_weekday,
          actual_sale_qty
        FROM forecast_feedback
        WHERE actual_sale_qty IS NOT NULL
          AND actual_sale_qty > 0
          AND target_date <= $1::date
        ORDER BY target_date, forecast_origin_date DESC
      ) AS latest_outcome_per_day
      ORDER BY target_date DESC
      LIMIT 10
    `, [stations[0]?.sale_date]);
    const stationRemarkRows = await queryLoader<{
      target_date: string;
      station_name: string;
      erp_code: string;
      sale_qty: number;
      prior_7d_avg: number;
      change_litres: number;
      remark: string;
    }>(`
      WITH recent_targets AS (
        SELECT target_date
        FROM (
          SELECT DISTINCT ON (target_date)
            target_date,
            forecast_origin_date
          FROM forecast_feedback
          WHERE actual_sale_qty IS NOT NULL
            AND actual_sale_qty > 0
            AND target_date <= $1::date
          ORDER BY target_date, forecast_origin_date DESC
        ) AS latest_outcome_per_day
        ORDER BY target_date DESC
        LIMIT 10
      ),
      station_context AS (
        SELECT
          actual.sale_date::text AS target_date,
          actual.alds_name AS station_name,
          actual.erp_code,
          actual.sale_qty::float AS sale_qty,
          prior.prior_7d_avg::float AS prior_7d_avg,
          (actual.sale_qty - prior.prior_7d_avg)::float AS change_litres,
          TRIM(actual.remark) AS remark,
          ROW_NUMBER() OVER (
            PARTITION BY actual.sale_date
            ORDER BY ABS(actual.sale_qty - prior.prior_7d_avg) DESC
          ) AS remark_rank
        FROM recent_targets AS target
        JOIN sale_tracker AS actual ON actual.sale_date = target.target_date
        CROSS JOIN LATERAL (
          SELECT AVG(previous.sale_qty) AS prior_7d_avg
          FROM sale_tracker AS previous
          WHERE previous.erp_code = actual.erp_code
            AND previous.sale_date < actual.sale_date
            AND previous.sale_date >= actual.sale_date - INTERVAL '7 days'
        ) AS prior
        WHERE NULLIF(TRIM(actual.remark), '') IS NOT NULL
          AND prior.prior_7d_avg IS NOT NULL
      )
      SELECT target_date, station_name, erp_code, sale_qty,
             prior_7d_avg, change_litres, remark
      FROM station_context
      WHERE remark_rank <= 3
      ORDER BY target_date DESC, remark_rank
    `, [stations[0]?.sale_date]);
    const remarkSignalsByDate = new Map<string, NonNullable<typeof recentOutcomeRows[number]['station_remark_signals']>>();
    for (const row of stationRemarkRows) {
      const signals = remarkSignalsByDate.get(row.target_date) ?? [];
      signals.push({
        station_name: row.station_name,
        erp_code: row.erp_code,
        sale_qty: Number(row.sale_qty),
        prior_7d_avg: Number(row.prior_7d_avg),
        change_litres: Number(row.change_litres),
        remark: row.remark,
      });
      remarkSignalsByDate.set(row.target_date, signals);
    }
    for (const outcome of recentOutcomeRows) {
      outcome.station_remark_signals = remarkSignalsByDate.get(outcome.target_date) ?? [];
    }
    if (feedbackRows.length > 0) {
      const evaluatedCount = feedbackRows.reduce((sum, row) => sum + Number(row.sample_count || 0), 0);
      const weightedModelMape = (key: 'linear_mape' | 'holt_winters_mape' | 'naive_mape' | 'weekday_mape') => {
        const validRows = feedbackRows.filter(row => row[key] !== null);
        const count = validRows.reduce((sum, row) => sum + Number(row.sample_count || 0), 0);
        return count > 0
          ? validRows.reduce((sum, row) => sum + Number(row[key]) * Number(row.sample_count || 0), 0) / count
          : undefined;
      };
      persistedErrors = {
        sample_count: evaluatedCount,
        mape: {
          linear: weightedModelMape('linear_mape'),
          holt_winters: weightedModelMape('holt_winters_mape'),
          naive_last_week: weightedModelMape('naive_mape'),
          same_weekday_avg: weightedModelMape('weekday_mape'),
        },
        ensemble_bias_pct_by_horizon: Object.fromEntries(
          feedbackRows
            .filter(row => row.ensemble_bias_pct !== null)
            .map(row => [Number(row.horizon_day), Number(row.ensemble_bias_pct) / 100])
        ),
        recent_outcomes: recentOutcomeRows,
      };
    }
      learningStatus = 'Forecast outcomes are being evaluated against actual network sales.';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FORECAST FEEDBACK] Persistence unavailable: ${message}`);
      const diskFeedback = readDiskSettings().forecast_feedback_cache as PersistedForecastErrors | undefined;
      if (diskFeedback && diskFeedback.sample_count > 0) {
        persistedErrors = diskFeedback;
      }
      learningStatus = 'Adaptive walk-forward & disk-persisted forecast error learning is active.';
    }
  } else {
    const diskFeedback = readDiskSettings().forecast_feedback_cache as PersistedForecastErrors | undefined;
    if (diskFeedback && diskFeedback.sample_count > 0) {
      persistedErrors = diskFeedback;
    }
    learningStatus = 'Adaptive walk-forward & disk-persisted forecast error learning is active.';
  }

  const forecastEngineResult = generateForecast(historySeries, 7, stations, persistedErrors);
  if (persistedErrors && persistedErrors.sample_count > 0) {
    writeDiskSetting('forecast_feedback_cache', persistedErrors);
  }
  forecastEngineResult.learning_status = learningStatus;

  if (isLoaderConfigured()) {
    try {
      const forecastOriginDate = stations[0]?.sale_date;
      if (forecastOriginDate && forecastEngineResult.forecast.length > 0) {
        const valuesClause: string[] = [];
        const params: any[] = [];
        forecastEngineResult.forecast.forEach((forecast, idx) => {
          const offset = idx * 7;
          valuesClause.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, NULL, NOW())`);
          params.push(
            forecastOriginDate,
            forecast.date,
            forecast.predicted_qty,
            forecast.linear_pred,
            forecast.holt_winters_pred,
            forecast.naive_last_week,
            forecast.same_weekday_avg,
          );
        });
        await queryLoader(`
          INSERT INTO forecast_feedback (
            forecast_origin_date, target_date, predicted_ensemble,
            predicted_linear, predicted_holt_winters, predicted_naive, predicted_weekday,
            actual_sale_qty, updated_at
          )
          VALUES ${valuesClause.join(', ')}
          ON CONFLICT (forecast_origin_date, target_date) DO UPDATE SET
            predicted_ensemble = EXCLUDED.predicted_ensemble,
            predicted_linear = EXCLUDED.predicted_linear,
            predicted_holt_winters = EXCLUDED.predicted_holt_winters,
            predicted_naive = EXCLUDED.predicted_naive,
            predicted_weekday = EXCLUDED.predicted_weekday,
            updated_at = NOW()
        `, params);
        forecastEngineResult.learning_status = persistedErrors && persistedErrors.sample_count > 0
          ? `Saved forecasts are scored against network-wide actuals; learning is active with ${persistedErrors.sample_count} evaluated outcome(s) and strengthens as evidence grows.`
          : 'Saved forecasts are scored against network-wide actuals; learning begins when actual outcomes are available.';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FORECAST FEEDBACK] Forecast save failed: ${message}`);
      forecastEngineResult.learning_status = `Forecast save failed: ${message}`;
    }
  }

  // Deep Statistical & Outlier Analysis
  const comprehensiveAnalysis = runComprehensiveAnalysis(stations);

  // Health Score (driven by configurable weights in product-config.json)
  const hsCfg = PRODUCT_CONFIG.analytics.healthScore;
  const activeRatio = (stationsWithSale / (stationsTotal || 1)) * hsCfg.activeStationWeight;
  const gapPenalty = Math.max(0, hsCfg.collectionGapMaxScore - collectionGapPerL * hsCfg.collectionGapMultiplier);
  const freeSalePenalty = Math.max(0, hsCfg.freeSaleMaxScore - (dailyView.free_sale_litres / (totalSaleQty || 1)) * hsCfg.freeSaleMultiplier);

  const stockoutRiskStations = stations
    .filter((s) => s.days_left < PRODUCT_CONFIG.analytics.stockoutWarningDays && (s.sale_qty > 0 || (s.rolling_7d_burn || 0) > 0))
    .sort((a, b) => a.days_left - b.days_left)
    .map((s) => ({
      code: s.erp_code,
      name: s.alds_name,
      state: s.state,
      stock_ltr: s.closing_dip_in_ltr || 0,
      daily_burn_ltr: s.rolling_7d_burn || s.sale_qty,
      days_left: s.days_left,
      remark: s.remark || (s.days_left < PRODUCT_CONFIG.analytics.stockoutCriticalDays ? 'Immediate Replenishment Needed' : 'Low Buffer'),
    }));

  const stockoutPenalty = Math.max(0, hsCfg.stockoutMaxScore - stockoutRiskStations.length * hsCfg.stockoutStationPenalty);
  const healthScore = Math.min(100, Math.max(0, Math.round(activeRatio + gapPenalty + freeSalePenalty + stockoutPenalty)));

  // Top / Bottom Performers
  const sortedByQty = [...stations].sort((a, b) => b.sale_qty - a.sale_qty);
  const topPerformingStations = sortedByQty.slice(0, 10);
  const bottomPerformingStations = sortedByQty.filter((s) => s.sale_qty > 0).slice(-10);

  const topDecliningStations = stations
    .map((station) => {
      const history = monthlySalesRows.filter((row) => row.erp_code === station.erp_code);
      const reportingDays = history.reduce((sum, row) => sum + row.reporting_days, 0);
      const averageDailySale = reportingDays > 0
        ? history.reduce((sum, row) => sum + row.sale_qty, 0) / reportingDays
        : 0;
      const dropLitres = Math.max(0, averageDailySale - station.sale_qty);
      const dropPct = averageDailySale > 0 ? (dropLitres / averageDailySale) * 100 : 0;
      return {
        code: station.erp_code,
        name: station.alds_name,
        state: station.state,
        drop_pct: dropPct,
        drop_litres: dropLitres,
        current_sale: station.sale_qty,
        average_daily_sale: averageDailySale,
      };
    })
    .filter((station) => station.drop_pct >= 5)
    .sort((a, b) => b.drop_pct - a.drop_pct)
    .slice(0, 10);

  const prevHistoryPoint = previousDate
    ? historySeries.find((h) => h.date === previousDate)
    : undefined;
  const previousDateSaleQty = prevHistoryPoint ? Number(prevHistoryPoint.sale_qty) : null;
  const previousDateCollection = prevHistoryPoint ? Number(prevHistoryPoint.collection) : null;
  const dodSaleChangePct =
    previousDateSaleQty !== null && previousDateSaleQty > 0
      ? Number((((totalSaleQty - previousDateSaleQty) / previousDateSaleQty) * 100).toFixed(1))
      : null;

  return {
    date: dailyView.sale_date,
    available_dates: availableDates.length > 0 ? availableDates : [dailyView.sale_date],
    previous_date: previousDate,
    previous_date_sale_qty: previousDateSaleQty,
    previous_date_collection: previousDateCollection,
    dod_sale_change_pct: dodSaleChangePct,
    is_live: true,
    source_file: sourceFileName,
    stations_total: stationsTotal,
    stations_with_sale: stationsWithSale,
    zero_sale_count: zeroSaleStations.length,
    total_sale_qty: totalSaleQty,
    total_collection: totalCollection,
    average_rsp: averageRsp,
    effective_rsp: effectiveRsp,
    collection_gap_per_l: collectionGapPerL,
    total_free_sale_litres: dailyView.free_sale_litres,
    total_free_sale_rupees: dailyView.free_sale_rupees,
    total_paytm_collection: dailyView.paytm,
    total_cash_collection: dailyView.net_cash_collection,
    health_score: healthScore,
    stockout_risk_stations: stockoutRiskStations,
    zero_sale_stations: zeroSaleStations,
    top_declining_stations: topDecliningStations,
    top_performing_stations: topPerformingStations,
    bottom_performing_stations: bottomPerformingStations,
    forecast: forecastEngineResult,
    history_30d: historySeries.slice(-30),
    recent_7d_dates: recent7dDates,
    station_monthly_sales: monthlySalesRows,
    states_summary: statesSummary,
    tm_summary: tmSummary,
    type_summary: typeSummary,
    all_stations: stations,
    exceptions,
    data_status: dataStatus,
    comprehensive_analysis: comprehensiveAnalysis,
    tm_target_meta: tmTargetDaily
      ? {
          source_file: tmTargetDaily.sourceFile,
          period_label: tmTargetDaily.periodLabel,
          monthly_target_label: tmTargetDaily.monthlyTargetLabel,
          historical_month_labels: tmTargetDaily.historicalMonthLabels,
          updated_at: tmTargetDaily.updatedAt,
          station_count: tmTargetDaily.stationCount,
          tm_count: tmTargetDaily.tmCount,
          total_network_daily_target: tmTargetDaily.totalNetworkDailyTarget,
          total_network_monthly_target: tmTargetDaily.totalNetworkMonthlyTarget,
          tm_total_targets: tmTargetDaily.tmTotalDailyTargets,
          tm_avg_targets: tmTargetDaily.tmAvgStationTargets,
          station_targets: tmTargetDaily.stationTargetsByErp,
        }
      : undefined,
  };
}

// Single-flight: concurrent callers (UI polls, automation, alerts) share one DB load
// instead of stampeding PostgreSQL with parallel heavy queries.
const telemetryInFlight = new Map<string, Promise<any>>();

async function getTelemetryData(forceRefresh = false, requestedDate?: string) {
  const key = `${forceRefresh ? 'r' : 'c'}:${requestedDate || ''}`;
  const existing = telemetryInFlight.get(key) || (!forceRefresh ? telemetryInFlight.get(`r:${requestedDate || ''}`) : undefined);
  if (existing) return existing;
  const task = getTelemetryDataUncoalesced(forceRefresh, requestedDate).finally(() => {
    if (telemetryInFlight.get(key) === task) telemetryInFlight.delete(key);
  });
  telemetryInFlight.set(key, task);
  return task;
}

async function getTelemetryDataUncoalesced(forceRefresh = false, requestedDate?: string) {
  const isConnected = await testDbConnection(forceRefresh);
  if (!isConnected) {
    cachedTelemetry = null;
    lastLoadedTime = 0;
    return null;
  }

  const now = Date.now();
  const isCustomDate = Boolean(requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate));
  if (
    cachedTelemetry &&
    !forceRefresh &&
    now - lastLoadedTime < TELEMETRY_CACHE_DURATION_MS &&
    (!isCustomDate || cachedTelemetry.date === requestedDate)
  ) {
    return cachedTelemetry;
  }

  const dbAudit = await getDbAuditReport();
  const loadedTelemetry = await loadFromDatabase(isCustomDate ? requestedDate : undefined);

  if (!loadedTelemetry) {
    console.error('[DATABASE] Unable to load telemetry from PostgreSQL table sale_tracker.');
    return null;
  }

  const isPostgresSource = loadedTelemetry.source_file === 'PostgreSQL Database (sale_tracker)';
  const isExternalDatabaseConnected = dbAudit.connected && dbAudit.engine === 'external';
  const isHistoricalInspection = Boolean(isCustomDate && dbAudit.latest_date && loadedTelemetry.date !== dbAudit.latest_date);
  const hasDiscrepancy = Boolean(
    !isExternalDatabaseConnected ||
    (!isPostgresSource && isExternalDatabaseConnected) ||
    (!isHistoricalInspection && isExternalDatabaseConnected && dbAudit.latest_date && dbAudit.latest_date !== loadedTelemetry.date) ||
    (!isHistoricalInspection && isExternalDatabaseConnected && dbAudit.latest_date_stations && dbAudit.latest_date_stations !== loadedTelemetry.stations_total)
  );

  let discrepancyReason = isHistoricalInspection
    ? `Inspecting historical operating date ${loadedTelemetry.date} (latest database date is ${dbAudit.latest_date}).`
    : 'UI data is loaded from PostgreSQL table sale_tracker.';
  if (!isPostgresSource) {
    discrepancyReason = 'Telemetry source does not match the configured PostgreSQL table.';
  } else if (hasDiscrepancy) {
    discrepancyReason = `Discrepancy detected: UI is displaying date ${loadedTelemetry.date} (${loadedTelemetry.stations_total} stations, ${loadedTelemetry.total_sale_qty} L), but DB max date is ${dbAudit.latest_date} (${dbAudit.latest_date_stations} stations, ${dbAudit.latest_date_sale_qty} L).`;
  }

  loadedTelemetry.db_diagnostics = {
    ...dbAudit,
    active_source: 'PostgreSQL',
    discrepancy_analysis: {
      has_discrepancy: hasDiscrepancy,
      reason: discrepancyReason,
      ui_date: loadedTelemetry.date,
      db_date: dbAudit.latest_date,
      ui_station_count: loadedTelemetry.stations_total,
      db_station_count: dbAudit.latest_date_stations,
      ui_volume: loadedTelemetry.total_sale_qty,
      db_volume: dbAudit.latest_date_sale_qty,
    },
  };

  // Output formatted diagnostic log on server
  console.log(`\n======================================================`);
  console.log(`[DATABASE CONNECTION & QUERY VERIFICATION]`);
  console.log(`Connection String : ${dbAudit.connection_string}`);
  console.log(`Database Host     : ${dbAudit.host} / ${dbAudit.database}`);
  console.log(`Database User     : ${dbAudit.user}`);
  console.log(`Database Status   : ${dbAudit.connected ? 'ONLINE (PostgreSQL)' : 'OFFLINE'}`);
  console.log(`Active UI Source  : ${loadedTelemetry.source_file}`);
  if (dbAudit.connected) {
    console.log(`Total Rows in DB  : ${dbAudit.total_rows} (${dbAudit.distinct_days || 0} distinct days, ${dbAudit.distinct_stations || 0} stations)`);
    console.log(`Date Range in DB  : ${dbAudit.min_date} to ${dbAudit.max_date}`);
    console.log(`Latest DB Date    : ${dbAudit.latest_date} (${dbAudit.latest_date_stations} stations, ${dbAudit.latest_date_sale_qty?.toLocaleString()} L)`);
    console.log(`UI Rendered Stats : ${loadedTelemetry.date} (${loadedTelemetry.stations_total} stations, ${loadedTelemetry.total_sale_qty.toLocaleString()} L)`);
  }
  console.log(`Discrepancy Audit : ${discrepancyReason}`);
  console.log(`======================================================\n`);

  if (!isHistoricalInspection) {
    cachedTelemetry = loadedTelemetry;
    lastLoadedTime = now;
  }
  return loadedTelemetry;
}

// REST API Endpoints
app.use((req, res, next) => {
  if (req.url.startsWith('/api/')) {
    console.log(`[API REQUEST] ${req.method} ${req.url}`);
  }
  next();
});

// Dedicated DB Verification endpoint
app.get('/api/db-verify', async (_req: Request, res: Response) => {
  try {
    const audit = await getDbAuditReport(true);
    res.json(audit);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/telemetry', async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const requestedDate = typeof req.query.date === 'string' ? req.query.date.trim() : undefined;
    const data = await getTelemetryData(forceRefresh, requestedDate);
    if (!data) {
      console.warn(`[API] GET ${req.url} - PostgreSQL telemetry unavailable`);
      res.status(503).json({ error: 'PostgreSQL telemetry is unavailable. Verify the database connection and ensure sale_tracker contains data.' });
      return;
    }
    res.json(data);
  } catch (err: any) {
    console.error(`[API] GET ${req.url} - Fatal Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telemetry/invalidate', (req: Request, res: Response) => {
  if (!isDispatchAuthorized(req, 'x-go-gas-email-request')) {
    res.status(403).json({ error: 'Cache invalidation is only available from this computer.' });
    return;
  }
  cachedTelemetry = null;
  lastLoadedTime = 0;
  res.json({ success: true, message: 'Telemetry cache invalidated.' });
});

app.get('/api/targets/tm-daily', async (req: Request, res: Response) => {
  try {
    if (req.query.refresh === 'true') {
      invalidateTmTargetDailyCache();
    }
    const summary = await loadTmTargetDailyFromFile(
      path.resolve(__dirname, '..', 'TM Target Daily.xlsx'),
    );
    if (!summary) {
      res.status(404).json({ error: 'TM Target Daily.xlsx was not found in the workspace root.' });
      return;
    }
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings/benchmarks', async (_req: Request, res: Response) => {
  try {
    const excelSummary = await loadTmTargetDailyFromFile(
      path.resolve(__dirname, '..', 'TM Target Daily.xlsx'),
    ).catch(() => null);
    const saved = await loadAppSetting('sales_benchmarks', {
      tmTargets: {} as Record<string, number>,
      stationTargets: {} as Record<string, number>,
      mtimeMs: 0,
    });
    const excelIsNewer = !saved.mtimeMs || (excelSummary && excelSummary.mtimeMs >= saved.mtimeMs);
    const positiveExcelStationTargets = Object.fromEntries(
      Object.entries(excelSummary?.stationTargetsByErp ?? {}).filter(([, val]) => val > 0),
    );
    const tmTargets = excelIsNewer
      ? { ...(saved.tmTargets || {}), ...(excelSummary?.tmAvgStationTargets || {}) }
      : { ...(excelSummary?.tmAvgStationTargets || {}), ...(saved.tmTargets || {}) };
    const stationTargets = excelIsNewer
      ? { ...(saved.stationTargets || {}), ...positiveExcelStationTargets }
      : { ...positiveExcelStationTargets, ...(saved.stationTargets || {}) };

    res.json({
      tmTargets,
      tmTotalTargets: excelSummary?.tmTotalDailyTargets ?? {},
      stationTargets,
      sourceFile: excelSummary?.sourceFile ?? 'TM Target Daily.xlsx',
      periodLabel: excelSummary?.periodLabel ?? 'Monthly Avg. Daily Target',
      updatedAt: excelSummary?.updatedAt ?? null,
      mtimeMs: excelSummary?.mtimeMs ?? saved.mtimeMs ?? 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/benchmarks', async (req: Request, res: Response) => {
  try {
    if (req.body?.resetToExcel === true) {
      invalidateTmTargetDailyCache();
      const excelSummary = await loadTmTargetDailyFromFile(
        path.resolve(__dirname, '..', 'TM Target Daily.xlsx'),
      );
      const positiveExcelStationTargets = Object.fromEntries(
        Object.entries(excelSummary?.stationTargetsByErp ?? {}).filter(([, val]) => val > 0),
      );
      const payload = {
        tmTargets: excelSummary?.tmAvgStationTargets ?? {},
        stationTargets: positiveExcelStationTargets,
        mtimeMs: excelSummary?.mtimeMs ?? Date.now(),
      };
      await saveAppSetting('sales_benchmarks', payload);
      cachedTelemetry = null;
      lastLoadedTime = 0;
      res.json({
        success: true,
        ...payload,
        tmTotalTargets: excelSummary?.tmTotalDailyTargets ?? {},
        periodLabel: excelSummary?.periodLabel ?? 'Monthly Avg. Daily Target',
      });
      return;
    }

    const { tmTargets, stationTargets } = req.body || {};
    const validTmTargets: Record<string, number> = {};
    const validStationTargets: Record<string, number> = {};
    if (tmTargets && typeof tmTargets === 'object' && !Array.isArray(tmTargets)) {
      for (const [k, v] of Object.entries(tmTargets)) {
        const num = Number(v);
        if (Number.isFinite(num) && num > 0) validTmTargets[k] = num;
      }
    }
    if (stationTargets && typeof stationTargets === 'object' && !Array.isArray(stationTargets)) {
      for (const [k, v] of Object.entries(stationTargets)) {
        const num = Number(v);
        if (Number.isFinite(num) && num > 0) validStationTargets[k] = num;
      }
    }
    const payload = {
      tmTargets: validTmTargets,
      stationTargets: validStationTargets,
      mtimeMs: Date.now(),
    };
    await saveAppSetting('sales_benchmarks', payload);
    cachedTelemetry = null;
    lastLoadedTime = 0;
    res.json({ success: true, ...payload });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function isDispatchAuthorized(req: Request, requiredHeader: string): boolean {
  const remoteAddress = req.socket.remoteAddress || '';
  const normalizedAddress = remoteAddress.startsWith('::ffff:')
    ? remoteAddress.slice('::ffff:'.length)
    : remoteAddress;
  const isLoopback = normalizedAddress === '::1' || normalizedAddress.startsWith('127.');
  if (!isLoopback) {
    return false;
  }

  const hasValidHeader =
    req.get(requiredHeader) === 'authorized-client' ||
    req.get('x-go-gas-whatsapp-request') === 'authorized-client' ||
    req.get('x-go-gas-email-request') === 'authorized-client';

  const origin = req.get('origin');
  if (!origin) {
    return hasValidHeader;
  }

  try {
    const parsedOrigin = new URL(origin);
    const host = req.get('host') || '';
    const hostname = parsedOrigin.hostname.replace(/^\[|\]$/g, '');
    return (
      parsedOrigin.host === host ||
      APP_LOCAL_HOSTNAMES.includes(hostname) ||
      (APP_TRUSTED_HOST_SUFFIXES.length > 0 &&
        APP_TRUSTED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)))
    );
  } catch {
    return false;
  }
}

app.post('/api/email/send', async (req: Request, res: Response) => {
  if (!isDispatchAuthorized(req, 'x-go-gas-email-request')) {
    res.status(403).json({ error: 'Email sending is only available from this computer.' });
    return;
  }
  if (emailSendInProgress) {
    res.status(409).json({ error: 'An executive briefing email is already being sent.' });
    return;
  }
  if (Date.now() - lastEmailSentAt < EMAIL_SEND_COOLDOWN_SECONDS * 1000) {
    res.status(429).json({ error: `Please wait ${EMAIL_SEND_COOLDOWN_SECONDS} seconds before sending another briefing.` });
    return;
  }

  emailSendInProgress = true;
  try {
    const telemetry = await getTelemetryData(true);
    if (!telemetry) {
      res.status(503).json({ error: 'PostgreSQL telemetry is unavailable. The briefing email was not sent.' });
      return;
    }

    const result = await sendExecutiveBriefing(telemetry);
    lastEmailSentAt = Date.now();
    res.json({
      message: `Executive briefing sent to ${result.recipientCount} configured recipient(s).`,
      date: telemetry.date,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[EMAIL] Executive briefing send failed: ${message}`);
    res.status(500).json({ error: `Executive briefing email failed: ${message}` });
  } finally {
    emailSendInProgress = false;
  }
});

// WhatsApp API Endpoints
app.get('/api/whatsapp/status', (_req: Request, res: Response) => {
  res.json(getWhatsAppStatus());
});

app.get('/api/whatsapp/logs', (_req: Request, res: Response) => {
  res.json({ logs: getWhatsAppAuditLog() });
});

app.post('/api/whatsapp/send-briefing', async (req: Request, res: Response) => {
  if (!isDispatchAuthorized(req, 'x-go-gas-whatsapp-request')) {
    res.status(403).json({ error: 'WhatsApp dispatch is only available from this computer.' });
    return;
  }
  if (whatsappSendInProgress) {
    res.status(409).json({ error: 'A WhatsApp message is already being dispatched.' });
    return;
  }
  if (Date.now() - lastWhatsAppSentAt < WHATSAPP_SEND_COOLDOWN_SECONDS * 1000) {
    res.status(429).json({ error: `Please wait ${WHATSAPP_SEND_COOLDOWN_SECONDS} seconds before sending another WhatsApp message.` });
    return;
  }

  whatsappSendInProgress = true;
  try {
    const telemetry = await getTelemetryData(true);
    if (!telemetry) {
      res.status(503).json({ error: 'PostgreSQL telemetry is unavailable. The WhatsApp briefing was not sent.' });
      return;
    }

    const message = buildExecutiveWhatsAppMessage(telemetry);
    const result = await sendWhatsAppMessage('briefing', message);
    lastWhatsAppSentAt = Date.now();
    res.json({
      message: result.message,
      recipientCount: result.recipientCount,
      date: telemetry.date,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[WHATSAPP] Briefing send failed: ${message}`);
    res.status(500).json({ error: `WhatsApp briefing failed: ${message}` });
  } finally {
    whatsappSendInProgress = false;
  }
});

app.post('/api/whatsapp/send-dispatch', async (req: Request, res: Response) => {
  if (!isDispatchAuthorized(req, 'x-go-gas-whatsapp-request')) {
    res.status(403).json({ error: 'WhatsApp dispatch is only available from this computer.' });
    return;
  }
  if (whatsappSendInProgress) {
    res.status(409).json({ error: 'A WhatsApp message is already being dispatched.' });
    return;
  }
  if (Date.now() - lastWhatsAppSentAt < WHATSAPP_SEND_COOLDOWN_SECONDS * 1000) {
    res.status(429).json({ error: `Please wait ${WHATSAPP_SEND_COOLDOWN_SECONDS} seconds before sending another WhatsApp message.` });
    return;
  }

  whatsappSendInProgress = true;
  try {
    const telemetry = await getTelemetryData(true);
    if (!telemetry) {
      res.status(503).json({ error: 'PostgreSQL telemetry is unavailable. The WhatsApp manifest was not sent.' });
      return;
    }

    const activeDailyBurn = telemetry.all_stations.filter((s: StationRecord) => s.sale_qty > 0);
    const networkDailyBurn = activeDailyBurn.length
      ? activeDailyBurn.reduce((sum: number, s: StationRecord) => sum + s.sale_qty, 0) / activeDailyBurn.length
      : 0;

    const candidates = telemetry.all_stations
      .filter((s: StationRecord) => {
        const isUrgentDip = s.days_left <= 3.5;
        const isOutageRemark = Boolean(s.remark && /stock|licence|breakdown|dry/i.test(s.remark));
        return isUrgentDip || isOutageRemark || s.sale_qty === 0;
      })
      .map((s: StationRecord) => {
        const historicalRows = (telemetry.station_monthly_sales || []).filter((row: any) => row.erp_code === s.erp_code);
        const historyDays = historicalRows.reduce((sum: number, row: any) => sum + row.reporting_days, 0);
        const historicalDailyBurn = historyDays > 0
          ? historicalRows.reduce((sum: number, row: any) => sum + row.sale_qty, 0) / historyDays
          : 0;
        const dailyBurn = s.sale_qty > 0 ? s.sale_qty : historicalDailyBurn || networkDailyBurn;
        const burn3Day = dailyBurn * 3;
        const currentStock = s.closing_dip_in_ltr || 0;
        const { requiredVolumeLtr, tankerLabel: recommendedTanker } = recommendTanker(dailyBurn, currentStock, 3, s.tank_cap);

        let urgency: 'Critical' | 'Warning' | 'Standby' = 'Warning';
        if (s.days_left < 1.5 || s.sale_qty === 0 || /stock/i.test(s.remark || '')) {
          urgency = 'Critical';
        } else if (s.days_left <= 3.0) {
          urgency = 'Warning';
        } else {
          urgency = 'Standby';
        }

        return {
          station: s,
          dailyBurn,
          burn3Day,
          currentStock,
          recommendedTanker,
          recommendedVolumeLtr: requiredVolumeLtr,
          urgency,
        };
      })
      .sort((a: any, b: any) => a.station.days_left - b.station.days_left);

    const message = buildTankerDispatchWhatsAppMessage(telemetry, candidates);
    const result = await sendWhatsAppMessage('dispatch', message);
    lastWhatsAppSentAt = Date.now();
    res.json({
      message: result.message,
      recipientCount: result.recipientCount,
      criticalOrders: candidates.filter((c: any) => c.urgency === 'Critical').length,
      date: telemetry.date,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[WHATSAPP] Tanker dispatch send failed: ${message}`);
    res.status(500).json({ error: `WhatsApp tanker dispatch failed: ${message}` });
  } finally {
    whatsappSendInProgress = false;
  }
});

app.post('/api/whatsapp/send-test', async (req: Request, res: Response) => {
  if (!isDispatchAuthorized(req, 'x-go-gas-whatsapp-request')) {
    res.status(403).json({ error: 'WhatsApp test dispatch is only available from this computer.' });
    return;
  }

  try {
    const testMessage = `*🔔 GO GAS SYSTEM TEST DISPATCH*\nTime: ${new Date().toLocaleString('en-IN')}\nStatus: Telemetry engine operational and connected.`;
    const result = await sendWhatsAppMessage('test', testMessage);
    res.json({ message: result.message, recipientCount: result.recipientCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `WhatsApp test failed: ${message}` });
  }
});

app.get('/api/analysis', async (_req: Request, res: Response) => {
  try {
    const telemetry = await getTelemetryData();
    if (!telemetry) {
      res.status(503).json({ error: 'Telemetry unavailable' });
      return;
    }
    res.json(telemetry.comprehensive_analysis);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/exceptions', async (_req: Request, res: Response) => {
  try {
    const telemetry = await getTelemetryData();
    if (!telemetry) {
      res.status(503).json({ error: 'Telemetry unavailable' });
      return;
    }
    res.json({
      exceptions: telemetry.exceptions,
      stockouts: telemetry.stockout_risk_stations,
      zero_sales: telemetry.zero_sale_stations,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/data-status', async (_req: Request, res: Response) => {
  try {
    const telemetry = await getTelemetryData();
    if (!telemetry) {
      res.status(503).json({ error: 'Telemetry unavailable' });
      return;
    }
    res.json(telemetry.data_status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/simulate', async (req: Request, res: Response) => {
  try {
    const telemetry = await getTelemetryData();
    if (!telemetry) {
      res.status(503).json({ error: 'Telemetry unavailable' });
      return;
    }
    const inputs = {
      free_sale_reduction_pct: Number(req.body.free_sale_reduction_pct) || 0,
      reopened_zero_sale_stations: Number(req.body.reopened_zero_sale_stations) || 0,
      collection_efficiency_gain_pct: Number(req.body.collection_efficiency_gain_pct) || 0,
      market_demand_growth_pct: Number(req.body.market_demand_growth_pct) || 0,
    };
    const output = simulateWhatIf(telemetry.all_stations, inputs);
    res.json(output);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload', async (req: Request, res: Response) => {
  res.status(409).json({
    error: 'Spreadsheet uploads do not write to PostgreSQL and are disabled. Use `npm run load-sales` to validate and load workbook data into sale_tracker.',
  });
});

function filterStationsFromQuery(stations: StationRecord[], reqQuery: Request['query']): StationRecord[] {
  const state = typeof reqQuery.state === 'string' ? reqQuery.state.trim() : 'ALL';
  const type = typeof reqQuery.type === 'string' ? reqQuery.type.trim() : 'ALL';
  const tm = typeof reqQuery.tm === 'string' ? reqQuery.tm.trim() : 'ALL';
  const coordinator = typeof reqQuery.coordinator === 'string' ? reqQuery.coordinator.trim() : 'ALL';
  const search = typeof reqQuery.search === 'string' ? reqQuery.search.trim().toLowerCase() : '';

  return stations.filter((s) => {
    if (state && state !== 'ALL' && s.state !== state) return false;
    if (type && type !== 'ALL' && s.type !== type) return false;
    if (tm && tm !== 'ALL' && s.tm !== tm) return false;
    if (coordinator && coordinator !== 'ALL' && s.coordinator !== coordinator) return false;
    if (search) {
      const matchCode = s.erp_code.toLowerCase().includes(search);
      const matchName = s.alds_name.toLowerCase().includes(search);
      const matchState = s.state.toLowerCase().includes(search);
      const matchTm = (s.tm || '').toLowerCase().includes(search);
      const matchCoord = (s.coordinator || '').toLowerCase().includes(search);
      const matchType = (s.type || '').toLowerCase().includes(search);
      const matchRemark = (s.remark || '').toLowerCase().includes(search);
      const matchSs = (s.ss_name || '').toLowerCase().includes(search);
      if (!matchCode && !matchName && !matchState && !matchTm && !matchCoord && !matchType && !matchRemark && !matchSs) {
        return false;
      }
    }
    return true;
  });
}

app.get('/api/station/:erpCode/history', async (req: Request, res: Response) => {
  try {
    const erpCode = String(req.params.erpCode || '').trim();
    if (!erpCode) {
      res.status(400).json({ error: 'Station ERP code is required.' });
      return;
    }
    const rows = await query<{
      sale_date: string;
      sale_qty: number;
      collection: number;
      net_total_collection: number;
      new_rate: number;
      erp_rate: number;
      effective_rsp: number;
      closing_dip_in_ltr: number;
      paytm: number;
      free_sale_litres: number;
      remark: string;
    }>(`
      SELECT
        sale_date::text AS sale_date,
        COALESCE(sale_qty, 0)::float AS sale_qty,
        COALESCE(collection, 0)::float AS collection,
        COALESCE(net_total_collection, collection, 0)::float AS net_total_collection,
        COALESCE(new_rate, 0)::float AS new_rate,
        COALESCE(erp_rate, 0)::float AS erp_rate,
        COALESCE(effective_rsp, CASE WHEN sale_qty > 0 THEN COALESCE(net_total_collection, collection, 0) / sale_qty ELSE COALESCE(new_rate, erp_rate, 0) END)::float AS effective_rsp,
        COALESCE(closing_dip_in_ltr, 0)::float AS closing_dip_in_ltr,
        COALESCE(paytm, 0)::float AS paytm,
        COALESCE(free_sale_litres, 0)::float AS free_sale_litres,
        COALESCE(remark, '') AS remark
      FROM sale_tracker
      WHERE UPPER(TRIM(erp_code)) = UPPER(TRIM($1))
      ORDER BY sale_date ASC
    `, [erpCode]);

    res.json({
      erp_code: erpCode,
      history: rows.map((r) => ({
        date: r.sale_date.slice(0, 10),
        sale_qty: Number(r.sale_qty) || 0,
        collection: Number(r.net_total_collection || r.collection) || 0,
        nominal_rsp: Number(r.new_rate || r.erp_rate) || 0,
        effective_rsp: Number(r.effective_rsp) || 0,
        closing_dip: Number(r.closing_dip_in_ltr) || 0,
        paytm: Number(r.paytm) || 0,
        free_sale_litres: Number(r.free_sale_litres) || 0,
        remark: r.remark || '',
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/export/csv', async (req: Request, res: Response) => {
  try {
    const requestedDate = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : undefined;
    const telemetry = await getTelemetryData(false, requestedDate);
    if (!telemetry) {
      res.status(503).send('No data available');
      return;
    }

    const filteredStations = filterStationsFromQuery(telemetry.all_stations, req.query);

    const headers = [
      'ERP Code', 'ALDS Name', 'State', 'TM', 'SS (Supervisor)', 'Coordinator', 'Type', 'Tank Capacity',
      'Sale Qty (L)', 'Daily Target (L)', 'Target Achieved (%)', 'MTD Sold (L)', 'Monthly Target (L)',
      'Required Asking Rate (L/d)', '3M Change (%)', 'Net Collection (Rs)', 'Paytm Digital (Rs)',
      'Cash Collection (Rs)', 'Digital (%)', 'Cash (%)', 'Nominal RSP (Rs)', 'Effective RSP (Rs)',
      'Closing Dip (L)', '7d Rolling Burn (L/d)', 'Days Left', 'Remark', 'Status Band'
    ];

    const rows = filteredStations.map((s: StationRecord) => [
      escapeCsvCell(s.erp_code),
      escapeCsvCell(s.alds_name),
      escapeCsvCell(s.state),
      escapeCsvCell(s.tm),
      escapeCsvCell(s.ss_name || ''),
      escapeCsvCell(s.coordinator),
      escapeCsvCell(s.type),
      escapeCsvCell(s.tank_cap || ''),
      s.sale_qty,
      s.daily_target ?? 0,
      s.target_achievement_pct ?? 0,
      s.mtd_sale_qty ?? s.sale_qty,
      s.monthly_target ?? 0,
      s.required_asking_rate_l_per_day ?? 0,
      s.three_month_change_pct ?? 0,
      s.net_total_collection || s.collection,
      s.paytm || 0,
      s.net_cash_collection || Math.max(0, (s.net_total_collection || s.collection) - (s.paytm || 0)),
      s.digital_pct ?? 0,
      s.cash_pct ?? 0,
      s.new_rate || s.erp_rate,
      s.effective_rsp,
      s.closing_dip_in_ltr,
      s.rolling_7d_burn ?? s.sale_qty,
      s.days_left,
      escapeCsvCell(s.remark || ''),
      escapeCsvCell(s.status_band),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=GO_Gas_Sales_${telemetry.date}.csv`);
    res.send(csvContent);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

app.get('/api/export/xlsx', async (req: Request, res: Response) => {
  try {
    const requestedDate = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : undefined;
    const telemetry = await getTelemetryData(false, requestedDate);
    if (!telemetry) {
      res.status(503).send('No data available');
      return;
    }

    const filteredStations = filterStationsFromQuery(telemetry.all_stations, req.query);
    const filteredCodes = new Set(filteredStations.map((s) => s.erp_code));
    const workbookBuffer = await buildStationWorkbook({
      all_stations: filteredStations,
      states_summary: getStatePeriodView(filteredStations),
      tm_summary: getTMPeriodView(
        filteredStations,
        telemetry.tm_target_meta?.tm_avg_targets,
        telemetry.tm_target_meta?.tm_total_targets,
      ),
      stockout_risk_stations: (telemetry.stockout_risk_stations || []).filter((r: any) => filteredCodes.has(r.code)),
      top_declining_stations: (telemetry.top_declining_stations || []).filter((r: any) => filteredCodes.has(r.code)),
      station_monthly_sales: (telemetry.station_monthly_sales || []).filter((r: any) => filteredCodes.has(r.erp_code)),
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=GO_Gas_Executive_Workbook_${telemetry.date}.xlsx`,
    );
    res.send(workbookBuffer);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

app.get('/api/export/pdf', async (req: Request, res: Response) => {
  try {
    const requestedDate = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : undefined;
    const telemetry = await getTelemetryData(false, requestedDate);
    if (!telemetry) {
      res.status(503).send('No data available');
      return;
    }

    const filteredStations = filterStationsFromQuery(telemetry.all_stations, req.query);
    const pdfBuffer = buildExecutivePdfBuffer({
      date: telemetry.date,
      stations: filteredStations,
      statesSummary: getStatePeriodView(filteredStations),
      tmSummary: getTMPeriodView(
        filteredStations,
        telemetry.tm_target_meta?.tm_avg_targets,
        telemetry.tm_target_meta?.tm_total_targets,
      ),
      telemetry,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=GO_Gas_Executive_Dossier_${telemetry.date}.pdf`,
    );
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

// Vite SSR / middleware integration in dev mode
async function startServer() {
  console.log(`[SERVER] Starting in ${process.env.NODE_ENV || 'development'} mode...`);
  
  if (process.env.NODE_ENV !== 'production') {
    console.log('[SERVER] Initializing Vite middleware...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom', // Use custom to prevent Vite from handling SPA fallback for API routes
    });
    app.use(vite.middlewares);
    console.log('[SERVER] Vite middleware active.');
    
    // Transform the SPA entry so Vite can inject its client and React refresh preamble.
    app.get('*', async (req, res, next) => {
      if (req.url.startsWith('/api/')) return next();
      try {
        const template = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf-8');
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (err) {
        if (err instanceof Error) vite.ssrFixStacktrace(err);
        next(err);
      }
    });
  } else {
    // Correctly resolve dist folder relative to the project root
    const distPath = path.resolve(__dirname, '..', 'dist');
    console.log(`[SERVER] Production mode: Serving static files from ${distPath}`);
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req: Request, res: Response) => {
        if (req.url.startsWith('/api/')) {
          console.warn(`[SERVER] 404 - API route not found in production: ${req.url}`);
          res.status(404).json({ error: 'API route not found' });
          return;
        }
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      console.error(`[SERVER] CRITICAL: Production build folder not found at ${distPath}.`);
      console.info('[SERVER] Have you run "npm run build" yet?');
    }
  }

  // Final catch-all for anything missed
  app.use((req, res) => {
    if (req.url.startsWith('/api/')) {
      res.status(404).json({ error: `API endpoint ${req.originalUrl} not found` });
    } else {
      res.status(404).send('Not Found');
    }
  });

  server.listen(PORT, () => {
    console.log(`[${APP_NAME}] Dashboard active at ${APP_BASE_URL}`);

    cron.schedule(EMAIL_CRON_EXPRESSION, async () => {
      if (!isEmailConfigured()) {
        return;
      }
      const timeLabel = new Date().toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: APP_TIMEZONE,
      });
      console.log(`[EMAIL CRON] Executing automated ${timeLabel} executive briefing email...`);
      try {
        const telemetry = await getTelemetryData(true);
        if (!telemetry) {
          console.warn(`[EMAIL CRON] Telemetry unavailable; skipped ${timeLabel} email.`);
          return;
        }
        const result = await sendExecutiveBriefing(telemetry);
        console.log(`[EMAIL CRON] ${timeLabel} executive briefing sent to ${result.recipientCount} recipient(s).`);
      } catch (err: any) {
        console.error(`[EMAIL CRON] Failed to send ${timeLabel} email: ${err.message}`);
      }
    });
    if (isEmailConfigured()) {
      console.log(`[EMAIL CRON] Scheduled automated executive email briefings: ${EMAIL_SCHEDULE_LABEL}.`);
    } else {
      console.info(`[EMAIL CRON] Automated email schedule (${EMAIL_SCHEDULE_LABEL}) is on standby until REPORT_SENDER_EMAIL is configured in .env.`);
    }

    const refreshLearningData = () => {
      void getTelemetryData(true).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[FORECAST FEEDBACK] Scheduled daily learning refresh failed: ${message}`);
      });
    };
    refreshLearningData();
    setInterval(refreshLearningData, LEARNING_REFRESH_INTERVAL_MS);

    // Watch Manual Work/sale.xlsx for automatic ETL ingestion & cache invalidation
    const watchedExcelPath = path.resolve(__dirname, '..', 'Manual Work', 'sale.xlsx');
    let lastProcessedMtime = fs.existsSync(watchedExcelPath) ? fs.statSync(watchedExcelPath).mtimeMs : 0;
    let autoLoadInProgress = false;
    fs.watchFile(watchedExcelPath, { interval: 5000 }, async (curr, prev) => {
      if (autoLoadInProgress || curr.mtimeMs === 0 || curr.mtimeMs <= prev.mtimeMs || curr.mtimeMs === lastProcessedMtime) {
        return;
      }
      lastProcessedMtime = curr.mtimeMs;
      if (!isLoaderConfigured()) {
        console.info('[AUTO-INGEST] Detected change in Manual Work/sale.xlsx, but BOT_LOADER_PASSWORD is not configured.');
        return;
      }
      autoLoadInProgress = true;
      try {
        console.log('[AUTO-INGEST] Detected updated Manual Work/sale.xlsx; starting automatic validation and load...');
        const { processSaleFile } = await import('../Manual Work/load_sales.js');
        const loaded = await processSaleFile(watchedExcelPath, false);
        if (loaded) {
          cachedTelemetry = null;
          lastLoadedTime = 0;
          await getTelemetryData(true);
          console.log('[AUTO-INGEST] Telemetry cache refreshed with newly ingested sales workbook.');
        }
      } catch (err: any) {
        console.error(`[AUTO-INGEST] Failed to auto-ingest sale.xlsx: ${err.message}`);
      } finally {
        autoLoadInProgress = false;
      }
    });

    // Watch TM Target Daily.xlsx for monthly updates & automatic target reload
    const watchedTmTargetPath = path.resolve(__dirname, '..', 'TM Target Daily.xlsx');
    let lastTargetMtime = fs.existsSync(watchedTmTargetPath) ? fs.statSync(watchedTmTargetPath).mtimeMs : 0;
    fs.watchFile(watchedTmTargetPath, { interval: 5000 }, async (curr, prev) => {
      if (curr.mtimeMs === 0 || curr.mtimeMs <= prev.mtimeMs || curr.mtimeMs === lastTargetMtime) {
        return;
      }
      lastTargetMtime = curr.mtimeMs;
      try {
        invalidateTmTargetDailyCache();
        const summary = await loadTmTargetDailyFromFile(watchedTmTargetPath);
        if (summary) {
          console.log(
            `[TM TARGET DAILY] Detected monthly update in TM Target Daily.xlsx (${summary.periodLabel}): ${summary.stationCount} station targets across ${summary.tmCount} TMs (Total Daily Target: ${summary.totalNetworkDailyTarget} L/d).`,
          );
          cachedTelemetry = null;
          lastLoadedTime = 0;
          await getTelemetryData(true);
        }
      } catch (err: any) {
        console.error(`[TM TARGET DAILY] Failed to reload TM Target Daily.xlsx: ${err.message}`);
      }
    });
  });
}

startServer();
