import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseRecipientNumbers,
  getWhatsAppStatus,
  maskPhoneNumber,
  buildExecutiveWhatsAppMessage,
  buildTankerDispatchWhatsAppMessage,
  isRetryableWhatsAppInitializationError,
  isWhatsAppSessionProfileLockError,
  setWhatsAppRecipients,
  sendWhatsAppMessage,
} from './whatsappService.js';
import { classifyZeroSaleReason } from './formatting.js';
import type { StationRecord } from '../types.js';

function makeStation(overrides: Partial<StationRecord>): StationRecord {
  return {
    id: 'station',
    erp_code: 'ST001',
    alds_name: 'Station',
    type: 'COCO',
    coordinator: 'Maya',
    state: 'TG',
    tm: 'Suresh',
    tank_cap: '10KL',
    sale_qty: 0,
    collection: 0,
    new_rate: 0,
    other: 0,
    diff: 0,
    erp_rate: 0,
    ret_test_cal: 0,
    free_sale_litres: 0,
    free_sale_rupees: 0,
    scheme: 0,
    paytm: 0,
    net_cash_collection: 0,
    closing_dip_in_ltr: 0,
    remark: '',
    net_total_collection: 0,
    effective_rsp: 0,
    collection_check: 0,
    scheme_as_per_ho: 0,
    free_sale_pct: 0,
    sale_date: '2026-11-06',
    days_left: 0,
    trend_slope: 0,
    status_band: 'On track',
    ...overrides,
  };
}

test('parses and cleans valid recipient phone numbers', () => {
  const result = parseRecipientNumbers('+91 98765 43210, 918087018975, invalid, 123');
  assert.equal(result.length, 2);
  assert.equal(result[0], '+919876543210');
  assert.equal(result[1], '918087018975');
});

test('only retries transient WhatsApp browser navigation failures', () => {
  assert.equal(
    isRetryableWhatsAppInitializationError(new Error('Execution context was destroyed, most likely because of a navigation.')),
    true,
  );
  assert.equal(isRetryableWhatsAppInitializationError(new Error('Authentication failed.')), false);
});

test('recognizes locked WhatsApp browser session files for safe recovery', () => {
  assert.equal(
    isWhatsAppSessionProfileLockError(new Error('EBUSY: resource busy or locked, unlink CrashpadMetrics-active.pma')),
    true,
  );
  assert.equal(isWhatsAppSessionProfileLockError(new Error('Authentication failed.')), false);
});

test('uses the saved recipient list for later WhatsApp sends', () => {
  const previousRecipients = parseRecipientNumbers();
  setWhatsAppRecipients(['+919876543210', '447700900123']);
  assert.deepEqual(parseRecipientNumbers(), ['+919876543210', '447700900123']);
  setWhatsAppRecipients(previousRecipients);
});

test('masks phone numbers for privacy display in UI', () => {
  assert.equal(maskPhoneNumber('918087018975'), '918****975');
  assert.equal(maskPhoneNumber('123'), '****');
});

