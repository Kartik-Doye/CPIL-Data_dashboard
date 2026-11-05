# Manual Work — Sales Data Loader (Phase 2)

This tool reads the daily `sale.xlsx` file and loads it into the PostgreSQL
table `sale_tracker` in database `sale_alds`. It replaces the old manual work
of adding a date column, saving as CSV, and importing via pgAdmin.

---

## What it does

1. Reads `sale.xlsx` (28 columns, one row per station).
2. Takes the sale date from the **Date** column (the whole file must be one day).
3. Checks if that date is already in the database:
   - **Already loaded** → prints `ALREADY IN DATABASE` and skips (no duplicates).
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
6. After a successful load, copies the file to `archive/dd-mm-yyyy.xlsx`.
7. Writes a timestamped log to `logs/`.

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
DB_NAME=sale_alds
DB_USER=bot_loader
SALE_FILE=sale.xlsx
```

The `BOT_LOADER_PASSWORD` must match the password you set for `bot_loader`
in the SQL file. **Never commit `.env`** — it is in `.gitignore`.

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

The script prints one of these messages:

| Message | Meaning | What to do |
|---|---|---|
| `LOADED sale.xlsx: 315 rows, date 2026-10-15` | Success — the day is in the database. | Nothing. Done. |
| `ALREADY IN DATABASE sale.xlsx` | This date was loaded before. | Nothing, unless you see a WARNING. |
| `WARNING: file has N rows ... but database has M rows` | The date exists but the file looks different — you may have pasted new data without changing the date. | Check the Date column. If it's a new day, fix the date and rerun. If you need to replace the old data, see "Replace a day" below. |
| `FAILED sale.xlsx: ...` | The file has a problem (bad column, non-numeric value, blank Cost Code, etc.). The reason is shown. Nothing was saved. | Fix the problem in Excel, save, and rerun. |

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
| `.gitignore` | Tells git to ignore `.env`, logs, archive, and `sale.xlsx`. |
| `sale.xlsx` | Today's data file (overwritten each day). |
| `archive/` | After each successful load, a dated copy is saved here. |
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
