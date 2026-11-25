import React, { useState, useEffect } from 'react';
import {
  FileText,
  Copy,
  Check,
  Share2,
  AlertOctagon,
  TrendingDown,
  Flame,
  Clock,
  Sparkles,
  MapPin,
  ShieldAlert,
  Mail,
  LoaderCircle,
  Settings,
} from 'lucide-react';
import { ExecutiveTelemetry } from '../types';
import productConfig from '../../../product-config.json';
import { buildExecutiveWhatsAppMessage } from '../engine/whatsappBriefing.js';

interface DailyBriefingProps {
  data: ExecutiveTelemetry;
}

export const DailyBriefing: React.FC<DailyBriefingProps> = ({ data }) => {
  const [copied, setCopied] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ message: string; success: boolean } | null>(null);
  const [whatsAppSending, setWhatsAppSending] = useState(false);
  const [whatsAppStatus, setWhatsAppStatus] = useState<{ message: string; success: boolean } | null>(null);
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState<boolean>(false);
  const [senderEmailDraft, setSenderEmailDraft] = useState('');
  const [recipientEmailsDraft, setRecipientEmailsDraft] = useState('');
  const [appPasswordDraft, setAppPasswordDraft] = useState('');
  const [hasSavedAppPassword, setHasSavedAppPassword] = useState(false);
  const [emailConfigSaving, setEmailConfigSaving] = useState(false);

  useEffect(() => {
    fetch('/api/email/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((info) => {
        if (!info) return;
        setEmailConfigured(Boolean(info.configured));
        if (info.senderEmail) setSenderEmailDraft(info.senderEmail);
        if (info.recipientEmails) setRecipientEmailsDraft(info.recipientEmails);
        setHasSavedAppPassword(Boolean(info.hasPassword));
      })
      .catch(() => {});
  }, []);

  const handleSaveEmailConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailConfigSaving(true);
    setEmailStatus(null);
    try {
      const res = await fetch('/api/email/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-go-gas-email-request': 'authorized-client',
        },
        body: JSON.stringify({
          senderEmail: senderEmailDraft,
          recipientEmails: recipientEmailsDraft,
          appPassword: appPasswordDraft || undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to save email settings.');
      setEmailConfigured(Boolean(payload.configured));
      setHasSavedAppPassword(Boolean(payload.hasPassword));
      setAppPasswordDraft('');
      setEmailStatus({ message: 'Email schedule & SMTP configuration saved (02:15 PM & 06:30 PM Daily active).', success: true });
      setShowEmailSettings(false);
    } catch (err) {
      setEmailStatus({ message: err instanceof Error ? err.message : String(err), success: false });
    } finally {
      setEmailConfigSaving(false);
    }
  };
  const qty = (value: number) => value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const rupees = (value: number) => `₹${qty(value)}`;

  const generateBriefingText = () => {
    return buildExecutiveWhatsAppMessage(data);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateBriefingText());
    setCopied(true);
    setTimeout(() => setCopied(false), productConfig.ui.copyNoticeDurationMs);
  };

  const handleSendEmail = async () => {
    setEmailSending(true);
    setEmailStatus(null);
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'X-GO-Gas-Email-Request': 'authorized-client' },
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json() as { message?: string; error?: string }
        : null;

      if (!response.ok) {
        throw new Error(payload?.error || `Email request failed (HTTP ${response.status}).`);
      }
      if (!payload?.message) {
        throw new Error('The server returned an invalid email response.');
      }
      setEmailStatus({ message: payload.message, success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setEmailStatus({ message: `Email not sent: ${message}`, success: false });
    } finally {
      setEmailSending(false);
    }
  };

  const handleSendWhatsApp = async () => {
    setWhatsAppSending(true);
    setWhatsAppStatus(null);
    try {
      const response = await fetch('/api/whatsapp/send-briefing', {
        method: 'POST',
        headers: {
          'x-go-gas-whatsapp-request': 'authorized-client',
        },
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json() as { message?: string; error?: string }
        : null;

      if (!response.ok) {
        throw new Error(payload?.error || `WhatsApp request failed (HTTP ${response.status}).`);
      }
      if (!payload?.message) {
        throw new Error('The server returned an invalid WhatsApp response.');
      }
      setWhatsAppStatus({ message: payload.message, success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWhatsAppStatus({ message: `WhatsApp not sent: ${message}`, success: false });
    } finally {
      setWhatsAppSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Briefing Top Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Daily 30-Second Executive Briefing</h2>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                  Ready to Dispatch
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Condensed management intelligence formulated for CMD, MD, State Heads, and TMs (Auto-dispatches at {productConfig.email.scheduleLabel}).
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleCopy}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-md cursor-pointer ${
                  copied
                    ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                    : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/30'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>

              <button
                onClick={handleSendWhatsApp}
                disabled={whatsAppSending}
                title="Dispatches the executive summary directly via WhatsApp to configured stakeholders."
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 dark:disabled:bg-slate-700 disabled:text-slate-100 dark:disabled:text-slate-400 text-white transition-colors cursor-pointer disabled:cursor-wait shadow-xs"
              >
                {whatsAppSending ? (
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                ) : (
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.97.534 1.769.813 2.796.813h.005c3.18 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.767-5.77-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.634.072-1.802-.411-.979-.406-1.636-1.393-1.685-1.458-.048-.065-.399-.533-.399-1.018 0-.485.253-.724.343-.823.09-.099.196-.124.262-.124.066 0 .132.001.19.004.061.003.143-.023.223.17.082.198.28.684.305.733.025.049.041.107.008.172-.033.065-.05.105-.099.163-.049.058-.103.13-.147.175-.049.049-.1.102-.043.2.057.098.256.422.548.683.376.335.693.438.791.488.098.049.164.074.188.115.024.041.024.239-.12.644z" />
                  </svg>
                )}
                <span>{whatsAppSending ? 'Sending WhatsApp...' : 'Send WhatsApp Flash'}</span>
              </button>

              <button
                onClick={handleSendEmail}
                disabled={emailSending}
                title="Sends the current executive summary + 4-sheet Excel workbook to configured recipient(s)."
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-700 hover:bg-sky-600 disabled:bg-slate-400 dark:disabled:bg-slate-700 disabled:text-slate-100 dark:disabled:text-slate-400 text-white transition-colors cursor-pointer disabled:cursor-wait"
              >
                {emailSending ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                <span>{emailSending ? 'Sending Email...' : 'Send Test Email'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowEmailSettings((v) => !v)}
                title="Configure Gmail SMTP sender, App Password, and recipients for 02:15 PM & 06:30 PM automated Excel workbook emails"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  emailConfigured
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{emailConfigured ? 'Email Active' : 'Setup Email'}</span>
              </button>
            </div>

            {whatsAppStatus && (
              <p
                role="status"
                aria-live="polite"
                className={`max-w-md text-xs ${whatsAppStatus.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
              >
                {whatsAppStatus.message}
              </p>
            )}

            {emailStatus && (
              <p
                role="status"
                aria-live="polite"
                className={`max-w-md text-xs ${emailStatus.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
              >
                {emailStatus.message}
              </p>
            )}
            <p className="text-[10px] text-slate-500">
              Auto-schedules Email Workbook &amp; WhatsApp Flash at <strong>02:15 PM &amp; 06:30 PM Daily</strong>.
            </p>
          </div>
        </div>

        {showEmailSettings && (
          <form onSubmit={handleSaveEmailConfig} className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <label className="space-y-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300 block">Sender Gmail Address</span>
              <input
                type="email"
                required
                placeholder="desk@gogas.com"
                value={senderEmailDraft}
                onChange={(e) => setSenderEmailDraft(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                Gmail App Password {hasSavedAppPassword ? '(Saved • enter to replace)' : '(16-char)'}
              </span>
              <input
                type="password"
                required={!hasSavedAppPassword}
                placeholder={hasSavedAppPassword ? '••••••••••••••••' : 'xxxx xxxx xxxx xxxx'}
                value={appPasswordDraft}
                onChange={(e) => setAppPasswordDraft(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs"
              />
            </label>
            <label className="space-y-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300 block">Recipient Emails (comma-separated)</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="cmd@gogas.com, md@gogas.com"
                  value={recipientEmailsDraft}
                  onChange={(e) => setRecipientEmailsDraft(e.target.value)}
                  className="min-w-0 flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs"
                />
                <button
                  type="submit"
                  disabled={emailConfigSaving}
                  className="px-3.5 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-white font-semibold cursor-pointer shrink-0"
                >
                  {emailConfigSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </label>
          </form>
        )}
      </div>

      {/* Snapshot Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Yesterday's Outcome */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs transition-colors">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" />
            <span>Operational Outcome</span>
          </h3>
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-600 dark:text-slate-300">Total Volume Sold:</span>
              <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                {qty(data.total_sale_qty)} L
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-600 dark:text-slate-300">Total Collections:</span>
              <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                ₹{(data.total_collection / 10000000).toFixed(2)} Cr
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-600 dark:text-slate-300">Effective RSP:</span>
              <span className="text-xs font-mono text-slate-800 dark:text-slate-200">
                ₹{data.effective_rsp.toFixed(2)}/L
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-600 dark:text-slate-300">Collection Gap:</span>
              <span className="text-xs font-mono text-amber-600 dark:text-amber-400">
                ₹{data.collection_gap_per_l.toFixed(2)}/L
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Today's Forecast */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs transition-colors">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
            <span>Today's Forecast</span>
          </h3>
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-600 dark:text-slate-300">Predicted Volume:</span>
              <span className="text-sm font-bold font-mono text-indigo-600 dark:text-indigo-300">
                {data.forecast?.forecast?.[0]
                  ? `${qty(data.forecast.forecast[0].predicted_qty)} L`
                  : 'Not available'}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-600 dark:text-slate-300">Confidence Range:</span>
              <span className="text-xs font-mono text-slate-800 dark:text-slate-200">
                {data.forecast?.forecast?.[0]
                  ? `${qty(data.forecast.forecast[0].lower_bound)} - ${qty(data.forecast.forecast[0].upper_bound)} L`
                  : 'Not available'}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-600 dark:text-slate-300">7-Day Projected Total:</span>
              <span className="text-xs font-mono text-emerald-600 dark:text-emerald-300">
                {qty(data.forecast?.predicted_total_7d || 0)} L
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-600 dark:text-slate-300">Historical Accuracy:</span>
              <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
                {data.forecast?.mape_ensemble == null
                  ? 'Not available'
                  : `${Math.max(0, 100 - data.forecast.mape_ensemble).toFixed(1)}% (${data.forecast.days_available}d DB / ${data.forecast.backtest_days ?? 0}d scored)`}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Priority Intervention */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs transition-colors">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
            <span>Priority Interventions</span>
          </h3>
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-600 dark:text-slate-300">Stockout Risk (&lt;3d):</span>
              <span className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400">
                {data.stockout_risk_stations.length} Stations
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-600 dark:text-slate-300">Zero-Sale Stations:</span>
              <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
                {data.zero_sale_count} Stations
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-600 dark:text-slate-300">Consecutive Declining:</span>
              <span className="text-xs font-mono text-rose-600 dark:text-rose-300">
                {data.top_declining_stations.length} Stations
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-600 dark:text-slate-300">Active Station Ratio:</span>
              <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                {((data.stations_with_sale / data.stations_total) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stockout Warnings Table */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-500 dark:text-rose-400" />
            <span>Stock-Out Warnings: Stations with &lt; 3 Days Fuel Remaining</span>
          </h3>
          <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">Action: Tanker Dispatch Needed</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950/70 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Cost Code</th>
                <th className="py-2.5 px-3">Station Name</th>
                <th className="py-2.5 px-3">State</th>
                <th className="py-2.5 px-3 text-right">Closing Dip (L)</th>
                <th className="py-2.5 px-3 text-right">Daily Burn (L)</th>
                <th className="py-2.5 px-3 text-center">Days of Stock</th>
                <th className="py-2.5 px-3">Status / Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {data.stockout_risk_stations.map((st) => (
                <tr key={st.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-2 px-3 font-mono text-orange-600 dark:text-orange-400 font-medium">{st.code}</td>
                  <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">{st.name}</td>
                  <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{st.state}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-800 dark:text-slate-200">
                    {st.stock_ltr.toLocaleString('en-IN')}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-500 dark:text-slate-400">
                    {st.daily_burn_ltr.toLocaleString('en-IN')}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-xs ${
                        st.days_left < 1.5
                          ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                          : 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                      }`}
                    >
                      {st.days_left} Days
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-600 dark:text-slate-300 italic">{st.remark}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zero Sale Stations Table */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            <span>Zero-Sale Stations Reported Today</span>
          </h3>
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">{data.zero_sale_count} Stations</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950/70 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Cost Code</th>
                <th className="py-2.5 px-3">ALDS Name</th>
                <th className="py-2.5 px-3">State</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Coordinator</th>
                <th className="py-2.5 px-3">TM</th>
                <th className="py-2.5 px-3">Stated Reason (Remark)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {data.zero_sale_stations.map((st) => (
                <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-2 px-3 font-mono text-amber-600 dark:text-amber-400 font-medium">{st.erp_code}</td>
                  <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">{st.alds_name}</td>
                  <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{st.state}</td>
                  <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{st.type}</td>
                  <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{st.coordinator}</td>
                  <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{st.tm}</td>
                  <td className="py-2 px-3 text-rose-600 dark:text-rose-300 font-medium">
                    {st.remark || 'Zero volume reported (Unspecified)'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raw WhatsApp Preview Box */}
      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Ready-to-Send WhatsApp Text Preview</span>
          </span>
          <button
            onClick={handleCopy}
            className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-500 dark:hover:text-orange-300 font-medium cursor-pointer"
          >
            Copy Text
          </button>
        </div>
        <pre className="text-xs font-mono text-slate-800 dark:text-slate-300 bg-white dark:bg-slate-900/90 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-200 dark:border-slate-800">
          {generateBriefingText()}
        </pre>
      </div>
    </div>
  );
};
