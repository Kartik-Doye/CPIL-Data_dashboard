import React, { useState, useMemo } from 'react';
import { Grid, Search } from 'lucide-react';
import { StationRecord } from '../types';

interface StationHeatmapProps {
  stations: StationRecord[];
  recentDates?: string[];
}

export const StationHeatmap: React.FC<StationHeatmapProps> = ({ stations, recentDates }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const dates = useMemo(() => {
    if (recentDates && recentDates.length > 0) {
      return recentDates;
    }
    const collected = new Set<string>();
    for (const s of stations) {
      if (s.recent_7d_sales && s.recent_7d_sales.length > 0) {
        for (const pt of s.recent_7d_sales) {
          if (pt.date) collected.add(pt.date);
        }
      } else if (s.sale_date) {
        collected.add(s.sale_date);
      }
    }
    return [...collected].sort().slice(-7);
  }, [stations, recentDates]);

  const filtered = useMemo(() => {
    return stations
      .filter((s) => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
          s.erp_code.toLowerCase().includes(q) ||
          s.alds_name.toLowerCase().includes(q) ||
          s.state.toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  }, [stations, searchTerm]);

  const thresholds = useMemo(() => {
    const positiveVols: number[] = [];
    for (const s of stations) {
      if (s.recent_7d_sales && s.recent_7d_sales.length > 0) {
        for (const pt of s.recent_7d_sales) {
          if (pt.sale_qty > 0) positiveVols.push(pt.sale_qty);
        }
      } else if (s.sale_qty > 0) {
        positiveVols.push(s.sale_qty);
      }
    }
    if (positiveVols.length < 4) {
      return { q1: 500, median: 1000, q3: 1600 };
    }
    const sorted = [...positiveVols].sort((a, b) => a - b);
    const pick = (p: number) => Math.round(sorted[Math.floor((sorted.length - 1) * p)]);
    return {
      q1: Math.max(1, pick(0.25)),
      median: Math.max(2, pick(0.5)),
      q3: Math.max(3, pick(0.75)),
    };
  }, [stations]);

  const getHeatmapColor = (vol: number | null) => {
    if (vol === null) return 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400';
    if (vol === 0) return 'bg-rose-500/80 text-white font-bold';
    if (vol < thresholds.q1) return 'bg-amber-600/70 text-white';
    if (vol < thresholds.median) return 'bg-yellow-500/60 text-slate-900 dark:text-slate-100 font-semibold';
    if (vol < thresholds.q3) return 'bg-emerald-600/75 text-white';
    return 'bg-emerald-500 text-white font-bold';
  };

  const formatShortDate = (dateStr: string) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20">
                <Grid className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Station Performance Intensity Heatmap Matrix
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Displays actual reported daily station volumes from PostgreSQL across the {dates.length} most recent loaded date(s). Unreported dates are shown as &ldquo;—&rdquo; without synthetic imputation.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search station or state in matrix..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-orange-500/50"
            />
          </div>
        </div>
      </div>

      {/* Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-white dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
        <span className="text-slate-600 dark:text-slate-400 font-medium">Intensity Spectrum (Actual DB Litres):</span>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-slate-200 dark:bg-slate-800" />
            <span className="text-slate-600 dark:text-slate-300">— (No Report)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-rose-500/80" />
            <span className="text-slate-600 dark:text-slate-300">0 L (Zero Sale)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-amber-600/70" />
            <span className="text-slate-600 dark:text-slate-300">&lt;{thresholds.q1} L (Q1)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-yellow-500/60" />
            <span className="text-slate-600 dark:text-slate-300">{thresholds.q1}–{thresholds.median} L</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-emerald-600/75" />
            <span className="text-slate-600 dark:text-slate-300">{thresholds.median}–{thresholds.q3} L</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-emerald-500" />
            <span className="text-slate-600 dark:text-slate-300">&gt;{thresholds.q3} L (Top Q4)</span>
          </div>
        </div>
      </div>

      {/* Heatmap Grid Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 sticky left-0 bg-slate-50 dark:bg-slate-950 z-10 w-52">
                  Station (Code & Name)
                </th>
                <th className="py-2.5 px-2">State</th>
                {dates.map((d) => (
                  <th key={d} className="py-2.5 px-3 text-center font-mono">
                    {formatShortDate(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {filtered.map((st) => {
                const salesMap = new Map<string, number>();
                if (st.recent_7d_sales && st.recent_7d_sales.length > 0) {
                  for (const pt of st.recent_7d_sales) {
                    salesMap.set(pt.date, pt.sale_qty);
                  }
                }
                if (st.sale_date && !salesMap.has(st.sale_date)) {
                  salesMap.set(st.sale_date, st.sale_qty);
                }

                return (
                  <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-3 sticky left-0 bg-white dark:bg-slate-900 z-10 font-sans border-r border-slate-200 dark:border-slate-800/80">
                      <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[190px]">
                        {st.alds_name}
                      </div>
                      <div className="text-[10px] text-orange-600 dark:text-orange-400 font-mono">{st.erp_code}</div>
                    </td>
                    <td className="py-2 px-2 font-sans text-slate-600 dark:text-slate-400">{st.state}</td>
                    {dates.map((dateKey) => {
                      const rawVol = salesMap.has(dateKey) ? salesMap.get(dateKey)! : null;
                      const roundedVol = rawVol !== null ? Math.round(rawVol) : null;
                      return (
                        <td key={dateKey} className="py-1 px-1.5 text-center">
                          <div
                            className={`py-1 px-1.5 rounded text-[11px] font-mono transition-transform hover:scale-105 ${getHeatmapColor(
                              roundedVol
                            )}`}
                            title={
                              roundedVol === null
                                ? `${st.alds_name}: No report on ${dateKey}`
                                : `${st.alds_name}: ${rawVol!.toLocaleString('en-IN')} L on ${dateKey}`
                            }
                          >
                            {roundedVol === null ? '—' : roundedVol > 0 ? `${roundedVol}L` : 'ZERO'}
                          </div>
                        </td>
                      );
                    })}
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
