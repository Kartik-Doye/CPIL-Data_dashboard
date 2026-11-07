import React, { useEffect, useState } from 'react';
import { Target, CheckCircle, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { StationRecord, StateSummary } from '../types';

const DEFAULT_DAILY_TARGET = 1100;
const DAILY_TARGET_STORAGE_KEY = 'go-gas-tm-targets';
const STATION_TARGET_STORAGE_KEY = 'go-gas-station-targets';

interface TargetTrackerProps {
  states: StateSummary[];
  stations: StationRecord[];
}

export const TargetTracker: React.FC<TargetTrackerProps> = ({ states, stations }) => {
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
      setTargetError('Saved targets could not be loaded from this browser. Defaults are in use.');
    }
  }, []);

  const handleTargetChange = (tm: string, value: string) => {
    setTargetInputs((current) => ({ ...current, [tm]: value }));
    const parsedTarget = Number(value);
    if (!value.trim() || !Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setTargetError('Enter a daily target greater than zero litres for each TM.');
      return;
    }

    const updatedTargets = { ...tmTargets, [tm]: parsedTarget };
    setTmTargets(updatedTargets);
    try {
      window.localStorage.setItem(DAILY_TARGET_STORAGE_KEY, JSON.stringify(updatedTargets));
      setTargetError('');
    } catch {
      setTargetError('The TM target is applied, but could not be saved in this browser.');
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
        setTargetError('The station now inherits its TM target, but the change could not be saved in this browser.');
      }
      return;
    }

    const parsedTarget = Number(value);
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setTargetError('Enter a station target greater than zero litres, or clear it to inherit the TM target.');
      return;
    }

    const updatedTargets = { ...stationTargetsByCode, [stationCode]: parsedTarget };
    setStationTargetsByCode(updatedTargets);
    try {
      window.localStorage.setItem(STATION_TARGET_STORAGE_KEY, JSON.stringify(updatedTargets));
      setTargetError('');
    } catch {
      setTargetError('The station target is applied, but could not be saved in this browser.');
    }
  };

  const formatTarget = (target: number) => target.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const stationTargets = stations.map((s) => {
    const tm = s.tm?.trim() || 'Unassigned';
    const tmTarget = tmTargets[tm] ?? DEFAULT_DAILY_TARGET;
    const target = stationTargetsByCode[s.erp_code] ?? tmTarget;
    const achievedPct = Number(((s.sale_qty / target) * 100).toFixed(1));
    let status: 'Achieved' | 'On track' | 'At risk' | 'Behind' = 'Achieved';

    if (achievedPct >= 100) status = 'Achieved';
    else if (achievedPct >= 90) status = 'On track';
    else if (achievedPct >= 75) status = 'At risk';
    else status = 'Behind';

    return {
      ...s,
      tmTarget,
      target,
      hasStationTarget: stationTargetsByCode[s.erp_code] !== undefined,
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
              Each TM has a target inherited by their stations. Set a station-specific override when needed; achievement uses the station override when present, otherwise the TM target.
              Status bands: Achieved ≥100%, On Track ≥90%, At Risk ≥75%, and Behind &lt;75%.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <h3 className="mb-3 text-xs font-semibold text-slate-300">Daily target by TM (L per station; inherited unless overridden)</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tmNames.map((tm, index) => {
              const target = tmTargets[tm] ?? DEFAULT_DAILY_TARGET;
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
                    aria-label={`Daily target per station for TM ${tm} in litres`}
                    aria-invalid={Boolean(targetError)}
                    aria-describedby={targetError ? 'tm-target-error' : undefined}
                  />
                </label>
              );
            })}
          </div>
          {targetError && <p id="tm-target-error" className="mt-2 text-xs text-amber-400" role="alert">{targetError}</p>}
          <p className="mt-2 text-xs text-slate-400">
            TM and station targets are saved in this browser. New TMs default to {formatTarget(DEFAULT_DAILY_TARGET)} L per station. Leave a station override blank to use its TM&apos;s target.
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
                <th className="py-3 px-3 text-right">Station Target Override (L)</th>
                <th className="py-3 px-3 text-right">Applied Target</th>
                <th className="py-3 px-3 text-right">Actual Sold</th>
                <th className="py-3 px-3 text-right">Achievement %</th>
                <th className="py-3 px-3 text-center">Status Band</th>
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
                      aria-label={`Station target override for ${st.alds_name} (${st.erp_code}) in litres`}
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
