import React, { useState } from 'react';
import { DollarSign, Download, Search, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';
import { StationRecord, ExecutiveTelemetry } from '../types';
import { escapeCsvCell } from '../engine/formatting';

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
  const [minGap, setMinGap] = useState<number>(0.01);
  const [auditFilter, setAuditFilter] = useState<'all' | 'unauthorized_scheme' | 'cash_shortfall'>('all');

  const exact = (value: number) =>
    value.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const allDisparities = stations
    .filter((s) => s.sale_qty > 0 && (s.new_rate > 0 || s.erp_rate > 0))
    .map((s) => {
      const nominalRsp = s.new_rate || s.erp_rate;
      const collected = s.net_total_collection || s.collection;
      const effectiveRsp = collected / s.sale_qty;
      const rawGapPerLitre = Math.max(0, nominalRsp - effectiveRsp);
      const gapPerLitre = Number(rawGapPerLitre.toFixed(2));
      const dailyRevenueLoss = Number((rawGapPerLitre * s.sale_qty).toFixed(2));

      const claimedScheme = Number((s.scheme || 0).toFixed(2));
      const approvedHoScheme = Number((s.scheme_as_per_ho || 0).toFixed(2));
      const unauthorizedSchemeRs = Number(Math.max(0, claimedScheme - approvedHoScheme).toFixed(2));
      const unapprovedRspLeakageRs = Number(Math.max(0, dailyRevenueLoss - approvedHoScheme).toFixed(2));
      const rawCheck = Number(s.collection_check || 0);
      // Negative collection_check or positive shortfall check indicates collection mismatch
      const collectionShortfallRs = Number(Math.abs(rawCheck) >= 1 ? rawCheck : 0);

      return {
        station: s,
        nominalRsp,
        effectiveRsp,
        gapPerLitre,
        dailyRevenueLoss,
        claimedScheme,
        approvedHoScheme,
        unauthorizedSchemeRs,
        unapprovedRspLeakageRs,
        collectionShortfallRs,
      };
    })
    .filter((d) => d.gapPerLitre > 0 || d.unauthorizedSchemeRs > 0 || Math.abs(d.collectionShortfallRs) >= 10)
    .sort((a, b) => b.unapprovedRspLeakageRs - a.unapprovedRspLeakageRs || b.dailyRevenueLoss - a.dailyRevenueLoss);

  const disparities = allDisparities.filter((d) => {
    if (auditFilter === 'unauthorized_scheme' && d.unauthorizedSchemeRs <= 0 && d.unapprovedRspLeakageRs < 100) {
      return false;
    }
    if (auditFilter === 'cash_shortfall' && Math.abs(d.collectionShortfallRs) < 10) {
      return false;
    }
    if (auditFilter === 'all' && d.gapPerLitre < minGap && d.unauthorizedSchemeRs <= 0 && Math.abs(d.collectionShortfallRs) < 10) {
      return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      d.station.alds_name.toLowerCase().includes(q) ||
      d.station.erp_code.toLowerCase().includes(q) ||
      d.station.state.toLowerCase().includes(q) ||
      d.station.tm.toLowerCase().includes(q)
    );
  });

  const totalFlagged = disparities.length;
  const totalDailyLoss = disparities.reduce((sum, d) => sum + d.dailyRevenueLoss, 0);
  const totalApprovedHoScheme = disparities.reduce((sum, d) => sum + d.approvedHoScheme, 0);
  const totalUnapprovedLeakage = disparities.reduce((sum, d) => sum + d.unapprovedRspLeakageRs, 0);
  const totalCollectionMismatch = disparities.reduce((sum, d) => sum + Math.abs(d.collectionShortfallRs), 0);

  const pricedStations = stations.filter((s) => s.sale_qty > 0 && (s.new_rate > 0 || s.erp_rate > 0));
  const pricedVolume = pricedStations.reduce((sum, s) => sum + s.sale_qty, 0);
  const filteredNominalAvgRsp =
    pricedVolume > 0
      ? pricedStations.reduce((sum, s) => sum + (s.new_rate || s.erp_rate) * s.sale_qty, 0) / pricedVolume
      : telemetry.average_rsp;

  const exportCSV = () => {
    const headers = [
      'Station Code',
      'ALDS Name',
      'State',
      'TM',
      'Daily Volume (L)',
      'Nominal RSP (Rs)',
      'Effective RSP (Rs)',
      'Gap (Rs/L)',
      'Gross RSP Gap (Rs)',
      'Claimed Scheme (Rs)',
      'HO Approved Scheme (Rs)',
      'Unauthorized Scheme Excess (Rs)',
      'Net Unapproved Leakage (Rs)',
      'Collection Check Variance (Rs)',
    ];
    const rows = disparities.map((d) => [
      escapeCsvCell(d.station.erp_code),
      escapeCsvCell(d.station.alds_name),
      escapeCsvCell(d.station.state),
      escapeCsvCell(d.station.tm),
      d.station.sale_qty,
      d.nominalRsp,
      d.effectiveRsp.toFixed(2),
      d.gapPerLitre,
      d.dailyRevenueLoss,
      d.claimedScheme,
      d.approvedHoScheme,
      d.unauthorizedSchemeRs,
      d.unapprovedRspLeakageRs,
      d.collectionShortfallRs,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RSP_Scheme_Shortfall_Audit_${telemetry.date}.csv`;
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
                  RSP Disparity, Unauthorized Scheme &amp; Cash-Shortfall Audit
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Separates HO-approved commercial schemes from unauthorized station discounting and collection-check variances (Weighted Nominal RSP: ₹{filteredNominalAvgRsp.toFixed(2)}/L).
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Full Audit CSV</span>
          </button>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400 block">Gross RSP Revenue Gap ({totalFlagged} stns)</span>
            <span className="text-xl font-bold font-mono text-amber-800 dark:text-amber-300">₹{exact(totalDailyLoss)}</span>
          </div>

          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30">
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Approved HO Scheme
            </span>
            <span className="text-xl font-bold font-mono text-emerald-800 dark:text-emerald-300">₹{exact(totalApprovedHoScheme)}</span>
          </div>

          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30">
            <span className="text-xs font-medium text-rose-700 dark:text-rose-400 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Unapproved Discount / Leakage
            </span>
            <span className="text-xl font-bold font-mono text-rose-800 dark:text-rose-300">₹{exact(totalUnapprovedLeakage)}</span>
          </div>

          <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30">
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Collection Check Mismatch
            </span>
            <span className="text-xl font-bold font-mono text-indigo-800 dark:text-indigo-300">₹{exact(totalCollectionMismatch)}</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search station, code, state, TM..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            {[
              { id: 'all', label: 'All RSP Gaps' },
              { id: 'unauthorized_scheme', label: 'Unapproved Discounting' },
              { id: 'cash_shortfall', label: 'Collection Check Variance' },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setAuditFilter(mode.id as any)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  auditFilter === mode.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Min Gap Cutoff:</span>
          {[0.01, 0.5, 1.0, 2.0].map((gap) => (
            <button
              key={gap}
              type="button"
              onClick={() => setMinGap(gap)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                minGap === gap
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              ≥ ₹{gap.toFixed(2)}/L
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
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Station Code &amp; Name</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>State &amp; TM</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Volume Sold</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>ERP vs Realized RSP</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Claimed vs HO Scheme</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Unapproved Leakage</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Collection Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-slate-800 dark:text-slate-200">
              {disparities.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400 font-sans">
                    {allDisparities.length === 0
                      ? 'No positive collection gap or scheme discrepancy found against an available ERP RSP reference.'
                      : `No stations match the active filter and ₹${minGap.toFixed(2)}/L threshold.`}
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
                      {exact(d.station.sale_qty)} L
                    </td>

                    <td className={`px-4 text-right ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="text-slate-600 dark:text-slate-400">
                        ₹{d.nominalRsp.toFixed(2)} → <span className="font-bold text-indigo-600 dark:text-indigo-400">₹{d.effectiveRsp.toFixed(2)}</span>
                      </div>
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                        -₹{d.gapPerLitre.toFixed(2)}/L (₹{exact(d.dailyRevenueLoss)})
                      </div>
                    </td>

                    <td className={`px-4 text-right ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div>₹{exact(d.claimedScheme)} / ₹{exact(d.approvedHoScheme)}</div>
                      {d.unauthorizedSchemeRs > 0 && (
                        <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                          +₹{exact(d.unauthorizedSchemeRs)} Excess
                        </div>
                      )}
                    </td>

                    <td className={`px-4 text-right font-bold ${d.unapprovedRspLeakageRs > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'} ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {d.unapprovedRspLeakageRs > 0 ? `-₹${exact(d.unapprovedRspLeakageRs)}` : '₹0.00'}
                    </td>

                    <td className={`px-4 text-right font-bold ${Math.abs(d.collectionShortfallRs) >= 10 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {Math.abs(d.collectionShortfallRs) >= 1
                        ? `${d.collectionShortfallRs > 0 ? '+' : ''}₹${exact(d.collectionShortfallRs)}`
                        : 'Matched'}
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
