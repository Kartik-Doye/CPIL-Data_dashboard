import type {
  ExecutiveTelemetry,
  ForecastPoint,
  ForecastResult,
  StationRecord,
  StockoutRiskStation,
} from '../types.js';
import { classifyZeroSaleReason } from './formatting.js';

export type ExecutiveBriefingTelemetry = Pick<
  ExecutiveTelemetry,
  | 'date'
  | 'stations_with_sale'
  | 'stations_total'
  | 'zero_sale_count'
  | 'total_sale_qty'
  | 'total_collection'
  | 'effective_rsp'
> & {
  stockout_risk_stations: Array<Pick<StockoutRiskStation, 'code' | 'name' | 'days_left'> & Partial<Pick<StockoutRiskStation, 'stock_ltr'>>>;
  forecast: Pick<ForecastResult, 'mape_ensemble' | 'backtest_days'> & {
    forecast: Array<Pick<ForecastPoint, 'date' | 'predicted_qty'> & Partial<Pick<ForecastPoint, 'p10' | 'p90'>>>;
  };
  history_30d?: Array<Pick<ExecutiveTelemetry['history_30d'][number], 'date' | 'sale_qty'>>;
  zero_sale_stations?: StationRecord[];
  top_declining_stations?: ExecutiveTelemetry['top_declining_stations'];
  top_performing_stations?: StationRecord[];
  all_stations?: StationRecord[];
};

export interface ExecutiveBriefingBody {
  title: string;
  dateLabel: string;
  text: string;
}

const formatDate = (date: string) => {
  const parsedDate = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsedDate.getTime())
    ? date
    : parsedDate.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
};

const formatNumber = (value: number) => value.toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const formatLitres = (value: number) => `${formatNumber(value)} L`;

function getOwner(station?: Pick<StationRecord, 'tm' | 'coordinator'>): string {
  if (station?.tm && station.tm !== 'No TM') return `TM ${station.tm}`;
  if (station?.coordinator && station.coordinator !== 'Unknown') return `Coordinator ${station.coordinator}`;
  return 'owner unassigned';
}

function formatNamedStations(stations: Array<{ name: string; owner: string }>, limit = 3): string {
  const names = stations.slice(0, limit).map(({ name, owner }) => `${name} (${owner})`);
  const remaining = stations.length - names.length;
  return `${names.join(', ')}${remaining > 0 ? `; see full report for ${remaining} additional station(s)` : ''}`;
}

