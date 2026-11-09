import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cron, { ScheduledTask } from 'node-cron';
import type { Express, NextFunction, Request, Response } from 'express';
import {
  disconnectWhatsAppClient,
  getWhatsAppSessionState,
  initializeWhatsAppClient,
  parseRecipientNumbers,
  refreshWhatsAppClient,
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
let dailyMessageText = '*⚡ GO GAS AUTOMATED DAILY REPORT*\nYesterday sales and collections have been reconciled. Daily telemetry is active.\n_Dispatched via GO Gas WhatsApp Automation Portal_';
let ioInstance: SocketIOServer | null = null;
let scheduledTask: ScheduledTask | null = null;

function isLoopbackAddress(address = '') {
  const normalized = address.toLowerCase();
  return normalized === '::1' ||
    normalized === '127.0.0.1' ||
    normalized.startsWith('127.') ||
    normalized.startsWith('::ffff:127.');
}

function isLocalOrigin(origin?: string) {
  if (!origin) return true;
  const port = process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : '3000';
  return [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://[::1]:${port}`,
  ].includes(origin);
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

export function initWhatsAppAutomation(app: Express, server: http.Server) {
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
      const result = await sendWhatsAppMessage('briefing', dailyMessageText, recipients);
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
  scheduledTask = cron.schedule('0 11,19 * * *', () => {
    const timeLabel = new Date().getHours() < 15 ? '11:00 AM' : '07:00 PM';
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
      scheduledTime: '11:00 AM & 07:00 PM Daily',
    });
  });

  app.post('/api/whatsapp/config', (req: Request, res: Response) => {
    const { number, message } = req.body || {};
    if (number) {
      const recipients = parseRecipientNumbers(String(number));
      if (recipients.length === 0) {
        res.status(400).json({ success: false, error: 'Enter at least one valid WhatsApp recipient number.' });
        return;
      }
      targetPhoneNumber = recipients.join(',');
    }
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

  console.log('[WHATSAPP AUTOMATION] WhatsApp Web session initialized with Socket.IO and an 11:00 AM / 07:00 PM daily cron schedule.');
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
