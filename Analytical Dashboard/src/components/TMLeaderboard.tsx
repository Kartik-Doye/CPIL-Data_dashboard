import React, { useState } from 'react';
import { Users, Award, TrendingUp, AlertTriangle, CheckCircle2, Search, Download } from 'lucide-react';
import { TMSummary, ExecutiveTelemetry } from '../types';
import { fmtQty, fmtCurrency, fmtLakhs } from '../engine/formatting';

interface TMLeaderboardProps {
  tms: TMSummary[];
  isCompact?: boolean;
}

export const TMLeaderboard: React.FC<TMLeaderboardProps> = ({ tms, isCompact = false }) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'total_sale_qty' | 'avg_daily_sale' | 'efficiency_pct'>('total_sale_qty');

  const filtered = tms
    .filter(
      (t) =>
        t.tm.toLowerCase().includes(search.toLowerCase()) ||
        t.coordinator.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => b[sortBy] - a[sortBy]);

  const topTM = filtered[0];
  const totalVolume = tms.reduce((a, b) => a + b.total_sale_qty, 0);

  return (
    <div className="space-y-5">
      {/* Header & KPI Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Territory Manager & Field Coordinator Performance Leaderboard
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Ranks territory leaders by total volume, average station throughput, and zero-sale recovery efficiency.
                </p>
              </div>
            </div>
          </div>

          {topTM && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30">
              <Award className="w-6 h-6 text-amber-500 shrink-0" />
              <div className="text-xs">
                <span className="text-amber-700 dark:text-amber-400 font-semibold block">#1 Top Performing TM</span>
                <span className="font-bold text-slate-900 dark:text-white">{topTM.tm}</span>
                <span className="text-slate-500 dark:text-slate-400 ml-1 font-mono">({fmtQty(topTM.total_sale_qty)} L)</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs">
        <div className="relative min-w-55">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search TM or Coordinator..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 dark:text-slate-400">Sort Leaderboard:</span>
          <button
            onClick={() => setSortBy('total_sale_qty')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              sortBy === 'total_sale_qty' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            Total Volume
          </button>
          <button
            onClick={() => setSortBy('avg_daily_sale')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              sortBy === 'avg_daily_sale' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            Avg Station Sale
          </button>
          <button
            onClick={() => setSortBy('efficiency_pct')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              sortBy === 'efficiency_pct' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            Benchmark %
          </button>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Rank & TM Name</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Coordinator</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-center`}>Stations</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Total Territory Sale</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Avg Daily / Stn</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-center`}>Zero Sales</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Network Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-slate-800 dark:text-slate-200">
              {filtered.map((t, idx) => {
                const sharePct = totalVolume > 0 ? ((t.total_sale_qty / totalVolume) * 100).toFixed(1) : '0';
                return (
                  <tr key={t.tm} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className={`px-4 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[11px] font-bold ${
                          idx === 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">{t.tm}</span>
                      </div>
                    </td>

                    <td className={`px-4 font-sans text-slate-600 dark:text-slate-300 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {t.coordinator || 'Unassigned'}
                    </td>

                    <td className={`px-4 text-center font-bold ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {t.stations}
                    </td>

                    <td className={`px-4 text-right font-bold text-indigo-600 dark:text-indigo-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {fmtQty(t.total_sale_qty)} L
                    </td>

                    <td className={`px-4 text-right text-slate-600 dark:text-slate-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {fmtQty(t.avg_daily_sale)} L/d
                    </td>

                    <td className={`px-4 text-center font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {t.zero_sale_count > 0 ? (
                        <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400">
                          {t.zero_sale_count} Zero
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">0 Zero</span>
                      )}
                    </td>

                    <td className={`px-4 text-right font-bold text-slate-900 dark:text-white ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {sharePct}%
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
