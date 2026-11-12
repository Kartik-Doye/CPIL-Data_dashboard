import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { parseStationContactMappings } from './stationContactMapping.js';

function makeWorkbook(rows: Array<Array<string>>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('contact');
  sheet.addRow(['Station contacts']);
  sheet.addRow(['ERP Code', 'Station Name', 'State', 'Region', 'TM']);
  for (const row of rows) sheet.addRow(row);
  return workbook;
}

test('parses ERP-keyed station mappings and skips rows without an assigned TM', () => {
  const workbook = makeWorkbook([
    ['ST001', 'Station One', 'TN', 'Chennai', 'TM One'],
    ['ST002', 'Station Two', 'KA', 'Bengaluru', ''],
  ]);

  const result = parseStationContactMappings(workbook);

  assert.deepEqual(result, {
    mappings: [{
      erpCode: 'ST001',
      stationName: 'Station One',
      state: 'TN',
      region: 'Chennai',
      tm: 'TM One',
    }],
    skippedMissingTm: 1,
  });
});

test('rejects conflicting TM or station assignments for the same ERP code', () => {
  const workbook = makeWorkbook([
    ['ST001', 'Station One', 'TN', 'Chennai', 'TM One'],
    ['ST001', 'Station Renamed', 'TN', 'Chennai', 'TM Two'],
  ]);

  assert.throws(
    () => parseStationContactMappings(workbook),
    /conflicting non-empty mappings for ERP code/,
  );
});
