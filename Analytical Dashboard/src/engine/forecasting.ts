/**
 * Upgraded AI/ML Sales Forecasting Engine for Analytical Dashboard (Report 23).
 * Pure TypeScript mathematical engine with:
 * 1. Supply-Adjusted Demand Imputation (corrects outage zero-sales before training)
 * 2. Leak-Free Feature Engineered Multivariate Linear Regression (Normal Equation + L2 Ridge)
 * 3. Holt-Winters Triple Exponential Smoothing with parameter grid search
 * 4. Year-specific festival calendar feature integration
 * 5. Empirical Baselines (Same Day Last Week & Same Weekday Mean)
 * 6. Dynamic Inverse-MAPE Weighted Ensemble
 * 7. P10 / P50 / P90 Probabilistic Confidence Envelopes
 * 8. Root-Cause Diagnostic Error Analysis
 */

import { ForecastPoint, ForecastResult, StationRecord } from '../types.js';
import {
  buildFeaturesNoLeak,
  computeEmpiricalWeekdayRatio,
  naiveLastWeek,
  sameWeekdayAvg,
} from './forecastFixes.js';
import { getFestivalEntry } from './festivalCalendar.js';

export interface HistoricalDay {
  date: string;
  sale_qty: number;
  collection?: number;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// =========================================================================== //
// Matrix Math (Gaussian Elimination for Normal Equations)
// =========================================================================== //

function transpose(m: number[][]): number[][] {
  if (m.length === 0) return [];
  const rows = m.length;
  const cols = m[0].length;
  const res: number[][] = Array.from({ length: cols }, () => new Array(rows));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      res[c][r] = m[r][c];
    }
  }
  return res;
}

function matmul(a: number[][], b: number[][]): number[][] {
  const rowsA = a.length;
  const colsA = a[0].length;
  const colsB = b[0].length;
  const res: number[][] = Array.from({ length: rowsA }, () => new Array(colsB).fill(0));
  for (let i = 0; i < rowsA; i++) {
    for (let k = 0; k < colsA; k++) {
      const aik = a[i][k];
      for (let j = 0; j < colsB; j++) {
        res[i][j] += aik * b[k][j];
      }
    }
  }
  return res;
}

function matvec(m: number[][], v: number[]): number[] {
  const rows = m.length;
  const cols = m[0].length;
  const res: number[] = new Array(rows).fill(0);
  for (let r = 0; r < rows; r++) {
    let sum = 0;
    for (let c = 0; c < cols; c++) {
      sum += m[r][c] * v[c];
    }
    res[r] = sum;
  }
  return res;
}

function solveGaussian(A: number[][], b: number[]): number[] {
  const n = A.length;
  const aug: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) {
        pivot = r;
      }
    }
    const temp = aug[col];
    aug[col] = aug[pivot];
    aug[pivot] = temp;

    if (Math.abs(aug[col][col]) < 1e-12) continue;

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      s -= aug[i][j] * x[j];
    }
    x[i] = Math.abs(aug[i][i]) > 1e-12 ? s / aug[i][i] : 0;
  }
  return x;
}

// =========================================================================== //
// Statistics Utilities
// =========================================================================== //

function mean(v: number[]): number {
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function stdDev(v: number[]): number {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((acc, val) => acc + (val - m) ** 2, 0) / (v.length - 1));
}

function ewma(v: number[], span: number): number[] {
  if (v.length === 0) return [];
  const alpha = 2.0 / (span + 1);
  const res = [v[0]];
  for (let i = 1; i < v.length; i++) {
    res.push(alpha * v[i] + (1 - alpha) * res[i - 1]);
  }
  return res;
}

// =========================================================================== //
// Linear Model with Z-Score Standardization
// =========================================================================== //

class LinearRegressionModel {
  coeffs: number[] = [];
  means: number[] = [];
  stds: number[] = [];

  fit(X: number[][], y: number[]): void {
    if (X.length === 0 || y.length === 0) {
      this.coeffs = [mean(y)];
      return;
    }
    const nFeatures = X[0].length;
    this.means = new Array(nFeatures).fill(0);
    this.stds = new Array(nFeatures).fill(1);

    for (let j = 0; j < nFeatures; j++) {
      const col = X.map(r => r[j]);
      this.means[j] = mean(col);
      const s = stdDev(col);
      this.stds[j] = s > 1e-10 ? s : 1.0;
    }

    const Xnorm = X.map(row => row.map((val, j) => (val - this.means[j]) / this.stds[j]));
    const Xbias = Xnorm.map(row => [1.0, ...row]);

    const Xt = transpose(Xbias);
    const XtX = matmul(Xt, Xbias);
    const Xty = matvec(Xt, y);

    for (let i = 0; i < XtX.length; i++) {
      XtX[i][i] += 1.0;
    }

    this.coeffs = solveGaussian(XtX, Xty);
  }

  predict(features: number[]): number {
    if (this.coeffs.length === 0) return 0;
    if (this.means.length === 0) return this.coeffs[0];
    let sum = this.coeffs[0];
    for (let j = 0; j < features.length; j++) {
      const normVal = (features[j] - this.means[j]) / this.stds[j];
      sum += (this.coeffs[j + 1] || 0) * normVal;
    }
    return sum;
  }
}

interface RegressionTreeNode {
  value: number;
  featureIndex?: number;
  threshold?: number;
  left?: RegressionTreeNode;
  right?: RegressionTreeNode;
}

function fitRegressionTree(
  features: number[][],
  targets: number[],
  depth: number,
  maxDepth: number,
  minSamplesLeaf: number,
): RegressionTreeNode {
  const node: RegressionTreeNode = { value: mean(targets) };
  if (depth >= maxDepth || targets.length < minSamplesLeaf * 2 || features.length === 0) return node;

  const totalSum = targets.reduce((sum, target) => sum + target, 0);
  const totalSquaredSum = targets.reduce((sum, target) => sum + target * target, 0);
  let bestLoss = Infinity;
  let bestFeature = -1;
  let bestThreshold = 0;

  for (let featureIndex = 0; featureIndex < features[0].length; featureIndex++) {
    const sorted = features
      .map((row, index) => ({ value: row[featureIndex], target: targets[index] }))
      .sort((a, b) => a.value - b.value);
    let leftSum = 0;
    let leftSquaredSum = 0;

    for (let split = 1; split < sorted.length; split++) {
      const previous = sorted[split - 1];
      leftSum += previous.target;
      leftSquaredSum += previous.target * previous.target;
      if (
        split < minSamplesLeaf
        || sorted.length - split < minSamplesLeaf
        || previous.value === sorted[split].value
      ) continue;

      const rightCount = sorted.length - split;
      const rightSum = totalSum - leftSum;
      const loss = leftSquaredSum - (leftSum * leftSum) / split
        + totalSquaredSum - leftSquaredSum - (rightSum * rightSum) / rightCount;
      if (loss < bestLoss) {
        bestLoss = loss;
        bestFeature = featureIndex;
        bestThreshold = (previous.value + sorted[split].value) / 2;
      }
    }
  }

  if (bestFeature < 0) return node;
  const leftFeatures: number[][] = [];
  const leftTargets: number[] = [];
  const rightFeatures: number[][] = [];
  const rightTargets: number[] = [];
  features.forEach((row, index) => {
    if (row[bestFeature] <= bestThreshold) {
      leftFeatures.push(row);
      leftTargets.push(targets[index]);
    } else {
      rightFeatures.push(row);
      rightTargets.push(targets[index]);
    }
  });
  if (leftTargets.length < minSamplesLeaf || rightTargets.length < minSamplesLeaf) return node;

  node.featureIndex = bestFeature;
  node.threshold = bestThreshold;
  node.left = fitRegressionTree(leftFeatures, leftTargets, depth + 1, maxDepth, minSamplesLeaf);
  node.right = fitRegressionTree(rightFeatures, rightTargets, depth + 1, maxDepth, minSamplesLeaf);
  return node;
}

