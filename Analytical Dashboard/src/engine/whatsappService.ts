import path from 'path';
import { fileURLToPath } from 'node:url';
import whatsappWeb from 'whatsapp-web.js';
import type { ExecutiveTelemetry, StationRecord } from '../types.js';
import {
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
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');

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
const protectedPages = new WeakSet<object>();

export function isRetryableWhatsAppInitializationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /execution context was destroyed|detached frame|target closed/i.test(message);
}

function isPageNavigationRace(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /execution context was destroyed|detached frame/i.test(message);
}

export function isWhatsAppSessionProfileLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /EBUSY|resource busy or locked/i.test(message);
}

function handlePageEventError(client: InstanceType<typeof Client>, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (isWhatsAppSessionProfileLockError(error)) {
    const recoveryMessage = 'WhatsApp could not update its locked browser session. Select Refresh QR to restart WhatsApp; do not delete .wwebjs_auth.';
    console.error(`[WHATSAPP] Session-profile cleanup failed while Chrome may still be using it: ${message}`);
    if (whatsappClient === client) {
      updateSessionState({
        connectionStatus: 'Connection error',
        qrCodeData: '',
        connectionError: recoveryMessage,
      });
    }
    return;
  }

  console.error(`[WHATSAPP] WhatsApp browser page handler failed: ${message}`);
  if (whatsappClient === client) {
    updateSessionState({
      connectionStatus: 'Connection error',
      qrCodeData: '',
      connectionError: message,
    });
  }
}

function protectAsyncPageEventHandlers(client: InstanceType<typeof Client>): void {
  const authStrategy = Reflect.get(client, 'authStrategy');
  const afterBrowserInitialized = Reflect.get(authStrategy, 'afterBrowserInitialized');
  if (typeof afterBrowserInitialized !== 'function') {
    throw new Error('The WhatsApp authentication strategy does not expose its browser initialization hook.');
  }

  const guardedAfterBrowserInitialized = async (...args: unknown[]) => {
    const page = Reflect.get(client, 'pupPage');
    if (page && typeof page === 'object' && !protectedPages.has(page)) {
      const pageOn = Reflect.get(page, 'on');
      if (typeof pageOn !== 'function') {
        throw new Error('The WhatsApp browser page does not support event handling.');
      }

      const guardedPageOn = (eventName: unknown, listener: unknown) => {
        if (eventName !== 'framenavigated' || typeof listener !== 'function') {
          return Reflect.apply(pageOn, page, [eventName, listener]);
        }

        const guardedListener = (...eventArgs: unknown[]) => {
          try {
            const result = Reflect.apply(listener, page, eventArgs);
            if (result && typeof Reflect.get(result, 'then') === 'function') {
              return Promise.resolve(result).catch((error: unknown) => {
                handlePageEventError(client, error);
              });
            }
            return result;
          } catch (error) {
            handlePageEventError(client, error);
            return undefined;
          }
        };
        return Reflect.apply(pageOn, page, [eventName, guardedListener]);
      };

      if (!Reflect.set(page, 'on', guardedPageOn)) {
        throw new Error('Could not protect WhatsApp page-navigation handlers from unhandled errors.');
      }
      protectedPages.add(page);
    }

    return Reflect.apply(afterBrowserInitialized, authStrategy, args);
  };

  if (!Reflect.set(authStrategy, 'afterBrowserInitialized', guardedAfterBrowserInitialized)) {
    throw new Error('Could not protect the WhatsApp browser initialization hook.');
  }
}

function protectPageInjection(client: InstanceType<typeof Client>): void {
  const inject = Reflect.get(client, 'inject');
  if (typeof inject !== 'function') {
    throw new Error('The installed WhatsApp Web client does not expose its page injection method.');
  }

  let injectionTask: Promise<unknown> | null = null;
  const guardedInject = async (...args: unknown[]) => {
    if (injectionTask) return injectionTask;
    const task = (async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          return await Reflect.apply(inject, client, args);
        } catch (error) {
          if (!isPageNavigationRace(error)) throw error;
          if (attempt < 3) {
            console.warn(`[WHATSAPP] WhatsApp Web navigated during injection; retrying (${attempt}/3).`);
            await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
            continue;
          }
          if (!initializingClient) {
            console.warn('[WHATSAPP] WhatsApp Web navigation prevented reinjection; waiting for its next page event.');
            return;
          }
          throw error;
        }
      }
    })();
    injectionTask = task;
    try {
      return await task;
    } finally {
      if (injectionTask === task) injectionTask = null;
    }
  };
  if (!Reflect.set(client, 'inject', guardedInject)) {
    throw new Error('Could not protect WhatsApp Web page injection from navigation races.');
  }
}

