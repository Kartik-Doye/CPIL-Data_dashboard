import pg from 'pg';
import {
  DB_CONNECT_TIMEOUT,
  DB_CONNECT_TIMEOUT_CEILING_MS,
  DB_HOST,
  DB_NAME,
  DB_PASSWORD,
  DB_PORT,
  DB_STATEMENT_TIMEOUT_MS,
  DB_USER,
} from './Analytical Dashboard/src/engine/config.js';

const { Pool } = pg;

const config = {
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
};

console.log('========================================================');
console.log('   GO Gas — Local PostgreSQL Connection Diagnostic');
console.log('========================================================');
console.log('Target Configuration:');
console.log(` - Host     : ${config.host}`);
console.log(` - Port     : ${config.port}`);
console.log(` - Database : ${config.database}`);
console.log(` - User     : ${config.user}`);
console.log('--------------------------------------------------------');

if (!config.password) console.warn('⚠️ Reader password is empty; check BOT_READER_PASSWORD in your environment.');

const pool = new Pool({
  ...config,
  connectionTimeoutMillis: Math.min(DB_CONNECT_TIMEOUT * 1000, DB_CONNECT_TIMEOUT_CEILING_MS),
  statement_timeout: DB_STATEMENT_TIMEOUT_MS,
});

async function test() {
  let client: Awaited<ReturnType<typeof pool.connect>> | undefined;
  let checksPassed = true;
  try {
    client = await pool.connect();
    console.log(`✅ Connection SUCCESSFUL! Connected to PostgreSQL on ${config.host}:${config.port}.`);
    
    const res = await client.query('SELECT current_database() as db, current_user as usr, version() as ver');
    console.log(` - Connected as user : ${res.rows[0].usr}`);
    console.log(` - Active database   : ${res.rows[0].db}`);
    console.log(` - Server version    : ${res.rows[0].ver.split(' on ')[0]}`);
    console.log('--------------------------------------------------------');

    // Check sale_tracker table
    try {
      const countRes = await client.query('SELECT COUNT(*)::int as count FROM sale_tracker');
      const rowCount = countRes.rows[0].count;
      console.log(`✅ Table "sale_tracker" exists: ${rowCount.toLocaleString()} total rows.`);

      if (rowCount === 0) {
        console.warn('⚠️ WARNING: "sale_tracker" table exists but is EMPTY (0 rows).');
        console.info('👉 ACTION: Run "npm run load-sales" or double-click "run-load-sales.bat" to import data from your Excel file.');
      } else {
        const statsRes = await client.query(`
          SELECT 
            MIN(sale_date)::text as min_date,
            MAX(sale_date)::text as max_date,
            COUNT(DISTINCT sale_date)::int as days,
            COUNT(DISTINCT erp_code)::int as stations,
            ROUND(SUM(sale_qty)::numeric, 0) as total_litres
          FROM sale_tracker
        `);
        const stats = statsRes.rows[0];
        console.log(` - Date Range        : ${stats.min_date} to ${stats.max_date} (${stats.days} distinct dates)`);
        console.log(` - Distinct Stations : ${stats.stations} fuel stations`);
        console.log(` - Total Volume      : ${Number(stats.total_litres).toLocaleString()} Litres`);
      }
    } catch (err: any) {
      checksPassed = false;
      console.error('❌ Table "sale_tracker" NOT FOUND in database "' + config.database + '"!');
      console.error(`   ${err.message}`);
      console.info('👉 ACTION: Run the table creation script:');
      console.info('   psql -U postgres -d ' + config.database + ' -f "Manual Work/01_create_table.sql"');
    }

    // Check state_map table
    try {
      const stateMapRes = await client.query('SELECT COUNT(*)::int as count FROM state_map');
      console.log(`✅ Table "state_map" exists: ${stateMapRes.rows[0].count} mapping rows.`);
    } catch {
      checksPassed = false;
      console.warn('⚠️ Note: "state_map" table is missing.');
      console.info('👉 ACTION: Run "Analytical Dashboard/SQL/03_state_map.sql" in your database.');
    }

    console.log('========================================================');
    if (checksPassed) {
      console.log('🎉 PostgreSQL connection and required dashboard tables are verified.');
      console.log('   Run: "run-dashboard.bat" to start the app.');
    } else {
      console.error('❌ PostgreSQL is reachable, but required dashboard tables are missing.');
      process.exitCode = 1;
    }
    console.log('========================================================');

  } catch (err: any) {
    process.exitCode = 1;
    console.error('\n❌ Connection FAILED!');
    console.error(`Error Code    : ${err.code || 'UNKNOWN'}`);
    console.error(`Error Message : ${err.message}`);
    console.log('--------------------------------------------------------');
    
    if (err.code === 'ECONNREFUSED') {
      console.log('🔍 CAUSE: PostgreSQL is NOT running as a service on your Windows system.');
      console.log('\n💡 HOW TO FIX ON WINDOWS:');
      console.log('  1. Press [Win + R] on your keyboard, type "services.msc", and press Enter.');
      console.log('  2. In the Services list, scroll down to "postgresql-x64-XX" (e.g. postgresql-x64-16).');
      console.log('  3. Right-click the service and click "Start" (or "Restart").');
      console.log('  -- OR --');
      console.log('  Open Command Prompt as Administrator and run:');
      console.log('     net start postgresql-x64-16');
      console.log('  (Replace 16 with your installed version: 14, 15, 16, or 17).');
    } else if (err.message && err.message.includes('password authentication failed')) {
      console.log(`🔍 CAUSE: The password in "Analytical Dashboard/.env" does not match user "${config.user}".`);
      console.log('\n💡 HOW TO FIX:');
      console.log('  1. Open the file "Analytical Dashboard/.env" in your editor (Notepad or VS Code).');
      console.log('  2. If your PostgreSQL user is "postgres", update:');
      console.log('        DB_USER=postgres');
      console.log('        BOT_READER_PASSWORD=your_actual_postgres_password');
      console.log('  3. Save the file and re-run this test.');
    } else if (err.message && err.message.includes('database') && err.message.includes('does not exist')) {
      console.log(`🔍 CAUSE: The database "${config.database}" does not exist in your PostgreSQL server.`);
      console.log('\n💡 HOW TO FIX:');
      console.log('  Open pgAdmin or psql command line and run:');
      console.log(`     CREATE DATABASE ${config.database};`);
    } else {
      console.log('💡 TIP: Check your settings in "Analytical Dashboard/.env" and verify PostgreSQL is installed.');
    }
    console.log('========================================================');
  } finally {
    client?.release();
    await pool.end();
  }
}

test().catch((err) => {
  process.exitCode = 1;
  console.error(`❌ Database diagnostic failed: ${err.message}`);
});
