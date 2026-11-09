import { DatabaseDiagnostics } from '../types.js';

export type DbHealthStatus = 'healthy' | 'warning' | 'error' | 'checking';

export interface DbHealthDetails {
  status: DbHealthStatus;
  label: string;
  shortLabel: string;
  tooltip: string;
  colorName: 'emerald' | 'amber' | 'rose' | 'sky';
  barGradient: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotColor: string;
  pingColor: string;
  iconType: 'check' | 'alert' | 'offline' | 'loading';
  host: string;
  port: number;
  database: string;
  user: string;
  totalRows?: number;
  latestDate?: string;
  hasDiscrepancy: boolean;
  discrepancyReason?: string;
  error?: string | null;
}

export function getDbConnectionHealth(
  diagnostics?: DatabaseDiagnostics | null,
  isLoading = false
): DbHealthDetails {
  // If loading and no previous diagnostics available
  if (isLoading && !diagnostics) {
    return {
      status: 'checking',
      label: 'PostgreSQL: Checking Connection...',
      shortLabel: 'Checking DB',
      tooltip: 'Probing PostgreSQL connection status at configured host:port...',
      colorName: 'sky',
      barGradient: 'from-sky-500 via-indigo-500 to-cyan-400 animate-pulse',
      badgeBg: 'bg-sky-50 dark:bg-sky-950/60',
      badgeText: 'text-sky-700 dark:text-sky-300',
      badgeBorder: 'border-sky-300 dark:border-sky-600/50',
      dotColor: 'bg-sky-500',
      pingColor: 'bg-sky-400',
      iconType: 'loading',
      host: 'localhost',
      port: 5432,
      database: 'sale_alds',
      user: 'bot_reader',
      hasDiscrepancy: false,
    };
  }

  const host = diagnostics?.host || 'localhost';
  const port = diagnostics?.port || 5432;
  const database = diagnostics?.database || 'sale_alds';
  const user = diagnostics?.user || 'bot_reader';
  const isConnected = Boolean(diagnostics?.connected);
  const hasDiscrepancy = Boolean(diagnostics?.discrepancy_analysis?.has_discrepancy);
  const discrepancyReason = diagnostics?.discrepancy_analysis?.reason;
  const errorMsg = diagnostics?.error || diagnostics?.external_connection_error || null;
  const totalRows = diagnostics?.total_rows;
  const latestDate = diagnostics?.latest_date;

  // Case 1: Disconnected / Offline / Error
  if (!isConnected) {
    const errorSummary = errorMsg ? ` (${errorMsg.replace(/^connect\s+/i, '')})` : '';
    return {
      status: 'error',
      label: `PostgreSQL: Offline${errorSummary}`,
      shortLabel: 'DB Offline',
      tooltip: `PostgreSQL is disconnected at ${host}:${port}/${database}. ${errorMsg || 'Connection ECONNREFUSED'}. Click to inspect.`,
      colorName: 'rose',
      barGradient: 'from-rose-500 via-red-600 to-rose-700 shadow-[0_0_12px_rgba(244,63,94,0.6)]',
      badgeBg: 'bg-rose-50 dark:bg-rose-950/60',
      badgeText: 'text-rose-700 dark:text-rose-300',
      badgeBorder: 'border-rose-300 dark:border-rose-600/60',
      dotColor: 'bg-rose-500',
      pingColor: 'bg-rose-400',
      iconType: 'offline',
      host,
      port,
      database,
      user,
      totalRows: 0,
      hasDiscrepancy: false,
      error: errorMsg,
    };
  }

  // Case 2: Connected but with discrepancy warning
  if (hasDiscrepancy) {
    return {
      status: 'warning',
      label: 'PostgreSQL: Sync Warning',
      shortLabel: 'DB Warning',
      tooltip: `Connected to ${host}:${port}/${database}, but data discrepancy detected: ${discrepancyReason || 'UI date/volume differs from DB max'}. Click to inspect.`,
      colorName: 'amber',
      barGradient: 'from-amber-500 via-orange-500 to-amber-600 shadow-[0_0_12px_rgba(245,158,11,0.6)]',
      badgeBg: 'bg-amber-50 dark:bg-amber-950/60',
      badgeText: 'text-amber-800 dark:text-amber-300',
      badgeBorder: 'border-amber-300 dark:border-amber-600/60',
      dotColor: 'bg-amber-500',
      pingColor: 'bg-amber-400',
      iconType: 'alert',
      host,
      port,
      database,
      user,
      totalRows,
      latestDate,
      hasDiscrepancy: true,
      discrepancyReason,
    };
  }

  // Case 3: Fully Connected & Healthy
  const rowInfo = typeof totalRows === 'number' ? ` (${totalRows.toLocaleString()} rows)` : '';
  return {
    status: 'healthy',
    label: `PostgreSQL: Online${rowInfo}`,
    shortLabel: 'DB Online',
    tooltip: `Healthy connection to ${host}:${port}/${database} as ${user}. ${totalRows ? `${totalRows.toLocaleString()} rows recorded.` : ''} Click to inspect.`,
    colorName: 'emerald',
    barGradient: 'from-emerald-500 via-teal-400 to-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.6)]',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'border-emerald-300 dark:border-emerald-600/60',
    dotColor: 'bg-emerald-500',
    pingColor: 'bg-emerald-400',
    iconType: 'check',
    host,
    port,
    database,
    user,
    totalRows,
    latestDate,
    hasDiscrepancy: false,
  };
}
