import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';
import { readSpreadsheetRows } from '../Analytical Dashboard/src/engine/excel.js';

const { Pool } = pg;

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from Manual Work folder or process root
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_NAME = process.env.DB_NAME || 'sale_alds';
const DB_USER = process.env.DB_USER || 'bot_loader';
const DB_PASSWORD = process.env.BOT_LOADER_PASSWORD || process.env.DB_PASSWORD || '';

function logMessage(msg: string) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const formatted = `[${timestamp}] ${msg}`;
  console.log(formatted);

  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const logFile = path.join(logsDir, `load_${dateStr}.log`);
  fs.appendFileSync(logFile, formatted + '\n');
}

function parseDateCell(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'number') {
    const dateObj = new Date((val - 25569) * 86400 * 1000);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString().split('T')[0];
    }
  }
  const str = String(val).trim();
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

export async function processSaleFile(filePath: string, isDryRun = false) {
  logMessage(`Starting ingestion for file: ${path.basename(filePath)}`);

  if (!fs.existsSync(filePath)) {
    logMessage(`[FAILED] File not found: ${filePath}`);
    return false;
  }

  if (!DB_PASSWORD) {
    logMessage(`[FAILED] BOT_LOADER_PASSWORD is not set in Manual Work/.env`);
    return false;
  }

  const pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    connectionTimeoutMillis: 10000,
  });

  try {
    const rawRows = await readSpreadsheetRows(filePath);

    if (!rawRows || rawRows.length === 0) {
      logMessage(`[FAILED] Spreadsheet is empty: ${filePath}`);
      await pool.end();
      return false;
    }

    const validRows: any[] = [];
    const datesSet = new Set<string>();
    const erpCodesSet = new Set<string>();

    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      const costCode = String(r['Cost Code'] || r['CostCode'] || r['COST CODE'] || '').trim();
      if (!costCode) continue;

      if (erpCodesSet.has(costCode)) {
        logMessage(`[FAILED] Duplicate Cost Code found in Excel: ${costCode}`);
        await pool.end();
        return false;
      }
      erpCodesSet.add(costCode);

      const dStr = parseDateCell(r['Date'] || r['date '] || r['DATE']);
      if (dStr) {
        datesSet.add(dStr);
      }

      validRows.push({
        erp_code: costCode,
        alds_name: String(r['ALDS NAME'] || r['ALDS Name'] || r['alds_name'] || '').trim(),
        state: String(r['STATE'] || r['State'] || '').trim(),
        tm: String(r['TM'] || r['tm'] || '').trim(),
        coordinator: String(r['Coordinator'] || r['COORDINATOR'] || '').trim(),
        type: String(r['Type'] || r['TYPE'] || 'LOCO').trim(),
        tank_cap: String(r['TANK CAP'] || r['Tank Cap'] || '').trim(),
        sale_qty: Number(r['SALE QTY'] || r['Sale Qty'] || 0) || 0,
        collection: Number(r['COLLECTION'] || r['Collection'] || 0) || 0,
        new_rate: Number(r['NEW RATE'] || r['New Rate'] || 0) || 0,
        other: Number(r['OTHER'] || 0) || 0,
        diff: Number(r['DIFF'] || 0) || 0,
        erp_rate: Number(r['ERP RATE'] || 0) || 0,
        ret_test_cal: Number(r['RET TEST/CAL'] || 0) || 0,
        free_sale_litres: Number(r['FREE SALE LITRES'] || r['Free Sale Litres'] || r['FREE SALE LTR'] || 0) || 0,
        free_sale_rupees: Number(r['FREE SALE RUPEES'] || r['Free Sale Rupees'] || 0) || 0,
        scheme: String(r['SCHEME'] || '') === 'NA' ? null : Number(r['SCHEME'] || 0) || 0,
        paytm: Number(r['PAYTM'] || 0) || 0,
        net_cash_collection: Number(r['NET CASH COLLECTION'] || 0) || 0,
        closing_dip_in_ltr: Number(r['CLOSING DIP IN LTR'] || r['CLOSING DIP'] || 0) || 0,
        remark: String(r['REMARK'] || r['Remark'] || '').trim(),
        date: dStr,
      });
    }

    if (datesSet.size > 1) {
      logMessage(`[FAILED] Multiple dates detected in file: ${Array.from(datesSet).join(', ')}`);
      await pool.end();
      return false;
    }

    const fileDate = datesSet.size === 1 ? Array.from(datesSet)[0] : new Date().toISOString().slice(0, 10);

    const client = await pool.connect();
    try {
      // Check existing database records
      const checkRes = await client.query(
        'SELECT COUNT(*)::int as count, SUM(sale_qty)::float as sum_qty FROM sale_tracker WHERE sale_date = $1',
        [fileDate]
      );

      const dbCount = checkRes.rows[0].count;
      const dbSumQty = checkRes.rows[0].sum_qty || 0;

      if (dbCount > 0) {
        logMessage(`[ALREADY IN DATABASE] Sale date ${fileDate} is already loaded (${dbCount} rows, ${dbSumQty} L).`);
        if (dbCount !== validRows.length) {
          logMessage(`[WARNING] Excel has ${validRows.length} rows, but Database has ${dbCount} rows.`);
        }
        client.release();
        await pool.end();
        return true;
      }

      if (isDryRun) {
        logMessage(`[DRY RUN SUCCESS] File validated cleanly. ${validRows.length} rows ready for date ${fileDate}.`);
        client.release();
        await pool.end();
        return true;
      }

      // Insert inside a single transaction
      await client.query('BEGIN');

      const insertSql = `
        INSERT INTO sale_tracker (
          erp_code, alds_name, state, tm, coordinator, type, tank_cap,
          sale_qty, collection, new_rate, other, diff, erp_rate, ret_test_cal,
          free_sale_litres, free_sale_rupees, scheme, paytm, net_cash_collection,
          closing_dip_in_ltr, remark, sale_date
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19,
          $20, $21, $22
        )
      `;

      let totalQty = 0;
      for (const row of validRows) {
        totalQty += row.sale_qty;
        await client.query(insertSql, [
          row.erp_code, row.alds_name, row.state, row.tm, row.coordinator, row.type, row.tank_cap,
          row.sale_qty, row.collection, row.new_rate, row.other, row.diff, row.erp_rate, row.ret_test_cal,
          row.free_sale_litres, row.free_sale_rupees, row.scheme, row.paytm, row.net_cash_collection,
          row.closing_dip_in_ltr, row.remark, fileDate
        ]);
      }

      await client.query('COMMIT');
      logMessage(`[SUCCESS] LOADED ${path.basename(filePath)}: ${validRows.length} stations, date ${fileDate}, total volume: ${Math.round(totalQty)} L.`);

      // Archive file
      const archiveDir = path.join(__dirname, 'archive');
      if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
      }
      const archivePath = path.join(archiveDir, `${fileDate}_${path.basename(filePath)}`);
      fs.copyFileSync(filePath, archivePath);
      logMessage(`[ARCHIVED] Copied to ${archivePath}`);

      client.release();
      await pool.end();
      return true;
    } catch (dbErr: any) {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
      logMessage(`[FAILED] Database transaction error: ${dbErr.message}`);
      return false;
    }
  } catch (err: any) {
    await pool.end();
    logMessage(`[FAILED] File parsing error: ${err.message}`);
    return false;
  }
}

// CLI Execution
if (process.argv[1] && process.argv[1].endsWith('load_sales.ts')) {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const fileArgIdx = args.indexOf('--file');
  const targetFile = fileArgIdx !== -1 ? args[fileArgIdx + 1] : path.join(__dirname, 'sale.xlsx');

  processSaleFile(targetFile, isDryRun).then((success) => {
    if (!success) process.exitCode = 1;
  }).catch((e) => {
    console.error('Fatal load error:', e);
    process.exitCode = 1;
  });
}
