import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildExecutiveEmail } from './emailReport.js';

test('builds a concise executive email from live telemetry values', () => {
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
      forecast: [{ date: '2026-11-06', predicted_qty: 348200 }],
    },
    stockout_risk_stations: [
      { code: 'JODO9', name: 'YUSUFGUDA', days_left: 0.9 },
      { code: 'KA04', name: 'KAYRAMBEDU', days_left: 1.2 },
    ],
  });

  assert.equal(subject, 'GO Gas Executive Daily Flash - 2026-11-05');
  assert.match(text, /3,42,850\.00 L/);
  assert.match(text, /₹2,64,33,735\.00/);
  assert.match(text, /₹78,20,500\.00 \(29\.59%\)/);
  assert.match(text, /3,48,200\.00 L/);
  assert.match(text, /93\.2% \(MAPE 6\.8%, 14 scored days\)/);
  assert.match(text, /Kindly review and take appropriate action\./);
  assert.match(text, /Thank you for your continued support\.\n\nThanks,/);
  assert.match(text, /Kartik Doye\nData Analyst \(Sales & Marketing\) - ALDS/);
  assert.match(text, /8087018975/);
  assert.match(text, /kartikdoye@confidencegroup\.co/);
  assert.match(text, /https:\/\/www\.confidencegroup\.co\//);
  assert.match(text, /34A Confidence Tower, Central Bazar Road, Ramdaspeth, Nagpur - 440010/);
  assert.ok(text.trim().split(/\s+/).length <= 150);
  assert.match(html, /src="cid:company-logo"/);
  assert.match(html, /alt="Confidence Group"/);
  assert.doesNotMatch(text, /95% Confidence Band|Top 10|STATE-WISE BREAKDOWN/);
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

  assert.match(text, /next-day forecast is not available/);
  assert.match(text, /Historical forecast accuracy is Not available yet/);
  assert.match(text, /0 station\(s\) are at stockout risk/);
  assert.ok(text.trim().split(/\s+/).length <= 150);
});