export function buildExecutiveBriefingBody(
  telemetry: ExecutiveBriefingTelemetry,
): ExecutiveBriefingBody {
  const dateLabel = formatDate(telemetry.date);
  const title = `🔥 *GO GAS EXECUTIVE MORNING BRIEFING — ${dateLabel}*`;
  const previousDays = (telemetry.history_30d || [])
    .filter((point) => point.date < telemetry.date)
    .slice(-7);
  const previousAverage = previousDays.length
    ? previousDays.reduce((sum, point) => sum + point.sale_qty, 0) / previousDays.length
    : null;
  const salesChange = previousAverage && previousAverage > 0
    ? `${((telemetry.total_sale_qty / previousAverage - 1) * 100 >= 0 ? '+' : '')}${((telemetry.total_sale_qty / previousAverage - 1) * 100).toFixed(1)}%`
    : 'N/A';

  const zeroSaleStations = telemetry.zero_sale_stations || [];
  const reasonCounts = zeroSaleStations.reduce((counts, station) => {
    const reason = classifyZeroSaleReason(station.tm, station.remark);
    counts[reason] = (counts[reason] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const reasonCount = (reason: string) => reasonCounts[reason] || 0;
  const unclassifiedCount = reasonCount('Unclassified — verify')
    + Math.max(0, telemetry.zero_sale_count - zeroSaleStations.length);
  const zeroSaleReasonRows: Array<[number, string]> = [
      [reasonCount('No salesperson') + reasonCount('Data/reporting gap'), 'missing TM/data'],
      [reasonCount('Commercial stop'), 'sale stops'],
      [reasonCount('License/compliance stop'), 'license issues'],
      [reasonCount('Stock unavailable'), 'stock unavailable'],
      [unclassifiedCount, 'unclassified'],
  ];
  const zeroSaleBreakdown = zeroSaleStations.length
    ? zeroSaleReasonRows
      .filter(([count]) => count > 0)
      .map(([count, label]) => `${count} ${label}`)
      .join(', ')
    : '';

  const stockRisks = telemetry.stockout_risk_stations || [];
  const critical = stockRisks.filter((station) => (station.stock_ltr ?? 1) <= 0 || station.days_left < 1);
  const highRisk = stockRisks.filter((station) => (station.stock_ltr ?? 1) > 0 && station.days_left >= 1 && station.days_left < 2);
  const monitor = stockRisks.filter((station) => (station.stock_ltr ?? 1) > 0 && station.days_left >= 2 && station.days_left < 3);
  const stationByCode = new Map((telemetry.all_stations || []).map((station) => [station.erp_code, station]));
  const declineStations = telemetry.top_declining_stations;
  const severeDeclines = declineStations?.filter((station) => station.drop_pct >= 48).length;
  const topDecliningStations = declineStations?.length || 0;
  const topPerformers = telemetry.top_performing_stations || [];
  const topTenShare = topPerformers.length > 0 && telemetry.total_sale_qty > 0
    ? `${(topPerformers.slice(0, 10).reduce((sum, station) => sum + station.sale_qty, 0) / telemetry.total_sale_qty * 100).toFixed(1)}%`
    : 'N/A';
  const previousDay = telemetry.forecast?.forecast?.[0];
  const forecastRange = previousDay
    && typeof previousDay.p10 === 'number'
    && Number.isFinite(previousDay.p10)
    && typeof previousDay.p90 === 'number'
    && Number.isFinite(previousDay.p90)
    ? ` (range ${formatLitres(previousDay.p10)}–${formatLitres(previousDay.p90)})`
    : '';
  const mape = telemetry.forecast?.mape_ensemble;
  const mapeSummary = mape !== null && mape !== undefined && Number.isFinite(mape)
    ? `Historical MAPE ${mape.toFixed(1)}%${telemetry.forecast.backtest_days ? ` across ${telemetry.forecast.backtest_days} scored days` : ''}.`
    : 'Historical MAPE unavailable.';
  const criticalActions = stockRisks
    .filter((station) => (station.stock_ltr ?? 1) <= 0 || station.days_left < 1)
    .map((station) => ({
      name: station.name,
      owner: getOwner(stationByCode.get(station.code)),
    }));
  const actionLine = critical.length
    ? `• Replenish ${critical.length} critical-stock station(s) by EOD${criticalActions.length ? `: ${formatNamedStations(criticalActions)}` : ''}.`
    : '• No stations currently have less than one day of stock cover.';
  const zeroSaleActionLine = telemetry.zero_sale_count
    ?     `• Resolve ${telemetry.zero_sale_count} zero-sale station(s) by EOD; assign owners by 10:00 AM and escalate unassigned critical actions or unresolved sale stops/stock gaps to Regional Managers by 10:00 AM.`
    : '• No zero-sale station actions are pending.';
  const nextForecastDate = previousDay ? formatDate(previousDay.date) : 'next day';
  const forecastLine = previousDay
    ? `• Forecast for ${nextForecastDate}: *${formatLitres(previousDay.predicted_qty)}*${forecastRange}.`
    : '• Next-day forecast is unavailable.';

  const lines = [
    title,
    '',
    '🟢 *PERFORMANCE*',
    `• Network sales: *${formatLitres(telemetry.total_sale_qty)}* | Collection: *₹${formatNumber(telemetry.total_collection)}*`,
    `• Realization: *₹${telemetry.effective_rsp.toFixed(2)}/L* | vs 7-day average: *${salesChange}* | Reporting: *${telemetry.stations_with_sale}/${telemetry.stations_total}* | Top-10 share: *${topTenShare}*`,
    '',
    '🟠 *EXCEPTIONS*',
    `• Zero-sale stations: *${telemetry.zero_sale_count}*${zeroSaleBreakdown ? ` — ${zeroSaleBreakdown.split(', ').map((item) => `*${item}*`).join(', ')}` : telemetry.zero_sale_count ? ' — reason breakdown unavailable' : ''}.`,
    `• Stock risk: *${critical.length} CRITICAL* (<1 day), *${highRisk.length} HIGH* (1–2 days), ${monitor.length} monitor (2–3 days).`,
    `• Declines: ${severeDeclines === undefined ? 'data unavailable' : `*${severeDeclines} of ${topDecliningStations} stations* are down *48%+* vs 3-month average`}.`,
    '',
    '🔴 *TODAY’S ACTIONS*',
    actionLine,
    zeroSaleActionLine,
    '',
    `🔵 *NEXT-DAY FORECAST — ${nextForecastDate}*`,
    forecastLine,
    `• ${mapeSummary.replace(/MAPE (\d+(?:\.\d+)?%)/, 'MAPE *$1*')} Planning input, *not a commitment*; excludes live price and station-availability changes.`,
  ];

  return { title, dateLabel, text: lines.join('\n') };
}
