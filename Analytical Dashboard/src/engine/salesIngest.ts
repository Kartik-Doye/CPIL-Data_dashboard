import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { readSpreadsheetRows, SpreadsheetRow } from './excel.js';
import { estimateSchemeDiscount } from '../../../Manual Work/schemeDiscount.js';
import { query, isLoaderConfigured, withLoaderTransaction } from './db.js';

export interface ParsedSaleRow {
  sourceRow: number;
  erp_code: string;
  alds_name: string;
  state: string;
  tm: string;
  coordinator: string;
  type: string;
  tank_cap: string;
  sale_qty: number;
  collection: number;
  new_rate: number;
  other: number;
  diff: number;
  erp_rate: number;
  ret_test_cal: number;
  free_sale_litres: number;
  free_sale_rupees: number;
  scheme: number;
  paytm: number;
  net_cash_collection: number;
  closing_dip_in_ltr: number;
  remark: string;
  net_total_collection: number;
  effective_rsp: number;
  collection_check: number;
  scheme_as_per_ho: number;
  free_sale_pct: number;
  date: string;
}

export interface SalesWorkbookPreview {
  valid: boolean;
  fileName: string;
  saleDate: string;
  stationCount: number;
  activeStationCount: number;
  zeroSaleCount: number;
  totalSaleQty: number;
  totalCollection: number;
  totalPaytm: number;
  outlierStations: Array<{ erp_code: string; alds_name: string; sale_qty: number }>;
  existingDbCount: number;
  existingDbVolume: number;
  loaderConfigured: boolean;
  warnings: string[];
  sampleRows: Array<{
    erp_code: string;
    alds_name: string;
    state: string;
    sale_qty: number;
    collection: number;
  }>;
}

function parseDateCell(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    const dateObj = new Date((val - 25569) * 86400 * 1000);
    if (!Number.isNaN(dateObj.getTime())) {
      return dateObj.toISOString().split('T')[0];
    }
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parts = str.split(/[-/]/);
  if (parts.length === 3 && parts[2].length === 4) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  return null;
}

function findCell(record: Record<string, unknown>, aliases: string[]): [string, unknown] | undefined {
  const wanted = new Set(aliases.map((name) => name.trim().toLowerCase().replace(/[\s_]+/g, '')));
  return Object.entries(record).find(([header]) =>
    wanted.has(header.trim().toLowerCase().replace(/[\s_]+/g, '')),
  );
}

function readNumber(
  record: Record<string, unknown>,
  aliases: string[],
  rowNumber: number,
  displayColumn: string,
): number {
  const cell = findCell(record, aliases);
  if (!cell || cell[1] === '' || cell[1] === null || cell[1] === undefined) return 0;
  const value = typeof cell[1] === 'number' ? cell[1] : Number(String(cell[1]).replace(/,/g, '').trim());
  if (!Number.isFinite(value)) {
    throw new Error(`Row ${rowNumber}, column "${cell[0]}" (${displayColumn}): expected a number, got "${String(cell[1])}".`);
  }
  return value;
}

