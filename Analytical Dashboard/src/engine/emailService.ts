/**
 * Zero-Cost Executive Morning Email Briefing Engine.
 * 
 * Generates and delivers a concise, professional daily executive email
 * summarizing network volume, revenue, next-day demand forecast, critical
 * stockout warnings, and zero-sale stations without spending a single penny.
 * 
 * Delivery channels supported:
 * 1. Standard free Gmail SMTP (smtp.gmail.com) via Google App Password
 * 2. Any corporate / Google Workspace SMTP server
 */
import nodemailer from 'nodemailer';
import { ExecutiveTelemetry } from '../types.js';
import {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_TO,
  SMTP_FROM_NAME,
  APP_BASE_URL,
  APP_NAME,
  EMAIL_SCHEDULE_LABEL,
} from './config.js';

export interface EmailBriefingContent {
  subject: string;
  plainText: string;
  html: string;
}

const formatNumber = (val: number, decimals = 2) =>
  val.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const formatCurrency = (val: number) => {
  if (val >= 10000000) {
    return `₹${(val / 10000000).toFixed(2)} Cr`;
  }
  if (val >= 100000) {
    return `₹${(val / 100000).toFixed(2)} Lakh`;
  }
  return `₹${formatNumber(val, 0)}`;
};

/**
 * Builds a short, high-priority professional briefing focused strictly on executive essentials.
 */
