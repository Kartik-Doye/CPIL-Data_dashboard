/**
 * GO Gas Executive Suite — Zero-Cost Automated Morning Briefing Email Dispatcher
 * 
 * Schedule this script in Windows Task Scheduler at the schedule in product-config.json:
 * Command: node send_morning_mail.cjs
 * 
 * Zero cost:
 * - Uses free Gmail SMTP (smtp.gmail.com) with a free Google App Password
 * - Delivers to any number of executive recipients (CMD, MD, State Heads, TMs)
 * - Can fetch from the configured live dashboard or directly from PostgreSQL
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const productConfig = require('./product-config.json');

// Load non-empty values in order, preserving earlier files as higher priority.
const rootEnv = path.resolve(process.cwd(), '.env');
const dashboardEnv = path.resolve(process.cwd(), 'Analytical Dashboard/.env');
const manualEnv = path.resolve(process.cwd(), 'Manual Work/.env');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const entries = dotenv.parse(fs.readFileSync(filePath));
  for (const [key, value] of Object.entries(entries)) {
    if (!process.env[key]?.trim() && value.trim()) process.env[key] = value;
  }
}

loadEnvFile(dashboardEnv);
loadEnvFile(manualEnv);
loadEnvFile(rootEnv);

const appName = process.env.APP_NAME || productConfig.application.name;
const defaultDashboardUrl = new URL(productConfig.application.baseUrl);
defaultDashboardUrl.port = process.env.PORT || String(productConfig.application.port);
const dashboardUrl = process.env.APP_BASE_URL || defaultDashboardUrl.origin;
const scheduleLabel = process.env.EMAIL_SCHEDULE_LABEL || productConfig.email.scheduleLabel;

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(path.resolve(process.cwd(), 'morning_email_log.txt'), line + '\n');
  } catch (err) {
    // ignore
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Dashboard telemetry endpoint returned HTTP ${response.status}.`);
  return response.json();
}

const formatNumber = (val, decimals = 2) =>
  Number(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const formatCurrency = (val) => {
  const num = Number(val || 0);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} Lakh`;
  return `₹${formatNumber(num, 0)}`;
};

async function buildBriefingFromTelemetry(data) {
  const dateStr = data.date || new Date().toISOString().slice(0, 10);
  const totalVolume = formatNumber(data.total_sale_qty);
  const totalRevenue = formatCurrency(data.total_collection);
  const effectiveRsp = `₹${(data.effective_rsp || 0).toFixed(2)}`;
  const nominalRsp = `₹${(data.average_rsp || 0).toFixed(2)}`;
  const activeCount = data.stations_with_sale || 0;
  const totalCount = data.stations_total || 0;
  const zeroCount = data.zero_sale_count || 0;

  const nextForecast = data.forecast?.forecast?.[0];
  const tomorrowForecastStr = nextForecast ? `${formatNumber(nextForecast.predicted_qty)} L` : 'N/A';
  const sevenDayTotalStr = data.forecast?.predicted_total_7d ? `${formatNumber(data.forecast.predicted_total_7d)} L` : 'N/A';

  const criticalStockouts = (data.stockout_risk_stations || []).filter(s => s.days_left < 3.0);
  const zeroSaleList = data.zero_sale_stations || [];

  const subject = `[${appName} Executive Briefing] Operational Snapshot · ${dateStr} · ${totalVolume} L (${totalRevenue})`;

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
Dashboard Access: ${dashboardUrl}
${appName} · ${scheduleLabel}
`;

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
      <h1>${appName} Daily Briefing</h1>
      <p>Operational Date: <strong>${dateStr}</strong> · ${scheduleLabel}</p>
    </div>

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

    <div class="section">
      <div class="section-title" style="color: #dc2626;">Critical Inventory Alert (<3 Days Buffer)</div>
      ${
        criticalStockouts.length === 0
          ? '<p style="font-size: 12px; color: #059669; margin: 0;">✓ All active stations maintain fuel buffer >= 3.0 days.</p>'
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
                    <td style="font-size: 11px; color: #dc2626; font-weight: 500;">${s.remark || 'Tanker Dispatch Needed'}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
      }
    </div>

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
      Generated automatically by <strong>${appName} Intelligence Engine</strong>.<br>
      Dashboard: <a href="${dashboardUrl}" style="color: #ea580c; text-decoration: none;">${dashboardUrl}</a>.
    </div>
  </div>
</body>
</html>`;

  return { subject, plainText, html };
}

async function main() {
  log('====================================================');
  log(`${appName}: Starting Morning Briefing Run`);
  log('====================================================');

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpTo = process.env.SMTP_TO;
  const smtpHost = process.env.SMTP_HOST || productConfig.email.smtpHost;
  const smtpPort = parseInt(process.env.SMTP_PORT || String(productConfig.email.smtpPort), 10);
  const smtpSecureOverride = process.env.SMTP_SECURE?.trim();
  const smtpSecure = smtpSecureOverride
    ? smtpSecureOverride.toLowerCase() === 'true'
    : productConfig.email.smtpSecure;
  const smtpFromName = process.env.SMTP_FROM_NAME || productConfig.email.fromName;

  log(`Target Recipients: ${smtpTo || '(NOT SET)'}`);
  log(`SMTP Server      : ${smtpHost}:${smtpPort} (Secure: ${smtpSecure})`);
  log(`Sender User      : ${smtpUser || '(NOT SET)'}`);

  if (!smtpUser || !smtpPass || smtpUser.includes('YOUR_GMAIL') || smtpPass.includes('xxxx')) {
    log('ERROR: SMTP credentials are not configured in Analytical Dashboard/.env');
    log('To enable zero-cost morning emails:');
    log('1. Go to your Google Account -> Security -> 2-Step Verification -> App Passwords.');
    log('2. Create an App Password for "Mail" / "GO Gas".');
    log('3. Set SMTP_USER=your_email@gmail.com and SMTP_PASS=your_16_char_password in Analytical Dashboard/.env');
    log('4. Set SMTP_TO=recipient1@gogas.co.in,recipient2@gogas.co.in');
    process.exit(1);
  }

  if (!smtpTo) {
    log('ERROR: No recipient defined. Please set SMTP_TO in Analytical Dashboard/.env');
    process.exit(1);
  }

  // 1. Fetch live telemetry from local dashboard
  let telemetry = null;
  try {
    const telemetryUrl = new URL('/api/telemetry', dashboardUrl).toString();
    log(`Fetching telemetry from ${telemetryUrl} ...`);
    telemetry = await fetchJson(telemetryUrl);
    log(`Fetched telemetry successfully. Source: ${telemetry.source_file}, Date: ${telemetry.date}`);
  } catch (err) {
    log(`Notice: Could not fetch from ${dashboardUrl}: ${err.message}`);
    log('Make sure "run-dev.bat" or "npm run dev" is active before running.');
    process.exit(1);
  }

  // 2. Generate email content
  const briefing = await buildBriefingFromTelemetry(telemetry);
  log(`Generated Briefing Subject: "${briefing.subject}"`);

  // 3. Send email via Nodemailer
  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    log(`Transmitting briefing to: ${smtpTo} ...`);
    const info = await transporter.sendMail({
      from: `"${smtpFromName}" <${smtpUser}>`,
      to: smtpTo,
      subject: briefing.subject,
      text: briefing.plainText,
      html: briefing.html,
    });

    log(`SUCCESS: Morning briefing email sent! Message ID: ${info.messageId}`);
    log(`Recipients accepted: ${Array.isArray(info.accepted) ? info.accepted.join(', ') : info.accepted}`);
    log('====================================================\n');
  } catch (err) {
    log(`CRITICAL ERROR during SMTP dispatch: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  log(`Unhandled error: ${err.message}`);
  process.exit(1);
});
