import nodemailer from 'nodemailer';
import { fileURLToPath } from 'node:url';
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

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export function buildExecutiveEmail(telemetry: ExecutiveEmailTelemetry) {
  const paytmShare = telemetry.total_collection > 0
    ? (telemetry.total_paytm_collection / telemetry.total_collection) * 100
    : 0;
  const nextForecast = telemetry.forecast.forecast[0];
  const mape = telemetry.forecast.mape_ensemble;
  const historicalAccuracy = mape === null || !Number.isFinite(mape)
    ? 'Not available yet'
    : `${Math.max(0, 100 - mape).toFixed(1)}% (MAPE ${mape.toFixed(1)}%, ${telemetry.forecast.backtest_days ?? 0} scored days)`;

  const text = [
    'Dear Management Team,',
    '',
    `Please find the operational summary for ${telemetry.date}.`,
    '',
    `Sales totalled ${number(telemetry.total_sale_qty)} L across ${telemetry.stations_with_sale} of ${telemetry.stations_total} stations. Collections were ₹${number(telemetry.total_collection)} (effective rate ₹${telemetry.effective_rsp.toFixed(2)}/L), including Paytm collections of ₹${number(telemetry.total_paytm_collection)} (${paytmShare.toFixed(2)}%) and free sales of ${number(telemetry.total_free_sale_litres)} L.`,
    '',
    `The next-day forecast${nextForecast ? ` for ${nextForecast.date}` : ''} is ${nextForecast ? `${number(nextForecast.predicted_qty)} L` : 'not available'}, and the seven-day forecast is ${number(telemetry.forecast.predicted_total_7d)} L. Historical forecast accuracy is ${historicalAccuracy}; this reflects past performance and is not a guarantee.`,
    '',
    `${telemetry.stockout_risk_stations.length} station(s) are at stockout risk (under three days of stock), and ${telemetry.zero_sale_count} reported no sales. Kindly review and take appropriate action.`,
    '',
    'Thank you for your continued support.',
    '',
    'Thanks,',
    'Kartik Doye',
    'Data Analyst (Sales & Marketing) - ALDS',
    'Phone: 8087018975',
    'Email: kartikdoye@confidencegroup.co',
    'Website: https://www.confidencegroup.co/',
    'Confidence Petroleum India Limited',
    '34A Confidence Tower, Central Bazar Road, Ramdaspeth, Nagpur - 440010',
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
    attachments: [{
      filename: 'company_logo.jpeg',
      path: fileURLToPath(new URL('../../company_logo.jpeg', import.meta.url)),
      cid: 'company-logo',
    }],
  });

  return { recipientCount: recipients.length };
}
