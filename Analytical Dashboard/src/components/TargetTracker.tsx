import React from 'react';
import { Target, CheckCircle, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { StationRecord, StateSummary } from '../types';

interface TargetTrackerProps {
  states: StateSummary[];
  stations: StationRecord[];
}

export const TargetTracker: React.FC<TargetTrackerProps> = ({ states, stations }) => {
  // Compute target stats based on PRD bands:
  // Base daily target is 1100 Litres per station
  const stationTargets = stations.map((s) => {
    const target = 1100;
    const achievedPct = Number(((s.sale_qty / target) * 100).toFixed(1));
    let status: 'Achieved' | 'On track' | 'At risk' | 'Behind' = 'Achieved';

    if (achievedPct >= 100) status = 'Achieved';
    else if (achievedPct >= 90) status = 'On track';
    else if (achievedPct >= 75) status = 'At risk';
    else status = 'Behind';

    return {
      ...s,
      target,
      achievedPct,
      status,
    };
  });

  const countAchieved = stationTargets.filter((s) => s.status === 'Achieved').length;
  const countOnTrack = stationTargets.filter((s) => s.status === 'On track').length;
  const countAtRisk = stationTargets.filter((s) => s.status === 'At risk').length;
  const countBehind = stationTargets.filter((s) => s.status === 'Behind').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">
              Target Achievement Tracking & Status Bands (PRD Standard)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Tracks actual daily output against benchmark target (1,100 L/stn). Automatically
              categorized into Achieved, On Track, At Risk, and Behind bands.
            </p>
          </div>
        </div>
      </div>

      {/* Status Bands Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Achieved */}
        <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-4 shadow-sm bg-linear-to-b from-emerald-950/20 to-transparent">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" />
              <span>Achieved (&ge;100%)</span>
            </span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {((countAchieved / (stations.length || 1)) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">{countAchieved} Stations</div>
          <p className="text-[11px] text-slate-400 mt-1">Overperforming stations meeting daily goals</p>
        </div>

        {/* On Track */}
        <div className="bg-slate-900/80 border border-indigo-500/30 rounded-xl p-4 shadow-sm bg-linear-to-b from-indigo-950/20 to-transparent">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>On Track (90 - 99.9%)</span>
            </span>
            <span className="text-xs font-mono font-bold text-indigo-400">
              {((countOnTrack / (stations.length || 1)) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">{countOnTrack} Stations</div>
          <p className="text-[11px] text-slate-400 mt-1">Within standard operational variance</p>
        </div>

        {/* At Risk */}
        <div className="bg-slate-900/80 border border-amber-500/30 rounded-xl p-4 shadow-sm bg-linear-to-b from-amber-950/20 to-transparent">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>At Risk (75 - 89.9%)</span>
            </span>
            <span className="text-xs font-mono font-bold text-amber-400">
              {((countAtRisk / (stations.length || 1)) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">{countAtRisk} Stations</div>
          <p className="text-[11px] text-slate-400 mt-1">Requires coordinator push and support</p>
        </div>

        {/* Behind */}
        <div className="bg-slate-900/80 border border-rose-500/30 rounded-xl p-4 shadow-sm bg-linear-to-b from-rose-950/20 to-transparent">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
              <XCircle className="w-4 h-4" />
              <span>Behind (&lt;75%)</span>
            </span>
            <span className="text-xs font-mono font-bold text-rose-400">
              {((countBehind / (stations.length || 1)) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">{countBehind} Stations</div>
          <p className="text-[11px] text-slate-400 mt-1">Includes zero-sale & acute bottleneck stations</p>
        </div>
      </div>

      {/* Target Breakdown Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Cost Code</th>
                <th className="py-3 px-3">Station Name</th>
                <th className="py-3 px-2">State</th>
                <th className="py-3 px-2">Type</th>
                <th className="py-3 px-3">TM</th>
                <th className="py-3 px-3 text-right">Target</th>
                <th className="py-3 px-3 text-right">Actual Sold</th>
                <th className="py-3 px-3 text-right">Achievement %</th>
                <th className="py-3 px-3 text-center">Status Band</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {stationTargets.slice(0, 30).map((st) => (
                <tr key={st.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-orange-400">{st.erp_code}</td>
                  <td className="py-2.5 px-3 font-sans font-semibold text-white">{st.alds_name}</td>
                  <td className="py-2.5 px-2 font-sans text-slate-300">{st.state}</td>
                  <td className="py-2.5 px-2 font-sans text-slate-400">{st.type}</td>
                  <td className="py-2.5 px-3 font-sans text-slate-300">{st.tm}</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">1,100 L</td>
                  <td className="py-2.5 px-3 text-right font-bold text-white">
                    {st.sale_qty.toLocaleString('en-IN')} L
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold">
                    <span
                      className={
                        st.achievedPct >= 100
                          ? 'text-emerald-400'
                          : st.achievedPct >= 90
                          ? 'text-indigo-400'
                          : st.achievedPct >= 75
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }
                    >
                      {st.achievedPct}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center font-sans">
                    <span
                      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        st.status === 'Achieved'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : st.status === 'On track'
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                          : st.status === 'At risk'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}
                    >
                      {st.status}
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
