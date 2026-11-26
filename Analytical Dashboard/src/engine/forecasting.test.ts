import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateForecast, generateStateForecasts } from './forecasting.js';
import { getFestivalEntry, getFestivalName, isFestivalDate } from './festivalCalendar.js';
import { buildFeaturesNoLeak } from './forecastFixes.js';

function makeHistory(days: number, sale: (index: number) => number) {
  return Array.from({ length: days }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    sale_qty: sale(index),
  }));
}

test('generates separate state forecasts and marks states with too little history', () => {
  const history = makeHistory(8, index => 100 + (index % 7) * 10 + index);
  const stateForecasts = generateStateForecasts([
    ...history.map(({ date, sale_qty }) => ({ state: 'Alpha', date, sale_qty })),
    { state: 'Alpha', date: history[0].date, sale_qty: 50 },
    ...history.slice(0, 6).map(({ date, sale_qty }) => ({ state: 'Beta', date, sale_qty })),
  ]);
  const alpha = stateForecasts.find(state => state.state === 'Alpha');
  const beta = stateForecasts.find(state => state.state === 'Beta');

  assert.ok(alpha);
  assert.equal(alpha.days_available, 8);
  assert.equal(alpha.insufficient, false);
  assert.equal(alpha.forecast.length, 7);
  assert.ok(alpha.predicted_total_7d > 0);
  assert.ok(alpha.mape_ensemble !== null);
  assert.ok(beta);
  assert.equal(beta.insufficient, true);
  assert.equal(beta.days_available, 6);
  assert.equal(beta.forecast.length, 0);
  assert.equal(beta.mape_ensemble, null);
});

