import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
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
  getCoordinatorPeriodView,
  getTMPeriodView,
  getTypePeriodView,
  getExceptionsView,
  getDataStatusView,
  normalizeStateCode,
} from './src/engine/analyticsViews.js';
import { query, queryLoader, testDbConnection, getDbAuditReport, getDbConnectionDetails } from './src/engine/db.js';
import { StationMonthlySales, StationRecord } from './src/types.js';
import { sendExecutiveBriefing } from './src/engine/emailReport.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

let cachedTelemetry: any = null;
let lastLoadedTime = 0;
let emailSendInProgress = false;
let lastEmailSentAt = 0;

async function loadFromDatabase(): Promise<any | null> {
  const dbConnection = getDbConnectionDetails();

  try {
    const historyRows = await query(`
      SELECT 
        sale_date::text as date,
        SUM(sale_qty)::float as sale_qty,
        SUM(collection)::float as collection,
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

    console.log(`[DATABASE] Success! Found ${historyRows.length} days of history in PostgreSQL.`);

    const monthlySalesRows = await query(`
      SELECT
        erp_code,
        DATE_TRUNC('month', sale_date)::date::text AS month,
        SUM(sale_qty)::float AS sale_qty,
        COUNT(DISTINCT sale_date)::int AS reporting_days
      FROM sale_tracker
      WHERE sale_date >= DATE_TRUNC('month', (SELECT MAX(sale_date) FROM sale_tracker)) - INTERVAL '2 months'
      GROUP BY erp_code, DATE_TRUNC('month', sale_date)
      ORDER BY month ASC, erp_code ASC
    `);

    const latestStations = await query(`
      SELECT 
        s.erp_code,
        s.alds_name,
        COALESCE(m.to_state, s.state) as state,
        COALESCE(NULLIF(TRIM(s.tm), ''), 'No TM') as tm,
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
      LEFT JOIN state_map m ON s.state = m.from_state
      WHERE s.sale_date = (SELECT MAX(sale_date) FROM sale_tracker)
    `);

    if (!latestStations || latestStations.length === 0) {
      console.warn('[DATABASE] History found, but latest date query returned 0 stations. Check data consistency.');
      return null;
    }

    console.log(`[DATABASE] Loaded ${latestStations.length} stations for date: ${latestStations[0].sale_date}`);

    const activeStns = latestStations.filter((r: any) => r.sale_qty > 0);
    const networkAvgSale = activeStns.length > 0 
      ? activeStns.reduce((a: number, b: any) => a + b.sale_qty, 0) / activeStns.length 
      : 1000;

    const stations: StationRecord[] = latestStations.map((r: any, i: number) => {
      const dailyBurn = r.sale_qty > 0 ? r.sale_qty : networkAvgSale;
      const closingDip = r.closing_dip_in_ltr || 0;
      const daysLeft = closingDip > 0 && dailyBurn > 0 ? Number((closingDip / dailyBurn).toFixed(1)) : 99;
      
      // Calculate trend slope dynamically based on network mean
      const trendSlope = r.sale_qty === 0 ? -100 : Number(((r.sale_qty - networkAvgSale) / networkAvgSale * 100).toFixed(1));

      return {
        id: `station-${i + 1}-${r.erp_code}`,
        erp_code: r.erp_code,
        alds_name: r.alds_name,
        type: r.type,
        coordinator: r.coordinator,
        state: normalizeStateCode(r.state),
        tm: r.tm,
        tank_cap: r.tank_cap || '10KL',
        sale_qty: r.sale_qty || 0,
        collection: r.collection || 0,
        new_rate: r.new_rate || 0,
        other: r.other || 0,
        diff: r.diff || 0,
        erp_rate: r.erp_rate || 0,
        ret_test_cal: r.ret_test_cal || 0,
        free_sale_litres: r.free_sale_litres || 0,
        free_sale_rupees: r.free_sale_rupees || 0,
        scheme: r.scheme || 0,
        paytm: r.paytm || 0,
        net_cash_collection: r.net_cash_collection || 0,
        closing_dip_in_ltr: closingDip,
        remark: r.remark || '',
        net_total_collection: r.net_total_collection || r.collection || 0,
        effective_rsp: r.effective_rsp || r.new_rate || 0,
        collection_check: r.collection_check || 0,
        scheme_as_per_ho: r.scheme_as_per_ho || 0,
        free_sale_pct: r.free_sale_pct || 0,
        sale_date: r.sale_date ? r.sale_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
        days_left: daysLeft,
        trend_slope: trendSlope,
        status_band: (r.sale_qty >= 1100 ? 'Achieved' : r.sale_qty >= 990 ? 'On track' : r.sale_qty >= 825 ? 'At risk' : 'Behind') as any,
      };
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const history30d = historyRows.map((hr: any) => {
      const d = new Date(hr.date);
      const dow = d.getDay();
      const effRsp = hr.sale_qty > 0 ? hr.collection / hr.sale_qty : 77.2;
      return {
        date: hr.date.slice(0, 10),
        day_name: dayNames[dow],
        sale_qty: hr.sale_qty,
        collection: hr.collection,
        effective_rsp: Math.round(effRsp * 100) / 100,
        active_stations: hr.active_stations,
        zero_sale_count: hr.zero_sale_count,
      };
    });

    return processDataset(
      stations,
      'PostgreSQL Database (sale_tracker)',
      history30d,
      monthlySalesRows
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
  monthlySalesRows: StationMonthlySales[]
) {
  const dailyView = getDailyView(stations);
  const statesSummary = getStatePeriodView(stations);
  const tmSummary = getTMPeriodView(stations);
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
        AND forecast_origin_date >= $1::date - INTERVAL '90 days'
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
          AND forecast_origin_date >= $1::date - INTERVAL '90 days'
        ORDER BY target_date, forecast_origin_date DESC
      ) AS latest_outcome_per_day
      ORDER BY target_date DESC
      LIMIT 7
    `, [stations[0]?.sale_date]);
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
    learningStatus = `Saved-history learning unavailable: ${message}`;
  }

  const forecastEngineResult = generateForecast(historySeries, 7, stations, persistedErrors);
  forecastEngineResult.learning_status = learningStatus;

  try {
    const forecastOriginDate = stations[0]?.sale_date;
    if (forecastOriginDate && forecastEngineResult.forecast.length > 0) {
      for (const forecast of forecastEngineResult.forecast) {
        await queryLoader(`
          INSERT INTO forecast_feedback (
            forecast_origin_date, target_date, predicted_ensemble,
            predicted_linear, predicted_holt_winters, predicted_naive, predicted_weekday,
            actual_sale_qty, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NOW())
          ON CONFLICT (forecast_origin_date, target_date) DO NOTHING
        `, [
          forecastOriginDate,
          forecast.date,
          forecast.predicted_qty,
          forecast.linear_pred,
          forecast.holt_winters_pred,
          forecast.naive_last_week,
          forecast.same_weekday_avg,
        ]);
      }
      forecastEngineResult.learning_status = persistedErrors && persistedErrors.sample_count > 0
        ? `Saved forecasts are scored against network-wide actuals; learning is active with ${persistedErrors.sample_count} evaluated outcome(s) and strengthens as evidence grows.`
        : 'Saved forecasts are scored against network-wide actuals; learning begins when actual outcomes are available.';
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[FORECAST FEEDBACK] Forecast save failed: ${message}`);
    forecastEngineResult.learning_status = `Forecast save failed: ${message}`;
  }

  // Deep Statistical & Outlier Analysis
  const comprehensiveAnalysis = runComprehensiveAnalysis(stations);

  // Health Score
  const activeRatio = (stationsWithSale / (stationsTotal || 1)) * 40;
  const gapPenalty = Math.max(0, 20 - collectionGapPerL * 8);
  const freeSalePenalty = Math.max(0, 15 - (dailyView.free_sale_litres / (totalSaleQty || 1)) * 500);

  const stockoutRiskStations = stations
    .filter((s) => s.days_left < 3.0 && s.sale_qty > 0)
    .sort((a, b) => a.days_left - b.days_left)
    .map((s) => ({
      code: s.erp_code,
      name: s.alds_name,
      state: s.state,
      stock_ltr: s.closing_dip_in_ltr || 0,
      daily_burn_ltr: s.sale_qty,
      days_left: s.days_left,
      remark: s.remark || (s.days_left < 1.5 ? 'Immediate Replenishment Needed' : 'Low Buffer'),
    }));

  const stockoutPenalty = Math.max(0, 25 - stockoutRiskStations.length * 3);
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

  return {
    date: dailyView.sale_date,
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
    station_monthly_sales: monthlySalesRows,
    states_summary: statesSummary,
    tm_summary: tmSummary,
    type_summary: typeSummary,
    all_stations: stations,
    exceptions,
    data_status: dataStatus,
    comprehensive_analysis: comprehensiveAnalysis,
  };
}

async function getTelemetryData(forceRefresh = false) {
  const isConnected = await testDbConnection(forceRefresh);
  if (!isConnected) {
    cachedTelemetry = null;
    lastLoadedTime = 0;
    return null;
  }

  const now = Date.now();
  if (cachedTelemetry && !forceRefresh && now - lastLoadedTime < 30000) {
    return cachedTelemetry;
  }

  const dbAudit = await getDbAuditReport();
  const loadedTelemetry = await loadFromDatabase();

  if (!loadedTelemetry) {
    console.error('[DATABASE] Unable to load telemetry from PostgreSQL table sale_tracker.');
    return null;
  }

  const isPostgresSource = loadedTelemetry.source_file === 'PostgreSQL Database (sale_tracker)';
  const isExternalDatabaseConnected = dbAudit.connected && dbAudit.engine === 'external';
  const hasDiscrepancy = Boolean(
    !isExternalDatabaseConnected ||
    (!isPostgresSource && isExternalDatabaseConnected) ||
    (isExternalDatabaseConnected && dbAudit.latest_date && dbAudit.latest_date !== loadedTelemetry.date) ||
    (isExternalDatabaseConnected && dbAudit.latest_date_stations && dbAudit.latest_date_stations !== loadedTelemetry.stations_total)
  );

  let discrepancyReason = 'UI data is loaded from PostgreSQL table sale_tracker.';
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

  cachedTelemetry = loadedTelemetry;
  lastLoadedTime = now;
  return cachedTelemetry;
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
    const data = await getTelemetryData(forceRefresh);
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

app.post('/api/email/send', async (req: Request, res: Response) => {
  const remoteAddress = req.socket.remoteAddress || '';
  const normalizedAddress = remoteAddress.startsWith('::ffff:')
    ? remoteAddress.slice('::ffff:'.length)
    : remoteAddress;
  const origin = req.get('origin');
  let originAllowed = !origin;

  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      originAllowed = (
        (parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:') &&
        parsedOrigin.host === req.get('host')
      );
    } catch {
      originAllowed = false;
    }
  }

  if (
    (normalizedAddress !== '::1' && !normalizedAddress.startsWith('127.')) ||
    !originAllowed ||
    req.get('x-go-gas-email-request') !== 'authorized-client'
  ) {
    res.status(403).json({ error: 'Email sending is only available from this computer.' });
    return;
  }
  if (emailSendInProgress) {
    res.status(409).json({ error: 'An executive briefing email is already being sent.' });
    return;
  }
  if (Date.now() - lastEmailSentAt < 30_000) {
    res.status(429).json({ error: 'Please wait 30 seconds before sending another briefing.' });
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

app.get('/api/export/csv', async (_req: Request, res: Response) => {
  try {
    const telemetry = await getTelemetryData();
    if (!telemetry) {
      res.status(503).send('No data available');
      return;
    }

    const headers = [
      'ERP Code', 'ALDS Name', 'State', 'TM', 'Coordinator', 'Type',
      'Sale Qty', 'Collection', 'New Rate (RSP)', 'Effective RSP', 'Closing Dip',
      'Days Left', 'Remark', 'Status Band'
    ];

    const rows = telemetry.all_stations.map((s: StationRecord) => [
      `"${s.erp_code}"`,
      `"${s.alds_name.replace(/"/g, '""')}"`,
      `"${s.state}"`,
      `"${s.tm}"`,
      `"${s.coordinator}"`,
      `"${s.type}"`,
      s.sale_qty,
      s.collection,
      s.new_rate,
      s.effective_rsp,
      s.closing_dip_in_ltr,
      s.days_left,
      `"${(s.remark || '').replace(/"/g, '""')}"`,
      `"${s.status_band}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=GO_Gas_Sales_${telemetry.date}.csv`);
    res.send(csvContent);
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

  app.listen(PORT, () => {
    console.log(`[GO Gas Executive Suite] Dashboard active at http://localhost:${PORT}`);
    const refreshLearningData = () => {
      void getTelemetryData(true).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[FORECAST FEEDBACK] Scheduled daily learning refresh failed: ${message}`);
      });
    };
    refreshLearningData();
    setInterval(refreshLearningData, 24 * 60 * 60 * 1000);
  });
}

startServer();
