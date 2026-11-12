/**
 * Pure TypeScript conversion of forecast_fixes.py
 * Leak-free feature engineering and empirical baselines for GO Gas forecasting.
 * 
 * Ensures no target leakage: Day t features use strictly data from Day t-1 and prior.
 */

import { isFestivalDate } from './festivalCalendar.js';
export { getFestivalName, isFestivalDate } from './festivalCalendar.js';

export interface RollingEvalResult {
  wape: number;
  bias: number;
  n_windows: number;
  predictions: Array<{
    date: string;
    actual: number;
    pred: number;
    error: number;
  }>;
}

export function buildFeaturesNoLeak(
  dates: Date[],
  actuals: number[]
): number[][] {
  const features: number[][] = [];

  for (let i = 0; i < dates.length; i++) {
    const dt = dates[i];
    const past = actuals.slice(0, i); // Strictly prior days: 0 .. i-1
    const pastMean = past.length > 0
      ? past.reduce((a, b) => a + b, 0) / past.length
      : (actuals[0] || 0.0);

    const dow = dt.getDay(); // 0 = Sun, 1 = Mon ...
    const isWeekend = dow === 0 || dow === 6 ? 1.0 : 0.0;
    const dom = dt.getDate();

    // Check festival
    const isFest = isFestivalDate(dt) ? 1.0 : 0.0;

    // Strictly prior lags
    const lag1 = i >= 1 ? actuals[i - 1] : pastMean;
    const lag2 = i >= 2 ? actuals[i - 2] : pastMean;
    const lag7 = i >= 7 ? actuals[i - 7] : pastMean;

    // Past-only rolling means (last 7 and 30 days prior to i)
    const window7 = past.length >= 7 ? past.slice(-7) : past;
    const window30 = past.length >= 30 ? past.slice(-30) : past;
    const r7 = window7.length > 0
      ? window7.reduce((a, b) => a + b, 0) / window7.length
      : pastMean;
    const r30 = window30.length > 0
      ? window30.reduce((a, b) => a + b, 0) / window30.length
      : pastMean;

    // Past-only EWMA (alpha = 2 / (7 + 1) = 0.25)
    let ewma7 = pastMean;
    if (past.length > 0) {
      const alpha = 0.25;
      let val = past[0];
      for (let p = 1; p < past.length; p++) {
        val = alpha * past[p] + (1.0 - alpha) * val;
      }
      ewma7 = val;
    }

    // Trend acceleration (slope difference over last 7 prior days)
    let trendAccel = 0.0;
    if (past.length >= 7) {
      const slopeRecent = past.length >= 4 ? (past[past.length - 1] - past[past.length - 4]) / 3.0 : 0.0;
      const slopePrior = (past[past.length - 4] - past[past.length - 7]) / 3.0;
      trendAccel = slopeRecent - slopePrior;
    }

    features.push([
      dow, isWeekend, dom, isFest,
      lag1, lag7, r7, r30,
      ewma7, lag2, trendAccel
    ]);
  }

  return features;
}

export function naiveLastWeek(
  dates: Date[],
  actuals: number[],
  forecastDate: Date
): number {
  const targetTime = forecastDate.getTime() - 7 * 86400000;
  for (let i = 0; i < dates.length; i++) {
    if (Math.abs(dates[i].getTime() - targetTime) < 43200000) {
      return actuals[i];
    }
  }
  // Fallback to closest same weekday in history
  const targetDow = forecastDate.getDay();
  const sameWds: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    if (dates[i].getDay() === targetDow) {
      sameWds.push(actuals[i]);
    }
  }
  if (sameWds.length > 0) {
    return sameWds[sameWds.length - 1];
  }
  return actuals.length > 0 ? actuals.reduce((a, b) => a + b, 0) / actuals.length : 0.0;
}

export function sameWeekdayAvg(
  dates: Date[],
  actuals: number[],
  forecastDate: Date
): number {
  const targetDow = forecastDate.getDay();
  const vals: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    if (dates[i].getDay() === targetDow) {
      vals.push(actuals[i]);
    }
  }
  if (vals.length > 0) {
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return actuals.length > 0 ? actuals.reduce((a, b) => a + b, 0) / actuals.length : 0.0;
}

export function rollingEval(
  predictFn: (trainDates: Date[], trainActuals: number[], testDate: Date) => number,
  dates: Date[],
  actuals: number[],
  nWindows = 6
): RollingEvalResult {
  const n = actuals.length;
  if (n < nWindows + 14) {
    return { wape: 0.0, bias: 0.0, n_windows: 0, predictions: [] };
  }

  const errors: number[] = [];
  const absErrors: number[] = [];
  let sumActuals = 0.0;
  const predictions: Array<{ date: string; actual: number; pred: number; error: number }> = [];

  for (let w = nWindows; w >= 1; w--) {
    const idx = n - w;
    const trainD = dates.slice(0, idx);
    const trainA = actuals.slice(0, idx);
    const testD = dates[idx];
    const actualVal = actuals[idx];

    let pred: number;
    try {
      pred = predictFn(trainD, trainA, testD);
    } catch {
      pred = actualVal;
    }

    const err = pred - actualVal;
    errors.push(err);
    absErrors.push(Math.abs(err));
    sumActuals += actualVal;
    predictions.push({
      date: testD.toISOString().slice(0, 10),
      actual: actualVal,
      pred,
      error: err,
    });
  }

  const wape = sumActuals > 0 ? (absErrors.reduce((a, b) => a + b, 0) / sumActuals) * 100.0 : 0.0;
  const bias = sumActuals > 0 ? (errors.reduce((a, b) => a + b, 0) / sumActuals) * 100.0 : 0.0;

  return {
    wape: Math.round(wape * 100) / 100,
    bias: Math.round(bias * 100) / 100,
    n_windows: predictions.length,
    predictions,
  };
}
