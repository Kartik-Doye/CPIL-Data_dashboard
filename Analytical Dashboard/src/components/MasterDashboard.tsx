import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Fuel,
  AlertTriangle,
  ShieldAlert,
  Percent,
  CheckCircle2,
  ChevronRight,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Sparkles,
  Truck,
} from 'lucide-react';
import { ExecutiveTelemetry, StationRecord } from '../types';
import { TopPerformersTrendChart } from './TopPerformersTrendChart';
import { SalesDropAlerts } from './SalesDropAlerts';
import { CriticalBurnPredictionAlert } from './CriticalBurnPredictionAlert';
import { SmartAnomalyDetectionCard } from './SmartAnomalyDetectionCard';
import { fmtQty, fmtCurrency, fmtLakhs, fmtCrores, fmtPct } from '../engine/formatting';
import productConfig from '../../../product-config.json';

interface MasterDashboardProps {
  data: ExecutiveTelemetry;
  filteredStations: StationRecord[];
  isCompact?: boolean;
  onSelectStation?: (station: StationRecord) => void;
  onNavigateToTab: (tab: any) => void;
}

export const MasterDashboard: React.FC<MasterDashboardProps> = ({
  data,
  filteredStations,
  isCompact = false,
  onNavigateToTab,
}) => {
  // Compute metrics based on currently filtered stations
  const totalVolume = filteredStations.reduce((a, b) => a + b.sale_qty, 0);
  const totalRevenue = filteredStations.reduce((a, b) => a + (b.net_total_collection || b.collection), 0);
  const activeCount = filteredStations.filter((s) => s.sale_qty > 0).length;
  const zeroCount = filteredStations.filter((s) => s.sale_qty === 0).length;
  const freeSaleLtrs = filteredStations.reduce((a, b) => a + (b.free_sale_litres || b.free_sale || 0), 0);
  const freeSaleRs = filteredStations.reduce((a, b) => a + (b.free_sale_rupees || 0), 0);
  const paytmColl = filteredStations.reduce((a, b) => a + (b.paytm || 0), 0);

  const rawNominal =
    totalVolume > 0
      ? filteredStations.reduce(
          (a, b) => a + (b.new_rate || productConfig.analytics.fallbackRetailPricePerLitre) * b.sale_qty,
          0
        ) / totalVolume
      : data.average_rsp;
  const weightedNominalRsp = Number.isFinite(rawNominal)
    ? rawNominal
    : (data.average_rsp || productConfig.analytics.fallbackRetailPricePerLitre);
  const rawEff = totalVolume > 0 ? totalRevenue / totalVolume : data.effective_rsp;
  const weightedEffRsp = Number.isFinite(rawEff)
    ? rawEff
    : (data.effective_rsp || productConfig.analytics.fallbackRetailPricePerLitre);
  const collectionGap = Math.max(0, weightedNominalRsp - weightedEffRsp);

  // Top 5 & Bottom 5 among filtered
  const sortedActive = [...filteredStations]
    .filter((s) => s.sale_qty > 0)
    .sort((a, b) => b.sale_qty - a.sale_qty);
  const top5 = sortedActive.slice(0, 5);
  const bottom5 = sortedActive.slice(-5).reverse();

  // 30d history for SVG chart
  const history = data.history_30d || [];
  const maxHistorySale = Math.max(...history.map((h) => h.sale_qty), 1);
  const minHistorySale = Math.min(...history.map((h) => h.sale_qty), 0);
  const chartHeight = 120;
  const chartWidth = 600;

  const points = history
    .map((h, i) => {
      const x = (i / (history.length - 1 || 1)) * chartWidth;
      const y = chartHeight - ((h.sale_qty - minHistorySale) / (maxHistorySale - minHistorySale || 1)) * (chartHeight - 20);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className={`space-y-${isCompact ? '4' : '6'}`}>
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Volume */}
        <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs transition-colors ${isCompact ? 'p-3.5' : 'p-5'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Daily Sales Volume</span>
            <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20">
              <Fuel className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{fmtQty(totalVolume)}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Litres</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              {activeCount} active / {zeroCount} zero-sale
            </span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">
              {fmtLakhs(totalVolume)}
            </span>
          </div>
        </div>

        {/* Card 2: Total Revenue */}
        <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs transition-colors ${isCompact ? 'p-3.5' : 'p-5'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Net Collections</span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">{fmtCurrency(totalRevenue)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Paytm: {fmtLakhs(paytmColl)}</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">{fmtCrores(totalRevenue)}</span>
          </div>
        </div>

        {/* Card 3: Realized Effective RSP */}
        <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs transition-colors ${isCompact ? 'p-3.5' : 'p-5'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Realized Effective RSP</span>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">₹{weightedEffRsp.toFixed(2)}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">/ Litre</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">ERP Rate: ₹{weightedNominalRsp.toFixed(2)}</span>
            <span className={`font-mono font-medium ${collectionGap > 0.05 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              Gap: ₹{collectionGap.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Card 4: Executive Health Score */}
        <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs transition-colors ${isCompact ? 'p-3.5' : 'p-5'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Network Operational Health</span>
            <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-cyan-600 dark:text-cyan-400">{data.health_score}/100</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Free Sale: {fmtQty(freeSaleLtrs)} L</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">
              {data.stockout_risk_stations.length} Stock Risk
            </span>
          </div>
        </div>
      </div>

      {/* Proactive 48-Hour Low Inventory Burn Prediction Alert System */}
      <CriticalBurnPredictionAlert
        stations={filteredStations}
        telemetry={data}
        isCompact={isCompact}
        onNavigateToTab={onNavigateToTab}
      />

      {/* 3-Month Top Performers Trend Line Chart */}
      <TopPerformersTrendChart
        stations={filteredStations}
        monthlySales={data.station_monthly_sales}
        isCompact={isCompact}
      />

      {/* Threshold-based Sales Drop Alert System (>20% drop vs 3-month rolling avg) */}
      <SalesDropAlerts
        stations={filteredStations}
        telemetry={data}
        isCompact={isCompact}
        onNavigateToTab={onNavigateToTab}
      />

      {/* Smart Anomaly Detection Card (Data entry typos, decimal errors & dispenser locks) */}
      <SmartAnomalyDetectionCard
        stations={filteredStations}
        telemetry={data}
        isCompact={isCompact}
        onNavigateToTab={onNavigateToTab}
      />

      {/* Main Grid: 30-Day Network Sales Trend & Stockout Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: 30-Day SVG Sales Trend */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>30-Day Network Sales Trend</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  Daily Run-Rate
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Each point is the network's reported total litres for one day; daily run-rate is latest-day volume divided by one day, not a forecast.
                Observed volume trajectory over the past month.
              </p>
            </div>
            <button
              onClick={() => onNavigateToTab('forecast')}
              className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              <span>View AIML Forecast</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* SVG Trend Area */}
          <div className="h-44 w-full relative mt-3">
            <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F97316" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#F97316" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Area Fill */}
              <polygon points={`0,${chartHeight} ${points} ${chartWidth},${chartHeight}`} fill="url(#trendGrad)" />

              {/* Trend Polyline */}
              <polyline fill="none" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
            </svg>
          </div>

          {/* Key Trend Summary Stats */}
          <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">30-Day Peak:</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{fmtQty(maxHistorySale)} L</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">30-Day Low:</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{fmtQty(minHistorySale)} L</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Latest-Day Run-Rate:</span>
              <span className="font-mono font-bold text-orange-600 dark:text-orange-400">{fmtQty(totalVolume)} L/d</span>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Urgent Replenishment & Stockout Warning Panel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                <span>Replenishment Risk</span>
              </h3>
              <button
                onClick={() => onNavigateToTab('dispatch')}
                className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1"
              >
                <span>Report 32</span>
                <Truck className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Stations requiring immediate AutoLPG tanker dispatch (&lt;2.5 days fuel remaining).
            </p>

            <div className="space-y-2.5 max-h-55 overflow-y-auto pr-1">
              {data.stockout_risk_stations.length === 0 ? (
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>All active stations have &gt;3 days fuel stock. Network tank dips nominal.</span>
                </div>
              ) : (
                data.stockout_risk_stations.map((risk) => (
                  <div
                    key={risk.code}
                    onClick={() => onNavigateToTab('dispatch')}
                    className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900 dark:text-white text-xs">{risk.code} — {risk.name}</span>
                      <span className="text-[11px] font-mono font-bold text-rose-600 dark:text-rose-400">
                        {risk.days_left}d left
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Stock: {fmtQty(risk.stock_ltr)} L</span>
                      <span>Burn: {fmtQty(risk.daily_burn_ltr)} L/d</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigateToTab('dispatch')}
            className="w-full mt-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center gap-1"
          >
            <span>Open Report 32 Tanker Dispatch Generator</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Top & Bottom Performers Table Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Performers */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span>Top 5 Highest Volume Stations</span>
            </h3>
            <button
              onClick={() => onNavigateToTab('stations')}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              View All 316
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase font-semibold text-[10px]">
                <tr>
                  <th className="py-2 px-2">Code & Name</th>
                  <th className="py-2 px-2">State</th>
                  <th className="py-2 px-2 text-right">Volume</th>
                  <th className="py-2 px-2 text-right">Collection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {top5.map((s) => (
                  <tr key={s.erp_code} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-2 font-sans font-bold text-slate-900 dark:text-white truncate max-w-40">
                      {s.erp_code} — {s.alds_name}
                    </td>
                    <td className="py-2 px-2 font-sans text-slate-600 dark:text-slate-400">{s.state}</td>
                    <td className="py-2 px-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {fmtQty(s.sale_qty)} L
                    </td>
                    <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">
                      {fmtCurrency(s.net_total_collection || s.collection)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom 5 Active Performers */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-amber-500" />
              <span>Bottom 5 Low Volume Active Stations</span>
            </h3>
            <button
              onClick={() => onNavigateToTab('stations')}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              View All 316
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase font-semibold text-[10px]">
                <tr>
                  <th className="py-2 px-2">Code & Name</th>
                  <th className="py-2 px-2">State</th>
                  <th className="py-2 px-2 text-right">Volume</th>
                  <th className="py-2 px-2 text-right">Collection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {bottom5.map((s) => (
                  <tr key={s.erp_code} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-2 font-sans font-bold text-slate-900 dark:text-white truncate max-w-40">
                      {s.erp_code} — {s.alds_name}
                    </td>
                    <td className="py-2 px-2 font-sans text-slate-600 dark:text-slate-400">{s.state}</td>
                    <td className="py-2 px-2 text-right font-bold text-amber-600 dark:text-amber-400">
                      {fmtQty(s.sale_qty)} L
                    </td>
                    <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-300">
                      {fmtCurrency(s.net_total_collection || s.collection)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
