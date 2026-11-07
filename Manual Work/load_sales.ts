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
const DB_USER = process.env.BOT_LOADER_USER || 'bot_loader';
const DB_PASSWORD = process.env.BOT_LOADER_PASSWORD || '';

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

function findCell(record: Record<string, unknown>, aliases: string[]): [string, unknown] | undefined {
  const wanted = new Set(aliases.map((name) => name.trim().toLowerCase().replace(/[\s_]+/g, '')));
  return Object.entries(record).find(([header]) =>
    wanted.has(header.trim().toLowerCase().replace(/[\s_]+/g, ''))
  );
}

function readNumber(
  record: Record<string, unknown>,
  aliases: string[],
  rowNumber: number,
  displayColumn: string
): number {
  const cell = findCell(record, aliases);
  if (!cell || cell[1] === '' || cell[1] === null || cell[1] === undefined) return 0;
  const value = typeof cell[1] === 'number' ? cell[1] : Number(String(cell[1]).replace(/,/g, '').trim());
  if (!Number.isFinite(value)) {
    throw new Error(`[FAILED] Row ${rowNumber}, column "${cell[0]}" (${displayColumn}): expected a number, got "${String(cell[1])}".`);
  }
  return value;
}

export async function processSaleFile(filePath: string, isDryRun = false) {
  logMessage(`[STARTED] Loading file: ${path.basename(filePath)}`);

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

    const headers = Object.keys(rawRows[0]);
    if (!findCell(Object.fromEntries(headers.map((header) => [header, ''])), ['Cost Code', 'CostCode', 'ERP Code', 'Code'])) {
      logMessage('[FAILED] Header row, column "Cost Code": required column is missing.');
      await pool.end();
      return false;
    }
    if (!findCell(Object.fromEntries(headers.map((header) => [header, ''])), ['Date'])) {
      logMessage('[FAILED] Header row, column "Date": required column is missing.');
      await pool.end();
      return false;
    }

    const validRows: any[] = [];
    const datesSet = new Set<string>();
    const erpCodes = new Map<string, number>();

    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      const rowNumber = r.__rowNumber;
      const codeCell = findCell(r, ['Cost Code', 'CostCode', 'COST CODE', 'ERP Code', 'Code']);
      const costCode = String(codeCell?.[1] ?? '').trim();
      if (!costCode) {
        throw new Error(`[FAILED] Row ${rowNumber}, column "${codeCell?.[0] || 'Cost Code'}": value is required.`);
      }

      const previousRow = erpCodes.get(costCode);
      if (previousRow !== undefined) {
        throw new Error(`[FAILED] Row ${rowNumber}, column "${codeCell?.[0] || 'Cost Code'}": duplicate Cost Code "${costCode}" (first seen at row ${previousRow}).`);
      }
      erpCodes.set(costCode, rowNumber);

      const dateCell = findCell(r, ['Date']);
      const dateValue = dateCell?.[1];
      const dStr = parseDateCell(dateValue);
      if (!dStr) {
        throw new Error(`[FAILED] Row ${rowNumber}, column "${dateCell?.[0] || 'Date'}": invalid or missing date value "${String(dateValue ?? '')}".`);
      }
      datesSet.add(dStr);

      validRows.push({
        sourceRow: rowNumber,
        erp_code: costCode,
        alds_name: String(findCell(r, ['ALDS NAME', 'ALDS Name', 'alds_name'])?.[1] ?? '').trim(),
        state: String(findCell(r, ['STATE', 'State'])?.[1] ?? '').trim(),
        tm: String(findCell(r, ['TM'])?.[1] ?? '').trim(),
        coordinator: String(findCell(r, ['Coordinator'])?.[1] ?? '').trim(),
        type: String(findCell(r, ['Type'])?.[1] ?? 'LOCO').trim(),
        tank_cap: String(findCell(r, ['TANK CAP', 'Tank Cap'])?.[1] ?? '').trim(),
        sale_qty: readNumber(r, ['SALE QTY', 'Sale Qty'], rowNumber, 'Sale Qty'),
        collection: readNumber(r, ['COLLECTION'], rowNumber, 'Collection'),
        new_rate: readNumber(r, ['NEW RATE', 'New Rate'], rowNumber, 'New Rate'),
        other: readNumber(r, ['OTHER'], rowNumber, 'Other'),
        diff: readNumber(r, ['DIFF'], rowNumber, 'Diff'),
        erp_rate: readNumber(r, ['ERP RATE'], rowNumber, 'ERP Rate'),
        ret_test_cal: readNumber(r, ['RET TEST/CAL'], rowNumber, 'Ret Test/Cal'),
        free_sale_litres: readNumber(r, ['FREE SALE LITRES', 'Free Sale Litres', 'FREE SALE LTR'], rowNumber, 'Free Sale Litres'),
        free_sale_rupees: readNumber(r, ['FREE SALE RUPEES', 'Free Sale Rupees'], rowNumber, 'Free Sale Rupees'),
        scheme: String(findCell(r, ['SCHEME'])?.[1] ?? '').trim().toUpperCase() === 'NA'
          ? null
          : readNumber(r, ['SCHEME'], rowNumber, 'Scheme'),
        paytm: readNumber(r, ['PAYTM'], rowNumber, 'Paytm'),
        net_cash_collection: readNumber(r, ['NET CASH COLLECTION'], rowNumber, 'Net Cash Collection'),
        closing_dip_in_ltr: readNumber(r, ['CLOSING DIP IN LTR', 'CLOSING DIP'], rowNumber, 'Closing Dip'),
        remark: String(findCell(r, ['REMARK'])?.[1] ?? '').trim(),
        date: dStr,
      });
    }

    if (datesSet.size > 1) {
      logMessage(`[FAILED] Rows in column "Date": multiple sale dates detected (${Array.from(datesSet).join(', ')}). The file must contain one date.`);
      await pool.end();
      return false;
    }

    const fileDate = Array.from(datesSet)[0];

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
        logMessage(`[SKIPPED] Sale date ${fileDate} is already in the database (${dbCount} rows, ${dbSumQty} L).`);
        if (dbCount !== validRows.length) {
          logMessage(`[WARNING] Excel has ${validRows.length} rows, but Database has ${dbCount} rows.`);
        }
        client.release();
        await pool.end();
        return true;
      }

      if (isDryRun) {
        logMessage(`[VALIDATED] File is valid: ${validRows.length} rows ready for date ${fileDate}; no database changes made.`);
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
        try {
          await client.query(insertSql, [
            row.erp_code, row.alds_name, row.state, row.tm, row.coordinator, row.type, row.tank_cap,
            row.sale_qty, row.collection, row.new_rate, row.other, row.diff, row.erp_rate, row.ret_test_cal,
            row.free_sale_litres, row.free_sale_rupees, row.scheme, row.paytm, row.net_cash_collection,
            row.closing_dip_in_ltr, row.remark, fileDate
          ]);
        } catch (insertError: any) {
          const dbLocation = insertError.column
            ? `column "${insertError.column}"`
            : insertError.constraint
              ? `constraint "${insertError.constraint}"`
              : 'database constraint/data';
          throw new Error(`[FAILED] Row ${row.sourceRow} (Cost Code "${row.erp_code}"), ${dbLocation}: ${insertError.message}`);
        }
        totalQty += row.sale_qty;
      }

      await client.query('COMMIT');
      logMessage(`[LOADED] ${path.basename(filePath)}: ${validRows.length} stations, date ${fileDate}, total volume: ${Math.round(totalQty)} L.`);

      client.release();
      await pool.end();
      return true;
    } catch (dbErr: any) {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
      logMessage(dbErr.message.startsWith('[FAILED]') ? dbErr.message : `[FAILED] Database error: ${dbErr.message}`);
      return false;
    }
  } catch (err: any) {
    await pool.end();
    logMessage(err.message.startsWith('[FAILED]') ? err.message : `[FAILED] File "${path.basename(filePath)}": ${err.message}`);
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
