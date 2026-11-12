import React, { useState, useEffect, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { Navigation, ReportTab } from './components/Navigation';
import { FilterBar, FilterState } from './components/FilterBar';
import { MasterDashboard } from './components/MasterDashboard';
import { DailyBriefing } from './components/DailyBriefing';
import { AIMLForecast } from './components/AIMLForecast';
import { WhatIfSimulator } from './components/WhatIfSimulator';
import { DataAnalysisSuite } from './components/DataAnalysisSuite';
import { RSPAnalysis } from './components/RSPAnalysis';
import { StateAnalysis } from './components/StateAnalysis';
import { StationDirectory } from './components/StationDirectory';
import { TeamPerformance } from './components/TeamPerformance';
import { StationTypeAnalysis } from './components/StationTypeAnalysis';
import { StationHeatmap } from './components/StationHeatmap';
import { TargetTracker } from './components/TargetTracker';
import { AdHocExplorer } from './components/AdHocExplorer';
import { AllReportsDirectory } from './components/AllReportsDirectory';
import { TankerDispatchReport } from './components/TankerDispatchReport';
import { ReportsSideDrawer } from './components/ReportsSideDrawer';
import { RSPDisparityReport } from './components/RSPDisparityReport';
import { FreeSaleLeakageAudit } from './components/FreeSaleLeakageAudit';
import { TMLeaderboard } from './components/TMLeaderboard';
import { CustomerChurnPredictor } from './components/CustomerChurnPredictor';
import { DatabaseInspectorModal } from './components/DatabaseInspectorModal';
import { WhatsAppModal } from './components/WhatsAppModal';
import { ExecutiveTelemetry, StationRecord, DatabaseDiagnostics } from './types';
import { Loader2, AlertCircle, Database, RefreshCw } from 'lucide-react';
import productConfig from '../../product-config.json';

export function App() {
  const [data, setData] = useState<ExecutiveTelemetry | null>(null);
  const [dbDiagnostics, setDbDiagnostics] = useState<DatabaseDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>('master');
  const [isDbInspectorOpen, setIsDbInspectorOpen] = useState(false);
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isCompact, setIsCompact] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sync theme with document element
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  const toggleCompact = () => setIsCompact((prev) => !prev);

  const [filters, setFilters] = useState<FilterState>({
    state: 'ALL',
    type: 'ALL',
    tm: 'ALL',
    search: '',
    compareMode: false,
    period: 'today',
  });

  /**
   * Logs comprehensive PostgreSQL connection diagnostics and query audit results to the browser console.
   * Enables engineers to debug connection strings, live record counts, date boundaries, and data discrepancies.
   */
  const logDatabaseDiagnostics = (telemetry: ExecutiveTelemetry) => {
    const diag = telemetry.db_diagnostics;
    if (!diag) {
      console.warn('[DB DIAGNOSTICS] No database diagnostics attached to telemetry response.');
      return;
    }

    const isConnected = diag.connected;
    const discrepancy = diag.discrepancy_analysis;
    const isExternalConnected = isConnected && diag.engine === 'external';
    const connBadge = isExternalConnected
      ? '%c ONLINE (External PostgreSQL) '
      : '%c OFFLINE ';
    const badgeStyle = isExternalConnected
      ? 'background: #059669; color: #ffffff; font-weight: bold; padding: 2px 6px; border-radius: 4px;'
      : 'background: #dc2626; color: #ffffff; font-weight: bold; padding: 2px 6px; border-radius: 4px;';
    const titleStyle = 'font-weight: bold; color: #f97316; font-size: 13px;';
    const sectionHeader = 'color: #6366f1; font-weight: bold; font-size: 11px;';

    console.groupCollapsed(
      `%c[GO Gas DB Engine]%c Database Status: ${connBadge}%c Source: %c${telemetry.source_file}`,
      titleStyle,
      'color: #94a3b8; font-weight: normal;',
      badgeStyle,
      'color: #94a3b8;',
      'font-weight: bold; color: #e2e8f0;'
    );

    // 1. Connection String & Parameters
    console.group('%c1. Database Connection Parameters & Credentials%c', sectionHeader, 'color: inherit;');
    console.info(`Connection String : %c${diag.connection_string}`, 'font-family: monospace; color: #ea580c; font-weight: bold;');
    console.info(`Target Host       : ${diag.host}:${diag.port}`);
    console.info(`Target Database   : ${diag.database}`);
    console.info(`Database User     : ${diag.user}`);
    console.info(`Connection State  : ${isExternalConnected ? 'Connected to PostgreSQL (sale_tracker)' : 'Disconnected / Refused'}`);
    console.info(`Active Telemetry  : ${diag.active_source} (${telemetry.source_file})`);
    if (diag.error || diag.external_connection_error) {
      console.warn(`Database Notice   : ${diag.error || diag.external_connection_error}`);
    }
    console.groupEnd();

    // 2. Query Results & Aggregates from sale_tracker
    console.group('%c2. Live PostgreSQL Query Audit (Table: sale_tracker)%c', sectionHeader, 'color: inherit;');
    if (isConnected) {
      console.info(`Total Rows in DB    : ${(diag.total_rows ?? 0).toLocaleString()} records`);
      console.info(`Date Range in DB    : ${diag.min_date || 'N/A'} to ${diag.max_date || 'N/A'} (${diag.distinct_days || 0} distinct days)`);
      console.info(`Distinct Stations   : ${diag.distinct_stations || 0} stations tracked`);
      console.info(`Total Volume in DB  : ${(diag.total_volume ?? 0).toLocaleString()} Litres`);
      console.info(`Latest Date in DB   : ${diag.latest_date || 'N/A'}`);
      console.info(`Latest Date Station : ${diag.latest_date_stations || 0} active stations`);
      console.info(`Latest Date Volume  : ${(diag.latest_date_sale_qty ?? 0).toLocaleString()} Litres`);
      console.info(`Latest Date Revenue : ₹${(diag.latest_date_collection ?? 0).toLocaleString()}`);

      if (diag.sample_records && diag.sample_records.length > 0) {
        console.info('%cTop 5 Station Records (Latest Date Query Sample):', 'color: #3b82f6; font-weight: bold;');
        console.table(diag.sample_records);
      }
    } else {
      console.warn(
        `PostgreSQL database is currently OFFLINE at ${diag.host}:${diag.port}.\n` +
        `Reason: ${diag.error || 'Connection ECONNREFUSED'}.\n` +
        'No fallback data is served; connect PostgreSQL to restore dashboard data.'
      );
    }
    console.groupEnd();

    // 3. Discrepancy Analysis (UI State vs Live DB)
    console.group('%c3. Discrepancy Analysis (UI Rendered vs Live DB)%c', sectionHeader, 'color: inherit;');
    console.info(`Has Discrepancy?    : ${discrepancy?.has_discrepancy ? '⚠️ YES' : '✅ NO (Fully Synchronized)'}`);
    console.info(`Diagnosis Details   : ${discrepancy?.reason || 'All UI metrics match live PostgreSQL records.'}`);
    
    console.table([
      {
        'Metric': 'Data Source',
        'UI Rendered': telemetry.source_file,
        'PostgreSQL DB': isConnected ? `sale_tracker (${diag.database})` : 'Offline',
        'Sync Status': telemetry.source_file.includes('PostgreSQL') ? 'DATABASE' : 'UNEXPECTED SOURCE'
      },
      {
        'Metric': 'Active Date',
        'UI Rendered': telemetry.date,
        'PostgreSQL DB': diag.latest_date || 'N/A',
        'Sync Status': telemetry.date === diag.latest_date ? 'MATCHED' : 'DISCREPANCY'
      },
      {
        'Metric': 'Total Stations',
        'UI Rendered': telemetry.stations_total,
        'PostgreSQL DB': diag.latest_date_stations ?? 'N/A',
        'Sync Status': telemetry.stations_total === diag.latest_date_stations ? 'MATCHED' : 'DISCREPANCY'
      },
      {
        'Metric': 'Daily Sales Volume',
        'UI Rendered': `${telemetry.total_sale_qty.toLocaleString()} L`,
        'PostgreSQL DB': diag.latest_date_sale_qty ? `${diag.latest_date_sale_qty.toLocaleString()} L` : 'N/A',
        'Sync Status': telemetry.total_sale_qty === diag.latest_date_sale_qty ? 'MATCHED' : 'DISCREPANCY'
      }
    ]);

    if (discrepancy?.has_discrepancy) {
      console.warn(`[DATA DISCREPANCY DETECTED] ${discrepancy.reason}`);
    } else {
      console.info('✅ PostgreSQL database communication and data integrity verified.');
    }
    console.groupEnd();

    console.groupEnd();
  };

  /**
   * Refactored fetchData function:
   * - Queries /api/telemetry (with optional forceRefresh to re-run DB audit)
   * - Validates response content-type
   * - Triggers deep console logging of connection string, live DB stats, and discrepancy analysis
   */
  const fetchData = async (forceRefresh = false, retryCount = 0) => {
    setLoading(true);
    setError(null);
    let shouldRetry = false;
    try {
      const url = `/api/telemetry${forceRefresh ? '?refresh=true' : ''}`;
      const res = await fetch(url);
      
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || `Server error (HTTP ${res.status})`);
        }
        if (json.db_diagnostics) {
          setDbDiagnostics(json.db_diagnostics);
        }
        setData(json);
        logDatabaseDiagnostics(json);

        if (forceRefresh) {
          if (json.db_diagnostics?.connected && json.db_diagnostics.engine === 'external') {
            showToast('Database connection and query audit re-verified successfully!');
          } else {
            showToast('External PostgreSQL is unavailable. Dashboard data is not being served.');
          }
        }
        return;
      }

      // If response is HTML (e.g. cloud container startup splash screen or Vite building)
      const text = await res.text();
      const isStartupScreen = text.includes('Starting Server...') || text.includes('<!doctype html') || text.includes('<title>');
      
      if (isStartupScreen && retryCount < productConfig.ui.startupMaxRetries) {
        console.info(
          `[Server Booting] Waiting for server engine to initialize (attempt ${retryCount + 1}/${productConfig.ui.startupMaxRetries}). Retrying in ${productConfig.ui.retryDelayMs / 1000}s...`
        );
        shouldRetry = true;
        setTimeout(() => {
          void fetchData(forceRefresh, retryCount + 1);
        }, productConfig.ui.retryDelayMs);
        return;
      }

      if (!res.ok) {
        try {
          const verifyRes = await fetch(`/api/db-verify${forceRefresh ? '?refresh=true' : ''}`);
          if (verifyRes.ok) {
            const verifyJson = await verifyRes.json();
            setDbDiagnostics(verifyJson);
          }
        } catch {
          // Ignore secondary failure
        }
        throw new Error(`Server returned HTTP ${res.status}. Please ensure the server is running.`);
      }

      throw new Error('Server returned an unexpected format. Please refresh in a few moments.');
    } catch (err: any) {
      if (
        retryCount < productConfig.ui.networkMaxRetries &&
        (err.name === 'TypeError' || err.message?.includes('fetch'))
      ) {
        console.info(
          `[Server Reconnecting] Connection pending (attempt ${retryCount + 1}/${productConfig.ui.networkMaxRetries}). Retrying in ${productConfig.ui.retryDelayMs / 1000}s...`
        );
        shouldRetry = true;
        setTimeout(() => {
          void fetchData(forceRefresh, retryCount + 1);
        }, productConfig.ui.retryDelayMs);
        return;
      }
      console.warn('[API Telemetry Fetch Notice]:', err.message);
      try {
        const verifyRes = await fetch(`/api/db-verify${forceRefresh ? '?refresh=true' : ''}`);
        if (verifyRes.ok) {
          const verifyJson = await verifyRes.json();
          setDbDiagnostics(verifyJson);
        }
      } catch {
        // Ignore fallback error
      }
      setData(null);
      setError(err.message || 'Error connecting to server');
    } finally {
      if (!shouldRetry) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), productConfig.ui.toastDurationMs);
  };

  const filteredStations = useMemo(() => {
    if (!data?.all_stations) return [];

    return data.all_stations.filter((s: StationRecord) => {
      if (filters.state !== 'ALL' && s.state !== filters.state) return false;
      if (filters.type !== 'ALL' && s.type !== filters.type) return false;
      if (filters.tm !== 'ALL' && s.tm !== filters.tm) return false;

      if (filters.search.trim() !== '') {
        const query = filters.search.toLowerCase();
        const matchCode = s.erp_code.toLowerCase().includes(query);
        const matchName = s.alds_name.toLowerCase().includes(query);
        const matchState = s.state.toLowerCase().includes(query);
        const matchRemark = (s.remark || '').toLowerCase().includes(query);
        if (!matchCode && !matchName && !matchState && !matchRemark) return false;
      }

      return true;
    });
  }, [data, filters]);

  const handleExportCSV = () => {
    window.location.href = '/api/export/csv';
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased selection:bg-orange-500/30 selection:text-orange-900 dark:selection:text-orange-200 transition-colors duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-emerald-400/30">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Reports Navigation Side Drawer */}
      <ReportsSideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        zeroSaleCount={data?.zero_sale_count || 0}
        stockoutCount={data?.stockout_risk_stations?.length || 0}
      />

      {/* Navbar */}
      <Navbar
        data={data}
        dbDiagnostics={dbDiagnostics || data?.db_diagnostics}
        loading={loading}
        theme={theme}
        onToggleTheme={toggleTheme}
        onRefresh={() => fetchData(true)}
        onExportCSV={handleExportCSV}
        onOpenDrawer={() => setIsDrawerOpen(true)}
        onOpenDbInspector={() => setIsDbInspectorOpen(true)}
        onOpenWhatsApp={() => setIsWhatsAppOpen(true)}
      />

      {/* Navigation Tabs */}
      <Navigation
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        zeroSaleCount={data?.zero_sale_count || 0}
        stockoutCount={data?.stockout_risk_stations?.length || 0}
      />

      {/* Global Filter Bar */}
      {data && (
        <FilterBar
          filters={filters}
          onChangeFilters={setFilters}
          states={data.states_summary || []}
          types={data.type_summary || []}
          tms={data.tm_summary || []}
          totalMatches={filteredStations.length}
          totalStations={data.stations_total}
          isCompact={isCompact}
          onToggleCompact={toggleCompact}
        />
      )}

      {/* Main Content Area */}
      <main className={`flex-1 max-w-7xl w-full mx-auto ${isCompact ? 'p-3 lg:p-4' : 'p-4 lg:p-6'}`}>
        {loading && !data && (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            <p className="text-sm font-medium">Initializing GO Gas Operational Telemetry Engine...</p>
          </div>
        )}

        {!loading && error && !data && (
          <div className="py-12 max-w-xl mx-auto space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm text-center space-y-4">
              <div className="p-3 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl inline-block">
                <Database className="w-8 h-8 mx-auto" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">PostgreSQL Database Connection Required</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  The dashboard is configured in strict database mode to pull directly from PostgreSQL (<code className="font-mono text-orange-600 dark:text-orange-400">sale_tracker</code>).
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-left text-xs space-y-2">
                <div className="font-semibold text-slate-700 dark:text-slate-300">Quick Connection Checklist:</div>
                <ul className="space-y-1.5 text-slate-600 dark:text-slate-400 list-disc list-inside">
                  <li><strong>Start PostgreSQL:</strong> {productConfig.ui.databaseServiceStartHelp}</li>
                  <li><strong>Check Credentials:</strong> Open <code className="font-mono text-orange-600 dark:text-orange-400">Analytical Dashboard/.env</code> and enter your password for <code className="font-mono">BOT_READER_PASSWORD</code>.</li>
                  <li><strong>Run 1-Click Tester:</strong> Double-click <code className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">run-test-db.bat</code> to verify your table and row count.</li>
                </ul>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => fetchData(true)}
                  className="text-xs font-semibold px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors cursor-pointer shadow-sm flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry DB Connection</span>
                </button>
                <button
                  onClick={() => setIsDbInspectorOpen(true)}
                  className="text-xs font-semibold px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Open DB Inspector</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {data && (
          <>
            {activeTab === 'master' && (
              <MasterDashboard
                data={data}
                filteredStations={filteredStations}
                isCompact={isCompact}
                onNavigateToTab={setActiveTab}
              />
            )}

            {activeTab === 'dispatch' && (
              <TankerDispatchReport
                stations={filteredStations}
                telemetry={data}
                isCompact={isCompact}
              />
            )}

            {activeTab === 'briefing' && <DailyBriefing data={data} />}

            {activeTab === 'forecast' && (
              <AIMLForecast
                forecast={data.forecast}
                currentSale={data.total_sale_qty}
              />
            )}

            {activeTab === 'whatif' && <WhatIfSimulator data={data} />}

            {activeTab === 'analysis' && (
              <DataAnalysisSuite
                stations={filteredStations}
                data={data}
              />
            )}

            {activeTab === 'rsp' && (
              <RSPDisparityReport
                stations={filteredStations}
                telemetry={data}
                isCompact={isCompact}
              />
            )}

            {activeTab === 'free_sale_leakage' && (
              <FreeSaleLeakageAudit
                stations={filteredStations}
                telemetry={data}
                isCompact={isCompact}
              />
            )}

            {activeTab === 'churn_ai' && (
              <CustomerChurnPredictor
                stations={filteredStations}
                telemetry={data}
                isCompact={isCompact}
              />
            )}

            {activeTab === 'states' && (
              <StateAnalysis
                states={data.states_summary || []}
                totalVolume={data.total_sale_qty}
              />
            )}

            {activeTab === 'stations' && (
              <StationDirectory
                stations={filteredStations}
                isCompact={isCompact}
              />
            )}

            {activeTab === 'team' && (
              <TMLeaderboard
                tms={data.tm_summary || []}
                isCompact={isCompact}
              />
            )}

            {activeTab === 'types' && (
              <StationTypeAnalysis
                types={data.type_summary || []}
                totalVolume={data.total_sale_qty}
              />
            )}

            {activeTab === 'heatmap' && <StationHeatmap stations={filteredStations} />}

            {activeTab === 'targets' && (
              <TargetTracker
                states={data.states_summary || []}
                stations={filteredStations}
              />
            )}

            {activeTab === 'adhoc' && <AdHocExplorer stations={filteredStations} />}

            {activeTab === 'all_reports' && (
              <AllReportsDirectory
                data={data}
                stations={filteredStations}
                onSelectTab={setActiveTab}
              />
            )}
          </>
        )}
      </main>

      {/* PostgreSQL Database Inspector Modal */}
      <DatabaseInspectorModal
        isOpen={isDbInspectorOpen}
        onClose={() => setIsDbInspectorOpen(false)}
        diagnostics={dbDiagnostics || data?.db_diagnostics}
        telemetry={data}
        onReverify={() => fetchData(true)}
        loading={loading}
      />

      {/* WhatsApp Automation Center Modal */}
      <WhatsAppModal
        isOpen={isWhatsAppOpen}
        onClose={() => setIsWhatsAppOpen(false)}
      />
    </div>
  );
}

export default App;
