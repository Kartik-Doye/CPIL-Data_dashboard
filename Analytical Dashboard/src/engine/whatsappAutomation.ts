import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { Server as SocketIOServer } from 'socket.io';
import cron, { ScheduledTask } from 'node-cron';
import type { Express, NextFunction, Request, Response } from 'express';
import {
  APP_LOCAL_ADDRESS_PREFIXES,
  APP_LOCAL_HOSTNAMES,
  APP_TIMEZONE,
  PORT,
  WHATSAPP_CRON_EXPRESSION,
  WHATSAPP_DAILY_MESSAGE,
  WHATSAPP_SCHEDULE_LABEL,
} from './config.js';
import {
  disconnectWhatsAppClient,
  getWhatsAppSessionState,
  initializeWhatsAppClient,
  isWhatsAppPairingInProgress,
  parseRecipientNumbers,
  refreshWhatsAppClient,
  setWhatsAppRecipients,
  sendWhatsAppMessage,
} from './whatsappService.js';
import { query, queryLoader, isLoaderConfigured } from './db.js';

export interface WhatsAppConfig {
  targetPhoneNumber: string;
  dailyMessageText: string;
  scheduledCron: string;
  autoSendEnabled: boolean;
}

let connectionStatus: string = 'Disconnected';
let currentQrCode = '';
let connectionError: string | undefined;
let targetPhoneNumber = parseRecipientNumbers().join(',');
let dailyMessageText = WHATSAPP_DAILY_MESSAGE;
let ioInstance: SocketIOServer | null = null;
let scheduledTasks: ScheduledTask[] = [];
const RUNTIME_SETTINGS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../.runtime_settings.json',
);

function readDiskWhatsAppConfig(): { targetPhoneNumber?: string; dailyMessageText?: string } | null {
  try {
    if (fs.existsSync(RUNTIME_SETTINGS_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(RUNTIME_SETTINGS_PATH, 'utf-8'));
      return parsed?.whatsapp_config ?? null;
    }
  } catch {
    // Ignore disk parse error
  }
  return null;
}

function writeDiskWhatsAppConfig(cfg: { targetPhoneNumber: string; dailyMessageText: string }) {
  try {
    let current: Record<string, any> = {};
    if (fs.existsSync(RUNTIME_SETTINGS_PATH)) {
      current = JSON.parse(fs.readFileSync(RUNTIME_SETTINGS_PATH, 'utf-8')) || {};
    }
    current.whatsapp_config = cfg;
    fs.writeFileSync(RUNTIME_SETTINGS_PATH, JSON.stringify(current, null, 2), 'utf-8');
  } catch {
    // Ignore disk write error
  }
}