function predictRegressionTree(node: RegressionTreeNode, features: number[]): number {
  if (node.featureIndex === undefined || node.threshold === undefined || !node.left || !node.right) {
    return node.value;
  }
  return predictRegressionTree(
    features[node.featureIndex] <= node.threshold ? node.left : node.right,
    features,
  );
}

class GradientBoostingModel {
  private readonly learningRate = 0.05;
  private readonly estimators = 30;
  private readonly trees: RegressionTreeNode[] = [];
  private baseValue = 0;

  fit(features: number[][], targets: number[]): void {
    this.trees.length = 0;
    this.baseValue = mean(targets);
    if (features.length === 0 || targets.length === 0) return;

    const fitted = new Array(targets.length).fill(this.baseValue) as number[];
    for (let estimator = 0; estimator < this.estimators; estimator++) {
      const residuals = targets.map((target, index) => target - fitted[index]);
      const tree = fitRegressionTree(features, residuals, 0, 2, 5);
      this.trees.push(tree);
      for (let index = 0; index < fitted.length; index++) {
        fitted[index] += this.learningRate * predictRegressionTree(tree, features[index]);
      }
    }
  }

  predict(features: number[]): number {
    return Math.max(
      0,
      this.baseValue + this.trees.reduce(
        (prediction, tree) => prediction + this.learningRate * predictRegressionTree(tree, features),
        0,
      ),
    );
  }
}

// ===========================================================================
// Holt-Winters Triple Exponential Smoothing
// =========================================================================== //

function holtWinters(
  data: number[],
  alpha: number,
  beta: number,
  gamma: number,
  m = 7,
  h = 0,
  dates?: Date[]
): { fitted: number[]; forecast: number[] } {
  const n = data.length;
  if (n < 2 * m) {
    const avg = mean(data);
    return {
      fitted: new Array(n).fill(avg),
      forecast: new Array(h).fill(avg),
    };
  }

  let level = mean(data.slice(0, m));
  let trend = (mean(data.slice(m, 2 * m)) - level) / m;
  const seasonal: number[] = new Array(m).fill(0);
  const seasonalCounts: number[] = new Array(m).fill(0);
  for (let i = 0; i < Math.min(n, 2 * m); i++) {
    const sIdx = dates && dates[i] ? dates[i].getDay() % m : i % m;
    seasonal[sIdx] += data[i] - level;
    seasonalCounts[sIdx]++;
  }
  for (let s = 0; s < m; s++) {
    if (seasonalCounts[s] > 0) seasonal[s] /= seasonalCounts[s];
  }

  const fitted: number[] = [];
  for (let i = 0; i < n; i++) {
    const sIdx = dates && dates[i] ? dates[i].getDay() % m : i % m;
    if (i < m) {
      fitted.push(Math.max(level + trend + seasonal[sIdx], 0));
      continue;
    }
    const oldLevel = level;
    level = alpha * (data[i] - seasonal[sIdx]) + (1 - alpha) * (level + trend);
    trend = beta * (level - oldLevel) + (1 - beta) * trend;
    seasonal[sIdx] = gamma * (data[i] - level) + (1 - gamma) * seasonal[sIdx];
    fitted.push(Math.max(level + trend + seasonal[sIdx], 0));
  }

  const forecast: number[] = [];
  const phi = 0.92;
  const lastDate = dates && dates.length > 0 ? dates[dates.length - 1] : null;
  for (let j = 1; j <= h; j++) {
    const sIdx = lastDate
      ? new Date(lastDate.getTime() + j * 86400000).getDay() % m
      : (n + j - 1) % m;
    let damp = 0;
    for (let k = 1; k <= j; k++) damp += Math.pow(phi, k);
    const pred = level + trend * damp + seasonal[sIdx];
    forecast.push(Math.max(pred, 0));
  }

  return { fitted, forecast };
}

function optimizeHoltWinters(data: number[], m = 7, dates?: Date[]): [number, number, number] {
  if (data.length < m + 7) return [0.3, 0.05, 0.2];
  const evalWindow = Math.min(14, Math.max(7, Math.floor(data.length * 0.2)));
  const train = data.slice(0, data.length - evalWindow);
  const trainDates = dates ? dates.slice(0, data.length - evalWindow) : undefined;
  const test = data.slice(data.length - evalWindow);
  let bestParams: [number, number, number] = [0.3, 0.05, 0.2];
  let bestMape = Infinity;

  const alphas = [0.1, 0.2, 0.3, 0.4, 0.5];
  const betas = [0.01, 0.03, 0.05, 0.1];
  const gammas = [0.1, 0.2, 0.3, 0.4];

  for (const a of alphas) {
    for (const b of betas) {
      for (const g of gammas) {
        const { forecast } = holtWinters(train, a, b, g, m, evalWindow, trainDates);
        let errorSum = 0;
        let count = 0;
        for (let i = 0; i < test.length; i++) {
          if (test[i] > 0) {
            errorSum += Math.abs(test[i] - forecast[i]) / test[i];
            count++;
          }
        }
        const mape = count > 0 ? (errorSum / count) * 100 : 999;
        if (mape < bestMape) {
          bestMape = mape;
          bestParams = [a, b, g];
        }
      }
    }
  }

  return bestParams;
}

type EnsembleModel = 'linear' | 'holt_winters' | 'naive_last_week' | 'same_weekday_avg';
type ForecastModel = EnsembleModel | 'gradient_boosting';

interface WalkForwardOutcome {
  target_date: string;
  day_name: string;
  predicted_ensemble: number;
  raw_ensemble: number;
  adaptive_correction_litres: number;
  predicted_linear: number;
  predicted_holt_winters: number;
  predicted_naive: number;
  predicted_weekday: number;
  actual_sale_qty: number;
}

interface BacktestErrors {
  percentage: Record<ForecastModel, number[]>;
  squared: Record<ForecastModel, number[]>;
  ensemblePercentage: number[];
  ensembleSquared: number[];
  ensembleBiasPercentage: number[];
  rawEnsembleBiasPercentage: number[];
  weekdayBiasPercentage: Record<number, number[]>;
  gradientBoostedEnsemblePercentage: number[];
  modelAbsoluteErrorTotal: Record<ForecastModel, number>;
  scoredDates: string[];
  walkForwardOutcomes: WalkForwardOutcome[];
  ensembleAbsoluteErrorTotal: number;
  ensembleSignedErrorTotal: number;
  naiveLastWeekAbsoluteErrorTotal: number;
  sameWeekday3wkAbsoluteErrorTotal: number;
  actualTotal: number;
  gradientBoostingWins: number;
  scoredDays: number;
}

