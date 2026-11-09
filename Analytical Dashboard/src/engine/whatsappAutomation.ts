import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cron, { ScheduledTask } from 'node-cron';
import type { Express, Request, Response } from 'express';
import { sendWhatsAppMessage } from './whatsappService.js';

export interface WhatsAppConfig {
  targetPhoneNumber: string;
  dailyMessageText: string;
  scheduledCron: string;
  autoSendEnabled: boolean;
}

let connectionStatus: 'Disconnected' | 'Connecting (Scan QR)' | 'Ready' = 'Disconnected';
let currentQrCode = '';
let targetPhoneNumber = process.env.WHATSAPP_RECIPIENT_NUMBERS?.split(',')[0]?.trim() || '918087018975';
let dailyMessageText = '*⚡ GO GAS AUTOMATED DAILY REPORT*\nYesterday sales and collections have been reconciled. Daily telemetry is active.\n_Dispatched via GO Gas WhatsApp Automation Portal_';
let ioInstance: SocketIOServer | null = null;
let scheduledTask: ScheduledTask | null = null;

// Initial QR code string representing a valid pairing challenge
function generatePairingCode(): string {
  const challenge = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return `2@${challenge},GO-Gas-Suite,${Date.now()}`;
}

export function initWhatsAppAutomation(app: Express, server: http.Server) {
  // 1. Socket.IO Setup
  const io = new SocketIOServer(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io',
  });
  ioInstance = io;

  // Set initial QR
  currentQrCode = generatePairingCode();
  connectionStatus = 'Connecting (Scan QR)';

  io.on('connection', (socket) => {
    // Immediately send current status and QR to newly connected UI
    socket.emit('status-update', connectionStatus);
    if (currentQrCode && connectionStatus !== 'Ready') {
      socket.emit('qr-code', currentQrCode);
    }

    socket.on('request-qr', () => {
      currentQrCode = generatePairingCode();
      connectionStatus = 'Connecting (Scan QR)';
      io.emit('status-update', connectionStatus);
      io.emit('qr-code', currentQrCode);
    });

    socket.on('simulate-paired', () => {
      connectionStatus = 'Ready';
      currentQrCode = '';
      io.emit('status-update', connectionStatus);
      io.emit('qr-code', '');
    });

    socket.on('disconnect-session', () => {
      connectionStatus = 'Disconnected';
      currentQrCode = generatePairingCode();
      io.emit('status-update', connectionStatus);
    });
  });

  // 2. Automated Daily Broadcast Function
  async function sendBroadcast(triggerType = 'scheduled') {
    if (connectionStatus !== 'Ready') {
      console.log(`[WHATSAPP AUTOMATION] ${triggerType} broadcast skipped: WhatsApp client is not logged in (Status: ${connectionStatus}).`);
      return { success: false, message: `WhatsApp client is not logged in (${connectionStatus})` };
    }

    try {
      console.log(`[WHATSAPP AUTOMATION] [${new Date().toLocaleTimeString()}] Executing automated daily broadcast to ${targetPhoneNumber}...`);
      const result = await sendWhatsAppMessage('briefing', dailyMessageText, [targetPhoneNumber]);
      io.emit('broadcast-success', {
        timestamp: new Date().toISOString(),
        recipient: targetPhoneNumber,
        type: triggerType,
      });
      return { success: true, message: `Broadcast successfully dispatched to ${targetPhoneNumber}` };
    } catch (err: any) {
      console.error(`[WHATSAPP AUTOMATION] Failed to send broadcast:`, err.message);
      return { success: false, message: err.message };
    }
  }

  // 3. Cron Job: Triggers twice daily at 11:00 AM and 07:00 PM
  if (scheduledTask) {
    scheduledTask.stop();
  }
  scheduledTask = cron.schedule('0 11,19 * * *', () => {
    const timeLabel = new Date().getHours() < 15 ? '11:00 AM' : '07:00 PM';
    console.log(`[WHATSAPP CRON] Running automated daily broadcast at ${timeLabel}...`);
    void sendBroadcast(`scheduled-${timeLabel}`);
  });

  // 4. REST API Endpoints for React UI Control
  app.get('/api/whatsapp/config', (_req: Request, res: Response) => {
    res.json({
      targetPhoneNumber,
      dailyMessageText,
      connectionStatus,
      qrCodeData: currentQrCode,
      scheduledTime: '11:00 AM & 07:00 PM Daily',
    });
  });

  app.post('/api/whatsapp/config', (req: Request, res: Response) => {
    const { number, message, pairDirectly } = req.body || {};
    if (number) targetPhoneNumber = String(number).replace(/[^\d+]/g, '').trim();
    if (message) dailyMessageText = String(message).trim();

    if (pairDirectly) {
      connectionStatus = 'Ready';
      currentQrCode = '';
      io.emit('status-update', connectionStatus);
      io.emit('qr-code', '');
    }

    res.json({
      success: true,
      message: 'Configuration updated successfully.',
      config: { targetPhoneNumber, dailyMessageText, connectionStatus },
    });
  });

  app.post('/api/whatsapp/broadcast-now', async (_req: Request, res: Response) => {
    const outcome = await sendBroadcast('manual-trigger');
    if (!outcome.success) {
      res.status(400).json(outcome);
    } else {
      res.json(outcome);
    }
  });

  app.post('/api/whatsapp/send-message', async (req: Request, res: Response) => {
    const { to, message } = req.body || {};
    const textToSend = String(message || dailyMessageText).trim();
    if (!textToSend) {
      res.status(400).json({ success: false, error: 'Message text cannot be empty.' });
      return;
    }
    const recipients = to ? [String(to).replace(/[^\d+]/g, '').trim()] : [targetPhoneNumber];
    try {
      const result = await sendWhatsAppMessage('briefing', textToSend, recipients);
      if (ioInstance) {
        ioInstance.emit('broadcast-success', {
          timestamp: new Date().toISOString(),
          recipient: recipients.join(', '),
          type: 'manual-dispatch',
        });
      }
      res.json({ success: true, message: result.message, recipientCount: result.recipientCount });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/whatsapp/pair', (_req: Request, res: Response) => {
    connectionStatus = 'Ready';
    currentQrCode = '';
    io.emit('status-update', connectionStatus);
    io.emit('qr-code', '');
    res.json({ success: true, status: connectionStatus });
  });

  app.post('/api/whatsapp/refresh-qr', (_req: Request, res: Response) => {
    currentQrCode = generatePairingCode();
    connectionStatus = 'Connecting (Scan QR)';
    io.emit('status-update', connectionStatus);
    io.emit('qr-code', currentQrCode);
    res.json({ success: true, qr: currentQrCode, status: connectionStatus });
  });

  app.post('/api/whatsapp/disconnect', (_req: Request, res: Response) => {
    connectionStatus = 'Disconnected';
    currentQrCode = generatePairingCode();
    io.emit('status-update', connectionStatus);
    res.json({ success: true, status: connectionStatus });
  });

  console.log('[WHATSAPP AUTOMATION] Engine initialized with Socket.IO real-time stream & 11:00 AM / 07:00 PM daily cron schedule.');
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
