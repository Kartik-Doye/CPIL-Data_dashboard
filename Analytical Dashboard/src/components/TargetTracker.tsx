import React, { useEffect, useState } from 'react';
import { Target, CheckCircle, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { StationRecord } from '../types';

const DEFAULT_DAILY_BENCHMARK = 1100;
const DAILY_TARGET_STORAGE_KEY = 'go-gas-tm-targets';
const STATION_TARGET_STORAGE_KEY = 'go-gas-station-targets';

interface TargetTrackerProps {
  stations: StationRecord[];
}

export const TargetTracker: React.FC<TargetTrackerProps> = ({ stations }) => {
  const [tmTargets, setTmTargets] = useState<Record<string, number>>({});
  const [targetInputs, setTargetInputs] = useState<Record<string, string>>({});
  const [stationTargetsByCode, setStationTargetsByCode] = useState<Record<string, number>>({});
  const [stationTargetInputs, setStationTargetInputs] = useState<Record<string, string>>({});
  const [targetError, setTargetError] = useState('');
  const tmNames = [...new Set(stations.map((station) => station.tm?.trim() || 'Unassigned'))].sort();

  useEffect(() => {
    try {
      const savedTarget = window.localStorage.getItem(DAILY_TARGET_STORAGE_KEY);
      if (savedTarget === null) return;

      const parsedTargets: unknown = JSON.parse(savedTarget);
      if (typeof parsedTargets !== 'object' || parsedTargets === null || Array.isArray(parsedTargets)) {
        throw new Error('Saved TM targets have an invalid format.');
      }

      const validTargets = Object.fromEntries(
        Object.entries(parsedTargets).filter(
          (entry): entry is [string, number] =>
            typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0,
        ),
      );
      setTmTargets(validTargets);
      setTargetInputs(
        Object.fromEntries(Object.entries(validTargets).map(([tm, value]) => [tm, String(value)])),
      );

      const savedStationTargets = window.localStorage.getItem(STATION_TARGET_STORAGE_KEY);
      if (savedStationTargets !== null) {
        const parsedStationTargets: unknown = JSON.parse(savedStationTargets);
        if (
          typeof parsedStationTargets !== 'object'
          || parsedStationTargets === null
          || Array.isArray(parsedStationTargets)
        ) {
          throw new Error('Saved station targets have an invalid format.');
        }

        const validStationTargets = Object.fromEntries(
          Object.entries(parsedStationTargets).filter(
            (entry): entry is [string, number] =>
              typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0,
          ),
        );
        setStationTargetsByCode(validStationTargets);
        setStationTargetInputs(
          Object.fromEntries(
            Object.entries(validStationTargets).map(([code, value]) => [code, String(value)]),
          ),
        );
      }
    } catch {
      setTargetError('Saved benchmarks could not be loaded from this browser. Defaults are in use.');
    }
  }, []);

  const handleTargetChange = (tm: string, value: string) => {
    setTargetInputs((current) => ({ ...current, [tm]: value }));
    const parsedTarget = Number(value);
    if (!value.trim() || !Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setTargetError('Enter a daily benchmark greater than zero litres for each TM.');
      return;
    }

    const updatedTargets = { ...tmTargets, [tm]: parsedTarget };
    setTmTargets(updatedTargets);
    try {
      window.localStorage.setItem(DAILY_TARGET_STORAGE_KEY, JSON.stringify(updatedTargets));
      setTargetError('');
    } catch {
      setTargetError('The TM benchmark is applied, but could not be saved in this browser.');
    }
  };

  const handleStationTargetChange = (stationCode: string, value: string) => {
    setStationTargetInputs((current) => ({ ...current, [stationCode]: value }));

    if (!value.trim()) {
      const updatedTargets = { ...stationTargetsByCode };
      delete updatedTargets[stationCode];
      setStationTargetsByCode(updatedTargets);
      try {
        window.localStorage.setItem(STATION_TARGET_STORAGE_KEY, JSON.stringify(updatedTargets));
        setTargetError('');
      } catch {
        setTargetError('The station now inherits its TM benchmark, but the change could not be saved in this browser.');
      }
      return;
    }

    const parsedTarget = Number(value);
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setTargetError('Enter a station benchmark greater than zero litres, or clear it to inherit the TM benchmark.');
      return;
    }

    const updatedTargets = { ...stationTargetsByCode, [stationCode]: parsedTarget };
    setStationTargetsByCode(updatedTargets);
    try {
      window.localStorage.setItem(STATION_TARGET_STORAGE_KEY, JSON.stringify(updatedTargets));
      setTargetError('');
    } catch {
      setTargetError('The station benchmark is applied, but the change could not be saved in this browser.');
    }
  };

  const formatTarget = (target: number) => target.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const stationTargets = stations.map((s) => {
    const tm = s.tm?.trim() || 'Unassigned';
    const tmTarget = tmTargets[tm] ?? DEFAULT_DAILY_BENCHMARK;
    const target = stationTargetsByCode[s.erp_code] ?? tmTarget;
    const benchmarkPct = Number(((s.sale_qty / target) * 100).toFixed(1));
    let status: 'Met benchmark' | 'Near benchmark' | 'Below benchmark' | 'Far below benchmark' = 'Met benchmark';

    if (benchmarkPct >= 100) status = 'Met benchmark';
    else if (benchmarkPct >= 90) status = 'Near benchmark';
    else if (benchmarkPct >= 75) status = 'Below benchmark';
    else status = 'Far below benchmark';

    return {
      ...s,
      tmTarget,
      target,
      hasStationTarget: stationTargetsByCode[s.erp_code] !== undefined,
      benchmarkPct,
      status,
    };
  });

  const countMet = stationTargets.filter((s) => s.status === 'Met benchmark').length;
  const countNear = stationTargets.filter((s) => s.status === 'Near benchmark').length;
  const countBelow = stationTargets.filter((s) => s.status === 'Below benchmark').length;
  const countFarBelow = stationTargets.filter((s) => s.status === 'Far below benchmark').length;

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
              Sales Benchmark Tracking
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Compare the latest reported day with a configurable planning benchmark. This is not an approved sales plan or forecast; benchmarks are saved in this browser and are not shared with other users.
              Status bands describe the benchmark comparison only: met ≥100%, near ≥90%, below ≥75%, and far below &lt;75%.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <h3 className="mb-3 text-xs font-semibold text-slate-300">Daily benchmark by TM (L per station; inherited unless overridden)</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tmNames.map((tm, index) => {
              const target = tmTargets[tm] ?? DEFAULT_DAILY_BENCHMARK;
              const inputId = `tm-daily-target-${index}`;
              return (
                <label key={tm} htmlFor={inputId} className="text-xs font-medium text-slate-300">
                  {tm}
                  <input
                    id={inputId}
                    type="number"
                    min="0.01"
                    step="any"
                    value={targetInputs[tm] ?? String(target)}
                    onChange={(event) => handleTargetChange(tm, event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
                    aria-label={`Daily benchmark per station for TM ${tm} in litres`}
                    aria-invalid={Boolean(targetError)}
                    aria-describedby={targetError ? 'tm-target-error' : undefined}
                  />
                </label>
              );
            })}
          </div>
          {targetError && <p id="tm-target-error" className="mt-2 text-xs text-amber-400" role="alert">{targetError}</p>}
          <p className="mt-2 text-xs text-slate-400">
            TM and station benchmarks are saved in this browser. New TMs default to {formatTarget(DEFAULT_DAILY_BENCHMARK)} L per station. Set this to an approved value before using it for planning. Leave a station override blank to use its TM&apos;s benchmark.
          </p>
        </div>
      </div>

      {/* Status Bands Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Achieved */}
        <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-4 shadow-sm bg-linear-to-b from-emerald-950/20 to-transparent">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" />
              <span>Met benchmark (&ge;100%)</span>
            </span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {((countMet / (stations.length || 1)) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">{countMet} Stations</div>
          <p className="text-[11px] text-slate-400 mt-1">Sales met or exceeded the local benchmark</p>
        </div>

        {/* On Track */}
        <div className="bg-slate-900/80 border border-indigo-500/30 rounded-xl p-4 shadow-sm bg-linear-to-b from-indigo-950/20 to-transparent">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>Near benchmark (90 - 99.9%)</span>
            </span>
            <span className="text-xs font-mono font-bold text-indigo-400">
              {((countNear / (stations.length || 1)) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">{countNear} Stations</div>
          <p className="text-[11px] text-slate-400 mt-1">Sales are within 10% of the local benchmark</p>
        </div>

        {/* At Risk */}
        <div className="bg-slate-900/80 border border-amber-500/30 rounded-xl p-4 shadow-sm bg-linear-to-b from-amber-950/20 to-transparent">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>Below benchmark (75 - 89.9%)</span>
            </span>
            <span className="text-xs font-mono font-bold text-amber-400">
              {((countBelow / (stations.length || 1)) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">{countBelow} Stations</div>
          <p className="text-[11px] text-slate-400 mt-1">Sales are 10–25% below the local benchmark</p>
        </div>

        {/* Behind */}
        <div className="bg-slate-900/80 border border-rose-500/30 rounded-xl p-4 shadow-sm bg-linear-to-b from-rose-950/20 to-transparent">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
              <XCircle className="w-4 h-4" />
              <span>Far below (&lt;75%)</span>
            </span>
            <span className="text-xs font-mono font-bold text-rose-400">
              {((countFarBelow / (stations.length || 1)) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">{countFarBelow} Stations</div>
          <p className="text-[11px] text-slate-400 mt-1">Sales are more than 25% below the local benchmark</p>
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
                <th className="py-3 px-3 text-right">Station Benchmark Override (L)</th>
                <th className="py-3 px-3 text-right">Applied Benchmark</th>
                <th className="py-3 px-3 text-right">Actual Sold</th>
                <th className="py-3 px-3 text-right">% of Benchmark</th>
                <th className="py-3 px-3 text-center">Benchmark Band</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {stationTargets.map((st) => (
                <tr key={st.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-orange-400">{st.erp_code}</td>
                  <td className="py-2.5 px-3 font-sans font-semibold text-white">{st.alds_name}</td>
                  <td className="py-2.5 px-2 font-sans text-slate-300">{st.state}</td>
                  <td className="py-2.5 px-2 font-sans text-slate-400">{st.type}</td>
                  <td className="py-2.5 px-3 font-sans text-slate-300">{st.tm}</td>
                  <td className="py-2.5 px-3 text-right">
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={stationTargetInputs[st.erp_code] ?? ''}
                      placeholder={formatTarget(st.tmTarget)}
                      onChange={(event) => handleStationTargetChange(st.erp_code, event.target.value)}
                      className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-xs text-white outline-none focus:border-orange-500"
                      aria-label={`Station benchmark override for ${st.alds_name} (${st.erp_code}) in litres`}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-400">
                    {formatTarget(st.target)} L{st.hasStationTarget ? ' (station)' : ' (TM)'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-white">
                    {st.sale_qty.toLocaleString('en-IN')} L
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold">
                    <span
                      className={
                        st.benchmarkPct >= 100
                          ? 'text-emerald-400'
                          : st.benchmarkPct >= 90
                          ? 'text-indigo-400'
                          : st.benchmarkPct >= 75
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }
                    >
                      {st.benchmarkPct}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center font-sans">
                    <span
                      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        st.status === 'Met benchmark'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : st.status === 'Near benchmark'
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                          : st.status === 'Below benchmark'
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
