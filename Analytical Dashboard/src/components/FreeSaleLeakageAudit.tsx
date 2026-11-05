import React, { useState } from 'react';
import { Fuel, AlertTriangle, CheckCircle2, ShieldAlert, Download, Filter } from 'lucide-react';
import { StationRecord, ExecutiveTelemetry } from '../types';
import { fmtQty, fmtCurrency, fmtLakhs } from '../engine/formatting';

interface FreeSaleLeakageAuditProps {
  stations: StationRecord[];
  telemetry: ExecutiveTelemetry;
  isCompact?: boolean;
}

export const FreeSaleLeakageAudit: React.FC<FreeSaleLeakageAuditProps> = ({
  stations,
  telemetry,
  isCompact = false,
}) => {
  const [filterThresholdPct, setFilterThresholdPct] = useState<number>(0.5); // 0.5% standard threshold

  const auditRows = stations
    .map((s) => {
      const freeLtrs = s.free_sale_litres || s.free_sale || 0;
      const freeRs = s.free_sale_rupees || freeLtrs * (s.new_rate || 77.2);
      const freePct = s.sale_qty > 0 ? (freeLtrs / s.sale_qty) * 100 : 0;
      const isExcessive = freePct >= filterThresholdPct && freeLtrs > 0;

      return {
        station: s,
        freeLtrs,
        freeRs: Math.round(freeRs),
        freePct: Number(freePct.toFixed(2)),
        isExcessive,
      };
    })
    .filter((r) => r.isExcessive)
    .sort((a, b) => b.freeLtrs - a.freeLtrs);

  const totalExcessive = auditRows.length;
  const totalFreeLtrs = auditRows.reduce((sum, r) => sum + r.freeLtrs, 0);
  const totalFreeValueRs = auditRows.reduce((sum, r) => sum + r.freeRs, 0);

  const exportCSV = () => {
    const headers = ['Station Code', 'ALDS Name', 'State', 'TM', 'Total Sale Qty (L)', 'Free Sale (L)', 'Free Sale Value (Rs)', 'Free Sale %'];
    const rows = auditRows.map((r) => [
      `"${r.station.erp_code}"`,
      `"${r.station.alds_name.replace(/"/g, '""')}"`,
      `"${r.station.state}"`,
      `"${r.station.tm}"`,
      r.station.sale_qty,
      r.freeLtrs,
      r.freeRs,
      r.freePct,
    ]);
    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Free_Sale_Leakage_Audit_${telemetry.date}.csv`;
    link.click();
  };

  return (
    <div className="space-y-5">
      {/* Header & KPI Cards */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                <Fuel className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Free Sale & Calibration Gas Leakage Audit Panel
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Flags stations where testing/calibration gas claims exceed the standard 0.5% volume threshold.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Audit CSV</span>
          </button>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400 block">Flagged Leakage Stations</span>
            <span className="text-xl font-bold font-mono text-amber-800 dark:text-amber-300">{totalExcessive} Stations</span>
          </div>

          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30">
            <span className="text-xs font-medium text-rose-700 dark:text-rose-400 block">Excess Free Sale Volume</span>
            <span className="text-xl font-bold font-mono text-rose-800 dark:text-rose-300">{fmtQty(totalFreeLtrs)} L</span>
          </div>

          <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30">
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-400 block">Total Unbilled Value</span>
            <span className="text-xl font-bold font-mono text-indigo-800 dark:text-indigo-300">{fmtCurrency(totalFreeValueRs)}</span>
          </div>
        </div>
      </div>

      {/* Threshold Selector */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs">
        <span className="text-slate-600 dark:text-slate-400">Leakage Cutoff Threshold:</span>
        <div className="flex items-center gap-1.5">
          {[0.3, 0.5, 1.0].map((pct) => (
            <button
              key={pct}
              onClick={() => setFilterThresholdPct(pct)}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                filterThresholdPct === pct
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              &ge; {pct}% Volume
            </button>
          ))}
        </div>
      </div>

      {/* Audit Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Station Code & Name</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>State & TM</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Total Daily Sale</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Free Sale Volume</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Free Sale Share (%)</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Unbilled Value (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-slate-800 dark:text-slate-200">
              {auditRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400 font-sans">
                    No stations exceeding the {filterThresholdPct}% Free Sale threshold.
                  </td>
                </tr>
              ) : (
                auditRows.map((r) => (
                  <tr key={r.station.erp_code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="font-bold text-slate-900 dark:text-white font-sans">{r.station.erp_code}</div>
                      <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400 truncate max-w-50">
                        {r.station.alds_name}
                      </div>
                    </td>

                    <td className={`px-4 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="font-medium">{r.station.state}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{r.station.tm}</div>
                    </td>

                    <td className={`px-4 text-right font-bold text-slate-900 dark:text-white ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {fmtQty(r.station.sale_qty)} L
                    </td>

                    <td className={`px-4 text-right font-bold text-amber-600 dark:text-amber-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {fmtQty(r.freeLtrs)} L
                    </td>

                    <td className={`px-4 text-right font-bold text-rose-600 dark:text-rose-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {r.freePct}%
                    </td>

                    <td className={`px-4 text-right text-rose-600 dark:text-rose-400 font-bold ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {fmtCurrency(r.freeRs)}
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
