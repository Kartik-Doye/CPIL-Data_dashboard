import path from 'path';
import whatsappWeb from 'whatsapp-web.js';
import type { ExecutiveTelemetry, StationRecord } from '../types.js';
import { buildExecutiveBriefingBody } from './executiveBriefing.js';
import {
  APP_BASE_URL,
  APP_LOCAL_HOSTNAMES,
  WHATSAPP_API_TOKEN,
  WHATSAPP_API_URL,
  WHATSAPP_AUTH_DIRECTORY,
  WHATSAPP_CHROME_EXECUTABLE_PATH,
  WHATSAPP_ENABLED,
  WHATSAPP_RECIPIENT_NUMBERS,
  WHATSAPP_WEB_VERSION,
  WHATSAPP_WEB_VERSION_CACHE_DIRECTORY,
} from './config.js';

const { Client, LocalAuth } = whatsappWeb;

export interface WhatsAppLogEntry {
  id: string;
  timestamp: string;
  type: 'briefing' | 'dispatch' | 'test';
  recipientCount: number;
  recipients: string[];
  status: 'sent' | 'failed';
  summary: string;
  error?: string;
}

export interface WhatsAppServiceStatus {
  enabled: boolean;
  connected: boolean;
  status: 'ready' | 'pairing_required' | 'disabled';
  provider: 'direct_gateway' | 'whatsapp_web';
  recipientCount: number;
  recipientsMasked: string[];
  qrCodeDataUrl?: string;
  lastSentAt?: string;
}

export interface WhatsAppSessionState {
  connectionStatus: 'Disconnected' | 'Connecting (Scan QR)' | 'Ready' | 'Connection error';
  qrCodeData: string;
  connectionError?: string;
}

const dispatchLogs: WhatsAppLogEntry[] = [];
let lastSentTimestamp = 0;
let whatsappClient: InstanceType<typeof Client> | null = null;
let whatsappClientReady = false;
let initializingClient = false;
let initializationTask: Promise<void> | null = null;
let sessionState: WhatsAppSessionState = {
  connectionStatus: 'Disconnected',
  qrCodeData: '',
};
let sessionStateListener: ((state: WhatsAppSessionState) => void) | null = null;
let activeRecipientNumbers = WHATSAPP_RECIPIENT_NUMBERS;

function updateSessionState(state: WhatsAppSessionState) {
  sessionState = state;
  sessionStateListener?.({ ...state });
}

export function getWhatsAppSessionState(): WhatsAppSessionState {
  return { ...sessionState };
}

export function initializeWhatsAppClient(
  onStateChange?: (state: WhatsAppSessionState) => void
) {
  if (onStateChange) sessionStateListener = onStateChange;
  if (!WHATSAPP_ENABLED || whatsappClient || initializingClient) return;

  initializingClient = true;
  whatsappClientReady = false;
  updateSessionState({ connectionStatus: 'Connecting (Scan QR)', qrCodeData: '' });

  const executablePath = WHATSAPP_CHROME_EXECUTABLE_PATH.trim();
  const activeClient = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.resolve(process.cwd(), WHATSAPP_AUTH_DIRECTORY),
    }),
    webVersion: WHATSAPP_WEB_VERSION,
    webVersionCache: {
      type: 'local',
      path: path.resolve(process.cwd(), WHATSAPP_WEB_VERSION_CACHE_DIRECTORY),
      strict: true,
    },
    puppeteer: {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    },
  });
  whatsappClient = activeClient;

  activeClient.on('qr', (qrCode: string) => {
    if (whatsappClient !== activeClient) return;
    updateSessionState({ connectionStatus: 'Connecting (Scan QR)', qrCodeData: qrCode });
  });

  activeClient.on('authenticated', () => {
    if (whatsappClient !== activeClient) return;
    updateSessionState({ connectionStatus: 'Connecting (Scan QR)', qrCodeData: '' });
  });

  activeClient.on('ready', () => {
    if (whatsappClient !== activeClient) return;
    whatsappClientReady = true;
    updateSessionState({ connectionStatus: 'Ready', qrCodeData: '' });
    console.log('[WHATSAPP] WhatsApp Web session is ready.');
  });

  activeClient.on('auth_failure', (message: string) => {
    if (whatsappClient !== activeClient) return;
    whatsappClient = null;
    initializingClient = false;
    whatsappClientReady = false;
    updateSessionState({
      connectionStatus: 'Connection error',
      qrCodeData: '',
      connectionError: message,
    });
    console.error(`[WHATSAPP] Authentication failed: ${message}`);
  });

  activeClient.on('disconnected', (reason: string) => {
    if (whatsappClient !== activeClient) return;
    whatsappClient = null;
    initializingClient = false;
    whatsappClientReady = false;
    updateSessionState({ connectionStatus: 'Disconnected', qrCodeData: '' });
    console.warn(`[WHATSAPP] WhatsApp Web disconnected: ${reason}`);
  });

  initializationTask = activeClient.initialize().then(
    () => {
      if (whatsappClient === activeClient) initializingClient = false;
    },
    async (error: unknown) => {
      if (whatsappClient !== activeClient) return;
      const message = error instanceof Error ? error.message : String(error);
      try {
        await activeClient.destroy();
      } catch (cleanupError) {
        const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        console.error(`[WHATSAPP] Failed to close the browser after initialization failure: ${cleanupMessage}`);
      }
      if (whatsappClient !== activeClient) return;
      initializingClient = false;
      whatsappClient = null;
      whatsappClientReady = false;
      updateSessionState({
        connectionStatus: 'Connection error',
        qrCodeData: '',
        connectionError: message,
      });
      console.error(
        `[WHATSAPP] Failed to initialize WhatsApp Web: ${error instanceof Error ? error.stack || message : message}`
      );
    }
  ).finally(() => {
    if (whatsappClient === activeClient) initializationTask = null;
  });
}