export function generateProfessionalBriefing(data: ExecutiveTelemetry): EmailBriefingContent {
  const dateStr = data.date || new Date().toISOString().slice(0, 10);
  const totalVolume = formatNumber(data.total_sale_qty);
  const totalRevenue = formatCurrency(data.total_collection);
  const effectiveRsp = `₹${(data.effective_rsp || 0).toFixed(2)}`;
  const nominalRsp = `₹${(data.average_rsp || 0).toFixed(2)}`;
  const activeCount = data.stations_with_sale;
  const totalCount = data.stations_total;
  const zeroCount = data.zero_sale_count;

  const nextForecast = data.forecast?.forecast?.[0];
  const tomorrowForecastStr = nextForecast ? `${formatNumber(nextForecast.predicted_qty)} L` : 'N/A';
  const sevenDayTotalStr = data.forecast?.predicted_total_7d ? `${formatNumber(data.forecast.predicted_total_7d)} L` : 'N/A';

  const criticalStockouts = (data.stockout_risk_stations || []).filter(s => s.days_left < 3.0);
  const zeroSaleList = data.zero_sale_stations || [];

  const subject = `[GO Gas Executive Briefing] Operational Snapshot · ${dateStr} · ${totalVolume} L (${totalRevenue})`;

  // 1. Plain Text Version (Compact & Professional)
  const plainText = `GO GAS EXECUTIVE BRIEFING · DAILY OPERATIONAL SUMMARY
Operational Date: ${dateStr}
Generated At: ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST
───────────────────────────────────────────────────────────────────

1. NETWORK SALES & REVENUE SNAPSHOT
• Total Sales Volume   : ${totalVolume} Litres
• Gross Collections    : ${totalRevenue} (₹${formatNumber(data.total_collection, 0)})
• Effective Realization : ${effectiveRsp}/L (Nominal RSP: ${nominalRsp}/L)
• Collection Gap       : ₹${(data.collection_gap_per_l || 0).toFixed(2)}/L
• Reporting Network    : ${activeCount}/${totalCount} Active Stations (${zeroCount} Zero-Sale)
• Free Sale (Testing)  : ${formatNumber(data.total_free_sale_litres || 0)} L (${formatCurrency(data.total_free_sale_rupees || 0)})

2. DEMAND OUTLOOK (AI ENSEMBLE FORECAST)
• Tomorrow's Predicted Volume : ${tomorrowForecastStr}
• 7-Day Projected Demand      : ${sevenDayTotalStr}
• Model Confidence / Quality  : ${data.forecast?.insufficient ? 'Baseline model active' : 'Historical validation active'}

3. IMMEDIATE ACTION ITEMS: CRITICAL INVENTORY (<3 DAYS REMAINING)
${
  criticalStockouts.length > 0
    ? criticalStockouts
        .slice(0, 8)
        .map(
          (s, i) =>
            `${i + 1}. [${s.code}] ${s.name} (${s.state}): ${s.days_left}d stock left | Stock: ${formatNumber(s.stock_ltr, 0)} L | Burn: ${formatNumber(s.daily_burn_ltr, 0)} L/d`
        )
        .join('\n')
    : '• No critical stockouts reported. All active stations maintain >= 3 days fuel buffer.'
}
${criticalStockouts.length > 8 ? `...and ${criticalStockouts.length - 8} additional stations requiring dispatch review.\n` : ''}

4. ZERO-SALE STATIONS SUMMARY (${zeroCount} REPORTED)
${
  zeroSaleList.length > 0
    ? zeroSaleList
        .slice(0, 8)
        .map(
          (s, i) =>
            `${i + 1}. [${s.erp_code}] ${s.alds_name} (${s.state}) | TM: ${s.tm || 'Unassigned'} | Reason: ${s.remark || 'Zero volume reported'}`
        )
        .join('\n')
    : '• 100% active stations recorded sales.'
}
${zeroCount > 8 ? `...and ${zeroCount - 8} additional zero-sale stations listed on dashboard.\n` : ''}
───────────────────────────────────────────────────────────────────
Dashboard Access: ${APP_BASE_URL}
${APP_NAME} · ${EMAIL_SCHEDULE_LABEL}
`;

  // 2. High-Readability Corporate HTML Version
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
    .container { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; }
    .header { background: #0f172a; color: #ffffff; padding: 20px 24px; }
    .header h1 { margin: 0 0 4px 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
    .header p { margin: 0; font-size: 13px; color: #94a3b8; }
    .section { padding: 20px 24px; border-bottom: 1px solid #f1f5f9; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #ea580c; margin: 0 0 12px 0; }
    .kpi-grid { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .kpi-grid td { padding: 10px 12px; vertical-align: top; border: 1px solid #f1f5f9; background: #fafafa; }
    .kpi-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 4px; }
    .kpi-val { font-size: 18px; font-weight: 700; color: #0f172a; font-family: 'SF Mono', Consolas, monospace; }
    .kpi-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    .data-table th { background: #f8fafc; color: #475569; font-weight: 600; text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
    .data-table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #1e293b; }
    .badge-urgent { background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-family: monospace; font-size: 11px; }
    .badge-warn { background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-family: monospace; font-size: 11px; }
    .footer { padding: 16px 24px; background: #f8fafc; font-size: 11px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>GO Gas Executive Daily Briefing</h1>
      <p>Operational Date: <strong>${dateStr}</strong> · ${EMAIL_SCHEDULE_LABEL}</p>
    </div>

    <!-- Section 1: KPI Matrix -->
    <div class="section">
      <div class="section-title">Operational & Financial Snapshot</div>
      <table class="kpi-grid">
        <tr>
          <td style="width: 50%;">
            <div class="kpi-label">Total Volume Sold</div>
            <div class="kpi-val" style="color: #ea580c;">${totalVolume} L</div>
            <div class="kpi-sub">${activeCount}/${totalCount} Active Stations (${zeroCount} Zero-Sale)</div>
          </td>
          <td style="width: 50%;">
            <div class="kpi-label">Gross Collections</div>
            <div class="kpi-val" style="color: #059669;">${totalRevenue}</div>
            <div class="kpi-sub">Realized RSP: ${effectiveRsp}/L (Nominal: ${nominalRsp})</div>
          </td>
        </tr>
        <tr>
          <td>
            <div class="kpi-label">Tomorrow's Forecast</div>
            <div class="kpi-val" style="color: #2563eb;">${tomorrowForecastStr}</div>
            <div class="kpi-sub">7-Day Total Projection: ${sevenDayTotalStr}</div>
          </td>
          <td>
            <div class="kpi-label">Collection Gap & Free Sale</div>
            <div class="kpi-val" style="color: #475569;">₹${(data.collection_gap_per_l || 0).toFixed(2)}/L Gap</div>
            <div class="kpi-sub">Free Sale: ${formatNumber(data.total_free_sale_litres || 0)} L (${formatCurrency(data.total_free_sale_rupees || 0)})</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Section 2: Critical Stockouts -->
    <div class="section">
      <div class="section-title" style="color: #dc2626;">Critical Inventory Alert: Tanker Dispatch Needed (${criticalStockouts.length} Stations)</div>
      ${
        criticalStockouts.length === 0
          ? '<p style="font-size: 12px; color: #059669; margin: 0;">✓ All active stations maintain fuel buffer of 3.0+ days.</p>'
          : `<table class="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Station</th>
                  <th>State</th>
                  <th style="text-align: right;">Closing Dip</th>
                  <th style="text-align: center;">Buffer</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${criticalStockouts
                  .slice(0, 6)
                  .map(
                    s => `<tr>
                    <td style="font-family: monospace; font-weight: 700; color: #ea580c;">${s.code}</td>
                    <td style="font-weight: 600;">${s.name}</td>
                    <td>${s.state}</td>
                    <td style="text-align: right; font-family: monospace;">${formatNumber(s.stock_ltr, 0)} L</td>
                    <td style="text-align: center;"><span class="${s.days_left < 1.5 ? 'badge-urgent' : 'badge-warn'}">${s.days_left}d</span></td>
                    <td style="font-size: 11px; color: #dc2626; font-weight: 500;">${s.remark || 'Dispatch Required'}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
      }
    </div>

    <!-- Section 3: Zero-Sale Summary -->
    <div class="section">
      <div class="section-title" style="color: #b45309;">Zero-Sale Monitoring (${zeroCount} Stations)</div>
      ${
        zeroCount === 0
          ? '<p style="font-size: 12px; color: #059669; margin: 0;">✓ 100% of network stations recorded sales.</p>'
          : `<table class="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Station</th>
                  <th>State</th>
                  <th>TM</th>
                  <th>Reason / Remark</th>
                </tr>
              </thead>
              <tbody>
                ${zeroSaleList
                  .slice(0, 5)
                  .map(
                    s => `<tr>
                    <td style="font-family: monospace; font-weight: 700; color: #d97706;">${s.erp_code}</td>
                    <td style="font-weight: 600;">${s.alds_name}</td>
                    <td>${s.state}</td>
                    <td>${s.tm || 'Unassigned'}</td>
                    <td style="font-style: italic; color: #64748b;">${s.remark || 'Zero volume reported'}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
      }
    </div>

    <div class="footer">
      Generated automatically by <strong>${APP_NAME} Intelligence Engine</strong>.<br>
      Dashboard: <a href="${APP_BASE_URL}" style="color: #ea580c; text-decoration: none;">${APP_BASE_URL}</a>.
    </div>
  </div>
</body>
</html>`;

  return { subject, plainText, html };
}

/**
 * Sends the email using standard SMTP (free Gmail or Workspace).
 */
export async function sendBriefingEmail(
  data: ExecutiveTelemetry,
  options?: {
    to?: string;
    subjectPrefix?: string;
  }
): Promise<{ success: boolean; messageId?: string; error?: string; preview: EmailBriefingContent }> {
  const briefing = generateProfessionalBriefing(data);

  const recipient = options?.to || SMTP_TO;
  const username = SMTP_USER;
  const password = SMTP_PASS;

  if (!username || !password || username.includes('YOUR_GMAIL') || password.includes('xxxx')) {
    return {
      success: false,
      error: 'SMTP credentials not configured. Please add SMTP_USER and SMTP_PASS (Google App Password) to your .env file.',
      preview: briefing,
    };
  }

  if (!recipient) {
    return {
      success: false,
      error: 'No recipient email specified. Set SMTP_TO in your .env or provide a recipient.',
      preview: briefing,
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: username,
        pass: password,
      },
    });

    const info = await transporter.sendMail({
      from: `"${SMTP_FROM_NAME}" <${username}>`,
      to: recipient,
      subject: options?.subjectPrefix ? `${options.subjectPrefix} ${briefing.subject}` : briefing.subject,
      text: briefing.plainText,
      html: briefing.html,
    });

    return {
      success: true,
      messageId: info.messageId,
      preview: briefing,
    };
  } catch (err: any) {
    console.error('[EMAIL SERVICE] Failed to send briefing email:', err);
    return {
      success: false,
      error: err.message || 'Unknown SMTP error occurred while sending email.',
      preview: briefing,
    };
  }
}
