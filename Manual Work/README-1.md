# Manual Work — Sales Data Loader (Phase 2)

This tool reads the daily `sale.xlsx` file and loads it into the PostgreSQL
table `sale_tracker` in database `sale_alds`. It replaces the old manual work
of adding a date column, saving as CSV, and importing via pgAdmin.

---

## What it does

1. Reads `sale.xlsx` (28 columns, one row per station).
2. Takes the sale date from the **Date** column (the whole file must be one day).
3. Checks if that date is already in the database:
   - **Already loaded** → prints `[SKIPPED]` and skips (no duplicates).
   - If the row count or `SUM(SALE QTY)` differs from the database, prints a
     **WARNING** (new data may have been pasted without changing the date).
4. Validates the file:
   - Header `Cost Code` must be found (case/spaces ignored).
   - All 28 columns must be present.
   - Number columns must hold numbers only.
   - `NA` is allowed **only** in the `SCHEME` column (stored as empty/NULL).
   - A blank or repeated Cost Code stops the file.
5. Inserts all rows for that date in **one transaction** — either the whole
   day loads, or nothing does.
6. Writes a timestamped log to `logs/`.

The loader does not create an archive copy. The source workbook remains where
you saved it; save a separate backup yourself only if you need one.

The database user `bot_loader` can only **SELECT** and **INSERT**. It cannot
UPDATE or DELETE, so the script can never erase history.

---

## Prerequisites (one-time setup)

### 1. Python 3.11+

Check if Python is installed:

```
python --version
```

If you get the Windows Store page or "not recognized", install Python 3.11:
- Download from https://www.python.org/downloads/
- Run the installer.
- **Important:** tick **"Add Python to PATH"** before clicking Install.
- After installing, close and reopen your terminal, then check again.

### 2. Python libraries

Open a terminal **in the `Manual work` folder** and run:

```
pip install -r requirements.txt
```

This installs `pandas`, `openpyxl`, `xlrd`, and `psycopg2-binary`.

### 3. PostgreSQL

PostgreSQL must be installed and running. This project was built and tested
on **PostgreSQL 18**.

### 4. Database + table + users

If the database does not exist yet, create it (run as the admin user `postgres`):

```sql
CREATE DATABASE sale_alds;
```

Then connect to `sale_alds` and run the SQL file:

```
psql -U postgres -h localhost -d sale_alds -f 01_create_table.sql
```

Or in pgAdmin: select the `sale_alds` database → open Query Tool →
File → Open → `01_create_table.sql` → press F5.

This creates:
- Table `sale_tracker` (auto `id` + 28 columns)
- `UNIQUE (sale_date, erp_code)` index (prevents duplicate loads)
- Role `bot_loader` (SELECT + INSERT only)
- Role `bot_reader` (SELECT only, 15-second timeout — for the chatbot)

**Before running the SQL**, change the placeholder passwords:
- `CHANGE_ME_LOADER` → your loader password
- `CHANGE_ME_READER` → your reader password

### 5. The `.env` file

Create a file named `.env` in the `Manual work` folder (next to `load_sales.py`).
Use `.env.example` as a template:

```
BOT_LOADER_PASSWORD=your_loader_password
BOT_LOADER_USER=bot_loader
DB_NAME=sale_alds
SALE_FILE=sale.xlsx
```

The `BOT_LOADER_USER` and `BOT_LOADER_PASSWORD` must match the loader role
created in the SQL file. The loader uses its own credentials, separate from the
dashboard's read-only `DB_USER` and `BOT_READER_PASSWORD`. **Never commit `.env`**
— it is in `.gitignore`.

### Import current station and TM assignments

`Contact.xlsx` contains a `contact` sheet with ERP Code, Station Name, State,
Region, and TM columns. To keep historical sales records unchanged, these
current assignments are stored separately in `station_contact_mapping`.

1. Ask a PostgreSQL administrator to run `03_station_contact_mapping.sql` in
   the `sale_alds` database. The script grants the loader access to that mapping
   table and the dashboard reader access to it.
2. From the repository root, validate the workbook with a dry run:

   ```powershell
   npm run load-station-mapping
   ```

3. After the dry run reports the expected mapping count, apply it using the
   loader credentials configured in `.env`:

   ```powershell
   npm run load-station-mapping -- --apply
   ```

The loader ignores rows without a TM, rejects conflicting ERP-code mappings,
and only changes `station_contact_mapping`. The dashboard uses that table to
show the mapped station name and TM when it is installed. Restart the dashboard
after importing the mapping so cached telemetry is reloaded.

---

## Daily use

Every day, Aru does this:

### Step 1 — Save today's data

Open today's sales file, save it as `sale.xlsx` in the `Manual work` folder
(overwrite the old one).

### Step 2 — Run the loader

