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

test('formats WhatsApp sales brief with totals, sales alerts, and forecast', () => {
  const msg = buildExecutiveWhatsAppMessage({
    date: '2026-11-06',
    total_sale_qty: 342850,
    total_collection: 26433735,
    total_paytm_collection: 7820500,
    stations_with_sale: 312,
    stations_total: 316,
    zero_sale_count: 3,
    stockout_risk_stations: [
      { name: 'YUSUFGUDA', state: 'TG', days_left: 0.3 },
      { name: 'KAYRAMBEDU', state: 'KA', days_left: 1.2 },
    ],
    zero_sale_stations: [
      { alds_name: 'Thiravator', state: 'TN', tm: 'Suresh', remark: 'No Stock' },
      { alds_name: 'Karim Nagar', state: 'TG', tm: 'No TM', remark: '' },
      { alds_name: 'Gadag', state: 'KA', tm: 'Chinmay', remark: 'Sale Stop' },
    ],
    top_declining_stations: [
      { name: 'Viliarasampti', state: 'TN', drop_pct: 72 },
      { name: 'MKB Nagar', state: 'TN', drop_pct: 69 },
      { name: 'Belgavi', state: 'KA', drop_pct: 61 },
    ],
    top_performing_stations: [
      { alds_name: 'Nashik Adgao', sale_qty: 8200 },
      { alds_name: 'Dwarka', sale_qty: 7300 },
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

  assert.match(msg, /GO GAS SALES \| 06 Nov/);
  assert.match(msg, /\*Total Sales:\* 3,42,850 L \(↑7\.1% vs 7d avg\) \| \*Total Collection:\* ₹2,64,33,735\.00/);
  assert.match(msg, /\*7-Day Average:\* 3,20,000 L \| \*Forecast \(07 Nov\):\* 3,48,200 L \(range 3,20,000–3,75,000 L\)/);
  assert.match(msg, /\*Active:\* 312\/316 \| \*Paytm Digital:\* 29\.6%/);
  assert.match(msg, /DRY-OUT ALERT \(<1 Day Stock\)[\s\S]*YUSUFGUDA \(TG\) — 0\.3d/);
  assert.match(msg, /ZERO SALE \(3\)[\s\S]*No Stock:\* Thiravator[\s\S]*No Report:\* Karim Nagar[\s\S]*Stopped:\* Gadag \(Chinmay\)/);
  assert.match(msg, /SHARP DROPS[\s\S]*Viliarasampti \(TN\): ↓72%[\s\S]*MKB Nagar \(TN\): ↓69%[\s\S]*Belgavi \(KA\): ↓61%/);
  assert.match(msg, /TOP:\* Nashik Adgao \(8\.2K L\) \| Dwarka \(7\.3K L\)/);
  assert.doesNotMatch(msg, /Target Today/);
});

test('reports unavailable sales comparisons and forecasts clearly', () => {
  const msg = buildExecutiveWhatsAppMessage({
    date: '2026-11-06',
    total_sale_qty: 1000,
    total_collection: 0,
    total_paytm_collection: 0,
    stations_with_sale: 1,
    stations_total: 1,
    zero_sale_count: 0,
    stockout_risk_stations: [],
    zero_sale_stations: [],
    top_declining_stations: [],
    top_performing_stations: [],
    forecast: {
      horizon_days: 7,
      predicted_total_7d: 0,
      mape_ensemble: null,
      mape_linear: null,
      mape_holt_winters: null,
      mape_naive: null,
      forecast: [],
    },
  });

  assert.match(msg, /\*Total Sales:\* 1,000 L \(N\/A vs 7d avg\)/);
  assert.match(msg, /\*7-Day Average:\* N\/A \| \*Forecast \(unavailable\):\* Unavailable/);
  assert.match(msg, /\*Paytm Digital:\* N\/A/);
  assert.match(msg, /\*DRY-OUT ALERT \(<1 Day Stock\)\*\n• None/);
  assert.match(msg, /\*ZERO SALE \(0\)\*\n• None/);
  assert.match(msg, /\*SHARP DROPS\*\n• None/);
  assert.match(msg, /TOP:\* No sales data/);
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
