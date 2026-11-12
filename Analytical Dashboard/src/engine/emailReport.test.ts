import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { buildExecutiveEmail, buildStationWorkbook } from './emailReport.js';

test('builds a concise executive email with the same WhatsApp-ready sections', () => {
  const { subject, text, html } = buildExecutiveEmail({
    date: '2026-11-05',
    stations_with_sale: 312,
    stations_total: 316,
    zero_sale_count: 4,
    total_sale_qty: 342850,
    total_collection: 26433735,
    effective_rsp: 77.1,
    total_free_sale_litres: 820,
    total_paytm_collection: 7820500,
    forecast: {
      predicted_total_7d: 2415400,
      mape_ensemble: 6.8,
      backtest_days: 14,
      forecast: [{ date: '2026-11-06', predicted_qty: 348200, p10: 320000, p90: 375000 }],
    },
    stockout_risk_stations: [
      { code: 'JODO9', name: 'YUSUFGUDA', days_left: 0.9, stock_ltr: 1200 },
      { code: 'KA04', name: 'KAYRAMBEDU', days_left: 1.2, stock_ltr: 1660 },
    ],
  });

  assert.equal(subject, 'GO Gas Daily Operations Brief | 05 Nov 2026');
  assert.match(text, /GO GAS EXECUTIVE MORNING BRIEFING — 05 Nov 2026/);
  assert.match(text, /\*PERFORMANCE\*/);
  assert.match(text, /Network sales: \*3,42,850\.00 L\* \| Collection: \*₹2,64,33,735\.00\*/);
  assert.match(text, /\*EXCEPTIONS\*/);
  assert.match(text, /Replenishment risk: \*1 critical \(<1 day\)\*, 1 high \(1–2 days\), 0 monitor \(2–3 days\)/);
  assert.match(text, /NEXT-DAY FORECAST — 06 Nov 2026/);
  assert.match(text, /Forecast for 06 Nov 2026: \*3,48,200\.00 L\* \(range 3,20,000\.00 L–3,75,000\.00 L\)/);
  assert.match(text, /Historical MAPE \*6\.8%\* across 14 scored days/);
  assert.match(text, /Full station-wise report, state performance, stock-risk list, and action tracker are attached/);
  assert.equal((text.match(/•/g) || []).length, 10);
  assert.match(html, /src="cid:company-logo"/);
  assert.match(html, /alt="Confidence Group"/);
  assert.match(html, /<h2[^>]*>PERFORMANCE<\/h2>/);
  assert.match(html, /<strong>3,42,850\.00 L<\/strong>/);
  assert.match(html, /<strong>6\.8%<\/strong>/);
  assert.doesNotMatch(text, /stockout risk \(under three days\)/);
});

test('reports unavailable forecasts and empty priority lists clearly', () => {
  const { text } = buildExecutiveEmail({
    date: '2026-11-05',
    stations_with_sale: 0,
    stations_total: 0,
    zero_sale_count: 0,
    total_sale_qty: 0,
    total_collection: 0,
    effective_rsp: 0,
    total_free_sale_litres: 0,
    total_paytm_collection: 0,
    forecast: {
      predicted_total_7d: 0,
      mape_ensemble: null,
      backtest_days: 0,
      forecast: [],
    },
    stockout_risk_stations: [],
  });

  assert.match(text, /Zero-sale stations: \*0\*\./);
  assert.match(text, /Replenishment risk: \*0 critical/);
  assert.match(text, /Next-day forecast is unavailable/);
  assert.match(text, /Historical MAPE unavailable/);
  assert.equal((text.match(/•/g) || []).length, 10);
});

test('builds a filterable station workbook with proposed owners and actions', async () => {
  const buffer = await buildStationWorkbook({
    all_stations: [
      {
        erp_code: 'ST001',
        alds_name: 'Critical Station',
        state: 'MH',
        tm: 'TM One',
        coordinator: 'Coordinator One',
        sale_qty: 1000,
        collection: 77000,
        closing_dip_in_ltr: 500,
        days_left: 0.5,
        remark: '',
      },
      {
        erp_code: 'ST002',
        alds_name: 'Zero Sale Station',
        state: 'KA',
        tm: 'TM Two',
        coordinator: 'Coordinator Two',
        sale_qty: 0,
        collection: 0,
        closing_dip_in_ltr: 0,
        days_left: 0,
        remark: 'No Stock',
      },
    ],
    stockout_risk_stations: [{
      code: 'ST001',
      name: 'Critical Station',
      state: 'MH',
      stock_ltr: 500,
      daily_burn_ltr: 1000,
      days_left: 0.5,
      remark: '',
    }],
    top_declining_stations: [],
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(Readable.from([buffer]));
  const sheet = workbook.getWorksheet('Station Detail');

  assert.ok(sheet);
  assert.equal(sheet.autoFilter, 'A1:P1');
  assert.equal(sheet.rowCount, 3);
  assert.equal(sheet.getRow(2).getCell(10).value, 'Critical (<1 day)');
  assert.equal(sheet.getRow(2).getCell(14).value, 'Arrange immediate replenishment; confirm dispatch');
  assert.equal(sheet.getRow(2).getCell(15).value, 'TM One / Coordinator One');
  assert.equal(sheet.getRow(2).getCell(16).value, 'Today, EOD');
  assert.equal(sheet.getRow(3).getCell(11).value, 'Stock unavailable');
});
