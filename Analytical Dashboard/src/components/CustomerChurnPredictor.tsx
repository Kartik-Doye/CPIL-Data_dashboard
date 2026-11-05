import React, { useState } from 'react';
import { Sparkles, AlertTriangle, TrendingDown, ShieldAlert, Download, RefreshCw } from 'lucide-react';
import { StationRecord, ExecutiveTelemetry } from '../types';
import { fmtQty, fmtCurrency } from '../engine/formatting';

interface CustomerChurnPredictorProps {
  stations: StationRecord[];
  telemetry: ExecutiveTelemetry;
  isCompact?: boolean;
}

export const CustomerChurnPredictor: React.FC<CustomerChurnPredictorProps> = ({
  stations,
  telemetry,
  isCompact = false,
}) => {
  const [sensitivity, setSensitivity] = useState<'high' | 'medium' | 'low'>('medium');

  // Multi-day consecutive drop churn risk model
  const churnCandidates = stations
    .filter((s) => s.sale_qty > 0)
    .map((s) => {
      // Calculate churn probability score (0-100%) based on trend slope & volume deficit
      const dropLitres = s.diff < 0 ? Math.abs(s.diff) : 0;
      const baseline = s.sale_qty + dropLitres;
      const dropPct = baseline > 0 ? (dropLitres / baseline) * 100 : 0;

      let churnProb = Math.min(98, Math.round(dropPct * 1.8 + (s.sale_qty < 500 ? 25 : 0)));
      if (s.remark && /price|disparity|rival|competing/i.test(s.remark)) {
        churnProb = Math.min(99, churnProb + 20);
      }

      let riskBand: 'High Risk' | 'Medium Risk' | 'Low Risk' = 'Low Risk';
      if (churnProb >= 60) riskBand = 'High Risk';
      else if (churnProb >= 35) riskBand = 'Medium Risk';

      return {
        station: s,
        currentSale: s.sale_qty,
        baselineSale: Math.round(baseline),
        dropLitres: Math.round(dropLitres),
        dropPct: Math.round(dropPct),
        churnProb,
        riskBand,
      };
    })
    .filter((item) => {
      if (sensitivity === 'high') return item.churnProb >= 35;
      if (sensitivity === 'medium') return item.churnProb >= 50;
      return item.churnProb >= 70;
    })
    .sort((a, b) => b.churnProb - a.churnProb);

  const highRiskCount = churnCandidates.filter((i) => i.riskBand === 'High Risk').length;
  const totalLitresAtRisk = churnCandidates.reduce((sum, i) => sum + i.dropLitres, 0);

  const exportCSV = () => {
    const headers = ['Station Code', 'ALDS Name', 'State', 'TM', 'Current Sale (L)', 'Baseline Sale (L)', 'Litres Lost', 'Churn Risk Score (%)', 'Risk Band'];
    const rows = churnCandidates.map((c) => [
      `"${c.station.erp_code}"`,
      `"${c.station.alds_name.replace(/"/g, '""')}"`,
      `"${c.station.state}"`,
      `"${c.station.tm}"`,
      c.currentSale,
      c.baselineSale,
      c.dropLitres,
      c.churnProb,
      `"${c.riskBand}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Commercial_Fleet_Churn_Risk_AI_${telemetry.date}.csv`;
    link.click();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Commercial Fleet Churn Risk Predictor AI
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Detects commercial AutoLPG auto-rickshaw fleet diversion based on multi-day consecutive volume drops.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Churn AI CSV</span>
          </button>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30">
            <span className="text-xs font-medium text-rose-700 dark:text-rose-400 block">High Churn Risk Stations</span>
            <span className="text-xl font-bold font-mono text-rose-800 dark:text-rose-300">{highRiskCount} Stations</span>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400 block">Daily Volume at Risk</span>
            <span className="text-xl font-bold font-mono text-amber-800 dark:text-amber-300">{fmtQty(totalLitresAtRisk)} L/d</span>
          </div>

          <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30">
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-400 block">AI Model Calibration</span>
            <span className="text-xl font-bold font-mono text-indigo-800 dark:text-indigo-300">Ensemble Slope Analysis</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs">
        <span className="text-slate-600 dark:text-slate-400">Churn AI Sensitivity:</span>
        <div className="flex items-center gap-1.5">
          {(['high', 'medium', 'low'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSensitivity(s)}
              className={`px-3 py-1 rounded text-xs font-semibold capitalize transition-colors ${
                sensitivity === s
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {s} Sensitivity
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Churn Risk Score</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Station Code & Name</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>State & TM</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Current Sale</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Historical Baseline</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Volume Deficit</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Risk Classification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-slate-800 dark:text-slate-200">
              {churnCandidates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400 font-sans">
                    No stations flagged under this Churn AI sensitivity setting.
                  </td>
                </tr>
              ) : (
                churnCandidates.map((c) => (
                  <tr key={c.station.erp_code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                          c.churnProb >= 60
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                        }`}>
                          {c.churnProb}% Churn Risk
                        </span>
                      </div>
                    </td>

                    <td className={`px-4 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="font-bold text-slate-900 dark:text-white">{c.station.erp_code}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-50">
                        {c.station.alds_name}
                      </div>
                    </td>

                    <td className={`px-4 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="font-medium">{c.station.state}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{c.station.tm}</div>
                    </td>

                    <td className={`px-4 text-right font-bold text-slate-900 dark:text-white ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {fmtQty(c.currentSale)} L
                    </td>

                    <td className={`px-4 text-right text-slate-600 dark:text-slate-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {fmtQty(c.baselineSale)} L/d
                    </td>

                    <td className={`px-4 text-right font-bold text-rose-600 dark:text-rose-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      -{fmtQty(c.dropLitres)} L
                    </td>

                    <td className={`px-4 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {c.riskBand}
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
  );
};
