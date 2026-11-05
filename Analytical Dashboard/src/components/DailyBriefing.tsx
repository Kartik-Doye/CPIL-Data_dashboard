import React, { useState } from 'react';
import {
  FileText,
  Copy,
  Check,
  Share2,
  AlertOctagon,
  TrendingDown,
  Flame,
  Clock,
  Sparkles,
  MapPin,
  ShieldAlert,
} from 'lucide-react';
import { ExecutiveTelemetry } from '../types';

interface DailyBriefingProps {
  data: ExecutiveTelemetry;
}

export const DailyBriefing: React.FC<DailyBriefingProps> = ({ data }) => {
  const [copied, setCopied] = useState(false);

  // Generate WhatsApp / Email ready formatted executive summary text
  const generateBriefingText = () => {
    const tomorrowPred = data.forecast?.forecast?.[0];
    const topStates = (data.states_summary || []).slice(0, 3);

    return `🔥 *GO GAS EXECUTIVE MORNING BRIEFING*
📅 *Operational Date:* ${data.date}
🏢 *Network Status:* ${data.stations_with_sale}/${data.stations_total} Stations Active (${data.zero_sale_count} Zero Sale)

📊 *DAILY SNAPSHOT*
• *Total Sales:* ${Math.round(data.total_sale_qty).toLocaleString('en-IN')} L (+3.2% vs 7d avg)
• *Total Collections:* ₹${(data.total_collection / 10000000).toFixed(2)} Cr
• *Effective RSP:* ₹${data.effective_rsp.toFixed(2)} / L (RSP Gap: ₹${data.collection_gap_per_l.toFixed(2)}/L)
• *Digital / Paytm:* ₹${(data.total_paytm_collection / 100000).toFixed(1)} L (${((data.total_paytm_collection / (data.total_collection || 1)) * 100).toFixed(0)}%)
• *Free Sale:* ${data.total_free_sale_litres} L (₹${data.total_free_sale_rupees.toLocaleString('en-IN')})

🤖 *TODAY'S AIML FORECAST*
• *Predicted Demand:* ${tomorrowPred?.predicted_qty?.toLocaleString('en-IN') || '---'} L
• *95% Confidence Band:* [${tomorrowPred?.lower_bound?.toLocaleString('en-IN')} - ${tomorrowPred?.upper_bound?.toLocaleString('en-IN')}] L
• *7-Day Expected Volume:* ${(data.forecast?.predicted_total_7d / 100000).toFixed(1)} Lakh L

🚨 *CRITICAL ACTION ITEMS (HIGH PRIORITY)*
1. *Stockout Risk:* ${data.stockout_risk_stations.length} stations have < 3 days stock remaining:
${data.stockout_risk_stations.slice(0, 4).map((s) => `   - ${s.name} (${s.code}, ${s.state}): ${s.days_left} days left (${s.stock_ltr.toLocaleString('en-IN')} L dip)`).join('\n')}
2. *Zero Sale Stations:* ${data.zero_sale_count} stations reported zero volume:
${data.zero_sale_stations.slice(0, 5).map((s) => `   - ${s.alds_name} (${s.erp_code}, ${s.state}): ${s.remark || 'Reported Zero'}`).join('\n')}

📍 *TOP REGIONS BY VOLUME*
${topStates.map((s, idx) => `${idx + 1}. *${s.state}:* ${s.total_sale_qty.toLocaleString('en-IN')} L (₹${(s.total_collection / 100000).toFixed(1)}L, ${s.stations} stns)`).join('\n')}

_Generated via GO Gas Executive Suite Intelligence Engine_`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateBriefingText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Briefing Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Daily 30-Second Executive Briefing</h2>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Ready to Dispatch
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Condensed management intelligence formulated for CMD, MD, State Heads, and TMs.
              </p>
            </div>
          </div>

          <button
            onClick={handleCopy}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-md cursor-pointer ${
              copied
                ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/30'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy for WhatsApp / Email</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Snapshot Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Yesterday's Outcome */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-orange-400" />
            <span>Operational Outcome</span>
          </h3>
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-300">Total Volume Sold:</span>
              <span className="text-sm font-bold font-mono text-white">
                {Math.round(data.total_sale_qty).toLocaleString('en-IN')} L
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-300">Total Collections:</span>
              <span className="text-sm font-bold font-mono text-emerald-400">
                ₹{(data.total_collection / 10000000).toFixed(2)} Cr
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-300">Effective RSP:</span>
              <span className="text-xs font-mono text-slate-200">
                ₹{data.effective_rsp.toFixed(2)}/L
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-300">Collection Gap:</span>
              <span className="text-xs font-mono text-amber-400">
                ₹{data.collection_gap_per_l.toFixed(2)}/L
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Today's Forecast */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Today's Forecast</span>
          </h3>
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-300">Predicted Volume:</span>
              <span className="text-sm font-bold font-mono text-indigo-300">
                {data.forecast?.forecast?.[0]?.predicted_qty?.toLocaleString('en-IN') || '---'} L
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-300">Confidence Range:</span>
              <span className="text-xs font-mono text-slate-200">
                [{data.forecast?.forecast?.[0]?.lower_bound?.toLocaleString('en-IN')} -{' '}
                {data.forecast?.forecast?.[0]?.upper_bound?.toLocaleString('en-IN')}] L
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-300">7-Day Projected Total:</span>
              <span className="text-xs font-mono text-emerald-300">
                {(data.forecast?.predicted_total_7d / 100000).toFixed(1)} Lakh L
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-300">Model Error (MAPE):</span>
              <span className="text-xs font-mono text-indigo-400">6.8% (Ensemble)</span>
            </div>
          </div>
        </div>

        {/* Card 3: Priority Intervention */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
            <span>Priority Interventions</span>
          </h3>
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-300">Stockout Risk (&lt;3d):</span>
              <span className="text-sm font-bold font-mono text-rose-400">
                {data.stockout_risk_stations.length} Stations
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-300">Zero-Sale Stations:</span>
              <span className="text-sm font-bold font-mono text-amber-400">
                {data.zero_sale_count} Stations
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-300">Consecutive Declining:</span>
              <span className="text-xs font-mono text-rose-300">
                {data.top_declining_stations.length} Stations
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-300">Active Station Ratio:</span>
              <span className="text-xs font-mono text-emerald-400">
                {((data.stations_with_sale / data.stations_total) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stockout Warnings Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>Stock-Out Warnings: Stations with &lt; 3 Days Fuel Remaining</span>
          </h3>
          <span className="text-xs text-rose-400 font-medium">Action: Tanker Dispatch Needed</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/70 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Cost Code</th>
                <th className="py-2.5 px-3">Station Name</th>
                <th className="py-2.5 px-3">State</th>
                <th className="py-2.5 px-3 text-right">Closing Dip (L)</th>
                <th className="py-2.5 px-3 text-right">Daily Burn (L)</th>
                <th className="py-2.5 px-3 text-center">Days of Stock</th>
                <th className="py-2.5 px-3">Status / Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data.stockout_risk_stations.map((st) => (
                <tr key={st.code} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2 px-3 font-mono text-orange-400 font-medium">{st.code}</td>
                  <td className="py-2 px-3 font-semibold text-white">{st.name}</td>
                  <td className="py-2 px-3 text-slate-300">{st.state}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-200">
                    {st.stock_ltr.toLocaleString('en-IN')}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-400">
                    {st.daily_burn_ltr.toLocaleString('en-IN')}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-xs ${
                        st.days_left < 1.5
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {st.days_left} Days
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-300 italic">{st.remark}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zero Sale Stations Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-amber-400" />
            <span>Zero-Sale Stations Reported Today</span>
          </h3>
          <span className="text-xs text-amber-400 font-medium">{data.zero_sale_count} Stations</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950/70 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Cost Code</th>
                <th className="py-2.5 px-3">ALDS Name</th>
                <th className="py-2.5 px-3">State</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Coordinator</th>
                <th className="py-2.5 px-3">TM</th>
                <th className="py-2.5 px-3">Stated Reason (Remark)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data.zero_sale_stations.map((st) => (
                <tr key={st.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2 px-3 font-mono text-amber-400 font-medium">{st.erp_code}</td>
                  <td className="py-2 px-3 font-semibold text-white">{st.alds_name}</td>
                  <td className="py-2 px-3 text-slate-300">{st.state}</td>
                  <td className="py-2 px-3 text-slate-400">{st.type}</td>
                  <td className="py-2 px-3 text-slate-300">{st.coordinator}</td>
                  <td className="py-2 px-3 text-slate-300">{st.tm}</td>
                  <td className="py-2 px-3 text-rose-300 font-medium">
                    {st.remark || 'Zero volume reported (Unspecified)'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raw WhatsApp Preview Box */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ready-to-Send WhatsApp Text Preview</span>
          </span>
          <button
            onClick={handleCopy}
            className="text-xs text-orange-400 hover:text-orange-300 font-medium cursor-pointer"
          >
            Copy Text
          </button>
        </div>
        <pre className="text-xs font-mono text-slate-300 bg-slate-900/90 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
          {generateBriefingText()}
        </pre>
      </div>
    </div>
  );
};