export function validateSpreadsheetSalesRows(rawRows: SpreadsheetRow[]): {
  saleDate: string;
  rows: ParsedSaleRow[];
  warnings: string[];
  outlierStations: Array<{ erp_code: string; alds_name: string; sale_qty: number }>;
} {
  if (!rawRows || rawRows.length === 0) {
    throw new Error('The uploaded spreadsheet is empty.');
  }

  const headers = Object.keys(rawRows[0]);
  const dummyHeaderObj = Object.fromEntries(headers.map((h) => [h, '']));
  if (!findCell(dummyHeaderObj, ['Cost Code', 'CostCode', 'ERP Code', 'Code'])) {
    throw new Error('Header row is missing required column "Cost Code" (or "ERP Code").');
  }
  if (!findCell(dummyHeaderObj, ['Date'])) {
    throw new Error('Header row is missing required column "Date".');
  }

  const validRows: ParsedSaleRow[] = [];
  const datesSet = new Set<string>();
  const erpCodes = new Map<string, number>();
  const outlierStations: Array<{ erp_code: string; alds_name: string; sale_qty: number }> = [];
  const warnings: string[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];
    const rowNumber = r.__rowNumber || i + 2;
    const codeCell = findCell(r, ['Cost Code', 'CostCode', 'COST CODE', 'ERP Code', 'Code']);
    const costCode = String(codeCell?.[1] ?? '').trim();
    if (!costCode) {
      throw new Error(`Row ${rowNumber}, column "${codeCell?.[0] || 'Cost Code'}": Cost Code value is required.`);
    }

    const previousRow = erpCodes.get(costCode);
    if (previousRow !== undefined) {
      throw new Error(`Row ${rowNumber}: duplicate Cost Code "${costCode}" (first seen at row ${previousRow}).`);
    }
    erpCodes.set(costCode, rowNumber);

    const dateCell = findCell(r, ['Date']);
    const dStr = parseDateCell(dateCell?.[1]);
    if (!dStr) {
      throw new Error(`Row ${rowNumber}, column "${dateCell?.[0] || 'Date'}": invalid or missing date "${String(dateCell?.[1] ?? '')}".`);
    }
    datesSet.add(dStr);

    const saleQty = readNumber(r, ['SALE QTY', 'Sale Qty'], rowNumber, 'Sale Qty');
    if (saleQty < 0) {
      throw new Error(`Row ${rowNumber} (Cost Code "${costCode}"): negative Sale Qty (${saleQty}) is not allowed.`);
    }
    const collection = readNumber(r, ['COLLECTION'], rowNumber, 'Collection');
    const newRate = readNumber(r, ['NEW RATE', 'New Rate'], rowNumber, 'New Rate');
    const erpRate = readNumber(r, ['ERP RATE'], rowNumber, 'ERP Rate');
    const schemeCell = findCell(r, ['SCHEME']);
    const scheme = estimateSchemeDiscount(schemeCell?.[1], saleQty, newRate || erpRate, rowNumber);
    const freeSaleLitres = readNumber(r, ['FREE SALE LITRES', 'Free Sale Litres', 'FREE SALE LTR'], rowNumber, 'Free Sale Litres');
    const paytm = readNumber(r, ['PAYTM'], rowNumber, 'Paytm');
    const netCashCollection = readNumber(r, ['NET CASH COLLECTION'], rowNumber, 'Net Cash Collection');
    const netTotalCollectionCell = findCell(r, ['NET TOTAL COLLECTION', 'Net Total Collection']);
    const netTotalCollection = netTotalCollectionCell && netTotalCollectionCell[1] !== ''
      ? readNumber(r, ['NET TOTAL COLLECTION', 'Net Total Collection'], rowNumber, 'Net Total Collection')
      : collection;
    const effectiveRspCell = findCell(r, ['EFFECTIVE RSP', 'Effective RSP']);
    const effectiveRsp = effectiveRspCell && effectiveRspCell[1] !== ''
      ? readNumber(r, ['EFFECTIVE RSP', 'Effective RSP'], rowNumber, 'Effective RSP')
      : saleQty > 0
        ? Number((netTotalCollection / saleQty).toFixed(2))
        : (newRate || erpRate || 0);
    const collectionCheck = readNumber(r, ['COLLECTION CHECK', 'Collection Check'], rowNumber, 'Collection Check');
    const schemeAsPerHo = readNumber(r, ['SCHEME AS PER HO', 'Scheme As Per HO'], rowNumber, 'Scheme As Per HO');
    const freeSalePctCell = findCell(r, ['FREE SALE PCT', 'Free Sale %', 'FREE SALE %']);
    const freeSalePct = freeSalePctCell && freeSalePctCell[1] !== ''
      ? readNumber(r, ['FREE SALE PCT', 'Free Sale %', 'FREE SALE %'], rowNumber, 'Free Sale %')
      : saleQty > 0
        ? Number(((freeSaleLitres / saleQty) * 100).toFixed(2))
        : 0;

    const aldsName = String(findCell(r, ['ALDS NAME', 'ALDS Name', 'alds_name'])?.[1] ?? '').trim();
    if (saleQty > 4500) {
      outlierStations.push({ erp_code: costCode, alds_name: aldsName, sale_qty: saleQty });
    }

    validRows.push({
      sourceRow: rowNumber,
      erp_code: costCode,
      alds_name: aldsName,
      state: String(findCell(r, ['STATE', 'State'])?.[1] ?? '').trim(),
      tm: String(findCell(r, ['TM'])?.[1] ?? '').trim(),
      coordinator: String(findCell(r, ['Coordinator'])?.[1] ?? '').trim(),
      type: String(findCell(r, ['Type'])?.[1] ?? 'LOCO').trim(),
      tank_cap: String(findCell(r, ['TANK CAP', 'Tank Cap'])?.[1] ?? '').trim(),
      sale_qty: saleQty,
      collection,
      new_rate: newRate,
      other: readNumber(r, ['OTHER'], rowNumber, 'Other'),
      diff: readNumber(r, ['DIFF'], rowNumber, 'Diff'),
      erp_rate: erpRate,
      ret_test_cal: readNumber(r, ['RET TEST/CAL'], rowNumber, 'Ret Test/Cal'),
      free_sale_litres: freeSaleLitres,
      free_sale_rupees: readNumber(r, ['FREE SALE RUPEES', 'Free Sale Rupees'], rowNumber, 'Free Sale Rupees'),
      scheme,
      paytm,
      net_cash_collection: netCashCollection,
      closing_dip_in_ltr: readNumber(r, ['CLOSING DIP IN LTR', 'CLOSING DIP'], rowNumber, 'Closing Dip'),
      remark: String(findCell(r, ['REMARK'])?.[1] ?? '').trim(),
      net_total_collection: netTotalCollection,
      effective_rsp: effectiveRsp,
      collection_check: collectionCheck,
      scheme_as_per_ho: schemeAsPerHo,
      free_sale_pct: freeSalePct,
      date: dStr,
    });
  }

  if (datesSet.size > 1) {
    throw new Error(`Multiple sale dates detected (${Array.from(datesSet).join(', ')}). Each daily sales upload must contain a single operating date.`);
  }

  const saleDate = Array.from(datesSet)[0];
  if (outlierStations.length > 0) {
    warnings.push(`${outlierStations.length} station(s) exceed 4,500 L daily volume (${outlierStations.slice(0, 3).map((o) => `${o.alds_name || o.erp_code}: ${Math.round(o.sale_qty)} L`).join(', ')}). Verify against meter readings.`);
  }

  return { saleDate, rows: validRows, warnings, outlierStations };
}

