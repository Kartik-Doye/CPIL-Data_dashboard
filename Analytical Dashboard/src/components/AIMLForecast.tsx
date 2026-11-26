import React, { useState } from 'react';
import { Sparkles, TrendingUp, CheckCircle, AlertCircle, Info, Calendar } from 'lucide-react';
import { ForecastResult, StateForecast } from '../types';

interface AIMLForecastProps {
  forecast: ForecastResult;
  stateForecasts?: StateForecast[];
  currentSale: number;
}

export const AIMLForecast: React.FC<AIMLForecastProps> = ({ forecast, stateForecasts = [], currentSale }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!forecast || !forecast.forecast || forecast.forecast.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center text-slate-500 dark:text-slate-400">
        No forecast data generated.
      </div>
    );
  }

  const maxVal = Math.max(...forecast.forecast.map((f) => f.upper_bound), currentSale);
  const minVal = Math.min(...forecast.forecast.map((f) => f.lower_bound), currentSale) * 0.95;
  const accuracy =
    forecast.mape_ensemble === null
      ? null
      : Math.max(0, Math.min(100, 100 - forecast.mape_ensemble));
  const festivalForecasts = forecast.forecast.filter((point) => point.festival_name);
  const formatMape = (value: number | null) => value === null ? '—' : `${value}%`;
  const exactLitres = (value: number) => value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const compactLitres = (value: number) =>
    value >= 1000
      ? `${(value / 1000).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k L`
      : `${Math.round(value).toLocaleString('en-IN')} L`;

  // Map recent 10-day outcomes by date so we can plot Historical Predicted vs Actual on the chart
  const outcomeByDate = new Map(
    (forecast.recent_forecast_outcomes || []).map((o) => [o.date, o])
  );

  // Build 14-day history + 7-day forecast fan chart coordinates with full axes & gridlines
  const histDates = (forecast.dates || []).slice(-14);
  const histActuals = (forecast.historical_actuals || []).slice(-14);
  const histAvg =
    histActuals.length > 0
      ? histActuals.reduce((sum, v) => sum + v, 0) / histActuals.length
      : currentSale;

  const fanValues = [
    ...histActuals,
    ...histDates
      .map((d) => outcomeByDate.get(d)?.predicted)
      .filter((v): v is number => v !== undefined && Number.isFinite(v)),
    ...forecast.forecast.flatMap((f) => [f.lower_bound, f.predicted_qty, f.upper_bound]),
  ].filter((v) => Number.isFinite(v) && v > 0);

  const rawMin = fanValues.length > 0 ? Math.min(...fanValues) : 0;
  const rawMax = fanValues.length > 0 ? Math.max(...fanValues) : 1000;
  const valueSpan = Math.max(rawMax - rawMin, rawMax * 0.1, 100);
  const yStepRaw = valueSpan / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(yStepRaw, 1))));
  const niceMultipliers = [1, 2, 2.5, 5, 10];
  const niceStep =
    (niceMultipliers.find((m) => m * magnitude >= yStepRaw) ?? 10) * magnitude;
  const fanMin = Math.max(0, Math.floor((rawMin - valueSpan * 0.08) / niceStep) * niceStep);
  const fanMax = Math.ceil((rawMax + valueSpan * 0.08) / niceStep) * niceStep;

  const yTicks: number[] = [];
  for (let v = fanMin; v <= fanMax + niceStep * 0.01; v += niceStep) {
    yTicks.push(Math.round(v * 100) / 100);
  }
  if (yTicks.length < 2) {
    yTicks.push(fanMin + niceStep);
  }
  const effectiveFanMax = yTicks[yTicks.length - 1];

  const totalFanPoints = histActuals.length + forecast.forecast.length;
  const svgWidth = 960;
  const svgHeight = 340;
  const padLeft = 84;
  const padRight = 32;
  const padTop = 28;
  const padBottom = 64;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  const getX = (idx: number) =>
    totalFanPoints <= 1
      ? padLeft + plotWidth / 2
      : padLeft + (idx / (totalFanPoints - 1)) * plotWidth;
  const getY = (val: number) =>
    padTop +
    plotHeight -
    ((val - fanMin) / (effectiveFanMax - fanMin || 1)) * plotHeight;

  const histPath = histActuals
    .map((val, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(val).toFixed(1)}`)
    .join(' ');
  const histAreaPath =
    histActuals.length > 1
      ? `${histPath} L ${getX(histActuals.length - 1).toFixed(1)} ${(padTop + plotHeight).toFixed(1)} L ${getX(0).toFixed(1)} ${(padTop + plotHeight).toFixed(1)} Z`
      : '';

  // Historical walk-forward predicted line (for the last 10 days where outcome exists)
  const histPredPoints = histDates
    .map((dateStr, idx) => {
      const matched = outcomeByDate.get(dateStr);
      if (!matched) return null;
      return { idx, date: dateStr, x: getX(idx), y: getY(matched.predicted), val: matched.predicted };
    })
    .filter((p): p is { idx: number; date: string; x: number; y: number; val: number } => p !== null);

  const histPredPath = histPredPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const forecastStartIdx = Math.max(0, histActuals.length - 1);
  const anchorVal = histActuals.length > 0 ? histActuals[histActuals.length - 1] : currentSale;
  const predLinePoints = [
    ...(histActuals.length > 0 ? [{ x: getX(forecastStartIdx), y: getY(anchorVal) }] : []),
    ...forecast.forecast.map((f, j) => ({
      x: getX(histActuals.length + j),
      y: getY(f.predicted_qty),
    })),
  ];
  const predPath = predLinePoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const upperBoundPath = [
    ...(histActuals.length > 0 ? [`M ${getX(forecastStartIdx).toFixed(1)} ${getY(anchorVal).toFixed(1)}`] : []),
    ...forecast.forecast.map(
      (f, j) => `${histActuals.length === 0 && j === 0 ? 'M' : 'L'} ${getX(histActuals.length + j).toFixed(1)} ${getY(f.upper_bound).toFixed(1)}`
    ),
  ].join(' ');

  const lowerBoundPath = [
    ...(histActuals.length > 0 ? [`M ${getX(forecastStartIdx).toFixed(1)} ${getY(anchorVal).toFixed(1)}`] : []),
    ...forecast.forecast.map(
      (f, j) => `${histActuals.length === 0 && j === 0 ? 'M' : 'L'} ${getX(histActuals.length + j).toFixed(1)} ${getY(f.lower_bound).toFixed(1)}`
    ),
  ].join(' ');

  const upperPoints = [
    ...(histActuals.length > 0 ? [`${getX(forecastStartIdx).toFixed(1)},${getY(anchorVal).toFixed(1)}`] : []),
    ...forecast.forecast.map((f, j) => `${getX(histActuals.length + j).toFixed(1)},${getY(f.upper_bound).toFixed(1)}`),
  ];
  const lowerPointsReversed = [
    ...[...forecast.forecast]
      .reverse()
      .map((f, revIdx) => {
        const j = forecast.forecast.length - 1 - revIdx;
        return `${getX(histActuals.length + j).toFixed(1)},${getY(f.lower_bound).toFixed(1)}`;
      }),
    ...(histActuals.length > 0 ? [`${getX(forecastStartIdx).toFixed(1)},${getY(anchorVal).toFixed(1)}`] : []),
  ];
  const confidencePolygon = [...upperPoints, ...lowerPointsReversed].join(' ');

  // Unified timeline array for X-axis ticks, vertical gridlines, and hover inspection
  const shortDayName = (dateStr: string) => {
    const dt = new Date(`${dateStr}T00:00:00`);
    return Number.isNaN(dt.getTime())
      ? ''
      : dt.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const allTimelinePoints = [
    ...histActuals.map((actual, idx) => {
      const dateStr = histDates[idx] || `Day ${idx + 1}`;
      const outcome = outcomeByDate.get(dateStr);
      return {
        idx,
        kind: 'history' as const,
        date: dateStr,
        dayShort: outcome?.day_name ? outcome.day_name.slice(0, 3) : shortDayName(dateStr),
        x: getX(idx),
        y: getY(actual),
        actual,
        predicted: outcome?.predicted ?? null,
        difference: outcome?.difference ?? null,
        differencePct: outcome?.difference_pct ?? null,
        lowerBound: null as number | null,
        upperBound: null as number | null,
        adaptiveAdj: outcome?.adaptive_correction_litres ?? null,
      };
    }),
    ...forecast.forecast.map((f, j) => {
      const idx = histActuals.length + j;
      return {
        idx,
        kind: 'forecast' as const,
        date: f.date,
        dayShort: f.day_name ? f.day_name.slice(0, 3) : shortDayName(f.date),
        x: getX(idx),
        y: getY(f.predicted_qty),
        actual: null as number | null,
        predicted: f.predicted_qty,
        difference: null as number | null,
        differencePct: null as number | null,
        lowerBound: f.lower_bound,
        upperBound: f.upper_bound,
        adaptiveAdj: f.adaptive_adjustment_litres ?? null,
      };
    }),
  ];

  const activePoint =
    hoveredIdx !== null && allTimelinePoints[hoveredIdx]
      ? allTimelinePoints[hoveredIdx]
      : allTimelinePoints[histActuals.length] ?? allTimelinePoints[allTimelinePoints.length - 1] ?? null;

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                AIML 7-Day Network Demand Forecast
              </h2>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20">
                Ensemble Mode
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Forecasts are estimates; the validation score below summarizes historical
              walk-forward testing and does not guarantee future accuracy.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">7-Day Cumulative Volume:</span>
              <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {exactLitres(forecast.predicted_total_7d)} L
              </span>
            </div>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Historical validation accuracy:</span>
              <span className="text-base font-bold font-mono text-indigo-600 dark:text-indigo-300">
                {accuracy === null ? 'Not available' : `${accuracy.toFixed(1)}%`}
              </span>
              <span className="text-slate-500 block text-[10px]">
                Trained on {forecast.days_available} DB day(s) • {forecast.backtest_days ?? 0} walk-forward scored day(s); MAPE {formatMape(forecast.mape_ensemble)}
              </span>
              <span className="text-slate-500 block text-[10px] max-w-64">
                {forecast.learning_status || 'Saved forecast feedback status unavailable.'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {festivalForecasts.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-500/40 rounded-xl p-4 text-xs text-amber-900 dark:text-amber-100">
          <strong>Festival dates in forecast:</strong>{' '}
          {festivalForecasts.map((point) => `${point.festival_name} (${point.date})`).join(', ')}.
          Demand on these dates is lower confidence. The displayed range is widened by 50% as a
          planning buffer; it is not a festival effect learned from long-term historical data.
          {festivalForecasts.some((point) => point.festival_note) && (
            <span> Calendar note: {festivalForecasts
              .filter((point) => point.festival_note)
              .map((point) => `${point.festival_name}: ${point.festival_note}`)
              .join('; ')}.</span>
          )}
        </div>
      )}

      {forecast.reasons && forecast.reasons.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-500/40 rounded-xl p-4 text-xs text-slate-800 dark:text-slate-200 space-y-2 shadow-xs">
          <h3 className="font-semibold text-amber-900 dark:text-amber-300">Recent Forecast Review & Learning Signals</h3>
          {forecast.reasons.map((reason) => <p key={reason}>{reason}</p>)}
          <p className="text-slate-600 dark:text-slate-400">
            These are data-based signals, not proof of cause. Model weights update as actual outcomes become available.
          </p>
        </div>
      )}

      {forecast.recent_forecast_outcomes && forecast.recent_forecast_outcomes.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Today &amp; Last 10 Days: Actual vs Prediction Difference &amp; Adaptive Learning Ledger</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                  {forecast.recent_forecast_outcomes.length} Days Tracked
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Compares actual reported volume against leak-free predicted volume from the latest operational date (&ldquo;Today&rdquo;) back 10 days. The model continuously learns from each day&apos;s difference by updating recency-weighted model weights and EWMA + weekday residual bias damping.
              </p>
            </div>
          </div>

          {forecast.adaptive_learning && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  10-Day Mean Absolute Difference
                </span>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                  ±{exactLitres(forecast.adaptive_learning.mean_abs_diff_litres)} L
                </div>
                <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400">
                  Avg Error: {forecast.adaptive_learning.mean_abs_diff_pct.toFixed(1)}%
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  10-Day Net Signed Difference (Bias)
                </span>
                <div
                  className={`text-base font-bold font-mono mt-0.5 ${
                    forecast.adaptive_learning.net_signed_diff_litres > 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : forecast.adaptive_learning.net_signed_diff_litres < 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {forecast.adaptive_learning.net_signed_diff_litres > 0 ? '+' : ''}
                  {exactLitres(forecast.adaptive_learning.net_signed_diff_litres)} L/d
                </div>
                <span className="text-[10px] font-mono text-slate-500">
                  EWMA Residual: {forecast.adaptive_learning.ewma_bias_pct > 0 ? '+' : ''}
                  {forecast.adaptive_learning.ewma_bias_pct.toFixed(2)}%
                </span>
              </div>

              <div className="p-3 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-500/30">
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold block">
                  Adaptive Correction Applied (Next Day)
                </span>
                <div className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {forecast.adaptive_learning.next_day_adjustment_litres > 0 ? '+' : ''}
                  {exactLitres(forecast.adaptive_learning.next_day_adjustment_litres)} L
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Auto-damps recent over/under-prediction
                </span>
              </div>

              <div className="p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-500/30">
                <span className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold block">
                  Sat &amp; Sun Weekend Dip (vs Mon–Fri)
                </span>
                <div className="text-sm font-bold font-mono text-amber-700 dark:text-amber-300 mt-0.5">
                  Sat: {(forecast.adaptive_learning.saturday_dip_pct ?? 0) > 0 ? '+' : ''}
                  {(forecast.adaptive_learning.saturday_dip_pct ?? 0).toFixed(1)}% • Sun:{' '}
                  {(forecast.adaptive_learning.sunday_dip_pct ?? 0) > 0 ? '+' : ''}
                  {(forecast.adaptive_learning.sunday_dip_pct ?? 0).toFixed(1)}%
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Weekend contraction calibrated from DB
                </span>
              </div>

              <div className="p-3 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/25 border border-indigo-200 dark:border-indigo-500/30">
                <span className="text-[11px] text-indigo-700 dark:text-indigo-400 font-semibold block">
                  Best Model on Last 10 Days
                </span>
                <div className="text-base font-bold capitalize text-slate-900 dark:text-white mt-0.5">
                  {forecast.adaptive_learning.best_recent_model}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Boosted via recency-weighted MAPE
                </span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-950/70 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-3">Date &amp; Day</th>
                  <th className="py-3 px-3 text-right">Actual Sales (L)</th>
                  <th className="py-3 px-3 text-right">Predicted Sales (L)</th>
                  <th className="py-3 px-3 text-right">Difference (Pred − Actual)</th>
                  <th className="py-3 px-3 text-right">Actual − Pred</th>
                  <th className="py-3 px-3 text-right">Error (%)</th>
                  <th className="py-3 px-3">Closest Model</th>
                  <th className="py-3 px-3">Adaptive Learning &amp; Diagnostic Context</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {forecast.recent_forecast_outcomes.map((outcome, index) => {
                  const actualMinusPred = outcome.actual - outcome.predicted;
                  return (
                    <tr key={outcome.date} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold">{outcome.date}</span>
                          {index === 0 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30 font-semibold">
                              Latest
                            </span>
                          )}
                        </div>
                        {outcome.day_name && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">{outcome.day_name}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {exactLitres(outcome.actual)} L
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-indigo-600 dark:text-indigo-300 whitespace-nowrap">
                        {exactLitres(outcome.predicted)} L
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono font-bold whitespace-nowrap ${
                          outcome.difference > 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : outcome.difference < 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {outcome.difference > 0 ? '+' : ''}
                        {exactLitres(outcome.difference)} L
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono font-semibold whitespace-nowrap ${
                          actualMinusPred >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {actualMinusPred > 0 ? '+' : ''}
                        {exactLitres(actualMinusPred)} L
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {Math.abs(outcome.difference_pct).toFixed(1)}%{' '}
                        <span className="text-[10px] text-slate-500">
                          ({outcome.difference > 0 ? 'over' : outcome.difference < 0 ? 'under' : 'exact'})
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-semibold capitalize text-slate-800 dark:text-slate-200">
                          {outcome.closest_model}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {exactLitres(outcome.closest_model_prediction)} L
                        </div>
                      </td>
                      <td className="py-3 px-3 min-w-64 text-slate-600 dark:text-slate-400">
                        {outcome.adaptive_correction_litres !== undefined && outcome.adaptive_correction_litres !== 0 && (
                          <div className="mb-1 text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                            Learned Bias Shift Applied: {outcome.adaptive_correction_litres > 0 ? '+' : ''}
                            {exactLitres(outcome.adaptive_correction_litres)} L
                          </div>
                        )}
                        <div>{outcome.explanation}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Model Accuracy Comparison Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900/80 border border-indigo-200 dark:border-indigo-500/30 rounded-xl p-4 shadow-xs bg-linear-to-b from-indigo-50/50 dark:from-indigo-950/20 to-transparent">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Ensemble (Active)</span>
            <span className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-pulse" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {accuracy === null ? '—' : `${accuracy.toFixed(1)}%`}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Trained on all {forecast.days_available} DB day(s); {forecast.backtest_days ?? 0} scored day(s)
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Holt-Winters Exp Smoothing</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-800 dark:text-slate-200">{formatMape(forecast.mape_holt_winters)}</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Level, trend, and weekly seasonality smoothing</p>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Linear Regression</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-800 dark:text-slate-200">{formatMape(forecast.mape_linear)}</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Leak-free trend and calendar feature regression</p>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Baseline Naive</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-600 dark:text-slate-400">{formatMape(forecast.mape_naive)}</div>
          <p className="text-[11px] text-slate-500 mt-1">Same day previous week baseline</p>
        </div>

        <div className={`bg-white dark:bg-slate-900/80 border rounded-xl p-4 shadow-xs ${forecast.gradient_boosting_active ? 'border-emerald-300 dark:border-emerald-500/30' : 'border-slate-200 dark:border-slate-800'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Gradient Boosting Trial</span>
            <span className={`text-[10px] ${forecast.gradient_boosting_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {forecast.gradient_boosting_active ? 'Promoted' : 'Benchmark only'}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-800 dark:text-slate-200">
            {formatMape(forecast.models_metrics?.gradient_boosting?.mape ?? null)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Standalone walk-forward MAPE. 20% blend: {formatMape(forecast.models_metrics?.gradient_boosting_blend?.mape ?? null)}.
            Promotion requires ≥5% better blended MAPE and wins on ≥60% of at least 14 days.
          </p>
        </div>
      </div>

      {/* Visual Fan Chart: Historical 14d + 7d P10-P90 Confidence Envelope */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              <span>Historical Trajectory &amp; 7-Day Probabilistic Fan Chart (P10 – P50 – P90)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Hover any date point to inspect exact Litres. Solid orange tracks observed actuals, dotted emerald tracks walk-forward historical predictions, and dashed indigo projects the 7-day adaptive forecast inside its P10–P90 confidence fan.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/70 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-orange-500 inline-block rounded-full" />
              <span className="w-2 h-2 rounded-full bg-orange-500 inline-block -ml-2.5" />
              <span>Actual Sales ({histDates.length}d)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 border-b-2 border-dotted border-emerald-500 inline-block" />
              <span>Walk-Forward Pred (10d)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 border-b-2 border-dashed border-indigo-500 inline-block" />
              <span>7d Forecast (P50)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-2.5 rounded-xs bg-indigo-500/25 border border-indigo-400/50 inline-block" />
              <span>P10–P90 Confidence Band</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 border-b border-dashed border-slate-400 inline-block" />
              <span>14d Avg ({compactLitres(histAvg)})</span>
            </span>
          </div>
        </div>

        {/* Interactive Point Inspector Bar */}
        {activePoint && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  activePoint.kind === 'history'
                    ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30'
                    : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                }`}
              >
                {activePoint.kind === 'history'
                  ? activePoint.idx === histActuals.length - 1
                    ? 'Latest Observed Day'
                    : 'Historical Day'
                  : `Forward Forecast (+${activePoint.idx - histActuals.length + 1}d)`}
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {activePoint.date} ({activePoint.dayShort})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {activePoint.actual !== null && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400 mr-1">Actual:</span>
                  <span className="font-bold text-orange-600 dark:text-orange-400">
                    {exactLitres(activePoint.actual)} L
                  </span>
                </div>
              )}
              {activePoint.predicted !== null && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400 mr-1">
                    {activePoint.kind === 'history' ? 'Predicted:' : 'Forecast P50:'}
                  </span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {exactLitres(activePoint.predicted)} L
                  </span>
                </div>
              )}
              {activePoint.difference !== null && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400 mr-1">Diff (Pred−Act):</span>
                  <span
                    className={`font-bold ${
                      activePoint.difference > 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : activePoint.difference < 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {activePoint.difference > 0 ? '+' : ''}
                    {exactLitres(activePoint.difference)} L (
                    {activePoint.differencePct !== null
                      ? `${activePoint.differencePct > 0 ? '+' : ''}${activePoint.differencePct.toFixed(1)}%`
                      : '0%'}
                    )
                  </span>
                </div>
              )}
              {activePoint.lowerBound !== null && activePoint.upperBound !== null && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400 mr-1">P10–P90 Band:</span>
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">
                    [{exactLitres(activePoint.lowerBound)} – {exactLitres(activePoint.upperBound)} L]
                  </span>
                </div>
              )}
              {activePoint.adaptiveAdj !== null && activePoint.adaptiveAdj !== 0 && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400 mr-1">Adaptive Shift:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    {activePoint.adaptiveAdj > 0 ? '+' : ''}
                    {exactLitres(activePoint.adaptiveAdj)} L
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Crisp Responsive SVG Chart with Y-Axis, X-Axis, Gridlines, Divider & Hover Crosshair */}
        <div className="w-full overflow-x-auto">
          <div className="min-w-[680px]">
            <svg
              className="w-full h-auto select-none"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <defs>
                <linearGradient id="fanBandGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366F1" stopOpacity="0.32" />
                  <stop offset="50%" stopColor="#6366F1" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity="0.28" />
                </linearGradient>
                <linearGradient id="histAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FB923C" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#FB923C" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Plot background */}
              <rect
                x={padLeft}
                y={padTop}
                width={plotWidth}
                height={plotHeight}
                className="fill-slate-50/60 dark:fill-slate-950/40"
                rx="4"
              />

              {/* Shaded Forecast Zone Background */}
              {histActuals.length > 0 && (
                <rect
                  x={getX(forecastStartIdx)}
                  y={padTop}
                  width={Math.max(0, padLeft + plotWidth - getX(forecastStartIdx))}
                  height={plotHeight}
                  fill="rgba(99, 102, 241, 0.04)"
                />
              )}

              {/* Horizontal Gridlines & Y-Axis Tick Labels */}
              {yTicks.map((tickVal) => {
                const y = getY(tickVal);
                return (
                  <g key={`ytick-${tickVal}`}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={padLeft + plotWidth}
                      y2={y}
                      className="stroke-slate-200 dark:stroke-slate-800"
                      strokeWidth="1"
                      strokeDasharray={tickVal === fanMin ? undefined : '4 4'}
                    />
                    <line
                      x1={padLeft - 5}
                      y1={y}
                      x2={padLeft}
                      y2={y}
                      className="stroke-slate-400 dark:stroke-slate-600"
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft - 9}
                      y={y + 3.5}
                      textAnchor="end"
                      className="fill-slate-600 dark:fill-slate-400 text-[10px] font-mono"
                    >
                      {compactLitres(tickVal)}
                    </text>
                  </g>
                );
              })}

              {/* Vertical Gridlines & X-Axis Ticks + Date/Day Labels */}
              {allTimelinePoints.map((pt) => {
                const isForecast = pt.kind === 'forecast';
                const isBoundary = pt.idx === forecastStartIdx;
                const isHovered = hoveredIdx === pt.idx;
                const isWeekendPt = pt.dayShort === 'Sat' || pt.dayShort === 'Sun';
                const colWidth = plotWidth / Math.max(totalFanPoints, 1);
                return (
                  <g key={`xtick-${pt.date}-${pt.idx}`}>
                    {/* Subtle Weekend (Sat/Sun Dip) vertical column highlight */}
                    {isWeekendPt && (
                      <rect
                        x={pt.x - colWidth / 2}
                        y={padTop}
                        width={colWidth}
                        height={plotHeight}
                        fill="rgba(245, 158, 11, 0.06)"
                      />
                    )}
                    {/* Vertical gridline */}
                    <line
                      x1={pt.x}
                      y1={padTop}
                      x2={pt.x}
                      y2={padTop + plotHeight}
                      className={
                        isHovered
                          ? 'stroke-indigo-500/60 dark:stroke-indigo-400/60'
                          : isWeekendPt
                          ? 'stroke-amber-400/40 dark:stroke-amber-500/30'
                          : 'stroke-slate-200/70 dark:stroke-slate-800/60'
                      }
                      strokeWidth={isHovered ? '1.5' : '1'}
                      strokeDasharray="2 4"
                    />
                    {/* X-axis tick mark */}
                    <line
                      x1={pt.x}
                      y1={padTop + plotHeight}
                      x2={pt.x}
                      y2={padTop + plotHeight + 5}
                      className="stroke-slate-400 dark:stroke-slate-600"
                      strokeWidth="1"
                    />
                    {/* Date label (MM-DD) */}
                    <text
                      x={pt.x}
                      y={padTop + plotHeight + 18}
                      textAnchor="middle"
                      className={`text-[10px] font-mono ${
                        isHovered
                          ? 'fill-indigo-600 dark:fill-indigo-300 font-bold'
                          : isBoundary
                          ? 'fill-orange-600 dark:fill-orange-400 font-bold'
                          : isForecast
                          ? 'fill-indigo-600 dark:fill-indigo-400 font-semibold'
                          : 'fill-slate-600 dark:fill-slate-400'
                      }`}
                    >
                      {pt.date.slice(5)}
                    </text>
                    {/* Weekday label (highlights Sat/Sun dip) */}
                    <text
                      x={pt.x}
                      y={padTop + plotHeight + 31}
                      textAnchor="middle"
                      className={`text-[9px] font-mono ${
                        isWeekendPt
                          ? 'fill-amber-600 dark:fill-amber-400 font-bold'
                          : 'fill-slate-400 dark:fill-slate-500'
                      }`}
                    >
                      {isWeekendPt ? `${pt.dayShort}↓` : pt.dayShort}
                    </text>
                  </g>
                );
              })}

              {/* Y-Axis & X-Axis Solid Spine Lines */}
              <line
                x1={padLeft}
                y1={padTop}
                x2={padLeft}
                y2={padTop + plotHeight}
                className="stroke-slate-300 dark:stroke-slate-700"
                strokeWidth="1.5"
              />
              <line
                x1={padLeft}
                y1={padTop + plotHeight}
                x2={padLeft + plotWidth}
                y2={padTop + plotHeight}
                className="stroke-slate-300 dark:stroke-slate-700"
                strokeWidth="1.5"
              />

              {/* Y-Axis Title */}
              <text
                transform={`translate(16, ${padTop + plotHeight / 2}) rotate(-90)`}
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400 text-[10px] font-semibold tracking-wider uppercase"
              >
                Daily Sales Volume (Litres)
              </text>

              {/* X-Axis Title */}
              <text
                x={padLeft + plotWidth / 2}
                y={svgHeight - 8}
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400 text-[10px] font-semibold tracking-wider uppercase"
              >
                Operating Date &amp; Day of Week (14-Day History → 7-Day Forward Horizon)
              </text>

              {/* 14-Day Historical Average Reference Line */}
              {histAvg > fanMin && histAvg < effectiveFanMax && (
                <g>
                  <line
                    x1={padLeft}
                    y1={getY(histAvg)}
                    x2={padLeft + plotWidth}
                    y2={getY(histAvg)}
                    stroke="#94A3B8"
                    strokeWidth="1.2"
                    strokeDasharray="6 4"
                  />
                  <rect
                    x={padLeft + 6}
                    y={getY(histAvg) - 15}
                    width="112"
                    height="14"
                    rx="3"
                    className="fill-slate-100/90 dark:fill-slate-900/90"
                  />
                  <text
                    x={padLeft + 10}
                    y={getY(histAvg) - 5}
                    className="fill-slate-500 dark:fill-slate-400 text-[9px] font-mono font-semibold"
                  >
                    14d Avg: {compactLitres(histAvg)}
                  </text>
                </g>
              )}

              {/* TODAY / Forecast Start Vertical Divider */}
              {histActuals.length > 0 && (
                <g>
                  <line
                    x1={getX(forecastStartIdx)}
                    y1={padTop}
                    x2={getX(forecastStartIdx)}
                    y2={padTop + plotHeight}
                    stroke="#F97316"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                  />
                  <rect
                    x={getX(forecastStartIdx) - 54}
                    y={padTop - 18}
                    width="108"
                    height="15"
                    rx="4"
                    className="fill-orange-500/15 stroke-orange-500/40"
                    strokeWidth="1"
                  />
                  <text
                    x={getX(forecastStartIdx)}
                    y={padTop - 7.5}
                    textAnchor="middle"
                    className="fill-orange-600 dark:fill-orange-300 text-[9px] font-mono font-bold"
                  >
                    LATEST → FORECAST
                  </text>
                </g>
              )}

              {/* Historical Area Fill under Observed Actuals */}
              {histAreaPath && <path d={histAreaPath} fill="url(#histAreaGrad)" />}

              {/* P10-P90 Shaded Confidence Fan Polygon */}
              {confidencePolygon && (
                <polygon
                  points={confidencePolygon}
                  fill="url(#fanBandGrad)"
                />
              )}

              {/* Explicit P90 Upper Bound & P10 Lower Bound Envelope Lines */}
              {upperBoundPath && (
                <path
                  d={upperBoundPath}
                  fill="none"
                  stroke="#818CF8"
                  strokeWidth="1.25"
                  strokeDasharray="3 3"
                  opacity="0.85"
                />
              )}
              {lowerBoundPath && (
                <path
                  d={lowerBoundPath}
                  fill="none"
                  stroke="#818CF8"
                  strokeWidth="1.25"
                  strokeDasharray="3 3"
                  opacity="0.85"
                />
              )}

              {/* Historical Observed Actuals Solid Line */}
              {histPath && (
                <path
                  d={histPath}
                  fill="none"
                  stroke="#F97316"
                  strokeWidth="2.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Historical Walk-Forward Predicted Line (Last 10 Days) */}
              {histPredPath && (
                <path
                  d={histPredPath}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2"
                  strokeDasharray="2 3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* 7-Day Forward Forecast P50 Line */}
              {predPath && (
                <path
                  d={predPath}
                  fill="none"
                  stroke="#6366F1"
                  strokeWidth="2.75"
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Historical Walk-Forward Predicted Dots (Emerald) */}
              {histPredPoints.map((pt) => (
                <circle
                  key={`hist-pred-${pt.date}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="3"
                  fill="#10B981"
                  stroke="#0F172A"
                  strokeWidth="1"
                />
              ))}

              {/* Historical Observed Actual Dots (Orange) */}
              {histActuals.map((val, idx) => {
                const cx = getX(idx);
                const cy = getY(val);
                const isHovered = hoveredIdx === idx;
                return (
                  <circle
                    key={`hist-actual-${histDates[idx] || idx}`}
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 5.5 : 3.5}
                    fill="#F97316"
                    stroke="#FFFFFF"
                    strokeWidth={isHovered ? 2 : 1.5}
                  />
                );
              })}

              {/* 7-Day Forward Forecast Dots & P10/P90 Whiskers */}
              {forecast.forecast.map((f, j) => {
                const ptIdx = histActuals.length + j;
                const cx = getX(ptIdx);
                const cy = getY(f.predicted_qty);
                const yUpper = getY(f.upper_bound);
                const yLower = getY(f.lower_bound);
                const isHovered = hoveredIdx === ptIdx;
                return (
                  <g key={`fcast-pt-${f.date}`}>
                    {/* Vertical P10-P90 range whisker */}
                    <line
                      x1={cx}
                      y1={yUpper}
                      x2={cx}
                      y2={yLower}
                      stroke="#6366F1"
                      strokeOpacity="0.45"
                      strokeWidth="1.2"
                    />
                    <circle cx={cx} cy={yUpper} r="2" fill="#818CF8" />
                    <circle cx={cx} cy={yLower} r="2" fill="#818CF8" />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 6 : 4}
                      fill="#6366F1"
                      stroke="#FFFFFF"
                      strokeWidth={isHovered ? 2.2 : 1.5}
                    />
                  </g>
                );
              })}

              {/* Interactive Invisible Hit Columns for Smooth Hovering */}
              {allTimelinePoints.map((pt) => {
                const colWidth = plotWidth / Math.max(totalFanPoints, 1);
                return (
                  <rect
                    key={`hit-${pt.idx}`}
                    x={pt.x - colWidth / 2}
                    y={padTop}
                    width={colWidth}
                    height={plotHeight + 36}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIdx(pt.idx)}
                  />
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* 7-Day Day-by-Day Forecast Table with Confidence Ranges */}
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-orange-500 dark:text-orange-400" />
          <span>Daily Forward Projections & Estimated Ranges</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950/70 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Forecast Date</th>
                <th className="py-3 px-4">Day of Week</th>
                <th className="py-3 px-4 text-right">Predicted Demand</th>
                <th className="py-3 px-4 text-right">Adaptive Correction</th>
                <th className="py-3 px-4 text-center">Estimated Range (Lower - Upper)</th>
                <th className="py-3 px-4 text-right">Linear Model</th>
                <th className="py-3 px-4 text-right">Holt-Winters</th>
                <th className="py-3 px-4 text-right">Gradient Boosting Trial</th>
                <th className="py-3 px-4">Visual Band</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {forecast.forecast.map((f, idx) => {
                const pct = Math.max(0, Math.min(100, ((f.predicted_qty - minVal) / (maxVal - minVal || 1)) * 100));
                const lowerPct = Math.max(0, Math.min(100, ((f.lower_bound - minVal) / (maxVal - minVal || 1)) * 100));
                const upperPct = Math.max(0, Math.min(100, ((f.upper_bound - minVal) / (maxVal - minVal || 1)) * 100));
                const bandWidth = Math.max(2, Math.min(100 - lowerPct, upperPct - lowerPct));

                return (
                  <tr key={f.date} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 flex items-center justify-center font-sans">
                        +{idx + 1}
                      </span>
                      <span>{f.date}</span>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-700 dark:text-slate-300 font-medium">
                      {f.day_name}
                      {(f.day_name === 'Sunday' || f.day_name === 'Saturday') && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 font-sans">
                          Weekend Dip ↓
                        </span>
                      )}
                      {f.festival_name && (
                        <span className="ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20 font-sans">
                          {f.festival_name}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-indigo-600 dark:text-indigo-300 text-sm">
                      {exactLitres(f.predicted_qty)} L
                    </td>
                    <td
                      className={`py-3 px-4 text-right text-xs font-semibold ${
                        (f.adaptive_adjustment_litres ?? 0) > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : (f.adaptive_adjustment_litres ?? 0) < 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {f.adaptive_adjustment_litres
                        ? `${f.adaptive_adjustment_litres > 0 ? '+' : ''}${exactLitres(f.adaptive_adjustment_litres)} L`
                        : '0.00 L'}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-500 dark:text-slate-400">
                      [{exactLitres(f.lower_bound)} — {exactLitres(f.upper_bound)}] L
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400">
                      {exactLitres(f.linear_pred)} L
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400">
                      {exactLitres(f.holt_winters_pred)} L
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400">
                      {exactLitres(f.gradient_boosting_pred)} L
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-32 bg-slate-100 dark:bg-slate-950 rounded-full h-2 relative overflow-hidden">
                        <div
                          className="absolute h-full bg-indigo-500/40"
                          style={{
                            left: `${lowerPct}%`,
                            width: `${bandWidth}%`,
                          }}
                        />
                        <div
                          className="absolute top-0 bottom-0 w-1 bg-indigo-600 dark:bg-indigo-400"
                          style={{ left: `${Math.max(0, Math.min(100, pct))}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <section className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">7-Day State-wise Sales Prediction</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Each state is forecast from its own daily sales history. Confidence ranges and walk-forward scores are historical estimates, not guarantees.
          </p>
        </div>
        {stateForecasts.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">State-level history is not available for forecasting.</p>
        ) : (
          <div className="space-y-3">
            {stateForecasts.map((stateForecast) => (
              <article key={stateForecast.state} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white">{stateForecast.state}</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {stateForecast.days_available} historical days · {stateForecast.backtest_days} walk-forward scored days · MAPE {formatMape(stateForecast.mape_ensemble)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400">7-day expected volume</span>
                    <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                      {stateForecast.insufficient ? 'Not available' : `${exactLitres(stateForecast.predicted_total_7d)} L`}
                    </strong>
                  </div>
                </div>
                {stateForecast.insufficient ? (
                  <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                    Not enough state history yet; at least 7 daily observations are required.
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                    {stateForecast.forecast.map((day) => (
                      <div key={day.date} className="rounded-md bg-slate-50 dark:bg-slate-950/70 p-2 text-xs">
                        <span className="block text-slate-500 dark:text-slate-400">{day.date} · {day.day_name.slice(0, 3)}</span>
                        <strong className="block mt-1 font-mono text-indigo-600 dark:text-indigo-300">
                          {exactLitres(day.predicted_qty)} L
                        </strong>
                        <span className="block mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                          Range: {exactLitres(day.lower_bound)}–{exactLitres(day.upper_bound)} L
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Analytical Notes */}
      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl p-4 text-xs text-slate-600 dark:text-slate-400 space-y-1.5 transition-colors">
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-300 font-semibold mb-1">
          <Info className="w-4 h-4 text-orange-500 dark:text-orange-400" />
          <span>Forecasting Methodology & Ground Truth Validation</span>
        </div>
        <p>
          • <strong>Seasonality & Calendar Features:</strong> Weekly cycles are modeled empirically using Holt-Winters 7-day seasonal smoothing, cyclical weekday encoding, and historical same-weekday baselines without arbitrary fixed multipliers.
        </p>
        <p>
          • <strong>Walk-forward validation:</strong> Each scored day is predicted using only earlier observations. Accuracy is 100% minus validation MAPE and is not a guarantee of future performance.
        </p>
      </div>
    </div>
  );
};