Open a terminal **in the `Manual work` folder** and run:

```
python load_sales.py
```

### Step 3 — Read the report

The terminal shows a clear result. Row numbers in error messages are Excel row
numbers, including the header row as row 1:

| Message | Meaning | What to do |
|---|---|---|
| `[LOADED] sale.xlsx: 316 stations, date 2026-11-01, total volume: ... L` | Success — the day was inserted into the database. | Nothing. Done. |
| `[SKIPPED] Date ... is already in the database` | That date already exists and was not inserted again. | Check the workbook's Date column if this is unexpected. |
| `[VALIDATED] ... no database changes made` | The dry run passed validation. | Run without `--dry-run` to insert. |
| `[FAILED] Row 18, column "SALE QTY": expected a number, got "abc"` | The indicated Excel row and column contain invalid data. Header errors say `Header row`. | Fix that cell in Excel, save, and rerun. No partial day is committed. |
| `[FAILED] Row 18 (Cost Code "..."), column/constraint ...` | PostgreSQL rejected that station row. | Inspect the reported field or constraint and correct the source data. The load transaction is rolled back. |
| `[FAILED] Database error: ...` | The database could not be reached or rejected the operation without a specific row. | Check PostgreSQL status, credentials, schema, and permissions. |

The same output is saved to `logs/load_YYYYMMDD_HHMMSS.log`.

### Step 4 (optional) — Check with a query

In pgAdmin (connected to `sale_alds`), run:

```sql
SELECT sale_date, COUNT(*), ROUND(SUM(sale_qty), 2), ROUND(SUM(collection), 2)
FROM sale_tracker
GROUP BY sale_date
ORDER BY sale_date;
```

---

## Other ways to run

### Dry run (validate without inserting)

Checks the file and the database, but does **not** insert anything:

```
python load_sales.py --dry-run
```

Use this to test a file before loading it for real.

### Load a different file

```
python load_sales.py --file 16-10-2026.xlsx
```

### Load a whole folder of files

Processes every `.xlsx` / `.xls` file in the given folder (skips Excel temp files
that start with `~$`):

```
python load_sales.py --folder C:\SalesFiles
```

Each file is loaded independently. If one file fails, the others still load.

---

## Replace a day (if data was loaded wrong)

The `bot_loader` user cannot delete, so this must be done as the **admin**
(`postgres`) in pgAdmin or psql:

```sql
DELETE FROM sale_tracker WHERE sale_date = '2026-10-15';
```

Then rerun the loader:

```
python load_sales.py
```

The corrected file will load fresh.

---

## Files in this folder

| File / folder | What it is |
|---|---|
| `load_sales.py` | The loader script. |
| `01_create_table.sql` | Creates the table, indexes, and database users. Run once. |
| `requirements.txt` | Python libraries to install. |
| `.env` | Your passwords and settings (not committed to git). |
| `.env.example` | Template for `.env`. |
| `.gitignore` | Tells git to ignore `.env`, logs, and `sale.xlsx`. |
| `sale.xlsx` | Today's data file (overwritten each day). |
| `logs/` | Timestamped log files, one per run. |

---

## Database details

| Item | Value |
|---|---|
| Database | `sale_alds` |
| Table | `sale_tracker` |
| Loader user | `bot_loader` (SELECT + INSERT only) |
| Reader user | `bot_reader` (SELECT only, 15s timeout) |
| Duplicate guard | `UNIQUE (sale_date, erp_code)` |
| Host | `localhost` |
| Port | `5432` |

---

## Troubleshooting

**`ERROR: BOT_LOADER_PASSWORD is not set`**
→ The `.env` file is missing or the password line is empty. Create `.env`
  (see step 5 above). Make sure you run the script **from the `Manual work`
  folder** so it can find `.env`.

**`password authentication failed for user "bot_loader"`**
→ The password in `.env` does not match the one in the database. Either
  fix `.env`, or change the database password as admin:
  `ALTER ROLE bot_loader PASSWORD 'newpassword';`

**`FAILED sale.xlsx: header 'Cost Code' not found`**
→ The Excel file does not have a `Cost Code` column, or it is not in the
  first 15 rows. Check the file.

**`FAILED sale.xlsx: non-numeric value 'NA' in 'PAYTM'`**
→ `NA` appeared in a column other than `SCHEME`. `NA` is only allowed in
  `SCHEME`. Fix the cell in Excel.

**`FAILED sale.xlsx: the file contains more than one date`**
→ The file has rows for different dates. The daily loader loads one day at
  a time. Split the file or use `--folder` mode.

**`FAILED sale.xlsx: duplicate Cost Code for this date`**
→ Two rows in the file have the same Cost Code. One Cost Code per date is
  allowed. Fix the duplicate in Excel.
