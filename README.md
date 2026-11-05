# GO Gas Executive Suite

The project is a React dashboard served by an Express/TypeScript backend. It
reports sales, station, team, and forecast analytics from PostgreSQL, with
Excel/embedded fallbacks for local development.

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

Open `http://localhost:3000`. The DB test verifies the PostgreSQL connection
and the required `sale_tracker` and `state_map` tables. Configure connection
settings in `Analytical Dashboard/.env`; never commit environment files.

If PostgreSQL is unavailable, the dashboard can use its embedded/Excel
fallback. Check the DB Inspector or run `npm run test-db` to distinguish a
live PostgreSQL connection from fallback mode.

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
