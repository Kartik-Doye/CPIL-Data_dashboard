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

### Daily executive email

The dashboard can send a concise live-telemetry briefing through Gmail SMTP.
Add these settings to the project-root `.env` file (see `.env.example` for the
names), using your Gmail sender, recipient address(es), and a Google
App Password:

```env
REPORT_SENDER_EMAIL=
REPORT_RECIPIENT_EMAILS=
REPORT_SENDER_APP_PASSWORD=
```

Do not share the App Password in chat or commit it. Create it from the Google
Account security settings after enabling 2-Step Verification. Gmail account
eligibility, sending limits, and delivery are controlled by Google.

Start the dashboard and PostgreSQL as usual, then run `npm run email:send` to
send a real test email immediately to the configured recipient(s). The
dashboard’s **Send Test Email** button sends the same live briefing. Email
sending is limited to requests from the dashboard computer, uses the fixed
environment-configured recipients, and reports configuration/SMTP errors
without treating them as success.

To schedule delivery at 9:30 a.m. local Windows time:

1. Open Task Scheduler and create a daily task for 9:30 a.m.
2. Set **Program/script** to `C:\Windows\System32\cmd.exe`.
3. Set **Add arguments** to `/c ""<project-root>\send_morning_email.bat""`.
4. Set **Start in** to the project root (the folder containing `package.json`).
5. Keep the computer awake, PostgreSQL reachable, and the dashboard server
   running at the scheduled time. Run the batch file once manually first to
   verify the configuration and delivery.

Task Scheduler uses the computer’s local time. If Windows is asleep or the
dashboard/database is unavailable, the send can fail; configure Task Scheduler
to wake the computer if supported by its power settings.

## Useful commands

```powershell
npm run lint       # TypeScript check
npm run build      # Production frontend build
npm run test-db    # PostgreSQL connection and schema check
npm run load-sales # Load Manual Work/sale.xlsx into PostgreSQL
npm run email:send # Send an executive email now
```

See [DB_TROUBLESHOOTING.md](./DB_TROUBLESHOOTING.md) for connection help and
[Analytical Dashboard/README.md](./Analytical%20Dashboard/README.md) for
dashboard details.
