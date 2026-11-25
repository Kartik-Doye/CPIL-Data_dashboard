import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAIL_CRON_EXPRESSION,
  EMAIL_SCHEDULE_LABEL,
  WHATSAPP_CRON_EXPRESSION,
  WHATSAPP_SCHEDULE_LABEL,
} from './config.js';
import { parseCronDailySlots } from './whatsappAutomation.js';
import {
  generateForecast,
  clearWalkForwardCache,
  getWalkForwardCacheDiagnostics,
} from './forecasting.js';
import { validateSpreadsheetSalesRows } from './salesIngest.js';
import type { SpreadsheetRow } from './excel.js';

test('Email and WhatsApp cron schedules are configured to 02:15 PM & 06:30 PM Daily', () => {
  assert.equal(EMAIL_CRON_EXPRESSION, '15 14 * * *;30 18 * * *');
  assert.equal(WHATSAPP_CRON_EXPRESSION, '15 14 * * *;30 18 * * *');
  assert.equal(EMAIL_SCHEDULE_LABEL, '02:15 PM & 06:30 PM Daily');
  assert.equal(WHATSAPP_SCHEDULE_LABEL, '02:15 PM & 06:30 PM Daily');

  const slots = parseCronDailySlots(WHATSAPP_CRON_EXPRESSION.split(';'));
  assert.deepEqual(slots, [
    { key: '14:15', minutesOfDay: 14 * 60 + 15 },
    { key: '18:30', minutesOfDay: 18 * 60 + 30 },
  ]);
});

test('Incremental walk-forward forecast cache produces identical results on exact and +1 day suffix updates', () => {
  clearWalkForwardCache();
  const baseSeries = Array.from({ length: 20 }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    const dow = new Date(`2026-10-${day}T00:00:00Z`).getUTCDay();
    const qty = dow === 0 || dow === 6 ? 78000 + i * 250 : 94000 + i * 300;
    return { date: `2026-10-${day}`, sale_qty: qty };
  });

  const coldResult = generateForecast(baseSeries, 7);
  assert.equal(getWalkForwardCacheDiagnostics().lastMode, 'cold');
  assert.equal(getWalkForwardCacheDiagnostics().size, 1);

  const exactResult = generateForecast(baseSeries, 7);
  assert.equal(getWalkForwardCacheDiagnostics().lastMode, 'exact');
  assert.equal(exactResult.predicted_total_7d, coldResult.predicted_total_7d);
  assert.equal(exactResult.mape_ensemble, coldResult.mape_ensemble);
  assert.deepEqual(exactResult.backtest_diagnostics, coldResult.backtest_diagnostics);

  const extendedSeries = [...baseSeries, { date: '2026-10-21', sale_qty: 99500 }];
  const incrementalResult = generateForecast(extendedSeries, 7);
  assert.equal(getWalkForwardCacheDiagnostics().lastMode, 'incremental');

  // Verify incremental backtest matches a fresh cold calculation on the 21-day series
  clearWalkForwardCache();
  const freshExtendedResult = generateForecast(extendedSeries, 7);
  assert.equal(getWalkForwardCacheDiagnostics().lastMode, 'cold');
  assert.equal(incrementalResult.predicted_total_7d, freshExtendedResult.predicted_total_7d);
  assert.equal(incrementalResult.mape_ensemble, freshExtendedResult.mape_ensemble);
  assert.deepEqual(incrementalResult.backtest_diagnostics, freshExtendedResult.backtest_diagnostics);
});

test('validateSpreadsheetSalesRows validates daily rows, flags >4500 L outliers, and rejects duplicate codes or multiple dates', () => {
  const validInput: SpreadsheetRow[] = [
    {
      __rowNumber: 2,
      'Cost Code': 'ERP101',
      'ALDS NAME': 'Pune Highway ALDS',
      STATE: 'MH',
      TM: 'Rajesh',
      Coordinator: 'Amit',
      Date: '2026-11-24',
      'SALE QTY': 1250,
      COLLECTION: 75000,
      'NEW RATE': 60,
      PAYTM: 50000,
    },
    {
      __rowNumber: 3,
      'Cost Code': 'ERP102',
      'ALDS NAME': 'Mega Hub ALDS',
      STATE: 'GJ',
      TM: 'Suresh',
      Coordinator: 'Amit',
      Date: '2026-11-24',
      'SALE QTY': 5100,
      COLLECTION: 306000,
      'NEW RATE': 60,
      PAYTM: 210000,
    },
  ];

  const parsed = validateSpreadsheetSalesRows(validInput);
  assert.equal(parsed.saleDate, '2026-11-24');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.outlierStations.length, 1);
  assert.equal(parsed.outlierStations[0].erp_code, 'ERP102');
  assert.equal(parsed.warnings.length, 1);

  assert.throws(
    () =>
      validateSpreadsheetSalesRows([
        validInput[0],
        { ...validInput[1], __rowNumber: 4, 'Cost Code': 'ERP101' },
      ]),
    /duplicate Cost Code "ERP101"/i,
  );

  assert.throws(
    () =>
      validateSpreadsheetSalesRows([
        validInput[0],
        { ...validInput[1], __rowNumber: 4, Date: '2026-11-25' },
      ]),
    /Multiple sale dates detected/i,
  );
});
