import React, { useState } from 'react';
import { Users, Award, TrendingUp, AlertTriangle } from 'lucide-react';
import { TMSummary } from '../types';

interface TeamPerformanceProps {
  tms: TMSummary[];
}

export const TeamPerformance: React.FC<TeamPerformanceProps> = ({ tms }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = tms.filter(
    (t) =>
      t.tm.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.coordinator.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Users className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-white">
                Territory Managers & Coordinator Performance Leaderboard
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Evaluates operational sales throughput, station activation rate, and network delivery
              by TM and coordinator.
            </p>
          </div>

          <input
            type="text"
            placeholder="Search TM or Coordinator..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 w-full sm:w-55"
          />
        </div>
      </div>

      {/* TM Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Rank</th>
                <th className="py-3 px-3">Territory Manager</th>
                <th className="py-3 px-3">Coordinator</th>
                <th className="py-3 px-3 text-right">Stations</th>
                <th className="py-3 px-3 text-right">Total Sale Volume</th>
                <th className="py-3 px-3 text-right">Avg / Station</th>
                <th className="py-3 px-3 text-right">Collections</th>
                <th className="py-3 px-3 text-center">Zero-Sale</th>
                <th className="py-3 px-4 text-center">Throughput Efficiency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filtered.map((t, idx) => (
                <tr key={t.tm} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 text-slate-400">
                    {idx < 3 ? (
                      <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-bold flex items-center justify-center font-sans text-[11px]">
                        {idx + 1}
                      </span>
                    ) : (
                      <span className="font-sans text-slate-500">#{idx + 1}</span>
                    )}
                  </td>
                  <td className="py-3 px-3 font-sans font-bold text-white text-sm">{t.tm}</td>
                  <td className="py-3 px-3 font-sans text-slate-300">{t.coordinator}</td>
                  <td className="py-3 px-3 text-right text-slate-200">{t.stations}</td>
                  <td className="py-3 px-3 text-right font-bold text-indigo-300">
                    {t.total_sale_qty.toLocaleString('en-IN')} L
                  </td>
                  <td className="py-3 px-3 text-right text-orange-400">
                    {t.avg_daily_sale.toLocaleString('en-IN')} L
                  </td>
                  <td className="py-3 px-3 text-right text-emerald-400 font-medium">
                    ₹{(t.total_collection / 100000).toFixed(1)} L
                  </td>
                  <td className="py-3 px-3 text-center">
                    {t.zero_sale_count > 0 ? (
                      <span className="text-amber-400 font-semibold">{t.zero_sale_count}</span>
                    ) : (
                      <span className="text-emerald-400">0</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center font-sans">
                    <span
                      className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                        t.efficiency_pct >= 90
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : t.efficiency_pct >= 75
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}
                    >
                      {t.efficiency_pct}% Target
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
