import React from 'react';
import { DollarSign, AlertTriangle, ShieldCheck, TrendingDown, ArrowDownRight, Layers } from 'lucide-react';
import { ExecutiveTelemetry, StateSummary } from '../types';

interface RSPAnalysisProps {
  data: ExecutiveTelemetry;
}

export const RSPAnalysis: React.FC<RSPAnalysisProps> = ({ data }) => {
  const states = data.states_summary || [];
  const totalRevenueAtRisk = states.reduce((a, b) => a + b.revenue_at_risk, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <DollarSign className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-white">
                RSP Pricing Discipline & Collection Efficiency Audit
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Evaluates nominal retail selling price vs effective realized cash per litre. Pinpoints
              discount leakage, unauthorized schemes, and regional revenue at risk.
            </p>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs">
            <span className="text-slate-400 block text-[11px]">Total Network Revenue at Risk:</span>
            <span className="text-lg font-bold font-mono text-rose-400">
              ₹{(totalRevenueAtRisk / 100000).toFixed(2)} Lakh / day
            </span>
          </div>
        </div>
      </div>

      {/* Network Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-400 block mb-1">
            Weighted Nominal RSP
          </span>
          <div className="text-2xl font-bold font-mono text-white">
            ₹{data.average_rsp.toFixed(2)}{' '}
            <span className="text-xs font-sans text-slate-400 font-normal">/ L</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Official card rate configured across all dispensers
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-400 block mb-1">
            Effective Realized RSP
          </span>
          <div className="text-2xl font-bold font-mono text-emerald-300">
            ₹{data.effective_rsp.toFixed(2)}{' '}
            <span className="text-xs font-sans text-slate-400 font-normal">/ L</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Actual collection deposited divided by total volume sold
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-400 block mb-1">
            Collection Gap / Discount Leakage
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono ${
                data.collection_gap_per_l > 0.3 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              ₹{data.collection_gap_per_l.toFixed(2)}
            </span>
            <span className="text-xs text-slate-400">/ Litre</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {data.collection_gap_per_l > 0.3
              ? 'Moderate discount/scheme gap detected'
              : 'Pricing realization within safe corridor'}
          </p>
        </div>
      </div>

      {/* State-by-State RSP & Efficiency Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-white mb-3">
          State-by-State Realization & Revenue at Risk Breakdown
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/70 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">State</th>
                <th className="py-3 px-3 text-right">Stations</th>
                <th className="py-3 px-3 text-right">Volume (L)</th>
                <th className="py-3 px-3 text-right">Collection (₹)</th>
                <th className="py-3 px-3 text-right">Nominal RSP</th>
                <th className="py-3 px-3 text-right">Effective RSP</th>
                <th className="py-3 px-3 text-right">Gap / L</th>
                <th className="py-3 px-3 text-right">Revenue at Risk</th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {states.map((st) => {
                const isCritical = st.collection_gap_per_l >= 1.0;
                const isWarning = st.collection_gap_per_l >= 0.4 && !isCritical;

                return (
                  <tr key={st.state} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-sans font-bold text-white">{st.state}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{st.stations}</td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      {st.total_sale_qty.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400">
                      ₹{(st.total_collection / 100000).toFixed(1)} L
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400">
                      ₹{st.nominal_rsp.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-white">
                      ₹{st.effective_rsp.toFixed(2)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold ${
                        isCritical
                          ? 'text-rose-400'
                          : isWarning
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      ₹{st.collection_gap_per_l.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-rose-300 font-bold">
                      {st.revenue_at_risk > 0
                        ? `₹${st.revenue_at_risk.toLocaleString('en-IN')}`
                        : '₹0'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-sans">
                      <span
                        className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          isCritical
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : isWarning
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }`}
                      >
                        {isCritical ? 'High Leakage' : isWarning ? 'Moderate Gap' : 'Healthy'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
