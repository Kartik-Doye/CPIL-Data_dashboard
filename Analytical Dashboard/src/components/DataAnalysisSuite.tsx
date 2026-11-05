import React, { useState } from 'react';
import {
  Activity,
  BarChart2,
  AlertTriangle,
  TrendingUp,
  Percent,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { StationRecord, ExecutiveTelemetry } from '../types';
import { runComprehensiveAnalysis } from '../engine/dataAnalysis';
import { formatIndianNumber } from '../engine/formatting';

interface DataAnalysisSuiteProps {
  stations: StationRecord[];
  data: ExecutiveTelemetry;
}

export const DataAnalysisSuite: React.FC<DataAnalysisSuiteProps> = ({ stations, data }) => {
  const analysis = runComprehensiveAnalysis(stations);
  const { stats, outliers, correlations, concentration } = analysis;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">
              Report 24: Deep Statistical Distribution & Outlier Diagnostic Suite
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Evaluates statistical moments (skewness, kurtosis), detects anomalous stations via
              Tukey's IQR fences, and calculates Pearson correlation coefficients.
            </p>
          </div>
        </div>
      </div>

      {/* Distribution Moments Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[11px] text-slate-400 block mb-1">Mean Daily Throughput</span>
          <div className="text-lg font-bold font-mono text-white">
            {formatIndianNumber(stats.mean)} L
          </div>
          <span className="text-[10px] text-slate-500">Across {stats.count} stns</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[11px] text-slate-400 block mb-1">Median Daily Throughput</span>
          <div className="text-lg font-bold font-mono text-slate-200">
            {formatIndianNumber(stats.median)} L
          </div>
          <span className="text-[10px] text-slate-500">50th percentile</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[11px] text-slate-400 block mb-1">Standard Deviation (σ)</span>
          <div className="text-lg font-bold font-mono text-indigo-300">
            ±{formatIndianNumber(stats.std_dev)} L
          </div>
          <span className="text-[10px] text-slate-500">Variance: {(stats.variance / 1000).toFixed(0)}k</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[11px] text-slate-400 block mb-1">Distribution Skewness</span>
          <div className="text-lg font-bold font-mono text-amber-300">
            {stats.skewness}
          </div>
          <span className="text-[10px] text-slate-500">
            {stats.skewness > 0 ? 'Right-skewed tail' : 'Left-skewed tail'}
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[11px] text-slate-400 block mb-1">Excess Kurtosis</span>
          <div className="text-lg font-bold font-mono text-slate-200">
            {stats.kurtosis}
          </div>
          <span className="text-[10px] text-slate-500">Peak sharpness</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 shadow-sm">
          <span className="text-[11px] text-slate-400 block mb-1">Interquartile Range (IQR)</span>
          <div className="text-lg font-bold font-mono text-emerald-400">
            {formatIndianNumber(stats.iqr)} L
          </div>
          <span className="text-[10px] text-slate-500">Q1: {stats.q1} | Q3: {stats.q3}</span>
        </div>
      </div>

      {/* Middle: Concentration Ratio & Pearson Correlation Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Concentration Metrics */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Percent className="w-4 h-4 text-orange-400" />
              <span>Volume Concentration & Gini Coefficient</span>
            </h3>
            <span className="text-xs font-mono font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
              Gini: {concentration.gini_coefficient}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Evaluates how much throughput is concentrated among the top tier of the network.
          </p>

          <div className="space-y-3 font-mono text-xs">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Top 1% Stations Volume Share:</span>
                <span className="font-bold text-white">{concentration.top1_pct_share}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                <div className="bg-orange-500 h-full" style={{ width: `${concentration.top1_pct_share}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Top 5% Stations Volume Share:</span>
                <span className="font-bold text-white">{concentration.top5_pct_share}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                <div className="bg-orange-500 h-full" style={{ width: `${concentration.top5_pct_share}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Top 10% Stations Volume Share:</span>
                <span className="font-bold text-white">{concentration.top10_pct_share}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                <div className="bg-orange-500 h-full" style={{ width: `${concentration.top10_pct_share}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Top 20% Stations Volume Share:</span>
                <span className="font-bold text-white">{concentration.top20_pct_share}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                <div className="bg-orange-500 h-full" style={{ width: `${concentration.top20_pct_share}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Pearson Correlation Matrix */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-indigo-400" />
            <span>Pearson Linear Correlation Matrix</span>
          </h3>

          <p className="text-xs text-slate-400">
            Quantifies dependencies between sales, cash collection, digital paytm, and tank inventory.
          </p>

          <div className="space-y-2">
            {correlations.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs"
              >
                <div className="font-medium text-slate-200">
                  {c.field_a} <span className="text-slate-500 font-mono">↔</span> {c.field_b}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`font-mono font-bold text-xs ${
                      c.r >= 0.7
                        ? 'text-emerald-400'
                        : c.r >= 0.3
                        ? 'text-indigo-300'
                        : c.r <= -0.3
                        ? 'text-rose-400'
                        : 'text-slate-400'
                    }`}
                  >
                    r = {c.r}
                  </span>
                  <span className="text-[10px] text-slate-400 w-28 text-right font-sans">
                    {c.strength}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tukey Outlier Stations Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Tukey's IQR Outlier Stations (Statistical Anomaly Detection)</span>
          </h3>
          <span className="text-xs text-amber-400 font-medium font-mono">
            {outliers.length} Outliers Detected
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Cost Code</th>
                <th className="py-2.5 px-3">Station Name</th>
                <th className="py-2.5 px-2">State</th>
                <th className="py-2.5 px-3 text-right">Daily Volume</th>
                <th className="py-2.5 px-3 text-right">Variance from Mean</th>
                <th className="py-2.5 px-3 text-center">Z-Score</th>
                <th className="py-2.5 px-3 text-center">Classification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {outliers.map((o) => (
                <tr key={o.code} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2 px-3 font-bold text-orange-400">{o.code}</td>
                  <td className="py-2 px-3 font-sans font-semibold text-white">{o.name}</td>
                  <td className="py-2 px-2 font-sans text-slate-300">{o.state}</td>
                  <td className="py-2 px-3 text-right font-bold text-white">
                    {o.sale_qty.toLocaleString('en-IN')} L
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-semibold ${
                      o.difference_from_mean >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {o.difference_from_mean >= 0
                      ? `+${o.difference_from_mean.toLocaleString('en-IN')}`
                      : o.difference_from_mean.toLocaleString('en-IN')}{' '}
                    L
                  </td>
                  <td className="py-2 px-3 text-center text-slate-300">{o.z_score}σ</td>
                  <td className="py-2 px-3 text-center font-sans">
                    <span
                      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        o.type === 'upper_outlier'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}
                    >
                      {o.type === 'upper_outlier' ? 'High Volume Outlier' : 'Low Volume Outlier'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
