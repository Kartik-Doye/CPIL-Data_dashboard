import nodemailer from 'nodemailer';
import type {
  ExecutiveTelemetry,
  ForecastPoint,
  ForecastResult,
  StockoutRiskStation,
} from '../types.js';

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
    forecast: Array<Pick<ForecastPoint, 'date' | 'predicted_qty'>>;
  };
  stockout_risk_stations: Array<Pick<StockoutRiskStation, 'code' | 'name' | 'days_left'>>;
};

const number = (value: number) => value.toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function buildExecutiveEmail(telemetry: ExecutiveEmailTelemetry) {
  const paytmShare = telemetry.total_collection > 0
    ? (telemetry.total_paytm_collection / telemetry.total_collection) * 100
    : 0;
  const nextForecast = telemetry.forecast.forecast[0];
  const mape = telemetry.forecast.mape_ensemble;
  const historicalAccuracy = mape === null || !Number.isFinite(mape)
    ? 'Not available yet'
    : `${Math.max(0, 100 - mape).toFixed(1)}% (MAPE ${mape.toFixed(1)}%, ${telemetry.forecast.backtest_days ?? 0} scored days)`;
  const stockoutStations = telemetry.stockout_risk_stations.slice(0, 3);
  const stockoutSummary = stockoutStations.length
    ? stockoutStations.map((station) => `${station.name} (${station.code}, ${station.days_left.toFixed(1)} days)`).join('; ')
    : 'None reported';

  const text = [
    'Dear Management Team,',
    '',
    `Operational summary for ${telemetry.date}:`,
    '',
    'SALES & COLLECTIONS',
    `• Total sales: ${number(telemetry.total_sale_qty)} L`,
    `• Collections: ₹${number(telemetry.total_collection)} (effective rate ₹${telemetry.effective_rsp.toFixed(2)}/L)`,
    `• Digital / Paytm: ₹${number(telemetry.total_paytm_collection)} (${paytmShare.toFixed(2)}% of collections)`,
    `• Free sale: ${number(telemetry.total_free_sale_litres)} L`,
    '',
    'NETWORK & OUTLOOK',
    `• Stations reporting sales: ${telemetry.stations_with_sale}/${telemetry.stations_total}; zero-sale: ${telemetry.zero_sale_count}`,
    `• Next-day forecast${nextForecast ? ` (${nextForecast.date})` : ''}: ${nextForecast ? `${number(nextForecast.predicted_qty)} L` : 'Not available'}`,
    `• 7-day forecast total: ${number(telemetry.forecast.predicted_total_7d)} L`,
    `• Historical validation accuracy: ${historicalAccuracy} (historical performance, not a guarantee)`,
    '',
    'PRIORITY ACTIONS',
    `• Stockout risks (<3 days): ${telemetry.stockout_risk_stations.length}${stockoutStations.length ? ` — ${stockoutSummary}` : ''}`,
    `• Zero-sale stations to review: ${telemetry.zero_sale_count}`,
    '',
    'Regards,',
    'GO Gas Operations Desk',
  ].join('\n');

  return {
    subject: `GO Gas Executive Daily Flash - ${telemetry.date}`,
    text,
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

export async function sendExecutiveBriefing(telemetry: ExecutiveEmailTelemetry) {
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
  });

  return { recipientCount: recipients.length };
}
