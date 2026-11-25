import fs from 'fs';
import path from 'path';
import { execFileSync } from 'node:child_process';
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
  connectionStatus: 'Disconnected' | 'Connecting (Scan QR)' | 'Connecting (Restoring session)' | 'Linking (Finish on phone)' | 'Ready' | 'Connection error';
  qrCodeData: string;
  connectionError?: string;
}

const dispatchLogs: WhatsAppLogEntry[] = [];
let lastSentTimestamp = 0;
let whatsappClient: InstanceType<typeof Client> | null = null;
let whatsappClientReady = false;
let initializingClient = false;
let initializationTask: Promise<void> | null = null;
let clientRefreshTask: Promise<void> | null = null;
let sessionState: WhatsAppSessionState = {
  connectionStatus: 'Disconnected',
  qrCodeData: '',
};
let sessionStateListener: ((state: WhatsAppSessionState) => void) | null = null;
let activeRecipientNumbers = WHATSAPP_RECIPIENT_NUMBERS;
let autoReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
let readyPollInterval: ReturnType<typeof setInterval> | null = null;
let shutdownHooksRegistered = false;
const protectedPages = new WeakSet<object>();

function clearKeepAliveTimers() {
  if (autoReconnectTimer) {
    clearTimeout(autoReconnectTimer);
    autoReconnectTimer = null;
  }
  if (sessionRecoveryTimer) {
    clearTimeout(sessionRecoveryTimer);
    sessionRecoveryTimer = null;
  }
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  if (readyPollInterval) {
    clearInterval(readyPollInterval);
    readyPollInterval = null;
  }
}

let sessionRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
let lastSessionRecoveryAt = 0;

// After the QR is scanned, WhatsApp performs an end-to-end handshake and initial history
// sync with the phone. Restarting or re-injecting the browser during this window makes the
// phone show "Logging in..." forever and the device never appears under Linked Devices.
const PAIRING_GRACE_MS = 3 * 60_000;
let pairingStartedAt = 0;

function markPairingStarted() {
  if (autoReconnectTimer) {
    clearTimeout(autoReconnectTimer);
    autoReconnectTimer = null;
  }
  if (sessionRecoveryTimer) {
    clearTimeout(sessionRecoveryTimer);
    sessionRecoveryTimer = null;
  }
  if (!pairingStartedAt) {
    pairingStartedAt = Date.now();
    console.info('[WHATSAPP] QR scanned; waiting for the phone to finish linking (do not close the browser or refresh QR)...');
  }
  if (!whatsappClientReady) {
    updateSessionState({ connectionStatus: 'Linking (Finish on phone)', qrCodeData: '' });
  }
}

export function clearPairing() {
  pairingStartedAt = 0;
}

export function isWhatsAppPairingInProgress(): boolean {
  return pairingStartedAt > 0 && Date.now() - pairingStartedAt < PAIRING_GRACE_MS;
}

/**
 * Restart the browser client after a logout or a stuck page.
 * When resetProfile is true (e.g. phone unlinked the device), clears the revoked session
 * so a fresh QR code is generated immediately.
 */