test('formats a concise executive WhatsApp brief with risk bands and forecast context', () => {
  const msg = buildExecutiveWhatsAppMessage({
    date: '2026-11-06',
    total_sale_qty: 342850,
    total_collection: 26433735,
    effective_rsp: 77.10,
    average_rsp: 78.50,
    stations_with_sale: 312,
    stations_total: 316,
    zero_sale_count: 5,
    stockout_risk_stations: [
      { code: 'JODO9', name: 'YUSUFGUDA', days_left: 0.9, stock_ltr: 1200, daily_burn_ltr: 1333, state: 'TG', remark: '' },
      { code: 'KA04', name: 'KAYRAMBEDU', days_left: 1.2, stock_ltr: 1660, daily_burn_ltr: 1383, state: 'KA', remark: '' },
    ],
    history_30d: Array.from({ length: 7 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 9, 30 + index)).toISOString().slice(0, 10),
      day_name: 'Monday',
      sale_qty: 320000,
      collection: 0,
      effective_rsp: 77,
      active_stations: 300,
      zero_sale_count: 0,
    })),
    all_stations: [makeStation({ erp_code: 'JODO9', alds_name: 'YUSUFGUDA', tm: 'Suresh' })],
    zero_sale_stations: [
      makeStation({ erp_code: 'ZERO1', tm: 'No TM' }),
      makeStation({ erp_code: 'ZERO2', remark: 'No Stock' }),
      makeStation({ erp_code: 'ZERO3', remark: 'Sale Stop' }),
      makeStation({ erp_code: 'ZERO4', remark: 'License issue' }),
      makeStation({ erp_code: 'ZERO5', remark: 'Sale not received' }),
    ],
    top_performing_stations: Array.from({ length: 10 }, (_, index) => makeStation({
      erp_code: `TOP${index + 1}`,
      sale_qty: 4868,
    })),
    top_declining_stations: Array.from({ length: 10 }, (_, index) => ({
      code: `DECLINE${index + 1}`,
      name: `Decline ${index + 1}`,
      state: 'TG',
      drop_pct: index < 8 ? 50 : 40,
      drop_litres: 100,
      current_sale: 100,
    })),
    forecast: {
      horizon_days: 7,
      predicted_total_7d: 2415400,
      mape_ensemble: 6.8,
      backtest_days: 14,
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

  assert.match(msg, /GO GAS MORNING BRIEF — 06 Nov 2026/);
  assert.match(msg, /🟢 \*PERFORMANCE\*/);
  assert.match(msg, /🟠 \*EXCEPTIONS\*/);
  assert.match(msg, /🔴 \*ACTIONS — 10 AM ESCALATION \/ EOD CLOSURE\*/);
  assert.match(msg, /🔵 \*FORECAST/);
  assert.match(msg, /Sales: \*3,42,850 L\* \(\*\+7\.1% vs 7d avg\*\) \| Collection: \*₹2\.64 Cr\*/);
  assert.match(msg, /Reporting: \*312\/316\* \| Top-10 share: \*14\.2%\*/);
  assert.match(msg, /Zero sales: \*5\* \(1 stockout, 2 missing TM\/data, 1 sale stop, 1 license\)/);
  assert.match(msg, /Stock cover: \*1 critical \(<1d\)\*, \*1 high\* \(1–2d\), 0 monitor \(2–3d\)/);
  assert.match(msg, /Refill \*1 critical sites\*: YUSUFGUDA \(Suresh\)/);
  assert.match(msg, /Assign owners and close \*5 zero-sale sites\* by EOD; escalate unresolved blockers by \*10 AM\*/);
  assert.match(msg, /Slump alert: \*8 of 10 watched stations\* down \*≥48%\* vs 3-mo average/);
  assert.match(msg, /FORECAST — 07 Nov 2026[\s\S]*\*3,48,200 L\* \(range 3\.20L–3\.75L\)/);
  assert.match(msg, /Historical MAPE: \*6\.8%\* across 14 days/);
  assert.match(msg, /⚪ \*NOTE:\* Excludes margin, credit & bank cash\. Full station & financial details in emailed Excel\./);
  assert.equal((msg.match(/•/g) || []).length, 8);
  const wordCount = msg.trim().split(/\s+/).length;
  assert.ok(wordCount >= 120 && wordCount <= 160, `Expected 120–160 words; got ${wordCount}.`);
  assert.ok(msg.length <= 1000, `Expected at most 1,000 characters; got ${msg.length}.`);
});

test('keeps executive WhatsApp brief concise and caps named action items', () => {
  const msg = buildExecutiveWhatsAppMessage({
    date: '2026-11-06',
    total_sale_qty: 1000,
    total_collection: 77000,
    effective_rsp: 77,
    average_rsp: 77,
    stations_with_sale: 1,
    stations_total: 4,
    zero_sale_count: 3,
    stockout_risk_stations: [1, 2, 3, 4].map((index) => ({
      code: `RISK${index}`,
      name: `Critical-${index}`,
      days_left: 0.5,
      stock_ltr: 100,
      daily_burn_ltr: 200,
      state: 'TG',
      remark: '',
    })),
    zero_sale_stations: [1, 2, 3].map((index) => makeStation({
      erp_code: `ZERO${index}`,
      alds_name: `Zero-${index}`,
      remark: 'Sale Stop',
    })),
    forecast: {
      horizon_days: 7,
      predicted_total_7d: 0,
      mape_ensemble: null,
      mape_linear: null,
      mape_holt_winters: null,
      mape_naive: null,
      backtest_days: 0,
      forecast: [],
    },
  });

  assert.equal((msg.match(/•/g) || []).length, 8);
  assert.match(msg, /Critical-1/);
  assert.match(msg, /Critical-2/);
  assert.match(msg, /Critical-3/);
  assert.doesNotMatch(msg, /Critical-4/);
  assert.match(msg, /\+1 more/);
});

test('classifies zero-sale reasons without treating unknown remarks as reporting gaps', () => {
  assert.equal(classifyZeroSaleReason('No TM', ''), 'No salesperson');
  assert.equal(classifyZeroSaleReason('Suresh', 'No Stock'), 'Stock unavailable');
  assert.equal(classifyZeroSaleReason('Suresh', 'Sale Stop'), 'Commercial stop');
  assert.equal(classifyZeroSaleReason('No TM', 'No Stock'), 'Stock unavailable');
  assert.equal(classifyZeroSaleReason('Suresh', ''), 'Unclassified — verify');
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

test('reports WhatsApp Web as disconnected until a real session is authenticated', () => {
  const status = getWhatsAppStatus();
  assert.equal(status.connected, false);
  assert.equal(status.status, 'pairing_required');
});

test('does not report a successful dispatch when WhatsApp Web is disconnected', async () => {
  await assert.rejects(
    sendWhatsAppMessage('test', 'Hello Test', ['+919876543210']),
    /WhatsApp Web is not connected/
  );
});
