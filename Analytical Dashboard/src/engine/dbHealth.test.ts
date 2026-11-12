import test from 'node:test';
import assert from 'node:assert/strict';
import { getDbConnectionHealth } from './dbHealth.js';
import { DatabaseDiagnostics } from '../types.js';
import productConfig from '../../../product-config.json';

const connectionString =
  `postgresql://${productConfig.database.readerUser}:****@${productConfig.database.host}:` +
  `${productConfig.database.port}/${productConfig.database.name}`;

test('returns checking state when loading with no diagnostics', () => {
  const health = getDbConnectionHealth(null, true);
  assert.equal(health.status, 'checking');
  assert.equal(health.colorName, 'sky');
  assert.equal(health.shortLabel, 'Checking DB');
  assert.match(health.label, /Checking Connection/);
  assert.match(health.barGradient, /from-sky-500/);
});

test('returns error/offline state when disconnected or connection refused', () => {
  const offlineDiagnostics: DatabaseDiagnostics = {
    connected: false,
    connection_string: connectionString,
    host: productConfig.database.host,
    port: productConfig.database.port,
    database: productConfig.database.name,
    user: productConfig.database.readerUser,
    active_source: 'PostgreSQL',
    error: `connect ECONNREFUSED ${productConfig.database.host}:${productConfig.database.port}`,
    server_timestamp: '2026-11-09T11:43:01.528Z',
  };

  const health = getDbConnectionHealth(offlineDiagnostics, false);
  assert.equal(health.status, 'error');
  assert.equal(health.colorName, 'rose');
  assert.equal(health.shortLabel, 'DB Offline');
  assert.match(health.label, /Offline/);
  assert.match(health.barGradient, /from-rose-500/);
  assert.equal(health.host, productConfig.database.host);
  assert.equal(health.port, productConfig.database.port);
});

test('returns warning state when connected with discrepancy in data', () => {
  const warningDiagnostics: DatabaseDiagnostics = {
    connected: true,
    engine: 'external',
    connection_string: connectionString,
    host: productConfig.database.host,
    port: productConfig.database.port,
    database: productConfig.database.name,
    user: productConfig.database.readerUser,
    active_source: 'PostgreSQL',
    total_rows: 5000,
    server_timestamp: '2026-11-09T11:43:01.528Z',
    discrepancy_analysis: {
      has_discrepancy: true,
      reason: 'Discrepancy detected: UI is displaying date 2026-11-01 but DB max date is 2026-11-02',
      ui_date: '2026-11-01',
      db_date: '2026-11-02',
      ui_station_count: 310,
      db_station_count: 316,
      ui_volume: 350000,
      db_volume: 380000,
    },
  };

  const health = getDbConnectionHealth(warningDiagnostics, false);
  assert.equal(health.status, 'warning');
  assert.equal(health.colorName, 'amber');
  assert.equal(health.shortLabel, 'DB Warning');
  assert.match(health.label, /Sync Warning/);
  assert.match(health.barGradient, /from-amber-500/);
  assert.equal(health.hasDiscrepancy, true);
});

test('returns healthy/online state when connected with no discrepancies', () => {
  const healthyDiagnostics: DatabaseDiagnostics = {
    connected: true,
    engine: 'external',
    connection_string: connectionString,
    host: productConfig.database.host,
    port: productConfig.database.port,
    database: productConfig.database.name,
    user: productConfig.database.readerUser,
    active_source: 'PostgreSQL',
    total_rows: 9540,
    latest_date: '2026-11-07',
    server_timestamp: '2026-11-09T11:43:01.528Z',
    discrepancy_analysis: {
      has_discrepancy: false,
      ui_date: '2026-11-07',
      db_date: '2026-11-07',
      ui_station_count: 316,
      db_station_count: 316,
      ui_volume: 420000,
      db_volume: 420000,
    },
  };

  const health = getDbConnectionHealth(healthyDiagnostics, false);
  assert.equal(health.status, 'healthy');
  assert.equal(health.colorName, 'emerald');
  assert.equal(health.shortLabel, 'DB Online');
  assert.match(health.label, /Online \(9,540 rows\)/);
  assert.match(health.barGradient, /from-emerald-500/);
  assert.equal(health.hasDiscrepancy, false);
});