export async function refreshWhatsAppClient() {
  if (initializationTask) await initializationTask;
  const activeClient = whatsappClient;
  if (activeClient) {
    await activeClient.destroy();
    if (whatsappClient === activeClient) {
      whatsappClient = null;
      whatsappClientReady = false;
      initializingClient = false;
    }
  }
  initializeWhatsAppClient();
}

export async function disconnectWhatsAppClient() {
  if (initializationTask) await initializationTask;
  const activeClient = whatsappClient;
  if (activeClient) await activeClient.logout();

  if (whatsappClient === activeClient) {
    whatsappClient = null;
    whatsappClientReady = false;
    initializingClient = false;
    updateSessionState({ connectionStatus: 'Disconnected', qrCodeData: '' });
  }
}

const numberFormat = (value: number) => value.toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function parseRecipientNumbers(raw?: string): string[] {
  const source = raw ?? activeRecipientNumbers;
  const recipients = source
    .split(/[,\n;]/)
    .map((number) => number.trim().replace(/[\s()-]/g, ''))
    .filter((number) => number.startsWith('+')
      ? /^\+[1-9]\d{9,14}$/.test(number)
      : /^[1-9]\d{10,14}$/.test(number));
  return [...new Set(recipients)];
}

export function setWhatsAppRecipients(recipients: string[]) {
  activeRecipientNumbers = recipients.join(',');
}

export function maskPhoneNumber(phone: string): string {
  if (phone.length <= 4) return '****';
  const prefix = phone.slice(0, 3);
  const suffix = phone.slice(-3);
  return `${prefix}****${suffix}`;
}

function getWhatsAppDetailReference(): string {
  const dashboardUrl = new URL(APP_BASE_URL);
  dashboardUrl.username = '';
  dashboardUrl.password = '';
  dashboardUrl.search = '';
  dashboardUrl.hash = '';
  const hostname = dashboardUrl.hostname.replace(/^\[|\]$/g, '');
  if (APP_LOCAL_HOSTNAMES.includes(hostname)) {
    return 'Full station detail: see the emailed Excel attachment.';
  }
  return `Full dashboard: ${dashboardUrl.toString().replace(/\/$/, '')}`;
}

export function buildExecutiveWhatsAppMessage(telemetry: Pick<
  ExecutiveTelemetry,
  | 'date'
  | 'total_sale_qty'
  | 'total_collection'
  | 'effective_rsp'
  | 'average_rsp'
  | 'stations_with_sale'
  | 'stations_total'
  | 'zero_sale_count'
  | 'stockout_risk_stations'
  | 'forecast'
> & Partial<Pick<
 ExecutiveTelemetry,
 | 'history_30d'
 | 'zero_sale_stations'
 | 'top_declining_stations'
 | 'top_performing_stations'
 | 'all_stations'
>>): string {
 return buildExecutiveBriefingBody(telemetry, {
   detailReference: getWhatsAppDetailReference(),
 }).text;
}

