import React from 'react';
import { Layers, PieChart, TrendingUp, Building2 } from 'lucide-react';
import { TypeSummary } from '../types';

interface StationTypeAnalysisProps {
  types: TypeSummary[];
  totalVolume: number;
}

export const StationTypeAnalysis: React.FC<StationTypeAnalysisProps> = ({
  types,
  totalVolume,
}) => {
  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">
              Station Operating Model Analysis (LOCO, JODO, DODO, JOCO, COCO)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Comparative throughput and revenue contribution across company-owned vs dealer-operated
              business models.
            </p>
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {types.map((tp) => (
          <div
            key={tp.type}
            className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-white px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700">
                {tp.type} Model
              </span>
              <span className="text-xs font-mono font-bold text-orange-400">
                {tp.share_pct}% Volume Share
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-baseline">
                <span className="text-slate-400">Station Count:</span>
                <span className="font-mono font-semibold text-white">{tp.stations}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-slate-400">Total Volume Sold:</span>
                <span className="font-mono font-bold text-indigo-300">
                  {tp.total_sale_qty.toLocaleString('en-IN')} L
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-slate-400">Total Collections:</span>
                <span className="font-mono font-bold text-emerald-400">
                  ₹{(tp.total_collection / 100000).toFixed(1)} Lakh
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-800">
                <span className="text-slate-400">Avg Throughput / Stn:</span>
                <span className="font-mono font-semibold text-white">
                  {tp.avg_sale_per_station.toLocaleString('en-IN')} L/d
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Business Model Descriptions */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 space-y-2">
        <h4 className="font-semibold text-slate-200">Business Model Definitions:</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div>
            • <strong>LOCO:</strong> Lease Operated Company Owned (Strategic core company assets)
          </div>
          <div>
            • <strong>DODO:</strong> Dealer Owned Dealer Operated (Franchise partner model)
          </div>
          <div>
            • <strong>JODO:</strong> Jointly Owned Dealer Operated (Co-investment model)
          </div>
          <div>
            • <strong>COCO:</strong> Company Owned Company Operated (Flagship network hubs)
          </div>
        </div>
      </div>
    </div>
  );
};