function isLoopbackAddress(address = '') {
  const normalized = address.toLowerCase();
  return APP_LOCAL_HOSTNAMES.includes(normalized) ||
    APP_LOCAL_ADDRESS_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isLocalOrigin(origin?: string) {
  if (!origin) return true;
  try {
    const parsedOrigin = new URL(origin);
    const hostname = parsedOrigin.hostname.replace(/^\[|\]$/g, '');
    return APP_LOCAL_HOSTNAMES.includes(hostname) && parsedOrigin.port === String(PORT);
  } catch {
    return false;
  }
}

function requireLocalWhatsAppAccess(req: Request, res: Response, next: NextFunction) {
  if (!isLoopbackAddress(req.socket.remoteAddress) || !isLocalOrigin(req.get('origin'))) {
    res.status(403).json({ success: false, error: 'WhatsApp controls are only available from this computer.' });
    return;
  }
  next();
}

function updateConnectionState(state: ReturnType<typeof getWhatsAppSessionState>) {
  connectionStatus = state.connectionStatus;
  currentQrCode = state.qrCodeData;
  connectionError = state.connectionError;
  ioInstance?.emit('status-update', connectionStatus);
  ioInstance?.emit('qr-code', currentQrCode);
  ioInstance?.emit('connection-error', connectionError || '');
}

export function initWhatsAppAutomation(
  app: Express,
  server: http.Server,
  buildExecutiveMessage?: () => Promise<string>
) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: (origin, callback) => callback(null, isLocalOrigin(origin)),
      methods: ['GET', 'POST'],
    },
    allowRequest: (req, callback) => {
      callback(null, isLoopbackAddress(req.socket.remoteAddress) && isLocalOrigin(req.headers.origin));
    },
    path: '/socket.io',
  });
  ioInstance = io;
  app.use('/api/whatsapp', requireLocalWhatsAppAccess);

  server.once('listening', () => {
    initializeWhatsAppClient(updateConnectionState);
    updateConnectionState(getWhatsAppSessionState());
  });

  // Load persisted WhatsApp recipients & message from disk first, then PostgreSQL settings table if available
  const diskSaved = readDiskWhatsAppConfig();
  if (diskSaved?.targetPhoneNumber) {
    const parsed = parseRecipientNumbers(diskSaved.targetPhoneNumber);
    if (parsed.length > 0) {
      targetPhoneNumber = parsed.join(',');
      setWhatsAppRecipients(parsed);
    }
  }
  if (diskSaved?.dailyMessageText) {
    dailyMessageText = String(diskSaved.dailyMessageText).trim();
  }

  void (async () => {
    try {
      const rows = await query<{ value: { targetPhoneNumber?: string; dailyMessageText?: string } }>(
        "SELECT value FROM settings WHERE key = 'whatsapp_config'"
      );
      const saved = rows[0]?.value;
      if (saved) {
        if (saved.targetPhoneNumber) {
          const parsed = parseRecipientNumbers(saved.targetPhoneNumber);
          if (parsed.length > 0) {
            targetPhoneNumber = parsed.join(',');
            setWhatsAppRecipients(parsed);
          }
        }
        if (saved.dailyMessageText) {
          dailyMessageText = String(saved.dailyMessageText).trim();
        }
        writeDiskWhatsAppConfig({ targetPhoneNumber, dailyMessageText });
      }
    } catch {
      // Ignore if settings table is not yet installed
    }
  })();

  io.on('connection', (socket) => {
    socket.emit('status-update', connectionStatus);
    socket.emit('connection-error', connectionError || '');
    socket.emit('qr-code', currentQrCode);
  });

  async function sendBroadcast(triggerType = 'scheduled') {
    if (connectionStatus !== 'Ready') {
      console.log(`[WHATSAPP AUTOMATION] ${triggerType} broadcast skipped: WhatsApp client is not logged in (Status: ${connectionStatus}).`);
      return { success: false, message: `WhatsApp client is not logged in (${connectionStatus})` };
    }

    try {
      const recipients = parseRecipientNumbers(targetPhoneNumber);
      const message = buildExecutiveMessage
        ? await buildExecutiveMessage()
        : dailyMessageText;
      const result = await sendWhatsAppMessage('briefing', message, recipients);
      io.emit('broadcast-success', {
        timestamp: new Date().toISOString(),
        recipient: recipients.length ? recipients.join(', ') : 'configured recipients',
        type: triggerType,
      });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[WHATSAPP AUTOMATION] Failed to send broadcast:', message);
      return { success: false, message };
    }
  }

  for (const task of scheduledTasks) task.stop();
  scheduledTasks = [];
  const cronExpressions = WHATSAPP_CRON_EXPRESSION
    .split(';')
    .map((expression) => expression.trim())
    .filter(Boolean);
  if (cronExpressions.length === 0) {
    console.error('[WHATSAPP CRON] Automated broadcasts disabled. Set WHATSAPP_CRON_EXPRESSION in the project-root .env file.');
  } else if (cronExpressions.some((expression) => !cron.validate(expression))) {
    console.error(`[WHATSAPP CRON] Automated broadcasts disabled. Invalid WHATSAPP_CRON_EXPRESSION: ${WHATSAPP_CRON_EXPRESSION}`);
  } else {
    scheduledTasks = cronExpressions.map((expression) => cron.schedule(expression, () => {
      const timeLabel = new Date().toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: APP_TIMEZONE,
      });
      console.log(`[WHATSAPP CRON] Running automated daily broadcast at ${timeLabel}...`);
      void sendBroadcast(`scheduled-${timeLabel}`);
    }, { timezone: APP_TIMEZONE }));
  }

  app.get('/api/whatsapp/config', async (_req: Request, res: Response) => {
    let previewMessage = dailyMessageText;
    if (buildExecutiveMessage) {
      try {
        previewMessage = await buildExecutiveMessage();
      } catch {
        // Fall back to default message if DB telemetry is unavailable
      }
    }
    res.json({
      targetPhoneNumber,
      dailyMessageText: previewMessage,
      connectionStatus,
      qrCodeData: currentQrCode,
      connectionError,
      scheduledTime: WHATSAPP_SCHEDULE_LABEL,
    });
  });

  app.post('/api/whatsapp/config', (req: Request, res: Response) => {
    const { number, message } = req.body || {};
    const recipients = parseRecipientNumbers(typeof number === 'string' ? number : '');
    if (recipients.length === 0) {
      res.status(400).json({ success: false, error: 'Add at least one valid WhatsApp recipient number.' });
      return;
    }
    targetPhoneNumber = recipients.join(',');
    setWhatsAppRecipients(recipients);
    if (message) dailyMessageText = String(message).trim();
    writeDiskWhatsAppConfig({ targetPhoneNumber, dailyMessageText });

    if (isLoaderConfigured()) {
      void queryLoader(
        `INSERT INTO settings (key, value)
         VALUES ('whatsapp_config', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify({ targetPhoneNumber, dailyMessageText })],
      ).catch(() => { });
    }

    res.json({
      success: true,
      message: 'Configuration saved and synced.',
      config: { targetPhoneNumber, dailyMessageText, connectionStatus },
    });
  });

  app.post('/api/whatsapp/broadcast-now', async (_req: Request, res: Response) => {
    const outcome = await sendBroadcast('manual-trigger');
    res.status(outcome.success ? 200 : 400).json(outcome);
  });

  app.post('/api/whatsapp/send-message', async (req: Request, res: Response) => {
    const { to, message } = req.body || {};
    const textToSend = String(message || dailyMessageText).trim();
    if (!textToSend) {
      res.status(400).json({ success: false, error: 'Message text cannot be empty.' });
      return;
    }
    const recipients = to
      ? parseRecipientNumbers(String(to))
      : parseRecipientNumbers(targetPhoneNumber);
    if (to && recipients.length === 0) {
      res.status(400).json({ success: false, error: 'Enter at least one valid WhatsApp recipient number.' });
      return;
    }
    try {
      const result = await sendWhatsAppMessage('briefing', textToSend, recipients);
      io.emit('broadcast-success', {
        timestamp: new Date().toISOString(),
        recipient: recipients.join(', ') || 'configured recipients',
        type: 'manual-dispatch',
      });
      res.json({ success: true, message: result.message, recipientCount: result.recipientCount });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: message });
    }
  });

  app.post('/api/whatsapp/pair', (_req: Request, res: Response) => {
    initializeWhatsAppClient(updateConnectionState);
    const state = getWhatsAppSessionState();
    res.json({ success: state.connectionStatus !== 'Connection error', ...state });
  });

  app.post('/api/whatsapp/refresh-qr', async (_req: Request, res: Response) => {
    if (isWhatsAppPairingInProgress()) {
      res.status(409).json({
        success: false,
        error: 'Your phone is still linking this device. Keep WhatsApp open on the phone and wait for it to finish — refreshing now would cancel the link.',
      });
      return;
    }
    try {
      await refreshWhatsAppClient();
      const state = getWhatsAppSessionState();
      res.json({ success: state.connectionStatus !== 'Connection error', qr: state.qrCodeData, ...state });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[WHATSAPP AUTOMATION] Failed to restart WhatsApp Web:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  app.post('/api/whatsapp/disconnect', async (_req: Request, res: Response) => {
    try {
      await disconnectWhatsAppClient();
      res.json({ success: true, status: connectionStatus });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[WHATSAPP AUTOMATION] Failed to unlink WhatsApp Web:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  console.log(`[WHATSAPP AUTOMATION] WhatsApp Web session initialized with Socket.IO; daily schedule: ${scheduledTasks.length ? WHATSAPP_SCHEDULE_LABEL : 'disabled'}.`);
}

export function updateAutomationMessage(newText: string) {
  dailyMessageText = newText;
}

export function getAutomationStatus() {
  return {
    connectionStatus,
    targetPhoneNumber,
    currentQrCode,
  };
}
