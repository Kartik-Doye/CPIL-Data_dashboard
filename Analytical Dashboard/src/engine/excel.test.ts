import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { readSpreadsheetRows } from './excel.js';

test('reads spreadsheet headers, rows, formulas, and Excel dates', async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sales');
  worksheet.addRow(['Cost Code', 'Name', 'Date', 'Calculated']);
  worksheet.addRow(['AB001', 'Station One', new Date('2026-10-30T00:00:00.000Z'), {
    formula: 'A2&"!"',
    result: 'AB001!',
  }]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const rows = await readSpreadsheetRows(buffer);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]['Cost Code'], 'AB001');
  assert.equal(rows[0].Name, 'Station One');
  assert.equal(rows[0].Calculated, 'AB001!');
  assert.equal(rows[0].Date, (Date.UTC(2026, 9, 30) - Date.UTC(1899, 11, 30)) / 86_400_000);
});

test('rejects legacy XLS file paths with a clear format error', async () => {
  await assert.rejects(
    readSpreadsheetRows('sales.xls'),
    /Save the workbook as \.xlsx/
  );
});
