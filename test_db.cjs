const net = require('net');
const fs = require('fs');
const path = require('path');
const productConfig = require('./product-config.json');

// 1. Parse .env manually (no dependencies required)
function loadEnv() {
  const envPath = path.resolve(process.cwd(), 'Analytical Dashboard/.env');
  const env = {
    DB_HOST: productConfig.database.host,
    DB_PORT: productConfig.database.port,
    DB_NAME: productConfig.database.name,
    DB_USER: productConfig.database.readerUser,
    DB_PASSWORD: '',
  };

  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (key === 'DB_HOST') env.DB_HOST = val;
        if (key === 'DB_PORT') env.DB_PORT = parseInt(val, 10) || productConfig.database.port;
        if (key === 'DB_NAME') env.DB_NAME = val;
        if (key === 'DB_USER') env.DB_USER = val;
        if (key === 'BOT_READER_PASSWORD' || key === 'DB_PASSWORD') env.DB_PASSWORD = val;
      }
    }
  }
  return env;
}

const config = loadEnv();

console.log('========================================================');
console.log('   GO Gas — Local PostgreSQL Connection Diagnostic');
console.log('========================================================');
console.log('Config from Analytical Dashboard/.env:');
console.log(` - Host     : ${config.DB_HOST}`);
console.log(` - Port     : ${config.DB_PORT}`);
console.log(` - Database : ${config.DB_NAME}`);
console.log(` - User     : ${config.DB_USER}`);
console.log(` - Password : ${config.DB_PASSWORD ? (config.DB_PASSWORD === 'CHANGE_ME_READER' ? 'CHANGE_ME_READER (Default placeholder!)' : '********') : '(EMPTY!)'}`);
console.log('--------------------------------------------------------');

// Step 1: Raw TCP Socket Check (detects if PostgreSQL is even running)
function probePort(host, port, timeout = productConfig.database.connectTimeoutCeilingMs) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let isConnected = false;

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      isConnected = true;
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`Timeout: No response from ${host}:${port} after ${timeout}ms`));
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    socket.connect(port, host);
  });
}

