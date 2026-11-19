import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import type {
  ExecutiveTelemetry,
  ForecastPoint,
  ForecastResult,
  StateSummary,
  StationMonthlySales,
  StationRecord,
  StockoutRiskStation,
  TMSummary,
} from '../types.js';
import { buildExecutiveBriefingBody } from './executiveBriefing.js';
import { classifyZeroSaleReason } from './formatting.js';
import { getStatePeriodView, getTMPeriodView } from './analyticsViews.js';
import { recommendTanker } from './tanker.js';

type ExecutiveEmailTelemetry = Omit<
  Pick<
    ExecutiveTelemetry,
    | 'date'
    | 'stations_with_sale'
    | 'stations_total'
    | 'zero_sale_count'
    | 'total_sale_qty'
    | 'total_collection'
    | 'effective_rsp'
    | 'total_free_sale_litres'
    | 'total_paytm_collection'
    | 'stockout_risk_stations'
    | 'forecast'
  >,
  'forecast' | 'stockout_risk_stations'
> & {
  forecast: Pick<ForecastResult, 'predicted_total_7d' | 'mape_ensemble' | 'backtest_days'> & {
    forecast: Array<Pick<ForecastPoint, 'date' | 'predicted_qty'> & Partial<Pick<ForecastPoint, 'p10' | 'p90'>>>;
  };
  stockout_risk_stations: Array<Pick<StockoutRiskStation, 'code' | 'name' | 'days_left'> & Partial<Pick<StockoutRiskStation, 'stock_ltr'>>>;
  history_30d?: Array<Pick<ExecutiveTelemetry['history_30d'][number], 'date' | 'sale_qty'>>;
  zero_sale_stations?: StationRecord[];
  top_declining_stations?: ExecutiveTelemetry['top_declining_stations'];
  top_performing_stations?: StationRecord[];
  states_summary?: StateSummary[];
  tm_summary?: TMSummary[];
  all_stations?: StationRecord[];
};

const number = (value: number) => value.toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function formatReportDate(date: string): string {
  const parsedDate = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsedDate.getTime())
    ? date
    : parsedDate.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
}

function getOwner(station: Pick<StationRecord, 'tm' | 'coordinator'>): string {
  const tm = station.tm.trim();
  const coordinator = station.coordinator.trim();
  if (tm && tm !== 'No TM') return coordinator ? `${tm} / ${coordinator}` : tm;
  return coordinator || 'Unassigned';
}

function getZeroSaleAction(reason: string): string {
  switch (reason) {
    case 'No salesperson': return 'Assign/confirm salesperson and resume sales';
    case 'Stock unavailable': return 'Confirm stock and arrange replenishment';
    case 'License/compliance stop': return 'Confirm clearance and escalation owner';
    case 'Commercial stop': return 'Confirm restart decision with management';
    case 'Data/reporting gap': return 'Verify source sales and correct the report';
    default: return 'Verify station status and record the root cause';
  }
}

function stockCoverBand(daysLeft: number, stockLitres: number): string {
  if (stockLitres <= 0 || daysLeft < 1) return 'Critical (<1 day)';
  if (daysLeft < 2) return 'High risk (1–2 days)';
  if (daysLeft < 3) return 'Monitor (2–3 days)';
  return 'Not flagged';
}

