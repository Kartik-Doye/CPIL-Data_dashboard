import React, { useState, useMemo } from 'react';
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  BarChart3,
  Layers,
} from 'lucide-react';
import { ExecutiveTelemetry, StationRecord } from '../types';
import { fmtQty, fmtCurrency, fmtLakhs, escapeCsvCell } from '../engine/formatting';

interface PeriodComparisonSuiteProps {
  data: ExecutiveTelemetry;
  stations: StationRecord[];
  isCompact?: boolean;
  onSelectStation?: (station: StationRecord) => void;
}

export const PeriodComparisonSuite: React.FC<PeriodComparisonSuiteProps> = ({
  data,
  stations,
  isCompact = false,
  onSelectStation,
}) => {
  const [subView, setSubView] = useState<'dod' | 'weekly' | 'intramonth' | 'mom' | 'quarterly' | 'weekend'>('dod');
  const [dodFilter, setDodFilter] = useState<'all' | 'gainers' | 'decliners'>('all');

  // 1. Day-over-Day (DoD) Station & State Comparison (Report 4)
  const dodRows = useMemo(() => {
    return stations
      .filter((s) => s.prev_day_sale_qty !== null && s.prev_day_sale_qty !== undefined)
      .map((s) => {
        const prev = s.prev_day_sale_qty ?? 0;
        const curr = s.sale_qty;
        const delta = Number((curr - prev).toFixed(2));
        const deltaPct = prev > 0 ? Number((((curr - prev) / prev) * 100).toFixed(1)) : curr > 0 ? 100 : 0;
        return {
          station: s,
          prev,
          curr,
          delta,
          deltaPct,
        };
      })
      .filter((r) => {
        if (dodFilter === 'gainers') return r.delta > 0;
        if (dodFilter === 'decliners') return r.delta < 0;
        return true;
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [stations, dodFilter]);

  const dodTotalCurr = dodRows.reduce((s, r) => s + r.curr, 0);
  const dodTotalPrev = dodRows.reduce((s, r) => s + r.prev, 0);
  const dodNetDelta = dodTotalCurr - dodTotalPrev;
  const dodNetPct = dodTotalPrev > 0 ? Number((((dodTotalCurr - dodTotalPrev) / dodTotalPrev) * 100).toFixed(1)) : null;

  // 2. Weekly Performance & 7-Day Moving Average (Reports 5 & 6)
  const weeklyRows = useMemo(() => {
    const history = data.history_30d || [];
    const buckets = new Map<
      string,
      { weekStart: string; weekEnd: string; days: number; totalSale: number; totalColl: number; maxActive: number }
    >();
    for (const pt of history) {
      const d = new Date(`${pt.date}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) continue;
      // Monday-start week
      const day = d.getUTCDay();
      const diffToMon = (day + 6) % 7;
      const mon = new Date(d.getTime() - diffToMon * 86400000);
      const sun = new Date(mon.getTime() + 6 * 86400000);
      const key = mon.toISOString().slice(0, 10);
      const existing = buckets.get(key) || {
        weekStart: key,
        weekEnd: sun.toISOString().slice(0, 10),
        days: 0,
        totalSale: 0,
        totalColl: 0,
        maxActive: 0,
      };
      existing.days += 1;
      existing.totalSale += pt.sale_qty;
      existing.totalColl += pt.collection;
      existing.maxActive = Math.max(existing.maxActive, pt.active_stations);
      buckets.set(key, existing);
    }
    const list = [...buckets.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    return list.map((w, idx) => {
      const avgDaily = w.days > 0 ? w.totalSale / w.days : 0;
      const prevAvgDaily = idx > 0 && list[idx - 1].days > 0 ? list[idx - 1].totalSale / list[idx - 1].days : null;
      const wowDailyPct =
        prevAvgDaily && prevAvgDaily > 0 ? Number((((avgDaily - prevAvgDaily) / prevAvgDaily) * 100).toFixed(1)) : null;
      return {
        ...w,
        avgDaily: Math.round(avgDaily),
        wowDailyPct,
      };
    });
  }, [data.history_30d]);

  // 3. Month-on-Month (MoM) & Network Expansion (Reports 7 & 20)
  const monthlyRows = useMemo(() => {
    const filteredCodes = new Set(stations.map((s) => s.erp_code));
    const rawMonthly = (data.station_monthly_sales || []).filter((m) => filteredCodes.has(m.erp_code));
    const map = new Map<string, { month: string; totalSale: number; stationCount: number; maxReportingDays: number }>();
    for (const row of rawMonthly) {
      const cur = map.get(row.month) || { month: row.month, totalSale: 0, stationCount: 0, maxReportingDays: 0 };
      cur.totalSale += row.sale_qty;
      if (row.sale_qty > 0) cur.stationCount += 1;
      cur.maxReportingDays = Math.max(cur.maxReportingDays, row.reporting_days);
      map.set(row.month, cur);
    }
    const list = [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
    return list.map((m, idx) => {
      const avgPerDay = m.maxReportingDays > 0 ? m.totalSale / m.maxReportingDays : 0;
      const avgPerStationDay =
        m.stationCount > 0 && m.maxReportingDays > 0 ? m.totalSale / (m.stationCount * m.maxReportingDays) : 0;
      const prevAvgPerDay =
        idx > 0 && list[idx - 1].maxReportingDays > 0
          ? list[idx - 1].totalSale / list[idx - 1].maxReportingDays
          : null;
      const momDailyGrowthPct =
        prevAvgPerDay && prevAvgPerDay > 0
          ? Number((((avgPerDay - prevAvgPerDay) / prevAvgPerDay) * 100).toFixed(1))
          : null;
      return {
        ...m,
        avgPerDay: Math.round(avgPerDay),
        avgPerStationDay: Math.round(avgPerStationDay),
        momDailyGrowthPct,
      };
    });
  }, [data.station_monthly_sales, stations]);

  // 4. Weekend vs Weekday Dynamics (Report 18)
  const weekdayDynamics = useMemo(() => {
    const history = data.history_30d || [];
    const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const map = new Map<string, { count: number; totalSale: number; totalColl: number }>();
    for (const dName of order) map.set(dName, { count: 0, totalSale: 0, totalColl: 0 });
    for (const pt of history) {
      const cur = map.get(pt.day_name) || { count: 0, totalSale: 0, totalColl: 0 };
      cur.count += 1;
      cur.totalSale += pt.sale_qty;
      cur.totalColl += pt.collection;
      map.set(pt.day_name, cur);
    }
    const rows = order.map((dayName) => {
      const item = map.get(dayName)!;
      const isWeekend = dayName === 'Saturday' || dayName === 'Sunday';
      return {
        dayName,
        isWeekend,
        daysObserved: item.count,
        avgSale: item.count > 0 ? Math.round(item.totalSale / item.count) : 0,
        avgColl: item.count > 0 ? Math.round(item.totalColl / item.count) : 0,
      };
    });
    const weekdayObs = rows.filter((r) => !r.isWeekend && r.daysObserved > 0);
    const weekendObs = rows.filter((r) => r.isWeekend && r.daysObserved > 0);
    const weekdayMean =
      weekdayObs.length > 0 ? Math.round(weekdayObs.reduce((s, r) => s + r.avgSale, 0) / weekdayObs.length) : 0;
    const weekendMean =
      weekendObs.length > 0 ? Math.round(weekendObs.reduce((s, r) => s + r.avgSale, 0) / weekendObs.length) : 0;
    const weekendDiffPct =
      weekdayMean > 0 ? Number((((weekendMean - weekdayMean) / weekdayMean) * 100).toFixed(1)) : null;

    return { rows, weekdayMean, weekendMean, weekendDiffPct };
  }, [data.history_30d]);

  // 5. Intra-Month Week 1/2/3/4 Slices (Report 17)
  const intraMonthSlices = useMemo(() => {
    const history = data.history_30d || [];
    const buckets = new Map<
      string,
      { month: string; slice: string; days: number; totalSale: number; totalColl: number }
    >();
    for (const pt of history) {
      const d = new Date(`${pt.date}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) continue;
      const monthKey = pt.date.slice(0, 7);
      const dayOfMonth = d.getUTCDate();
      const sliceLabel =
        dayOfMonth <= 7
          ? 'Week 1 (Days 1–7)'
          : dayOfMonth <= 14
            ? 'Week 2 (Days 8–14)'
            : dayOfMonth <= 21
              ? 'Week 3 (Days 15–21)'
              : 'Week 4+ (Days 22–End)';
      const key = `${monthKey}__${sliceLabel}`;
      const cur = buckets.get(key) || {
        month: monthKey,
        slice: sliceLabel,
        days: 0,
        totalSale: 0,
        totalColl: 0,
      };
      cur.days += 1;
      cur.totalSale += pt.sale_qty;
      cur.totalColl += pt.collection;
      buckets.set(key, cur);
    }
    return [...buckets.values()]
      .sort((a, b) => a.month.localeCompare(b.month) || a.slice.localeCompare(b.slice))
      .map((item) => ({
        ...item,
        avgDailySale: item.days > 0 ? Math.round(item.totalSale / item.days) : 0,
        avgDailyColl: item.days > 0 ? Math.round(item.totalColl / item.days) : 0,
      }));
  }, [data.history_30d]);

  // 6. Financial Year Quarterly Analysis Q1–Q4 (Report 19)
  const quarterlyRows = useMemo(() => {
    const history = data.history_30d || [];
    const buckets = new Map<
      string,
      { fyQuarter: string; days: number; totalSale: number; totalColl: number; peakActive: number }
    >();
    for (const pt of history) {
      const d = new Date(`${pt.date}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) continue;
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1; // 1..12
      const fyStart = month >= 4 ? year : year - 1;
      const fyLabel = `FY ${fyStart}-${String(fyStart + 1).slice(-2)}`;
      const qLabel =
        month >= 4 && month <= 6
          ? 'Q1 (Apr–Jun)'
          : month >= 7 && month <= 9
            ? 'Q2 (Jul–Sep)'
            : month >= 10 && month <= 12
              ? 'Q3 (Oct–Dec)'
              : 'Q4 (Jan–Mar)';
      const key = `${fyLabel} • ${qLabel}`;
      const cur = buckets.get(key) || {
        fyQuarter: key,
        days: 0,
        totalSale: 0,
        totalColl: 0,
        peakActive: 0,
      };
      cur.days += 1;
      cur.totalSale += pt.sale_qty;
      cur.totalColl += pt.collection;
      cur.peakActive = Math.max(cur.peakActive, pt.active_stations);
      buckets.set(key, cur);
    }
    const list = [...buckets.values()];
    return list.map((q, idx) => {
      const avgDaily = q.days > 0 ? Math.round(q.totalSale / q.days) : 0;
      const prevAvg = idx > 0 && list[idx - 1].days > 0 ? list[idx - 1].totalSale / list[idx - 1].days : null;
      const qoqPct = prevAvg && prevAvg > 0 ? Number((((avgDaily - prevAvg) / prevAvg) * 100).toFixed(1)) : null;
      return {
        ...q,
        avgDaily,
        qoqPct,
      };
    });
  }, [data.history_30d]);

  const exportDoDCSV = () => {
    const headers = [
      'ERP Code',
      'Station Name',
      'State',
      'TM',
      `Previous Sale (${data.previous_date || 'Prev'})`,
      `Selected Sale (${data.date})`,
      'Delta (L)',
      'Delta (%)',
    ];
    const rows = dodRows.map((r) => [
      escapeCsvCell(r.station.erp_code),
      escapeCsvCell(r.station.alds_name),
      escapeCsvCell(r.station.state),
      escapeCsvCell(r.station.tm),
      r.prev,
      r.curr,
      r.delta,
      r.deltaPct,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GO_Gas_DoD_Variance_${data.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Sub-Report Switcher */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Multi-Period Variance & Temporal Comparison Suite (Reports 4, 6, 7, 17, 18, 19 & 20)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Compare Day-over-Day (DoD) station shifts, Weekly Mon–Sun pacing, Intra-Month Week 1–4 slices, Month-on-Month (MoM) growth, FY Quarterly (Q1–Q4) trends, and Weekend vs Weekday dynamics.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            {[
              { id: 'dod', label: 'R4: Day-over-Day' },
              { id: 'weekly', label: 'R6: Weekly' },
              { id: 'intramonth', label: 'R17: Intra-Month W1–W4' },
              { id: 'mom', label: 'R7 & R20: MoM Growth' },
              { id: 'quarterly', label: 'R19: Quarterly (Q1–Q4)' },
              { id: 'weekend', label: 'R18: Weekend vs Weekday' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSubView(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${subView === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Subview 1: Day-over-Day (DoD) Variance */}
      {subView === 'dod' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                Selected Date ({data.date}) Volume
              </span>
              <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                {fmtQty(dodTotalCurr)} L
              </span>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                Prior Date ({data.previous_date || 'Unavailable'}) Volume
              </span>
              <span className="text-xl font-bold font-mono text-slate-700 dark:text-slate-300">
                {data.previous_date ? `${fmtQty(dodTotalPrev)} L` : 'N/A'}
              </span>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Net DoD Variance</span>
              <span
                className={`text-xl font-bold font-mono ${dodNetDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
              >
                {data.previous_date
                  ? `${dodNetDelta >= 0 ? '+' : ''}${fmtQty(dodNetDelta)} L (${dodNetPct !== null ? `${dodNetPct >= 0 ? '+' : ''}${dodNetPct}%` : '—'})`
                  : 'N/A'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs">
            <div className="flex items-center gap-1.5">
              {(['all', 'gainers', 'decliners'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setDodFilter(f)}
                  className={`px-3 py-1 rounded-lg font-semibold capitalize transition-colors cursor-pointer ${dodFilter === f
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                >
                  {f} ({f === 'all' ? dodRows.length : f === 'gainers' ? dodRows.filter((r) => r.delta > 0).length : dodRows.filter((r) => r.delta < 0).length})
                </button>
              ))}
            </div>
            <button
              onClick={exportDoDCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export DoD CSV</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Cost Code & Station</th>
                    <th className={`px-3 ${isCompact ? 'py-2' : 'py-3'}`}>State & TM</th>
                    <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>
                      Prior ({data.previous_date || 'Prev'})
                    </th>
                    <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>
                      Current ({data.date})
                    </th>
                    <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>DoD Change (L)</th>
                    <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-center`}>DoD %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {dodRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400 font-sans">
                        No prior-day comparison records available for the selected date/filter.
                      </td>
                    </tr>
                  ) : (
                    dodRows.slice(0, 100).map((r) => (
                      <tr
                        key={r.station.erp_code}
                        onClick={() => onSelectStation?.(r.station)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                      >
                        <td className={`px-4 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                          <div className="font-bold text-slate-900 dark:text-white hover:text-orange-600 dark:hover:text-orange-400">{r.station.erp_code}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{r.station.alds_name}</div>
                        </td>
                        <td className={`px-3 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                          <div className="font-medium text-slate-800 dark:text-slate-200">{r.station.state}</div>
                          <div className="text-[11px] text-slate-500">{r.station.tm}</div>
                        </td>
                        <td className={`px-4 text-right text-slate-600 dark:text-slate-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                          {fmtQty(r.prev)} L
                        </td>
                        <td className={`px-4 text-right font-bold text-slate-900 dark:text-white ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                          {fmtQty(r.curr)} L
                        </td>
                        <td
                          className={`px-4 text-right font-bold ${isCompact ? 'py-1.5' : 'py-2.5'} ${r.delta > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : r.delta < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-400'
                            }`}
                        >
                          {r.delta > 0 ? '+' : ''}
                          {fmtQty(r.delta)} L
                        </td>
                        <td className={`px-4 text-center ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                          <span
                            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-bold ${r.deltaPct > 0
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : r.deltaPct < 0
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                : 'bg-slate-500/10 text-slate-500'
                              }`}
                          >
                            {r.deltaPct > 0 ? <ArrowUpRight className="w-3 h-3" /> : r.deltaPct < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
                            {r.deltaPct > 0 ? '+' : ''}
                            {r.deltaPct}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Subview 2: Weekly Performance Analysis */}
      {subView === 'weekly' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Report 6: Weekly Performance Breakdown (Mon–Sun Window)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Week-on-week comparison normalized by average daily volume so partial weeks are compared fairly.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Week Window (Mon – Sun)</th>
                  <th className="py-3 px-3 text-center">Loaded Days</th>
                  <th className="py-3 px-3 text-center">Peak Active Stns</th>
                  <th className="py-3 px-4 text-right">Total Weekly Volume</th>
                  <th className="py-3 px-4 text-right">Avg Daily Run-Rate</th>
                  <th className="py-3 px-4 text-right">Total Collections</th>
                  <th className="py-3 px-4 text-center">WoW Daily Run-Rate %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {weeklyRows.map((w) => (
                  <tr key={w.weekStart} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      {w.weekStart} → {w.weekEnd}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-300">{w.days}d</td>
                    <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-300">{w.maxActive}</td>
                    <td className="py-3 px-4 text-right font-bold text-indigo-600 dark:text-indigo-400">
                      {fmtQty(w.totalSale)} L
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white">
                      {fmtQty(w.avgDaily)} L/d
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">
                      {fmtCurrency(w.totalColl)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {w.wowDailyPct === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[11px] ${w.wowDailyPct >= 0
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            }`}
                        >
                          {w.wowDailyPct >= 0 ? '+' : ''}
                          {w.wowDailyPct}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subview: Intra-Month Week 1/2/3/4 Slices (Report 17) */}
      {subView === 'intramonth' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Report 17: Intra-Month Week 1 / 2 / 3 / 4 Volume &amp; Collection Slices
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Segments each month into Days 1–7, Days 8–14, Days 15–21, and Days 22–End to track intra-month pacing.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Month</th>
                  <th className="py-3 px-4">Intra-Month Segment</th>
                  <th className="py-3 px-3 text-center">Observed Days</th>
                  <th className="py-3 px-4 text-right">Segment Volume</th>
                  <th className="py-3 px-4 text-right">Avg Daily Run-Rate</th>
                  <th className="py-3 px-4 text-right">Segment Collections</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {intraMonthSlices.map((s) => (
                  <tr key={`${s.month}-${s.slice}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{s.month}</td>
                    <td className="py-3 px-4 font-sans font-semibold text-indigo-600 dark:text-indigo-400">{s.slice}</td>
                    <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-300">{s.days}d</td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">{fmtQty(s.totalSale)} L</td>
                    <td className="py-3 px-4 text-right text-orange-600 dark:text-orange-400 font-semibold">{fmtQty(s.avgDailySale)} L/d</td>
                    <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">{fmtCurrency(s.totalColl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subview: Quarterly Analysis Q1-Q4 (Report 19) */}
      {subView === 'quarterly' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Report 19: Financial Year Quarterly Analysis (Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Aggregates daily volume, collection, and daily run-rate by Indian Financial Year Quarter.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">FY Quarter</th>
                  <th className="py-3 px-3 text-center">Loaded Days</th>
                  <th className="py-3 px-3 text-center">Peak Active Stns</th>
                  <th className="py-3 px-4 text-right">Total Quarter Volume</th>
                  <th className="py-3 px-4 text-right">Avg Daily Run-Rate</th>
                  <th className="py-3 px-4 text-right">Total Quarter Collections</th>
                  <th className="py-3 px-4 text-center">QoQ Daily Pace %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {quarterlyRows.map((q) => (
                  <tr key={q.fyQuarter} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{q.fyQuarter}</td>
                    <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-300">{q.days}d</td>
                    <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-300">{q.peakActive}</td>
                    <td className="py-3 px-4 text-right font-bold text-indigo-600 dark:text-indigo-400">{fmtQty(q.totalSale)} L</td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white">{fmtQty(q.avgDaily)} L/d</td>
                    <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">{fmtCurrency(q.totalColl)}</td>
                    <td className="py-3 px-4 text-center">
                      {q.qoqPct === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[11px] ${q.qoqPct >= 0
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            }`}
                        >
                          {q.qoqPct >= 0 ? '+' : ''}
                          {q.qoqPct}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subview 3: Month-on-Month (MoM) Growth & Network Expansion */}
      {subView === 'mom' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Reports 7 & 20: Month-on-Month (MoM) Growth & Active Station Expansion
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Compares monthly station volume, active reporting footprint, and normalized daily throughput for the current filter selection.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Calendar Month</th>
                  <th className="py-3 px-3 text-center">Active Stations</th>
                  <th className="py-3 px-3 text-center">Reporting Days</th>
                  <th className="py-3 px-4 text-right">Cumulative Volume</th>
                  <th className="py-3 px-4 text-right">Avg Volume / Day</th>
                  <th className="py-3 px-4 text-right">Avg / Station / Day</th>
                  <th className="py-3 px-4 text-center">MoM Daily Pace %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {monthlyRows.map((m) => (
                  <tr key={m.month} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{m.month.slice(0, 7)}</td>
                    <td className="py-3 px-3 text-center font-semibold text-slate-800 dark:text-slate-200">
                      {m.stationCount} stns
                    </td>
                    <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-400">
                      {m.maxReportingDays}d
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-indigo-600 dark:text-indigo-400">
                      {fmtQty(m.totalSale)} L ({fmtLakhs(m.totalSale)})
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white">
                      {fmtQty(m.avgPerDay)} L/d
                    </td>
                    <td className="py-3 px-4 text-right text-orange-600 dark:text-orange-400">
                      {fmtQty(m.avgPerStationDay)} L/stn/d
                    </td>
                    <td className="py-3 px-4 text-center">
                      {m.momDailyGrowthPct === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[11px] ${m.momDailyGrowthPct >= 0
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            }`}
                        >
                          {m.momDailyGrowthPct >= 0 ? '+' : ''}
                          {m.momDailyGrowthPct}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subview 4: Weekend vs Weekday Dynamics */}
      {subView === 'weekend' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Weekday Mean Volume (Mon–Fri)</span>
              <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                {fmtQty(weekdayDynamics.weekdayMean)} L/d
              </span>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Weekend Mean Volume (Sat–Sun)</span>
              <span className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                {fmtQty(weekdayDynamics.weekendMean)} L/d
              </span>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Empirical Weekend Differential</span>
              <span
                className={`text-xl font-bold font-mono ${(weekdayDynamics.weekendDiffPct ?? 0) >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
                  }`}
              >
                {weekdayDynamics.weekendDiffPct === null
                  ? 'N/A'
                  : `${weekdayDynamics.weekendDiffPct >= 0 ? '+' : ''}${weekdayDynamics.weekendDiffPct}% vs Weekdays`}
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Day of Week</th>
                    <th className="py-3 px-3">Classification</th>
                    <th className="py-3 px-3 text-center">Observed Days (30d Window)</th>
                    <th className="py-3 px-4 text-right">Average Daily Sales (L)</th>
                    <th className="py-3 px-4 text-right">Average Daily Collections (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {weekdayDynamics.rows.map((r) => (
                    <tr key={r.dayName} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-sans font-bold text-slate-900 dark:text-white">{r.dayName}</td>
                      <td className="py-3 px-3 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${r.isWeekend
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                        >
                          {r.isWeekend ? 'Weekend' : 'Weekday'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-400">{r.daysObserved}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                        {fmtQty(r.avgSale)} L
                      </td>
                      <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">
                        {fmtCurrency(r.avgColl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
