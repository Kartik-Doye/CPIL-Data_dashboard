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
  const forecastRange = forecast
    && Number.isFinite(forecast.p10)
    && Number.isFinite(forecast.p90)
    ? ` (range ${wholeNumberFormat(forecast.p10)}–${wholeNumberFormat(forecast.p90)} L)`
    : '';
  const forecastSummary = forecast
    ? `${wholeNumberFormat(forecast.predicted_qty)} L${forecastRange}`
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

  // Payment mix station insights (Cash-heavy vs Digital champions for Money Security Mission)
  const activePaymentStations = (telemetry.all_stations || []).filter(
    (s) => (s.net_total_collection || s.collection || 0) >= 1000,
  );
  const cashHeavyStations = [...activePaymentStations]
    .map((s) => {
      const coll = s.net_total_collection || s.collection || 0;
      const dig = s.paytm || 0;
      const cash = (s.net_cash_collection && s.net_cash_collection > 0)
        ? s.net_cash_collection
        : Math.max(0, coll - dig);
      const denom = Math.max(coll, dig + cash, 1);
      const cashPct = (cash / denom) * 100;
      const digPct = (dig / denom) * 100;
      return { s, coll, cash, dig, cashPct, digPct };
    })
    .sort((a, b) => b.cash - a.cash)
    .slice(0, 5);

  const digitalLeaderStations = [...activePaymentStations]
    .map((s) => {
      const coll = s.net_total_collection || s.collection || 0;
      const dig = s.paytm || 0;
      const cash = (s.net_cash_collection && s.net_cash_collection > 0)
        ? s.net_cash_collection
        : Math.max(0, coll - dig);
      const denom = Math.max(coll, dig + cash, 1);
      const digPct = (dig / denom) * 100;
      return { s, coll, dig, digPct };
    })
    .filter((x) => x.dig > 0)
    .sort((a, b) => b.digPct - a.digPct || b.dig - a.dig)
    .slice(0, 4);

  const paymentMixLines: string[] = [];
  if (telemetry.total_collection > 0) {
    paymentMixLines.push(
      '💳 *PAYMENT MIX & MONEY SECURITY MISSION*',
      `• *Digital Payment:* ${paytmShare} (₹${wholeNumberFormat(telemetry.total_paytm_collection)}) | *Cash Payment:* ${cashShare} (₹${wholeNumberFormat(totalCashVal)})`,
    );
    if (cashHeavyStations.length > 0) {
      paymentMixLines.push(
        `• *Taking Most Cash (Convert to Digital):* ${cashHeavyStations
          .map(
            (x) =>
              `${x.s.alds_name} (${x.s.tm || x.s.state}: ${x.cashPct.toFixed(0)}% Cash / ₹${wholeNumberFormat(x.cash)})`,
          )
          .join(' | ')}`,
      );
    }
    if (digitalLeaderStations.length > 0) {
      paymentMixLines.push(
        `• *Top Digital Payment Stations:* ${digitalLeaderStations
          .map(
            (x) =>
              `${x.s.alds_name} (${x.s.tm || x.s.state}: ${x.digPct.toFixed(0)}% Digital / ₹${wholeNumberFormat(x.dig)})`,
          )
          .join(' | ')}`,
      );
    }
  }

  // TMs & Stations NOT achieving their Daily Target (from TM Target Daily.xlsx)
  const tmsBelowTarget = (telemetry.tm_summary || [])
    .filter((t) => (t.daily_target ?? 0) > 0 && t.total_sale_qty < (t.daily_target ?? 0))
    .sort((a, b) => ((b.daily_target ?? 0) - b.total_sale_qty) - ((a.daily_target ?? 0) - a.total_sale_qty));

  const stationsBelowTarget = (telemetry.all_stations || [])
    .filter((s) => (s.daily_target ?? 0) > 0 && s.sale_qty < (s.daily_target ?? 0))
    .sort((a, b) => ((b.daily_target ?? 0) - b.sale_qty) - ((a.daily_target ?? 0) - a.sale_qty));

  const targetGapLines: string[] = [];
  if (tmsBelowTarget.length > 0 || stationsBelowTarget.length > 0) {
    const periodTag = telemetry.tm_target_meta?.period_label
      ? ` (${telemetry.tm_target_meta.period_label})`
      : '';
    targetGapLines.push(`🎯 *DAILY TARGET SHORTFALL${periodTag}*`);
    if (tmsBelowTarget.length > 0) {
      targetGapLines.push(
        `• *TMs Not Achieving Daily Target (${tmsBelowTarget.length}):* ${tmsBelowTarget
          .slice(0, 6)
          .map(
            (t) =>
              `${t.tm}: ${formatStationLitres(t.total_sale_qty)}/${formatStationLitres(t.daily_target || 0)} (${t.efficiency_pct}% | -${formatStationLitres((t.daily_target || 0) - t.total_sale_qty)})`,
          )
          .join(' | ')}${tmsBelowTarget.length > 6 ? ` +${tmsBelowTarget.length - 6} more` : ''}`,
      );
    }
    if (stationsBelowTarget.length > 0) {
      targetGapLines.push(
        `• *Stations Not Achieving Daily Target (${stationsBelowTarget.length}):* ${stationsBelowTarget
          .slice(0, 6)
          .map(
            (s) =>
              `${s.alds_name} (${s.tm}: ${wholeNumberFormat(s.sale_qty)}/${wholeNumberFormat(s.daily_target || 0)} L, ${s.target_achievement_pct ?? 0}%)`,
          )
          .join(' | ')}${stationsBelowTarget.length > 6 ? ` +${stationsBelowTarget.length - 6} more` : ''}`,
      );
    }
  }

  // TMs & Stations on a Declining Trend from Starting Month & Last 3 Months
  const decliningTms3m = (telemetry.tm_summary || [])
    .filter((t) => (t.three_month_change_pct ?? 0) < 0)
    .sort((a, b) => (a.three_month_change_pct ?? 0) - (b.three_month_change_pct ?? 0));

  const decliningStations3m = (telemetry.all_stations || [])
    .filter((s) => (s.starting_month_avg_daily ?? 0) > 0 && (s.three_month_change_pct ?? 0) <= -10)
    .sort((a, b) => (a.three_month_change_pct ?? 0) - (b.three_month_change_pct ?? 0));

  const threeMonthDeclineLines: string[] = [];
  if (decliningTms3m.length > 0 || decliningStations3m.length > 0) {
    const startLbl =
      decliningTms3m[0]?.starting_month_label ||
      decliningStations3m[0]?.starting_month_label ||
      'Start Month';
    const endLbl =
      decliningTms3m[0]?.latest_month_label ||
      decliningStations3m[0]?.latest_month_label ||
      'Month 3';
    threeMonthDeclineLines.push(`📉 *3-MONTH DECLINE TREND (${startLbl} → ${endLbl})*`);
    if (decliningTms3m.length > 0) {
      threeMonthDeclineLines.push(
        `• *Declining TMs (${decliningTms3m.length}):* ${decliningTms3m
          .slice(0, 5)
          .map(
            (t) =>
              `${t.tm}: ${wholeNumberFormat(t.starting_month_avg_daily || 0)}→${wholeNumberFormat(t.latest_month_avg_daily || 0)} L/d (${t.three_month_change_pct}%${t.is_consecutive_3m_decline ? ' consecutive↓' : ''})`,
          )
          .join(' | ')}`,
      );
    }
    if (decliningStations3m.length > 0) {
      threeMonthDeclineLines.push(
        `• *Declining Stations (${decliningStations3m.length}):* ${decliningStations3m
          .slice(0, 5)
          .map(
            (s) =>
              `${s.alds_name} (${s.tm}: ${wholeNumberFormat(s.starting_month_avg_daily || 0)}→${wholeNumberFormat(s.latest_month_avg_daily || 0)} L/d, ${s.three_month_change_pct}%)`,
          )
          .join(' | ')}${decliningStations3m.length > 5 ? ` +${decliningStations3m.length - 5} more` : ''}`,
      );
    }
  }

  const dryOutStations = telemetry.stockout_risk_stations
    .filter((station) => station.days_left < 1)
    .sort((a, b) => a.days_left - b.days_left);
  const dryOutLines = dryOutStations.length
    ? [
      '🚨 *DRY-OUT ALERT (<1 Day Stock)*',
      ...dryOutStations.slice(0, 5).map(
        (station) => `• ${station.name} (${station.state}) — ${station.days_left.toFixed(1)}d`,
      ),
      ...(dryOutStations.length > 5 ? [`• +${dryOutStations.length - 5} more critical stations`] : []),
    ]
    : ['🚨 *DRY-OUT ALERT (<1 Day Stock)*', '• None'];

  const zeroSaleGroups = new Map<string, string[]>([
    ['No Stock', []],
    ['No Report', []],
    ['Stopped', []],
    ['Verify', []],
  ]);
  for (const station of telemetry.zero_sale_stations) {
    const reason = classifyZeroSaleReason(station.tm, station.remark);
    const category = reason === 'Stock unavailable'
      ? 'No Stock'
      : reason === 'No salesperson' || reason === 'Data/reporting gap'
        ? 'No Report'
        : reason === 'Commercial stop' || reason === 'License/compliance stop'
          ? 'Stopped'
          : 'Verify';
    const stationName = station.tm && station.tm !== 'No TM'
      ? `${station.alds_name} (${station.tm})`
      : station.alds_name;
    zeroSaleGroups.get(category)?.push(stationName);
  }
  const zeroSaleLines = [...zeroSaleGroups]
    .filter(([, names]) => names.length > 0)
    .map(([category, names]) => `• *${category}:* ${formatLimitedNames(names, 4)}`);
  if (telemetry.zero_sale_count > telemetry.zero_sale_stations.length) {
    zeroSaleLines.push(`• Additional stations: ${telemetry.zero_sale_count - telemetry.zero_sale_stations.length} reason(s) unavailable`);
  }
  if (zeroSaleLines.length === 0 && telemetry.zero_sale_count > 0) {
    zeroSaleLines.push('• Reason details unavailable');
  }

  const sharpDrops = [...telemetry.top_declining_stations]
    .sort((a, b) => b.drop_pct - a.drop_pct)
    .slice(0, 3);
  const topStations = [...telemetry.top_performing_stations]
    .sort((a, b) => b.sale_qty - a.sale_qty)
    .slice(0, 3);

  const rspSuffix = telemetry.effective_rsp && telemetry.effective_rsp > 0
    ? ` | *Eff RSP:* ₹${telemetry.effective_rsp.toFixed(2)}/L${telemetry.collection_gap_per_l && telemetry.collection_gap_per_l > 0 ? ` (Gap ₹${telemetry.collection_gap_per_l.toFixed(2)})` : ''}`
    : '';
  const stateLine = telemetry.states_summary && telemetry.states_summary.length > 0
    ? [
      `🗺️ *STATE SHARE:* ${telemetry.states_summary
        .slice(0, 5)
        .map((st) => `${st.state}: ${formatStationLitres(st.total_sale_qty)}`)
        .join(' | ')}`,
    ]
    : [];

  return [
    `🔥 *GO GAS SALES | ${dateLabel}*`,
    `📊 *Total Sales:* ${wholeNumberFormat(telemetry.total_sale_qty)} L (${salesChange} vs 7d avg) | *Total Collection:* ₹${telemetry.total_collection.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `📈 *7-Day Average:* ${previousAverage === null ? 'N/A' : wholeNumberFormat(previousAverage) + ' L'} | *Forecast (${forecastDate}):* ${forecastSummary}`,
    `👥 *Active:* ${telemetry.stations_with_sale}/${telemetry.stations_total} | *Paytm Digital:* ${paytmShare} | *Cash:* ${cashShare}${rspSuffix}`,
    ...stateLine,
    ...paymentMixLines,
    ...targetGapLines,
    ...threeMonthDeclineLines,
    ...dryOutLines,
    `🛑 *ZERO SALE (${telemetry.zero_sale_count})*`,
    ...(zeroSaleLines.length ? zeroSaleLines : ['• None']),
    '📉 *SHARP DROPS*',
    ...(sharpDrops.length
      ? sharpDrops.map((station) => `• ${station.name} (${station.state}): ↓${Math.round(station.drop_pct)}%`)
      : ['• None']),
    `🏆 *TOP:* ${topStations.length
      ? topStations.map((station) => `${station.alds_name} (${formatStationLitres(station.sale_qty)})`).join(' | ')
      : 'No sales data'}`,
  ].join('\n');
}

export function buildTmPersonalizedWhatsAppBrief(
  tmName: string,
  stations: StationRecord[],
  dateStr: string,
  periodLabel = 'Monthly Daily Target',
): string {
  const tmStations = stations.filter((s) => (s.tm?.trim() || 'Unassigned') === tmName);
  const dateLabel = shortDateFormat(dateStr);
  const totalSale = tmStations.reduce((s, st) => s + st.sale_qty, 0);
  const dailyTgt = tmStations.reduce((s, st) => s + (st.daily_target || 0), 0);
  const achievePct = dailyTgt > 0 ? Number(((totalSale / dailyTgt) * 100).toFixed(1)) : 0;
  const variance = Math.round(totalSale - dailyTgt);

  const mtdSale = tmStations.reduce((s, st) => s + (st.mtd_sale_qty ?? st.sale_qty), 0);
  const monthlyTgt = tmStations.reduce((s, st) => s + (st.monthly_target ?? (st.daily_target || 0) * 30), 0);
  const mtdPct = monthlyTgt > 0 ? Number(((mtdSale / monthlyTgt) * 100).toFixed(1)) : 0;
  const askingRate = Math.round(tmStations.reduce((s, st) => s + (st.required_asking_rate_l_per_day ?? 0), 0));

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

  const cashHeavyStns = tmStations
    .filter((s) => (s.cash_pct || 0) >= 65 && (s.net_total_collection || s.collection || 0) >= 1000)
    .sort((a, b) => (b.net_cash_collection || 0) - (a.net_cash_collection || 0));

  const zeroStns = tmStations.filter((s) => s.sale_qty === 0);
  const stockoutStns = tmStations.filter((s) => s.days_left < 2.0);

  return [
    `📋 *GO GAS TERRITORY ACTION BRIEF — TM ${tmName} (${dateLabel})*`,
    `🎯 *Daily Target (${periodLabel}):* ${wholeNumberFormat(totalSale)} L / ${wholeNumberFormat(dailyTgt)} L (*${achievePct}%* | ${variance >= 0 ? '+' : ''}${wholeNumberFormat(variance)} L)`,
    `📅 *MTD Cumulative:* ${wholeNumberFormat(mtdSale)} L / ${wholeNumberFormat(monthlyTgt)} L (*${mtdPct}%* of Monthly Tgt) | *Required Asking Rate:* ${wholeNumberFormat(askingRate)} L/day`,
    `💳 *Payment Security:* *Digital ${digPct}%* (₹${wholeNumberFormat(totalDig)}) | *Cash ${cashPct}%* (₹${wholeNumberFormat(totalCash)})`,
    ...(belowTargetStns.length > 0
      ? [
          `⚠️ *Stations Below Daily Target (${belowTargetStns.length}/${tmStations.length}):*`,
          ...belowTargetStns.slice(0, 6).map(
            (s) =>
              `• ${s.alds_name}${s.ss_name ? ` [SS: ${s.ss_name}]` : ''}: ${wholeNumberFormat(s.sale_qty)} / ${wholeNumberFormat(s.daily_target || 0)} L (${s.target_achievement_pct ?? 0}%)`,
          ),
        ]
      : ['✅ *All Assigned Stations Met Their Daily Target Today!*']),
    ...(declining3mStns.length > 0
      ? [
          `📉 *3-Month Declining Stations (${declining3mStns.length}):*`,
          ...declining3mStns.slice(0, 5).map(
            (s) =>
              `• ${s.alds_name}: ${wholeNumberFormat(s.starting_month_avg_daily || 0)} → ${wholeNumberFormat(s.latest_month_avg_daily || 0)} L/d (${s.three_month_change_pct}%)`,
          ),
        ]
      : []),
    ...(cashHeavyStns.length > 0
      ? [
          `🏦 *Cash-Heavy Stations — Convert to Digital QR/UPI (${cashHeavyStns.length}):*`,
          ...cashHeavyStns.slice(0, 5).map(
            (s) =>
              `• ${s.alds_name}${s.ss_name ? ` [SS: ${s.ss_name}]` : ''}: *${s.cash_pct}% Cash* (₹${wholeNumberFormat(s.net_cash_collection || 0)})`,
          ),
        ]
      : []),
    ...(zeroStns.length > 0
      ? [
          `🛑 *Zero-Sale Stations (${zeroStns.length}):* ${zeroStns.map((s) => `${s.alds_name} (${s.remark || 'Verify'})`).join(', ')}`,
        ]
      : []),
    ...(stockoutStns.length > 0
      ? [
          `🚨 *Urgent Stockout Risk (<2d Cover):* ${stockoutStns.map((s) => `${s.alds_name} (${s.days_left}d)`).join(', ')}`,
        ]
      : []),
  ].join('\n');
}