test('reports walk-forward metrics only when historical test days are available', () => {
  const result = generateForecast(makeHistory(35, index => 100 + (index % 7) * 10 + index), 7);

  assert.equal(result.backtest_days, 28);
  assert.equal(result.backtest_diagnostics?.first_scored_date, '2026-01-08');
  assert.equal(result.backtest_diagnostics?.last_scored_date, '2026-02-04');
  assert.ok(Number.isFinite(result.backtest_diagnostics?.ensemble_wape));
  assert.ok(Number.isFinite(result.backtest_diagnostics?.ensemble_bias));
  assert.ok(Number.isFinite(result.backtest_diagnostics?.naive_last_week_wape));
  assert.ok(Number.isFinite(result.backtest_diagnostics?.same_weekday_3wk_wape));
  assert.ok(Number.isFinite(result.backtest_diagnostics?.model_wape.linear));
  assert.ok(Number.isFinite(result.backtest_diagnostics?.model_wape.holt_winters));
  assert.ok(Number.isFinite(result.backtest_diagnostics?.model_wape.gradient_boosting));
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

test('uses exact calendar dates for festival feature values without recurring them yearly', () => {
  const festivalDate = new Date('2026-11-08T00:00:00Z');
  const ordinaryDate = new Date('2026-11-09T00:00:00Z');

  assert.equal(getFestivalName(festivalDate), 'Diwali & Lakshmi Puja');
  assert.equal(getFestivalEntry(new Date('2026-11-06T00:00:00Z'))?.note, 'Approximate / regional variant');
  assert.equal(isFestivalDate(ordinaryDate), false);
  assert.equal(getFestivalName(new Date('2027-11-08T00:00:00Z')), undefined);
  assert.equal(buildFeaturesNoLeak([festivalDate, ordinaryDate], [100, 100])[0][3], 1);
  assert.equal(buildFeaturesNoLeak([festivalDate, ordinaryDate], [100, 100])[1][3], 0);
});

test('flags festival forecasts and widens their estimated range', () => {
  const lastDate = Date.UTC(2026, 10, 5);
  const history = Array.from({ length: 35 }, (_, index) => {
    const date = new Date(lastDate - (34 - index) * 86400000);
    return {
      date: date.toISOString().slice(0, 10),
      sale_qty: 200 + (index % 7) * 15 + index,
    };
  });
  const result = generateForecast(history, 7);
  const diwali = result.forecast.find((point) => point.date === '2026-11-08');
  const ordinaryDay = result.forecast.find((point) => point.date === '2026-11-07');

  assert.equal(diwali?.festival_name, 'Diwali & Lakshmi Puja');
  assert.ok(diwali && ordinaryDay);
  assert.ok(diwali.p90 - diwali.p10 > ordinaryDay.p90 - ordinaryDay.p10);
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

test('uses all historical days in the database rather than capping walk-forward evaluation at 28 days', () => {
  const history = makeHistory(90, index => 1000 + (index % 7) * 50 + index * 2);
  const result = generateForecast(history, 7);

  assert.equal(result.days_available, 90);
  assert.equal(result.backtest_days, 83);
  assert.equal(result.backtest_diagnostics?.first_scored_date, '2026-01-08');
  assert.equal(result.backtest_diagnostics?.last_scored_date, '2026-03-31');
});

test('populates 10-day actual vs predicted differences from latest date backwards and learns adaptively from recent errors', () => {
  // First 35 days follow base level, last 10 days step up by +30% so models initially under-predict
  const history = makeHistory(45, index => {
    const base = 1000 + (index % 7) * 40;
    return index >= 35 ? Math.round(base * 1.3) : base;
  });

  const result = generateForecast(history, 7);

  assert.ok(result.recent_forecast_outcomes);
  assert.equal(result.recent_forecast_outcomes.length, 10);
  // Latest historical date should be first (index 0)
  assert.equal(result.recent_forecast_outcomes[0].date, history[history.length - 1].date);
  assert.equal(result.recent_forecast_outcomes[9].date, history[history.length - 10].date);

  for (const outcome of result.recent_forecast_outcomes) {
    assert.equal(outcome.difference, Number((outcome.predicted - outcome.actual).toFixed(2)));
    assert.ok(Number.isFinite(outcome.difference_pct));
  }

  assert.ok(result.adaptive_learning);
  assert.equal(result.adaptive_learning.window_days, 10);
  // Since actuals jumped +30% in the last 10 days, raw predictions were lower than actuals (negative bias),
  // so the adaptive engine should learn a positive upward adjustment for the next day.
  assert.ok((result.adaptive_learning.next_day_adjustment_litres ?? 0) > 0);
  assert.ok((result.forecast[0].adaptive_adjustment_litres ?? 0) > 0);
  assert.ok(result.forecast[0].predicted_qty > (result.forecast[0].raw_ensemble ?? 0));
});

test('learns Saturday and Sunday sales drops relative to Mon-Fri weekdays and predicts lower weekend demand', () => {
  // Build 42 days where Mon-Fri sales are ~2000 L and Saturday/Sunday drop by ~25% (~1500 L)
  const history = Array.from({ length: 42 }, (_, index) => {
    const dt = new Date(Date.UTC(2026, 0, index + 1));
    const dow = dt.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    return {
      date: dt.toISOString().slice(0, 10),
      sale_qty: isWeekend ? 1500 + (index % 3) * 10 : 2000 + (index % 5) * 15,
    };
  });

  const result = generateForecast(history, 7);

  assert.ok(result.adaptive_learning);
  assert.ok((result.adaptive_learning.saturday_dip_pct ?? 0) < -10);
  assert.ok((result.adaptive_learning.sunday_dip_pct ?? 0) < -10);

  const weekendForecasts = result.forecast.filter(
    (f) => f.day_name === 'Saturday' || f.day_name === 'Sunday',
  );
  const weekdayForecasts = result.forecast.filter(
    (f) => f.day_name !== 'Saturday' && f.day_name !== 'Sunday',
  );
  assert.ok(weekendForecasts.length >= 2);
  assert.ok(weekdayForecasts.length >= 4);

  const avgWeekendPred =
    weekendForecasts.reduce((s, f) => s + f.predicted_qty, 0) / weekendForecasts.length;
  const avgWeekdayPred =
    weekdayForecasts.reduce((s, f) => s + f.predicted_qty, 0) / weekdayForecasts.length;

  // Saturday & Sunday predictions must clearly drop below Mon-Fri weekday predictions
  assert.ok(avgWeekendPred < avgWeekdayPred * 0.85);
});



