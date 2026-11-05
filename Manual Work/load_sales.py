#!/usr/bin/env python3
"""
Manual Work — Sales Data Loader
Reads daily sale.xlsx and loads it into PostgreSQL table sale_tracker in sale_alds.
"""

import sys
import os
import argparse
import datetime
import shutil
import pandas as pd
import psycopg2
from dotenv import load_dotenv

# Load .env
_this_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_this_dir, ".env"))
load_dotenv()

DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = int(os.environ.get("DB_PORT", "5432"))
DB_NAME = os.environ.get("DB_NAME", "sale_alds")
DB_USER = os.environ.get("DB_USER", "bot_loader")
DB_PASSWORD = os.environ.get("BOT_LOADER_PASSWORD", "")
DEFAULT_FILE = os.environ.get("SALE_FILE", "sale.xlsx")

def log(msg):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] {msg}"
    print(formatted)
    logs_dir = os.path.join(_this_dir, "logs")
    os.makedirs(logs_dir, exist_ok=True)
    today_str = datetime.datetime.now().strftime("%Y%m%d")
    log_file = os.path.join(logs_dir, f"load_{today_str}.log")
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(formatted + "\n")

def process_file(file_path, dry_run=False):
    log(f"Processing: {os.path.basename(file_path)}")
    if not os.path.exists(file_path):
        log(f"[FAILED] File not found: {file_path}")
        return False

    if not DB_PASSWORD:
        log("[FAILED] BOT_LOADER_PASSWORD is not set in Manual Work/.env")
        return False

    try:
        df = pd.read_excel(file_path)
    except Exception as e:
        log(f"[FAILED] Could not read Excel file: {e}")
        return False

    if df.empty:
        log("[FAILED] Excel file is empty.")
        return False

    # Standardize column headers
    df.columns = [str(c).strip() for c in df.columns]
    
    # Identify Cost Code
    cost_code_col = None
    for col in df.columns:
        if col.lower().replace(" ", "") in ["costcode", "erpcode", "code"]:
            cost_code_col = col
            break
            
    if not cost_code_col:
        log("[FAILED] Could not locate 'Cost Code' column in Excel header.")
        return False

    df = df[df[cost_code_col].notna() & (df[cost_code_col].astype(str).str.strip() != "")]
    if df.empty:
        log("[FAILED] No valid rows found with non-empty Cost Code.")
        return False

    # Extract date
    date_col = None
    for col in df.columns:
        if col.lower().strip() == "date":
            date_col = col
            break

    if not date_col or df[date_col].isna().all():
        sale_date = datetime.date.today()
    else:
        sample_date = df[date_col].dropna().iloc[0]
        if isinstance(sample_date, datetime.date):
            sale_date = sample_date
        else:
            sale_date = pd.to_datetime(sample_date).date()

    log(f"Detected Sale Date: {sale_date} ({len(df)} stations)")

    # Connect to Postgres
    try:
        conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
            user=DB_USER, password=DB_PASSWORD, connect_timeout=10
        )
        cur = conn.cursor()

        # Check existing
        cur.execute("SELECT COUNT(*), SUM(sale_qty) FROM sale_tracker WHERE sale_date = %s", (sale_date,))
        row = cur.fetchone()
        db_count, db_qty = row[0], row[1] or 0.0

        if db_count > 0:
            log(f"[ALREADY IN DATABASE] Date {sale_date} is already loaded ({db_count} rows, {round(db_qty)} L).")
            cur.close()
            conn.close()
            return True

        if dry_run:
            log(f"[DRY RUN SUCCESS] File validated cleanly. {len(df)} rows ready for date {sale_date}.")
            cur.close()
            conn.close()
            return True

        # Insert
        insert_sql = """
            INSERT INTO sale_tracker (
                erp_code, alds_name, state, tm, coordinator, type, tank_cap,
                sale_qty, collection, new_rate, other, diff, erp_rate, ret_test_cal,
                free_sale_litres, free_sale_rupees, scheme, paytm, net_cash_collection,
                closing_dip_in_ltr, remark, sale_date
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s
            )
        """

        total_qty = 0
        for _, r in df.iterrows():
            code = str(r[cost_code_col]).strip()
            name = str(r.get("ALDS NAME", r.get("alds_name", ""))).strip()
            st = str(r.get("STATE", r.get("State", ""))).strip()
            tm = str(r.get("TM", r.get("tm", ""))).strip()
            coord = str(r.get("Coordinator", r.get("COORDINATOR", ""))).strip()
            tp = str(r.get("Type", r.get("TYPE", "LOCO"))).strip()
            cap = str(r.get("TANK CAP", r.get("Tank Cap", ""))).strip()

            sqty = float(r.get("SALE QTY", r.get("Sale Qty", 0)) or 0)
            coll = float(r.get("COLLECTION", r.get("Collection", 0)) or 0)
            nrate = float(r.get("NEW RATE", r.get("New Rate", 0)) or 0)
            other = float(r.get("OTHER", 0) or 0)
            diff = float(r.get("DIFF", 0) or 0)
            erate = float(r.get("ERP RATE", 0) or 0)
            rtest = float(r.get("RET TEST/CAL", 0) or 0)
            flit = float(r.get("FREE SALE LITRES", r.get("Free Sale Litres", 0)) or 0)
            frup = float(r.get("FREE SALE RUPEES", r.get("Free Sale Rupees", 0)) or 0)
            scheme_val = r.get("SCHEME", 0)
            scheme = None if str(scheme_val).strip() == "NA" else float(scheme_val or 0)
            paytm = float(r.get("PAYTM", 0) or 0)
            ncash = float(r.get("NET CASH COLLECTION", 0) or 0)
            cdip = float(r.get("CLOSING DIP IN LTR", r.get("CLOSING DIP", 0)) or 0)
            rem = str(r.get("REMARK", r.get("Remark", ""))).strip()

            total_qty += sqty
            cur.execute(insert_sql, (
                code, name, st, tm, coord, tp, cap,
                sqty, coll, nrate, other, diff, erate, rtest,
                flit, frup, scheme, paytm, ncash, cdip, rem, sale_date
            ))

        conn.commit()
        log(f"[SUCCESS] LOADED {os.path.basename(file_path)}: {len(df)} stations, date {sale_date}, total volume: {round(total_qty)} L.")

        # Archive
        archive_dir = os.path.join(_this_dir, "archive")
        os.makedirs(archive_dir, exist_ok=True)
        archive_path = os.path.join(archive_dir, f"{sale_date}_{os.path.basename(file_path)}")
        shutil.copyfile(file_path, archive_path)
        log(f"[ARCHIVED] Saved to {archive_path}")

        cur.close()
        conn.close()
        return True
    except Exception as e:
        log(f"[FAILED] Database execution error: {e}")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manual Work - Sales Data Loader")
    parser.add_argument("--file", default=os.path.join(_this_dir, DEFAULT_FILE), help="Excel file to load")
    parser.add_argument("--dry-run", action="store_true", help="Validate without inserting into DB")
    args = parser.parse_args()

    process_file(args.file, dry_run=args.dry_run)
