import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseRecipientNumbers,
  maskPhoneNumber,
  buildExecutiveWhatsAppMessage,
  buildTankerDispatchWhatsAppMessage,
  sendWhatsAppMessage,
} from './whatsappService.js';

test('parses and cleans valid recipient phone numbers', () => {
  const result = parseRecipientNumbers('+91 98765 43210, 918087018975, invalid, 123');
  assert.equal(result.length, 2);
  assert.equal(result[0], '+919876543210');
  assert.equal(result[1], '918087018975');
});

test('masks phone numbers for privacy display in UI', () => {
  assert.equal(maskPhoneNumber('918087018975'), '918****975');
  assert.equal(maskPhoneNumber('123'), '****');
});

test('formats executive briefing WhatsApp flash message with correct formatting and metrics', () => {
  const msg = buildExecutiveWhatsAppMessage({
    date: '2026-11-06',
    total_sale_qty: 342850,
    total_collection: 26433735,
    effective_rsp: 77.10,
    average_rsp: 78.50,
    stations_with_sale: 312,
    stations_total: 316,
    zero_sale_count: 4,
    stockout_risk_stations: [
      { code: 'JODO9', name: 'YUSUFGUDA', days_left: 0.9, stock_ltr: 1200, daily_burn_ltr: 1333, state: 'TG', remark: '' },
    ],
    forecast: {
      horizon_days: 7,
      predicted_total_7d: 2415400,
      mape_ensemble: 6.8,
      mape_linear: 7.2,
      mape_holt_winters: 7.0,
      mape_naive: 8.5,
      forecast: [
        {
          date: '2026-11-07',
          day_name: 'Saturday',
          weekday: 'Saturday',
          weekday_short: 'Sat',
          predicted: 348200,
          predicted_qty: 348200,
          p10: 320000,
          p50: 348200,
          p90: 375000,
          linear: 345000,
          linear_pred: 345000,
          holt_winters: 349000,
          holt_winters_pred: 349000,
          gradient_boosting_pred: 348000,
          naive_last_week: 340000,
          same_weekday_avg: 342000,
          ensemble: 348200,
          lower_bound: 320000,
          upper_bound: 375000,
          is_weekend: true,
          is_today: true,
          days_from_now: 1,
        },
      ],
    },
  });

  assert.match(msg, /GO GAS EXECUTIVE DAILY FLASH/);
  assert.match(msg, /3,42,850\.00 L/);
  assert.match(msg, /₹2,64,33,735\.00/);
  assert.match(msg, /₹77\.10\/L/);
  assert.match(msg, /₹1\.40\/L/); // Gap: 78.50 - 77.10
  assert.match(msg, /YUSUFGUDA/);
  assert.match(msg, /3,48,200\.00 L/);
});

test('formats tanker dispatch WhatsApp manifest with prioritized critical orders', () => {
  const msg = buildTankerDispatchWhatsAppMessage(
    { date: '2026-11-06' },
    [
      {
        station: {
          id: 'st-1',
          erp_code: 'JODO9',
          alds_name: 'YUSUFGUDA',
          state: 'TG',
          type: 'JODO',
          coordinator: 'Vikram',
          tm: 'Suresh',
          tank_cap: '10KL',
          sale_qty: 1400,
          collection: 108000,
          new_rate: 77.2,
          other: 0,
          diff: 0,
          erp_rate: 77.2,
          ret_test_cal: 0,
          free_sale_litres: 0,
          free_sale_rupees: 0,
          scheme: 0,
          paytm: 0,
          net_cash_collection: 108000,
          closing_dip_in_ltr: 1200,
          remark: 'Urgent stock needed',
          net_total_collection: 108000,
          effective_rsp: 77.2,
          collection_check: 0,
          scheme_as_per_ho: 0,
          free_sale_pct: 0,
          sale_date: '2026-11-06',
          days_left: 0.9,
          trend_slope: 0,
          status_band: 'Achieved',
        },
        urgency: 'Critical',
        currentStock: 1200,
        dailyBurn: 1400,
        recommendedTanker: '18-Ton / 33,000 L',
        recommendedVolumeLtr: 33000,
      },
    ]
  );

  assert.match(msg, /TANKER REPLENISHMENT DISPATCH MANIFEST/);
  assert.match(msg, /Critical \(<1\.5 Days\):\* 1 Stations/);
  assert.match(msg, /YUSUFGUDA/);
  assert.match(msg, /18-Ton \/ 33,000 L/);
});

test('dispatches messages to provided custom recipients', async () => {
  const res = await sendWhatsAppMessage('test', 'Hello Test', ['+919876543210']);
  assert.equal(res.success, true);
  assert.equal(res.recipientCount, 1);
});
