# GO Gas Analytical Dashboard

The dashboard frontend is built with React, TypeScript, and Vite. An Express
server provides the API and connects to PostgreSQL using `pg`. When external
PostgreSQL is required. The dashboard does not use embedded PGlite or Excel
fallback data; when PostgreSQL is unavailable or `sale_tracker` has no usable
rows, API requests return an error rather than serving other data.

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

To load workbook data, use `npm run load-sales` from the project root. This
validates the workbook and writes it to PostgreSQL; uploading a workbook through
the dashboard is disabled because it would not persist data to the database.

For an explanation of the visible dashboard, navigation, filters, and report
catalog, see [UI_GUIDE.md](UI_GUIDE.md).

## Database schema

Create `sale_tracker` with `Manual Work/01_create_table.sql`, then apply the
dashboard SQL files in `SQL/` to create the mappings, views, and settings
tables. The `bot_reader` role is intended for dashboard queries.

For connection diagnostics and common fixes, see the project-root
[DB_TROUBLESHOOTING.md](../DB_TROUBLESHOOTING.md).