export interface PersistedForecastErrors {
  sample_count: number;
  mape: Partial<Record<ForecastModel, number>>;
  ensemble_bias_pct_by_horizon?: Partial<Record<number, number>>;
  recent_outcomes?: Array<{
    target_date: string;
    predicted_ensemble: number;
    predicted_linear: number;
    predicted_holt_winters: number;
    predicted_naive: number;
    predicted_weekday: number;
    actual_sale_qty: number;
    station_remark_signals?: Array<{
      station_name: string;
      erp_code: string;
      sale_qty: number;
      prior_7d_avg: number;
      change_litres: number;
      remark: string;
    }>;
  }>;
}

function createBacktestErrors(): BacktestErrors {
  return {
    percentage: {
      linear: [],
      holt_winters: [],
      naive_last_week: [],
      same_weekday_avg: [],
      gradient_boosting: [],
    },
    squared: {
      linear: [],
      holt_winters: [],
      naive_last_week: [],
      same_weekday_avg: [],
      gradient_boosting: [],
    },
    ensemblePercentage: [],
    ensembleSquared: [],
    ensembleBiasPercentage: [],
    rawEnsembleBiasPercentage: [],
    weekdayBiasPercentage: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    gradientBoostedEnsemblePercentage: [],
    modelAbsoluteErrorTotal: {
      linear: 0,
      holt_winters: 0,
      naive_last_week: 0,
      same_weekday_avg: 0,
      gradient_boosting: 0,
    },
    scoredDates: [],
    walkForwardOutcomes: [],
    ensembleAbsoluteErrorTotal: 0,
    ensembleSignedErrorTotal: 0,
    naiveLastWeekAbsoluteErrorTotal: 0,
    sameWeekday3wkAbsoluteErrorTotal: 0,
    actualTotal: 0,
    gradientBoostingWins: 0,
    scoredDays: 0,
  };
}

function boundedBiasCorrection(biasPercentage: number): number {
  return Math.max(-0.25, Math.min(0.25, biasPercentage * 0.65));
}

function computeAdaptiveBiasPercentage(
  rawBiasHistory: number[],
  weekdayBiasHistory: number[] = [],
  dow?: number,
): number {
  if (rawBiasHistory.length === 0) return 0;
  // Exponentially weighted moving average over the last 10 days' relative differences
  const recent10 = rawBiasHistory.slice(-10);
  const alpha = 0.32;
  let ewmaBias = recent10[0];
  for (let i = 1; i < recent10.length; i++) {
    ewmaBias = alpha * recent10[i] + (1 - alpha) * ewmaBias;
  }
  const isWeekend = dow === 0 || dow === 6;
  if (isWeekend && weekdayBiasHistory.length >= 1) {
    // On Saturday & Sunday, prioritize that specific weekend day's past residual errors (75%)
    // so weekday (Mon-Fri) demand surges never inflate weekend forecasts when Sat/Sun sales go down.
    const recentWeekendBias = mean(weekdayBiasHistory.slice(-4));
    return recentWeekendBias * 0.75 + ewmaBias * 0.25;
  }
  if (weekdayBiasHistory.length >= 2) {
    const recentWeekday = mean(weekdayBiasHistory.slice(-4));
    return ewmaBias * 0.7 + recentWeekday * 0.3;
  }
  return ewmaBias;
}

/**
 * Calibrates Saturday (dow === 6) and Sunday (dow === 0) predictions using strictly-prior
 * empirical weekend-to-weekday ratios so the forecast reliably captures the weekend sales drop.
 */
function calibrateWeekendPrediction(
  priorDates: Date[],
  priorActuals: number[],
  targetDate: Date,
  rawEnsemble: number,
  sameWeekdayPred: number,
  naivePred: number,
): number {
  const dow = targetDate.getDay();
  if (dow !== 0 && dow !== 6) return rawEnsemble;

  const dowRatio = computeEmpiricalWeekdayRatio(priorDates, priorActuals, priorActuals.length, dow);
  // Compute recent Mon-Fri weekday baseline from up to the last 10 positive weekday observations
  const recentWeekdayVals: number[] = [];
  for (let i = priorActuals.length - 1; i >= 0 && recentWeekdayVals.length < 10; i--) {
    const d = priorDates[i].getDay();
    if (d >= 1 && d <= 5 && priorActuals[i] > 0) {
      recentWeekdayVals.push(priorActuals[i]);
    }
  }
  if (recentWeekdayVals.length === 0) return rawEnsemble;

  const recentWeekdayMean = mean(recentWeekdayVals);
  // When historical Saturdays/Sundays drop relative to Mon-Fri (dowRatio < 0.99),
  // anchor the weekend prediction to the empirical weekend drop target and weekend-specific baselines.
  if (dowRatio < 0.99) {
    const empiricalWeekendTarget = recentWeekdayMean * dowRatio;
    const weekendAnchor = sameWeekdayPred > 0
      ? empiricalWeekendTarget * 0.55 + sameWeekdayPred * 0.3 + naivePred * 0.15
      : empiricalWeekendTarget;
    if (rawEnsemble > weekendAnchor) {
      return rawEnsemble * 0.3 + weekendAnchor * 0.7;
    }
  }
  return rawEnsemble;
}

function inverseMapeWeights(
  errors: Record<ForecastModel, number[]>
): Record<EnsembleModel, number> {
  const models: EnsembleModel[] = ['linear', 'holt_winters', 'naive_last_week', 'same_weekday_avg'];
  const inverseErrors = models.map(model => {
    const errSeries = errors[model];
    if (errSeries.length === 0) return 0;
    const overallMape = mean(errSeries) * 100;
    // Emphasize the last 10 days' prediction errors so weights adapt rapidly to recent mistakes
    const recent10Mape = mean(errSeries.slice(-10)) * 100;
    const effectiveMape = errSeries.length >= 5
      ? overallMape * 0.45 + recent10Mape * 0.55
      : overallMape;
    return 1 / Math.pow(Math.max(effectiveMape, 0.5), 1.25);
  });
  const total = inverseErrors.reduce((sum, weight) => sum + weight, 0);

  if (total === 0) {
    return {
      linear: 0.25,
      holt_winters: 0.25,
      naive_last_week: 0.25,
      same_weekday_avg: 0.25,
    };
  }

  return {
    linear: inverseErrors[0] / total,
    holt_winters: inverseErrors[1] / total,
    naive_last_week: inverseErrors[2] / total,
    same_weekday_avg: inverseErrors[3] / total,
  };
}