async function parseWorkbookBuffer(buffer: Buffer): Promise<SpreadsheetRow[]> {
  const tempPath = path.join(os.tmpdir(), `gogas_upload_${crypto.randomUUID()}.xlsx`);
  fs.writeFileSync(tempPath, buffer);
  try {
    return await readSpreadsheetRows(tempPath);
  } finally {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // ignore temp cleanup warning
    }
  }
}

export async function previewSalesWorkbookBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<SalesWorkbookPreview> {
  const rawRows = await parseWorkbookBuffer(buffer);
  const { saleDate, rows, warnings, outlierStations } = validateSpreadsheetSalesRows(rawRows);

  let existingDbCount = 0;
  let existingDbVolume = 0;
  try {
    const dbCheck = await query<{ count: number; sum_qty: number }>(
      'SELECT COUNT(*)::int as count, COALESCE(SUM(sale_qty), 0)::float as sum_qty FROM sale_tracker WHERE sale_date = $1',
      [saleDate],
    );
    existingDbCount = dbCheck[0]?.count || 0;
    existingDbVolume = dbCheck[0]?.sum_qty || 0;
    if (existingDbCount > 0) {
      warnings.unshift(
        `Date ${saleDate} already has ${existingDbCount} rows (${Math.round(existingDbVolume).toLocaleString('en-IN')} L) in PostgreSQL. Enable "Replace existing rows for ${saleDate}" to overwrite.`,
      );
    }
  } catch (err: any) {
    warnings.push(`Could not query existing PostgreSQL rows: ${err.message}`);
  }

  const activeStationCount = rows.filter((r) => r.sale_qty > 0).length;
  const zeroSaleCount = rows.length - activeStationCount;
  const totalSaleQty = Number(rows.reduce((s, r) => s + r.sale_qty, 0).toFixed(2));
  const totalCollection = Number(rows.reduce((s, r) => s + (r.net_total_collection || r.collection), 0).toFixed(2));
  const totalPaytm = Number(rows.reduce((s, r) => s + r.paytm, 0).toFixed(2));

  const sampleRows = [...rows]
    .sort((a, b) => b.sale_qty - a.sale_qty)
    .slice(0, 5)
    .map((r) => ({
      erp_code: r.erp_code,
      alds_name: r.alds_name,
      state: r.state,
      sale_qty: r.sale_qty,
      collection: r.net_total_collection || r.collection,
    }));

  return {
    valid: true,
    fileName,
    saleDate,
    stationCount: rows.length,
    activeStationCount,
    zeroSaleCount,
    totalSaleQty,
    totalCollection,
    totalPaytm,
    outlierStations,
    existingDbCount,
    existingDbVolume,
    loaderConfigured: isLoaderConfigured(),
    warnings,
    sampleRows,
  };
}

