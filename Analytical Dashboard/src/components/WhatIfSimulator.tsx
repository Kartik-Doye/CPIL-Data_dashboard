import React, { useState } from 'react';
import { Sliders, DollarSign, Fuel, TrendingUp, Sparkles, RotateCcw, Check } from 'lucide-react';
import { ExecutiveTelemetry, WhatIfInput, WhatIfOutput } from '../types';

interface WhatIfSimulatorProps {
  data: ExecutiveTelemetry;
}

export const WhatIfSimulator: React.FC<WhatIfSimulatorProps> = ({ data }) => {
  const [inputs, setInputs] = useState<WhatIfInput>({
    free_sale_reduction_pct: 30,
    reopened_zero_sale_stations: Math.min(3, data.zero_sale_count),
    collection_efficiency_gain_pct: 25,
    market_demand_growth_pct: 5,
  });

  // Real-time calculations
  const baseSale = data.total_sale_qty;
  const baseColl = data.total_collection;
  const effRsp = data.effective_rsp;
  const freeSaleRs = data.total_free_sale_rupees;
  const collectionGapPerL = data.collection_gap_per_l;

  const freeSaleSavingsRs = Math.round((inputs.free_sale_reduction_pct / 100) * freeSaleRs);
  const zeroSaleLitreGain = inputs.reopened_zero_sale_stations * 1050;
  const zeroSaleRevenueGain = Math.round(zeroSaleLitreGain * effRsp);
  const efficiencyRecoveryRs = Math.round(
    (inputs.collection_efficiency_gain_pct / 100) * (collectionGapPerL * baseSale)
  );
  const demandVolumeGain = Math.round((inputs.market_demand_growth_pct / 100) * baseSale);
  const demandGainRs = Math.round(demandVolumeGain * effRsp);

  const projectedSale = Math.round(baseSale + zeroSaleLitreGain + demandVolumeGain);
  const deltaSale = projectedSale - baseSale;

  const projectedColl = Math.round(
    baseColl + freeSaleSavingsRs + zeroSaleRevenueGain + efficiencyRecoveryRs + demandGainRs
  );
  const deltaColl = projectedColl - baseColl;

  const applyPreset = (preset: 'conservative' | 'moderate' | 'aggressive') => {
    if (preset === 'conservative') {
      setInputs({
        free_sale_reduction_pct: 20,
        reopened_zero_sale_stations: 1,
        collection_efficiency_gain_pct: 15,
        market_demand_growth_pct: 2,
      });
    } else if (preset === 'moderate') {
      setInputs({
        free_sale_reduction_pct: 50,
        reopened_zero_sale_stations: Math.min(4, data.zero_sale_count),
        collection_efficiency_gain_pct: 35,
        market_demand_growth_pct: 6,
      });
    } else {
      setInputs({
        free_sale_reduction_pct: 80,
        reopened_zero_sale_stations: data.zero_sale_count,
        collection_efficiency_gain_pct: 60,
        market_demand_growth_pct: 12,
      });
    }
  };

  const handleReset = () => {
    setInputs({
      free_sale_reduction_pct: 0,
      reopened_zero_sale_stations: 0,
      collection_efficiency_gain_pct: 0,
      market_demand_growth_pct: 0,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header and Presets */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <Sliders className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-white">
                Executive What-If Financial & Volume Simulator
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Simulate strategic levers: tighten discount leakage, reactivate dormant stations, curb
              free sale litres, and model market demand swings.
            </p>
          </div>

          {/* Preset Buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 mr-1 hidden sm:inline">Presets:</span>
            <button
              onClick={() => applyPreset('conservative')}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
            >
              Conservative
            </button>
            <button
              onClick={() => applyPreset('moderate')}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
            >
              Moderate
            </button>
            <button
              onClick={() => applyPreset('aggressive')}
              className="text-xs px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 text-orange-300 border border-orange-500/30 transition-colors cursor-pointer"
            >
              Aggressive
            </button>
            <button
              onClick={handleReset}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Reset Levers to Zero"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Outcome Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Projected Collection */}
        <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-5 shadow-sm bg-gradient-to-b from-emerald-950/20 to-transparent">
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block mb-1">
            Projected Daily Collection
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-white">
              ₹{(projectedColl / 10000000).toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-slate-400">Crore</span>
          </div>
          <div className="mt-2 text-xs font-semibold text-emerald-400 font-mono">
            +{deltaColl >= 0 ? `₹${(deltaColl / 100000).toFixed(1)} Lakh` : `-₹${(Math.abs(deltaColl) / 100000).toFixed(1)} Lakh`} / day
          </div>
        </div>

        {/* Total Projected Volume */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Projected Daily Sales Volume
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-white">
              {projectedSale.toLocaleString('en-IN')}
            </span>
            <span className="text-xs font-semibold text-slate-400">Litres</span>
          </div>
          <div className="mt-2 text-xs font-semibold text-indigo-400 font-mono">
            +{deltaSale.toLocaleString('en-IN')} Litres ({((deltaSale / (baseSale || 1)) * 100).toFixed(1)}%)
          </div>
        </div>

        {/* Annualized Value Gain */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider block mb-1">
            Annualized Revenue Expansion
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-amber-300">
              ₹{((deltaColl * 365) / 10000000).toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-slate-400">Crore / yr</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Based on maintaining projected simulation parameters over 365 days
          </div>
        </div>
      </div>

      {/* Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Slider 1: Free Sale Reduction */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-white">
                1. Free Sale Reduction (%)
              </h4>
              <p className="text-[11px] text-slate-400">
                Baseline Free Sale: {data.total_free_sale_litres} L (₹{data.total_free_sale_rupees.toLocaleString('en-IN')})
              </p>
            </div>
            <span className="text-sm font-bold font-mono text-orange-400">
              {inputs.free_sale_reduction_pct}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={inputs.free_sale_reduction_pct}
            onChange={(e) =>
              setInputs({ ...inputs, free_sale_reduction_pct: Number(e.target.value) })
            }
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Direct Savings:</span>
            <span className="font-mono text-emerald-400 font-semibold">
              +₹{freeSaleSavingsRs.toLocaleString('en-IN')} / day
            </span>
          </div>
        </div>

        {/* Slider 2: Reopen Zero-Sale Stations */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-white">
                2. Reopen Zero-Sale Stations (Count)
              </h4>
              <p className="text-[11px] text-slate-400">
                {data.zero_sale_count} stations currently offline (~1,050 L/d recovery)
              </p>
            </div>
            <span className="text-sm font-bold font-mono text-orange-400">
              {inputs.reopened_zero_sale_stations} / {data.zero_sale_count}
            </span>
          </div>

          <input
            type="range"
            min="0"
            max={Math.max(1, data.zero_sale_count)}
            step="1"
            value={inputs.reopened_zero_sale_stations}
            onChange={(e) =>
              setInputs({ ...inputs, reopened_zero_sale_stations: Number(e.target.value) })
            }
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Volume & Revenue Recovery:</span>
            <span className="font-mono text-emerald-400 font-semibold">
              +{zeroSaleLitreGain.toLocaleString('en-IN')} L (+₹{(zeroSaleRevenueGain / 1000).toFixed(0)}k)
            </span>
          </div>
        </div>

        {/* Slider 3: Collection Efficiency Gain */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-white">
                3. Collection Efficiency Gain (%)
              </h4>
              <p className="text-[11px] text-slate-400">
                Tighten RSP gap (₹{collectionGapPerL.toFixed(2)}/L discount & scheme leakage)
              </p>
            </div>
            <span className="text-sm font-bold font-mono text-orange-400">
              {inputs.collection_efficiency_gain_pct}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={inputs.collection_efficiency_gain_pct}
            onChange={(e) =>
              setInputs({ ...inputs, collection_efficiency_gain_pct: Number(e.target.value) })
            }
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Leakage Recovered:</span>
            <span className="font-mono text-emerald-400 font-semibold">
              +₹{(efficiencyRecoveryRs / 1000).toFixed(0)}k / day
            </span>
          </div>
        </div>

        {/* Slider 4: Market Demand Growth */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-white">
                4. Market Demand Expansion (%)
              </h4>
              <p className="text-[11px] text-slate-400">
                Organic throughput growth via marketing and local fleet tie-ups
              </p>
            </div>
            <span className="text-sm font-bold font-mono text-orange-400">
              {inputs.market_demand_growth_pct}%
            </span>
          </div>

          <input
            type="range"
            min="-10"
            max="25"
            step="1"
            value={inputs.market_demand_growth_pct}
            onChange={(e) =>
              setInputs({ ...inputs, market_demand_growth_pct: Number(e.target.value) })
            }
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Net Additional Revenue:</span>
            <span className="font-mono text-emerald-400 font-semibold">
              +₹{(demandGainRs / 100000).toFixed(1)} Lakh / day
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
