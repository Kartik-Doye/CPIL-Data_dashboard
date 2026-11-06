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

test('historical forecast outcomes adapt ensemble weights after enough evaluations', () => {
  const history = makeHistory(35, index => 100 + (index % 7) * 10 + index);
  const recentOnly = generateForecast(history, 7);
  const adapted = generateForecast(history, 7, undefined, {
    sample_count: 12,
    mape: {
      linear: 100,
      holt_winters: 1,
      naive_last_week: 1,
      same_weekday_avg: 1,
    },
  });

  assert.ok((adapted.weights?.linear ?? 0) < (recentOnly.weights?.linear ?? 0));
  assert.match(adapted.learning_status || '', /12/);
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
