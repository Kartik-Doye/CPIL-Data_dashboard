import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, Clock, Truck, ArrowRight, ExternalLink, Flame } from 'lucide-react';
import { StationRecord, ExecutiveTelemetry } from '../types';
import { fmtQty } from '../engine/formatting';
import { recommendTanker } from '../engine/tanker';

interface CriticalBurnPredictionAlertProps {
  stations: StationRecord[];
  telemetry: ExecutiveTelemetry;
  isCompact?: boolean;
  onNavigateToTab: (tab: string) => void;
}

export const CriticalBurnPredictionAlert: React.FC<CriticalBurnPredictionAlertProps> = ({
  stations,
  telemetry,
  isCompact = false,
  onNavigateToTab,
}) => {
  const [filterMode, setFilterMode] = useState<'48h' | '24h' | 'all'>('48h');

  // Calculate projected hours remaining based on 3-day daily burn rate vs closing tank dip
  const avgSale = telemetry.total_sale_qty / (telemetry.stations_with_sale || 1);
  const criticalStations = stations
    .filter((s) => s.sale_qty > 0) // Active stations
    .map((s) => {
      const dailyBurn = s.sale_qty > 0 ? s.sale_qty : avgSale;
      const closingDip = s.closing_dip_in_ltr || s.closing_dip || 0;
      const hoursLeft = Number(((closingDip / dailyBurn) * 24).toFixed(1));

      const { requiredVolumeLtr, tankerLabel: recommendedTanker } = recommendTanker(dailyBurn, closingDip);

      let riskSeverity: 'Critical (<24h)' | 'Urgent (<48h)' | 'Moderate (<72h)' = 'Moderate (<72h)';
      if (hoursLeft <= 24) {
        riskSeverity = 'Critical (<24h)';
      } else if (hoursLeft <= 48) {
        riskSeverity = 'Urgent (<48h)';
      }

      return {
        station: s,
        closingDip,
        dailyBurn,
        hoursLeft,
        recommendedTanker,
        requiredVolumeLtr,
        riskSeverity,
      };
    })
    .filter((item) => {
      if (filterMode === '24h') return item.hoursLeft <= 24;
      if (filterMode === '48h') return item.hoursLeft <= 48;
      return item.hoursLeft <= 72;
    })
    .sort((a, b) => a.hoursLeft - b.hoursLeft);

  const count24h = criticalStations.filter((i) => i.hoursLeft <= 24).length;
  const count48h = criticalStations.filter((i) => i.hoursLeft <= 48).length;
  const totalVolumeNeeded = criticalStations.reduce((acc, curr) => acc + curr.requiredVolumeLtr, 0);
  const exactLitres = (value: number) => value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 rounded-xl p-5 shadow-xs transition-colors space-y-4">
      {/* Panel Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-rose-100 dark:border-rose-900/40">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Proactive 48-Hour Low Inventory Burn Alert System</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 font-semibold font-mono">
                  {count48h} Stations at Risk
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-rose-500" />
                <span>Uses current daily sales and closing dip; tanker sizes are 7.5, 10, or 20 KL. Confirm tank ullage before dispatch.</span>
              </p>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800 self-start md:self-auto">
          <span className="text-[11px] font-medium text-slate-500 px-2">Burn Horizon:</span>
          {(['24h', '48h', 'all'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setFilterMode(m)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                filterMode === m
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {m === '24h' ? '<24 Hours' : m === '48h' ? '<48 Hours' : '<72 Hours'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30">
          <span className="text-xs font-medium text-rose-700 dark:text-rose-400 block">Critical Risk (&lt;24h Burn Out)</span>
          <span className="text-xl font-bold font-mono text-rose-800 dark:text-rose-300">{count24h} Stations</span>
        </div>

        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30">
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400 block">Urgent Risk (&lt;48h Burn Out)</span>
          <span className="text-xl font-bold font-mono text-amber-800 dark:text-amber-300">{count48h} Stations</span>
        </div>

        <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-400 block">Total Fuel Volume Required</span>
            <span className="text-xl font-bold font-mono text-indigo-800 dark:text-indigo-300">{exactLitres(totalVolumeNeeded)} L</span>
          </div>
          <button
            onClick={() => onNavigateToTab('dispatch')}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Dispatch</span>
          </button>
        </div>
      </div>

      {/* Burn Prediction Data Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 uppercase text-[10px] font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className={`px-3 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>Hours Left</th>
              <th className={`px-3 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>Station & Code</th>
              <th className={`px-3 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>State & TM</th>
              <th className={`px-3 ${isCompact ? 'py-1.5' : 'py-2.5'} text-right`}>Closing Dip</th>
              <th className={`px-3 ${isCompact ? 'py-1.5' : 'py-2.5'} text-right`}>Daily Burn Rate</th>
              <th className={`px-3 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>Recommended Tanker</th>
              <th className={`px-3 ${isCompact ? 'py-1.5' : 'py-2.5'} text-right`}>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-slate-800 dark:text-slate-200">
            {criticalStations.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-6 text-slate-400 font-sans">
                  No stations projected to hit zero inventory within the selected time window.
                </td>
              </tr>
            ) : (
              criticalStations.slice(0, isCompact ? 6 : 10).map((item) => (
                <tr key={item.station.erp_code} className="hover:bg-rose-50/40 dark:hover:bg-slate-800/50 transition-colors">
                  <td className={`px-3 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-bold text-xs ${
                        item.hoursLeft <= 24
                          ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40'
                          : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0 animate-pulse" />
                      {item.hoursLeft}h Left
                    </span>
                  </td>

                  <td className={`px-3 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                    <div className="font-bold text-slate-900 dark:text-white">{item.station.erp_code}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-45">
                      {item.station.alds_name}
                    </div>
                  </td>

                  <td className={`px-3 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                    <div className="font-medium text-slate-800 dark:text-slate-200">{item.station.state}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{item.station.tm}</div>
                  </td>

                  <td className={`px-3 text-right font-bold text-slate-900 dark:text-white ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                    {fmtQty(item.closingDip)} L
                  </td>

                  <td className={`px-3 text-right text-slate-600 dark:text-slate-400 ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                    {fmtQty(item.dailyBurn)} L/d
                  </td>

                  <td className={`px-3 font-sans ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20">
                      <Truck className="w-3 h-3 shrink-0" />
                      {item.recommendedTanker}
                    </span>
                    <div className="text-[10px] text-slate-500 mt-1 text-right">
                      Refill estimate: {exactLitres(item.requiredVolumeLtr)} L
                    </div>
                  </td>

                  <td className={`px-3 text-right ${isCompact ? 'py-1.5' : 'py-2.5'}`}>
                    <button
                      onClick={() => onNavigateToTab('dispatch')}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      <span>Dispatch</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
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
