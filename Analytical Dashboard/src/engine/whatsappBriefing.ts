import type { ExecutiveTelemetry, StationRecord, TMSummary } from '../types.js';
import { classifyZeroSaleReason } from './formatting.js';

type WhatsAppSalesTelemetry = Pick<
  ExecutiveTelemetry,
  | 'date'
  | 'total_sale_qty'
  | 'total_collection'
  | 'total_paytm_collection'
  | 'stations_with_sale'
  | 'stations_total'
  | 'zero_sale_count'
  | 'forecast'
> & {
  total_cash_collection?: number;
  effective_rsp?: number;
  collection_gap_per_l?: number;
  states_summary?: ExecutiveTelemetry['states_summary'];
  tm_summary?: TMSummary[];
  all_stations?: StationRecord[];
  tm_target_meta?: ExecutiveTelemetry['tm_target_meta'];
  history_30d?: ExecutiveTelemetry['history_30d'];
  stockout_risk_stations: Array<Pick<ExecutiveTelemetry['stockout_risk_stations'][number], 'name' | 'state' | 'days_left'>>;
  zero_sale_stations: Array<Pick<StationRecord, 'alds_name' | 'state' | 'tm' | 'remark'>>;
  top_declining_stations: Array<Pick<ExecutiveTelemetry['top_declining_stations'][number], 'name' | 'state' | 'drop_pct'>>;
  top_performing_stations: Array<Pick<StationRecord, 'alds_name' | 'sale_qty'>>;
};

const wholeNumberFormat = (value: number) => value.toLocaleString('en-IN', {
  maximumFractionDigits: 0,
});

const shortDateFormat = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    });
};

const formatLimitedNames = (
  names: string[],
  limit: number,
) => {
  const visibleNames = names.slice(0, limit);
  const remaining = names.length - visibleNames.length;
  return `${visibleNames.join(', ')}${remaining > 0 ? `, +${remaining} more` : ''}`;
};

