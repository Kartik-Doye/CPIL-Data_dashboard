import http from 'http';
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
  parseRecipientNumbers,
  refreshWhatsAppClient,
  setWhatsAppRecipients,
  sendWhatsAppMessage,
} from './whatsappService.js';

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
let scheduledTask: ScheduledTask | null = null;

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

  initializeWhatsAppClient(updateConnectionState);
  updateConnectionState(getWhatsAppSessionState());

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
      const message = triggerType.startsWith('scheduled') && buildExecutiveMessage
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

  if (scheduledTask) scheduledTask.stop();
  scheduledTask = cron.schedule(WHATSAPP_CRON_EXPRESSION, () => {
    const timeLabel = new Date().toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: APP_TIMEZONE,
    });
    console.log(`[WHATSAPP CRON] Running automated daily broadcast at ${timeLabel}...`);
    void sendBroadcast(`scheduled-${timeLabel}`);
  });

  app.get('/api/whatsapp/config', (_req: Request, res: Response) => {
    res.json({
      targetPhoneNumber,
      dailyMessageText,
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

    res.json({
      success: true,
      message: 'Configuration updated successfully.',
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

  console.log(`[WHATSAPP AUTOMATION] WhatsApp Web session initialized with Socket.IO and daily schedule: ${WHATSAPP_SCHEDULE_LABEL}.`);
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
