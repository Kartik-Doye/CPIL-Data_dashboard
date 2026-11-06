import React, { useState } from 'react';
import {
  Truck,
  AlertTriangle,
  CheckCircle,
  Copy,
  Download,
  Calendar,
  Fuel,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { StationRecord, ExecutiveTelemetry } from '../types';
import { fmtQty } from '../engine/formatting';
import { recommendTanker } from '../engine/tanker';

interface TankerDispatchReportProps {
  stations: StationRecord[];
  telemetry: ExecutiveTelemetry;
  isCompact?: boolean;
}

export const TankerDispatchReport: React.FC<TankerDispatchReportProps> = ({
  stations,
  telemetry,
  isCompact = false,
}) => {
  const [selectedUrgency, setSelectedUrgency] = useState<'all' | 'critical' | 'warning'>('all');
  const [copied, setCopied] = useState(false);
  const exactLitres = (value: number) => value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const activeDailyBurn = stations.filter((s) => s.sale_qty > 0);
  const networkDailyBurn = activeDailyBurn.length
    ? activeDailyBurn.reduce((sum, s) => sum + s.sale_qty, 0) / activeDailyBurn.length
    : 0;

  const dispatchCandidates = stations
    .filter((s) => {
      const isUrgentDip = s.days_left <= 3.5;
      const isOutageRemark = Boolean(s.remark && /stock|licence|breakdown|dry/i.test(s.remark));
      return isUrgentDip || isOutageRemark || s.sale_qty === 0;
    })
    .map((s) => {
      // 3-day forecasted burn
      const historicalRows = (telemetry.station_monthly_sales || []).filter((row) => row.erp_code === s.erp_code);
      const historyDays = historicalRows.reduce((sum, row) => sum + row.reporting_days, 0);
      const historicalDailyBurn = historyDays > 0
        ? historicalRows.reduce((sum, row) => sum + row.sale_qty, 0) / historyDays
        : 0;
      const dailyBurn = s.sale_qty > 0 ? s.sale_qty : historicalDailyBurn || networkDailyBurn;
      const burn3Day = dailyBurn * 3;
      const currentStock = s.closing_dip_in_ltr || s.closing_dip || 0;
      const { requiredVolumeLtr, tankerLabel: recommendedTanker } = recommendTanker(dailyBurn, currentStock);

      let urgency: 'Critical' | 'Warning' | 'Standby' = 'Warning';
      if (s.days_left < 1.5 || s.sale_qty === 0 || /stock/i.test(s.remark || '')) {
        urgency = 'Critical';
      } else if (s.days_left <= 3.0) {
        urgency = 'Warning';
      } else {
        urgency = 'Standby';
      }

      return {
        station: s,
        dailyBurn,
        burn3Day,
        currentStock,
        recommendedTanker,
        recommendedVolumeLtr: requiredVolumeLtr,
        urgency,
      };
    })
    .sort((a, b) => a.station.days_left - b.station.days_left);

  const filteredDispatches = dispatchCandidates.filter((d) => {
    if (selectedUrgency === 'critical') return d.urgency === 'Critical';
    if (selectedUrgency === 'warning') return d.urgency === 'Warning';
    return true;
  });

  const criticalCount = dispatchCandidates.filter((d) => d.urgency === 'Critical').length;
  const warningCount = dispatchCandidates.filter((d) => d.urgency === 'Warning').length;
  const totalReplenishmentLtr = dispatchCandidates.reduce((sum, d) => sum + d.recommendedVolumeLtr, 0);

  const handleCopyWhatsApp = () => {
    const lines = [
      `🚨 *GO GAS AUTO-LPG TANKER DISPATCH SCHEDULE* 🚨`,
      `*Date:* ${telemetry.date} | *Total Orders:* ${dispatchCandidates.length}`,
      `*Estimated Refill Volume:* ${exactLitres(totalReplenishmentLtr)} L`,
      `------------------------------------------`,
    ];

    dispatchCandidates.slice(0, 15).forEach((d, idx) => {
      lines.push(
        `*${idx + 1}. ${d.station.erp_code} - ${d.station.alds_name}* (${d.station.state})`
      );
      lines.push(
        `   • Stock Dip: ${exactLitres(d.currentStock)} L (${exactLitres(d.station.days_left)} days left)`
      );
      lines.push(
        `   • Recommended Dispatch: *${d.recommendedTanker}*`
      );
      if (d.station.remark) lines.push(`   • Remark: _${d.station.remark}_`);
      lines.push('');
    });

    if (dispatchCandidates.length > 15) {
      lines.push(`...and ${dispatchCandidates.length - 15} more stations.`);
    }

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleExportCSV = () => {
    const headers = [
      'ERP Code',
      'ALDS Name',
      'State',
      'TM',
      'Coordinator',
      'Urgency',
      'Current Closing Dip (L)',
      'Daily Burn Rate (L)',
      '3-Day Burn (L)',
      'Days Fuel Left',
      'Recommended Tanker',
      'Estimated Refill Litres',
      'Remark',
    ];

    const rows = dispatchCandidates.map((d) => [
      `"${d.station.erp_code}"`,
      `"${d.station.alds_name.replace(/"/g, '""')}"`,
      `"${d.station.state}"`,
      `"${d.station.tm}"`,
      `"${d.station.coordinator}"`,
      `"${d.urgency}"`,
      d.currentStock,
      d.dailyBurn,
      d.burn3Day,
      d.station.days_left,
      `"${d.recommendedTanker}"`,
      d.recommendedVolumeLtr,
      `"${(d.station.remark || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `GO_Gas_Tanker_Dispatch_Manifest_${telemetry.date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5">
      {/* Header & Metric Strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Report 32: Tanker Replenishment Dispatch Generator
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Estimates litres needed to reach three days of cover, then selects the smallest available 7.5 KL, 10 KL, or 20 KL company tanker. Confirm tank ullage before dispatch.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleCopyWhatsApp}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'Copied Manifest!' : '1-Click WhatsApp Manifest'}
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 border border-slate-700 transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              Export Dispatch CSV
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
            <span className="text-xs font-medium text-red-600 dark:text-red-400 block">
              Critical Urgency (&lt;1.5 Days)
            </span>
            <span className="text-xl font-bold font-mono text-red-700 dark:text-red-300">
              {criticalCount} Stations
            </span>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 block">
              Warning (&lt;3.0 Days)
            </span>
            <span className="text-xl font-bold font-mono text-amber-700 dark:text-amber-300">
              {warningCount} Stations
            </span>
          </div>

          <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20">
            <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 block">
              Total Tanker Dispatch Orders
            </span>
            <span className="text-xl font-bold font-mono text-indigo-700 dark:text-indigo-300">
              {dispatchCandidates.length} Tankers
            </span>
          </div>

          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 block">
              Total Fuel Volume Required
            </span>
            <span className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300">
              {exactLitres(totalReplenishmentLtr)} L
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedUrgency('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              selectedUrgency === 'all'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Dispatch Orders ({dispatchCandidates.length})
          </button>
          <button
            onClick={() => setSelectedUrgency('critical')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              selectedUrgency === 'critical'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-red-600'
            }`}
          >
            Critical Only ({criticalCount})
          </button>
          <button
            onClick={() => setSelectedUrgency('warning')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              selectedUrgency === 'warning'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-amber-600'
            }`}
          >
            Warning Only ({warningCount})
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-semibold uppercase tracking-wider">
              <tr>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Urgency</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Station Code & Name</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>State & TM</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Closing Dip</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Daily Burn</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Days Left</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Recommended Tanker</th>
                <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Operational Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200">
              {filteredDispatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    No stations requiring immediate tanker replenishment in this view.
                  </td>
                </tr>
              ) : (
                filteredDispatches.map((d) => (
                  <tr
                    key={d.station.erp_code}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      {d.urgency === 'Critical' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                          Critical
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Warning
                        </span>
                      )}
                    </td>

                    <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {d.station.erp_code}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs">
                        {d.station.alds_name}
                      </div>
                    </td>

                    <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <div className="font-medium">{d.station.state}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{d.station.tm}</div>
                    </td>

                    <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-right font-mono font-semibold`}>
                      {fmtQty(d.currentStock)} L
                    </td>

                    <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-right font-mono`}>
                      {fmtQty(d.dailyBurn)} L/d
                    </td>

                    <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-right font-mono font-bold ${
                      d.station.days_left < 1.5 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      {d.station.days_left} d
                    </td>

                    <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium text-xs bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20">
                        <Truck className="w-3 h-3 shrink-0" />
                        {d.recommendedTanker}
                      </span>
                      <div className="text-[10px] text-slate-500 mt-1">
                        Estimated fill:                         {exactLitres(d.recommendedVolumeLtr)} L
                      </div>
                    </td>

                    <td className={`px-4 ${isCompact ? 'py-1.5' : 'py-2.5'} text-slate-500 dark:text-slate-400 text-[11px]`}>
                      {d.station.remark || (d.station.days_left < 1.5 ? 'Critical buffer threshold reached' : 'Low stock level')}
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
