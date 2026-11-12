import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import ExcelJS from 'exceljs';
import pg from 'pg';
import productConfig from '../product-config.json';
import { parseStationContactMappings } from '../Analytical Dashboard/src/engine/stationContactMapping.js';

const { Pool } = pg;

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const entries = dotenv.parse(fs.readFileSync(filePath));
  for (const [key, value] of Object.entries(entries)) {
    if (!process.env[key]?.trim() && value.trim()) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), 'Manual Work', '.env'));
loadEnvFile(path.resolve(process.cwd(), '.env'));

const sourcePath = path.resolve(process.cwd(), 'Contact.xlsx');
const applyChanges = process.argv.includes('--apply');

async function main() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Contact.xlsx was not found in the repository root.');
  }

  const workbook = await new ExcelJS.Workbook().xlsx.readFile(sourcePath);
  const { mappings, skippedMissingTm } = parseStationContactMappings(workbook);
  console.log(`[STATION MAPPING] Validated ${mappings.length} ERP-keyed mappings; skipped ${skippedMissingTm} rows with no TM.`);
  if (!applyChanges) {
    console.log('[STATION MAPPING] Dry run only. Apply the admin SQL migration, then run with --apply to import mappings.');
    return;
  }

  const user = process.env.BOT_LOADER_USER || productConfig.database.loaderUser;
  const password = process.env.BOT_LOADER_PASSWORD?.trim();
  if (!password) {
    throw new Error('BOT_LOADER_PASSWORD is required to apply the station mapping import.');
  }

  const pool = new Pool({
    host: process.env.DB_HOST || productConfig.database.host,
    port: Number.parseInt(process.env.DB_PORT || String(productConfig.database.port), 10),
    database: process.env.DB_NAME || productConfig.database.name,
    user,
    password,
    connectionTimeoutMillis: 10000,
  });
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const table = await client.query<{ mapping_table: string | null }>(
      "SELECT to_regclass('public.station_contact_mapping')::text AS mapping_table",
    );
    if (!table.rows[0]?.mapping_table) {
      throw new Error('station_contact_mapping is not installed. Run Manual Work/03_station_contact_mapping.sql as a database administrator first.');
    }

    await client.query('BEGIN');
    transactionStarted = true;
    let updated = 0;
    for (const mapping of mappings) {
      const result = await client.query(
        `INSERT INTO public.station_contact_mapping
          (erp_code, alds_name, state, region, tm, source_file, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (erp_code) DO UPDATE SET
           alds_name = EXCLUDED.alds_name,
           state = EXCLUDED.state,
           region = EXCLUDED.region,
           tm = EXCLUDED.tm,
           source_file = EXCLUDED.source_file,
           updated_at = NOW()
         WHERE (station_contact_mapping.alds_name, station_contact_mapping.state,
                station_contact_mapping.region, station_contact_mapping.tm,
                station_contact_mapping.source_file)
           IS DISTINCT FROM
               (EXCLUDED.alds_name, EXCLUDED.state, EXCLUDED.region,
                EXCLUDED.tm, EXCLUDED.source_file)`,
        [mapping.erpCode, mapping.stationName, mapping.state, mapping.region, mapping.tm, 'Contact.xlsx'],
      );
      if (result.rowCount) updated++;
    }
    await client.query('COMMIT');
    transactionStarted = false;
    console.log(`[STATION MAPPING] Import complete. ${updated} mapping row(s) inserted or updated; sale_tracker history was not modified.`);
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[STATION MAPPING] Import failed: ${message}`);
  process.exitCode = 1;
});