export async function ingestSalesWorkbookBuffer(
  buffer: Buffer,
  fileName: string,
  replaceExisting = false,
): Promise<{
  success: boolean;
  fileName: string;
  saleDate: string;
  insertedRows: number;
  replacedRows: number;
  totalSaleQty: number;
  totalCollection: number;
}> {
  if (!isLoaderConfigured()) {
    throw new Error('Database loader credentials (BOT_LOADER_PASSWORD) are not configured in .env.');
  }

  const rawRows = await parseWorkbookBuffer(buffer);
  const { saleDate, rows } = validateSpreadsheetSalesRows(rawRows);

  const insertSql = `
    INSERT INTO sale_tracker (
      erp_code, alds_name, state, tm, coordinator, type, tank_cap,
      sale_qty, collection, new_rate, other, diff, erp_rate, ret_test_cal,
      free_sale_litres, free_sale_rupees, scheme, paytm, net_cash_collection,
      closing_dip_in_ltr, remark, net_total_collection, effective_rsp,
      collection_check, scheme_as_per_ho, free_sale_pct, sale_date
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19,
      $20, $21, $22, $23, $24, $25, $26, $27
    )
  `;

  return withLoaderTransaction(async (client) => {
    const checkRes = await client.query<{ count: number }>(
      'SELECT COUNT(*)::int as count FROM sale_tracker WHERE sale_date = $1',
      [saleDate],
    );
    const existingCount = checkRes.rows[0]?.count || 0;
    if (existingCount > 0 && !replaceExisting) {
      throw new Error(
        `Sale date ${saleDate} already exists in PostgreSQL (${existingCount} rows). Check "Replace existing rows for ${saleDate}" if you intend to overwrite.`,
      );
    }

    if (existingCount > 0 && replaceExisting) {
      await client.query('DELETE FROM sale_tracker WHERE sale_date = $1', [saleDate]);
    }

    let totalSaleQty = 0;
    let totalCollection = 0;
    for (const row of rows) {
      try {
        await client.query(insertSql, [
          row.erp_code, row.alds_name, row.state, row.tm, row.coordinator, row.type, row.tank_cap,
          row.sale_qty, row.collection, row.new_rate, row.other, row.diff, row.erp_rate, row.ret_test_cal,
          row.free_sale_litres, row.free_sale_rupees, row.scheme, row.paytm, row.net_cash_collection,
          row.closing_dip_in_ltr, row.remark, row.net_total_collection, row.effective_rsp,
          row.collection_check, row.scheme_as_per_ho, row.free_sale_pct, saleDate,
        ]);
      } catch (insertError: any) {
        const dbLocation = insertError.column
          ? `column "${insertError.column}"`
          : insertError.constraint
            ? `constraint "${insertError.constraint}"`
            : 'database constraint';
        throw new Error(`Row ${row.sourceRow} (Cost Code "${row.erp_code}"), ${dbLocation}: ${insertError.message}`);
      }
      totalSaleQty += row.sale_qty;
      totalCollection += row.net_total_collection || row.collection;
    }

    return {
      success: true,
      fileName,
      saleDate,
      insertedRows: rows.length,
      replacedRows: existingCount,
      totalSaleQty: Number(totalSaleQty.toFixed(2)),
      totalCollection: Number(totalCollection.toFixed(2)),
    };
  });
}
