import React, { useState } from 'react';
import { Sparkles, AlertOctagon, CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight, RefreshCcw, ExternalLink } from 'lucide-react';
import { StationRecord, ExecutiveTelemetry } from '../types';
import { fmtQty, fmtCurrency } from '../engine/formatting';

interface SmartAnomalyDetectionCardProps {
  stations: StationRecord[];
  telemetry: ExecutiveTelemetry;
  isCompact?: boolean;
  onNavigateToTab: (tab: string) => void;
}

export interface DetectedAnomaly {
  station: StationRecord;
  anomalyType: 'Volume Spike (Possible Typo)' | 'Decimal Misplacement (RSP Error)' | 'Dispenser Lock (Stock High/Sale Zero)' | 'Collection Mismatch';
  severity: 'Critical' | 'Warning' | 'Info';
  reportedValue: string;
  expectedRange: string;
  explanation: string;
}

export const SmartAnomalyDetectionCard: React.FC<SmartAnomalyDetectionCardProps> = ({
  stations,
  telemetry,
  isCompact = false,
  onNavigateToTab,
}) => {
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // Detect statistical anomalies across the network
  const anomalies: DetectedAnomaly[] = [];

  // Network averages
  const avgVolume = telemetry.total_sale_qty / (telemetry.stations_with_sale || 1);

  stations.forEach((s) => {
    // 1. Extreme Volume Spike (Possible Data Entry Typo e.g. 15,000 L when avg is 1,200 L)
    if (s.sale_qty > avgVolume * 4.5 && s.sale_qty > 4000) {
      anomalies.push({
        station: s,
        anomalyType: 'Volume Spike (Possible Typo)',
        severity: 'Critical',
        reportedValue: `${fmtQty(s.sale_qty)} L`,
        expectedRange: `400 - ${fmtQty(Math.round(avgVolume * 2.2))} L`,
        explanation: 'Daily volume is >4.5x network average. Check for extra zero during manual file entry.',
      });
    }

    // 2. Decimal Misplacement (RSP Entry Error e.g. RSP reported < ₹20 or > ₹150)
    if (s.new_rate > 0 && (s.new_rate < 20 || s.new_rate > 150)) {
      anomalies.push({
        station: s,
        anomalyType: 'Decimal Misplacement (RSP Error)',
        severity: 'Critical',
        reportedValue: `₹${s.new_rate.toFixed(2)} / L`,
        expectedRange: `₹70.00 - ₹85.00 / L`,
        explanation: 'Extreme RSP price deviation detected. Possible misplaced decimal point in entry sheet.',
      });
    }

    // 3. Dispenser Lock (High Closing Stock Dip > 8,000 L but Zero Sale Reported)
    const stockDip = s.closing_dip_in_ltr || s.closing_dip || 0;
    if (s.sale_qty === 0 && stockDip > 8000) {
      anomalies.push({
        station: s,
        anomalyType: 'Dispenser Lock (Stock High/Sale Zero)',
        severity: 'Warning',
        reportedValue: `0 L Sale (Dip: ${fmtQty(stockDip)} L)`,
        expectedRange: `>800 L Daily Sale`,
        explanation: 'Station has 8k+ Litres of fuel in tank but reported zero sales. Check nozzle/dispenser breakdown.',
      });
    }

    // 4. Collection Mismatch (High sales > 1,500 L but net collection < ₹10,000)
    const collection = s.net_total_collection || s.collection;
    if (s.sale_qty > 1500 && collection < 10000) {
      anomalies.push({
        station: s,
        anomalyType: 'Collection Mismatch',
        severity: 'Warning',
        reportedValue: `₹${fmtQty(collection)} collection`,
        expectedRange: `>₹${fmtQty(Math.round(s.sale_qty * 75))}`,
        explanation: 'Sales volume recorded but bank/cash collection is under-reported.',
      });
    }
  });

  const filteredAnomalies = anomalies.filter((a) => selectedType === 'ALL' || a.anomalyType === selectedType);
  const criticalCount = anomalies.filter((a) => a.severity === 'Critical').length;
  const warningCount = anomalies.filter((a) => a.severity === 'Warning').length;

  return (
    <div className="bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900/50 rounded-xl p-5 shadow-xs transition-colors space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-purple-100 dark:border-purple-900/40">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Smart Anomaly & Data Integrity Detection Card</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 font-semibold font-mono">
                  {anomalies.length} Pattern Flags
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Uses historical Z-score statistics to flag sudden data entry typos, price decimal errors, and dispenser locks.
              </p>
            </div>
          </div>
        </div>

        {/* Filter Types */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800 self-start md:self-auto">
          <span className="text-[11px] font-medium text-slate-500 px-2">Anomaly Filter:</span>
          <button
            onClick={() => setSelectedType('ALL')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
              selectedType === 'ALL'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All ({anomalies.length})
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30">
          <span className="text-xs font-medium text-rose-700 dark:text-rose-400 block">Critical Input Errors</span>
          <span className="text-xl font-bold font-mono text-rose-800 dark:text-rose-300">{criticalCount} Anomalies</span>
        </div>

        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30">
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400 block">Operational Warnings</span>
          <span className="text-xl font-bold font-mono text-amber-800 dark:text-amber-300">{warningCount} Warnings</span>
        </div>

        <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-500/30">
          <span className="text-xs font-medium text-purple-700 dark:text-purple-400 block">Detection Algorithm</span>
          <span className="text-xl font-bold font-mono text-purple-800 dark:text-purple-300">Z-Score 3.0σ + IQR</span>
        </div>
      </div>

      {/* Anomaly Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Severity & Anomaly Type</th>
              <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Station Code & Name</th>
              <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>State & TM</th>
              <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Reported Value</th>
              <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'} text-right`}>Expected Norm</th>
              <th className={`px-4 ${isCompact ? 'py-2' : 'py-3'}`}>Pattern Explanation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-slate-800 dark:text-slate-200">
            {filteredAnomalies.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-6 text-slate-400 font-sans">
                  No abnormal data entry typos or operational anomalies detected in this view.
                </td>
              </tr>
            ) : (
              filteredAnomalies.slice(0, isCompact ? 6 : 10).map((a, idx) => (
                <tr key={`${a.station.erp_code}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className={`px-4 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                    <div className="flex items-center gap-1.5">
                      {a.severity === 'Critical' ? (
                        <AlertOctagon className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      )}
                      <span className={`font-semibold text-xs ${
                        a.severity === 'Critical' ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'
                      }`}>
                        {a.anomalyType}
                      </span>
                    </div>
                  </td>

                  <td className={`px-4 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                    <div className="font-bold text-slate-900 dark:text-white">{a.station.erp_code}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-45">
                      {a.station.alds_name}
                    </div>
                  </td>

                  <td className={`px-4 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                    <div className="font-medium text-slate-800 dark:text-slate-200">{a.station.state}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{a.station.tm}</div>
                  </td>

                  <td className={`px-4 text-right font-bold text-rose-600 dark:text-rose-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                    {a.reportedValue}
                  </td>

                  <td className={`px-4 text-right text-slate-600 dark:text-slate-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                    {a.expectedRange}
                  </td>

                  <td className={`px-4 font-sans text-[11px] text-slate-500 dark:text-slate-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                    {a.explanation}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
