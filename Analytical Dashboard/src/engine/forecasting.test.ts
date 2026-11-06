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
