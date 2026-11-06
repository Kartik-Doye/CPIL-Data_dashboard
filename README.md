# GO Gas Executive Suite

The project is a React dashboard served by an Express/TypeScript backend. Sales,
station, team, and forecast history are sourced from PostgreSQL only. The
dashboard does not fall back to spreadsheet or embedded data when PostgreSQL is
unavailable.

## Requirements

- Node.js 20.19+ (or 22.12+)
- PostgreSQL 12+ for live database reporting

## Run locally

From the project root:

```powershell
npm install
npm run test-db
npm run dev
```

Open `http://localhost:5000`. The DB test verifies the PostgreSQL connection
and the required `sale_tracker` and `state_map` tables. Configure connection
settings in `Analytical Dashboard/.env`; never commit environment files.

PostgreSQL must be available and `sale_tracker` must contain data for the
dashboard to load. If the connection or data is unavailable, the UI reports an
error instead of showing cached or spreadsheet values. Use `npm run load-sales`
to validate and load `Manual Work/sale.xlsx` into PostgreSQL.

### Forecast feedback learning

The dashboard can retune ensemble weights from saved forecast-vs-actual
outcomes. As a PostgreSQL administrator, run
`Manual Work/02_forecast_feedback.sql` in the `sale_alds` database, then
configure `BOT_LOADER_PASSWORD` (and optionally `BOT_LOADER_USER`) in
`Analytical Dashboard/.env`. The dashboard's `bot_reader` role remains
read-only. Until the migration and loader credentials are available, forecast
feedback storage is reported as unavailable and no saved-history learning is
applied.

## Useful commands

```powershell
npm run lint       # TypeScript check
npm run build      # Production frontend build
npm run test-db    # PostgreSQL connection and schema check
npm run load-sales # Load Manual Work/sale.xlsx into PostgreSQL
```

See [DB_TROUBLESHOOTING.md](./DB_TROUBLESHOOTING.md) for connection help and
[Analytical Dashboard/README.md](./Analytical%20Dashboard/README.md) for
dashboard details.
