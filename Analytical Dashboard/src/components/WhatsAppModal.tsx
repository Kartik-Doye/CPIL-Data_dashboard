import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import {
  X,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Send,
  ShieldCheck,
  History,
  QrCode,
  Clock,
  Sparkles,
  Smartphone,
  Check,
} from 'lucide-react';

interface WhatsAppLog {
  id: string;
  timestamp: string;
  type: 'briefing' | 'dispatch' | 'test';
  recipientCount: number;
  recipients: string[];
  status: 'sent' | 'failed';
  summary: string;
  error?: string;
}

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<string>('Connecting (Scan QR)');
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [phone, setPhone] = useState<string>('918087018975');
  const [message, setMessage] = useState<string>(
    '*⚡ GO GAS AUTOMATED DAILY REPORT*\nYesterday sales and collections have been reconciled. Daily telemetry is active.\n_Dispatched via GO Gas WhatsApp Automation Portal_'
  );
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [broadcastLoading, setBroadcastLoading] = useState<boolean>(false);
  const [broadcastResult, setBroadcastResult] = useState<{ message: string; success: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<'portal' | 'logs'>('portal');
  const [logs, setLogs] = useState<WhatsAppLog[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    // Load initial config from REST API
    fetch('/api/whatsapp/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.targetPhoneNumber) setPhone(data.targetPhoneNumber);
        if (data.dailyMessageText) setMessage(data.dailyMessageText);
        if (data.connectionStatus) setStatus(data.connectionStatus);
        if (data.qrCodeData && data.connectionStatus !== 'Ready') {
          setQrCodeData(data.qrCodeData);
        }
      })
      .catch((err) => console.warn('[WhatsApp] Config load warning:', err));

    // Load audit logs
    fetch('/api/whatsapp/logs')
      .then((res) => res.json())
      .then((data) => setLogs(data.logs || []))
      .catch((err) => console.warn('[WhatsApp] Logs load warning:', err));

    // Connect to Socket.IO real-time stream
    const socket: Socket = io({ path: '/socket.io' });

    socket.on('status-update', (latestStatus: string) => {
      setStatus(latestStatus);
      if (latestStatus === 'Ready') {
        setQrCodeData(''); // Wipe QR code once authenticated
      }
    });

    socket.on('qr-code', (qrCodeString: string) => {
      setQrCodeData(qrCodeString);
    });

    socket.on('broadcast-success', (payload: any) => {
      setBroadcastResult({
        message: `Automated broadcast delivered to ${payload.recipient} at ${new Date(payload.timestamp).toLocaleTimeString()}`,
        success: true,
      });
      // Refresh logs
      fetch('/api/whatsapp/logs')
        .then((res) => res.json())
        .then((data) => setLogs(data.logs || []))
        .catch(() => {});
    });

    return () => {
      socket.disconnect();
    };
  }, [isOpen]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phone, message }),
      });
      const data = await response.json();
      if (data.success) {
        setSaveStatus('Configuration updated and saved!');
        setTimeout(() => setSaveStatus(''), 3500);
      }
    } catch {
      setSaveStatus('Error saving configurations.');
    }
  };

  const handleRunBroadcastNow = async () => {
    setBroadcastLoading(true);
    setBroadcastResult(null);
    try {
      const res = await fetch('/api/whatsapp/broadcast-now', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to dispatch broadcast');
      setBroadcastResult({ message: data.message, success: true });
    } catch (err: any) {
      setBroadcastResult({ message: err.message, success: false });
    } finally {
      setBroadcastLoading(false);
    }
  };

  const handlePairDirectly = async () => {
    try {
      await fetch('/api/whatsapp/pair', { method: 'POST' });
      setStatus('Ready');
      setQrCodeData('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleRefreshQr = async () => {
    try {
      const res = await fetch('/api/whatsapp/refresh-qr', { method: 'POST' });
      const data = await res.json();
      setQrCodeData(data.qr);
      setStatus(data.status);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDisconnect = async () => {
    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      const data = await res.json();
      setStatus(data.status);
      handleRefreshQr();
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.97.534 1.769.813 2.796.813h.005c3.18 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.767-5.77-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.634.072-1.802-.411-.979-.406-1.636-1.393-1.685-1.458-.048-.065-.399-.533-.399-1.018 0-.485.253-.724.343-.823.09-.099.196-.124.262-.124.066 0 .132.001.19.004.061.003.143-.023.223.17.082.198.28.684.305.733.025.049.041.107.008.172-.033.065-.05.105-.099.163-.049.058-.103.13-.147.175-.049.049-.1.102-.043.2.057.098.256.422.548.683.376.335.693.438.791.488.098.049.156.041.214-.025.058-.066.246-.288.312-.386.066-.099.132-.082.222-.049.09.033.57.269.668.318.098.049.164.074.188.115.024.041.024.239-.12.644z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>WhatsApp Free Automation Portal</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                  Node.js + Socket.IO
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                100% automated background WhatsApp delivery at 11:00 AM & 07:00 PM daily.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 px-6">
          <button
            onClick={() => setActiveTab('portal')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'portal'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            Automation Settings & QR
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'logs'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Dispatch Log ({logs.length})</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-600 dark:text-slate-300">
          {activeTab === 'portal' ? (
            <>
              {/* Connection Status Box */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        status === 'Ready'
                          ? 'bg-emerald-500 animate-pulse'
                          : status.includes('Scan')
                          ? 'bg-amber-500 animate-pulse'
                          : 'bg-rose-500'
                      }`}
                    />
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">
                      System Status:{' '}
                      <span
                        className={
                          status === 'Ready'
                            ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                            : status.includes('Scan')
                            ? 'text-amber-500 font-bold'
                            : 'text-rose-500 font-bold'
                        }
                      >
                        {status}
                      </span>
                    </span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-orange-400" />
                    <span>Daily Cron Schedule: <strong>11:00 AM & 07:00 PM (Automated)</strong></span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {status !== 'Ready' ? (
                    <button
                      type="button"
                      onClick={handlePairDirectly}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors cursor-pointer text-xs flex items-center gap-1 shadow-xs"
                      title="Pair session directly to enable automated daily delivery"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Pair Account</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-xs cursor-pointer"
                    >
                      Unlink
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRefreshQr}
                    className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Refresh QR code"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Dynamic QR Code Box */}
              {qrCodeData && status !== 'Ready' && (
                <div className="text-center p-5 rounded-xl border border-dashed border-emerald-400/60 dark:border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-3">
                  <div className="flex items-center justify-center gap-2 font-semibold text-slate-900 dark:text-white text-sm">
                    <QrCode className="w-4 h-4 text-emerald-500" />
                    <span>Scan QR Code to Link WhatsApp Account</span>
                  </div>

                  <div className="inline-block p-3 bg-white rounded-xl shadow-md border border-slate-200">
                    <QRCodeSVG value={qrCodeData} size={180} level="M" />
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    Open WhatsApp on your mobile phone &gt; <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong> and point your camera at this code.
                  </p>
                </div>
              )}

              {/* Broadcast Message Settings Form */}
              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                    Daily Broadcast Settings
                  </h4>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Auto-sends at 11:00 AM & 7:00 PM
                  </span>
                </div>

                <label className="block space-y-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>Target Phone Number (Include country code, no + or spaces):</span>
                    <span className="text-[10px] text-slate-400 font-normal">e.g. 918087018975</span>
                  </span>
                  <input
                    type="text"
                    placeholder="e.g. 919876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-mono focus:border-emerald-500 outline-none"
                    required
                  />
                </label>

                <label className="block space-y-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Daily Message Broadcast Copy:
                  </span>
                  <textarea
                    rows={4}
                    placeholder="Write your automated daily update copy here..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:border-emerald-500 outline-none resize-y"
                    required
                  />
                </label>

                <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold transition-colors cursor-pointer text-xs shadow-xs"
                  >
                    Save Configuration
                  </button>

                  <button
                    type="button"
                    onClick={handleRunBroadcastNow}
                    disabled={broadcastLoading || status !== 'Ready'}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-semibold transition-colors cursor-pointer text-xs flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{broadcastLoading ? 'Dispatching...' : 'Broadcast Now (Test)'}</span>
                  </button>
                </div>
              </form>

              {saveStatus && (
                <p className="text-center text-xs text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-300 dark:border-emerald-800">
                  {saveStatus}
                </p>
              )}

              {broadcastResult && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                    broadcastResult.success
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {broadcastResult.success ? (
                    <CheckCircle className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{broadcastResult.message}</span>
                </div>
              )}
            </>
          ) : (
            /* Audit Log View */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Delivery History & Timestamped Logs
                </span>
                <span className="text-[10px] text-slate-400">Past 25 Dispatches</span>
              </div>

              {logs.length > 0 ? (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Time</th>
                        <th className="py-2.5 px-2">Type</th>
                        <th className="py-2.5 px-2">Target</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-sans text-slate-500">
                            {new Date(log.timestamp).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-2 px-2 font-sans font-semibold capitalize text-slate-800 dark:text-slate-200">
                            {log.type}
                          </td>
                          <td className="py-2 px-2 text-slate-600 dark:text-slate-300">
                            {log.recipients.join(', ') || '1 number'}
                          </td>
                          <td className="py-2 px-3 font-sans">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                log.status === 'sent'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-rose-500/10 text-rose-500'
                              }`}
                            >
                              {log.status === 'sent' ? 'Delivered' : 'Failed'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-slate-400 text-center py-8 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-800">
                  No automated broadcasts logged yet.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400">
          <span>GO Gas Automated WhatsApp Engine (Port 3000 / Socket.IO)</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