function formatStationLitres(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K L` : `${wholeNumberFormat(value)} L`;
}

export function countMessageWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function buildExecutiveWhatsAppMessage(telemetry: WhatsAppSalesTelemetry): string {
  const dateLabel = shortDateFormat(telemetry.date);
  const previousDays = (telemetry.history_30d || [])
    .filter((point) => point.date < telemetry.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);
  const previousAverage = previousDays.length === 7
    ? previousDays.reduce((sum, point) => sum + point.sale_qty, 0) / previousDays.length
    : null;
  const changePct = previousAverage && previousAverage > 0
    ? (telemetry.total_sale_qty / previousAverage - 1) * 100
    : null;
  const salesChange = changePct === null
    ? 'N/A'
    : `${changePct > 0 ? '↑' : changePct < 0 ? '↓' : '→'}${Math.abs(changePct).toFixed(1)}%`;

  const forecast = telemetry.forecast.forecast[0];
  const forecastDate = forecast ? shortDateFormat(forecast.date) : 'unavailable';
  const forecast7dTotal = telemetry.forecast.predicted_total_7d || 0;
  const allStationsList = telemetry.all_stations || [];
  const totalProjEom = allStationsList.reduce((s, st) => s + (st.projected_eom_sale_qty || 0), 0);
  const totalMonthlyTgt = allStationsList.reduce((s, st) => s + (st.monthly_target || 0), 0);
  const networkEomPct = totalMonthlyTgt > 0 ? Number(((totalProjEom / totalMonthlyTgt) * 100).toFixed(1)) : null;
  const totalScheme = allStationsList.reduce((s, st) => s + (st.scheme || 0), 0);
  const totalDiscount = allStationsList.reduce((s, st) => s + (st.discount || st.scheme || 0), 0);
  const effectiveDiscount = totalDiscount > 0 ? totalDiscount : totalScheme;
  const discountPerL = telemetry.total_sale_qty > 0 && effectiveDiscount > 0
    ? (effectiveDiscount / telemetry.total_sale_qty).toFixed(2)
    : null;

  const forecastSummary = forecast
    ? `${wholeNumberFormat(forecast.predicted_qty)} L${forecast7dTotal > 0 ? ` | *7d Proj:* ${formatStationLitres(forecast7dTotal)}` : ''}${networkEomPct !== null && networkEomPct > 0 ? ` | *EOM Proj:* ${networkEomPct}%` : ''}`
    : 'Unavailable';

  const paytmPctNum = telemetry.total_collection > 0
    ? (telemetry.total_paytm_collection / telemetry.total_collection) * 100
    : null;
  const totalCashVal =
    telemetry.total_cash_collection !== undefined && telemetry.total_cash_collection > 0
      ? telemetry.total_cash_collection
      : Math.max(0, telemetry.total_collection - telemetry.total_paytm_collection);
  const cashPctNum = telemetry.total_collection > 0
    ? (totalCashVal / telemetry.total_collection) * 100
    : null;
  const paytmShare = paytmPctNum !== null ? `${paytmPctNum.toFixed(1)}%` : 'N/A';
  const cashShare = cashPctNum !== null ? `${cashPctNum.toFixed(1)}%` : 'N/A';

  const activePaymentStations = allStationsList.filter(
    (s) => (s.net_total_collection || s.collection || 0) >= 1000,
  );
  const topCashStation = [...activePaymentStations]
    .map((s) => {
      const coll = s.net_total_collection || s.collection || 0;
      const dig = s.paytm || 0;
      const cash = s.net_cash_collection && s.net_cash_collection > 0
        ? s.net_cash_collection
        : Math.max(0, coll - dig);
      const denom = Math.max(coll, dig + cash, 1);
      return { name: s.alds_name, cash, cashPct: Math.round((cash / denom) * 100) };
    })
    .sort((a, b) => b.cash - a.cash)[0];

  const tmsBelowTarget = (telemetry.tm_summary || [])
    .filter((t) => (t.daily_target ?? 0) > 0 && t.total_sale_qty < (t.daily_target ?? 0))
    .sort((a, b) => ((b.daily_target ?? 0) - b.total_sale_qty) - ((a.daily_target ?? 0) - a.total_sale_qty));
  const stationsBelowTarget = allStationsList
    .filter((s) => (s.daily_target ?? 0) > 0 && s.sale_qty < (s.daily_target ?? 0))
    .sort((a, b) => ((b.daily_target ?? 0) - b.sale_qty) - ((a.daily_target ?? 0) - a.sale_qty));
  const decliningStations3m = allStationsList
    .filter((s) => (s.starting_month_avg_daily ?? 0) > 0 && (s.three_month_change_pct ?? 0) <= -10)
    .sort((a, b) => (a.three_month_change_pct ?? 0) - (b.three_month_change_pct ?? 0));

  const dryOutStations = telemetry.stockout_risk_stations
    .filter((station) => station.days_left < 1)
    .sort((a, b) => a.days_left - b.days_left);

  const topStation = [...telemetry.top_performing_stations]
    .sort((a, b) => b.sale_qty - a.sale_qty)[0];

  // Build top 2 priority TMs with their top lagging station(s)
  const priorityTmSnippets = tmsBelowTarget.slice(0, 2).map((t) => {
    const tmLagStns = stationsBelowTarget.filter((s) => (s.tm?.trim() || 'Unassigned') === t.tm);
    const topStn = tmLagStns[0];
    return topStn
      ? `TM ${t.tm} [${topStn.alds_name}: ${formatStationLitres(topStn.sale_qty)}/${formatStationLitres(topStn.daily_target || 0)}]`
      : `TM ${t.tm} (${formatStationLitres(t.total_sale_qty)}/${formatStationLitres(t.daily_target || 0)})`;
  });

  const targetSummaryLine =
    tmsBelowTarget.length > 0 || stationsBelowTarget.length > 0
      ? `🎯 *Target & 3M Review:* ${tmsBelowTarget.length} TMs, ${stationsBelowTarget.length} stns below daily target${priorityTmSnippets.length > 0 ? ` (${priorityTmSnippets.join('; ')})` : ''}${decliningStations3m.length > 0 ? ` | 3M Decline: ${decliningStations3m.length} stns` : ''}.`
      : null;

  const dryOutText = dryOutStations.length > 0
    ? `${dryOutStations[0].name} (${dryOutStations[0].days_left.toFixed(1)}d)${dryOutStations.length > 1 ? ` +${dryOutStations.length - 1}` : ''}`
    : 'None';

  const topText = topStation
    ? `${topStation.alds_name} (${formatStationLitres(topStation.sale_qty)})`
    : 'No sales data';

  return [
    `🙏 *GO GAS EXECUTIVE BRIEF | ${dateLabel}*`,
    `Respected Leadership, sharing today's analytical summary:`,
    `📊 *Sales:* ${wholeNumberFormat(telemetry.total_sale_qty)} L (${salesChange} vs 7d) | *Collection:* ₹${wholeNumberFormat(telemetry.total_collection)}${effectiveDiscount > 0 ? ` | *Discount:* ₹${wholeNumberFormat(effectiveDiscount)}${discountPerL ? ` (₹${discountPerL}/L)` : ''}` : ''}`,
    `💳 *Payment Mix:* Digital ${paytmShare} | Cash ${cashShare}${topCashStation ? ` (Top Cash: ${topCashStation.name} ${topCashStation.cashPct}%)` : ''}`,
    `📈 *Active:* ${telemetry.stations_with_sale}/${telemetry.stations_total} | *Forecast (${forecastDate}):* ${forecastSummary}`,
    ...(targetSummaryLine ? [targetSummaryLine] : []),
    `🚨 *Dry-Out (<1d):* ${dryOutText} | *Zero-Sale:* ${telemetry.zero_sale_count} | 🏆 *Top:* ${topText}`,
    `Kindly review for action. Warm regards, *GO Gas Analytics Desk*`,
  ].join('\n');
}

