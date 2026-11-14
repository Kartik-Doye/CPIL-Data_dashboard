import type { ExecutiveTelemetry, StationRecord } from '../types.js';
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

  const paytmShare = telemetry.total_collection > 0
    ? `${(telemetry.total_paytm_collection / telemetry.total_collection * 100).toFixed(1)}%`
    : 'N/A';

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
    const stationName = category === 'Stopped' && station.tm && station.tm !== 'No TM'
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

  return [
    `🔥 *GO GAS SALES | ${dateLabel}*`,
    `📊 *Total Sales:* ${wholeNumberFormat(telemetry.total_sale_qty)} L (${salesChange} vs 7d avg) | *Total Collection:* ₹${telemetry.total_collection.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `📈 *7-Day Average:* ${previousAverage === null ? 'N/A' : wholeNumberFormat(previousAverage) + ' L'} | *Forecast (${forecastDate}):* ${forecastSummary}`,
    `👥 *Active:* ${telemetry.stations_with_sale}/${telemetry.stations_total} | *Paytm Digital:* ${paytmShare}`,
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
