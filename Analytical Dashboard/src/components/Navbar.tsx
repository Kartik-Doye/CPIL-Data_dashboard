import React from 'react';
import { Flame, RefreshCw, Download, CheckCircle, AlertTriangle, Sun, Moon, PanelLeft, Database } from 'lucide-react';
import { ExecutiveTelemetry, DatabaseDiagnostics } from '../types';
import { getDbConnectionHealth } from '../engine/dbHealth';

interface NavbarProps {
  data: ExecutiveTelemetry | null;
  loading: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onRefresh: () => void;
  onExportCSV: () => void;
  onOpenDrawer?: () => void;
  onOpenDbInspector?: () => void;
  onOpenWhatsApp?: () => void;
  dbDiagnostics?: DatabaseDiagnostics | null;
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
  onOpenWhatsApp,
  dbDiagnostics,
}) => {
  const health = getDbConnectionHealth(dbDiagnostics || data?.db_diagnostics, loading);

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* 1. PostgreSQL Visual Health Top Indicator Stripe */}
      <div
        data-testid="navbar-pg-health-stripe"
        className={`h-1.5 w-full bg-linear-to-r ${health.barGradient} transition-all duration-500`}
        title={`PostgreSQL Connection Health: ${health.label}`}
        role="status"
        aria-label={`PostgreSQL Connection Health: ${health.label}`}
      />

      <div className="px-4 lg:px-6 py-2.5">
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

                {/* Top Visual Status Indicator Badge based on db_diagnostics */}
                <button
                  type="button"
                  onClick={onOpenDbInspector}
                  data-testid="navbar-pg-health-badge"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer shadow-2xs ${health.badgeBg} ${health.badgeText} ${health.badgeBorder} hover:opacity-90`}
                  title={health.tooltip}
                  aria-label={`PostgreSQL Status: ${health.label}. Click to inspect database.`}
                >
                  <span className="relative flex h-2 w-2">
                    {health.status === 'healthy' && (
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${health.pingColor}`} />
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${health.dotColor}`} />
                  </span>
                  <Database className="w-3 h-3 shrink-0 opacity-80" />
                  <span className="font-semibold">{health.shortLabel}</span>
                  <span className="hidden sm:inline font-mono text-[10px] opacity-75">
                    ({health.host}:{health.port})
                  </span>
                </button>

                {data && (
                  <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live ALDS Telemetry
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <span>AutoLPG Distribution Network</span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {data?.date ? `Data: ${data.date}` : 'Awaiting DB Connection'}
                </span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <button
                  type="button"
                  onClick={onOpenDbInspector}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline decoration-dotted transition-colors cursor-pointer"
                  title="Open PostgreSQL Database Inspector"
                >
                  <span>DB: {health.database}</span>
                </button>
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
          {/* WhatsApp Automation Center Button */}
          {onOpenWhatsApp && (
            <button
              onClick={onOpenWhatsApp}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors shadow-xs cursor-pointer bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-800"
              title="Open WhatsApp Automation Center & Delivery Logs"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.97.534 1.769.813 2.796.813h.005c3.18 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.767-5.77-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.634.072-1.802-.411-.979-.406-1.636-1.393-1.685-1.458-.048-.065-.399-.533-.399-1.018 0-.485.253-.724.343-.823.09-.099.196-.124.262-.124.066 0 .132.001.19.004.061.003.143-.023.223.17.082.198.28.684.305.733.025.049.041.107.008.172-.033.065-.05.105-.099.163-.049.058-.103.13-.147.175-.049.049-.1.102-.043.2.057.098.256.422.548.683.376.335.693.438.791.488.098.049.156.041.214-.025.058-.066.246-.288.312-.386.066-.099.132-.082.222-.049.09.033.57.269.668.318.098.049.164.074.188.115.024.041.024.239-.12.644z" />
              </svg>
              <span className="hidden sm:inline">WhatsApp</span>
            </button>
          )}

          {/* PostgreSQL DB Inspector Button */}
          <button
            onClick={onOpenDbInspector}
            className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors shadow-xs cursor-pointer ${health.badgeBg} ${health.badgeText} ${health.badgeBorder} hover:opacity-90`}
            title={`Inspect PostgreSQL Database Connection (${health.label})`}
          >
            <span className={`w-2 h-2 rounded-full ${health.dotColor}`} />
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
            disabled={!data}
            className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            title={data ? "Export complete station data to CSV" : "Data unavailable for export"}
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
    </div>
  </header>
);
};
