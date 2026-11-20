/**
 * PostgreSQL Database Engine for Analytical Dashboard.
 * 
 * Provides unified access to PostgreSQL:
 * Connects to the configured external PostgreSQL database. The dashboard does
 * not substitute embedded or spreadsheet data when that database is unavailable.
 */
import pg from 'pg';
import {
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_LOADER_USER,
  DB_LOADER_PASSWORD,
  DB_CONNECT_TIMEOUT,
  DB_CONNECT_TIMEOUT_CEILING_MS,
  DB_STATEMENT_TIMEOUT_MS,
  DB_POOL_MAX,
  DB_LOADER_POOL_MAX,
  DB_IDLE_TIMEOUT_MS,
} from './config.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let loaderPool: pg.Pool | null = null;
let activeEngine: 'external' | null = null;
let isDbAvailable: boolean | null = null;
let lastDbError: string | null = null;
let engineInitialization: Promise<'external'> | null = null;

export function getDbConnectionDetails() {
  const maskedPassword = DB_PASSWORD ? '****' : '(EMPTY)';
  const hostLabel = DB_HOST;
  const maskedConnectionString = `postgresql://${DB_USER}:${maskedPassword}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
  return {
    host: hostLabel,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    engine: 'external',
    hasPassword: Boolean(DB_PASSWORD),
    maskedConnectionString,
  };
}

export function getPool(): pg.Pool | null {
  if (!pool) {
    pool = new Pool({
      host: DB_HOST,
      port: DB_PORT,
      database: DB_NAME,
      user: DB_USER,
      password: DB_PASSWORD || '',
      connectionTimeoutMillis: Math.min(DB_CONNECT_TIMEOUT * 1000, DB_CONNECT_TIMEOUT_CEILING_MS),
      statement_timeout: DB_STATEMENT_TIMEOUT_MS,
      max: DB_POOL_MAX,
      idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
    });

    pool.on('error', (err: Error) => {
      lastDbError = err.message;
      console.warn('[DB Pool Warning]', err.message);
    });
  }
  return pool;
}

export function isLoaderConfigured(): boolean {
  return Boolean(DB_LOADER_PASSWORD && DB_LOADER_PASSWORD !== 'CHANGE_ME_LOADER');
}

function getLoaderPool(): pg.Pool {
  if (!isLoaderConfigured()) {
    throw new Error('BOT_LOADER_PASSWORD is not configured (or still set to placeholder CHANGE_ME_LOADER).');
  }
  if (!loaderPool) {
    loaderPool = new Pool({
      host: DB_HOST,
      port: DB_PORT,
      database: DB_NAME,
      user: DB_LOADER_USER,
      password: DB_LOADER_PASSWORD,
      connectionTimeoutMillis: Math.min(DB_CONNECT_TIMEOUT * 1000, DB_CONNECT_TIMEOUT_CEILING_MS),
      statement_timeout: DB_STATEMENT_TIMEOUT_MS,
      max: DB_LOADER_POOL_MAX,
      idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
    });
    loaderPool.on('error', (err: Error) => {
      console.warn('[DB Loader Pool Warning]', err.message);
    });
  }
  return loaderPool;
}

export async function queryLoader<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const p = getLoaderPool();
  const client = await p.connect();
  try {
    await client.query(`SET statement_timeout = ${DB_STATEMENT_TIMEOUT_MS}`);
    const result = await client.query(sql, params);
    return result.rows as T[];
  } catch (err) {
    console.error('[DB Loader Error]', err);
    throw err;
  } finally {
    client.release();
  }
}

export async function ensureDatabaseEngine(): Promise<'external'> {
  if (engineInitialization) return engineInitialization;
  if (activeEngine === 'external' && pool) return 'external';

  const initialization = initializeDatabaseEngine();
  engineInitialization = initialization;
  try {
    return await initialization;
  } finally {
    if (engineInitialization === initialization) engineInitialization = null;
  }
}

async function initializeDatabaseEngine(): Promise<'external'> {
  // 1. Check if external PostgreSQL is running and accessible
  try {
    const p = getPool();
    if (p) {
      const client = await p.connect();
      try {
        const res = await client.query('SELECT 1 as alive');
        if (res.rows.length > 0) {
          activeEngine = 'external';
          isDbAvailable = true;
          lastDbError = null;
          console.info(`[DATABASE] Connected to external PostgreSQL at ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
          return 'external';
        }
      } finally {
        client.release();
      }
    }
  } catch (err: any) {
    lastDbError = err?.message || 'External PostgreSQL connection failed';
    if (DB_PASSWORD === 'CHANGE_ME_READER') {
      lastDbError = `External PostgreSQL connection failed while BOT_READER_PASSWORD is still the placeholder: ${lastDbError}`;
    }
    activeEngine = null;
    isDbAvailable = false;
  }

  throw new Error(lastDbError || `Unable to connect to external PostgreSQL at ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
}

export async function testDbConnection(forceRefresh = false): Promise<boolean> {
  if (forceRefresh && !isDbAvailable && pool) {
    // Detach the old pool first so concurrent requests pick up a fresh one,
    // then close it after in-flight queries have had time to finish.
    const stalePool = pool;
    pool = null;
    activeEngine = null;
    setTimeout(() => {
      stalePool.end().catch(() => {});
    }, Math.max(DB_STATEMENT_TIMEOUT_MS, 5000) + 1000).unref?.();
  }

  try {
    await ensureDatabaseEngine();
    const client = await getPool()!.connect();
    try {
      await client.query('SELECT 1');
      activeEngine = 'external';
      isDbAvailable = true;
      lastDbError = null;
      return true;
    } finally {
      client.release();
    }
  } catch (err: any) {
    activeEngine = null;
    isDbAvailable = false;
    lastDbError = err?.message || 'External PostgreSQL connection failed.';
    return false;
  }
}

export async function getDbAuditReport(forceRefresh = false) {
  const isConnected = await testDbConnection(forceRefresh);
  const connDetails = getDbConnectionDetails();

  if (!isConnected) {
    return {
      connected: false,
      connection_string: connDetails.maskedConnectionString,
      host: connDetails.host,
      port: connDetails.port,
      database: connDetails.database,
      user: connDetails.user,
      engine: 'external',
      active_source: 'PostgreSQL',
      error: lastDbError || `Failed to connect to PostgreSQL at ${connDetails.host}:${connDetails.port}`,
      server_timestamp: new Date().toISOString(),
    };
  }

  try {
    // 1. Overall stats from sale_tracker
    const summaryRows = await query(`
      SELECT 
        COUNT(*)::int as total_rows,
        MIN(sale_date)::text as min_date,
        MAX(sale_date)::text as max_date,
        COUNT(DISTINCT sale_date)::int as distinct_days,
        COUNT(DISTINCT erp_code)::int as distinct_stations,
        COALESCE(SUM(sale_qty), 0)::float as total_volume
      FROM sale_tracker
    `);
    const summary = summaryRows[0] || {};

    // 2. Latest date stats
    const latestDateRows = await query(`
      SELECT 
        sale_date::text as latest_date,
        COUNT(*)::int as latest_date_stations,
        COALESCE(SUM(sale_qty), 0)::float as latest_date_sale_qty,
        COALESCE(SUM(collection), 0)::float as latest_date_collection
      FROM sale_tracker
      WHERE sale_date = (SELECT MAX(sale_date) FROM sale_tracker)
      GROUP BY sale_date
    `);
    const latestDateStats = latestDateRows[0] || {};

    // 3. Sample records from latest date
    const sampleRows = await query(`
      SELECT 
        erp_code,
        alds_name,
        state,
        sale_qty::float as sale_qty,
        collection::float as collection,
        COALESCE(closing_dip_in_ltr, 0)::float as closing_dip_in_ltr,
        sale_date::text as sale_date
      FROM sale_tracker
      WHERE sale_date = (SELECT MAX(sale_date) FROM sale_tracker)
      ORDER BY sale_qty DESC
      LIMIT 5
    `);

    return {
      connected: true,
      connection_string: connDetails.maskedConnectionString,
      host: connDetails.host,
      port: connDetails.port,
      database: connDetails.database,
      user: connDetails.user,
      engine: connDetails.engine,
      external_connection_error: null,
      total_rows: summary.total_rows || 0,
      min_date: summary.min_date ? summary.min_date.slice(0, 10) : undefined,
      max_date: summary.max_date ? summary.max_date.slice(0, 10) : undefined,
      distinct_days: summary.distinct_days || 0,
      distinct_stations: summary.distinct_stations || 0,
      total_volume: summary.total_volume || 0,
      latest_date: latestDateStats.latest_date ? latestDateStats.latest_date.slice(0, 10) : undefined,
      latest_date_stations: latestDateStats.latest_date_stations || 0,
      latest_date_sale_qty: latestDateStats.latest_date_sale_qty || 0,
      latest_date_collection: latestDateStats.latest_date_collection || 0,
      sample_records: sampleRows.map((r: any) => ({
        erp_code: r.erp_code,
        alds_name: r.alds_name,
        state: r.state,
        sale_qty: r.sale_qty,
        collection: r.collection,
        closing_dip_in_ltr: r.closing_dip_in_ltr,
        sale_date: r.sale_date.slice(0, 10),
      })),
      error: null,
      server_timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      connected: true,
      connection_string: connDetails.maskedConnectionString,
      host: connDetails.host,
      port: connDetails.port,
      database: connDetails.database,
      user: connDetails.user,
      engine: connDetails.engine,
      active_source: 'PostgreSQL',
      error: `Query error in sale_tracker: ${err.message}`,
      server_timestamp: new Date().toISOString(),
    };
  }
}

function isTransientPoolError(err: any): boolean {
  return /Cannot use a pool after calling end|Connection terminated|connection timeout|ECONNRESET/i.test(String(err?.message || err));
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await ensureDatabaseEngine();

    if (activeEngine !== 'external') {
      throw new Error('External PostgreSQL is required; no fallback database is enabled.');
    }

    const p = getPool();
    if (!p) {
      throw new Error('External PostgreSQL connection pool is unavailable.');
    }
    try {
      const client = await p.connect();
      try {
        await client.query(`SET statement_timeout = ${DB_STATEMENT_TIMEOUT_MS}`);
        const res = await client.query(sql, params);
        return res.rows as T[];
      } finally {
        client.release();
      }
    } catch (err: any) {
      if (attempt === 1 && isTransientPoolError(err)) {
        // Pool was swapped/closed or a connection dropped mid-flight: retry once on a fresh pool
        if (pool === p && /Cannot use a pool after calling end/i.test(String(err?.message))) {
          pool = null;
          activeEngine = null;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      console.warn(`[External DB Query Warning] ${err.message}`);
      throw err;
    }
  }
  throw new Error('External PostgreSQL query failed after retry.');
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (loaderPool) {
    await loaderPool.end();
    loaderPool = null;
  }
  activeEngine = null;
  isDbAvailable = null;
  lastDbError = null;
}