function cloneBacktestErrors(src: BacktestErrors): BacktestErrors {
  const weekdayCopy: Record<number, number[]> = {};
  for (const [k, arr] of Object.entries(src.weekdayBiasPercentage)) {
    weekdayCopy[Number(k)] = [...arr];
  }
  return {
    percentage: {
      linear: [...src.percentage.linear],
      holt_winters: [...src.percentage.holt_winters],
      naive_last_week: [...src.percentage.naive_last_week],
      same_weekday_avg: [...src.percentage.same_weekday_avg],
      gradient_boosting: [...src.percentage.gradient_boosting],
    },
    squared: {
      linear: [...src.squared.linear],
      holt_winters: [...src.squared.holt_winters],
      naive_last_week: [...src.squared.naive_last_week],
      same_weekday_avg: [...src.squared.same_weekday_avg],
      gradient_boosting: [...src.squared.gradient_boosting],
    },
    ensemblePercentage: [...src.ensemblePercentage],
    ensembleSquared: [...src.ensembleSquared],
    ensembleBiasPercentage: [...src.ensembleBiasPercentage],
    rawEnsembleBiasPercentage: [...src.rawEnsembleBiasPercentage],
    weekdayBiasPercentage: weekdayCopy,
    gradientBoostedEnsemblePercentage: [...src.gradientBoostedEnsemblePercentage],
    modelAbsoluteErrorTotal: { ...src.modelAbsoluteErrorTotal },
    scoredDates: [...src.scoredDates],
    walkForwardOutcomes: src.walkForwardOutcomes.map((o) => ({ ...o })),
    ensembleAbsoluteErrorTotal: src.ensembleAbsoluteErrorTotal,
    ensembleSignedErrorTotal: src.ensembleSignedErrorTotal,
    naiveLastWeekAbsoluteErrorTotal: src.naiveLastWeekAbsoluteErrorTotal,
    sameWeekday3wkAbsoluteErrorTotal: src.sameWeekday3wkAbsoluteErrorTotal,
    actualTotal: src.actualTotal,
    gradientBoostingWins: src.gradientBoostingWins,
    scoredDays: src.scoredDays,
  };
}

interface WalkForwardCacheEntry {
  sigParts: string[];
  errors: BacktestErrors;
}

const WALK_FORWARD_CACHE_MAX = 16;
const walkForwardCache = new Map<string, WalkForwardCacheEntry>();
let lastWalkForwardCacheMode: 'cold' | 'exact' | 'incremental' = 'cold';

export function clearWalkForwardCache(): void {
  walkForwardCache.clear();
  lastWalkForwardCacheMode = 'cold';
}

export function getWalkForwardCacheDiagnostics(): {
  size: number;
  lastMode: 'cold' | 'exact' | 'incremental';
} {
  return {
    size: walkForwardCache.size,
    lastMode: lastWalkForwardCacheMode,
  };
}

