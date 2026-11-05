# GO Gas Database Troubleshooting Guide

If the dashboard shows **Embedded PostgreSQL** or **Excel Fallback** as its source, it is not currently reading live data from external PostgreSQL. The DB Inspector also shows the active source and connection result.

## The Error: `connect ECONNREFUSED 127.0.0.1:5432`
This error means **PostgreSQL is not running** on your computer.

### How to Fix (Start PostgreSQL):

#### Windows:
1. Open the **Start Menu**, search for `Services`, and press Enter.
2. Find `postgresql-x64-XX` in the list (where XX is your version).
3. Right-click it and select **Start**.
4. Alternatively, open **Command Prompt as Admin** and run:
   ```cmd
   net start postgresql-x64-16
   ```

#### macOS (using Homebrew):
1. Open Terminal and run:
   ```bash
   brew services start postgresql@16
   ```

#### Linux (Ubuntu/Debian):
1. Open Terminal and run:
   ```bash
   sudo systemctl start postgresql
   ```

---

## Still not working?
Once PostgreSQL is started, verify the following:

1. **Verify Credentials:** Confirm `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `BOT_READER_PASSWORD` in `Analytical Dashboard/.env` match your PostgreSQL configuration. Do not deploy with `CHANGE_ME_READER`; have a PostgreSQL administrator set a strong password with `ALTER ROLE bot_reader PASSWORD '<new-secret>';`, then update `BOT_READER_PASSWORD` in the local environment file or secret manager. Do not send the password in chat or commit it.
2. **Verify Database Exists:** Run `npm run test-db`. If it says "Database sale_alds does not exist", run:
   ```sql
   CREATE DATABASE sale_alds;
   ```
3. **Verify Tables Exist:** If the diagnostic reports a missing table, run:
   `Manual Work/01_create_table.sql`
   and `Analytical Dashboard/SQL/03_state_map.sql`.