export async function buildStationWorkbook(
  telemetry: Pick<ExecutiveTelemetry, 'stockout_risk_stations' | 'top_declining_stations' | 'station_monthly_sales'> & {
    states_summary?: StateSummary[];
    tm_summary?: TMSummary[];
    all_stations: Array<Pick<
      StationRecord,
      | 'erp_code'
      | 'alds_name'
      | 'state'
      | 'tm'
      | 'coordinator'
      | 'sale_qty'
      | 'collection'
      | 'closing_dip_in_ltr'
      | 'days_left'
      | 'remark'
    > & Partial<Pick<
      StationRecord,
      | 'type'
      | 'tank_cap'
      | 'net_total_collection'
      | 'new_rate'
      | 'erp_rate'
      | 'effective_rsp'
      | 'paytm'
      | 'free_sale_litres'
      | 'rolling_7d_burn'
    >>>;
  }
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GO Gas Executive Suite';
  const sheet = workbook.addWorksheet('Station Detail', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const riskByCode = new Map(telemetry.stockout_risk_stations.map((station) => [station.code, station]));
  const declineByCode = new Map(telemetry.top_declining_stations.map((station) => [station.code, station]));
  if (telemetry.station_monthly_sales) {
    const salesByCode = new Map<string, StationMonthlySales[]>();
    for (const month of telemetry.station_monthly_sales) {
      const stationHistory = salesByCode.get(month.erp_code) || [];
      stationHistory.push(month);
      salesByCode.set(month.erp_code, stationHistory);
    }
    for (const [code, history] of salesByCode) {
      const reportingDays = history.reduce((sum, month) => sum + month.reporting_days, 0);
      const averageDailySale = reportingDays > 0
        ? history.reduce((sum, month) => sum + month.sale_qty, 0) / reportingDays
        : 0;
      const station = telemetry.all_stations.find((item) => item.erp_code === code);
      const dropLitres = station ? Math.max(0, averageDailySale - station.sale_qty) : 0;
      declineByCode.set(code, {
        code,
        name: station?.alds_name || code,
        state: station?.state || '',
        drop_pct: averageDailySale > 0 ? (dropLitres / averageDailySale) * 100 : 0,
        drop_litres: dropLitres,
        current_sale: station?.sale_qty || 0,
        average_daily_sale: averageDailySale,
      });
    }
  }
  sheet.columns = [
    { header: 'Station Code', key: 'code', width: 16 },
    { header: 'Station', key: 'name', width: 28 },
    { header: 'State', key: 'state', width: 12 },
    { header: 'TM', key: 'tm', width: 20 },
    { header: 'Coordinator', key: 'coordinator', width: 20 },
    { header: 'Sales (L)', key: 'sales', width: 16 },
    { header: 'Collections (₹)', key: 'collection', width: 18 },
    { header: 'Closing Stock (L)', key: 'stock', width: 18 },
    { header: 'Cover (days)', key: 'cover', width: 14 },
    { header: 'Stock Cover Status', key: 'risk', width: 22 },
    { header: 'Zero-Sale Reason', key: 'reason', width: 24 },
    { header: 'Decline vs Monthly Avg (%)', key: 'decline', width: 24 },
    { header: 'Remark', key: 'remark', width: 36 },
    { header: 'Proposed Action', key: 'action', width: 42 },
    { header: 'Proposed Owner (TM / Coordinator)', key: 'owner', width: 34 },
    { header: 'Proposed Deadline', key: 'deadline', width: 22 },
  ];
  sheet.autoFilter = { from: 'A1', to: 'P1' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };

  for (const station of telemetry.all_stations) {
    const stockRisk = riskByCode.get(station.erp_code);
    const zeroSale = station.sale_qty === 0;
    const reason = zeroSale ? classifyZeroSaleReason(station.tm, station.remark) : '';
    const action = stockRisk
      ? stockRisk.days_left < 1 || stockRisk.stock_ltr <= 0
        ? 'Arrange immediate replenishment; confirm dispatch'
        : 'Schedule replenishment and confirm stock cover'
      : zeroSale
        ? getZeroSaleAction(reason)
        : 'No priority action flagged';
    const deadline = stockRisk
      ? stockRisk.days_left < 1 || stockRisk.stock_ltr <= 0
        ? 'Today, EOD'
        : 'Within 24 hours'
      : zeroSale
        ? 'Today, EOD'
        : '';
    const decline = declineByCode.get(station.erp_code);
    const hasRollingBurn = (station.rolling_7d_burn ?? 0) > 0;
    const assessCoverEvenOnZeroSale = zeroSale && hasRollingBurn && station.days_left > 0 && station.days_left < 99;

    sheet.addRow({
      code: station.erp_code,
      name: station.alds_name,
      state: station.state,
      tm: station.tm,
      coordinator: station.coordinator,
      sales: station.sale_qty,
      collection: station.net_total_collection ?? station.collection,
      stock: station.closing_dip_in_ltr,
      cover: station.sale_qty > 0 || assessCoverEvenOnZeroSale ? station.days_left : '',
      risk: station.sale_qty === 0 && !assessCoverEvenOnZeroSale
        ? 'Not assessed (zero sale)'
        : stockCoverBand(station.days_left, station.closing_dip_in_ltr),
      reason,
      decline: decline ? Number(decline.drop_pct.toFixed(1)) : '',
      remark: station.remark,
      action,
      owner: getOwner(station),
      deadline,
    });
  }

  sheet.getColumn('sales').numFmt = '#,##0.00';
  sheet.getColumn('collection').numFmt = '₹#,##0.00';
  sheet.getColumn('stock').numFmt = '#,##0.00';
  sheet.getColumn('cover').numFmt = '0.0';
  sheet.getColumn('decline').numFmt = '0.0';

  // Sheet 2: State MIS Summary
  const stateSheet = workbook.addWorksheet('State MIS Summary', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  stateSheet.columns = [
    { header: 'State', key: 'state', width: 14 },
    { header: 'Total Stations', key: 'stations', width: 16 },
    { header: 'Zero-Sale Stations', key: 'zero', width: 18 },
    { header: 'Total Sales (L)', key: 'sales', width: 18 },
    { header: 'Avg / Station (L)', key: 'avg', width: 18 },
    { header: 'Net Collections (₹)', key: 'collection', width: 20 },
    { header: 'Nominal RSP (₹/L)', key: 'nominal_rsp', width: 18 },
    { header: 'Effective RSP (₹/L)', key: 'effective_rsp', width: 18 },
    { header: 'Collection Gap (₹/L)', key: 'gap', width: 18 },
    { header: 'Free Sale (L)', key: 'free_sale', width: 16 },
    { header: 'Revenue at Risk (₹)', key: 'risk_rs', width: 20 },
  ];
  stateSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  stateSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

  const statesSummary = telemetry.states_summary ?? getStatePeriodView(telemetry.all_stations as StationRecord[]);
  for (const st of statesSummary) {
    stateSheet.addRow({
      state: st.state,
      stations: st.stations,
      zero: st.zero_sale_count,
      sales: st.total_sale_qty,
      avg: st.avg_sale_per_station,
      collection: st.total_collection,
      nominal_rsp: st.nominal_rsp,
      effective_rsp: st.effective_rsp,
      gap: st.collection_gap_per_l,
      free_sale: st.free_sale_litres,
      risk_rs: st.revenue_at_risk,
    });
  }
  stateSheet.getColumn('sales').numFmt = '#,##0.00';
  stateSheet.getColumn('avg').numFmt = '#,##0.00';
  stateSheet.getColumn('collection').numFmt = '₹#,##0.00';
  stateSheet.getColumn('nominal_rsp').numFmt = '₹#,##0.00';
  stateSheet.getColumn('effective_rsp').numFmt = '₹#,##0.00';
  stateSheet.getColumn('gap').numFmt = '₹#,##0.00';
  stateSheet.getColumn('risk_rs').numFmt = '₹#,##0.00';

  // Sheet 3: TM Leaderboard
  const tmSheet = workbook.addWorksheet('TM Leaderboard', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  tmSheet.columns = [
    { header: 'Rank', key: 'rank', width: 10 },
    { header: 'Territory Manager', key: 'tm', width: 24 },
    { header: 'Coordinator', key: 'coordinator', width: 22 },
    { header: 'Stations', key: 'stations', width: 14 },
    { header: 'Daily Target (L)', key: 'daily_target', width: 18 },
    { header: 'Total Sales (L)', key: 'sales', width: 18 },
    { header: 'Variance (Act - Tgt L)', key: 'variance', width: 22 },
    { header: 'Avg Daily / Station (L)', key: 'avg', width: 22 },
    { header: 'Zero-Sale Stations', key: 'zero', width: 18 },
    { header: 'Target Achievement (%)', key: 'eff', width: 24 },
  ];
  tmSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  tmSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

  const tmSummary = telemetry.tm_summary ?? getTMPeriodView(telemetry.all_stations as StationRecord[]);
  tmSummary.forEach((tmRow, idx) => {
    const dailyTarget = tmRow.daily_target ?? 0;
    const variance = tmRow.target_variance_qty ?? (tmRow.total_sale_qty - dailyTarget);
    tmSheet.addRow({
      rank: idx + 1,
      tm: tmRow.tm,
      coordinator: tmRow.coordinator,
      stations: tmRow.stations,
      daily_target: dailyTarget,
      sales: tmRow.total_sale_qty,
      variance,
      avg: tmRow.avg_daily_sale,
      zero: tmRow.zero_sale_count,
      eff: tmRow.efficiency_pct,
    });
  });

  // Sheet 4: Tanker Dispatch Manifest
  const dispatchSheet = workbook.addWorksheet('Tanker Dispatch Manifest', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  dispatchSheet.columns = [
    { header: 'Station Code', key: 'code', width: 16 },
    { header: 'Station Name', key: 'name', width: 28 },
    { header: 'State', key: 'state', width: 12 },
    { header: 'TM', key: 'tm', width: 20 },
    { header: 'Tank Capacity', key: 'tank_cap', width: 16 },
    { header: 'Closing Stock (L)', key: 'stock', width: 18 },
    { header: '7d Rolling Burn (L/d)', key: 'burn', width: 20 },
    { header: 'Cover (days)', key: 'days_left', width: 14 },
    { header: 'Recommended Tanker', key: 'tanker', width: 22 },
    { header: 'Refill Volume (L)', key: 'refill', width: 18 },
    { header: 'Remark', key: 'remark', width: 32 },
  ];
  dispatchSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  dispatchSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C2D12' } };

  for (const station of telemetry.all_stations) {
    if (station.days_left <= 3.5 || station.sale_qty === 0) {
      const dailyBurn = station.rolling_7d_burn || station.sale_qty || 0;
      const rec = recommendTanker(dailyBurn, station.closing_dip_in_ltr, 3, station.tank_cap);
      dispatchSheet.addRow({
        code: station.erp_code,
        name: station.alds_name,
        state: station.state,
        tm: station.tm,
        tank_cap: station.tank_cap || '10KL',
        stock: station.closing_dip_in_ltr,
        burn: dailyBurn,
        days_left: station.days_left,
        tanker: rec.tankerLabel,
        refill: rec.requiredVolumeLtr,
        remark: station.remark,
      });
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildExecutiveEmail(telemetry: ExecutiveEmailTelemetry) {
  const reportDate = formatReportDate(telemetry.date);
  const briefing = buildExecutiveBriefingBody(telemetry);
  const sectionHeadingColors = new Map([
    ['🟢 *PERFORMANCE*', '#15803d'],
    ['🟠 *EXCEPTIONS*', '#c2410c'],
    ['🔴 *TODAY’S ACTIONS*', '#b91c1c'],
    ['🔵 *NEXT-DAY FORECAST —', '#1d4ed8'],
  ]);
  let emphasisColor = '#1d4ed8';
  const htmlBody = briefing.text.split('\n').map((line, index) => {
    const headingColor = [...sectionHeadingColors].find(([heading]) =>
      heading.endsWith('*') ? line === heading : line.startsWith(heading),
    )?.[1];
    if (headingColor) emphasisColor = headingColor;
    const escapedLine = escapeHtml(line).replace(
      /\*([^*]+)\*/g,
      `<strong style="color:${emphasisColor}">$1</strong>`,
    );
    if (index === 0) {
      return `<h1 style="margin:0 0 18px;font-size:20px;color:#0f172a">${escapedLine}</h1>`;
    }
    if (!line) return '<div style="height:6px"></div>';
    if (headingColor) {
      return `<h2 style="margin:18px 0 6px;font-size:13px;color:${headingColor}">${escapedLine.replace(/<\/?strong(?:\s+style="[^"]*")?>/g, '')}</h2>`;
    }
    return `<p style="margin:8px 0">${escapedLine}</p>`;
  }).join('');

  const statesSummary = telemetry.states_summary
    ?? (telemetry.all_stations && telemetry.all_stations.length > 0
      ? getStatePeriodView(telemetry.all_stations)
      : []);

  const stateTableHtml = statesSummary.length > 0
    ? `
      <h2 style="margin:24px 0 8px;font-size:13px;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px">📊 State-wise MIS Summary</h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;text-align:left">
            <th style="padding:8px;border:1px solid #cbd5e1">State</th>
            <th style="padding:8px;border:1px solid #cbd5e1;text-align:right">Stations</th>
            <th style="padding:8px;border:1px solid #cbd5e1;text-align:right">Zero Sale</th>
            <th style="padding:8px;border:1px solid #cbd5e1;text-align:right">Sales (L)</th>
            <th style="padding:8px;border:1px solid #cbd5e1;text-align:right">Collections (₹)</th>
            <th style="padding:8px;border:1px solid #cbd5e1;text-align:right">Eff RSP</th>
          </tr>
        </thead>
        <tbody>
          ${statesSummary.map((st) => `
            <tr>
              <td style="padding:6px 8px;border:1px solid #e2e8f0;font-weight:bold">${escapeHtml(st.state)}</td>
              <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right">${st.stations}</td>
              <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;color:${st.zero_sale_count > 0 ? '#b91c1c' : '#15803d'}">${st.zero_sale_count}</td>
              <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;font-weight:bold">${number(st.total_sale_qty)}</td>
              <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right">₹${number(st.total_collection)}</td>
              <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right">₹${st.effective_rsp.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : '';

  const tmSummaryList = telemetry.tm_summary
    ?? (telemetry.all_stations && telemetry.all_stations.length > 0
      ? getTMPeriodView(telemetry.all_stations)
      : []);

  const tmTableHtml = tmSummaryList.length > 0
    ? `
      <h2 style="margin:24px 0 8px;font-size:13px;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px">🎯 TM Daily Target &amp; 3-Month Trend Scorecard</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:18px">
        <thead>
          <tr style="background:#1e1b4b;color:#ffffff;text-align:left">
            <th style="padding:7px;border:1px solid #cbd5e1">TM Name</th>
            <th style="padding:7px;border:1px solid #cbd5e1;text-align:right">Daily Target (L)</th>
            <th style="padding:7px;border:1px solid #cbd5e1;text-align:right">Actual Sold (L)</th>
            <th style="padding:7px;border:1px solid #cbd5e1;text-align:right">% Achieved</th>
            <th style="padding:7px;border:1px solid #cbd5e1;text-align:right">3-Mo Trend</th>
            <th style="padding:7px;border:1px solid #cbd5e1;text-align:right">Digital / Cash %</th>
          </tr>
        </thead>
        <tbody>
          ${tmSummaryList.map((t) => {
            const tgt = t.daily_target ?? 0;
            const pct = t.efficiency_pct ?? 0;
            const trend3m = t.three_month_change_pct ?? 0;
            return `
            <tr>
              <td style="padding:6px 7px;border:1px solid #e2e8f0;font-weight:bold">${escapeHtml(t.tm)}</td>
              <td style="padding:6px 7px;border:1px solid #e2e8f0;text-align:right">${number(tgt)}</td>
              <td style="padding:6px 7px;border:1px solid #e2e8f0;text-align:right;font-weight:bold">${number(t.total_sale_qty)}</td>
              <td style="padding:6px 7px;border:1px solid #e2e8f0;text-align:right;font-weight:bold;color:${pct >= 100 ? '#15803d' : pct >= 90 ? '#1d4ed8' : '#b91c1c'}">${pct}%</td>
              <td style="padding:6px 7px;border:1px solid #e2e8f0;text-align:right;color:${trend3m < 0 ? '#b91c1c' : '#15803d'}">${trend3m > 0 ? '+' : ''}${trend3m}%</td>
              <td style="padding:6px 7px;border:1px solid #e2e8f0;text-align:right">${t.digital_pct ?? 0}% Dig / ${t.cash_pct ?? 0}% Cash</td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `
    : '';

  return {
    subject: `GO Gas Daily Operations Brief | ${reportDate}`,
    text: briefing.text,
    html: `<div style="max-width:680px;margin:0 auto;font-family:Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.55"><p style="margin:0 0 18px"><img src="cid:company-logo" alt="Confidence Group" width="200" style="display:block;width:200px;max-width:100%;height:auto"></p>${htmlBody}${stateTableHtml}${tmTableHtml}</div>`,
  };
}

function readEmailConfig() {
  const sender = process.env.REPORT_SENDER_EMAIL?.trim();
  const recipients = process.env.REPORT_RECIPIENT_EMAILS
    ?.split(',')
    .map((email) => email.trim())
    .filter(Boolean);
  const password = process.env.REPORT_SENDER_APP_PASSWORD?.replace(/\s/g, '');

  if (!sender || !recipients?.length || !password) {
    throw new Error(
      'Email is not configured. Set REPORT_SENDER_EMAIL, REPORT_RECIPIENT_EMAILS, and REPORT_SENDER_APP_PASSWORD in the local environment.',
    );
  }

  const addresses = [sender, ...recipients];
  if (addresses.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error('Email configuration contains an invalid sender or recipient address.');
  }

  return { sender, recipients, password };
}

export async function sendExecutiveBriefing(telemetry: ExecutiveTelemetry) {
  const { sender, recipients, password } = readEmailConfig();
  const email = buildExecutiveEmail(telemetry);
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: sender, pass: password },
  });

  await transporter.sendMail({
    from: `"GO Gas Operations Desk" <${sender}>`,
    to: recipients,
    ...email,
    attachments: [{
      filename: 'company_logo.jpeg',
      path: fileURLToPath(new URL('../../company_logo.jpeg', import.meta.url)),
      cid: 'company-logo',
    }, {
      filename: `GO-Gas-Station-Detail-${telemetry.date}.xlsx`,
      content: await buildStationWorkbook(telemetry),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }],
  });

  return { recipientCount: recipients.length };
}
