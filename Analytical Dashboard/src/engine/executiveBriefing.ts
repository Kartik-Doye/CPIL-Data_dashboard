import type {
  ExecutiveTelemetry,
  ForecastPoint,
  ForecastResult,
  StationRecord,
  StockoutRiskStation,
  TMSummary,
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
  total_paytm_collection?: number;
  total_cash_collection?: number;
  tm_summary?: TMSummary[];
  tm_target_meta?: ExecutiveTelemetry['tm_target_meta'];
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
    ? `• Resolve ${telemetry.zero_sale_count} zero-sale station(s) by EOD; assign owners immediately and escalate unassigned critical actions or unresolved sale stops/stock gaps to Regional Managers.`
    : '• No zero-sale station actions are pending.';
  const nextForecastDate = previousDay ? formatDate(previousDay.date) : 'next day';
  const forecastLine = previousDay
    ? `• Forecast for ${nextForecastDate}: *${formatLitres(previousDay.predicted_qty)}*${forecastRange}.`
    : '• Next-day forecast is unavailable.';

  const paytmColl = telemetry.total_paytm_collection ?? 0;
  const cashColl =
    telemetry.total_cash_collection !== undefined && telemetry.total_cash_collection > 0
      ? telemetry.total_cash_collection
      : Math.max(0, telemetry.total_collection - paytmColl);
  const digitalPctStr = telemetry.total_collection > 0
    ? `${((paytmColl / telemetry.total_collection) * 100).toFixed(1)}%`
    : 'N/A';
  const cashPctStr = telemetry.total_collection > 0
    ? `${((cashColl / telemetry.total_collection) * 100).toFixed(1)}%`
    : 'N/A';

  const activePaymentStations = (telemetry.all_stations || []).filter(
    (s) => (s.net_total_collection || s.collection || 0) >= 1000,
  );
  const cashHeavyList = [...activePaymentStations]
    .map((s) => {
      const coll = s.net_total_collection || s.collection || 0;
      const dig = s.paytm || 0;
      const cash = s.net_cash_collection && s.net_cash_collection > 0 ? s.net_cash_collection : Math.max(0, coll - dig);
      const denom = Math.max(coll, dig + cash, 1);
      return { s, cash, cashPct: (cash / denom) * 100 };
    })
    .sort((a, b) => b.cash - a.cash)
    .slice(0, 5);
  const digitalLeaderList = [...activePaymentStations]
    .map((s) => {
      const coll = s.net_total_collection || s.collection || 0;
      const dig = s.paytm || 0;
      const cash = s.net_cash_collection && s.net_cash_collection > 0 ? s.net_cash_collection : Math.max(0, coll - dig);
      const denom = Math.max(coll, dig + cash, 1);
      return { s, dig, digPct: (dig / denom) * 100 };
    })
    .filter((x) => x.dig > 0)
    .sort((a, b) => b.digPct - a.digPct || b.dig - a.dig)
    .slice(0, 5);

  const paymentLines: string[] = [];
  if (telemetry.total_collection > 0) {
    paymentLines.push(
      `▸ Payment Mix (Money Security Mission): *Digital ${digitalPctStr}* (₹${formatNumber(paytmColl)}) vs *Cash ${cashPctStr}* (₹${formatNumber(cashColl)}).`,
    );
    if (cashHeavyList.length > 0) {
      paymentLines.push(
        `▸ Stations taking most cash (priority to convert to digital): ${cashHeavyList
          .map((x) => `*${x.s.alds_name}* (${getOwner(x.s)}: *${x.cashPct.toFixed(0)}% Cash* / ₹${formatNumber(x.cash)})`)
          .join(', ')}.`,
      );
    }
    if (digitalLeaderList.length > 0) {
      paymentLines.push(
        `▸ Top digital payment stations: ${digitalLeaderList
          .map((x) => `*${x.s.alds_name}* (${getOwner(x.s)}: *${x.digPct.toFixed(0)}% Digital* / ₹${formatNumber(x.dig)})`)
          .join(', ')}.`,
      );
    }
  }

  // TMs & Stations below daily target & 3-month declining trend
  const tmsBelowTarget = (telemetry.tm_summary || [])
    .filter((t) => (t.daily_target ?? 0) > 0 && t.total_sale_qty < (t.daily_target ?? 0))
    .sort((a, b) => ((b.daily_target ?? 0) - b.total_sale_qty) - ((a.daily_target ?? 0) - a.total_sale_qty));
  const stationsBelowTarget = (telemetry.all_stations || [])
    .filter((s) => (s.daily_target ?? 0) > 0 && s.sale_qty < (s.daily_target ?? 0))
    .sort((a, b) => ((b.daily_target ?? 0) - b.sale_qty) - ((a.daily_target ?? 0) - a.sale_qty));
  const decliningTms3m = (telemetry.tm_summary || [])
    .filter((t) => (t.three_month_change_pct ?? 0) < 0)
    .sort((a, b) => (a.three_month_change_pct ?? 0) - (b.three_month_change_pct ?? 0));
  const decliningStations3m = (telemetry.all_stations || [])
    .filter((s) => (s.starting_month_avg_daily ?? 0) > 0 && (s.three_month_change_pct ?? 0) <= -10)
    .sort((a, b) => (a.three_month_change_pct ?? 0) - (b.three_month_change_pct ?? 0));

  const targetAndTrendLines: string[] = [];
  if (tmsBelowTarget.length > 0) {
    targetAndTrendLines.push(
      `▸ TMs not achieving daily target (*${tmsBelowTarget.length}*): ${tmsBelowTarget
        .slice(0, 6)
        .map((t) => `*${t.tm}* (${formatNumber(t.total_sale_qty)} / ${formatNumber(t.daily_target || 0)} L, *${t.efficiency_pct}%*)`)
        .join(', ')}${tmsBelowTarget.length > 6 ? `, +${tmsBelowTarget.length - 6} more` : ''}.`,
    );
  }
  if (stationsBelowTarget.length > 0) {
    targetAndTrendLines.push(
      `▸ Stations not achieving daily target (*${stationsBelowTarget.length}*): ${stationsBelowTarget
        .slice(0, 6)
        .map((s) => `*${s.alds_name}* (${getOwner(s)}: ${formatNumber(s.sale_qty)} / ${formatNumber(s.daily_target || 0)} L, *${s.target_achievement_pct ?? 0}%*)`)
        .join(', ')}${stationsBelowTarget.length > 6 ? `, +${stationsBelowTarget.length - 6} more` : ''}.`,
    );
  }
  if (decliningTms3m.length > 0) {
    const startLbl = decliningTms3m[0]?.starting_month_label || 'Start Month';
    const endLbl = decliningTms3m[0]?.latest_month_label || 'Month 3';
    targetAndTrendLines.push(
      `▸ TMs on 3-month declining trend (${startLbl} → ${endLbl}, *${decliningTms3m.length}*): ${decliningTms3m
        .slice(0, 6)
        .map((t) => `*${t.tm}* (${formatNumber(t.starting_month_avg_daily || 0)} → ${formatNumber(t.latest_month_avg_daily || 0)} L/d, *${t.three_month_change_pct}%*)`)
        .join(', ')}.`,
    );
  }
  if (decliningStations3m.length > 0) {
    const startLbl = decliningStations3m[0]?.starting_month_label || 'Start Month';
    const endLbl = decliningStations3m[0]?.latest_month_label || 'Month 3';
    targetAndTrendLines.push(
      `▸ Stations on 3-month declining trend (${startLbl} → ${endLbl}, *${decliningStations3m.length}*): ${decliningStations3m
        .slice(0, 6)
        .map((s) => `*${s.alds_name}* (${getOwner(s)}: ${formatNumber(s.starting_month_avg_daily || 0)} → ${formatNumber(s.latest_month_avg_daily || 0)} L/d, *${s.three_month_change_pct}%*)`)
        .join(', ')}${decliningStations3m.length > 6 ? `, +${decliningStations3m.length - 6} more` : ''}.`,
    );
  }

  const lines = [
    title,
    '',
    '🟢 *PERFORMANCE*',
    `• Network sales: *${formatLitres(telemetry.total_sale_qty)}* | Collection: *₹${formatNumber(telemetry.total_collection)}*`,
    `• Realization: *₹${telemetry.effective_rsp.toFixed(2)}/L* | vs 7-day average: *${salesChange}* | Reporting: *${telemetry.stations_with_sale}/${telemetry.stations_total}* | Top-10 share: *${topTenShare}*`,
    ...paymentLines,
    '',
    '🟠 *EXCEPTIONS*',
    `• Zero-sale stations: *${telemetry.zero_sale_count}*${zeroSaleBreakdown ? ` — ${zeroSaleBreakdown.split(', ').map((item) => `*${item}*`).join(', ')}` : telemetry.zero_sale_count ? ' — reason breakdown unavailable' : ''}.`,
    `• Stock risk: *${critical.length} CRITICAL* (<1 day), *${highRisk.length} HIGH* (1–2 days), ${monitor.length} monitor (2–3 days).`,
    `• Declines: ${severeDeclines === undefined ? 'data unavailable' : `*${severeDeclines} of ${topDecliningStations} stations* are down *48%+* vs 3-month average`}.`,
    ...targetAndTrendLines,
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
