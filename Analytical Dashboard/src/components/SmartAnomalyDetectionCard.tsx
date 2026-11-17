import React, { useState } from 'react';
import { Sparkles, AlertOctagon, AlertTriangle } from 'lucide-react';
import { StationRecord, ExecutiveTelemetry } from '../types';
import { fmtQty } from '../engine/formatting';
import productConfig from '../../../product-config.json';

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

  // Detect statistical anomalies across the network using configured thresholds & dynamic norms
  const anomalies: DetectedAnomaly[] = [];
  const rules = productConfig.analytics.anomalyThresholds;

  const activeStations = stations.filter((s) => s.sale_qty > 0);
  const avgVolume = activeStations.length > 0
    ? activeStations.reduce((sum, s) => sum + s.sale_qty, 0) / activeStations.length
    : telemetry.total_sale_qty / (telemetry.stations_with_sale || 1);

  const validRates = stations
    .map((s) => s.new_rate || s.erp_rate)
    .filter((r) => r >= rules.minValidRsp && r <= rules.maxValidRsp);
  const minNormalRsp = validRates.length > 0 ? Math.min(...validRates) : productConfig.analytics.fallbackRetailPricePerLitre;
  const maxNormalRsp = validRates.length > 0 ? Math.max(...validRates) : productConfig.analytics.fallbackRetailPricePerLitre;

  stations.forEach((s) => {
    // 1. Extreme Volume Spike (Possible Data Entry Typo)
    if (s.sale_qty > avgVolume * rules.volumeSpikeMultiplier && s.sale_qty > rules.volumeSpikeMinLitres) {
      anomalies.push({
        station: s,
        anomalyType: 'Volume Spike (Possible Typo)',
        severity: 'Critical',
        reportedValue: `${fmtQty(s.sale_qty)} L`,
        expectedRange: `${fmtQty(Math.round(avgVolume * 0.4))} - ${fmtQty(Math.round(avgVolume * 2.2))} L`,
        explanation: `Daily volume is >${rules.volumeSpikeMultiplier}x network average. Check for extra zero during manual file entry.`,
      });
    }

    // 2. Decimal Misplacement (RSP Entry Error)
    const reportedRsp = s.new_rate || s.erp_rate;
    if (reportedRsp > 0 && (reportedRsp < rules.minValidRsp || reportedRsp > rules.maxValidRsp)) {
      anomalies.push({
        station: s,
        anomalyType: 'Decimal Misplacement (RSP Error)',
        severity: 'Critical',
        reportedValue: `₹${reportedRsp.toFixed(2)} / L`,
        expectedRange: `₹${minNormalRsp.toFixed(2)} - ₹${maxNormalRsp.toFixed(2)} / L`,
        explanation: 'Extreme RSP price deviation detected. Possible misplaced decimal point in entry sheet.',
      });
    }

    // 3. Dispenser Lock (High Closing Stock Dip but Zero Sale Reported)
    const stockDip = s.closing_dip_in_ltr || s.closing_dip || 0;
    const expectedBurn = Math.round(s.rolling_7d_burn || avgVolume);
    if (s.sale_qty === 0 && stockDip > rules.dispenserLockDipLitres) {
      anomalies.push({
        station: s,
        anomalyType: 'Dispenser Lock (Stock High/Sale Zero)',
        severity: 'Warning',
        reportedValue: `0 L Sale (Dip: ${fmtQty(stockDip)} L)`,
        expectedRange: `~${fmtQty(expectedBurn)} L/d Burn`,
        explanation: `Station has ${fmtQty(stockDip)} L of fuel in tank but reported zero sales. Check nozzle/dispenser breakdown.`,
      });
    }

    // 4. Collection Mismatch
    const collection = s.net_total_collection || s.collection;
    const referenceRate = s.new_rate || s.erp_rate || productConfig.analytics.fallbackRetailPricePerLitre;
    if (s.sale_qty > rules.collectionMismatchMinSaleLitres && collection < rules.collectionMismatchMinCollectionRs) {
      anomalies.push({
        station: s,
        anomalyType: 'Collection Mismatch',
        severity: 'Warning',
        reportedValue: `₹${fmtQty(collection)} collection`,
        expectedRange: `>₹${fmtQty(Math.round(s.sale_qty * referenceRate))}`,
        explanation: 'Sales volume recorded but bank/cash collection is under-reported.',
      });
    }
  });

  const anomalyTypes = [...new Set(anomalies.map((a) => a.anomalyType))];
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
                Rule-based screening of today's station data. A flag is a prompt to investigate, not proof of an error.
              </p>
            </div>
          </div>
        </div>

        {/* Filter Types */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800 self-start md:self-auto">
          <span className="text-[11px] font-medium text-slate-500 px-2">Anomaly Filter:</span>
          <button
            onClick={() => setSelectedType('ALL')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${selectedType === 'ALL'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            All ({anomalies.length})
          </button>
          {anomalyTypes.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${selectedType === t
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              {t.split(' (')[0]} ({anomalies.filter((a) => a.anomalyType === t).length})
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30">
          <span className="text-xs font-medium text-rose-700 dark:text-rose-400 block">Critical Flags to Verify</span>
          <span className="text-xl font-bold font-mono text-rose-800 dark:text-rose-300">{criticalCount} Anomalies</span>
        </div>

        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30">
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400 block">Operational Warnings</span>
          <span className="text-xl font-bold font-mono text-amber-800 dark:text-amber-300">{warningCount} Warnings</span>
        </div>

        <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-500/30">
          <span className="text-xs font-medium text-purple-700 dark:text-purple-400 block">Detection Algorithm</span>
          <span className="text-xl font-bold font-mono text-purple-800 dark:text-purple-300">4 Rule Checks</span>
        </div>
      </div>

      <div className="rounded-lg border border-purple-100 dark:border-purple-900/40 bg-purple-50/60 dark:bg-purple-950/20 p-3 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
        <p><strong>How to read the flags:</strong> volume above 4.5× the network average and 4,000 L is checked for a possible extra zero; RSP below ₹20 or above ₹150 is checked for a decimal/input error; zero sales with stock dip above 8,000 L may indicate a dispenser or reporting issue; sales above 1,500 L with collection below ₹10,000 is a collection mismatch warning.</p>
        <p>These are fixed rule thresholds, not historical Z-score/IQR analysis. Verify source records before taking action.</p>
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
                  No records currently meet these rule thresholds.
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
                      <span className={`font-semibold text-xs ${a.severity === 'Critical' ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'
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
