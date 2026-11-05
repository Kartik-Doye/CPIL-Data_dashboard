import React, { useState } from 'react';
import { Database, CheckCircle2, AlertCircle, Copy, Check, RefreshCw, X, Server, Layers, HelpCircle, ArrowRight } from 'lucide-react';
import { DatabaseDiagnostics, ExecutiveTelemetry } from '../types';
import { fmtQty, fmtCurrency } from '../engine/formatting';

interface DatabaseInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  diagnostics?: DatabaseDiagnostics;
  telemetry: ExecutiveTelemetry | null;
  onReverify: () => void;
  loading: boolean;
}

export const DatabaseInspectorModal: React.FC<DatabaseInspectorModalProps> = ({
  isOpen,
  onClose,
  diagnostics,
  telemetry,
  onReverify,
  loading,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const connString = diagnostics?.connection_string || 'postgresql://bot_reader:****@localhost:5432/sale_alds';
  const isConnected = diagnostics?.connected ?? false;
  const isExternalConnected = isConnected && diagnostics?.engine === 'external';
  const discrepancy = diagnostics?.discrepancy_analysis;

  const copyConnectionString = () => {
    navigator.clipboard.writeText(connString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isExternalConnected
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
                : isConnected
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30'
            }`}>
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  PostgreSQL Database & Backend Verification
                </h3>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                  isExternalConnected
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                    : isConnected
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
                }`}>
                  {isExternalConnected ? 'External PostgreSQL Connected' : isConnected ? 'Embedded Fallback Active' : 'DB Offline'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Real-time connection verification and SQL query audit against <code className="font-mono text-slate-700 dark:text-slate-300">sale_tracker</code>.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Connection String Box */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-orange-500" />
                <span>Backend Database Connection String</span>
              </span>
              <button
                onClick={copyConnectionString}
                className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy String'}</span>
              </button>
            </div>
            <div className="font-mono text-xs p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-orange-600 dark:text-orange-400 break-all select-all">
              {connString}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
              <div>Host: <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{diagnostics?.host || 'localhost'}</span></div>
              <div>Port: <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{diagnostics?.port || 5432}</span></div>
              <div>Database: <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{diagnostics?.database || 'sale_alds'}</span></div>
              <div>User: <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{diagnostics?.user || 'bot_reader'}</span></div>
            </div>
          </div>

          {/* Discrepancy & Status Alert Box */}
          <div className={`p-4 rounded-xl border ${
            discrepancy?.has_discrepancy || !isConnected
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200'
              : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
          }`}>
            <div className="flex items-start gap-2.5">
              {discrepancy?.has_discrepancy || !isConnected ? (
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <span className="font-bold text-xs block">
                  {discrepancy?.has_discrepancy || !isConnected ? 'Data Discrepancy & Diagnostic Notice' : 'Database Communication Verified'}
                </span>
                <p className="text-xs leading-relaxed opacity-90">
                  {discrepancy?.reason || (isConnected ? 'The dashboard is successfully connected to PostgreSQL and UI records match the database.' : diagnostics?.error)}
                </p>
              </div>
            </div>
          </div>

          {/* Side-by-Side Verification Comparison */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>UI State vs PostgreSQL Database Records Audit</span>
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Metric Parameter</th>
                    <th className="py-2.5 px-3 text-slate-800 dark:text-slate-200">Current UI Rendered</th>
                    <th className="py-2.5 px-3 text-indigo-600 dark:text-indigo-400">PostgreSQL Live DB</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-400">Data Source</td>
                    <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">{telemetry?.source_file || '—'}</td>
                    <td className="py-2 px-3 text-indigo-600 dark:text-indigo-400">{isConnected ? 'PostgreSQL (sale_tracker)' : 'Offline / Unavailable'}</td>
                    <td className="py-2 px-3 text-center font-sans">
                      {telemetry?.source_file.includes('PostgreSQL') ? (
                        <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">Matched</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 text-[10px] font-semibold">Fallback</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-400">Active Date</td>
                    <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">{telemetry?.date || '—'}</td>
                    <td className="py-2 px-3 text-indigo-600 dark:text-indigo-400">{diagnostics?.latest_date || '—'}</td>
                    <td className="py-2 px-3 text-center font-sans">
                      {telemetry?.date === diagnostics?.latest_date ? (
                        <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">Match</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 text-[10px] font-semibold">Diff</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-400">Total Stations</td>
                    <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">{telemetry?.stations_total ?? '—'} stns</td>
                    <td className="py-2 px-3 text-indigo-600 dark:text-indigo-400">{diagnostics?.latest_date_stations ?? '—'} stns</td>
                    <td className="py-2 px-3 text-center font-sans">
                      {telemetry?.stations_total === diagnostics?.latest_date_stations ? (
                        <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">Match</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 text-[10px] font-semibold">Diff</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-400">Total Sales Volume</td>
                    <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">{telemetry ? fmtQty(telemetry.total_sale_qty) : '—'} L</td>
                    <td className="py-2 px-3 text-indigo-600 dark:text-indigo-400">{diagnostics?.latest_date_sale_qty ? fmtQty(diagnostics.latest_date_sale_qty) : '—'} L</td>
                    <td className="py-2 px-3 text-center font-sans">
                      {Math.round(telemetry?.total_sale_qty || 0) === Math.round(diagnostics?.latest_date_sale_qty || 0) ? (
                        <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">Match</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 text-[10px] font-semibold">Diff</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-400">Total DB Rows & Range</td>
                    <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">30-day window</td>
                    <td className="py-2 px-3 text-indigo-600 dark:text-indigo-400">
                      {diagnostics?.total_rows ? `${diagnostics.total_rows.toLocaleString()} rows (${diagnostics.min_date} to ${diagnostics.max_date})` : '0 rows'}
                    </td>
                    <td className="py-2 px-3 text-center font-sans">
                      <span className="text-slate-500 text-[10px]">Info</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Sample DB Query Records */}
          {diagnostics?.sample_records && diagnostics.sample_records.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Live Sample Query Results from PostgreSQL (<code className="font-mono">sale_tracker</code>)
              </h4>
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase text-[9px] font-semibold">
                    <tr>
                      <th className="py-1.5 px-3">Code</th>
                      <th className="py-1.5 px-3">Station Name</th>
                      <th className="py-1.5 px-2">State</th>
                      <th className="py-1.5 px-3 text-right">Sale Qty</th>
                      <th className="py-1.5 px-3 text-right">Collection</th>
                      <th className="py-1.5 px-3 text-right">Closing Dip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {diagnostics.sample_records.map((r) => (
                      <tr key={r.erp_code} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-1.5 px-3 font-bold text-orange-600 dark:text-orange-400">{r.erp_code}</td>
                        <td className="py-1.5 px-3 font-sans font-semibold text-slate-800 dark:text-slate-200 truncate max-w-40">{r.alds_name}</td>
                        <td className="py-1.5 px-2 font-sans">{r.state}</td>
                        <td className="py-1.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">{fmtQty(r.sale_qty)} L</td>
                        <td className="py-1.5 px-3 text-right">{fmtCurrency(r.collection)}</td>
                        <td className="py-1.5 px-3 text-right text-slate-500">{fmtQty(r.closing_dip_in_ltr)} L</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="text-slate-500 dark:text-slate-400 text-[11px]">
            Server Audit Checked: {diagnostics?.server_timestamp ? new Date(diagnostics.server_timestamp).toLocaleTimeString() : 'Just now'}
          </span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={onReverify}
              disabled={loading}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Re-verifying DB...' : 'Re-verify Database Connection'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
