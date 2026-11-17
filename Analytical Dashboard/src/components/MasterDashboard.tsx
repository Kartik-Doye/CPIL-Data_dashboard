import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Fuel,
  ShieldAlert,
  Percent,
  CheckCircle2,
  ChevronRight,
  Activity,
  Truck,
} from 'lucide-react';
import { ExecutiveTelemetry, StationRecord } from '../types';
import { TopPerformersTrendChart } from './TopPerformersTrendChart';
import { SalesDropAlerts } from './SalesDropAlerts';
import { CriticalBurnPredictionAlert } from './CriticalBurnPredictionAlert';
import { SmartAnomalyDetectionCard } from './SmartAnomalyDetectionCard';
import { fmtQty, fmtCurrency, fmtLakhs, fmtCrores } from '../engine/formatting';
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
  onSelectStation,
  onNavigateToTab,
}) => {
  const [hoveredHistoryIdx, setHoveredHistoryIdx] = useState<number | null>(null);

  // Compute metrics based on currently filtered stations
  const totalVolume = filteredStations.reduce((a, b) => a + b.sale_qty, 0);
  const totalRevenue = filteredStations.reduce((a, b) => a + (b.net_total_collection || b.collection), 0);
  const activeCount = filteredStations.filter((s) => s.sale_qty > 0).length;
  const zeroCount = filteredStations.filter((s) => s.sale_qty === 0).length;
  const freeSaleLtrs = filteredStations.reduce((a, b) => a + (b.free_sale_litres || b.free_sale || 0), 0);
  const paytmColl = filteredStations.reduce((a, b) => a + (b.paytm || 0), 0);

  // Weighted Nominal RSP only over stations with a positive reported rate (matching analyticsViews.ts)
  const pricedStations = filteredStations.filter((s) => s.sale_qty > 0 && (s.new_rate > 0 || s.erp_rate > 0));
  const pricedVolume = pricedStations.reduce((a, b) => a + b.sale_qty, 0);
  const rawNominal =
    pricedVolume > 0
      ? pricedStations.reduce((a, b) => a + (b.new_rate || b.erp_rate) * b.sale_qty, 0) / pricedVolume
      : data.average_rsp;
  const weightedNominalRsp = Number.isFinite(rawNominal) && rawNominal > 0
    ? Number(rawNominal.toFixed(2))
    : (data.average_rsp || productConfig.analytics.fallbackRetailPricePerLitre);
  const rawEff = totalVolume > 0 ? totalRevenue / totalVolume : data.effective_rsp;
  const weightedEffRsp = Number.isFinite(rawEff) && rawEff > 0
    ? Number(rawEff.toFixed(2))
    : (data.effective_rsp || productConfig.analytics.fallbackRetailPricePerLitre);
  const collectionGap = Math.max(0, Number((weightedNominalRsp - weightedEffRsp).toFixed(2)));

  // Filtered stockout risk stations & health score (reactive to FilterBar)
  const hsCfg = productConfig.analytics.healthScore;
  const filteredStockoutRisks = filteredStations
    .filter((s) => s.days_left < productConfig.analytics.stockoutWarningDays && (s.sale_qty > 0 || (s.rolling_7d_burn || 0) > 0))
    .sort((a, b) => a.days_left - b.days_left)
    .map((s) => ({
      code: s.erp_code,
      name: s.alds_name,
      state: s.state,
      stock_ltr: s.closing_dip_in_ltr || 0,
      daily_burn_ltr: s.rolling_7d_burn || s.sale_qty,
      days_left: s.days_left,
      remark: s.remark || (s.days_left < productConfig.analytics.stockoutCriticalDays ? 'Immediate Replenishment Needed' : 'Low Buffer'),
    }));

  const stationsCount = filteredStations.length;
  const activeRatioScore = (activeCount / (stationsCount || 1)) * hsCfg.activeStationWeight;
  const gapPenaltyScore = Math.max(0, hsCfg.collectionGapMaxScore - collectionGap * hsCfg.collectionGapMultiplier);
  const freeSalePenaltyScore = Math.max(0, hsCfg.freeSaleMaxScore - (freeSaleLtrs / (totalVolume || 1)) * hsCfg.freeSaleMultiplier);
  const stockoutPenaltyScore = Math.max(0, hsCfg.stockoutMaxScore - filteredStockoutRisks.length * hsCfg.stockoutStationPenalty);
  const filteredHealthScore = stationsCount > 0
    ? Math.min(100, Math.max(0, Math.round(activeRatioScore + gapPenaltyScore + freeSalePenaltyScore + stockoutPenaltyScore)))
    : 0;

  // Top 5 & Bottom 5 among filtered
  const sortedActive = [...filteredStations]
    .filter((s) => s.sale_qty > 0)
    .sort((a, b) => b.sale_qty - a.sale_qty);
  const top5 = sortedActive.slice(0, 5);
  const bottom5 = sortedActive.slice(-5).reverse();

  // 30d history for SVG chart (fixed minHistorySale bug!)
  const history = data.history_30d || [];
  const maxHistorySale = history.length > 0 ? Math.max(...history.map((h) => h.sale_qty)) : 0;
  const minHistorySale = history.length > 0 ? Math.min(...history.map((h) => h.sale_qty)) : 0;
  const plotMin = minHistorySale > 0 ? minHistorySale * 0.9 : 0;
  const plotMax = maxHistorySale > plotMin ? maxHistorySale * 1.03 : plotMin + 1;
  const chartHeight = 130;
  const chartWidth = 600;

  const coordList = history.map((h, i) => {
    const x = history.length <= 1 ? chartWidth / 2 : (i / (history.length - 1)) * chartWidth;
    const y = chartHeight - 12 - ((h.sale_qty - plotMin) / (plotMax - plotMin || 1)) * (chartHeight - 28);
    return { x, y, point: h };
  });
  const points = coordList.map((c) => `${c.x},${c.y}`).join(' ');
  const hoveredPoint = hoveredHistoryIdx !== null ? coordList[hoveredHistoryIdx] : null;

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
            {data.dod_sale_change_pct !== null && data.dod_sale_change_pct !== undefined && filteredStations.length === data.stations_total && (
              <span className={`text-[11px] font-mono font-semibold ml-auto ${data.dod_sale_change_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {data.dod_sale_change_pct >= 0 ? '+' : ''}{data.dod_sale_change_pct}% DoD
              </span>
            )}
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
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Operational Health Score</span>
            <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/20">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-cyan-600 dark:text-cyan-400">{filteredHealthScore}/100</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Free Sale: {fmtQty(freeSaleLtrs)} L</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">
              {filteredStockoutRisks.length} Stock Risk
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
                Each point is the network&apos;s reported total litres for one day. Hover over any point to inspect that date&apos;s exact volume and active station count.
              </p>
            </div>
            <button
              onClick={() => onNavigateToTab('forecast')}
              className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer"
            >
              <span>View AIML Forecast</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Interactive Tooltip Strip */}
          <div className="h-5 text-xs font-mono text-slate-600 dark:text-slate-300 flex items-center justify-between px-1">
            {hoveredPoint ? (
              <>
                <span>
                  <strong>{hoveredPoint.point.date}</strong> ({hoveredPoint.point.day_name})
                </span>
                <span className="text-orange-600 dark:text-orange-400 font-bold">
                  {fmtQty(hoveredPoint.point.sale_qty)} L · {fmtCurrency(hoveredPoint.point.collection)} · {hoveredPoint.point.active_stations} active stns
                </span>
              </>
            ) : (
              <span className="text-[11px] text-slate-400 font-sans">
                Hover over the trend curve to inspect daily historical figures ({history.length} days loaded)
              </span>
            )}
          </div>

          {/* SVG Trend Area */}
          <div className="h-44 w-full relative mt-1" onMouseLeave={() => setHoveredHistoryIdx(null)}>
            <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F97316" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#F97316" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Area Fill */}
              {points && (
                <polygon
                  points={`${coordList[0]?.x ?? 0},${chartHeight} ${points} ${coordList.at(-1)?.x ?? chartWidth},${chartHeight}`}
                  fill="url(#trendGrad)"
                />
              )}

              {/* Trend Polyline */}
              {points && (
                <polyline
                  fill="none"
                  stroke="#F97316"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points}
                />
              )}

              {/* Interactive Hover Targets */}
              {coordList.map((c, idx) => (
                <g key={c.point.date} onMouseEnter={() => setHoveredHistoryIdx(idx)}>
                  <circle cx={c.x} cy={c.y} r="10" fill="transparent" className="cursor-pointer" />
                  {hoveredHistoryIdx === idx && (
                    <circle cx={c.x} cy={c.y} r="4.5" fill="#F97316" stroke="#ffffff" strokeWidth="1.5" />
                  )}
                </g>
              ))}
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
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Selected Run-Rate:</span>
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
                <span>Replenishment Risk ({filteredStockoutRisks.length})</span>
              </h3>
              <button
                onClick={() => onNavigateToTab('dispatch')}
                className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Report 32</span>
                <Truck className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Stations with &lt;3.0 days of fuel cover based on 7-day rolling burn rate vs closing tank dip.
            </p>

            <div className="space-y-2.5 max-h-55 overflow-y-auto pr-1">
              {filteredStockoutRisks.length === 0 ? (
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>All filtered stations maintain &ge;3 days of fuel stock cover.</span>
                </div>
              ) : (
                filteredStockoutRisks.map((risk) => (
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
                      <span>7d Burn: {fmtQty(risk.daily_burn_ltr)} L/d</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigateToTab('dispatch')}
            className="w-full mt-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center gap-1 cursor-pointer"
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
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              View All ({filteredStations.length})
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
                  <tr
                    key={s.erp_code}
                    onClick={() => onSelectStation?.(s)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <td className="py-2 px-2 font-sans font-bold text-slate-900 dark:text-white hover:text-orange-600 dark:hover:text-orange-400 truncate max-w-40">
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
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              View All ({filteredStations.length})
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
                  <tr
                    key={s.erp_code}
                    onClick={() => onSelectStation?.(s)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <td className="py-2 px-2 font-sans font-bold text-slate-900 dark:text-white hover:text-orange-600 dark:hover:text-orange-400 truncate max-w-40">
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