function resolveProjectPath(configuredPath: string): string {
  return path.resolve(PROJECT_ROOT, configuredPath);
}

function createWhatsAppClient(): InstanceType<typeof Client> {
  const executablePath = WHATSAPP_CHROME_EXECUTABLE_PATH.trim();
  return new Client({
    authStrategy: new LocalAuth({
      dataPath: resolveProjectPath(WHATSAPP_AUTH_DIRECTORY),
    }),
    webVersion: WHATSAPP_WEB_VERSION,
    webVersionCache: {
      type: 'local',
      path: resolveProjectPath(WHATSAPP_WEB_VERSION_CACHE_DIRECTORY),
      strict: true,
    },
    puppeteer: {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    },
  });
}

function updateSessionState(state: WhatsAppSessionState) {
  sessionState = state;
  sessionStateListener?.({ ...state });
}

export function getWhatsAppSessionState(): WhatsAppSessionState {
  return { ...sessionState };
}

function initializeWhatsAppClientAttempt(attempt: number): Promise<void> {
  const activeClient = createWhatsAppClient();
  whatsappClient = activeClient;
  protectAsyncPageEventHandlers(activeClient);
  protectPageInjection(activeClient);

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
    initializingClient = false;
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
    initializingClient = false;
    whatsappClientReady = false;
    if (reason === 'LOGOUT') {
      updateSessionState({
        connectionStatus: 'Connection error',
        qrCodeData: '',
        connectionError: 'WhatsApp logged out this browser session. Select Refresh QR to reconnect.',
      });
      console.warn('[WHATSAPP] The browser session was logged out; keeping Chrome available for a safe refresh.');
      return;
    }
    whatsappClient = null;
    updateSessionState({ connectionStatus: 'Disconnected', qrCodeData: '' });
    console.warn(`[WHATSAPP] WhatsApp Web disconnected: ${reason}`);
  });

  let attemptTask: Promise<void>;
  attemptTask = activeClient.initialize().then(
    () => {
      if (whatsappClient === activeClient) initializingClient = false;
    },
    async (error: unknown) => {
      if (whatsappClient !== activeClient) return;
      const message = error instanceof Error ? error.message : String(error);
      whatsappClient = null;
      whatsappClientReady = false;
      try {
        await activeClient.destroy();
      } catch (cleanupError) {
        const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        console.error(`[WHATSAPP] Failed to close the browser after initialization failure: ${cleanupMessage}`);
      }

      if (attempt < 2 && isRetryableWhatsAppInitializationError(error) && initializingClient) {
        console.warn('[WHATSAPP] WhatsApp Web navigation interrupted initialization; retrying once.');
        updateSessionState({ connectionStatus: 'Connecting (Scan QR)', qrCodeData: '' });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (initializingClient && !whatsappClient) {
          await initializeWhatsAppClientAttempt(attempt + 1);
        }
        return;
      }

      initializingClient = false;
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
    if (initializationTask === attemptTask) initializationTask = null;
  });
  initializationTask = attemptTask;
  return attemptTask;
}

export function initializeWhatsAppClient(
  onStateChange?: (state: WhatsAppSessionState) => void
) {
  if (onStateChange) sessionStateListener = onStateChange;
  if (!WHATSAPP_ENABLED || whatsappClient || initializingClient) return;

  initializingClient = true;
  whatsappClientReady = false;
  updateSessionState({ connectionStatus: 'Connecting (Scan QR)', qrCodeData: '' });
  void initializeWhatsAppClientAttempt(1);
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

export { buildExecutiveWhatsAppMessage } from './whatsappBriefing.js';

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
