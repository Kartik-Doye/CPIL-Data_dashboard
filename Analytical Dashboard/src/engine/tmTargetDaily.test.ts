import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import {
  loadTmTargetDailyFromFile,
  parseTmTargetDailyWorkbook,
} from './tmTargetDaily.js';
import { buildTmPersonalizedWhatsAppBrief } from './whatsappBriefing.js';
import { buildExecutivePdfBuffer } from './pdfReport.js';
import type { StationRecord } from '../types.js';

test('loads TM Target Daily.xlsx from repository root with 316 stations and 28 TMs', async () => {
  const filePath = path.resolve(process.cwd(), 'TM Target Daily.xlsx');
  const summary = await loadTmTargetDailyFromFile(filePath);

  assert.ok(summary);
  assert.equal(summary.stationCount, 316);
  assert.equal(summary.tmCount, 28);
  assert.equal(summary.periodLabel, 'Nov. 2026 Avg. daily Tgt.');
  assert.equal(summary.monthlyTargetLabel, 'Nov. 2026 Mnth. Tgt.');
  assert.deepEqual(summary.historicalMonthLabels, ['Aug. 26', 'Sep. 26', 'Oct. 26']);
  assert.equal(summary.stationTargetsByErp['AA006'], 1838);
  assert.equal(summary.stationTargetsByErp['AN013'], 11655);
  assert.equal(summary.tmTotalDailyTargets['Ravi Salvi'], 17424);
  assert.equal(summary.tmTotalDailyTargets['Vikram Joshi'], 45047);
  assert.equal(summary.tmTotalDailyTargets['Ruturaj G'], 23509);
  assert.equal(summary.stationMetaByErp['AA014'].isConsecutive3mDecline, true);
  assert.ok(summary.stationMetaByErp['AA014'].threeMonthChangePct < 0);
});

test('dynamically detects updated monthly target column headers without hardcoding the month name', () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['ERP Code', 'Sr. No.', 'Station Name', 'State', 'TM', 'SS', 'Type', 'Dec. 2026 Avg. daily Tgt.']);
  ws.addRow(['AA006', 1, 'Ahmednagar', 'MS', 'Ravi Salvi', 'Dnyaneshwar Karande', 'LOCO', 2100]);
  ws.addRow(['AA014', 2, 'Ahmednagar-Bholegaon', 'MS', 'Ravi Salvi', 'Namdev Waghmare', 'LOCO', 1400]);

  const summary = parseTmTargetDailyWorkbook(wb, 'TM Target Daily.xlsx');
  assert.equal(summary.periodLabel, 'Dec. 2026 Avg. daily Tgt.');
  assert.equal(summary.stationCount, 2);
  assert.equal(summary.tmTotalDailyTargets['Ravi Salvi'], 3500);
  assert.equal(summary.tmAvgStationTargets['Ravi Salvi'], 1750);
});

const SAMPLE_STATIONS: StationRecord[] = [
  {
    id: 'AA006',
    erp_code: 'AA006',
    alds_name: 'Ahmednagar',
    state: 'MS',
    coordinator: 'Coord 1',
    tm: 'Ravi Salvi',
    ss_name: 'Dnyaneshwar Karande',
    type: 'LOCO',
    tank_cap: '10KL',
    sale_date: '2026-11-18',
    sale_qty: 1200,
    daily_target: 1838,
    monthly_target: 55140,
    mtd_sale_qty: 24000,
    mtd_reporting_days: 18,
    mtd_pro_rata_target: 33084,
    mtd_achievement_pct: 72.5,
    monthly_target_achieved_pct: 43.5,
    required_asking_rate_l_per_day: 2595,
    projected_eom_sale_qty: 40000,
    projected_eom_achievement_pct: 72.5,
    target_variance_qty: -638,
    target_achievement_pct: 65.3,
    collection: 96000,
    net_total_collection: 96000,
    paytm: 16000,
    net_cash_collection: 80000,
    digital_pct: 16.7,
    cash_pct: 83.3,
    prior_7d_digital_pct: 35.0,
    cash_spike_pct: 18.3,
    other: 0,
    diff: 0,
    new_rate: 80,
    erp_rate: 80,
    ret_test_cal: 0,
    free_sale_litres: 0,
    free_sale_rupees: 0,
    scheme: 0,
    closing_dip_in_ltr: 1800,
    remark: '',
    effective_rsp: 80,
    collection_check: 0,
    scheme_as_per_ho: 0,
    free_sale_pct: 0,
    rolling_7d_burn: 1200,
    days_left: 1.5,
    trend_slope: -12,
    status_band: 'Behind',
    historical_months: [
      { monthLabel: 'Aug. 26', totalAch: 51000, avgDailyAch: 1645 },
      { monthLabel: 'Sep. 26', totalAch: 46500, avgDailyAch: 1550 },
      { monthLabel: 'Oct. 26', totalAch: 43400, avgDailyAch: 1400 },
    ],
    starting_month_avg_daily: 1645,
    latest_month_avg_daily: 1400,
    three_month_change_pct: -14.9,
    is_consecutive_3m_decline: true,
    target_vs_starting_month_pct: -27.1,
  },
];

test('builds personalized per-TM WhatsApp action card and vector PDF dossier buffer', () => {
  const brief = buildTmPersonalizedWhatsAppBrief('Ravi Salvi', SAMPLE_STATIONS, '2026-11-18', 'Nov. 2026 Avg. daily Tgt.');
  assert.ok(brief.includes('*GO GAS TERRITORY ACTION BRIEF — TM Ravi Salvi'));
  assert.ok(brief.includes('2,595 L/day'));
  assert.ok(brief.includes('[SS: Dnyaneshwar Karande]'));
  assert.ok(brief.includes('Ahmednagar'));

  const pdfBuffer = buildExecutivePdfBuffer({
    date: '2026-11-18',
    stations: SAMPLE_STATIONS,
  });
  assert.ok(Buffer.isBuffer(pdfBuffer));
  assert.ok(pdfBuffer.length > 1000);
  assert.equal(pdfBuffer.subarray(0, 8).toString('latin1'), '%PDF-1.4');
});
