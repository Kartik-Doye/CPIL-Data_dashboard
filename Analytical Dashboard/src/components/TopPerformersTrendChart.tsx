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
  const [selectedMonth, setSelectedMonth] = useState('');
  const [hoveredPoint, setHoveredPoint] = useState<{ erpCode: string; monthIndex: number } | null>(null);

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
    const monthlyRows = months.map((month) =>
      monthlySales.find((row) => row.erp_code === st.erp_code && row.month === month)
    );
    const values = monthlyRows.map((row) => row?.sale_qty ?? null);
    const dailyRates = monthlyRows.map((row) =>
      row && row.reporting_days > 0 ? row.sale_qty / row.reporting_days : null
    );
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const firstDailyRate = dailyRates[0];
    const lastDailyRate = dailyRates[dailyRates.length - 1];
    return {
      station: st,
      color: lineColors[idx % lineColors.length],
      values,
      reportingDays: monthlyRows.map((row) => row?.reporting_days ?? null),
      dailyRates,
      growth: firstDailyRate !== null && lastDailyRate !== null && firstDailyRate > 0
        ? ((lastDailyRate - firstDailyRate) / firstDailyRate) * 100
        : null,
    };
  });

  const displayTrends =
    selectedStationErp === 'all'
      ? stationTrends
      : stationTrends.filter((t) => t.station.erp_code === selectedStationErp);

  const maxVal = Math.max(...stationTrends.flatMap((t) => t.values).filter((value): value is number => value !== null), 1);
  const axisMax = Math.ceil(maxVal / 4) * 4;
  const exactQty = (value: number) => value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formatMonth = (month: string, options: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' }) =>
    new Date(`${month}T00:00:00Z`).toLocaleDateString('en-IN', options);
  const xPositions = months.map((_, index) =>
    months.length === 1 ? 409 : 100 + (620 * index) / (months.length - 1)
  );
  const selectedMonthIndex = selectedMonth && months.includes(selectedMonth)
    ? months.indexOf(selectedMonth)
    : months.length - 1;
  const activeMonth = months[selectedMonthIndex];
  const activeTrend = hoveredPoint
    ? stationTrends.find((trend) => trend.station.erp_code === hoveredPoint.erpCode)
    : null;
  const activePointValue = hoveredPoint
    ? activeTrend?.values[hoveredPoint.monthIndex]
    : null;
  const focusedTrends = selectedStationErp === 'all'
    ? stationTrends
    : stationTrends.filter((trend) => trend.station.erp_code === selectedStationErp);

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
            Compare reported monthly sales for the current top five. Select a station or month, or focus a chart point for exact values.
          </p>
        </div>

        {/* Station Filter Dropdown */}
        <div className="flex items-center gap-2">
          <select
            aria-label="Filter trend chart by station"
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

      <div className="flex flex-wrap items-center gap-2 mb-3" aria-label="Choose a month to inspect">
        <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">Inspect month:</span>
        {months.map((month, index) => (
          <button
            key={month}
            type="button"
            aria-pressed={selectedMonthIndex === index}
            onClick={() => {
              setSelectedMonth(month);
              setHoveredPoint(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              selectedMonthIndex === index
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
            }`}
          >
            {formatMonth(month)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_16rem] gap-4 items-stretch">
        {/* SVG Multi-Line Chart */}
        <div className="min-w-0 rounded-xl bg-slate-50/80 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 p-2 sm:p-4">
          <div className="w-full overflow-x-auto">
            <svg
              className="w-full min-w-136 lg:min-w-0 h-64 sm:h-72"
              viewBox="0 0 760 280"
              role="img"
              aria-label={`Monthly sales trend for ${selectedStationErp === 'all' ? 'top five stations' : selectedStationErp}`}
              preserveAspectRatio="xMidYMid meet"
              onMouseLeave={() => setHoveredPoint(null)}
            >
              {[0, 1, 2, 3, 4].map((tick) => {
                const y = 30 + tick * 48;
                const value = axisMax * (1 - tick / 4);
                return (
                  <g key={tick}>
                    <line
                      x1="92"
                      y1={y}
                      x2="736"
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-slate-800"
                      strokeDasharray={tick === 4 ? undefined : '4 5'}
                    />
                    <text
                      x="84"
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-500 dark:fill-slate-400 text-[11px]"
                    >
                      {Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}
                    </text>
                  </g>
                );
              })}

              {months.map((month, index) => (
                <line
                  key={`month-guide-${month}`}
                  x1={xPositions[index]}
                  y1="30"
                  x2={xPositions[index]}
                  y2="222"
                  stroke="currentColor"
                  className={selectedMonthIndex === index ? 'text-indigo-300 dark:text-indigo-900' : 'text-slate-100 dark:text-slate-900'}
                  strokeDasharray="3 5"
                />
              ))}

              {months.map((month, index) => (
                <text
                  key={month}
                  x={xPositions[index]}
                  y="250"
                  textAnchor="middle"
                  className={`text-xs font-semibold ${selectedMonthIndex === index ? 'fill-indigo-600 dark:fill-indigo-400' : 'fill-slate-500 dark:fill-slate-400'}`}
                >
                  {formatMonth(month, { month: 'short', year: '2-digit' })}
                </text>
              ))}

              {displayTrends.map((trend) => {
                let segmentOpen = false;
                const pathD = trend.values.map((value, index) => {
                  if (value === null) {
                    segmentOpen = false;
                    return null;
                  }
                  const command = segmentOpen ? 'L' : 'M';
                  segmentOpen = true;
                  const y = 222 - (value / axisMax) * 192;
                  return `${command} ${xPositions[index]} ${y}`;
                }).filter((point): point is string => point !== null).join(' ');
                const isSelected = selectedStationErp === trend.station.erp_code;

                return (
                  <g
                    key={trend.station.erp_code}
                    opacity={selectedStationErp === 'all' || isSelected ? 1 : 0.18}
                  >
                    <path
                      d={pathD}
                      fill="none"
                      stroke={trend.color.stroke}
                      strokeWidth={isSelected ? 4 : 2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {trend.values.map((value, index) => {
                      if (value === null) return null;
                      const y = 222 - (value / axisMax) * 192;
                      const isHovered = hoveredPoint?.erpCode === trend.station.erp_code && hoveredPoint.monthIndex === index;
                      return (
                        <g
                          key={`${trend.station.erp_code}-${months[index]}`}
                          onMouseEnter={() => setHoveredPoint({ erpCode: trend.station.erp_code, monthIndex: index })}
                        >
                          <circle cx={xPositions[index]} cy={y} r="13" fill="transparent" />
                          <circle
                            cx={xPositions[index]}
                            cy={y}
                            r={isHovered || selectedMonthIndex === index ? 7 : 5}
                            fill={trend.color.stroke}
                            stroke="white"
                            strokeWidth="2"
                            tabIndex={0}
                            role="button"
                            aria-label={`${trend.station.alds_name}, ${formatMonth(months[index])}: ${exactQty(value)} litres`}
                            className="cursor-pointer focus:outline-none"
                            onFocus={() => setHoveredPoint({ erpCode: trend.station.erp_code, monthIndex: index })}
                            onBlur={() => setHoveredPoint(null)}
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="mt-1 px-2 text-[10px] text-slate-500 dark:text-slate-400">
            Monthly volume (litres) · Missing months are shown as gaps, not zero sales. Hover or keyboard-focus a point for its value.
          </p>
        </div>

        <aside className="rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/20 p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {activeTrend && activePointValue != null
              ? 'Selected data point'
              : `${formatMonth(activeMonth)} · Top five`}
          </div>
          {activeTrend && activePointValue != null && hoveredPoint ? (
            <div className="mt-2">
              <div className="text-sm font-bold text-slate-900 dark:text-white">{activeTrend.station.alds_name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{formatMonth(months[hoveredPoint.monthIndex])}</div>
              <div className="mt-2 text-2xl font-bold font-mono text-indigo-700 dark:text-indigo-300">
                {exactQty(activePointValue)} <span className="text-sm font-medium">L</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {activeTrend.reportingDays[hoveredPoint.monthIndex] ?? 0} reporting day(s)
                {activeTrend.dailyRates[hoveredPoint.monthIndex] !== null &&
                  ` · ${exactQty(activeTrend.dailyRates[hoveredPoint.monthIndex]!)} L/day average`}
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {focusedTrends.map((trend) => {
                const value = trend.values[selectedMonthIndex];
                return (
                  <div key={trend.station.erp_code} className="flex items-start gap-2">
                    <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: trend.color.stroke }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{trend.station.alds_name}</div>
                      <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                        {value === null ? 'No report' : `${exactQty(value)} L`}
                      </div>
                      {value !== null && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {trend.reportingDays[selectedMonthIndex]} reporting day(s)
                          {trend.dailyRates[selectedMonthIndex] !== null &&
                            ` · ${exactQty(trend.dailyRates[selectedMonthIndex]!)} L/day`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 border-t border-indigo-100 dark:border-indigo-900/50 pt-3 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
            Growth compares average litres per reporting day between the first and latest displayed months, so a partially reported current month is not compared as if it were complete. Station ranking uses latest-day sales.
          </div>
        </aside>
      </div>

      {/* Interactive Station Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
        {top5Stations.map((st, idx) => {
          const tr = stationTrends[idx];
          const isSelected = selectedStationErp === st.erp_code;
          return (
            <button
              key={st.erp_code}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                setSelectedStationErp(isSelected ? 'all' : st.erp_code);
                setHoveredPoint(null);
              }}
              className={`text-left p-2.5 rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                selectedStationErp === 'all' || isSelected
                  ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                  : 'bg-transparent border-transparent opacity-55 hover:opacity-80'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tr.color.stroke }} />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {st.erp_code}
                </span>
                <span
                  title="Change in average litres per reporting day from first to latest month"
                  className={`text-[10px] font-mono ml-auto ${
                    tr.growth === null ? 'text-slate-500' : tr.growth >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {tr.growth === null ? '—' : `${tr.growth >= 0 ? '+' : ''}${tr.growth.toFixed(1)}%`}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {st.alds_name}
              </div>
              <div className="mt-1 space-y-0.5">
                {months.map((month, monthIndex) => (
                  <div key={month} className="flex justify-between gap-1 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                    <span>{formatMonth(month, { month: 'short' })}</span>
                    <span>{tr.values[monthIndex] === null ? 'No report' : `${exactQty(tr.values[monthIndex]!)} L`}</span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
