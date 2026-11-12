/**
 * Pure TypeScript conversion of data_analysis.py
 * Report 24: Deep Statistical Analysis & What-If Financial Simulator.
 * 
 * Provides:
 * 1. Descriptive moments (mean, median, skewness, kurtosis, IQR)
 * 2. Tukey IQR Outlier Fences
 * 3. Pearson Correlation Matrix
 * 4. Gini Concentration Ratio
 * 5. What-If Financial Simulator
 */

import {
  DistributionStats,
  OutlierStation,
  SimulationParams,
  SimulationResult,
  StationRecord,
  WhatIfInput,
  WhatIfOutput,
} from '../types.js';
import productConfig from '../../../product-config.json';

export interface CorrelationPair {
  field_a: string;
  field_b: string;
  r: number;
  strength: 'Strong Positive' | 'Moderate Positive' | 'Weak / None' | 'Moderate Negative' | 'Strong Negative';
}

export interface ComprehensiveAnalysisResult {
  stats: any;
  outliers: any[];
  correlations: CorrelationPair[];
  concentration: {
    top1_pct_share: number;
    top5_pct_share: number;
    top10_pct_share: number;
    top20_pct_share: number;
    gini_coefficient: number;
  };
}

export function computeDistributionStats(numbers: number[]): any {
  if (numbers.length === 0) {
    return {
      count: 0,
      mean: 0,
      median: 0,
      std_dev: 0,
      variance: 0,
      skewness: 0,
      kurtosis: 0,
      min: 0,
      max: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
    };
  }

  const n = numbers.length;
  const sorted = [...numbers].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  const mid = Math.floor(n / 2);
  const median = n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  let varSum = 0;
  let m3Sum = 0;
  let m4Sum = 0;

  for (let i = 0; i < n; i++) {
    const diff = sorted[i] - mean;
    const diffSq = diff * diff;
    varSum += diffSq;
    m3Sum += diffSq * diff;
    m4Sum += diffSq * diffSq;
  }

  const variance = n > 1 ? varSum / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);

  const skewness = stdDev > 0 ? Number((m3Sum / (n * Math.pow(stdDev, 3))).toFixed(2)) : 0;
  const kurtosis = stdDev > 0 ? Number((m4Sum / (n * Math.pow(stdDev, 4)) - 3).toFixed(2)) : 0;

  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;

  return {
    count: n,
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    std_dev: Number(stdDev.toFixed(2)),
    variance: Number(variance.toFixed(2)),
    skewness,
    kurtosis,
    min: sorted[0],
    max: sorted[n - 1],
    q1,
    q3,
    iqr,
  };
}

export function detectOutliers(stations: StationRecord[]): any[] {
  const activeStations = stations.filter((s) => s.sale_qty > 0);
  const sales = activeStations.map((s) => s.sale_qty);
  if (sales.length < 5) return [];

  const stats = computeDistributionStats(sales);
  const lowerFence = stats.q1 - 1.5 * stats.iqr;
  const upperFence = stats.q3 + 1.5 * stats.iqr;

  const outliers: any[] = [];

  for (const st of activeStations) {
    const zScore = stats.std_dev > 0 ? (st.sale_qty - stats.mean) / stats.std_dev : 0;
    if (st.sale_qty > upperFence) {
      outliers.push({
        code: st.erp_code,
        name: st.alds_name,
        state: st.state,
        sale_qty: st.sale_qty,
        type: 'upper_outlier',
        z_score: Number(zScore.toFixed(2)),
        difference_from_mean: Math.round(st.sale_qty - stats.mean),
      });
    } else if (st.sale_qty < lowerFence) {
      outliers.push({
        code: st.erp_code,
        name: st.alds_name,
        state: st.state,
        sale_qty: st.sale_qty,
        type: 'lower_outlier',
        z_score: Number(zScore.toFixed(2)),
        difference_from_mean: Math.round(st.sale_qty - stats.mean),
      });
    }
  }

  return outliers.sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score));
}

export function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    num += diffX * diffY;
    denX += diffX * diffX;
    denY += diffY * diffY;
  }

  const den = Math.sqrt(denX * denY);
  if (den === 0) return 0;
  return Number((num / den).toFixed(3));
}

export function computeCorrelationMatrix(stations: StationRecord[]): CorrelationPair[] {
  const active = stations.filter((s) => s.sale_qty > 0);
  const sales = active.map((s) => s.sale_qty);
  const collections = active.map((s) => s.net_total_collection || s.collection);
  const effRsps = active.map((s) => s.effective_rsp || (s.new_rate || productConfig.analytics.fallbackRetailPricePerLitre));
  const dips = active.map((s) => s.closing_dip_in_ltr ?? s.closing_dip ?? 0);
  const paytms = active.map((s) => s.paytm || 0);
  const freeSales = active.map((s) => s.free_sale_litres || s.free_sale || 0);

  const getStrength = (r: number): CorrelationPair['strength'] => {
    if (r >= 0.7) return 'Strong Positive';
    if (r >= 0.3) return 'Moderate Positive';
    if (r <= -0.7) return 'Strong Negative';
    if (r <= -0.3) return 'Moderate Negative';
    return 'Weak / None';
  };

  const pairs: [string, string, number[]][] = [
    ['Sale Volume', 'Net Collection', collections],
    ['Sale Volume', 'Effective RSP', effRsps],
    ['Sale Volume', 'Closing Dip (Inventory)', dips],
    ['Sale Volume', 'Digital Paytm Collection', paytms],
    ['Sale Volume', 'Free Sale Litres', freeSales],
    ['Closing Dip', 'Net Collection', collections],
  ];

  return pairs.map(([fA, fB, vecB]) => {
    const r = pearsonCorrelation(sales, vecB);
    return {
      field_a: fA,
      field_b: fB,
      r,
      strength: getStrength(r),
    };
  });
}

