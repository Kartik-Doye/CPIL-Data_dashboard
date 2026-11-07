import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateForecast } from './forecasting.js';

function makeHistory(days: number, sale: (index: number) => number) {
  return Array.from({ length: days }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    sale_qty: sale(index),
  }));
}

test('reports walk-forward metrics only when historical test days are available', () => {
  const result = generateForecast(makeHistory(35, index => 100 + (index % 7) * 10 + index), 7);

  assert.equal(result.backtest_days, 28);
  assert.notEqual(result.mape_ensemble, null);
  assert.ok(Number.isFinite(result.mape_ensemble));
  assert.equal(result.models_metrics?.linear.mape, result.mape_linear);
  assert.ok(result.models_metrics?.linear.rmse !== null);
  assert.ok(Number.isFinite(result.models_metrics?.gradient_boosting.mape));
  assert.ok(Number.isFinite(result.forecast[0].gradient_boosting_pred));
});

test('keeps gradient boosting in benchmark mode until the minimum walk-forward sample size', () => {
  const result = generateForecast(makeHistory(20, index => 100 + (index % 7) * 8 + index), 7);

  assert.equal(result.backtest_days, 13);
  assert.equal(result.gradient_boosting_active, false);
  assert.ok(result.insights?.some(insight => /remains a trial candidate/.test(insight)));
});

test('does not present a fabricated accuracy when there are no holdout days', () => {
  const result = generateForecast(makeHistory(7, () => 100), 7);

  assert.equal(result.backtest_days, 0);
  assert.equal(result.mape_ensemble, null);
  assert.equal(result.models_metrics?.linear.rmse, null);
});

test('excludes zero-sales days from percentage accuracy rather than claiming perfect accuracy', () => {
  const result = generateForecast(makeHistory(20, () => 0), 7);

  assert.equal(result.backtest_days, 0);
  assert.equal(result.mape_ensemble, null);
});

test('historical forecast outcomes begin adapting ensemble weights with the first evaluation', () => {
  const history = makeHistory(35, index => 100 + (index % 7) * 10 + index);
  const recentOnly = generateForecast(history, 7);
  const adapted = generateForecast(history, 7, undefined, {
    sample_count: 1,
    mape: {
      linear: 100,
      holt_winters: 1,
      naive_last_week: 1,
      same_weekday_avg: 1,
    },
  });

  assert.ok((adapted.weights?.linear ?? 0) < (recentOnly.weights?.linear ?? 0));
  assert.match(adapted.learning_status || '', /1 saved forecast outcome/);
});

test('explains recent forecast misses using actual outcomes and model comparisons', () => {
  const result = generateForecast(makeHistory(35, index => 100 + (index % 7) * 10 + index), 7, undefined, {
    sample_count: 2,
    mape: { linear: 10, holt_winters: 20, naive_last_week: 30, same_weekday_avg: 25 },
    recent_outcomes: [
      {
        target_date: '2026-02-01',
        predicted_ensemble: 150,
        predicted_linear: 100,
        predicted_holt_winters: 120,
        predicted_naive: 130,
        predicted_weekday: 125,
        actual_sale_qty: 100,
        station_remark_signals: [{
          station_name: 'Sample Station',
          erp_code: 'ST001',
          sale_qty: 100,
          prior_7d_avg: 150,
          change_litres: -50,
          remark: 'Supply interruption reported',
        }],
      },
      {
        target_date: '2026-02-02',
        predicted_ensemble: 150,
        predicted_linear: 100,
        predicted_holt_winters: 120,
        predicted_naive: 130,
        predicted_weekday: 125,
        actual_sale_qty: 100,
      },
    ],
  });

  assert.match(result.reasons?.[0] || '', /average absolute error was 50\.0%; it overforecast on 2 day\(s\)/);
  assert.match(result.reasons?.[1] || '', /Best-performing model .* linear \(0\.0% MAPE\)/);
  assert.equal(result.recent_forecast_outcomes?.[0].difference, 50);
  assert.equal(result.recent_forecast_outcomes?.[0].difference_pct, 50);
  assert.equal(result.recent_forecast_outcomes?.[0].closest_model, 'linear');
  assert.match(result.recent_forecast_outcomes?.[0].explanation || '', /overforecast by 50\.0%/);
  assert.match(result.recent_forecast_outcomes?.[0].explanation || '', /Supply interruption reported/);
  assert.match(result.recent_forecast_outcomes?.[0].explanation || '', /Sample Station \(ST001\) sold 50 L below its prior 7-day average/);
});

test('historical overprediction bias is damped for the matching forecast horizon', () => {
  const history = makeHistory(35, index => 100 + (index % 7) * 10 + index);
  const persistedErrors = {
    sample_count: 12,
    mape: {
      linear: 10,
      holt_winters: 10,
      naive_last_week: 10,
      same_weekday_avg: 10,
    },
  };
  const historicalWeightsOnly = generateForecast(history, 7, undefined, persistedErrors);
  const biasCorrected = generateForecast(history, 7, undefined, {
    ...persistedErrors,
    ensemble_bias_pct_by_horizon: { 1: 0.2 },
  });

  assert.ok(biasCorrected.forecast[0].predicted_qty < historicalWeightsOnly.forecast[0].predicted_qty);
  assert.ok(Number.isFinite(biasCorrected.forecast[1].predicted_qty));
});
