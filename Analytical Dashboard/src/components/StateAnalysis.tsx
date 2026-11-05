import React from 'react';
import { MapPin, BarChart3, TrendingUp, Layers } from 'lucide-react';
import { StateSummary } from '../types';

interface StateAnalysisProps {
  states: StateSummary[];
  totalVolume: number;
}

export const StateAnalysis: React.FC<StateAnalysisProps> = ({ states, totalVolume }) => {
  const top3Volume = states.slice(0, 3).reduce((a, b) => a + b.total_sale_qty, 0);
  const top3Share = totalVolume > 0 ? ((top3Volume / totalVolume) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <MapPin className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-white">
                State Performance & Regional Concentration (CMD MIS Format)
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              State-wise consolidation (MS merged into MH, AP merged into TG) providing volume,
              pricing, efficiency, and network penetration.
            </p>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs">
            <span className="text-slate-400 block text-[11px]">Top 3 States Concentration:</span>
            <span className="text-lg font-bold font-mono text-orange-400">
              {top3Share}% of Total National Volume
            </span>
          </div>
        </div>
      </div>

      {/* State Visual Share Distribution Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          State Volume Share Distribution
        </h3>
        <div className="w-full h-4 bg-slate-950 rounded-lg overflow-hidden flex">
          {states.map((st, idx) => {
            const share = totalVolume > 0 ? (st.total_sale_qty / totalVolume) * 100 : 0;
            const colors = [
              'bg-orange-500',
              'bg-indigo-500',
              'bg-emerald-500',
              'bg-amber-500',
              'bg-rose-500',
              'bg-cyan-500',
              'bg-purple-500',
              'bg-blue-500',
            ];
            const colorClass = colors[idx % colors.length];

            return (
              <div
                key={st.state}
                style={{ width: `${share}%` }}
                className={`h-full ${colorClass} hover:opacity-80 transition-opacity relative group`}
                title={`${st.state}: ${st.total_sale_qty.toLocaleString('en-IN')} L (${share.toFixed(1)}%)`}
              />
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-medium">
          {states.map((st, idx) => {
            const share = totalVolume > 0 ? (st.total_sale_qty / totalVolume) * 100 : 0;
            const colors = [
              'text-orange-400',
              'text-indigo-400',
              'text-emerald-400',
              'text-amber-400',
              'text-rose-400',
              'text-cyan-400',
              'text-purple-400',
              'text-blue-400',
            ];
            const colorClass = colors[idx % colors.length];

            return (
              <div key={st.state} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${colorClass.replace('text-', 'bg-')}`} />
                <span className="text-slate-300">{st.state}:</span>
                <span className="font-mono text-white">{share.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Complete CMD MIS Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">State</th>
                <th className="py-3 px-3 text-right">Stations Total</th>
                <th className="py-3 px-3 text-right">Zero Sale Stns</th>
                <th className="py-3 px-3 text-right">Total Sale (L)</th>
                <th className="py-3 px-3 text-right">Avg / Station (L)</th>
                <th className="py-3 px-3 text-right">Collection (₹)</th>
                <th className="py-3 px-3 text-right">Nominal RSP</th>
                <th className="py-3 px-3 text-right">Effective RSP</th>
                <th className="py-3 px-3 text-right">Collection Gap</th>
                <th className="py-3 px-3 text-right">Free Sale (L)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {states.map((st) => (
                <tr key={st.state} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-sans font-bold text-white text-sm">{st.state}</td>
                  <td className="py-3 px-3 text-right text-slate-300 font-semibold">{st.stations}</td>
                  <td className="py-3 px-3 text-right">
                    {st.zero_sale_count > 0 ? (
                      <span className="text-amber-400 font-bold">{st.zero_sale_count}</span>
                    ) : (
                      <span className="text-emerald-400">0</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-white">
                    {st.total_sale_qty.toLocaleString('en-IN')} L
                  </td>
                  <td className="py-3 px-3 text-right text-orange-400">
                    {st.avg_sale_per_station.toLocaleString('en-IN')} L
                  </td>
                  <td className="py-3 px-3 text-right text-emerald-400 font-bold">
                    ₹{(st.total_collection / 100000).toFixed(2)} Lakh
                  </td>
                  <td className="py-3 px-3 text-right text-slate-400">
                    ₹{st.nominal_rsp.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-200 font-semibold">
                    ₹{st.effective_rsp.toFixed(2)}
                  </td>
                  <td
                    className={`py-3 px-3 text-right font-bold ${
                      st.collection_gap_per_l > 0.4 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    ₹{st.collection_gap_per_l.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-400">
                    {st.free_sale_litres.toLocaleString('en-IN')}
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
