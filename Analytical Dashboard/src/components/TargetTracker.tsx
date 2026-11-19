import React, { useEffect, useState } from 'react';
import {
  Target,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  RefreshCw,
  FileSpreadsheet,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  Banknote,
  Smartphone,
  Search,
  Users,
  Copy,
  Check,
} from 'lucide-react';
import { DailyHistoricalPoint, ExecutiveTelemetry, StationRecord } from '../types';
import productConfig from '../../../product-config.json';
import { buildTmPersonalizedWhatsAppBrief } from '../engine/whatsappBriefing';

const DEFAULT_DAILY_BENCHMARK = productConfig.analytics.defaultStationBenchmarkLitres;
const STATUS_BANDS = productConfig.analytics.statusBands;
const DAILY_TARGET_STORAGE_KEY = 'go-gas-tm-targets';
const STATION_TARGET_STORAGE_KEY = 'go-gas-station-targets';
const TARGET_MTIME_STORAGE_KEY = 'go-gas-tm-target-mtime';

interface TargetTrackerProps {
  stations: StationRecord[];
  date?: string;
  history30d?: DailyHistoricalPoint[];
  tmTargetMeta?: ExecutiveTelemetry['tm_target_meta'];
  onRefreshTelemetry?: () => void;
}

export const TargetTracker: React.FC<TargetTrackerProps> = ({
  stations,
  date = new Date().toISOString().slice(0, 10),
  history30d = [],
  tmTargetMeta,
  onRefreshTelemetry,
}) => {
  const [activeView, setActiveView] = useState<'targets_and_trends' | 'cash_vs_digital' | 'supervisor_scorecard'>('targets_and_trends');
  const [trendFilter, setTrendFilter] = useState<'all' | 'below_target' | 'declining_3m' | 'consecutive_3m'>('all');
  const [paymentGrouping, setPaymentGrouping] = useState<'tm' | 'state'>('tm');
  const [paymentSort, setPaymentSort] = useState<'cash_rs' | 'cash_pct' | 'digital_pct' | 'digital_rs'>('cash_rs');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [ssSearch, setSsSearch] = useState('');
  const [copiedTmBrief, setCopiedTmBrief] = useState<{ tm: string; text: string } | null>(null);
  const [tmTargets, setTmTargets] = useState<Record<string, number>>({});
  const [targetInputs, setTargetInputs] = useState<Record<string, string>>({});
  const [stationTargetsByCode, setStationTargetsByCode] = useState<Record<string, number>>({});
  const [stationTargetInputs, setStationTargetInputs] = useState<Record<string, string>>({});
  const [periodLabel, setPeriodLabel] = useState<string>(
    tmTargetMeta?.period_label || 'Monthly Avg. Daily Target',
  );
  const [syncingExcel, setSyncingExcel] = useState(false);
  const [targetError, setTargetError] = useState('');
  const tmNames = [...new Set(stations.map((station) => station.tm?.trim() || 'Unassigned'))].sort();

  useEffect(() => {
    if (tmTargetMeta?.period_label) {
      setPeriodLabel(tmTargetMeta.period_label);
    }
  }, [tmTargetMeta?.period_label]);

  useEffect(() => {
    let localTm: Record<string, number> = {};
    let localStation: Record<string, number> = {};
    const localMtime = Number(window.localStorage.getItem(TARGET_MTIME_STORAGE_KEY) || '0');

    try {
      const savedTarget = window.localStorage.getItem(DAILY_TARGET_STORAGE_KEY);
      if (savedTarget !== null) {
        const parsedTargets: unknown = JSON.parse(savedTarget);
        if (typeof parsedTargets === 'object' && parsedTargets !== null && !Array.isArray(parsedTargets)) {
          localTm = Object.fromEntries(
            Object.entries(parsedTargets).filter(
              (entry): entry is [string, number] =>
                typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0,
            ),
          );
        }
      }

      const savedStationTargets = window.localStorage.getItem(STATION_TARGET_STORAGE_KEY);
      if (savedStationTargets !== null) {
        const parsedStationTargets: unknown = JSON.parse(savedStationTargets);
        if (
          typeof parsedStationTargets === 'object' &&
          parsedStationTargets !== null &&
          !Array.isArray(parsedStationTargets)
        ) {
          localStation = Object.fromEntries(
            Object.entries(parsedStationTargets).filter(
              (entry): entry is [string, number] =>
                typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0,
            ),
          );
        }
      }
    } catch {
      setTargetError('Saved benchmarks could not be loaded from this browser. Excel targets are in use.');
    }

    fetch('/api/settings/benchmarks')
      .then((res) => (res.ok ? res.json() : null))
      .then((serverData) => {
        if (!serverData) return;
        if (serverData.periodLabel) {
          setPeriodLabel(serverData.periodLabel);
        }
        const serverMtime = Number(serverData.mtimeMs || 0);
        const excelUpdatedSinceLocal = serverMtime > 0 && serverMtime >= localMtime;

        const mergedTm: Record<string, number> = excelUpdatedSinceLocal
          ? { ...localTm, ...(serverData.tmTargets || {}) }
          : { ...(serverData.tmTargets || {}), ...localTm };

        const mergedStation: Record<string, number> = excelUpdatedSinceLocal
          ? { ...localStation, ...(serverData.stationTargets || {}) }
          : { ...(serverData.stationTargets || {}), ...localStation };

        setTmTargets(mergedTm);
        setTargetInputs(
          Object.fromEntries(Object.entries(mergedTm).map(([tm, val]) => [tm, String(val)])),
        );
        setStationTargetsByCode(mergedStation);
        setStationTargetInputs(
          Object.fromEntries(Object.entries(mergedStation).map(([code, val]) => [code, String(val)])),
        );

        if (excelUpdatedSinceLocal) {
          try {
            window.localStorage.setItem(DAILY_TARGET_STORAGE_KEY, JSON.stringify(mergedTm));
            window.localStorage.setItem(STATION_TARGET_STORAGE_KEY, JSON.stringify(mergedStation));
            window.localStorage.setItem(TARGET_MTIME_STORAGE_KEY, String(serverMtime));
          } catch {
            // ignore storage errors
          }
        }
      })
      .catch(() => {});
  }, []);

  const syncBenchmarksToServer = (
    nextTmTargets: Record<string, number>,
    nextStationTargets: Record<string, number>,
  ) => {
    void fetch('/api/settings/benchmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmTargets: nextTmTargets, stationTargets: nextStationTargets }),
    }).catch(() => {});
  };

  const handleResetToExcel = async () => {
    setSyncingExcel(true);
    setTargetError('');
    try {
      const res = await fetch('/api/settings/benchmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToExcel: true }),
      });
      if (res.ok) {
        const data = await res.json();
        const nextTm = data.tmTargets || {};
        const nextStn = data.stationTargets || {};
        setTmTargets(nextTm);
        setTargetInputs(Object.fromEntries(Object.entries(nextTm).map(([tm, v]) => [tm, String(v)])));
        setStationTargetsByCode(nextStn);
        setStationTargetInputs(Object.fromEntries(Object.entries(nextStn).map(([c, v]) => [c, String(v)])));
        if (data.periodLabel) setPeriodLabel(data.periodLabel);
        window.localStorage.removeItem(DAILY_TARGET_STORAGE_KEY);
        window.localStorage.removeItem(STATION_TARGET_STORAGE_KEY);
        if (data.mtimeMs) {
          window.localStorage.setItem(TARGET_MTIME_STORAGE_KEY, String(data.mtimeMs));
        }
        onRefreshTelemetry?.();
      }
    } catch {
      setTargetError('Could not reload targets from TM Target Daily.xlsx.');
    } finally {
      setSyncingExcel(false);
    }
  };

  const handleTargetChange = (tm: string, value: string) => {
    setTargetInputs((current) => ({ ...current, [tm]: value }));
    const parsedTarget = Number(value);
    if (!value.trim() || !Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setTargetError('Enter a daily benchmark greater than zero litres for each TM.');
      return;
    }

    const updatedTargets = { ...tmTargets, [tm]: parsedTarget };
    setTmTargets(updatedTargets);
    syncBenchmarksToServer(updatedTargets, stationTargetsByCode);
    try {
      window.localStorage.setItem(DAILY_TARGET_STORAGE_KEY, JSON.stringify(updatedTargets));
      setTargetError('');
    } catch {
      setTargetError('The TM benchmark is applied, but could not be saved in this browser.');
    }
  };

  const handleStationTargetChange = (stationCode: string, value: string) => {
    setStationTargetInputs((current) => ({ ...current, [stationCode]: value }));

    if (!value.trim()) {
      const updatedTargets = { ...stationTargetsByCode };
      delete updatedTargets[stationCode];
      setStationTargetsByCode(updatedTargets);
      syncBenchmarksToServer(tmTargets, updatedTargets);
      try {
        window.localStorage.setItem(STATION_TARGET_STORAGE_KEY, JSON.stringify(updatedTargets));
        setTargetError('');
      } catch {
        setTargetError('The station now inherits its TM benchmark, but the change could not be saved in this browser.');
      }
      return;
    }

    const parsedTarget = Number(value);
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setTargetError('Enter a station benchmark greater than zero litres, or clear it to inherit the TM benchmark.');
      return;
    }

    const updatedTargets = { ...stationTargetsByCode, [stationCode]: parsedTarget };
    setStationTargetsByCode(updatedTargets);
    syncBenchmarksToServer(tmTargets, updatedTargets);
    try {
      window.localStorage.setItem(STATION_TARGET_STORAGE_KEY, JSON.stringify(updatedTargets));
      setTargetError('');
    } catch {
      setTargetError('The station benchmark is applied, but the change could not be saved in this browser.');
    }
  };

  const formatTarget = (target: number) => target.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const stationTargets = stations.map((s) => {
    const tm = s.tm?.trim() || 'Unassigned';
    const erpKey = s.erp_code.trim().toUpperCase();
    const excelStationTarget =
      tmTargetMeta?.station_targets?.[erpKey] ??
      (s.daily_target && s.daily_target > 0 ? s.daily_target : undefined);
    const tmTarget =
      tmTargets[tm] ??
      tmTargetMeta?.tm_avg_targets?.[tm] ??
      DEFAULT_DAILY_BENCHMARK;
    const overrideTarget = stationTargetsByCode[s.erp_code] ?? stationTargetsByCode[erpKey];
    const target =
      overrideTarget ??
      (excelStationTarget && excelStationTarget > 0 ? excelStationTarget : tmTarget);
    const benchmarkPct = target > 0 ? Number(((s.sale_qty / target) * 100).toFixed(1)) : 0;
    const varianceQty = Number((s.sale_qty - target).toFixed(2));
    let status: 'Met benchmark' | 'Near benchmark' | 'Below benchmark' | 'Far below benchmark' = 'Met benchmark';

    if (benchmarkPct >= STATUS_BANDS.achievedPct) status = 'Met benchmark';
    else if (benchmarkPct >= STATUS_BANDS.nearPct) status = 'Near benchmark';
    else if (benchmarkPct >= STATUS_BANDS.belowPct) status = 'Below benchmark';
    else status = 'Far below benchmark';

    const coll = s.net_total_collection || s.collection || 0;
    const paytmRs = s.paytm || 0;
    const cashRs =
      s.net_cash_collection && s.net_cash_collection > 0
        ? s.net_cash_collection
        : Math.max(0, coll - paytmRs);
    const payDenom = Math.max(coll, paytmRs + cashRs, 1);
    const digitalPct = coll > 0 ? Number(((paytmRs / payDenom) * 100).toFixed(1)) : 0;
    const cashPct = coll > 0 ? Number(((cashRs / payDenom) * 100).toFixed(1)) : 0;

    return {
      ...s,
      tmTarget,
      excelStationTarget: excelStationTarget ?? 0,
      target,
      varianceQty,
      hasStationTarget: overrideTarget !== undefined || (excelStationTarget !== undefined && excelStationTarget > 0),
      benchmarkPct,
      status,
      collRs: coll,
      paytmRs,
      cashRs,
      digitalPct,
      cashPct,
    };
  });

  // Aggregate TM-level daily target, 3-month historical trajectory & payment mix
  const tmDailyRollup = tmNames
    .map((tm) => {
      const tmStns = stationTargets.filter((st) => (st.tm?.trim() || 'Unassigned') === tm);
      const totalTarget = tmStns.reduce((sum, st) => sum + st.target, 0);
      const totalSold = tmStns.reduce((sum, st) => sum + st.sale_qty, 0);
      const variance = totalSold - totalTarget;
      const pct = totalTarget > 0 ? Number(((totalSold / totalTarget) * 100).toFixed(1)) : 0;
      const metCount = tmStns.filter((st) => st.status === 'Met benchmark').length;

      // Aggregate 3 historical months
      const monthMap = new Map<string, { monthLabel: string; avgDailyAch: number }>();
      for (const st of tmStns) {
        for (const hm of st.historical_months || []) {
          const cur = monthMap.get(hm.monthLabel) || { monthLabel: hm.monthLabel, avgDailyAch: 0 };
          cur.avgDailyAch += hm.avgDailyAch;
          monthMap.set(hm.monthLabel, cur);
        }
      }
      const histMonths = [...monthMap.values()];
      const m1 = histMonths[0]?.avgDailyAch || 0;
      const m2 = histMonths[1]?.avgDailyAch || 0;
      const m3 = histMonths[histMonths.length - 1]?.avgDailyAch || 0;
      const trend3mPct = m1 > 0 ? Number((((m3 - m1) / m1) * 100).toFixed(1)) : 0;
      const targetVsM1Pct = m1 > 0 ? Number((((totalTarget - m1) / m1) * 100).toFixed(1)) : 0;
      const isConsecutive3mDecline = histMonths.length >= 3 && m1 > 0 && m2 < m1 && m3 < m2;

      const tmPaytm = tmStns.reduce((sum, st) => sum + st.paytmRs, 0);
      const tmCash = tmStns.reduce((sum, st) => sum + st.cashRs, 0);
      const tmDenom = Math.max(1, tmPaytm + tmCash);
      const tmDigPct = Number(((tmPaytm / tmDenom) * 100).toFixed(1));
      const tmCashPct = Number(((tmCash / tmDenom) * 100).toFixed(1));

      const mtdSale = Math.round(tmStns.reduce((sum, st) => sum + (st.mtd_sale_qty ?? st.sale_qty), 0));
      const monthlyTarget = Math.round(
        tmStns.reduce((sum, st) => sum + (st.monthly_target ?? st.target * 30), 0),
      );
      const mtdPct = monthlyTarget > 0 ? Number(((mtdSale / monthlyTarget) * 100).toFixed(1)) : 0;
      const askingRate = Math.round(
        tmStns.reduce((sum, st) => sum + (st.required_asking_rate_l_per_day ?? 0), 0),
      );
      const projEomSale = Math.round(
        tmStns.reduce((sum, st) => sum + (st.projected_eom_sale_qty ?? st.mtd_sale_qty ?? st.sale_qty), 0),
      );
      const projEomPct = monthlyTarget > 0 ? Number(((projEomSale / monthlyTarget) * 100).toFixed(1)) : 0;

      return {
        tm,
        stationsCount: tmStns.length,
        metCount,
        totalTarget: Math.round(totalTarget),
        totalSold: Math.round(totalSold),
        variance: Math.round(variance),
        pct,
        histMonths,
        m1: Math.round(m1),
        m2: Math.round(m2),
        m3: Math.round(m3),
        trend3mPct,
        targetVsM1Pct,
        isConsecutive3mDecline,
        tmPaytm: Math.round(tmPaytm),
        tmCash: Math.round(tmCash),
        tmDigPct,
        tmCashPct,
        mtdSale,
        monthlyTarget,
        mtdPct,
        askingRate,
        projEomPct,
      };
    })
    .sort((a, b) => b.totalTarget - a.totalTarget);

  const handleCopyTmWhatsApp = (tmName: string) => {
    const text = buildTmPersonalizedWhatsAppBrief(tmName, stations, date, periodLabel);
    navigator.clipboard.writeText(text);
    setCopiedTmBrief({ tm: tmName, text });
  };

  // Station Supervisor (SS) Accountability & Cash-Risk Rollup
  const supervisorRollup = (() => {
    const map = new Map<
      string,
      {
        ss: string;
        tm: string;
        state: string;
        stations: typeof stationTargets;
      }
    >();
    for (const st of stationTargets) {
      const ssName = st.ss_name?.trim() || 'Unassigned SS';
      const cur = map.get(ssName) || {
        ss: ssName,
        tm: st.tm || 'Unassigned',
        state: st.state || '',
        stations: [],
      };
      cur.stations.push(st);
      map.set(ssName, cur);
    }
    return [...map.values()]
      .map((g) => {
        const dailyTgt = Math.round(g.stations.reduce((s, st) => s + st.target, 0));
        const actualSale = Math.round(g.stations.reduce((s, st) => s + st.sale_qty, 0));
        const achievePct = dailyTgt > 0 ? Number(((actualSale / dailyTgt) * 100).toFixed(1)) : 0;
        const mtdSale = Math.round(g.stations.reduce((s, st) => s + (st.mtd_sale_qty ?? st.sale_qty), 0));
        const monthlyTgt = Math.round(g.stations.reduce((s, st) => s + (st.monthly_target ?? st.target * 30), 0));
        const cashRs = Math.round(g.stations.reduce((s, st) => s + st.cashRs, 0));
        const digRs = Math.round(g.stations.reduce((s, st) => s + st.paytmRs, 0));
        const payDenom = Math.max(1, cashRs + digRs);
        const cashPct = Number(((cashRs / payDenom) * 100).toFixed(1));
        const digPct = Number(((digRs / payDenom) * 100).toFixed(1));
        const diffRs = Math.round(g.stations.reduce((s, st) => s + (st.diff || 0), 0));
        const zeroCount = g.stations.filter((st) => st.sale_qty === 0).length;
        return {
          ss: g.ss,
          tm: g.tm,
          state: g.state,
          stationCount: g.stations.length,
          stationNames: g.stations.map((st) => st.alds_name).join(', '),
          dailyTgt,
          actualSale,
          achievePct,
          mtdSale,
          monthlyTgt,
          cashRs,
          digRs,
          cashPct,
          digPct,
          diffRs,
          zeroCount,
        };
      })
      .filter((r) => {
        if (!ssSearch.trim()) return true;
        const q = ssSearch.toLowerCase();
        return (
          r.ss.toLowerCase().includes(q) ||
          r.tm.toLowerCase().includes(q) ||
          r.stationNames.toLowerCase().includes(q) ||
          r.state.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.cashRs - a.cashRs);
  })();

  // Stations with a sudden Cash Spike (Digital % dropped >= 15% today vs their prior 7d avg)
  const cashSpikeStations = stationTargets
    .filter((s) => s.collRs >= 1000 && (s.cash_spike_pct ?? 0) >= 15)
    .sort((a, b) => (b.cash_spike_pct ?? 0) - (a.cash_spike_pct ?? 0));

  const filteredTmRollup = tmDailyRollup.filter((r) => {
    if (trendFilter === 'below_target') return r.totalSold < r.totalTarget;
    if (trendFilter === 'declining_3m') return r.trend3mPct < 0;
    if (trendFilter === 'consecutive_3m') return r.isConsecutive3mDecline;
    return true;
  });

  const filteredStationTargets = stationTargets.filter((st) => {
    if (trendFilter === 'below_target') return st.sale_qty < st.target;
    if (trendFilter === 'declining_3m') return (st.three_month_change_pct ?? 0) < 0;
    if (trendFilter === 'consecutive_3m') return Boolean(st.is_consecutive_3m_decline);
    return true;
  });

  const totalFilteredTarget = stationTargets.reduce((sum, s) => sum + s.target, 0);
  const totalFilteredSold = stationTargets.reduce((sum, s) => sum + s.sale_qty, 0);
  const totalFilteredPct = totalFilteredTarget > 0
    ? Number(((totalFilteredSold / totalFilteredTarget) * 100).toFixed(1))
    : 0;

  const countMet = stationTargets.filter((s) => s.status === 'Met benchmark').length;
  const countNear = stationTargets.filter((s) => s.status === 'Near benchmark').length;
  const countBelow = stationTargets.filter((s) => s.status === 'Below benchmark').length;
  const countFarBelow = stationTargets.filter((s) => s.status === 'Far below benchmark').length;
  const countDeclining3m = stationTargets.filter((s) => (s.three_month_change_pct ?? 0) < 0).length;
  const countConsecutive3m = stationTargets.filter((s) => s.is_consecutive_3m_decline).length;

  // Cash vs Digital Payment Network Aggregations
  const totalDigitalRs = stationTargets.reduce((sum, s) => sum + s.paytmRs, 0);
  const totalCashRs = stationTargets.reduce((sum, s) => sum + s.cashRs, 0);
  const totalPaymentRs = Math.max(1, totalDigitalRs + totalCashRs);
  const networkDigitalPct = Number(((totalDigitalRs / totalPaymentRs) * 100).toFixed(1));
  const networkCashPct = Number(((totalCashRs / totalPaymentRs) * 100).toFixed(1));

  const activePayStations = stationTargets.filter((s) => s.collRs >= 1000);
  const cashHeavyStationsCount = activePayStations.filter((s) => s.cashPct >= 75).length;
  const digitalChampionStationsCount = activePayStations.filter((s) => s.digitalPct >= 50).length;
  const top12CashHeavy = [...activePayStations].sort((a, b) => b.cashRs - a.cashRs).slice(0, 12);
  const top12DigitalLeaders = [...activePayStations]
    .filter((s) => s.paytmRs > 0)
    .sort((a, b) => b.digitalPct - a.digitalPct || b.paytmRs - a.paytmRs)
    .slice(0, 12);

  // Group payment mix by TM or State for the Stacked Bar Chart
  const paymentGroups = (() => {
    const map = new Map<string, { label: string; digitalRs: number; cashRs: number; stations: number }>();
    for (const s of activePayStations) {
      const key = paymentGrouping === 'tm' ? (s.tm || 'Unassigned') : (s.state || 'OTHER');
      const cur = map.get(key) || { label: key, digitalRs: 0, cashRs: 0, stations: 0 };
      cur.digitalRs += s.paytmRs;
      cur.cashRs += s.cashRs;
      cur.stations += 1;
      map.set(key, cur);
    }
    return [...map.values()]
      .map((g) => {
        const tot = Math.max(1, g.digitalRs + g.cashRs);
        return {
          ...g,
          totalRs: g.digitalRs + g.cashRs,
          digitalPct: Number(((g.digitalRs / tot) * 100).toFixed(1)),
          cashPct: Number(((g.cashRs / tot) * 100).toFixed(1)),
        };
      })
      .sort((a, b) => b.cashPct - a.cashPct);
  })();

  const sortedPaymentStations = [...activePayStations]
    .filter((s) => {
      if (!paymentSearch.trim()) return true;
      const q = paymentSearch.toLowerCase();
      return (
        s.alds_name.toLowerCase().includes(q) ||
        s.erp_code.toLowerCase().includes(q) ||
        (s.tm || '').toLowerCase().includes(q) ||
        s.state.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (paymentSort === 'cash_rs') return b.cashRs - a.cashRs;
      if (paymentSort === 'cash_pct') return b.cashPct - a.cashPct || b.cashRs - a.cashRs;
      if (paymentSort === 'digital_pct') return b.digitalPct - a.digitalPct || b.paytmRs - a.paytmRs;
      return b.paytmRs - a.paytmRs;
    });

  // 4-point network historical month + target + actual trajectory for SVG chart
  const monthLabels = tmTargetMeta?.historical_month_labels?.length
    ? tmTargetMeta.historical_month_labels
    : ['Aug. 26', 'Sep. 26', 'Oct. 26'];
  const netM1 = tmDailyRollup.reduce((s, r) => s + r.m1, 0);
  const netM2 = tmDailyRollup.reduce((s, r) => s + r.m2, 0);
  const netM3 = tmDailyRollup.reduce((s, r) => s + r.m3, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Switcher */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  TM &amp; Station Daily Target, 3-Month Decline &amp; Payment Security Suite
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>TM Target Daily.xlsx • {periodLabel}</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Tracks daily target achievement, 3-month historical decline from starting month ({monthLabels.join(' → ')}), and the Cash vs Digital Payment Money Security Mission.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveView('targets_and_trends')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeView === 'targets_and_trends'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>Daily Targets, MTD &amp; 3M Trend</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('cash_vs_digital')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeView === 'cash_vs_digital'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Cash vs Digital (Money Security)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('supervisor_scorecard')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeView === 'supervisor_scorecard'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>SS Supervisor Scorecard ({supervisorRollup.length})</span>
            </button>
            <button
              type="button"
              onClick={handleResetToExcel}
              disabled={syncingExcel}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingExcel ? 'animate-spin' : ''}`} />
              <span>Sync Excel Targets</span>
            </button>
          </div>
        </div>
      </div>

      {activeView === 'targets_and_trends' ? (
        <>
          {/* Status Bands & 3-Month Decline Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-slate-900/80 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  <span>Met Target (&ge;100%)</span>
                </span>
                <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {((countMet / (stations.length || 1)) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{countMet} Stations</div>
              <p className="text-[11px] text-slate-500 mt-1">
                Network Achieved: {totalFilteredPct}% ({formatTarget(Math.round(totalFilteredSold))} / {formatTarget(Math.round(totalFilteredTarget))} L)
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900/80 border border-indigo-200 dark:border-indigo-500/30 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>Near Target (90–99%)</span>
                </span>
                <span className="text-xs font-mono font-bold text-indigo-700 dark:text-indigo-400">
                  {((countNear / (stations.length || 1)) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{countNear} Stations</div>
              <p className="text-[11px] text-slate-500 mt-1">Within 10% of daily target</p>
            </div>

            <div className="bg-white dark:bg-slate-900/80 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Below Target (75–89%)</span>
                </span>
                <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400">
                  {((countBelow / (stations.length || 1)) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{countBelow} Stations</div>
              <p className="text-[11px] text-slate-500 mt-1">10–25% below daily target</p>
            </div>

            <div className="bg-white dark:bg-slate-900/80 border border-rose-200 dark:border-rose-500/30 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4" />
                  <span>Far Below (&lt;75%)</span>
                </span>
                <span className="text-xs font-mono font-bold text-rose-700 dark:text-rose-400">
                  {((countFarBelow / (stations.length || 1)) * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{countFarBelow} Stations</div>
              <p className="text-[11px] text-slate-500 mt-1">&gt;25% below daily target</p>
            </div>

            <div className="bg-white dark:bg-slate-900/80 border border-purple-200 dark:border-purple-500/30 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                  <TrendingDown className="w-4 h-4" />
                  <span>3-Month Declining</span>
                </span>
                <span className="text-xs font-mono font-bold text-purple-700 dark:text-purple-400">
                  {countConsecutive3m} Consecutive
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{countDeclining3m} Stations</div>
              <p className="text-[11px] text-slate-500 mt-1">
                Down from {monthLabels[0]} to {monthLabels[monthLabels.length - 1]}
              </p>
            </div>
          </div>

          {/* Visualization: 3-Month Trajectory & Current Daily Target vs Actual */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  3-Month Historical Trajectory ({monthLabels.join(' → ')}) vs Current Daily Target &amp; Actual Sold
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Shows how each Territory Manager&apos;s daily volume evolved from the starting month ({monthLabels[0]}) across the last 3 months compared with their current Daily Target and Today&apos;s Actual Sales.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  onClick={() => setTrendFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                    trendFilter === 'all'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  All ({tmDailyRollup.length} TMs / {stationTargets.length} Stns)
                </button>
                <button
                  onClick={() => setTrendFilter('below_target')}
                  className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                    trendFilter === 'below_target'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  Not Achieving Daily Target
                </button>
                <button
                  onClick={() => setTrendFilter('declining_3m')}
                  className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                    trendFilter === 'declining_3m'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  Declined vs Starting Month ({monthLabels[0]})
                </button>
                <button
                  onClick={() => setTrendFilter('consecutive_3m')}
                  className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                    trendFilter === 'consecutive_3m'
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300'
                  }`}
                >
                  Consecutive 3-Month Drop
                </button>
              </div>
            </div>

            {/* Network 5-Stage Trajectory Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 dark:bg-slate-950/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block">1. Starting Month ({monthLabels[0]})</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{formatTarget(netM1)} L/d</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">2. Mid Month ({monthLabels[1] || 'M2'})</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{formatTarget(netM2)} L/d</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">3. Latest Month ({monthLabels[monthLabels.length - 1]})</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{formatTarget(netM3)} L/d</span>
                {netM1 > 0 && (
                  <span className={`block text-[10px] ${netM3 < netM1 ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {netM3 >= netM1 ? '+' : ''}{(((netM3 - netM1) / netM1) * 100).toFixed(1)}% vs {monthLabels[0]}
                  </span>
                )}
              </div>
              <div>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold block">4. {periodLabel}</span>
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                  {formatTarget(Math.round(totalFilteredTarget))} L/d
                </span>
              </div>
              <div>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold block">5. Actual Sold Today</span>
                <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                  {formatTarget(Math.round(totalFilteredSold))} L ({totalFilteredPct}%)
                </span>
              </div>
            </div>
          </div>

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

          {/* TM-Wise Daily Target, MTD Pace & 3-Month Decline Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs transition-colors">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Territory Manager (TM) Daily Target, MTD Cumulative Pace &amp; 3-Month Historical Trajectory ({periodLabel})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Includes Month-to-Date (MTD) sales against monthly target, Required Asking Rate (L/day needed for remaining days), Projected End-of-Month (EOM) landing %, and 1-click TM WhatsApp action brief.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Territory Manager (TM)</th>
                    <th className="py-2.5 px-3 text-center">Stations (Met/Tot)</th>
                    <th className="py-2.5 px-3 text-right">{monthLabels[0]} Avg/d</th>
                    <th className="py-2.5 px-3 text-right">{monthLabels[1] || 'M2'} Avg/d</th>
                    <th className="py-2.5 px-3 text-right">{monthLabels[monthLabels.length - 1]} Avg/d</th>
                    <th className="py-2.5 px-3 text-right">3M Trend</th>
                    <th className="py-2.5 px-3 text-right">Daily Target (L)</th>
                    <th className="py-2.5 px-3 text-right">Actual Sold (L)</th>
                    <th className="py-2.5 px-3 text-right">% of Target</th>
                    <th className="py-2.5 px-3 text-right">MTD Sold / Monthly Tgt</th>
                    <th className="py-2.5 px-3 text-right">Asking Rate &amp; EOM %</th>
                    <th className="py-2.5 px-3 text-center">TM WhatsApp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {filteredTmRollup.map((row) => (
                    <tr key={row.tm} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-sans font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{row.tm}</span>
                          {row.isConsecutive3mDecline && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                              3M Consecutive↓
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-semibold">
                        <span className="text-emerald-600 dark:text-emerald-400">{row.metCount}</span>
                        <span className="text-slate-400 mx-1">/</span>
                        <span>{row.stationsCount}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400">
                        {formatTarget(row.m1)} L
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400">
                        {formatTarget(row.m2)} L
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300 font-semibold">
                        {formatTarget(row.m3)} L
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold ${
                          row.trend3mPct < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {row.trend3mPct > 0 ? '+' : ''}
                        {row.trend3mPct}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-amber-700 dark:text-amber-300">
                        {formatTarget(row.totalTarget)} L
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                        {formatTarget(row.totalSold)} L
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span
                          className={`font-bold ${
                            row.pct >= 100
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : row.pct >= 90
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : row.pct >= 75
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {row.pct}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {formatTarget(row.mtdSale)} L
                        </div>
                        <div className="text-[10px] text-slate-500">
                          of {formatTarget(row.monthlyTarget)} L ({row.mtdPct}%)
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="font-bold text-amber-600 dark:text-amber-400">
                          {formatTarget(row.askingRate)} L/d
                        </div>
                        <div className={`text-[10px] ${row.projEomPct >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                          Proj EOM: {row.projEomPct}%
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        <button
                          type="button"
                          onClick={() => handleCopyTmWhatsApp(row.tm)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold cursor-pointer shadow-2xs transition-colors"
                          title={`Copy personalized WhatsApp action brief for TM ${row.tm}`}
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy Brief</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Station-Wise Target & 3-Month Decline Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs transition-colors">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Station-by-Station Daily Target &amp; 3-Month Historical Decline Ledger ({filteredStationTargets.length} Stations)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-3">Cost Code</th>
                    <th className="py-3 px-3">Station Name</th>
                    <th className="py-3 px-2">State</th>
                    <th className="py-3 px-3">TM &amp; Supervisor (SS)</th>
                    <th className="py-3 px-3 text-right">3-Month Daily Avg ({monthLabels.join(' → ')})</th>
                    <th className="py-3 px-3 text-right">3M Trend</th>
                    <th className="py-3 px-3 text-right">Station Target (L)</th>
                    <th className="py-3 px-3 text-right">Actual Sold</th>
                    <th className="py-3 px-3 text-right">Variance (Act − Tgt)</th>
                    <th className="py-3 px-3 text-right">% of Target</th>
                    <th className="py-3 px-3 text-center">Benchmark Band</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {filteredStationTargets.map((st) => {
                    const hm = st.historical_months || [];
                    const trend3m = st.three_month_change_pct ?? 0;
                    return (
                      <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-orange-600 dark:text-orange-400">{st.erp_code}</td>
                        <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-white">
                          <div>{st.alds_name}</div>
                          <div className="text-[10px] text-slate-400">{st.type}</div>
                        </td>
                        <td className="py-2.5 px-2 font-sans text-slate-600 dark:text-slate-300">{st.state}</td>
                        <td className="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-300">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{st.tm}</div>
                          {st.ss_name && <div className="text-[10px] text-slate-400">SS: {st.ss_name}</div>}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[11px] text-slate-600 dark:text-slate-400">
                          {hm.length > 0
                            ? hm.map((m) => Math.round(m.avgDailyAch).toLocaleString('en-IN')).join(' → ') + ' L/d'
                            : '—'}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-bold ${
                            trend3m < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {trend3m > 0 ? '+' : ''}
                          {trend3m}%
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            value={stationTargetInputs[st.erp_code] ?? (st.excelStationTarget > 0 ? String(st.excelStationTarget) : '')}
                            placeholder={formatTarget(st.tmTarget)}
                            onChange={(event) => handleStationTargetChange(st.erp_code, event.target.value)}
                            className="w-24 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-right text-xs text-slate-900 dark:text-white outline-none focus:border-orange-500"
                            aria-label={`Station benchmark override for ${st.alds_name} (${st.erp_code}) in litres`}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                          {st.sale_qty.toLocaleString('en-IN')} L
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-bold ${
                            st.varianceQty >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {st.varianceQty > 0 ? '+' : ''}
                          {formatTarget(st.varianceQty)} L
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold">
                          <span
                            className={
                              st.benchmarkPct >= 100
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : st.benchmarkPct >= 90
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : st.benchmarkPct >= 75
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }
                          >
                            {st.benchmarkPct}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-sans">
                          <span
                            className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              st.status === 'Met benchmark'
                                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                                : st.status === 'Near benchmark'
                                ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20'
                                : st.status === 'Below benchmark'
                                ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                                : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20'
                            }`}
                          >
                            {st.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeView === 'cash_vs_digital' ? (
        /* VIEW 2: DEEP CASH vs DIGITAL PAYMENT & MONEY SECURITY MISSION SUITE */
        <div className="space-y-6">
          {/* 4 Money Security Mission KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  <span>Digital Payment Share</span>
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  Mission Goal &ge;50%
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {networkDigitalPct}%
              </div>
              <p className="text-xs font-mono text-slate-600 dark:text-slate-300 mt-1">
                ₹{Math.round(totalDigitalRs).toLocaleString('en-IN')} Digital Collected
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/30 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                  <Banknote className="w-4 h-4" />
                  <span>Cash Payment Exposure</span>
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300">
                  Security Risk
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
                {networkCashPct}%
              </div>
              <p className="text-xs font-mono text-slate-600 dark:text-slate-300 mt-1">
                ₹{Math.round(totalCashRs).toLocaleString('en-IN')} Physical Cash
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Cash-Heavy Stations (&ge;75% Cash)</span>
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                {cashHeavyStationsCount} Stations
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Priority sites to convert from cash to digital QR/UPI
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Digital Champions (&ge;50% Digital)</span>
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                {digitalChampionStationsCount} Stations
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                High money security sites leading digital adoption
              </p>
            </div>
          </div>

          {/* 30-Day Network Digital vs Cash Conversion Trend Chart */}
          {history30d.some((h) => h.digital_pct !== undefined) && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    30-Day Network Cash-to-Digital Conversion Trajectory (Digital Payment % vs 50% Mission Goal)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tracks daily network Digital Payment % over the last {history30d.length} operating days against the 50% Money Security Mission line.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-600 dark:text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-0.5 bg-emerald-500 inline-block" />
                    <span>Daily Digital %</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-0.5 border-b border-dashed border-indigo-400 inline-block" />
                    <span>50% Mission Target</span>
                  </span>
                </div>
              </div>
              <div className="w-full overflow-x-auto">
                <div className="min-w-[680px]">
                  <svg viewBox="0 0 960 210" className="w-full h-auto select-none">
                    {[0, 25, 50, 75, 100].map((tick) => {
                      const y = 170 - (tick / 100) * 145;
                      const isGoal = tick === 50;
                      return (
                        <g key={`dig-trend-y-${tick}`}>
                          <line
                            x1="58"
                            y1={y}
                            x2="940"
                            y2={y}
                            stroke={isGoal ? '#6366F1' : '#334155'}
                            strokeOpacity={isGoal ? '0.8' : '0.35'}
                            strokeWidth={isGoal ? '1.5' : '1'}
                            strokeDasharray={tick === 0 ? undefined : '4 4'}
                          />
                          <text x="52" y={y + 3.5} textAnchor="end" className="fill-slate-500 dark:fill-slate-400 text-[9.5px] font-mono">
                            {tick}%
                          </text>
                        </g>
                      );
                    })}
                    <line x1="58" y1="20" x2="58" y2="170" className="stroke-slate-300 dark:stroke-slate-700" strokeWidth="1.5" />
                    <line x1="58" y1="170" x2="940" y2="170" className="stroke-slate-300 dark:stroke-slate-700" strokeWidth="1.5" />
                    {(() => {
                      const pts = history30d.map((h, i) => {
                        const x =
                          history30d.length <= 1
                            ? 500
                            : 68 + (i / (history30d.length - 1)) * (930 - 68);
                        const pct = Math.max(0, Math.min(100, h.digital_pct ?? 0));
                        const y = 170 - (pct / 100) * 145;
                        return { x, y, date: h.date, pct };
                      });
                      const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
                      return (
                        <>
                          <path d={pathD} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          {pts.map((p, i) => (
                            <g key={p.date}>
                              <circle cx={p.x} cy={p.y} r="3" fill="#10B981" stroke="#FFFFFF" strokeWidth="1" />
                              {(i % 3 === 0 || i === pts.length - 1) && (
                                <text x={p.x} y="186" textAnchor="middle" className="fill-slate-500 dark:fill-slate-400 text-[9px] font-mono">
                                  {p.date.slice(5)}
                                </text>
                              )}
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Cash Spike Anomaly Alert Panel */}
          {cashSpikeStations.length > 0 && (
            <div className="bg-amber-50/70 dark:bg-amber-950/25 border border-amber-300 dark:border-amber-500/40 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>
                    Sudden Cash Spike Alert ({cashSpikeStations.length} Stations): Digital Payment % Dropped &ge;15% Today vs Prior 7-Day Average
                  </span>
                </h3>
                <span className="text-[11px] font-mono text-amber-800 dark:text-amber-300">
                  Check QR/POS Terminal &amp; Operator Compliance
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                {cashSpikeStations.slice(0, 9).map((st) => (
                  <div
                    key={st.erp_code}
                    className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-500/30 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{st.alds_name}</div>
                      <div className="text-[10px] text-slate-500">
                        TM: {st.tm} {st.ss_name ? `• SS: ${st.ss_name}` : ''}
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="font-bold text-rose-600 dark:text-rose-400">
                        +{st.cash_spike_pct}% Cash Spike
                      </div>
                      <div className="text-[10px] text-slate-500">
                        7d Dig: {st.prior_7d_digital_pct}% → Today: {st.digitalPct}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deep SVG Visualization 2A: Stacked 100% Cash vs Digital Bar Chart by TM or State */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Cash vs Digital Payment Share Distribution ({paymentGrouping === 'tm' ? 'By Territory Manager' : 'By State'})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Y-Axis shows Payment Share (0%–100%). Emerald Green represents Digital Payment % (higher = better money security); Amber/Rose represents Physical Cash % (sorted highest cash risk first).
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setPaymentGrouping('tm')}
                  className={`px-3 py-1 rounded-lg font-semibold cursor-pointer ${
                    paymentGrouping === 'tm'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Group by TM
                </button>
                <button
                  onClick={() => setPaymentGrouping('state')}
                  className={`px-3 py-1 rounded-lg font-semibold cursor-pointer ${
                    paymentGrouping === 'state'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Group by State
                </button>
              </div>
            </div>

            {paymentGroups.length > 0 && (
              <div className="w-full overflow-x-auto">
                <div className="min-w-[740px]">
                  <svg viewBox="0 0 960 280" className="w-full h-auto select-none">
                    {/* Y-Axis & Horizontal Gridlines 0% to 100% */}
                    {[0, 25, 50, 75, 100].map((pctTick) => {
                      const y = 215 - (pctTick / 100) * 185;
                      const isMissionLine = pctTick === 50;
                      return (
                        <g key={`pay-ytick-${pctTick}`}>
                          <line
                            x1="64"
                            y1={y}
                            x2="940"
                            y2={y}
                            stroke={isMissionLine ? '#10B981' : '#334155'}
                            strokeOpacity={isMissionLine ? '0.85' : '0.35'}
                            strokeWidth={isMissionLine ? '1.5' : '1'}
                            strokeDasharray={pctTick === 0 ? undefined : '4 4'}
                          />
                          <text
                            x="58"
                            y={y + 3.5}
                            textAnchor="end"
                            className={`text-[9.5px] font-mono ${
                              isMissionLine
                                ? 'fill-emerald-600 dark:fill-emerald-400 font-bold'
                                : 'fill-slate-500 dark:fill-slate-400'
                            }`}
                          >
                            {pctTick}%
                          </text>
                        </g>
                      );
                    })}
                    <line x1="64" y1="25" x2="64" y2="215" className="stroke-slate-300 dark:stroke-slate-700" strokeWidth="1.5" />
                    <line x1="64" y1="215" x2="940" y2="215" className="stroke-slate-300 dark:stroke-slate-700" strokeWidth="1.5" />

                    {paymentGroups.slice(0, 28).map((g, idx, arr) => {
                      const colW = (940 - 76) / Math.max(arr.length, 1);
                      const x = 72 + idx * colW;
                      const barW = Math.min(24, Math.max(10, colW - 8));
                      const digH = (g.digitalPct / 100) * 185;
                      const cashH = (g.cashPct / 100) * 185;

                      return (
                        <g key={`pay-grp-${g.label}`}>
                          {/* Cash portion on top (Amber/Rose) */}
                          <rect
                            x={x}
                            y={215 - digH - cashH}
                            width={barW}
                            height={Math.max(0, cashH)}
                            fill={g.cashPct >= 75 ? '#F43F5E' : '#F59E0B'}
                            rx="2"
                          />
                          {/* Digital portion on bottom (Emerald) */}
                          <rect
                            x={x}
                            y={215 - digH}
                            width={barW}
                            height={Math.max(0, digH)}
                            fill="#10B981"
                            rx="2"
                          />
                          <text
                            x={x + barW / 2}
                            y={Math.max(20, 215 - digH - 4)}
                            textAnchor="middle"
                            className="fill-white text-[8.5px] font-mono font-bold"
                          >
                            {g.digitalPct >= 15 ? `${Math.round(g.digitalPct)}%` : ''}
                          </text>
                          <text
                            transform={`translate(${x + barW / 2}, 224) rotate(-32)`}
                            textAnchor="end"
                            className="fill-slate-700 dark:fill-slate-300 text-[9.5px] font-sans font-semibold"
                          >
                            {g.label.length > 13 ? `${g.label.slice(0, 12)}…` : g.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* Deep Visualization 2B: Top 12 Cash-Heavy Stations vs Top 12 Digital Champions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: Stations Taking Most Cash (Money Security Risk) */}
            <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/30 rounded-xl p-5 shadow-xs space-y-3">
              <div>
                <h3 className="text-sm font-bold text-rose-700 dark:text-rose-400 flex items-center gap-2">
                  <Banknote className="w-4 h-4" />
                  <span>Top 12 Stations Taking Most Cash (Convert to Digital for Money Security)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ranked by physical cash collected today (₹) and Cash %. High physical cash increases cash-handling risk.
                </p>
              </div>
              <div className="space-y-2.5">
                {top12CashHeavy.map((st, idx) => (
                  <div key={st.erp_code} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        #{idx + 1} {st.alds_name}{' '}
                        <span className="text-[11px] font-normal text-slate-500">
                          ({st.state} • TM: {st.tm})
                        </span>
                      </span>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                        ₹{Math.round(st.cashRs).toLocaleString('en-IN')} ({st.cashPct}% Cash)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-emerald-500/25 overflow-hidden flex">
                      <div
                        className="bg-rose-500 h-full"
                        style={{ width: `${Math.min(100, Math.max(2, st.cashPct))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Top 12 Digital Payment Champions */}
            <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-5 shadow-xs space-y-3">
              <div>
                <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Top 12 Digital Payment Champion Stations (Money Security Leaders)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Stations achieving the highest Digital / Paytm payment percentage, maximizing money security and instant settlement.
                </p>
              </div>
              <div className="space-y-2.5">
                {top12DigitalLeaders.map((st, idx) => (
                  <div key={st.erp_code} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        #{idx + 1} {st.alds_name}{' '}
                        <span className="text-[11px] font-normal text-slate-500">
                          ({st.state} • TM: {st.tm})
                        </span>
                      </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {st.digitalPct}% Digital (₹{Math.round(st.paytmRs).toLocaleString('en-IN')})
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-full"
                        style={{ width: `${Math.min(100, Math.max(2, st.digitalPct))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* All-Stations Cash vs Digital Payment Security Ledger */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  All-Station Cash vs Digital Payment &amp; Money Security Audit Ledger
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Identifies every station&apos;s exact Cash ₹, Cash %, Digital ₹, and Digital % so TMs can convert cash-heavy stations to digital payment.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="relative min-w-48">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={paymentSearch}
                    onChange={(e) => setPaymentSearch(e.target.value)}
                    placeholder="Search station or TM..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => setPaymentSort('cash_rs')}
                  className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                    paymentSort === 'cash_rs' ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Most Cash (₹)
                </button>
                <button
                  onClick={() => setPaymentSort('cash_pct')}
                  className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                    paymentSort === 'cash_pct' ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Highest Cash %
                </button>
                <button
                  onClick={() => setPaymentSort('digital_pct')}
                  className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                    paymentSort === 'digital_pct' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Highest Digital %
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Cost Code</th>
                    <th className="py-2.5 px-3">Station Name</th>
                    <th className="py-2.5 px-2">State</th>
                    <th className="py-2.5 px-3">TM</th>
                    <th className="py-2.5 px-3 text-right">Total Collection (₹)</th>
                    <th className="py-2.5 px-3 text-right">Cash Payment (₹)</th>
                    <th className="py-2.5 px-3 text-right">Cash %</th>
                    <th className="py-2.5 px-3 text-right">Digital Payment (₹)</th>
                    <th className="py-2.5 px-3 text-right">Digital %</th>
                    <th className="py-2.5 px-3">Visual Mix (Digital vs Cash)</th>
                    <th className="py-2.5 px-3 text-center">Money Security Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {sortedPaymentStations.map((st) => (
                    <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-bold text-orange-600 dark:text-orange-400">{st.erp_code}</td>
                      <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-white">{st.alds_name}</td>
                      <td className="py-2.5 px-2 font-sans text-slate-600 dark:text-slate-300">{st.state}</td>
                      <td className="py-2.5 px-3 font-sans text-slate-700 dark:text-slate-300">{st.tm}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                        ₹{Math.round(st.collRs).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                        ₹{Math.round(st.cashRs).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                        {st.cashPct}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        ₹{Math.round(st.paytmRs).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {st.digitalPct}%
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="w-28 h-2 rounded-full bg-rose-500/35 overflow-hidden flex">
                          <div
                            className="bg-emerald-500 h-full"
                            style={{ width: `${Math.min(100, Math.max(0, st.digitalPct))}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        <span
                          className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            st.digitalPct >= 50
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                              : st.cashPct >= 75
                              ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20'
                              : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                          }`}
                        >
                          {st.digitalPct >= 50
                            ? 'High Money Security'
                            : st.cashPct >= 75
                            ? 'High Cash Risk — Convert'
                            : 'Moderate Cash'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW 3: STATION SUPERVISOR (SS) ACCOUNTABILITY & CASH-RISK SCORECARD */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Station Supervisor (SS) Performance, Target Achievement &amp; Cash-Risk Scorecard ({supervisorRollup.length} Supervisors)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mapped from the <code className="font-mono">SS</code> column of <code className="font-mono">TM Target Daily.xlsx</code>. Ranks supervisors by physical cash held, digital adoption %, daily target achievement, and MTD cumulative volume.
              </p>
            </div>
            <div className="relative min-w-56 text-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={ssSearch}
                onChange={(e) => setSsSearch(e.target.value)}
                placeholder="Search Supervisor (SS), TM, or Station..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Station Supervisor (SS)</th>
                  <th className="py-2.5 px-3">TM &amp; State</th>
                  <th className="py-2.5 px-3">Assigned Station(s)</th>
                  <th className="py-2.5 px-3 text-right">Daily Target (L)</th>
                  <th className="py-2.5 px-3 text-right">Actual Sold (L)</th>
                  <th className="py-2.5 px-3 text-right">% Achieved</th>
                  <th className="py-2.5 px-3 text-right">MTD Sold / Monthly Tgt</th>
                  <th className="py-2.5 px-3 text-right">Physical Cash (₹)</th>
                  <th className="py-2.5 px-3 text-right">Digital / Cash %</th>
                  <th className="py-2.5 px-3 text-right">Collection Diff (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {supervisorRollup.map((row) => (
                  <tr key={`${row.ss}-${row.tm}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-sans font-bold text-slate-900 dark:text-white">
                      {row.ss}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-300">
                      <div className="font-semibold">{row.tm}</div>
                      <div className="text-[10px] text-slate-400">{row.state}</div>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-700 dark:text-slate-300 max-w-60 truncate" title={row.stationNames}>
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 mr-1">
                        ({row.stationCount})
                      </span>
                      <span>{row.stationNames}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400">
                      {formatTarget(row.dailyTgt)} L
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                      {formatTarget(row.actualSale)} L
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold">
                      <span
                        className={
                          row.achievePct >= 100
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : row.achievePct >= 90
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }
                      >
                        {row.achievePct}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-[11px]">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{formatTarget(row.mtdSale)}</span>
                      <span className="text-slate-400"> / {formatTarget(row.monthlyTgt)} L</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                      ₹{formatTarget(row.cashRs)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">{row.digPct}% Dig</span>
                      <span className="text-slate-400 mx-1">/</span>
                      <span className={row.cashPct >= 75 ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-amber-600 dark:text-amber-400'}>
                        {row.cashPct}% Cash
                      </span>
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold ${
                        row.diffRs > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      ₹{formatTarget(row.diffRs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
