# GO Gas Analytical Dashboard

The dashboard frontend is built with React, TypeScript, and Vite. An Express
server provides the API and connects to PostgreSQL using `pg`. When external
PostgreSQL is unavailable, the app can use its embedded PGlite database or
Excel fallback; the DB Inspector identifies which source is active.

## Setup

Run commands from the project root:

```powershell
npm install
npm run test-db
npm run dev
```

Configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and
`BOT_READER_PASSWORD` in this directory's `.env`. The reader account should
have read-only access to `sale_tracker` and `state_map`.

The `npm run test-db` command performs a read-only check of the PostgreSQL
connection and required tables. `npm run build` creates the production
frontend bundle; set `NODE_ENV=production` when starting the server to serve
that bundle.

## Database schema

Create `sale_tracker` with `Manual Work/01_create_table.sql`, then apply the
dashboard SQL files in `SQL/` to create the mappings, views, and settings
tables. The `bot_reader` role is intended for dashboard queries.

For connection diagnostics and common fixes, see the project-root
[DB_TROUBLESHOOTING.md](../DB_TROUBLESHOOTING.md).