export function computeConcentration(stations: StationRecord[]) {
  const sorted = [...stations].sort((a, b) => b.sale_qty - a.sale_qty);
  const totalSale = sorted.reduce((a, b) => a + b.sale_qty, 0);
  if (totalSale === 0) {
    return {
      top1_pct_share: 0,
      top5_pct_share: 0,
      top10_pct_share: 0,
      top20_pct_share: 0,
      gini_coefficient: 0,
    };
  }

  const n = sorted.length;
  const count1 = Math.max(1, Math.round(n * 0.01));
  const count5 = Math.max(1, Math.round(n * 0.05));
  const count10 = Math.max(1, Math.round(n * 0.1));
  const count20 = Math.max(1, Math.round(n * 0.2));

  const share1 = (sorted.slice(0, count1).reduce((a, b) => a + b.sale_qty, 0) / totalSale) * 100;
  const share5 = (sorted.slice(0, count5).reduce((a, b) => a + b.sale_qty, 0) / totalSale) * 100;
  const share10 = (sorted.slice(0, count10).reduce((a, b) => a + b.sale_qty, 0) / totalSale) * 100;
  const share20 = (sorted.slice(0, count20).reduce((a, b) => a + b.sale_qty, 0) / totalSale) * 100;

  const asc = [...sorted].reverse();
  let diffSum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      diffSum += Math.abs(asc[i].sale_qty - asc[j].sale_qty);
    }
  }
  const mean = totalSale / n;
  const gini = Number((diffSum / (2 * n * n * mean)).toFixed(3));

  return {
    top1_pct_share: Number(share1.toFixed(1)),
    top5_pct_share: Number(share5.toFixed(1)),
    top10_pct_share: Number(share10.toFixed(1)),
    top20_pct_share: Number(share20.toFixed(1)),
    gini_coefficient: gini,
  };
}

export function runComprehensiveAnalysis(stations: StationRecord[]): ComprehensiveAnalysisResult {
  const sales = stations.map((s) => s.sale_qty);
  const stats = computeDistributionStats(sales);
  const outliers = detectOutliers(stations);
  const correlations = computeCorrelationMatrix(stations);
  const concentration = computeConcentration(stations);

  return {
    stats,
    outliers,
    correlations,
    concentration,
  };
}

export function simulateWhatIf(
  stations: StationRecord[],
  inputs: WhatIfInput
): WhatIfOutput {
  const totalSale = stations.reduce((a, b) => a + b.sale_qty, 0);
  const totalColl = stations.reduce((a, b) => a + (b.net_total_collection || b.collection), 0);
  const effRsp = totalSale > 0 ? totalColl / totalSale : productConfig.analytics.fallbackRetailPricePerLitre;
  const freeSaleRs = stations.reduce((a, b) => a + (b.free_sale_rupees || 0), 0);
  const totalNominalRev = stations.reduce(
    (a, b) => a + (b.new_rate || productConfig.analytics.fallbackRetailPricePerLitre) * b.sale_qty,
    0
  );
  const nominalRsp = totalSale > 0 ? totalNominalRev / totalSale : 77.3;
  const gapPerL = Math.max(0, nominalRsp - effRsp);

  const freeSaleSavingsRs = Math.round((inputs.free_sale_reduction_pct / 100) * freeSaleRs);
  const zeroSaleLitreGain = inputs.reopened_zero_sale_stations * 1050;
  const zeroSaleRevenueGain = Math.round(zeroSaleLitreGain * effRsp);

  const efficiencyRecoveryRs = Math.round(
    (inputs.collection_efficiency_gain_pct / 100) * (gapPerL * totalSale)
  );

  const demandGainLitres = Math.round((inputs.market_demand_growth_pct / 100) * totalSale);
  const demandGainRs = Math.round(demandGainLitres * effRsp);

  const projectedSale = Math.round(totalSale + zeroSaleLitreGain + demandGainLitres);
  const projectedColl = Math.round(
    totalColl + freeSaleSavingsRs + zeroSaleRevenueGain + efficiencyRecoveryRs + demandGainRs
  );

  return {
    baseline_sale_litres: Math.round(totalSale),
    projected_sale_litres: projectedSale,
    delta_sale_litres: projectedSale - Math.round(totalSale),
    baseline_collection_rs: Math.round(totalColl),
    projected_collection_rs: projectedColl,
    delta_collection_rs: projectedColl - Math.round(totalColl),
    free_sale_savings_rs: freeSaleSavingsRs,
    zero_sale_revenue_gain_rs: zeroSaleRevenueGain,
    efficiency_recovery_rs: efficiencyRecoveryRs,
    demand_gain_rs: demandGainRs,
  };
}
