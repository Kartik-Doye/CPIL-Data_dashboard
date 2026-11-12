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
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-400">
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

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-white">
                AIML 7-Day Network Demand Forecast
              </h2>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                Ensemble Mode
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Forecasts are estimates; the validation score below summarizes historical
              walk-forward testing and does not guarantee future accuracy.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">7-Day Cumulative Volume:</span>
              <span className="text-base font-bold font-mono text-emerald-400">
                {exactLitres(forecast.predicted_total_7d)} L
              </span>
            </div>
            <div className="w-px h-6 bg-slate-800" />
            <div>
              <span className="text-slate-400 block text-[11px]">Historical validation accuracy:</span>
              <span className="text-base font-bold font-mono text-indigo-300">
                {accuracy === null ? 'Not available' : `${accuracy.toFixed(1)}%`}
              </span>
              <span className="text-slate-500 block text-[10px]">
                {forecast.backtest_days ?? 0} scored day(s); MAPE {formatMape(forecast.mape_ensemble)}
              </span>
              <span className="text-slate-500 block text-[10px] max-w-64">
                {forecast.learning_status || 'Saved forecast feedback status unavailable.'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {festivalForecasts.length > 0 && (
        <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-4 text-xs text-amber-100">
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
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-500/40 rounded-xl p-4 text-xs text-slate-800 dark:text-slate-200 space-y-2 shadow-sm">
          <h3 className="font-semibold text-amber-900 dark:text-amber-300">Recent Forecast Review & Learning Signals</h3>
          {forecast.reasons.map((reason) => <p key={reason}>{reason}</p>)}
          <p className="text-slate-600 dark:text-slate-400">
            These are data-based signals, not proof of cause. Model weights update as actual outcomes become available.
          </p>
        </div>
      )}

      {forecast.recent_forecast_outcomes && forecast.recent_forecast_outcomes.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-white mb-1">Recent Prediction vs Actual</h3>
          <p className="text-xs text-slate-400 mb-3">
            Difference = predicted minus actual. Explanations combine component-model comparisons with station remarks and each station&apos;s change from its prior 7-day average. Remarks are recorded context, not independently verified causes.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950/70 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3">Actual Date</th>
                  <th className="py-3 px-3 text-right">Actual Sales</th>
                  <th className="py-3 px-3 text-right">Predicted Sales</th>
                  <th className="py-3 px-3 text-right">Difference (Pred − Actual)</th>
                  <th className="py-3 px-3 text-right">Error</th>
                  <th className="py-3 px-3">Why It May Have Missed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {forecast.recent_forecast_outcomes.map((outcome) => (
                  <tr key={outcome.date} className="align-top hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-medium text-white whitespace-nowrap">{outcome.date}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300">{exactLitres(outcome.actual)} L</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300">{exactLitres(outcome.predicted)} L</td>
                    <td className={`py-3 px-3 text-right font-mono ${outcome.difference > 0 ? 'text-rose-400' : outcome.difference < 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {outcome.difference > 0 ? '+' : ''}{exactLitres(outcome.difference)} L
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-300 whitespace-nowrap">
                      {Math.abs(outcome.difference_pct).toFixed(1)}% {outcome.difference > 0 ? 'over' : outcome.difference < 0 ? 'under' : 'match'}
                    </td>
                    <td className="py-3 px-3 min-w-72 text-slate-400">
                      {outcome.explanation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Model Accuracy Comparison Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-slate-900/80 border border-indigo-500/30 rounded-xl p-4 shadow-sm bg-linear-to-b from-indigo-950/20 to-transparent">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-indigo-300">Ensemble (Active)</span>
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {accuracy === null ? '—' : `${accuracy.toFixed(1)}%`}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Walk-forward accuracy; {forecast.backtest_days ?? 0} scored day(s)
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-300">Holt-Winters Exp Smoothing</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-200">{formatMape(forecast.mape_holt_winters)}</div>
          <p className="text-[11px] text-slate-400 mt-1">Level, trend, and weekly seasonality smoothing</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-300">Linear Regression</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-200">{formatMape(forecast.mape_linear)}</div>
          <p className="text-[11px] text-slate-400 mt-1">Leak-free trend and calendar feature regression</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-400">Baseline Naive</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-400">{formatMape(forecast.mape_naive)}</div>
          <p className="text-[11px] text-slate-500 mt-1">Same day previous week baseline</p>
        </div>

        <div className={`bg-slate-900/80 border rounded-xl p-4 shadow-sm ${forecast.gradient_boosting_active ? 'border-emerald-500/30' : 'border-slate-800'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-300">Gradient Boosting Trial</span>
            <span className={`text-[10px] ${forecast.gradient_boosting_active ? 'text-emerald-400' : 'text-amber-400'}`}>
              {forecast.gradient_boosting_active ? 'Promoted' : 'Benchmark only'}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-200">
            {formatMape(forecast.models_metrics?.gradient_boosting?.mape ?? null)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Standalone walk-forward MAPE. 20% blend: {formatMape(forecast.models_metrics?.gradient_boosting_blend?.mape ?? null)}.
            Promotion requires ≥5% better blended MAPE and wins on ≥60% of at least 14 days.
          </p>
        </div>
      </div>

      {/* 7-Day Day-by-Day Forecast Table with Confidence Ranges */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-orange-400" />
          <span>Daily Forward Projections & Estimated Ranges</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/70 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Forecast Date</th>
                <th className="py-3 px-4">Day of Week</th>
                <th className="py-3 px-4 text-right">Predicted Demand</th>
                <th className="py-3 px-4 text-center">Estimated Range (Lower - Upper)</th>
                <th className="py-3 px-4 text-right">Linear Model</th>
                <th className="py-3 px-4 text-right">Holt-Winters</th>
                <th className="py-3 px-4 text-right">Gradient Boosting Trial</th>
                <th className="py-3 px-4">Visual Band</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {forecast.forecast.map((f, idx) => {
                const pct = ((f.predicted_qty - minVal) / (maxVal - minVal || 1)) * 100;
                const lowerPct = ((f.lower_bound - minVal) / (maxVal - minVal || 1)) * 100;
                const upperPct = ((f.upper_bound - minVal) / (maxVal - minVal || 1)) * 100;

                return (
                  <tr key={f.date} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] text-slate-400 flex items-center justify-center font-sans">
                        +{idx + 1}
                      </span>
                      <span>{f.date}</span>
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-300 font-medium">
                      {f.day_name}
                      {(f.day_name === 'Sunday' || f.day_name === 'Saturday') && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-sans">
                          Weekend
                        </span>
                      )}
                      {f.festival_name && (
                        <span className="ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-sans">
                          {f.festival_name}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-indigo-300 text-sm">
                      {exactLitres(f.predicted_qty)} L
                    </td>
                    <td className="py-3 px-4 text-center text-slate-400">
                      [{exactLitres(f.lower_bound)} — {exactLitres(f.upper_bound)}] L
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">
                      {exactLitres(f.linear_pred)} L
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">
                      {exactLitres(f.holt_winters_pred)} L
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">
                      {exactLitres(f.gradient_boosting_pred)} L
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-32 bg-slate-950 rounded-full h-2 relative overflow-hidden">
                        <div
                          className="absolute h-full bg-indigo-500/40"
                          style={{
                            left: `${Math.max(0, lowerPct)}%`,
                            width: `${Math.min(100, upperPct - lowerPct)}%`,
                          }}
                        />
                        <div
                          className="absolute top-0 bottom-0 w-1 bg-indigo-400"
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
      <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-400 space-y-1.5">
        <div className="flex items-center gap-2 text-slate-300 font-semibold mb-1">
          <Info className="w-4 h-4 text-orange-400" />
          <span>Forecasting Methodology & Ground Truth Validation</span>
        </div>
        <p>
          • <strong>Seasonality Adjustment:</strong> Saturdays and Sundays feature a +6% to +8% demand multiplier reflecting commercial AutoLPG taxi and intra-city transit consumption curves.
        </p>
        <p>
          • <strong>Walk-forward validation:</strong> Each scored day is predicted using only earlier observations. Accuracy is 100% minus validation MAPE and is not a guarantee of future performance.
        </p>
      </div>
    </div>
  );
};
