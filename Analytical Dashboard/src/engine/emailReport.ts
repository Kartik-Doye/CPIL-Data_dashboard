import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import type {
  ExecutiveTelemetry,
  ForecastPoint,
  ForecastResult,
  StationMonthlySales,
  StationRecord,
  StockoutRiskStation,
} from '../types.js';
import { classifyZeroSaleReason } from './formatting.js';

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
    >>;
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

    sheet.addRow({
      code: station.erp_code,
      name: station.alds_name,
      state: station.state,
      tm: station.tm,
      coordinator: station.coordinator,
      sales: station.sale_qty,
      collection: station.collection,
      stock: station.closing_dip_in_ltr,
      cover: station.sale_qty > 0 ? station.days_left : '',
      risk: station.sale_qty === 0
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
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildExecutiveEmail(telemetry: ExecutiveEmailTelemetry) {
  const nextForecast = telemetry.forecast.forecast[0];
  const mape = telemetry.forecast.mape_ensemble;
  const historicalAccuracy = mape === null || !Number.isFinite(mape)
    ? 'Historical MAPE unavailable'
    : `MAPE ${mape.toFixed(1)}% across ${telemetry.forecast.backtest_days ?? 'an unspecified number of'} scored days; planning input only`;
  const stockRisks = telemetry.stockout_risk_stations;
  const critical = stockRisks.filter((station) => (station.stock_ltr ?? 1) <= 0 || station.days_left < 1);
  const highRisk = stockRisks.filter((station) => (station.stock_ltr ?? 1) > 0 && station.days_left >= 1 && station.days_left < 2);
  const monitor = stockRisks.filter((station) => (station.stock_ltr ?? 1) > 0 && station.days_left >= 2 && station.days_left < 3);
  const stationByCode = new Map((telemetry.all_stations || []).map((station) => [station.erp_code, station]));
  const urgentActions = critical.slice(0, 3).map((stockRisk) => {
    const station = stationByCode.get(stockRisk.code);
    const owner = station ? getOwner(station) : 'TM/coordinator to confirm';
    return `${stockRisk.name} (${owner})`;
  });
  const priorDays = (telemetry.history_30d || []).filter((point) => point.date < telemetry.date).slice(-7);
  const priorAverage = priorDays.length > 0
    ? priorDays.reduce((sum, point) => sum + point.sale_qty, 0) / priorDays.length
    : null;
  const salesChange = priorAverage && priorAverage > 0
    ? `${((telemetry.total_sale_qty / priorAverage - 1) * 100 >= 0 ? '+' : '')}${((telemetry.total_sale_qty / priorAverage - 1) * 100).toFixed(1)}% vs prior ${priorDays.length}-day avg`
    : 'prior-period comparison unavailable';
  const zeroSaleReasons = (telemetry.zero_sale_stations || []).reduce((counts, station) => {
    const reason = classifyZeroSaleReason(station.tm, station.remark);
    counts[reason] = (counts[reason] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const zeroSaleSummary = Object.entries(zeroSaleReasons)
    .map(([reason, count]) => `${reason}: ${count}`)
    .join('; ') || (telemetry.zero_sale_count > 0 ? 'reason breakdown unavailable' : 'none');
  const topTenStations = (telemetry.top_performing_stations || []).slice(0, 10);
  const topTenVolume = topTenStations
    .reduce((sum, station) => sum + station.sale_qty, 0);
  const topTenShare = topTenStations.length > 0 && telemetry.total_sale_qty > 0
    ? `${((topTenVolume / telemetry.total_sale_qty) * 100).toFixed(1)}%`
    : 'not available';
  const declineSummary = telemetry.top_declining_stations
    ? `top decline list ${telemetry.top_declining_stations.filter((station) => station.drop_pct >= 48).length}/10`
    : 'data unavailable';
  const forecastRange = nextForecast
    && typeof nextForecast.p10 === 'number'
    && Number.isFinite(nextForecast.p10)
    && typeof nextForecast.p90 === 'number'
    && Number.isFinite(nextForecast.p90)
    ? ` (P10–P90 ${number(nextForecast.p10)}–${number(nextForecast.p90)} L)`
    : '';
  const actionSummary = urgentActions.length > 0
    ? `Today, EOD: replenish ${urgentActions.join('; ')}; proposed owner is the station TM/coordinator.`
    : telemetry.zero_sale_count > 0
      ? 'Today, EOD: station TM/coordinator to confirm owners and resolve zero-sale exceptions.'
      : 'No critical stock-cover or zero-sale action is currently flagged.';

  const text = [
    `GO GAS EXECUTIVE DAILY BRIEF — ${telemetry.date}`,
    `Sales ${number(telemetry.total_sale_qty)} L | Collections ₹${number(telemetry.total_collection)} | Realization ₹${telemetry.effective_rsp.toFixed(2)}/L.`,
    `Coverage ${telemetry.stations_with_sale}/${telemetry.stations_total} | Zero sales ${telemetry.zero_sale_count} | ${salesChange}.`,
    `Stock cover: ${critical.length} critical (<1d), ${highRisk.length} high (1–2d), ${monitor.length} monitor (2–3d); not all are stock-outs.`,
    `Zero-sale causes: ${zeroSaleSummary}. Declining >48%: ${declineSummary}.`,
    `ACTION: ${actionSummary}`,
    `Top 10 volume share: ${topTenShare}.`,
    `Forecast${nextForecast ? ` ${nextForecast.date}: ${number(nextForecast.predicted_qty)} L${forecastRange}` : ' unavailable'}; ${historicalAccuracy}.`,
    'Plan, margin, credit, receivables and banked-cash data are unavailable in the current source.',
    'Attached Excel: station detail and proposed actions; confirm owner/deadline assignments.',
    '',
    'Kartik Doye | Data Analyst (Sales & Marketing) - ALDS',
    'Phone: 8087018975 | kartikdoye@confidencegroup.co',
  ].join('\n');

  return {
    subject: `GO Gas Executive Daily Flash - ${telemetry.date}`,
    text,
    html: `<div style="font-family:Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.6"><p style="margin:0 0 20px"><img src="cid:company-logo" alt="Confidence Group" width="240" style="display:block;width:240px;max-width:100%;height:auto"></p><div>${escapeHtml(text).replace(/\n/g, '<br>')}</div></div>`,
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