function scheduleSessionRecovery(reason: string, delayMs = 4000, resetProfile = false) {
  if (!WHATSAPP_ENABLED || sessionRecoveryTimer) return;
  if (isWhatsAppPairingInProgress() && !resetProfile) {
    console.info(`[WHATSAPP] Ignoring recovery trigger (${reason}) while the phone is still linking.`);
    return;
  }
  const sinceLast = Date.now() - lastSessionRecoveryAt;
  const effectiveDelay = resetProfile ? delayMs : (sinceLast < 60_000 ? Math.max(delayMs, 60_000 - sinceLast) : delayMs);
  console.warn(`[WHATSAPP] Scheduling browser session recovery (${reason}, resetProfile=${resetProfile}) in ${Math.round(effectiveDelay / 1000)}s...`);
  sessionRecoveryTimer = setTimeout(() => {
    sessionRecoveryTimer = null;
    lastSessionRecoveryAt = Date.now();
    void refreshWhatsAppClient(resetProfile).catch((error: unknown) => {
      console.error(`[WHATSAPP] Session recovery failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, effectiveDelay);
}

function startReadyStateDetection(client: InstanceType<typeof Client>) {
  if (readyPollInterval) clearInterval(readyPollInterval);
  let readyConfirmedTicks = 0;
  readyPollInterval = setInterval(async () => {
    if (whatsappClient !== client) {
      if (readyPollInterval) clearInterval(readyPollInterval);
      readyPollInterval = null;
      return;
    }
    if (whatsappClientReady) {
      if (readyPollInterval) clearInterval(readyPollInterval);
      readyPollInterval = null;
      return;
    }
    const page = Reflect.get(client, 'pupPage') as { evaluate?: (fn: () => unknown) => Promise<unknown> } | null;
    if (!page || typeof page.evaluate !== 'function') return;
    try {
      const check = (await page.evaluate(() => {
        const w = window as unknown as Record<string, any>;
        if (typeof w.require !== 'function') return { linked: false, synced: false, wwebReady: false };
        let socketState = '';
        let hasSynced = false;
        let hasWid = false;
        try {
          const sock = w.require('WAWebSocketModel')?.Socket;
          socketState = String(sock?.state || '');
          hasSynced = Boolean(sock?.hasSynced);
        } catch {}
        try {
          const prefs = w.require('WAWebUserPrefsMeUser');
          hasWid = Boolean(prefs?.getMaybeMePnUser?.() || prefs?.getMaybeMeLidUser?.());
        } catch {}
        const wwebReady = typeof w.WWebJS !== 'undefined';
        const linked = hasWid && socketState === 'CONNECTED' && hasSynced;
        // Only trigger onAppStateHasSyncedEvent once per page load if hasSynced was already true before listener attachment
        if (linked && typeof w.onAppStateHasSyncedEvent === 'function' && !wwebReady && !w.__goGasSyncTriggered) {
          w.__goGasSyncTriggered = true;
          void w.onAppStateHasSyncedEvent();
        }
        return { linked, synced: hasSynced, wwebReady, socketState };
      })) as { linked?: boolean; synced?: boolean; wwebReady?: boolean; socketState?: string } | null;

      if (check?.linked && check?.wwebReady && !whatsappClientReady) {
        readyConfirmedTicks++;
        // Allow Client.js one cycle (~2s) to emit Events.READY naturally after LoadUtils finishes
        if (readyConfirmedTicks >= 2 && !whatsappClientReady) {
          clearPairing();
          whatsappClientReady = true;
          initializingClient = false;
          updateSessionState({ connectionStatus: 'Ready', qrCodeData: '' });
          startSessionKeepAlive(client);
          console.log('[WHATSAPP] Detected active linked WhatsApp Web session via live page probe; status promoted to Ready.');
          if (readyPollInterval) clearInterval(readyPollInterval);
          readyPollInterval = null;
        }
      } else {
        readyConfirmedTicks = 0;
      }
    } catch {
      // Ignore evaluation errors while page is navigating
    }
  }, 2000);
}

function scheduleAutoReconnect(reason: string, delayMs = 8000) {
  if (!WHATSAPP_ENABLED || autoReconnectTimer || initializingClient || whatsappClientReady || isWhatsAppPairingInProgress()) return;
  console.info(`[WHATSAPP] Scheduling automatic session reconnection (${reason}) in ${Math.round(delayMs / 1000)}s using saved LocalAuth profile...`);
  autoReconnectTimer = setTimeout(() => {
    autoReconnectTimer = null;
    if (isWhatsAppPairingInProgress()) {
      console.info('[WHATSAPP] Pairing is still in progress; skipping auto-reconnect.');
      return;
    }
    if (!whatsappClient && !initializingClient) {
      initializeWhatsAppClient();
    }
  }, delayMs);
}

async function sendActivePresenceHeartbeat(client: InstanceType<typeof Client>): Promise<string> {
  const page = Reflect.get(client, 'pupPage') as {
    isClosed?: () => boolean;
    evaluate?: (fn: () => unknown) => Promise<unknown>;
  } | null;
  if (!page || page.isClosed?.() || typeof page.evaluate !== 'function') {
    return 'CLOSED';
  }
  return String(
    (await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      try {
        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
        document.hasFocus = () => true;
      } catch {}

      let socketState = '';
      try {
        const sock = w.require?.('WAWebSocketModel')?.Socket;
        socketState = String(sock?.state || '');
        if (socketState === 'TIMEOUT' || socketState === 'CLOSED') {
          if (typeof sock?.poke === 'function') sock.poke();
          else if (typeof sock?.launch === 'function') sock.launch();
        }
      } catch {}

      if (!socketState) {
        try {
          const s = w.require?.('WAWebBackendEventBus')?.BackendEventBus?.socketState;
          if (s) socketState = String(s);
        } catch {}
      }

      if (!socketState || socketState === 'CONNECTED') {
        try {
          w.require?.('WAWebPresenceChatAction')?.sendPresenceAvailable?.();
        } catch {}
      }
      return socketState;
    })) || ''
  );
}

function startSessionKeepAlive(client: InstanceType<typeof Client>) {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  let consecutiveBadStates = 0;
  // Send an immediate presence heartbeat as soon as session becomes Ready
  void sendActivePresenceHeartbeat(client).catch(() => {});

  keepAliveInterval = setInterval(async () => {
    if (whatsappClient !== client || !whatsappClientReady || isWhatsAppPairingInProgress()) return;
    try {
      const page = Reflect.get(client, 'pupPage') as { isClosed?: () => boolean } | null;
      if (page?.isClosed?.()) {
        console.warn('[WHATSAPP] Keep-alive detected closed browser page; reconnecting with saved session...');
        await refreshWhatsAppClient(false);
        return;
      }
      const state = await sendActivePresenceHeartbeat(client);
      // Empty state or standard active/reconnecting states are healthy; never tear down a live session on empty state
      const unhealthy = ['UNPAIRED', 'UNPAIRED_IDLE', 'CONFLICT', 'DEPRECATED_VERSION', 'TOS_BLOCK', 'SMB_TOS_BLOCK'].includes(state);
      consecutiveBadStates = unhealthy ? consecutiveBadStates + 1 : 0;
      if (consecutiveBadStates >= 3) {
        consecutiveBadStates = 0;
        console.warn(`[WHATSAPP] Keep-alive detected persistent unlinked socket state "${state}"; restarting session...`);
        await refreshWhatsAppClient(false);
      }
    } catch {
      // Ignore transient page evaluation hiccups during navigation
    }
  }, 45_000);
}

function registerGracefulShutdownHooks() {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;
  const gracefulClose = () => {
    clearKeepAliveTimers();
    const active = whatsappClient;
    whatsappClient = null;
    whatsappClientReady = false;
    initializingClient = false;
    if (active) {
      void active.destroy().catch(() => {});
    }
  };
  process.once('SIGINT', gracefulClose);
  process.once('SIGTERM', gracefulClose);
  process.once('beforeExit', gracefulClose);
}

export function isRetryableWhatsAppInitializationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /execution context was destroyed|detached frame|target closed|ProtocolError|timed out|timeout/i.test(message);
}

export function isRetryableWhatsAppDispatchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /execution context was destroyed|detached frame|target closed|Session closed|Protocol error|ProtocolError|timed out/i.test(message);
}

function isPageNavigationRace(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /execution context was destroyed|detached frame|target closed|ProtocolError|timed out/i.test(message);
}

export function isWhatsAppSessionProfileLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /EBUSY|resource busy or locked|The browser is already running for|ProcessSingleton/i.test(message);
}

function handlePageEventError(client: InstanceType<typeof Client>, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (/Could not load response body for this request.*preflight request/i.test(message)) {
    console.warn(`[WHATSAPP] Puppeteer could not read a navigation response body; continuing with the live session: ${message}`);
    return;
  }
  if (isPageNavigationRace(error)) {
    console.warn(`[WHATSAPP] Ignoring transient browser navigation/context event: ${message}`);
    return;
  }
  if (whatsappClient === client && whatsappClientReady) {
    console.warn(`[WHATSAPP] Ignoring non-fatal browser page event on active Ready session: ${message}`);
    return;
  }
  if (isWhatsAppSessionProfileLockError(error)) {
    console.warn(`[WHATSAPP] Session-profile lock encountered during page event; scheduling non-destructive recovery: ${message}`);
    if (whatsappClient === client) {
      scheduleSessionRecovery('profile_lock', 2500, false);
    }
    return;
  }

  console.error(`[WHATSAPP] WhatsApp browser page handler failed: ${message}`);
  if (whatsappClient === client) {
    if (/auth timeout|ready timeout/i.test(message)) {
      if (isWhatsAppPairingInProgress()) {
        console.info('[WHATSAPP] Page is still syncing with the phone; not restarting during linking.');
        return;
      }
      whatsappClientReady = false;
      updateSessionState({
        connectionStatus: 'Connecting (Scan QR)',
        qrCodeData: '',
      });
      scheduleSessionRecovery(message, 2500, false);
      return;
    }
    // If a QR code is already displayed, do not wipe it on a background page warning
    if (sessionState.qrCodeData) {
      return;
    }
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
        if (typeof listener !== 'function') {
          return Reflect.apply(pageOn, page, [eventName, listener]);
        }

        const guardedListener = (...eventArgs: unknown[]) => {
          // Ignore child iframe navigations so they never trigger main-page re-injection
          if (eventName === 'framenavigated') {
            const frame = eventArgs[0] as { parentFrame?: () => unknown } | undefined;
            if (frame && typeof frame.parentFrame === 'function' && frame.parentFrame() !== null) {
              return undefined;
            }
          }
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

    // Advertise the *real* installed Chrome version. A stale hard-coded UA (e.g. Chrome 131)
    // on a newer engine can make WhatsApp treat the companion as outdated and refuse to link.
    try {
      const pageObj = page as { browser?: () => { version?: () => Promise<string> }; setUserAgent?: (ua: string) => Promise<void> };
      const versionString = await pageObj.browser?.()?.version?.();
      const match = versionString?.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (match && typeof pageObj.setUserAgent === 'function') {
        const ua = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${match[1]} Safari/537.36`;
        await pageObj.setUserAgent(ua);
      }
    } catch {
      // Keep the configured user agent if the browser version cannot be read
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
    // If the session is already Ready and window.WWebJS is intact on the main page, skip redundant re-injection
    if (whatsappClient === client && whatsappClientReady) {
      const page = Reflect.get(client, 'pupPage') as { evaluate?: (fn: () => unknown) => Promise<unknown> } | null;
      if (page && typeof page.evaluate === 'function') {
        const alreadyInjected = await page
          .evaluate(() => typeof (window as unknown as Record<string, unknown>).WWebJS !== 'undefined')
          .catch(() => false);
        if (alreadyInjected) {
          return undefined;
        }
      }
    }
    const task = (async () => {
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const res = await Reflect.apply(inject, client, args);
          startReadyStateDetection(client);
          return res;
        } catch (error) {
          if (!isPageNavigationRace(error)) throw error;
          if (attempt < 5) {
            console.warn(`[WHATSAPP] WhatsApp Web navigated during injection; retrying (${attempt}/5).`);
            await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
            continue;
          }
          if (!initializingClient) {
            console.warn('[WHATSAPP] WhatsApp Web navigation prevented reinjection; starting live Ready-state detector.');
            startReadyStateDetection(client);
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

export function isUnsupportedWhatsAppLoginPage(state: {
  pathname: string;
  hasDebugVersion: boolean;
  hasLegacySocket: boolean;
  hasBackendEventBus?: boolean;
}): boolean {
  return (state.pathname === '/login' || state.pathname.startsWith('/login/'))
    && state.hasDebugVersion
    && !state.hasLegacySocket
    && !state.hasBackendEventBus;
}

export function isUnsupportedWhatsAppLoginPageError(message?: string): boolean {
  return Boolean(message && /unsupported login page/i.test(message));
}

function getActiveClientIdFilePath(baseDataPath: string): string {
  return path.join(baseDataPath, '.active_client_id');
}

function getActiveClientId(baseDataPath: string): string {
  try {
    const file = getActiveClientIdFilePath(baseDataPath);
    if (fs.existsSync(file)) {
      const saved = fs.readFileSync(file, 'utf-8').trim();
      if (/^[-_\w]+$/i.test(saved)) return saved;
    }
  } catch {
    // ignore
  }
  const dedicatedProfileDir = path.join(baseDataPath, 'session-go-gas-primary');
  const legacyProfileDir = path.join(baseDataPath, 'session');
  if (fs.existsSync(legacyProfileDir) && !fs.existsSync(dedicatedProfileDir)) {
    return '';
  }
  return 'go-gas-primary';
}

function getProfileDirForClientId(baseDataPath: string, clientId: string): string {
  return path.join(baseDataPath, clientId ? `session-${clientId}` : 'session');
}

function killPidTree(pid: number): void {
  if (!pid || Number.isNaN(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore', timeout: 4000 });
      return;
    } catch {
      // fall through to process.kill
    }
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // process already exited
  }
}

async function destroyClientAndReleaseLocks(client: InstanceType<typeof Client> | null): Promise<void> {
  if (client) {
    let pid: number | undefined;
    try {
      const browser = Reflect.get(client, 'pupBrowser') as { process?: () => { pid?: number } | null } | undefined;
      pid = browser?.process?.()?.pid;
    } catch {
      // ignore
    }
    try {
      await Promise.race([
        client.destroy(),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    } catch {
      // ignore destroy errors
    }
    if (pid) {
      killPidTree(pid);
    }
  }
}

export function cleanStaleSessionLocks(baseDataPath: string): void {
  try {
    if (!fs.existsSync(baseDataPath)) return;
    const entries = fs.readdirSync(baseDataPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('session')) continue;
      const profileDir = path.join(baseDataPath, entry.name);
      const lockFiles = ['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'];
      for (const file of lockFiles) {
        const fullPath = path.join(profileDir, file);
        try {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.info(`[WHATSAPP] Cleaned stale session lock: ${entry.name}/${file}`);
          }
        } catch {
          // Held by an active process
        }
      }
    }
  } catch {
    // ignore
  }
}

async function wipeSessionDirectoryResilient(baseDataPath: string): Promise<void> {
  if (!fs.existsSync(baseDataPath)) return;
  const entries = fs.readdirSync(baseDataPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('session')) continue;
    const targetDir = path.join(baseDataPath, entry.name);
    await fs.promises.rm(targetDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
  }
}

function createWhatsAppClient(allowLogoutCleanup = false): InstanceType<typeof Client> {
  const executablePath = WHATSAPP_CHROME_EXECUTABLE_PATH.trim();
  const baseDataPath = resolveProjectPath(WHATSAPP_AUTH_DIRECTORY);
  const clientId = getActiveClientId(baseDataPath);

  const authStrategy = new LocalAuth({
    ...(clientId ? { clientId } : {}),
    dataPath: baseDataPath,
  });
  if (!allowLogoutCleanup) {
    // Preserve the stored LocalAuth profile across transient navigations so one-time QR linking persists permanently
    Reflect.set(authStrategy, 'logout', async () => {
      console.info('[WHATSAPP] Preserving saved LocalAuth directory on disk to prevent accidental session wipe.');
    });
  }

  return new Client({
    authStrategy,
    takeoverOnConflict: false,
    takeoverTimeoutMs: 3000,
    qrMaxRetries: 0,
    // First-time linking downloads keys + history; 30s (the library default for 0) is too short
    authTimeoutMs: 180_000,
    evalOnNewDoc: () => {
      try {
        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
        document.hasFocus = () => true;
      } catch {}
    },
    userAgent: false,
    webVersionCache: {
      type: 'none',
    },
    puppeteer: {
      headless: true,
      protocolTimeout: 180_000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
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
    clearPairing();
    updateSessionState({ connectionStatus: 'Connecting (Scan QR)', qrCodeData: qrCode });
  });

  activeClient.on('loading_screen', () => {
    if (whatsappClient !== activeClient || whatsappClientReady) return;
    if (sessionState.qrCodeData || pairingStartedAt) markPairingStarted();
  });

  activeClient.on('authenticated', () => {
    if (whatsappClient !== activeClient) return;
    if (!whatsappClientReady) {
      markPairingStarted();
    }
    startReadyStateDetection(activeClient);
  });

  activeClient.on('ready', () => {
    if (whatsappClient !== activeClient) return;
    if (readyPollInterval) {
      clearInterval(readyPollInterval);
      readyPollInterval = null;
    }
    const wasReady = whatsappClientReady;
    clearPairing();
    whatsappClientReady = true;
    initializingClient = false;
    updateSessionState({ connectionStatus: 'Ready', qrCodeData: '' });
    startSessionKeepAlive(activeClient);
    if (!wasReady) console.log('[WHATSAPP] WhatsApp Web session is ready and persistent.');
  });

  activeClient.on('auth_failure', (message: string) => {
    if (whatsappClient !== activeClient) return;
    clearKeepAliveTimers();
    whatsappClient = null;
    initializingClient = false;
    whatsappClientReady = false;
    updateSessionState({
      connectionStatus: 'Connection error',
      qrCodeData: '',
      connectionError: message,
    });
    console.error(`[WHATSAPP] Authentication failed: ${message}`);
    void destroyClientAndReleaseLocks(activeClient);
    scheduleAutoReconnect('auth_failure', 8_000);
  });

  activeClient.on('disconnected', (reason: string) => {
    if (whatsappClient !== activeClient) return;
    clearKeepAliveTimers();
    clearPairing();
    initializingClient = false;
    whatsappClientReady = false;
    if (reason === 'LOGOUT') {
      whatsappClient = null;
      updateSessionState({
        connectionStatus: 'Connection error',
        qrCodeData: '',
        connectionError: 'WhatsApp Web reported that this session was logged out. The saved product profile was preserved. Use New QR if you want to pair again.',
      });
      console.warn('[WHATSAPP] WhatsApp Web reported LOGOUT; preserving the saved LocalAuth profile. A new QR can be requested manually.');
      void activeClient.destroy().catch((error: unknown) => {
        console.error(`[WHATSAPP] Failed to close the logged-out browser: ${error instanceof Error ? error.message : String(error)}`);
      });
      return;
    }
    whatsappClient = null;
    updateSessionState({ connectionStatus: 'Disconnected', qrCodeData: '' });
    console.warn(`[WHATSAPP] WhatsApp Web disconnected (${reason}); will automatically reconnect using saved session...`);
    void destroyClientAndReleaseLocks(activeClient);
    scheduleAutoReconnect(reason, 6_000);
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
      await destroyClientAndReleaseLocks(activeClient);

      if (attempt < 3 && (isRetryableWhatsAppInitializationError(error) || isWhatsAppSessionProfileLockError(error)) && initializingClient) {
        console.warn(`[WHATSAPP] WhatsApp Web initialization interrupted (${message}); retrying (${attempt}/3)...`);
        updateSessionState({ connectionStatus: 'Connecting (Scan QR)', qrCodeData: '' });
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
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
      scheduleAutoReconnect('init_error', 10_000);
    }
  ).finally(() => {
    if (initializationTask === attemptTask) initializationTask = null;
  });
  initializationTask = attemptTask;
  return attemptTask;
}

export function hasSavedSessionOnDisk(): boolean {
  try {
    const baseDataPath = resolveProjectPath(WHATSAPP_AUTH_DIRECTORY);
    const clientId = getActiveClientId(baseDataPath);
    const dir = getProfileDirForClientId(baseDataPath, clientId);
    if (fs.existsSync(dir)) {
      const subfiles = fs.readdirSync(dir);
      if (subfiles.some((f) => f === 'Default' || f.startsWith('session-') || f === 'IndexedDB')) {
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

export function initializeWhatsAppClient(
  onStateChange?: (state: WhatsAppSessionState) => void
) {
  registerGracefulShutdownHooks();
  if (onStateChange) sessionStateListener = onStateChange;
  if (!WHATSAPP_ENABLED || whatsappClient || initializingClient) return;

  if (autoReconnectTimer) {
    clearTimeout(autoReconnectTimer);
    autoReconnectTimer = null;
  }
  initializingClient = true;
  whatsappClientReady = false;
  const hasSaved = hasSavedSessionOnDisk();
  updateSessionState({
    connectionStatus: hasSaved ? 'Connecting (Restoring session)' : 'Connecting (Scan QR)',
    qrCodeData: '',
  });
  void initializeWhatsAppClientAttempt(1);
}

export async function refreshWhatsAppClient(resetProfile = false) {
  if (clientRefreshTask) {
    await clientRefreshTask.catch(() => {});
    if (!resetProfile) return;
  }

  const task = refreshWhatsAppClientInternal(resetProfile);
  clientRefreshTask = task;
  try {
    await task;
  } finally {
    if (clientRefreshTask === task) clientRefreshTask = null;
  }
}

async function refreshWhatsAppClientInternal(resetProfile: boolean) {
  clearKeepAliveTimers();
  clearPairing();
  const taskToStop = initializationTask;
  const activeClient = whatsappClient;
  whatsappClient = null;
  whatsappClientReady = false;
  initializingClient = false;

  await destroyClientAndReleaseLocks(activeClient);
  if (taskToStop) {
    await Promise.race([
      taskToStop.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }

  if (resetProfile) {
    updateSessionState({ connectionStatus: 'Connecting (Scan QR)', qrCodeData: '' });
    const baseDataPath = resolveProjectPath(WHATSAPP_AUTH_DIRECTORY);
    await wipeSessionDirectoryResilient(baseDataPath);
    console.info('[WHATSAPP] Cleared LocalAuth session directory for fresh QR pairing.');
  }
  initializeWhatsAppClient();
}

export async function disconnectWhatsAppClient() {
  clearKeepAliveTimers();
  clearPairing();
  const taskToStop = initializationTask;
  const activeClient = whatsappClient;
  whatsappClient = null;
  whatsappClientReady = false;
  initializingClient = false;

  await destroyClientAndReleaseLocks(activeClient);
  if (taskToStop) {
    await Promise.race([
      taskToStop.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
  const baseDataPath = resolveProjectPath(WHATSAPP_AUTH_DIRECTORY);
  await wipeSessionDirectoryResilient(baseDataPath);
  updateSessionState({ connectionStatus: 'Disconnected', qrCodeData: '' });
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
    .map((number) => {
      const cleaned = number.trim().replace(/[\s()-]/g, '');
      return /^[6-9]\d{9}$/.test(cleaned) ? `91${cleaned}` : cleaned;
    })
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
  const totalRefillLitres = candidates.reduce((sum, c) => sum + (c.recommendedVolumeLtr || 0), 0);

  const priorityList = critical
    .slice(0, 2)
    .map(
      (c) =>
        `*${c.station.alds_name}* (${c.station.days_left.toFixed(1)}d, ${c.recommendedTanker})`,
    )
    .join(', ');

  return [
    `🙏 *TANKER REPLENISHMENT DISPATCH MANIFEST | ${telemetry.date}*`,
    `Dear Logistics Team, sharing today's replenishment priority:`,
    `🚨 *Critical (<1.5 Days):* ${critical.length} Stations | ⚠️ *Warning:* ${warning.length} Stations`,
    `📦 *Total Refill Required:* ${candidates.length} trips (~${numberFormat(totalRefillLitres)} L)`,
    `🚛 *Priority 1:* ${priorityList || 'No stations currently in critical status.'}${critical.length > 2 ? ` +${critical.length - 2} more` : ''}`,
    `Kindly verify tank dip & ullage before dispatch. Warm regards, *GO Gas Logistics Desk*`,
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

async function ensureWhatsAppPageReady(client: InstanceType<typeof Client>): Promise<void> {
  const pupBrowser = Reflect.get(client, 'pupBrowser') as { pages?: () => Promise<unknown[]> } | undefined;
  let pupPage = Reflect.get(client, 'pupPage') as {
    isClosed?: () => boolean;
    evaluate?: (fn: () => unknown) => Promise<unknown>;
  } | undefined;

  // Re-acquire active page handle if previous handle closed or navigated away
  if (pupPage?.isClosed?.() && pupBrowser && typeof pupBrowser.pages === 'function') {
    const pages = await pupBrowser.pages().catch(() => []);
    if (pages.length > 0) {
      pupPage = pages[0] as typeof pupPage;
      Reflect.set(client, 'pupPage', pupPage);
    }
  }

  // Ensure socket is awake and page scripts (WWebJS) are intact before sending
  await sendActivePresenceHeartbeat(client).catch(() => {});
  if (pupPage && typeof pupPage.evaluate === 'function') {
    const hasWWebJS = await pupPage.evaluate(() => typeof (window as any).WWebJS !== 'undefined').catch(() => false);
    if (!hasWWebJS) {
      const inject = Reflect.get(client, 'inject');
      if (typeof inject === 'function') {
        await Promise.resolve(Reflect.apply(inject, client, [])).catch(() => {});
      }
    }
  }
}

async function dispatchWhatsAppWebMessageWithRetry(
  client: InstanceType<typeof Client>,
  phone: string,
  content: string,
  maxRetries = 3
): Promise<void> {
  const phoneNumber = phone.replace(/\D/g, '');
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!whatsappClientReady) {
        throw new Error('WhatsApp Web session disconnected during dispatch.');
      }

      await ensureWhatsAppPageReady(client);

      let targetChatId: string | null = null;
      try {
        const contact = await client.getNumberId(phoneNumber);
        if (contact?._serialized) {
          targetChatId = contact._serialized;
        } else if (contact === null) {
          throw new Error('This number is not registered on WhatsApp.');
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('not registered on WhatsApp')) {
          throw err;
        }
        if (isRetryableWhatsAppDispatchError(err)) {
          throw err;
        }
        // Direct E.164 JID fallback if getNumberId had non-registration hiccup but phone length is valid
        if (phoneNumber.length >= 10 && phoneNumber.length <= 15) {
          targetChatId = `${phoneNumber}@c.us`;
        } else {
          throw err;
        }
      }

      if (!targetChatId) {
        targetChatId = `${phoneNumber}@c.us`;
      }

      await client.sendMessage(targetChatId, content);
      return;
    } catch (err) {
      lastError = err;
      if (err instanceof Error && err.message.includes('not registered on WhatsApp')) {
        throw err;
      }
      if (isRetryableWhatsAppDispatchError(err) && attempt < maxRetries) {
        console.warn(
          `[WHATSAPP] Transient frame detachment or navigation during dispatch to ${maskPhoneNumber(phone)} (attempt ${attempt}/${maxRetries}); waiting ${attempt * 1200}ms before retry...`
        );
        await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
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
        await dispatchWhatsAppWebMessageWithRetry(client, phone, content);
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
