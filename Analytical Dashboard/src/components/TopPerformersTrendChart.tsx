import React, { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { StationMonthlySales, StationRecord } from '../types';

interface TopPerformersTrendChartProps {
  stations: StationRecord[];
  monthlySales?: StationMonthlySales[];
  isCompact?: boolean;
}

export const TopPerformersTrendChart: React.FC<TopPerformersTrendChartProps> = ({
  stations,
  monthlySales = [],
  isCompact = false,
}) => {
  const [selectedStationErp, setSelectedStationErp] = useState<string>('all');

  // Filter top 5 active stations by daily sale volume
  const top5Stations = [...stations]
    .filter((s) => s.sale_qty > 0)
    .sort((a, b) => b.sale_qty - a.sale_qty)
    .slice(0, 5);

  if (top5Stations.length === 0) return null;

  const months = [...new Set(monthlySales.map((row) => row.month))].sort().slice(-3);
  if (months.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Top Stations: 3-Month Volume Trend</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          Station-level monthly sales history is unavailable; no estimated trend is shown.
        </p>
      </div>
    );
  }

  const lineColors = [
    { stroke: '#4F46E5', fill: 'rgba(79, 70, 229, 0.1)', text: 'text-indigo-600 dark:text-indigo-400' }, // Indigo
    { stroke: '#10B981', fill: 'rgba(16, 185, 129, 0.1)', text: 'text-emerald-600 dark:text-emerald-400' }, // Emerald
    { stroke: '#F59E0B', fill: 'rgba(245, 158, 11, 0.1)', text: 'text-amber-600 dark:text-amber-400' }, // Amber
    { stroke: '#06B6D4', fill: 'rgba(6, 182, 212, 0.1)', text: 'text-cyan-600 dark:text-cyan-400' }, // Cyan
    { stroke: '#EC4899', fill: 'rgba(236, 72, 153, 0.1)', text: 'text-pink-600 dark:text-pink-400' }, // Pink
  ];

  const stationTrends = top5Stations.map((st, idx) => {
    const values = months.map((month) =>
      monthlySales.find((row) => row.erp_code === st.erp_code && row.month === month)?.sale_qty ?? null
    );
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    return {
      station: st,
      color: lineColors[idx % lineColors.length],
      values,
      growth: firstValue !== null && lastValue !== null && firstValue > 0
        ? ((lastValue - firstValue) / firstValue) * 100
        : null,
    };
  });

  const displayTrends =
    selectedStationErp === 'all'
      ? stationTrends
      : stationTrends.filter((t) => t.station.erp_code === selectedStationErp);

  const maxVal = Math.max(...stationTrends.flatMap((t) => t.values).filter((value): value is number => value !== null), 1);
  const exactQty = (value: number) => value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const xPositions = months.map((_, index) =>
    months.length === 1 ? 300 : 60 + (480 * index) / (months.length - 1)
  );

  return (
    <div
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs transition-all ${
        isCompact ? 'p-3' : 'p-5'
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Top Stations: 3-Month Volume Trend
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Actual reported monthly litres for the five highest-volume stations; values are not estimates.
          </p>
        </div>

        {/* Station Filter Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={selectedStationErp}
            onChange={(e) => setSelectedStationErp(e.target.value)}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Top 5 Stations</option>
            {top5Stations.map((s) => (
              <option key={s.erp_code} value={s.erp_code}>
                {s.erp_code} — {s.alds_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SVG Multi-Line Chart */}
      <div className="h-44 w-full relative mt-2">
        <svg className="w-full h-full overflow-visible" viewBox="0 0 600 160" preserveAspectRatio="none">
          {/* Grid lines */}
          <line x1="40" y1="20" x2="590" y2="20" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="3 3" />
          <line x1="40" y1="70" x2="590" y2="70" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="3 3" />
          <line x1="40" y1="120" x2="590" y2="120" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeDasharray="3 3" />
          <text x="0" y="23" className="text-[8px] fill-slate-400">{exactQty(maxVal)}</text>
          <text x="0" y="73" className="text-[8px] fill-slate-400">{exactQty(maxVal / 2)}</text>
          <text x="0" y="123" className="text-[8px] fill-slate-400">0</text>

          {months.map((month, index) => (
            <text
              key={month}
              x={xPositions[index]}
              y="152"
              textAnchor="middle"
              className="text-[10px] fill-slate-400 dark:fill-slate-500 font-medium"
            >
              {new Date(`${month}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
            </text>
          ))}

          {/* Lines for each station */}
          {displayTrends.map((t) => {
            let segmentOpen = false;
            const pathD = t.values.map((value, index) => {
              if (value === null) {
                segmentOpen = false;
                return null;
              }
              const command = segmentOpen ? 'L' : 'M';
              segmentOpen = true;
              return `${command} ${xPositions[index]} ${120 - (value / maxVal) * 95}`;
            }).filter((point): point is string => point !== null).join(' ');

            return (
              <g key={t.station.erp_code}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={t.color.stroke}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {t.values.map((value, index) => (
                  value === null ? null :
                  <g key={`${t.station.erp_code}-${months[index]}`}>
                    <circle cx={xPositions[index]} cy={120 - (value / maxVal) * 95} r="4" fill={t.color.stroke} />
                    <title>{`${t.station.alds_name}: ${months[index]} — ${exactQty(value)} L`}</title>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Station Legend Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
        {top5Stations.map((st, idx) => {
          const tr = stationTrends[idx];
          return (
            <div
              key={st.erp_code}
              onClick={() => setSelectedStationErp(selectedStationErp === st.erp_code ? 'all' : st.erp_code)}
              className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                selectedStationErp === st.erp_code || selectedStationErp === 'all'
                  ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                  : 'bg-transparent border-transparent opacity-50'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tr.color.stroke }} />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {st.erp_code}
                </span>
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 ml-auto">
                  {tr.growth === null ? '—' : `${tr.growth >= 0 ? '+' : ''}${tr.growth.toFixed(1)}%`}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {st.alds_name}
              </div>
              <div className="mt-1 space-y-0.5">
                {months.map((month, monthIndex) => (
                  <div key={month} className="flex justify-between gap-1 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                    <span>{new Date(`${month}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short' })}</span>
                    <span>{tr.values[monthIndex] === null ? 'No report' : `${exactQty(tr.values[monthIndex]!)} L`}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