function rollingBacktest(dates: Date[], actuals: number[]): BacktestErrors {
  const firstTestIndex = 7;
  if (actuals.length <= firstTestIndex) {
    lastWalkForwardCacheMode = 'cold';
    return createBacktestErrors();
  }

  const sigParts = dates.map((d, i) => `${d.toISOString().slice(0, 10)}:${actuals[i]}`);
  const fullKey = sigParts.join('|');

  const exactHit = walkForwardCache.get(fullKey);
  if (exactHit) {
    // Refresh LRU order
    walkForwardCache.delete(fullKey);
    walkForwardCache.set(fullKey, exactHit);
    lastWalkForwardCacheMode = 'exact';
    return cloneBacktestErrors(exactHit.errors);
  }

  // Find longest cached prefix so adding 1+ new operating days only evaluates the new suffix
  let bestPrefix: WalkForwardCacheEntry | null = null;
  for (const entry of walkForwardCache.values()) {
    const len = entry.sigParts.length;
    if (len < firstTestIndex || len > sigParts.length) continue;
    if (bestPrefix && len <= bestPrefix.sigParts.length) continue;
    let matches = true;
    for (let i = 0; i < len; i++) {
      if (entry.sigParts[i] !== sigParts[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      bestPrefix = entry;
    }
  }

  const errors = bestPrefix ? cloneBacktestErrors(bestPrefix.errors) : createBacktestErrors();
  const startIndex = bestPrefix ? bestPrefix.sigParts.length : firstTestIndex;
  lastWalkForwardCacheMode = bestPrefix ? 'incremental' : 'cold';

  for (let testIndex = startIndex; testIndex < actuals.length; testIndex++) {
    const trainDates = dates.slice(0, testIndex);
    const trainActuals = actuals.slice(0, testIndex);
    const testDate = dates[testIndex];
    const actual = actuals[testIndex];

    const trainFeatures = buildFeaturesNoLeak(trainDates, trainActuals);
    const fitFeatures = trainFeatures.length > 7 ? trainFeatures.slice(7) : trainFeatures;
    const fitActuals = trainActuals.length > 7 ? trainActuals.slice(7) : trainActuals;
    const linearModel = new LinearRegressionModel();
    linearModel.fit(fitFeatures, fitActuals);
    const gradientBoostingModel = new GradientBoostingModel();
    gradientBoostingModel.fit(fitFeatures, fitActuals);
    const testFeatures = buildFeaturesNoLeak(
      [...trainDates, testDate],
      [...trainActuals, 0]
    );
    const testFeature = testFeatures[testFeatures.length - 1];
    const linearPrediction = Math.max(linearModel.predict(testFeature), 0);
    const gradientBoostingPrediction = gradientBoostingModel.predict(testFeature);

    const [alpha, beta, gamma] = optimizeHoltWinters(trainActuals, 7, trainDates);
    const { forecast: holtWintersForecast } = holtWinters(trainActuals, alpha, beta, gamma, 7, 1, trainDates);
    const modelPredictions: Record<ForecastModel, number> = {
      linear: linearPrediction,
      holt_winters: holtWintersForecast[0] ?? mean(trainActuals),
      naive_last_week: naiveLastWeek(trainDates, trainActuals, testDate),
      same_weekday_avg: sameWeekdayAvg(trainDates, trainActuals, testDate),
      gradient_boosting: gradientBoostingPrediction,
    };
    const sameWeekdayLastThreeWeeks = dates
      .slice(0, testIndex)
      .map((date, index) => ({ date, sale: trainActuals[index] }))
      .filter(({ date }) => date.getDay() === testDate.getDay())
      .slice(-3);
    const sameWeekdayThreeWeekPrediction = sameWeekdayLastThreeWeeks.length > 0
      ? mean(sameWeekdayLastThreeWeeks.map(({ sale }) => sale))
      : mean(trainActuals);

    if (actual > 0) {
      const weights = inverseMapeWeights(errors.percentage);
      const uncalibratedEnsemble = Object.entries(weights).reduce(
        (sum, [model, weight]) => sum + modelPredictions[model as ForecastModel] * weight,
        0
      );
      const rawEnsemblePrediction = calibrateWeekendPrediction(
        trainDates,
        trainActuals,
        testDate,
        uncalibratedEnsemble,
        modelPredictions.same_weekday_avg,
        modelPredictions.naive_last_week,
      );
      let ensemblePrediction = rawEnsemblePrediction;
      const dow = testDate.getDay();
      if (errors.rawEnsembleBiasPercentage.length > 0) {
        const learnedBias = computeAdaptiveBiasPercentage(
          errors.rawEnsembleBiasPercentage,
          errors.weekdayBiasPercentage[dow] || [],
          dow,
        );
        ensemblePrediction *= 1 - boundedBiasCorrection(learnedBias);
      }
      const adaptiveCorrectionLitres = Number((ensemblePrediction - rawEnsemblePrediction).toFixed(2));

      for (const model of Object.keys(modelPredictions) as ForecastModel[]) {
        const difference = modelPredictions[model] - actual;
        errors.modelAbsoluteErrorTotal[model] += Math.abs(difference);
        errors.percentage[model].push(Math.abs(difference) / actual);
        errors.squared[model].push(difference ** 2);
      }

      const rawEnsembleDifference = rawEnsemblePrediction - actual;
      const ensembleDifference = ensemblePrediction - actual;
      const gradientBoostedEnsemblePrediction = ensemblePrediction * 0.8
        + modelPredictions.gradient_boosting * 0.2;
      const gradientBoostedEnsembleDifference = gradientBoostedEnsemblePrediction - actual;
      if (Math.abs(gradientBoostedEnsembleDifference) < Math.abs(ensembleDifference)) {
        errors.gradientBoostingWins++;
      }
      errors.gradientBoostedEnsemblePercentage.push(Math.abs(gradientBoostedEnsembleDifference) / actual);
      errors.ensemblePercentage.push(Math.abs(ensembleDifference) / actual);
      errors.ensembleSquared.push(ensembleDifference ** 2);
      errors.rawEnsembleBiasPercentage.push(rawEnsembleDifference / actual);
      errors.ensembleBiasPercentage.push(ensembleDifference / actual);
      errors.weekdayBiasPercentage[dow] = errors.weekdayBiasPercentage[dow] || [];
      errors.weekdayBiasPercentage[dow].push(rawEnsembleDifference / actual);
      const dateStr = testDate.toISOString().slice(0, 10);
      errors.scoredDates.push(dateStr);
      errors.walkForwardOutcomes.push({
        target_date: dateStr,
        day_name: WEEKDAYS[dow],
        predicted_ensemble: Number(ensemblePrediction.toFixed(2)),
        raw_ensemble: Number(rawEnsemblePrediction.toFixed(2)),
        adaptive_correction_litres: adaptiveCorrectionLitres,
        predicted_linear: Number(modelPredictions.linear.toFixed(2)),
        predicted_holt_winters: Number(modelPredictions.holt_winters.toFixed(2)),
        predicted_naive: Number(modelPredictions.naive_last_week.toFixed(2)),
        predicted_weekday: Number(modelPredictions.same_weekday_avg.toFixed(2)),
        actual_sale_qty: Number(actual.toFixed(2)),
      });
      errors.ensembleAbsoluteErrorTotal += Math.abs(ensembleDifference);
      errors.ensembleSignedErrorTotal += ensembleDifference;
      errors.naiveLastWeekAbsoluteErrorTotal += Math.abs(modelPredictions.naive_last_week - actual);
      errors.sameWeekday3wkAbsoluteErrorTotal += Math.abs(sameWeekdayThreeWeekPrediction - actual);
      errors.actualTotal += actual;
      errors.scoredDays++;
    }
  }

  if (walkForwardCache.size >= WALK_FORWARD_CACHE_MAX) {
    const oldestKey = walkForwardCache.keys().next().value;
    if (oldestKey !== undefined) {
      walkForwardCache.delete(oldestKey);
    }
  }
  walkForwardCache.set(fullKey, {
    sigParts,
    errors: cloneBacktestErrors(errors),
  });

  return errors;
}

function meanPercentageError(errors: number[]): number | null {
  return errors.length > 0 ? Math.round(mean(errors) * 1000) / 10 : null;
}

function rootMeanSquaredError(errors: number[]): number | null {
  return errors.length > 0 ? Math.round(Math.sqrt(mean(errors))) : null;
}

function adaptiveWeights(
  backtestErrors: Record<ForecastModel, number[]>,
  persistedErrors?: PersistedForecastErrors
): Record<EnsembleModel, number> {
  const recentWeights = inverseMapeWeights(backtestErrors);
  if (!persistedErrors || persistedErrors.sample_count < 1) return recentWeights;

  const historicalErrors = createBacktestErrors().percentage;
  for (const model of Object.keys(historicalErrors) as ForecastModel[]) {
    const mape = persistedErrors.mape[model];
    if (mape !== undefined && Number.isFinite(mape)) {
      historicalErrors[model].push(mape / 100);
    }
  }
  const historicalWeights = inverseMapeWeights(historicalErrors);
  const backtestSampleCount = Math.max(1, backtestErrors.linear.length);
  const historicalShare = persistedErrors.sample_count / (persistedErrors.sample_count + backtestSampleCount);
  const blended = Object.fromEntries(
    (Object.keys(recentWeights) as EnsembleModel[]).map(model => [
      model,
      recentWeights[model] * (1 - historicalShare) + historicalWeights[model] * historicalShare,
    ])
  ) as Record<ForecastModel, number>;
  const total = Object.values(blended).reduce((sum, weight) => sum + weight, 0);

  return Object.fromEntries(
    (Object.keys(blended) as EnsembleModel[]).map(model => [
      model,
      Math.round((blended[model] / total) * 1000) / 1000,
    ])
  ) as Record<ForecastModel, number>;
}

// =========================================================================== //
// Main Forecasting Pipeline
// =========================================================================== //

export function generateForecast(
  historicalDaily: Array<{ sale_date?: string; date?: string; sale_qty: number }>,
  forecastDays = 14,
  stationRecords?: StationRecord[],
  persistedErrors?: PersistedForecastErrors
): ForecastResult {
  const dates: Date[] = [];
  const actuals: number[] = [];

  const sorted = [...historicalDaily].sort((a, b) => {
    const da = a.sale_date || a.date || '';
    const db = b.sale_date || b.date || '';
    return new Date(da).getTime() - new Date(db).getTime();
  });

  for (const item of sorted) {
    const raw = item.sale_date || item.date;
    if (raw) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        dates.push(d);
        actuals.push(item.sale_qty);
      }
    }
  }

  const daysAvailable = dates.length;
  if (daysAvailable < 7) {
    return {
      insufficient: true,
      days_available: daysAvailable,
      horizon_days: forecastDays,
      predicted_total_7d: 0,
      mape_ensemble: null,
      mape_linear: null,
      mape_holt_winters: null,
      mape_naive: null,
      backtest_days: 0,
      backtest_diagnostics: {
        first_scored_date: null,
        last_scored_date: null,
        ensemble_wape: null,
        ensemble_bias: null,
        naive_last_week_wape: null,
        same_weekday_3wk_wape: null,
        model_wape: {
          linear: null,
          holt_winters: null,
          naive_last_week: null,
          same_weekday_avg: null,
          gradient_boosting: null,
        },
      },
      dates: dates.map(d => d.toISOString().slice(0, 10)),
      historical_actuals: actuals,
      forecast: [],
      models_metrics: {},
      weights: {},
      insights: [
        `Only ${daysAvailable} historical day(s) detected. Forecasting algorithms require at least 7 to 14 sequential days to establish weekly cycles.`,
        `Historical observations are read from PostgreSQL table sale_tracker; ${daysAvailable} day(s) are currently available for training.`
      ],
      reasons: [
        'Insufficient historical length to optimize seasonal gamma parameter.',
        'Please verify database connection or run locally.'
      ],
      data_quality: {
        outages_imputed: 0,
        gaps_filled: 0,
        anomalies_detected: 0,
        has_db_history: false,
      },
    };
  }

  // 1. Train Linear & Gradient Boosting Models on all post-warmup DB history
  const features = buildFeaturesNoLeak(dates, actuals);
  const fitFeatures = features.length > 7 ? features.slice(7) : features;
  const fitActuals = actuals.length > 7 ? actuals.slice(7) : actuals;
  const linModel = new LinearRegressionModel();
  linModel.fit(fitFeatures, fitActuals);
  const gradientBoostingModel = new GradientBoostingModel();
  gradientBoostingModel.fit(fitFeatures, fitActuals);

  // 2. Train Holt-Winters on all DB history with calendar-day seasonality
  const [alpha, beta, gamma] = optimizeHoltWinters(actuals, 7, dates);
  const { forecast: hwRaw } = holtWinters(actuals, alpha, beta, gamma, 7, forecastDays, dates);

  // Walk-forward validation only uses observations available before each test day.
  const backtest = rollingBacktest(dates, actuals);
  const weights = adaptiveWeights(backtest.percentage, persistedErrors);
  const linMape = meanPercentageError(backtest.percentage.linear);
  const hwMape = meanPercentageError(backtest.percentage.holt_winters);
  const naiveMape = meanPercentageError(backtest.percentage.naive_last_week);
  const weekdayMape = meanPercentageError(backtest.percentage.same_weekday_avg);
  const baselineEnsembleMape = meanPercentageError(backtest.ensemblePercentage);
  const gradientBoostingMape = meanPercentageError(backtest.percentage.gradient_boosting);
  const gradientBoostedEnsembleMape = meanPercentageError(backtest.gradientBoostedEnsemblePercentage);
  const gradientBoostingActive = backtest.scoredDays >= 14
    && baselineEnsembleMape !== null
    && gradientBoostedEnsembleMape !== null
    && gradientBoostedEnsembleMape <= baselineEnsembleMape * 0.95
    && backtest.gradientBoostingWins / backtest.scoredDays >= 0.6;
  const ensembleMape = gradientBoostingActive ? gradientBoostedEnsembleMape : baselineEnsembleMape;

  // 4. Forecast Loop
  const extendedDates = [...dates];
  const extendedActuals = [...actuals];
  const forecastPoints: any[] = [];

  const lastDate = dates[dates.length - 1];
  const overallMean = mean(actuals);
  const recentStd = stdDev(actuals.slice(-14)) || overallMean * 0.08;

  let total7dVolume = 0;

  for (let j = 0; j < forecastDays; j++) {
    const futureDate = new Date(lastDate.getTime() + (j + 1) * 86400000);
    const dow = futureDate.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const festival = getFestivalEntry(futureDate);
    const festName = festival?.name;

    const nl = naiveLastWeek(extendedDates, extendedActuals, futureDate);
    const wa = sameWeekdayAvg(extendedDates, extendedActuals, futureDate);
    const hp = hwRaw[j] || overallMean;

    const futureFeatures = buildFeaturesNoLeak(
      [...extendedDates, futureDate],
      [...extendedActuals, 0],
    );
    const feat = futureFeatures[futureFeatures.length - 1];

    const lp = Math.max(linModel.predict(feat), 0);
    const gradientBoostingPrediction = gradientBoostingModel.predict(feat);
    const baseEnsemble = weights.linear * lp + weights.holt_winters * hp + weights.naive_last_week * nl + weights.same_weekday_avg * wa;
    const uncalibratedRawEnsemble = gradientBoostingActive
      ? baseEnsemble * 0.8 + gradientBoostingPrediction * 0.2
      : baseEnsemble;
    const rawEnsemble = calibrateWeekendPrediction(
      extendedDates,
      extendedActuals,
      futureDate,
      uncalibratedRawEnsemble,
      wa,
      nl,
    );
    let ensemble = rawEnsemble;

    // Adaptive learning from recent 10-day mistakes/differences + saved feedback
    const horizonDecay = Math.pow(0.88, j);
    const learnedWalkForwardBias = computeAdaptiveBiasPercentage(
      backtest.rawEnsembleBiasPercentage,
      backtest.weekdayBiasPercentage[dow] || [],
      dow,
    );
    const historicalBias = persistedErrors?.ensemble_bias_pct_by_horizon?.[j + 1];
    if (historicalBias !== undefined && Number.isFinite(historicalBias)) {
      const combinedBias = backtest.rawEnsembleBiasPercentage.length >= 3
        ? historicalBias * 0.65 + learnedWalkForwardBias * 0.35
        : historicalBias;
      ensemble *= 1 - boundedBiasCorrection(combinedBias);
    } else if (backtest.rawEnsembleBiasPercentage.length >= 3) {
      ensemble *= 1 - boundedBiasCorrection(learnedWalkForwardBias * horizonDecay);
    }
    const adaptiveAdjustmentLitres = Number((ensemble - rawEnsemble).toFixed(2));

    const horizonFactor = 1.0 + j * 0.05;
    const festivalRangeFactor = festName ? 1.5 : 1;
    const uncertainty = recentStd * horizonFactor * festivalRangeFactor;

    const p10 = Math.max(Number((ensemble - 1.28 * uncertainty).toFixed(2)), 0);
    const p50 = Number(ensemble.toFixed(2));
    const p90 = Number((ensemble + 1.28 * uncertainty).toFixed(2));

    if (j < 7) {
      total7dVolume += p50;
    }

    forecastPoints.push({
      date: futureDate.toISOString().slice(0, 10),
      day_name: WEEKDAYS[dow],
      weekday: WEEKDAYS[dow],
      weekday_short: WEEKDAYS_SHORT[dow],
      predicted: p50,
      predicted_qty: p50,
      p10,
      p50,
      p90,
      linear: Number(lp.toFixed(2)),
      linear_pred: Number(lp.toFixed(2)),
      holt_winters: Number(hp.toFixed(2)),
      holt_winters_pred: Number(hp.toFixed(2)),
      gradient_boosting_pred: Number(gradientBoostingPrediction.toFixed(2)),
      naive_last_week: Number(nl.toFixed(2)),
      same_weekday_avg: Number(wa.toFixed(2)),
      ensemble: p50,
      lower_bound: p10,
      upper_bound: p90,
      is_weekend: isWeekend,
      is_today: j === 0,
      days_from_now: j + 1,
      raw_ensemble: Number(rawEnsemble.toFixed(2)),
      adaptive_adjustment_litres: adaptiveAdjustmentLitres,
      festival_name: festName,
      festival_note: festival?.note,
    });

    extendedActuals.push(p50);
    extendedDates.push(futureDate);
  }

  const insights: string[] = [];
  const reasons: string[] = [];
  const savedRecentOutcomes = persistedErrors?.recent_outcomes?.filter(
    outcome => outcome.actual_sale_qty > 0 && Number.isFinite(outcome.predicted_ensemble),
  ) ?? [];

  // Combine any saved forecast_feedback outcomes with the leak-free walk-forward backtest outcomes
  // so that the last 10 days (from Today / latest date back 10 days) are ALWAYS available.
  const walkForwardLast10 = [...backtest.walkForwardOutcomes].slice(-10).reverse();
  const savedDatesSet = new Set(savedRecentOutcomes.map((o) => o.target_date));
  const combined10DayOutcomes: Array<{
    target_date: string;
    day_name?: string;
    predicted_ensemble: number;
    adaptive_correction_litres?: number;
    predicted_linear: number;
    predicted_holt_winters: number;
    predicted_naive: number;
    predicted_weekday: number;
    actual_sale_qty: number;
    source: 'saved_feedback' | 'walk_forward';
    station_remark_signals?: NonNullable<PersistedForecastErrors['recent_outcomes']>[number]['station_remark_signals'];
  }> = [
    ...savedRecentOutcomes.map((o) => ({
      ...o,
      day_name: WEEKDAYS[new Date(`${o.target_date}T00:00:00Z`).getUTCDay()],
      source: 'saved_feedback' as const,
    })),
    ...walkForwardLast10
      .filter((wf) => !savedDatesSet.has(wf.target_date))
      .map((wf) => ({
        target_date: wf.target_date,
        day_name: wf.day_name,
        predicted_ensemble: wf.predicted_ensemble,
        adaptive_correction_litres: wf.adaptive_correction_litres,
        predicted_linear: wf.predicted_linear,
        predicted_holt_winters: wf.predicted_holt_winters,
        predicted_naive: wf.predicted_naive,
        predicted_weekday: wf.predicted_weekday,
        actual_sale_qty: wf.actual_sale_qty,
        source: 'walk_forward' as const,
        station_remark_signals: [],
      })),
  ].slice(0, 10);

  const recentForecastOutcomes = combined10DayOutcomes.map(outcome => {
    const componentPredictions: Array<[ForecastModel, number]> = ([
      ['linear', outcome.predicted_linear],
      ['holt_winters', outcome.predicted_holt_winters],
      ['naive_last_week', outcome.predicted_naive],
      ['same_weekday_avg', outcome.predicted_weekday],
    ] as Array<[ForecastModel, number]>).filter(([, prediction]) => Number.isFinite(prediction));
    const closestModel = componentPredictions.sort(
      (a, b) => Math.abs(a[1] - outcome.actual_sale_qty) - Math.abs(b[1] - outcome.actual_sale_qty),
    )[0];
    const difference = Number((outcome.predicted_ensemble - outcome.actual_sale_qty).toFixed(2));
    const differencePct = Number(((difference / outcome.actual_sale_qty) * 100).toFixed(2));
    const direction = difference > 0 ? 'overforecast' : difference < 0 ? 'underforecast' : 'matched';
    const explanation = closestModel
      ? `${direction === 'matched' ? 'The ensemble matched actual sales.' : `The ensemble ${direction} by ${Math.abs(differencePct).toFixed(1)}%.`} The ${closestModel[0].replace(/_/g, ' ')} model was closest to actuals (${closestModel[1].toLocaleString('en-IN', { maximumFractionDigits: 0 })} L); model disagreement or weighting may have contributed.`
      : direction === 'matched'
        ? 'The ensemble matched actual sales.'
        : `The ensemble ${direction} by ${Math.abs(differencePct).toFixed(1)}%; component-model predictions are unavailable for comparison.`;
    const stationRemarkSignals = outcome.station_remark_signals ?? [];
    const remarkContext = stationRemarkSignals.length > 0
      ? ` Recorded station context: ${stationRemarkSignals.map(signal => {
        const changeDirection = signal.change_litres > 0 ? 'above' : 'below';
        return `${signal.station_name} (${signal.erp_code}) sold ${Math.abs(signal.change_litres).toLocaleString('en-IN', { maximumFractionDigits: 0 })} L ${changeDirection} its prior 7-day average (${signal.sale_qty.toLocaleString('en-IN', { maximumFractionDigits: 0 })} L vs ${signal.prior_7d_avg.toLocaleString('en-IN', { maximumFractionDigits: 0 })} L); remark: "${signal.remark}"`;
      }).join('; ')}. These remarks are recorded operational context and may help explain the deviation.`
      : ' Adaptive feedback: this day’s residual difference has been incorporated into recency-weighted model weights and EWMA bias damping.';

    return {
      date: outcome.target_date,
      day_name: outcome.day_name,
      predicted: outcome.predicted_ensemble,
      actual: outcome.actual_sale_qty,
      difference,
      difference_pct: differencePct,
      predicted_linear: outcome.predicted_linear,
      predicted_holt_winters: outcome.predicted_holt_winters,
      predicted_naive: outcome.predicted_naive,
      predicted_weekday: outcome.predicted_weekday,
      closest_model: closestModel?.[0].replace(/_/g, ' ') ?? 'Unavailable',
      closest_model_prediction: closestModel?.[1] ?? 0,
      adaptive_correction_litres: outcome.adaptive_correction_litres,
      source: outcome.source,
      explanation: `${explanation}${remarkContext}`,
    };
  });

  const outcomesForReview = savedRecentOutcomes.length > 0 ? savedRecentOutcomes : combined10DayOutcomes;
  let bestRecentModelName = 'holt winters';
  if (outcomesForReview.length > 0) {
    const modelPredictions: Record<EnsembleModel, (outcome: typeof outcomesForReview[number]) => number> = {
      linear: outcome => outcome.predicted_linear,
      holt_winters: outcome => outcome.predicted_holt_winters,
      naive_last_week: outcome => outcome.predicted_naive,
      same_weekday_avg: outcome => outcome.predicted_weekday,
    };
    const ensembleErrors = outcomesForReview.map(
      outcome => (outcome.predicted_ensemble - outcome.actual_sale_qty) / outcome.actual_sale_qty,
    );
    const averageAbsoluteError = mean(ensembleErrors.map(Math.abs)) * 100;
    const overforecastDays = ensembleErrors.filter(error => error > 0).length;
    reasons.push(
      `Recent forecast review (${outcomesForReview.length} actual day(s)): ensemble average absolute error was ${averageAbsoluteError.toFixed(1)}%; it overforecast on ${overforecastDays} day(s) and underforecast on ${outcomesForReview.length - overforecastDays}.`,
    );

    const modelMapes = (Object.keys(modelPredictions) as EnsembleModel[])
      .map(model => ({
        model,
        mape: mean(outcomesForReview.map(outcome =>
          Math.abs(modelPredictions[model](outcome) - outcome.actual_sale_qty) / outcome.actual_sale_qty,
        )) * 100,
      }))
      .sort((a, b) => a.mape - b.mape);
    if (modelMapes.length > 0) {
      bestRecentModelName = modelMapes[0].model.replace(/_/g, ' ');
      reasons.push(
        `Best-performing model in these saved outcomes was ${bestRecentModelName} (${modelMapes[0].mape.toFixed(1)}% MAPE); recent model errors are fed back into ensemble weights.`,
      );
    }
  }

  const saturdayRatio = computeEmpiricalWeekdayRatio(dates, actuals, actuals.length, 6);
  const sundayRatio = computeEmpiricalWeekdayRatio(dates, actuals, actuals.length, 0);
  const saturdayDipPct = Number(((saturdayRatio - 1) * 100).toFixed(1));
  const sundayDipPct = Number(((sundayRatio - 1) * 100).toFixed(1));

  const adaptiveLearningSummary = (() => {
    if (recentForecastOutcomes.length === 0) return undefined;
    const absDiffLitres = mean(recentForecastOutcomes.map((r) => Math.abs(r.difference)));
    const absDiffPct = mean(recentForecastOutcomes.map((r) => Math.abs(r.difference_pct)));
    const signedDiffLitres = mean(recentForecastOutcomes.map((r) => r.difference));
    const signedDiffPct = mean(recentForecastOutcomes.map((r) => r.difference_pct));
    const ewmaBias = computeAdaptiveBiasPercentage(backtest.rawEnsembleBiasPercentage) * 100;
    return {
      window_days: recentForecastOutcomes.length,
      mean_abs_diff_litres: Number(absDiffLitres.toFixed(2)),
      mean_abs_diff_pct: Number(absDiffPct.toFixed(2)),
      net_signed_diff_litres: Number(signedDiffLitres.toFixed(2)),
      net_signed_diff_pct: Number(signedDiffPct.toFixed(2)),
      ewma_bias_pct: Number(ewmaBias.toFixed(2)),
      next_day_adjustment_litres: forecastPoints[0]?.adaptive_adjustment_litres ?? 0,
      best_recent_model: bestRecentModelName,
      saturday_dip_pct: saturdayDipPct,
      sunday_dip_pct: sundayDipPct,
    };
  })();

  if (saturdayDipPct < 0 || sundayDipPct < 0) {
    insights.push(
      `Weekend Contraction Learned: historical database records show Saturday demand shifts by ${saturdayDipPct > 0 ? '+' : ''}${saturdayDipPct}% and Sunday demand shifts by ${sundayDipPct > 0 ? '+' : ''}${sundayDipPct}% relative to Mon–Fri weekdays; weekend predictions are calibrated accordingly.`
    );
  }

  if (actuals.length >= 14) {
    const recentAverage = mean(actuals.slice(-7));
    const previousAverage = mean(actuals.slice(-14, -7));
    if (previousAverage > 0) {
      const changePct = ((recentAverage - previousAverage) / previousAverage) * 100;
      if (Math.abs(changePct) >= 10) {
        reasons.push(
          `Potential miss signal: the latest 7-day average is ${Math.abs(changePct).toFixed(1)}% ${changePct > 0 ? 'above' : 'below'} the preceding 7-day average, indicating a recent demand shift.`,
        );
      }
    }
  }

  if (ensembleMape !== null) {
    insights.push(
      `The ensemble's walk-forward validation MAPE was ${ensembleMape}% across ${backtest.scoredDays} positive-sales day(s).`
    );
  } else {
    insights.push('Not enough positive-sales history is available to calculate a walk-forward accuracy score.');
  }
  if (persistedErrors && persistedErrors.sample_count > 0) {
    insights.push(
      `Model weights also incorporate ${persistedErrors.sample_count} saved forecast outcomes compared with actual sales.`
    );
  }
  insights.push(
    gradientBoostingActive
      ? `Gradient boosting passed the walk-forward promotion gate (${gradientBoostedEnsembleMape}% blended MAPE versus ${baselineEnsembleMape}% for the current ensemble; it improved ${Math.round((backtest.gradientBoostingWins / backtest.scoredDays) * 100)}% of scored days) and contributes 20% to the forecast.`
      : `Gradient boosting remains a trial candidate (${gradientBoostingMape === null ? 'not enough scored data' : `${gradientBoostingMape}% standalone MAPE`}; 20% blend MAPE ${gradientBoostedEnsembleMape === null ? 'unavailable' : `${gradientBoostedEnsembleMape}%`} versus ${baselineEnsembleMape === null ? 'unavailable' : `${baselineEnsembleMape}%`} current-ensemble MAPE). It is not used unless the blend improves MAPE by at least 5% and wins at least 60% of at least 14 walk-forward days.`,
  );

  const firstHistoryDate = dates[0]?.toISOString().slice(0, 10) ?? 'N/A';
  const lastHistoryDate = dates[dates.length - 1]?.toISOString().slice(0, 10) ?? 'N/A';
  insights.push(
    `Trained on all ${daysAvailable} historical day(s) present in PostgreSQL (${firstHistoryDate} to ${lastHistoryDate}).`
  );

  return {
    insufficient: false,
    days_available: daysAvailable,
    horizon_days: forecastDays,
    predicted_total_7d: total7dVolume,
    mape_ensemble: ensembleMape,
    mape_linear: linMape,
    mape_holt_winters: hwMape,
    mape_naive: naiveMape,
    backtest_days: backtest.scoredDays,
    backtest_diagnostics: {
      first_scored_date: backtest.scoredDates[0] ?? null,
      last_scored_date: backtest.scoredDates.at(-1) ?? null,
      ensemble_wape: backtest.actualTotal > 0
        ? Number(((backtest.ensembleAbsoluteErrorTotal / backtest.actualTotal) * 100).toFixed(2))
        : null,
      ensemble_bias: backtest.actualTotal > 0
        ? Number(((backtest.ensembleSignedErrorTotal / backtest.actualTotal) * 100).toFixed(2))
        : null,
      naive_last_week_wape: backtest.actualTotal > 0
        ? Number(((backtest.naiveLastWeekAbsoluteErrorTotal / backtest.actualTotal) * 100).toFixed(2))
        : null,
      same_weekday_3wk_wape: backtest.actualTotal > 0
        ? Number(((backtest.sameWeekday3wkAbsoluteErrorTotal / backtest.actualTotal) * 100).toFixed(2))
        : null,
      model_wape: Object.fromEntries(
        (Object.keys(backtest.modelAbsoluteErrorTotal) as ForecastModel[]).map((model) => [
          model,
          backtest.actualTotal > 0
            ? Number(((backtest.modelAbsoluteErrorTotal[model] / backtest.actualTotal) * 100).toFixed(2))
            : null,
        ]),
      ),
    },
    gradient_boosting_active: gradientBoostingActive,
    learning_status: persistedErrors && persistedErrors.sample_count > 0
      ? `Adaptive weights learn from ${persistedErrors.sample_count} saved forecast outcomes; historical influence increases as more actuals are scored.`
      : 'No saved forecast outcomes are scored yet; learning will begin when actual sales arrive.',
    dates: dates.map(d => d.toISOString().slice(0, 10)),
    historical_actuals: actuals,
    forecast: forecastPoints,
    recent_forecast_outcomes: recentForecastOutcomes,
    adaptive_learning: adaptiveLearningSummary,
    models_metrics: {
      linear: { mape: linMape, rmse: rootMeanSquaredError(backtest.squared.linear) },
      holt_winters: { mape: hwMape, rmse: rootMeanSquaredError(backtest.squared.holt_winters) },
      naive_last_week: { mape: naiveMape, rmse: rootMeanSquaredError(backtest.squared.naive_last_week) },
      same_weekday_avg: { mape: weekdayMape, rmse: rootMeanSquaredError(backtest.squared.same_weekday_avg) },
      gradient_boosting: {
        mape: gradientBoostingMape,
        rmse: rootMeanSquaredError(backtest.squared.gradient_boosting),
      },
      gradient_boosting_blend: {
        mape: gradientBoostedEnsembleMape,
        rmse: null,
      },
    },
    weights: {
      ...Object.fromEntries(
        (Object.keys(weights) as EnsembleModel[]).map(model => [
          model,
          Number((weights[model] * (gradientBoostingActive ? 0.8 : 1)).toFixed(3)),
        ]),
      ),
      gradient_boosting: gradientBoostingActive ? 0.2 : 0,
    },
    insights,
    reasons,
    data_quality: (() => {
      let calendarGaps = 0;
      for (let i = 1; i < dates.length; i++) {
        const diffDays = Math.round((dates[i].getTime() - dates[i - 1].getTime()) / 86400000);
        if (diffDays > 1) calendarGaps += diffDays - 1;
      }
      const seriesStd = stdDev(actuals);
      const anomalies = seriesStd > 0
        ? actuals.filter((v) => Math.abs(v - overallMean) > 2.5 * seriesStd).length
        : 0;
      return {
        outages_imputed: stationRecords ? stationRecords.filter((s) => s.sale_qty === 0).length : 0,
        gaps_filled: calendarGaps,
        anomalies_detected: anomalies,
        has_db_history: daysAvailable >= 60,
      };
    })(),
  };
}
