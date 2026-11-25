import React, { useState, useEffect } from 'react';
import { Users, Award, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Search, Target, ShieldCheck, Banknote, Share2, Check, Copy, Phone, Send, LoaderCircle, Settings } from 'lucide-react';
import { TMSummary, ExecutiveTelemetry, StationRecord } from '../types';
import { fmtQty, fmtCurrency } from '../engine/formatting';
import { buildTmPersonalizedWhatsAppBrief } from '../engine/whatsappBriefing';

interface TMLeaderboardProps {
  tms: TMSummary[];
  stations?: StationRecord[];
  date?: string;
  isCompact?: boolean;
  tmTargetMeta?: ExecutiveTelemetry['tm_target_meta'];
}

export const TMLeaderboard: React.FC<TMLeaderboardProps> = ({
  tms,
  stations = [],
  date = new Date().toISOString().slice(0, 10),
  isCompact = false,
  tmTargetMeta,
}) => {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'below_target' | 'declining_3m' | 'cash_heavy'>('all');
  const [sortBy, setSortBy] = useState<'total_sale_qty' | 'avg_daily_sale' | 'efficiency_pct' | 'daily_target' | 'three_month_change_pct' | 'cash_pct'>('total_sale_qty');
  const [copiedTmBrief, setCopiedTmBrief] = useState<{ tm: string; text: string } | null>(null);
  const [showTmDirectory, setShowTmDirectory] = useState(false);
  const [tmContacts, setTmContacts] = useState<Record<string, string>>({});
  const [autoSendDaily, setAutoSendDaily] = useState(false);
  const [autoOnlyBelowTarget, setAutoOnlyBelowTarget] = useState(true);
  const [savingContacts, setSavingContacts] = useState(false);
  const [sendingTm, setSendingTm] = useState<string | null>(null);
  const [batchSending, setBatchSending] = useState(false);
  const [tmDispatchNotice, setTmDispatchNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/tm-contacts')
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!payload) return;
        if (payload.contacts && typeof payload.contacts === 'object') {
          setTmContacts(payload.contacts);
        }
        setAutoSendDaily(Boolean(payload.autoSendDaily));
        if (payload.autoOnlyBelowTarget !== undefined) {
          setAutoOnlyBelowTarget(Boolean(payload.autoOnlyBelowTarget));
        }
      })
      .catch(() => { });
  }, []);

  const handleSaveTmDirectory = async () => {
    setSavingContacts(true);
    setTmDispatchNotice(null);
    try {
      const res = await fetch('/api/tm-contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-go-gas-whatsapp-request': 'authorized-client',
        },
        body: JSON.stringify({
          contacts: tmContacts,
          autoSendDaily,
          autoOnlyBelowTarget,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed to save TM directory.');
      setTmContacts(payload.contacts || {});
      setTmDispatchNotice({
        text: `Saved ${Object.keys(payload.contacts || {}).length} TM WhatsApp number(s)${payload.autoSendDaily ? ' with 02:15 PM & 06:30 PM auto-dispatch active' : ''}.`,
        ok: true,
      });
    } catch (err) {
      setTmDispatchNotice({ text: err instanceof Error ? err.message : String(err), ok: false });
    } finally {
      setSavingContacts(false);
    }
  };

  const handleSendTmWhatsAppDirect = async (tmName: string) => {
    if (!tmContacts[tmName]?.trim()) {
      setShowTmDirectory(true);
      setTmDispatchNotice({
        text: `Assign a WhatsApp number for TM ${tmName} below and click Save Directory to enable 1-click dispatch.`,
        ok: false,
      });
      return;
    }
    setSendingTm(tmName);
    setTmDispatchNotice(null);
    try {
      const res = await fetch('/api/whatsapp/send-tm-brief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-go-gas-whatsapp-request': 'authorized-client',
        },
        body: JSON.stringify({ tm: tmName, phone: tmContacts[tmName] }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `Dispatch failed (HTTP ${res.status}).`);
      setTmDispatchNotice({ text: payload.message, ok: true });
    } catch (err) {
      setTmDispatchNotice({ text: err instanceof Error ? err.message : String(err), ok: false });
    } finally {
      setSendingTm(null);
    }
  };

  const handleSendBatchBelowTarget = async () => {
    setBatchSending(true);
    setTmDispatchNotice(null);
    try {
      const res = await fetch('/api/whatsapp/send-tm-brief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-go-gas-whatsapp-request': 'authorized-client',
        },
        body: JSON.stringify({ batchMode: 'below_target' }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `Batch dispatch failed (HTTP ${res.status}).`);
      setTmDispatchNotice({ text: payload.message, ok: true });
    } catch (err) {
      setTmDispatchNotice({ text: err instanceof Error ? err.message : String(err), ok: false });
    } finally {
      setBatchSending(false);
    }
  };

  const handleCopyTmWhatsApp = (tmName: string) => {
    const text = buildTmPersonalizedWhatsAppBrief(
      tmName,
      stations,
      date,
      tmTargetMeta?.period_label || 'Monthly Daily Target',
    );
    navigator.clipboard.writeText(text);
    setCopiedTmBrief({ tm: tmName, text });
  };

  const filtered = tms
    .filter((t) => {
      const matchText =
        t.tm.toLowerCase().includes(search.toLowerCase()) ||
        t.coordinator.toLowerCase().includes(search.toLowerCase());
      if (!matchText) return false;
      if (filterMode === 'below_target') {
        return (t.daily_target ?? 0) > 0 && t.total_sale_qty < (t.daily_target ?? 0);
      }
      if (filterMode === 'declining_3m') {
        return (t.three_month_change_pct ?? 0) < 0;
      }
      if (filterMode === 'cash_heavy') {
        return (t.cash_pct ?? 0) >= 60;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'three_month_change_pct') {
        return (a.three_month_change_pct ?? 0) - (b.three_month_change_pct ?? 0);
      }
      return (Number(b[sortBy]) || 0) - (Number(a[sortBy]) || 0);
    });

  const topTM = [...tms].sort((a, b) => b.total_sale_qty - a.total_sale_qty)[0];
  const totalVolume = tms.reduce((a, b) => a + b.total_sale_qty, 0);
  const totalDailyTarget = tms.reduce((a, b) => a + (b.daily_target || 0), 0);
  const overallAchievementPct = totalDailyTarget > 0
    ? Number(((totalVolume / totalDailyTarget) * 100).toFixed(1))
    : 0;
  const belowTargetTmCount = tms.filter((t) => (t.daily_target ?? 0) > 0 && t.total_sale_qty < (t.daily_target ?? 0)).length;
  const declining3mTmCount = tms.filter((t) => (t.three_month_change_pct ?? 0) < 0).length;
  const totalPaytm = tms.reduce((a, b) => a + (b.total_paytm || 0), 0);
  const totalCash = tms.reduce((a, b) => a + (b.total_cash || 0), 0);
  const totalPayment = Math.max(1, totalPaytm + totalCash);
  const networkDigitalPct = Number(((totalPaytm / totalPayment) * 100).toFixed(1));
  const networkCashPct = Number(((totalCash / totalPayment) * 100).toFixed(1));

  // SVG Chart for TM Daily Target vs Actual & 3-Month Starting Baseline
  const chartTms = filtered.slice(0, 16);
  const maxChartVal = Math.max(
    ...chartTms.flatMap((t) => [
      t.daily_target || 0,
      t.total_sale_qty || 0,
      t.starting_month_avg_daily || 0,
    ]),
    1000,
  ) * 1.1;

  return (
    <div className="space-y-5">
      {/* Header & KPI Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Territory Manager Daily Target, 3-Month Trend &amp; Payment Mix Leaderboard
                  </h2>
                  <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30">
                    {tmTargetMeta?.source_file || 'TM Target Daily.xlsx'} • {tmTargetMeta?.period_label || 'Monthly Daily Target'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Audits each TM against their daily target from <code className="font-mono">TM Target Daily.xlsx</code>, 3-month historical trend ({tmTargetMeta?.historical_month_labels?.join(' → ') || 'Last 3 Months'}), and Digital vs Cash payment security.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {totalDailyTarget > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                <Target className="w-5 h-5 text-indigo-500 shrink-0" />
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">
                    Network Daily Target vs Actual
                  </span>
                  <span className="font-bold font-mono text-slate-900 dark:text-white">
                    {fmtQty(totalVolume)} L / {fmtQty(totalDailyTarget)} L
                  </span>
                  <span
                    className={`ml-1.5 font-mono font-bold ${overallAchievementPct >= 100
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : overallAchievementPct >= 90
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                  >
                    ({overallAchievementPct}%)
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-xs">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold block text-[10px]">
                  Digital vs Cash Payment Split
                </span>
                <span className="font-bold font-mono text-slate-900 dark:text-white">
                  {networkDigitalPct}% Digital
                </span>
                <span className="text-slate-500 dark:text-slate-400 mx-1">•</span>
                <span className="font-bold font-mono text-amber-600 dark:text-amber-400">
                  {networkCashPct}% Cash
                </span>
              </div>
            </div>

            {topTM && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30">
                <Award className="w-6 h-6 text-amber-500 shrink-0" />
                <div className="text-xs">
                  <span className="text-amber-700 dark:text-amber-400 font-semibold block">#1 Top Performing TM</span>
                  <span className="font-bold text-slate-900 dark:text-white">{topTM.tm}</span>
                  <span className="text-slate-500 dark:text-slate-400 ml-1 font-mono">
                    ({fmtQty(topTM.total_sale_qty)} L • {topTM.efficiency_pct}% of Tgt)
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interactive TM Target vs Actual & 3-Month Starting Month SVG Bar Chart */}
      {chartTms.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                TM Daily Target vs Actual Sold &amp; 3-Month Starting Baseline (L/day)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Compares each TM&apos;s Starting Month Avg Daily ({chartTms[0]?.starting_month_label || 'Aug. 26'}), Current Daily Target ({tmTargetMeta?.period_label || 'Daily Target'}), and Actual Sold Today.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2.5 rounded-xs bg-slate-400 inline-block" />
                <span>Start Month ({chartTms[0]?.starting_month_label || 'M1'})</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2.5 rounded-xs bg-amber-500 inline-block" />
                <span>Daily Target</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2.5 rounded-xs bg-indigo-600 inline-block" />
                <span>Actual Sold (Met)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2.5 rounded-xs bg-rose-500 inline-block" />
                <span>Actual Sold (Below Target)</span>
              </span>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <div className="min-w-[740px]">
              <svg viewBox="0 0 960 270" className="w-full h-auto select-none">
                {/* Y-axis & Horizontal Gridlines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const val = Math.round(maxChartVal * ratio);
                  const y = 210 - ratio * 180;
                  return (
                    <g key={`grid-${ratio}`}>
                      <line
                        x1="68"
                        y1={y}
                        x2="940"
                        y2={y}
                        className="stroke-slate-200 dark:stroke-slate-800"
                        strokeDasharray={ratio === 0 ? undefined : '4 4'}
                        strokeWidth="1"
                      />
                      <text
                        x="62"
                        y={y + 3.5}
                        textAnchor="end"
                        className="fill-slate-500 dark:fill-slate-400 text-[9.5px] font-mono"
                      >
                        {val >= 1000 ? `${(val / 1000).toFixed(0)}k L` : `${val} L`}
                      </text>
                    </g>
                  );
                })}
                <line x1="68" y1="25" x2="68" y2="210" className="stroke-slate-300 dark:stroke-slate-700" strokeWidth="1.5" />
                <line x1="68" y1="210" x2="940" y2="210" className="stroke-slate-300 dark:stroke-slate-700" strokeWidth="1.5" />

                {chartTms.map((t, idx) => {
                  const groupWidth = (940 - 78) / Math.max(chartTms.length, 1);
                  const gx = 76 + idx * groupWidth;
                  const barW = Math.min(13, Math.max(6, (groupWidth - 10) / 3));
                  const m1Val = t.starting_month_avg_daily || 0;
                  const tgtVal = t.daily_target || 0;
                  const actVal = t.total_sale_qty || 0;
                  const hM1 = (m1Val / maxChartVal) * 180;
                  const hTgt = (tgtVal / maxChartVal) * 180;
                  const hAct = (actVal / maxChartVal) * 180;
                  const met = tgtVal > 0 && actVal >= tgtVal;

                  return (
                    <g key={`tm-bar-${t.tm}`}>
                      {/* Start Month Avg Daily bar */}
                      <rect
                        x={gx}
                        y={210 - hM1}
                        width={barW}
                        height={Math.max(1, hM1)}
                        rx="2"
                        fill="#94A3B8"
                      />
                      {/* Daily Target bar */}
                      <rect
                        x={gx + barW + 2}
                        y={210 - hTgt}
                        width={barW}
                        height={Math.max(1, hTgt)}
                        rx="2"
                        fill="#F59E0B"
                      />
                      {/* Actual Sold bar */}
                      <rect
                        x={gx + (barW + 2) * 2}
                        y={210 - hAct}
                        width={barW}
                        height={Math.max(1, hAct)}
                        rx="2"
                        fill={met ? '#4F46E5' : '#F43F5E'}
                      />
                      {/* TM Label */}
                      <text
                        transform={`translate(${gx + barW * 1.5}, 220) rotate(-28)`}
                        textAnchor="end"
                        className="fill-slate-700 dark:fill-slate-300 text-[9.5px] font-sans font-semibold"
                      >
                        {t.tm.length > 13 ? `${t.tm.slice(0, 12)}…` : t.tm}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Controls & Quick Diagnostic Filters */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search TM or Coordinator..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none"
            />
          </div>

          <button
            onClick={() => setFilterMode('all')}
            className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${filterMode === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
          >
            All TMs ({tms.length})
          </button>
          <button
            onClick={() => setFilterMode('below_target')}
            className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${filterMode === 'below_target'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
              }`}
          >
            Not Achieving Daily Target ({belowTargetTmCount})
          </button>
          <button
            onClick={() => setFilterMode('declining_3m')}
            className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${filterMode === 'declining_3m'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
              }`}
          >
            3-Month Declining Trend ({declining3mTmCount})
          </button>
          <button
            onClick={() => setFilterMode('cash_heavy')}
            className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${filterMode === 'cash_heavy'
                ? 'bg-indigo-600 text-white'
                : 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30'
              }`}
          >
            High Cash &ge;60%
          </button>
          <button
            type="button"
            onClick={() => setShowTmDirectory((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>TM WhatsApp Directory ({Object.values(tmContacts).filter(Boolean).length}/{tms.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-500 dark:text-slate-400">Sort By:</span>
          <button
            onClick={() => setSortBy('total_sale_qty')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${sortBy === 'total_sale_qty' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
          >
            Actual Sale
          </button>
          <button
            onClick={() => setSortBy('daily_target')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${sortBy === 'daily_target' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
          >
            Daily Target
          </button>
          <button
            onClick={() => setSortBy('efficiency_pct')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${sortBy === 'efficiency_pct' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
          >
            Achievement %
          </button>
          <button
            onClick={() => setSortBy('three_month_change_pct')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${sortBy === 'three_month_change_pct' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
          >
            Steepest 3M Decline
          </button>
          <button
            onClick={() => setSortBy('cash_pct')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${sortBy === 'cash_pct' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
          >
            Highest Cash %
          </button>
        </div>
      </div>

      {tmDispatchNotice && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-xs font-medium border flex items-center justify-between gap-3 ${tmDispatchNotice.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-600/40 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-600/40 text-rose-800 dark:text-rose-300'
            }`}
        >
          <span>{tmDispatchNotice.text}</span>
          <button
            type="button"
            onClick={() => setTmDispatchNotice(null)}
            className="text-[11px] font-bold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {showTmDirectory && (
        <div className="bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700/60 rounded-xl p-4 space-y-4 text-xs shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Territory Manager WhatsApp Directory &amp; Scheduled Action Cards</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Map 10-digit WhatsApp numbers (or 91XXXXXXXXXX) for 1-click individual TM briefs and optional automatic dispatch after the 02:15 PM &amp; 06:30 PM daily broadcasts.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSendBatchBelowTarget}
                disabled={batchSending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:bg-slate-500 text-white font-semibold cursor-pointer shadow-2xs"
              >
                {batchSending ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Send to Mapped TMs Below Target</span>
              </button>
              <button
                type="button"
                onClick={handleSaveTmDirectory}
                disabled={savingContacts}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-500 text-white font-semibold cursor-pointer shadow-2xs"
              >
                {savingContacts ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save Directory</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
            <label className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSendDaily}
                onChange={(e) => setAutoSendDaily(e.target.checked)}
                className="rounded"
              />
              <span>Auto-send TM WhatsApp cards after 02:15 PM &amp; 06:30 PM Daily Broadcast</span>
            </label>
            <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoOnlyBelowTarget}
                onChange={(e) => setAutoOnlyBelowTarget(e.target.checked)}
                className="rounded"
              />
              <span>Auto-send only when TM is below daily target</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto pr-1">
            {tms.map((tmRow) => (
              <div
                key={`dir-${tmRow.tm}`}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
              >
                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={tmRow.tm}>
                  {tmRow.tm}
                </span>
                <input
                  type="tel"
                  placeholder="+91 / 10-digit"
                  value={tmContacts[tmRow.tm] || ''}
                  onChange={(e) =>
                    setTmContacts((prev) => ({
                      ...prev,
                      [tmRow.tm]: e.target.value,
                    }))
                  }
                  className="w-32 font-mono text-[11px] px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {copiedTmBrief && (
        <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-500/40 rounded-xl p-4 text-xs space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              <span>Copied Personalized WhatsApp Action Brief for TM {copiedTmBrief.tm} to Clipboard!</span>
            </span>
            <button
              onClick={() => setCopiedTmBrief(null)}
              className="text-slate-500 hover:text-slate-800 dark:hover:text-white font-semibold cursor-pointer"
            >
              Close Preview
            </button>
          </div>
          <pre className="font-mono text-[11px] bg-white dark:bg-slate-900 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800/60 whitespace-pre-wrap text-slate-800 dark:text-slate-200">
            {copiedTmBrief.text}
          </pre>
        </div>
      )}

      {/* Leaderboard Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className={`px-3 ${isCompact ? 'py-2' : 'py-3'}`}>Rank &amp; TM Name</th>
                <th className={`px-3 ${isCompact ? 'py-2' : 'py-3'} text-center`}>Stations (Met/Tot)</th>
                <th className={`px-3 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Last 3 Months Avg/d</th>
                <th className={`px-3 ${isCompact ? 'py-2' : 'py-3'} text-right`}>3M Trend (Start→M3)</th>
                <th className={`px-3 ${isCompact ? 'py-2' : 'py-3'} text-right`}>TM Daily Target (L)</th>
                <th className={`px-3 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Actual Sale (L)</th>
                <th className={`px-3 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Variance (Act − Tgt)</th>
                <th className={`px-3 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Target Achievement</th>
                <th className={`px-3 ${isCompact ? 'py-2' : 'py-3'} text-right`}>MTD Pace &amp; Asking Rate</th>
                <th className={`px-3 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Payment Mix (Dig / Cash)</th>
                <th className={`px-3 ${isCompact ? 'py-2' : 'py-3'} text-center`}>Zero Sales</th>
                <th className={`px-3 ${isCompact ? 'py-2' : 'py-3'} text-center`}>TM WhatsApp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-slate-800 dark:text-slate-200">
              {filtered.map((t, idx) => {
                const dailyTgt = t.daily_target ?? 0;
                const variance = t.target_variance_qty ?? (t.total_sale_qty - dailyTgt);
                const achievePct = t.efficiency_pct ?? 0;
                const trend3m = t.three_month_change_pct ?? 0;
                const digPct = t.digital_pct ?? 0;
                const cashPct = t.cash_pct ?? 0;
                const mtdSale = t.mtd_sale_qty ?? t.total_sale_qty;
                const mnthTgt = t.monthly_target ?? dailyTgt * 30;
                const askRate = t.required_asking_rate_l_per_day ?? 0;
                const projEomPct = t.projected_eom_achievement_pct ?? 0;
                return (
                  <tr key={t.tm} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className={`px-3 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[11px] font-bold ${idx === 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{t.tm}</div>
                          <div className="text-[10px] text-slate-500">{t.coordinator || 'Unassigned'}</div>
                        </div>
                      </div>
                    </td>

                    <td className={`px-3 text-center font-bold ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <span className="text-emerald-600 dark:text-emerald-400">{t.stations_met_target ?? 0}</span>
                      <span className="text-slate-400 mx-0.5">/</span>
                      <span>{t.stations}</span>
                    </td>

                    <td className={`px-3 text-right ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {t.historical_months && t.historical_months.length > 0 ? (
                        <div className="text-[11px] leading-tight">
                          <span className="text-slate-500">{t.starting_month_label}:</span>{' '}
                          <span className="font-semibold">{fmtQty(Math.round(t.starting_month_avg_daily || 0))}</span>
                          <span className="text-slate-400 mx-1">→</span>
                          <span className="text-slate-500">{t.latest_month_label}:</span>{' '}
                          <span className="font-semibold">{fmtQty(Math.round(t.latest_month_avg_daily || 0))} L/d</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className={`px-3 text-right font-bold ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${trend3m < 0
                            ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                            : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                          }`}
                      >
                        {trend3m < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                        <span>{trend3m > 0 ? '+' : ''}{trend3m}%</span>
                      </span>
                    </td>

                    <td className={`px-3 text-right font-semibold text-slate-700 dark:text-slate-300 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {fmtQty(dailyTgt)} L
                    </td>

                    <td className={`px-3 text-right font-bold text-indigo-600 dark:text-indigo-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {fmtQty(t.total_sale_qty)} L
                    </td>

                    <td
                      className={`px-3 text-right font-bold ${isCompact ? 'py-1.5' : 'py-2.5'} ${variance >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                        }`}
                    >
                      {variance > 0 ? '+' : ''}
                      {fmtQty(variance)} L
                    </td>

                    <td className={`px-3 text-right ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-14 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${achievePct >= 100
                                ? 'bg-emerald-500'
                                : achievePct >= 90
                                  ? 'bg-indigo-500'
                                  : achievePct >= 75
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                              }`}
                            style={{ width: `${Math.min(100, Math.max(4, achievePct))}%` }}
                          />
                        </div>
                        <span
                          className={`font-bold ${achievePct >= 100
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : achievePct >= 90
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : achievePct >= 75
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-rose-600 dark:text-rose-400'
                            }`}
                        >
                          {achievePct}%
                        </span>
                      </div>
                    </td>

                    <td className={`px-3 text-right ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="text-[11px] font-bold text-slate-900 dark:text-white">
                        {fmtQty(mtdSale)} / {fmtQty(mnthTgt)} L
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Ask: <span className="font-semibold text-amber-600 dark:text-amber-400">{fmtQty(askRate)} L/d</span> • EOM: {projEomPct}%
                      </div>
                    </td>

                    <td className={`px-3 text-right ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="flex flex-col items-end gap-1">
                        <div className="text-[11px]">
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">{digPct}% Dig</span>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className={cashPct >= 65 ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-semibold'}>
                            {cashPct}% Cash
                          </span>
                        </div>
                        <div className="w-24 h-1.5 rounded-full bg-amber-500/30 overflow-hidden flex">
                          <div className="bg-emerald-500 h-full" style={{ width: `${Math.min(100, Math.max(0, digPct))}%` }} />
                        </div>
                      </div>
                    </td>

                    <td className={`px-3 text-center font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {t.zero_sale_count > 0 ? (
                        <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400">
                          {t.zero_sale_count} Zero
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">0 Zero</span>
                      )}
                    </td>

                    <td className={`px-3 text-center font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleSendTmWhatsAppDirect(t.tm)}
                          disabled={sendingTm === t.tm}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold cursor-pointer shadow-2xs transition-colors ${tmContacts[t.tm]
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                              : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100'
                            }`}
                          title={
                            tmContacts[t.tm]
                              ? `Send personalized WhatsApp brief directly to TM ${t.tm} (${tmContacts[t.tm]})`
                              : `Set WhatsApp number for TM ${t.tm}`
                          }
                        >
                          {sendingTm === t.tm ? (
                            <LoaderCircle className="w-3 h-3 animate-spin" />
                          ) : (
                            <Send className="w-3 h-3" />
                          )}
                          <span>Send WA</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyTmWhatsApp(t.tm)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-semibold cursor-pointer transition-colors"
                          title={`Copy personalized WhatsApp action brief for TM ${t.tm}`}
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