export function buildTmPersonalizedWhatsAppBrief(
  tmName: string,
  stations: StationRecord[],
  dateStr: string,
  _periodLabel = 'Monthly Daily Target',
): string {
  const tmStations = stations.filter((s) => (s.tm?.trim() || 'Unassigned') === tmName);
  const dateLabel = shortDateFormat(dateStr);
  const totalSale = tmStations.reduce((s, st) => s + st.sale_qty, 0);
  const dailyTgt = tmStations.reduce((s, st) => s + (st.daily_target || 0), 0);
  const achievePct = dailyTgt > 0 ? Number(((totalSale / dailyTgt) * 100).toFixed(1)) : 0;

  const mtdSale = tmStations.reduce((s, st) => s + (st.mtd_sale_qty ?? st.sale_qty), 0);
  const monthlyTgt = tmStations.reduce((s, st) => s + (st.monthly_target ?? (st.daily_target || 0) * 30), 0);
  const mtdPct = monthlyTgt > 0 ? Number(((mtdSale / monthlyTgt) * 100).toFixed(1)) : 0;
  const askingRate = Math.round(tmStations.reduce((s, st) => s + (st.required_asking_rate_l_per_day ?? 0), 0));

  const nextDayProj = Math.round(
    tmStations.reduce((s, st) => s + (st.rolling_7d_burn || st.sale_qty || 0), 0),
  );
  const proj7dTotal = nextDayProj * 7;
  const projEomTotal = tmStations.reduce((s, st) => s + (st.projected_eom_sale_qty || 0), 0);
  const eomPct = monthlyTgt > 0 ? Number(((projEomTotal / monthlyTgt) * 100).toFixed(1)) : achievePct;

  const totalColl = tmStations.reduce((s, st) => s + (st.net_total_collection || st.collection || 0), 0);
  const totalDig = tmStations.reduce((s, st) => s + (st.paytm || 0), 0);
  const totalCash = tmStations.reduce(
    (s, st) => s + ((st.net_cash_collection && st.net_cash_collection > 0) ? st.net_cash_collection : Math.max(0, (st.net_total_collection || st.collection || 0) - (st.paytm || 0))),
    0,
  );
  const denom = Math.max(1, totalColl, totalDig + totalCash);
  const digPct = totalColl > 0 ? Number(((totalDig / denom) * 100).toFixed(1)) : 0;
  const cashPct = totalColl > 0 ? Number(((totalCash / denom) * 100).toFixed(1)) : 0;

  const belowTargetStns = tmStations
    .filter((s) => (s.daily_target || 0) > 0 && s.sale_qty < (s.daily_target || 0))
    .sort((a, b) => ((b.daily_target || 0) - b.sale_qty) - ((a.daily_target || 0) - a.sale_qty));

  const declining3mStns = tmStations
    .filter((s) => (s.starting_month_avg_daily || 0) > 0 && (s.three_month_change_pct || 0) < 0)
    .sort((a, b) => (a.three_month_change_pct || 0) - (b.three_month_change_pct || 0));

  const topLaggingList = belowTargetStns
    .slice(0, 2)
    .map(
      (s) =>
        `${s.alds_name}${s.ss_name ? ` [SS: ${s.ss_name}]` : ''}: ${wholeNumberFormat(s.sale_qty)}/${wholeNumberFormat(s.daily_target || 0)} L`,
    )
    .join(', ');

  const focusSummary = belowTargetStns.length > 0
    ? `${belowTargetStns.length}/${tmStations.length} stns below target (${topLaggingList})${declining3mStns.length > 0 ? ` | 3M Decline: ${declining3mStns.length}` : ''}.`
    : 'All assigned stations achieved their daily target today.';

  return [
    `🙏 *GO GAS TERRITORY RESEARCH BRIEF — TM ${tmName} (${dateLabel})*`,
    `Dear *${tmName}*, sharing your concise daily insights:`,
    `🎯 *Daily Target:* ${wholeNumberFormat(totalSale)} / ${wholeNumberFormat(dailyTgt)} L (*${achievePct}%*) | *MTD:* ${mtdPct}% (Required: *${wholeNumberFormat(askingRate)} L/day*)`,
    `📈 *Projection:* Next-Day ~*${wholeNumberFormat(nextDayProj)} L* | 7d ~*${formatStationLitres(proj7dTotal)}* | EOM Landing: *${eomPct}%*`,
    `💳 *Payment Security:* Digital *${digPct}%* | Cash *${cashPct}%* (₹${wholeNumberFormat(totalCash)})`,
    `⚠️ *Priority Focus:* ${focusSummary}`,
    `Kindly guide your team on target pace & digital QR adoption. Warm regards, *GO Gas Analytics*`,
  ].join('\n');
}