export function buildTankerDispatchWhatsAppMessage(
  telemetry: Pick<ExecutiveTelemetry, 'date'>,
  candidates: Array<{
    station: StationRecord;
    urgency: 'Critical' | 'Warning' | 'Standby';
    currentStock: number;
    dailyBurn: number;
    recommendedTanker: string;
    recommendedVolumeLtr: number;
  }>
): string {
  const critical = candidates.filter((c) => c.urgency === 'Critical');
  const warning = candidates.filter((c) => c.urgency === 'Warning');

  const stationRows = critical.slice(0, 10).map((c, i) => (
    `${i + 1}. *${c.station.alds_name}* (${c.station.erp_code}) - ${c.station.state}\n` +
    `   Stock: ${numberFormat(c.currentStock)} L | Burn: ${numberFormat(c.dailyBurn)} L/d\n` +
    `   Coverage: *${c.station.days_left.toFixed(1)} Days* 🚨\n` +
    `   Dispatch: *${c.recommendedTanker}* (~${numberFormat(c.recommendedVolumeLtr)} L)`
  )).join('\n\n');

  return [
    `*🚛 GO GAS TANKER REPLENISHMENT DISPATCH MANIFEST*`,
    `📅 *Date:* ${telemetry.date}`,
    `🚨 *Critical (<1.5 Days):* ${critical.length} Stations`,
    `⚠️ *Warning (1.5-3.0 Days):* ${warning.length} Stations`,
    `📦 *Total Orders Required:* ${candidates.length} Replenishment Trips`,
    ``,
    `*PRIORITY 1 DISPATCH SCHEDULE:*`,
    stationRows || 'No stations currently in critical status.',
    critical.length > 10 ? `\n...and ${critical.length - 10} more critical station(s).` : '',
    ``,
    `_Please verify station tank dip & ullage before gate dispatch._`,
    `_GO Gas Supply Chain & Logistics Control Desk_`,
  ].join('\n');
}

export function getWhatsAppStatus(): WhatsAppServiceStatus {
  const recipients = parseRecipientNumbers();
  const hasGateway = Boolean(WHATSAPP_API_URL && WHATSAPP_API_TOKEN);
  const enabled = WHATSAPP_ENABLED;
  const connected = enabled && (whatsappClientReady || hasGateway);

  return {
    enabled,
    connected,
    status: !enabled ? 'disabled' : connected ? 'ready' : 'pairing_required',
    provider: hasGateway ? 'direct_gateway' : 'whatsapp_web',
    recipientCount: recipients.length,
    recipientsMasked: recipients.map(maskPhoneNumber),
    lastSentAt: lastSentTimestamp ? new Date(lastSentTimestamp).toISOString() : undefined,
  };
}

export function getWhatsAppAuditLog(): WhatsAppLogEntry[] {
  return [...dispatchLogs].slice(-25).reverse();
}

export async function sendWhatsAppMessage(
  type: 'briefing' | 'dispatch' | 'test',
  content: string,
  customRecipients?: string[]
): Promise<{ success: boolean; recipientCount: number; message: string }> {
  if (!WHATSAPP_ENABLED) {
    throw new Error('WhatsApp sending is disabled. Set WHATSAPP_ENABLED=true to enable it.');
  }

  const recipients = customRecipients && customRecipients.length > 0
    ? customRecipients
    : parseRecipientNumbers();

  if (recipients.length === 0) {
    throw new Error('Add recipient numbers in WhatsApp Automation Settings or set WHATSAPP_RECIPIENT_NUMBERS in your environment.');
  }

  const gatewayUrl = WHATSAPP_API_URL;
  const gatewayToken = WHATSAPP_API_TOKEN;
  if (Boolean(gatewayUrl) !== Boolean(gatewayToken)) {
    throw new Error('Both WHATSAPP_API_URL and WHATSAPP_API_TOKEN must be configured to use the WhatsApp gateway.');
  }
  if (!gatewayUrl && (!whatsappClient || !whatsappClientReady)) {
    throw new Error('WhatsApp Web is not connected. Scan the pairing QR code before sending messages.');
  }

  let deliveryCount = 0;
  const errors: string[] = [];

  for (const phone of recipients) {
    try {
      if (gatewayUrl && gatewayToken) {
        const res = await fetch(gatewayUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${gatewayToken}`,
          },
          body: JSON.stringify({
            to: phone,
            recipient: phone,
            message: content,
            body: content,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Gateway returned HTTP ${res.status}: ${errText.slice(0, 100)}`);
        }
      } else {
        const client = whatsappClient;
        if (!client || !whatsappClientReady) {
          throw new Error('WhatsApp Web session disconnected during dispatch.');
        }
        const phoneNumber = phone.replace(/\D/g, '');
        const contact = await client.getNumberId(phoneNumber);
        if (!contact) {
          throw new Error('This number is not registered on WhatsApp.');
        }
        await client.sendMessage(contact._serialized, content);
      }
      deliveryCount++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${maskPhoneNumber(phone)}: ${message}`);
    }
  }

  const logEntry: WhatsAppLogEntry = {
    id: `wa-log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    type,
    recipientCount: deliveryCount,
    recipients: recipients.map(maskPhoneNumber),
    status: deliveryCount > 0 ? 'sent' : 'failed',
    summary: content.slice(0, 120).replace(/\n/g, ' ') + '...',
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
  dispatchLogs.push(logEntry);
  if (deliveryCount > 0) lastSentTimestamp = Date.now();

  if (deliveryCount === 0 && errors.length > 0) {
    throw new Error(`Failed to dispatch WhatsApp messages: ${errors[0]}`);
  }

  return {
    success: true,
    recipientCount: deliveryCount,
    message: `WhatsApp ${type} dispatched successfully to ${deliveryCount} recipient(s).`,
  };
}