async function runDiagnostics() {
  console.log(`[1/3] Probing TCP connection to ${config.DB_HOST}:${config.DB_PORT}...`);
  try {
    await probePort(config.DB_HOST, config.DB_PORT);
    console.log(`✅ Port ${config.DB_PORT} is OPEN. PostgreSQL service is actively running!`);
  } catch (err) {
    console.error(`\n❌ PostgreSQL Port ${config.DB_PORT} is CLOSED / NOT LISTENING!`);
    console.error(`   Error: ${err.message}`);
    console.log('\n========================================================');
    console.log('🔍 CAUSE: PostgreSQL is NOT running on your Windows system.');
    console.log('--------------------------------------------------------');
    console.log('💡 HOW TO FIX ON WINDOWS (Takes 10 seconds):');
    console.log('  1. Press [Win + R] on your keyboard.');
    console.log('  2. Type "services.msc" and press Enter.');
    console.log('  3. Scroll down to find "postgresql-x64-XX" (e.g. postgresql-x64-16).');
    console.log('  4. Right-click the service and click "Start" (or "Restart").');
    console.log('');
    console.log('  -- OR Open Command Prompt as Administrator and run:');
    console.log('     net start postgresql-x64-16');
    console.log('     (replace 16 with your installed version: 14, 15, 16, or 17)');
    console.log('========================================================\n');
    return;
  }

  // Step 2: Check if pg module is installed
  console.log('\n[2/3] Checking Node.js PostgreSQL driver (pg)...');
  let pg;
  try {
    pg = require('pg');
    console.log('✅ PostgreSQL driver (pg) is loaded successfully.');
  } catch (err) {
    console.error('❌ Driver "pg" is not installed in node_modules.');
    console.log('👉 ACTION: Run "npm install" in your terminal to install dependencies.');
    return;
  }

  // Step 3: Test Database Credentials & Query Tables
  console.log(`\n[3/3] Authenticating as user "${config.DB_USER}" to database "${config.DB_NAME}"...`);
  
  if (config.DB_PASSWORD === 'CHANGE_ME_READER') {
    console.warn('⚠️ NOTICE: Analytical Dashboard/.env is still using the placeholder "CHANGE_ME_READER".');
    console.info('   If authentication fails below, please update BOT_READER_PASSWORD in Analytical Dashboard/.env.\n');
  }

  const { Pool } = pg;
  const pool = new Pool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    connectionTimeoutMillis: 4000,
  });

  try {
    const client = await pool.connect();
    console.log('✅ Connection and authentication SUCCESSFUL!');

    const res = await client.query('SELECT current_database() as db, current_user as usr, version() as ver');
    console.log(` - Connected as user : ${res.rows[0].usr}`);
    console.log(` - Active database   : ${res.rows[0].db}`);
    console.log(` - PostgreSQL version: ${res.rows[0].ver.split(' on ')[0]}`);
    console.log('--------------------------------------------------------');

    // Query sale_tracker
    try {
      const countRes = await client.query('SELECT COUNT(*)::int as count FROM sale_tracker');
      const rowCount = countRes.rows[0].count;
      console.log(`✅ Table "sale_tracker" exists: ${rowCount.toLocaleString()} total rows.`);

      if (rowCount === 0) {
        console.warn('⚠️ Table "sale_tracker" exists but has 0 records.');
        console.info('👉 ACTION: Run "npm run load-sales" (or run-load-sales.bat) to import your Excel data.');
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
        console.log(` - 3-Month Date Range : ${stats.min_date} to ${stats.max_date} (${stats.days} distinct dates)`);
        console.log(` - Fuel Stations     : ${stats.stations} distinct stations`);
        console.log(` - Total Volume Sold : ${Number(stats.total_litres).toLocaleString()} Litres`);
      }
    } catch (err) {
      console.error(`❌ Table "sale_tracker" does NOT exist in database "${config.DB_NAME}"!`);
      console.info('👉 ACTION: Run the table creation script:');
      console.info('   psql -U postgres -d ' + config.DB_NAME + ' -f "Manual Work/01_create_table.sql"');
    }

    // Query state_map
    try {
      const mapRes = await client.query('SELECT COUNT(*)::int as count FROM state_map');
      console.log(`✅ Table "state_map" exists: ${mapRes.rows[0].count} state mappings.`);
    } catch {
      console.warn('⚠️ Note: "state_map" table is missing (optional). Run "Analytical Dashboard/SQL/03_state_map.sql" if needed.');
    }

    client.release();
    await pool.end();

    console.log('========================================================');
    console.log('🎉 SUCCESS! Your local PostgreSQL database is 100% READY!');
    console.log('   You can now start the dashboard by double-clicking:');
    console.log('   --> run-dashboard.bat');
    console.log('========================================================');

  } catch (err) {
    await pool.end();
    console.error('\n❌ Database Authentication / Query FAILED!');
    console.error(`Error Code    : ${err.code || 'UNKNOWN'}`);
    console.error(`Error Message : ${err.message}`);
    console.log('--------------------------------------------------------');

    if (err.message && err.message.includes('password authentication failed')) {
      console.log(`🔍 CAUSE: Password authentication failed for user "${config.DB_USER}".`);
      console.log('\n💡 HOW TO FIX:');
      console.log('  1. Open "Analytical Dashboard/.env" in your editor.');
      console.log('  2. If you installed PostgreSQL as "postgres", set:');
      console.log('        DB_USER=postgres');
      console.log('        BOT_READER_PASSWORD=your_actual_postgres_password');
      console.log('  3. Save the file and re-run this tester.');
    } else if (err.message && err.message.includes('database') && err.message.includes('does not exist')) {
      console.log(`🔍 CAUSE: Database "${config.DB_NAME}" does not exist.`);
      console.log('\n💡 HOW TO FIX:');
      console.log(`  Open pgAdmin or psql and run: CREATE DATABASE ${config.DB_NAME};`);
    } else {
      console.log('💡 TIP: Check your settings in "Analytical Dashboard/.env".');
    }
    console.log('========================================================\n');
  }
}

runDiagnostics();
