import React, { useState } from 'react';
import { DollarSign, AlertCircle, TrendingDown, ArrowRight, Download, Search, Percent } from 'lucide-react';
import { StationRecord, ExecutiveTelemetry } from '../types';
import { fmtQty, fmtCurrency, fmtLakhs } from '../engine/formatting';

interface RSPDisparityReportProps {
  stations: StationRecord[];
  telemetry: ExecutiveTelemetry;
  isCompact?: boolean;
}

export const RSPDisparityReport: React.FC<RSPDisparityReportProps> = ({
  stations,
  telemetry,
  isCompact = false,
}) => {
  const [search, setSearch] = useState('');
  const [minGap, setMinGap] = useState<number>(0.5); // Minimum Rs gap per litre

  // Calculate pricing gap per station
  const disparities = stations
    .filter((s) => s.sale_qty > 0)
    .map((s) => {
      const nominalRsp = s.new_rate || s.erp_rate || 77.2;
      const effectiveRsp = s.effective_rsp || (s.sale_qty > 0 ? (s.net_total_collection || s.collection) / s.sale_qty : nominalRsp);
      const gapPerLitre = Math.max(0, nominalRsp - effectiveRsp);
      const dailyRevenueLoss = Math.round(gapPerLitre * s.sale_qty);

      return {
        station: s,
        nominalRsp,
        effectiveRsp,
        gapPerLitre: Number(gapPerLitre.toFixed(2)),
        dailyRevenueLoss,
      };
    })
    .filter((d) => d.gapPerLitre >= minGap && d.station.alds_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.dailyRevenueLoss - a.dailyRevenueLoss);

  const totalFlagged = disparities.length;
  const totalDailyLoss = disparities.reduce((sum, d) => sum + d.dailyRevenueLoss, 0);

  const exportCSV = () => {
    const headers = ['Station Code', 'ALDS Name', 'State', 'TM', 'Daily Volume (L)', 'Nominal RSP (Rs)', 'Effective RSP (Rs)', 'Gap (Rs/L)', 'Daily Loss (Rs)'];
    const rows = disparities.map((d) => [
      `"${d.station.erp_code}"`,
      `"${d.station.alds_name.replace(/"/g, '""')}"`,
      `"${d.station.state}"`,
      `"${d.station.tm}"`,
      d.station.sale_qty,
      d.nominalRsp,
      d.effectiveRsp.toFixed(2),
      d.gapPerLitre,
      d.dailyRevenueLoss,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RSP_Disparity_Audit_${telemetry.date}.csv`;
    link.click();
  };

  return (
    <div className="space-y-5">
      {/* Header & Metric Cards */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Automated RSP Pricing Disparity & Collection Gap Audit
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Identifies stations where effective realized rate per litre falls below the ERP state benchmark rate.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Disparity CSV</span>
          </button>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400 block">Flagged Disparity Stations</span>
            <span className="text-xl font-bold font-mono text-amber-800 dark:text-amber-300">{totalFlagged} Stations</span>
          </div>

          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30">
            <span className="text-xs font-medium text-rose-700 dark:text-rose-400 block">Estimated Daily Revenue Loss</span>
            <span className="text-xl font-bold font-mono text-rose-800 dark:text-rose-300">{fmtCurrency(totalDailyLoss)}</span>
          </div>

          <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30">
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-400 block">Network Nominal Avg RSP</span>
            <span className="text-xl font-bold font-mono text-indigo-800 dark:text-indigo-300">₹{telemetry.average_rsp.toFixed(2)} / L</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
        <div className="relative min-w-55">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search station name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Min Gap Cutoff:</span>
          {[0.5, 1.0, 2.0].map((gap) => (
            <button
              key={gap}
              onClick={() => setMinGap(gap)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                minGap === gap
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              ≥ ₹{gap}/L
            </button>
          ))}
        </div>
      </div>

      {/* Disparity Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Station Code & Name</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>State & TM</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Volume Sold</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>ERP RSP Rate</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Realized Effective RSP</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Price Gap / Litre</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Daily Revenue Deficit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-slate-800 dark:text-slate-200">
              {disparities.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400 font-sans">
                    No stations exceeding the ₹{minGap}/L price disparity threshold.
                  </td>
                </tr>
              ) : (
                disparities.map((d) => (
                  <tr key={d.station.erp_code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="font-bold text-slate-900 dark:text-white font-sans">{d.station.erp_code}</div>
                      <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400 truncate max-w-50">
                        {d.station.alds_name}
                      </div>
                    </td>

                    <td className={`px-4 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="font-medium">{d.station.state}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{d.station.tm}</div>
                    </td>

                    <td className={`px-4 text-right font-bold text-slate-900 dark:text-white ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {fmtQty(d.station.sale_qty)} L
                    </td>

                    <td className={`px-4 text-right text-slate-600 dark:text-slate-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      ₹{d.nominalRsp.toFixed(2)}
                    </td>

                    <td className={`px-4 text-right font-bold text-indigo-600 dark:text-indigo-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      ₹{d.effectiveRsp.toFixed(2)}
                    </td>

                    <td className={`px-4 text-right font-bold text-amber-600 dark:text-amber-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      -₹{d.gapPerLitre.toFixed(2)} / L
                    </td>

                    <td className={`px-4 text-right font-bold text-rose-600 dark:text-rose-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      -{fmtCurrency(d.dailyRevenueLoss)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
