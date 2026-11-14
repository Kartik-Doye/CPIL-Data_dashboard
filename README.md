# GO Gas Executive Suite

The project is a React dashboard served by an Express/TypeScript backend. Sales,
station, team, and forecast history are sourced from PostgreSQL only. The
dashboard does not fall back to spreadsheet or embedded data when PostgreSQL is
unavailable.

## Requirements

- Node.js 20.19+ (or 22.12+)
- PostgreSQL 12+ for live database reporting

## Run locally

Operational defaults, schedules, and product copy are stored in
`product-config.json`. Environment variables in `.env` override those defaults;
use `.env.example` as the list of supported overrides. Keep credentials and
other secrets in `.env`, not in the JSON file.

From the project root:

```powershell
npm install
npm run test-db
npm run dev
```

Open the URL from `APP_BASE_URL` (default: `http://localhost:3000`). The DB
test verifies the PostgreSQL connection and the required `sale_tracker` and
`state_map` tables. Configure connection settings in
`Analytical Dashboard/.env`; never commit environment files.

PostgreSQL must be available and `sale_tracker` must contain data for the
dashboard to load. If the connection or data is unavailable, the UI reports an
error instead of showing cached or spreadsheet values. Use `npm run load-sales`
to validate and load `Manual Work/sale.xlsx` into PostgreSQL.
The loader uses the separate `BOT_LOADER_USER` (default `bot_loader`) and
`BOT_LOADER_PASSWORD` settings from `Manual Work/.env`; do not use the
dashboard's read-only `DB_USER` credentials for loading.

### Forecast feedback learning

The dashboard can retune ensemble weights from saved forecast-vs-actual
outcomes. Each forecast is saved by target date and compared with actual
network sales when those sales are loaded. Model weights start adapting from
the first scored outcome and become more evidence-based as outcomes accumulate.
The AIML forecast also walk-forward benchmarks a native gradient-boosted tree
candidate against the existing ensemble. It contributes 20% only when at least
14 scored days are available, the blend improves MAPE by at least 5%, and it
beats the existing ensemble on at least 60% of scored days; otherwise it stays
benchmark-only. This is a lightweight TypeScript gradient-boosting model, not
the XGBoost library.
The AIML report also shows recent forecast error, over/underforecast direction,
the best-performing component model, and notable week-to-week demand shifts as
possible miss signals; these signals are diagnostic, not guaranteed causes.
Learning runs when the dashboard refreshes its telemetry, including its daily
background refresh. As a PostgreSQL administrator, run
`Manual Work/02_forecast_feedback.sql` in the `sale_alds` database, then
configure `BOT_LOADER_PASSWORD` (and optionally `BOT_LOADER_USER`) in
`Analytical Dashboard/.env`. The dashboard's `bot_reader` role remains
read-only. Until the migration and loader credentials are available, forecast
feedback storage is reported as unavailable and no saved-history learning is
applied.

### Editable festival calendar

Forecast festival dates and names are maintained in the project-root
`festival-calendar.json`. The forecast feature builder uses these exact dates
as a calendar input; festival dates are shown in the forecast and their
estimated ranges are widened by 50% as a planning buffer. This buffer is a
caution, not a historically calibrated festival effect, and the forecast does
not automatically raise or lower the point prediction for a festival.

Update the date and name entries in this JSON file each January 1 using the
dates applicable to the new year, then restart the dashboard server to load
the updated calendar. Dates must use `YYYY-MM-DD`; do not use recurring
month/day dates, because many festival dates move each year. Confirm regional
dates before relying on them for operational decisions. The included 2026
calendar is based on the dates supplied for this project; Dhanteras is marked
as approximate / regional.

### Daily executive email

The dashboard can send a concise live-telemetry briefing through Gmail SMTP.
The email includes sales and reporting coverage, seven-day comparison when
history is available, stock-cover bands (critical under one day, high risk
under two days, monitor under three days), zero-sale reason categories, and
historical forecast error. Forecast history is planning context, not a
commitment. Each email also attaches a filterable Excel workbook with station
sales, collections, stock cover, zero-sale reason, TM/coordinator, proposed
action, and proposed deadline. Owners and deadlines are suggestions based on
available station assignments and require operational confirmation.

The current PostgreSQL telemetry does not include daily targets, margin,
receivables, credit exposure, or cash deposited, so the briefing explicitly
identifies those metrics as unavailable rather than estimating them.
The Sales Benchmark view uses editable browser-local comparison values (with a
1,100 L-per-station default); it is not connected to an approved sales plan.
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

### WhatsApp Web messages

The WhatsApp portal can send through a linked WhatsApp Web account without a
Meta API key. Set `WHATSAPP_ENABLED=true` and
`WHATSAPP_RECIPIENT_NUMBERS` in the project-root `.env`, start the dashboard,
and open the WhatsApp portal on this computer. Scan the live QR code with
WhatsApp on your phone under **Linked devices** > **Link a device**. The app
stores the linked session in `.wwebjs_auth/` so it can reconnect after restart;
the path is anchored to the project root so launching from a different working
directory uses the same session. Keep that folder private and do not share or
commit it. Avoid **Unlink** unless you intend to pair again. The session QR and
WhatsApp controls are restricted to local access.
Automated send times are read from `WHATSAPP_CRON_EXPRESSION` in the
project-root `.env` (for example, `0 11,19 * * *`). The project-root value takes
precedence over other environment files; an empty or invalid expression
disables scheduled broadcasts and is reported in the server log.

The executive WhatsApp brief is limited to network KPIs, stock-cover bands,
zero-sale causes, priority actions, and forecast context; use the emailed
workbook or dashboard for full station-level follow-up.

Puppeteer needs Chrome or Chromium installed. If it is not found automatically,
set `WHATSAPP_CHROME_EXECUTABLE_PATH` in `.env` to the browser executable.
The app pins a locally cached WhatsApp Web version because the live page can
change its internal modules without notice. Keep `.wwebjs_cache/` on this
computer; `WHATSAPP_WEB_VERSION` can override the pinned version only when a
matching `<version>.html` file is present in that cache.
Keep the computer and dashboard server running for the 11:00 a.m. and 7:00 p.m.
scheduled sends. This uses unofficial WhatsApp Web automation, not the
WhatsApp Business Platform; it may break when WhatsApp changes and may be
subject to WhatsApp account restrictions. Use it only with recipients who
expect these messages.

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
