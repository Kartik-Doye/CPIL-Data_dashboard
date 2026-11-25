/**
 * PM2 Production Service Configuration for GO Gas Executive Suite.
 *
 * Usage:
 *   1. npm run build
 *   2. npx pm2 start ecosystem.config.cjs
 *   3. npx pm2 save
 *
 * Keeps the Express + PostgreSQL + WhatsApp Web & Email Cron (02:15 PM & 06:30 PM Daily)
 * server running 24/7 in the background with automatic crash recovery and log timestamps.
 */
module.exports = {
  apps: [
    {
      name: 'go-gas-executive-suite',
      script: './node_modules/tsx/dist/cli.mjs',
      args: '"Analytical Dashboard/server.ts"',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production',
        PORT: 5050,
      },
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
