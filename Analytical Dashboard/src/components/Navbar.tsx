import React from 'react';
import { Flame, RefreshCw, Download, CheckCircle, AlertTriangle, Sun, Moon, PanelLeft, Database } from 'lucide-react';
import { ExecutiveTelemetry } from '../types';

interface NavbarProps {
  data: ExecutiveTelemetry | null;
  loading: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onRefresh: () => void;
  onExportCSV: () => void;
  onOpenDrawer?: () => void;
  onOpenDbInspector?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  data,
  loading,
  theme,
  onToggleTheme,
  onRefresh,
  onExportCSV,
  onOpenDrawer,
  onOpenDbInspector,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 py-3 transition-colors">
      <div className="flex items-center justify-between gap-4">
        {/* Brand & Drawer Toggle */}
        <div className="flex items-center gap-3">
          {onOpenDrawer && (
            <button
              onClick={onOpenDrawer}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              title="Open Reports Navigation Drawer"
            >
              <PanelLeft className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </button>
          )}

          <div className="h-10 w-10 rounded-xl bg-linear-to-tr from-amber-600 to-orange-500 flex items-center justify-center shadow-xs ring-1 ring-white/10 shrink-0">
            <Flame className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>GO Gas</span>
                <span className="text-orange-600 dark:text-orange-400 font-semibold text-xs tracking-wider uppercase px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20">
                  Executive Suite
                </span>
              </h1>
              {data && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live ALDS Telemetry
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <span>AutoLPG Distribution Network</span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {data?.date ? `Data: ${data.date}` : 'Loading...'}
              </span>
              {data?.source_file && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <button
                    type="button"
                    onClick={onOpenDbInspector}
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      data.db_diagnostics?.engine === 'external'
                        ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-950/80 dark:text-indigo-300 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800' 
                        : 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:hover:bg-amber-900 border border-amber-300 dark:border-amber-800'
                    }`}
                    title="Click to inspect PostgreSQL Database Connection & Query Diagnostics"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      data.db_diagnostics?.connected && data.db_diagnostics.engine === 'external' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                    }`} />
                    <span>Source: {data.source_file}</span>
                    <span className="text-[9px] opacity-75 font-normal underline decoration-dotted">Verify DB</span>
                  </button>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Network Status Quick Stats */}
        {data && (
          <div className="hidden md:flex items-center gap-4 bg-slate-50 dark:bg-slate-950/60 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <div className="text-xs">
              <span className="text-slate-500 dark:text-slate-400">Total Stations: </span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">{data.stations_total}</span>
            </div>
            <div className="w-px h-3 bg-slate-200 dark:bg-slate-800" />
            <div className="text-xs flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{data.stations_with_sale} Active</span>
            </div>
            <div className="w-px h-3 bg-slate-200 dark:bg-slate-800" />
            <div className="text-xs flex items-center gap-1 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{data.zero_sale_count} Zero Sale</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* PostgreSQL DB Inspector Button */}
          <button
            onClick={onOpenDbInspector}
            className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors shadow-xs cursor-pointer ${
              data?.db_diagnostics?.connected && data.db_diagnostics.engine === 'external'
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 dark:text-indigo-300 dark:border-indigo-800'
            }`}
            title="Inspect PostgreSQL Database Connection & Live Query Results"
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">DB Inspector</span>
          </button>

          {/* Light / Dark Mode Toggle Button */}
          <button
            onClick={onToggleTheme}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? (
              <>
                <Moon className="w-4 h-4 text-indigo-600" />
                <span className="hidden sm:inline">Dark</span>
              </>
            ) : (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Light</span>
              </>
            )}
          </button>

          <button
            onClick={onExportCSV}
            className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            title="Export complete station data to CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh Telemetry"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-500' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
};
