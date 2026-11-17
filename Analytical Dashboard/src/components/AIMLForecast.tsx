import React from 'react';
import { Sparkles, TrendingUp, CheckCircle, AlertCircle, Info, Calendar } from 'lucide-react';
import { ForecastResult } from '../types';

interface AIMLForecastProps {
  forecast: ForecastResult;
  currentSale: number;
}

export const AIMLForecast: React.FC<AIMLForecastProps> = ({ forecast, currentSale }) => {
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

  // Build 14-day history + 7-day forecast fan chart coordinates
  const histDates = (forecast.dates || []).slice(-14);
  const histActuals = (forecast.historical_actuals || []).slice(-14);
  const fanValues = [
    ...histActuals,
    ...forecast.forecast.flatMap((f) => [f.lower_bound, f.predicted_qty, f.upper_bound]),
  ].filter((v) => Number.isFinite(v) && v > 0);
  const fanMin = fanValues.length > 0 ? Math.min(...fanValues) * 0.9 : 0;
  const fanMax = fanValues.length > 0 ? Math.max(...fanValues) * 1.05 : 1;
  const totalFanPoints = histActuals.length + forecast.forecast.length;
  const fanWidth = 720;
  const fanHeight = 160;
  const getX = (idx: number) =>
    totalFanPoints <= 1 ? fanWidth / 2 : 30 + (idx / (totalFanPoints - 1)) * (fanWidth - 50);
  const getY = (val: number) =>
    fanHeight - 20 - ((val - fanMin) / (fanMax - fanMin || 1)) * (fanHeight - 36);

  const histPath = histActuals
    .map((val, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx)} ${getY(val)}`)
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
  const predPath = predLinePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const upperPoints = [
    ...(histActuals.length > 0 ? [`${getX(forecastStartIdx)},${getY(anchorVal)}`] : []),
    ...forecast.forecast.map((f, j) => `${getX(histActuals.length + j)},${getY(f.upper_bound)}`),
  ];
  const lowerPointsReversed = [
    ...[...forecast.forecast]
      .reverse()
      .map((f, revIdx) => {
        const j = forecast.forecast.length - 1 - revIdx;
        return `${getX(histActuals.length + j)},${getY(f.lower_bound)}`;
      }),
    ...(histActuals.length > 0 ? [`${getX(forecastStartIdx)},${getY(anchorVal)}`] : []),
  ];
  const confidencePolygon = [...upperPoints, ...lowerPointsReversed].join(' ');

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Historical Trajectory &amp; 7-Day Probabilistic Fan Chart (P10 – P50 – P90)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Solid orange shows observed daily volume; dashed indigo shows the ensemble forecast with its shaded P10–P90 confidence envelope.
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-orange-500 dark:bg-orange-400 inline-block" /> Observed ({histDates.length}d)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-indigo-500 dark:bg-indigo-400 inline-block" /> Forecast P50 (7d)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-xs bg-indigo-500/30 border border-indigo-400/40 inline-block" /> P10–P90 Band
            </span>
          </div>
        </div>
        <div className="h-44 w-full">
          <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${fanWidth} ${fanHeight}`} preserveAspectRatio="none">
            {confidencePolygon && (
              <polygon points={confidencePolygon} fill="rgba(99, 102, 241, 0.22)" stroke="rgba(99, 102, 241, 0.35)" strokeWidth="1" />
            )}
            {histPath && (
              <path d={histPath} fill="none" stroke="#FB923C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            )}
            {predPath && (
              <path d={predPath} fill="none" stroke="#6366F1" strokeWidth="2.5" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
            )}
            {forecast.forecast.map((f, j) => {
              const cx = getX(histActuals.length + j);
              const cy = getY(f.predicted_qty);
              return (
                <g key={f.date}>
                  <circle cx={cx} cy={cy} r="3.5" fill="#6366F1" stroke="#FFFFFF" strokeWidth="1.5" />
                  <text x={cx} y={fanHeight - 4} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400 text-[9px] font-mono">
                    {f.date.slice(5)}
                  </text>
                </g>
              );
            })}
          </svg>
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
                          Weekend
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
