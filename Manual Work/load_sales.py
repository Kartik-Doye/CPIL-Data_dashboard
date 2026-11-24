#!/usr/bin/env python3
"""
Manual Work — Sales Data Loader
Reads daily sale.xlsx and loads it into PostgreSQL table sale_tracker in sale_alds.
"""

import sys
import os
import argparse
import datetime
import re
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
    log(f"[STARTED] Loading file: {os.path.basename(file_path)}")
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
        log('[FAILED] Header row, column "Cost Code": required column is missing.')
        return False

    # Extract date
    date_col = None
    for col in df.columns:
        if col.lower().strip() == "date":
            date_col = col
            break

    if not date_col:
        log('[FAILED] Header row, column "Date": required column is missing.')
        return False

    parsed_dates = pd.to_datetime(df[date_col], errors="coerce").dt.date
    if parsed_dates.isna().any():
        index = parsed_dates[parsed_dates.isna()].index[0]
        log(f'[FAILED] Row {index + 2}, column "{date_col}": invalid or missing date value "{df.loc[index, date_col]}".')
        return False

    unique_dates = set(parsed_dates.tolist())
    if len(unique_dates) != 1:
        date_rows = ", ".join(f"row {index + 2}={value}" for index, value in parsed_dates.items())
        log(f'[FAILED] Column "{date_col}": multiple sale dates detected ({date_rows}). The file must contain one date.')
        return False
    sale_date = unique_dates.pop()

    seen_codes = {}
    for index, value in df[cost_code_col].items():
        code = str(value).strip() if pd.notna(value) else ""
        if not code:
            log(f'[FAILED] Row {index + 2}, column "{cost_code_col}": value is required.')
            return False
        if code in seen_codes:
            log(f'[FAILED] Row {index + 2}, column "{cost_code_col}": duplicate Cost Code "{code}" (first seen at row {seen_codes[code]}).')
            return False
        seen_codes[code] = index + 2

    log(f"Detected Sale Date: {sale_date} ({len(df)} stations)")

    def number_value(row, index, col, aliases):
        source_col = next((name for name in aliases if name in row.index), None)
        if source_col is None or pd.isna(row[source_col]) or str(row[source_col]).strip() == "":
            return 0
        raw = row[source_col]
        try:
            return float(str(raw).replace(",", "").strip())
        except (TypeError, ValueError):
            raise ValueError(f'[FAILED] Row {index + 2}, column "{source_col}" ({col}): expected a number, got "{raw}".')

    def estimate_scheme_discount(value, sale_qty, sale_rate, row_number):
        if pd.isna(value) or str(value).strip() == "":
            return 0
        if isinstance(value, (int, float)):
            return float(value)

        text = str(value).strip()
        if text.upper() == "NA":
            return 0
        try:
            return float(text.replace(",", ""))
        except ValueError:
            pass

        percentage = re.search(r"(\d+(?:\.\d+)?)\s*%", text)
        if percentage:
            return round(sale_qty * sale_rate * float(percentage.group(1)) / 100, 2)

        currency_amount = re.search(r"(?:₹\s*|(?:RS\.?|INR)\s*)([\d,]+(?:\.\d+)?)", text, re.IGNORECASE)
        if currency_amount:
            amount = float(currency_amount.group(1).replace(",", ""))
            if re.search(r"(?:PER\s*(?:LITRE|LTR|L)|/\s*L(?:ITRE|TR)?)", text, re.IGNORECASE):
                return round(amount * sale_qty, 2)
            return amount

        raise ValueError(
            f'[FAILED] Row {row_number}, column "SCHEME" (Scheme): '
            f'could not estimate discount from "{text}".'
        )

    try:
        for index, row in df.iterrows():
            for label, aliases in [
                ("Sale Qty", ["SALE QTY", "Sale Qty"]),
                ("Collection", ["COLLECTION", "Collection"]),
                ("New Rate", ["NEW RATE", "New Rate"]),
                ("Other", ["OTHER"]),
                ("Diff", ["DIFF"]),
                ("ERP Rate", ["ERP RATE"]),
                ("Ret Test/Cal", ["RET TEST/CAL"]),
                ("Free Sale Litres", ["FREE SALE LITRES", "Free Sale Litres"]),
                ("Free Sale Rupees", ["FREE SALE RUPEES", "Free Sale Rupees"]),
                ("Paytm", ["PAYTM"]),
                ("Net Cash Collection", ["NET CASH COLLECTION"]),
                ("Closing Dip", ["CLOSING DIP IN LTR", "CLOSING DIP"]),
            ]:
                number_value(row, index, label, aliases)
            sale_qty = number_value(row, index, "Sale Qty", ["SALE QTY", "Sale Qty"])
            new_rate = number_value(row, index, "New Rate", ["NEW RATE", "New Rate"])
            erp_rate = number_value(row, index, "ERP Rate", ["ERP RATE"])
            estimate_scheme_discount(row.get("SCHEME", 0), sale_qty, new_rate or erp_rate, index + 2)
    except ValueError as e:
        log(str(e))
        return False

    # Connect to Postgres
    conn = None
    cur = None
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
            log(f"[SKIPPED] Date {sale_date} is already in the database ({db_count} rows, {round(db_qty)} L).")
            cur.close()
            conn.close()
            return True

        if dry_run:
            log(f"[VALIDATED] File is valid: {len(df)} rows ready for date {sale_date}; no database changes made.")
            cur.close()
            conn.close()
            return True

        # Insert
        insert_sql = """
            INSERT INTO sale_tracker (
                erp_code, alds_name, state, tm, coordinator, type, tank_cap,
                sale_qty, collection, new_rate, other, diff, erp_rate, ret_test_cal,
                free_sale_litres, free_sale_rupees, scheme, paytm, net_cash_collection,
                closing_dip_in_ltr, remark, net_total_collection, effective_rsp,
                collection_check, scheme_as_per_ho, free_sale_pct, sale_date
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s
            )
        """

        total_qty = 0
        for index, r in df.iterrows():
            code = str(r[cost_code_col]).strip()
            name = str(r.get("ALDS NAME", r.get("alds_name", ""))).strip()
            st = str(r.get("STATE", r.get("State", ""))).strip()
            tm = str(r.get("TM", r.get("tm", ""))).strip()
            coord = str(r.get("Coordinator", r.get("COORDINATOR", ""))).strip()
            tp = str(r.get("Type", r.get("TYPE", "LOCO"))).strip()
            cap = str(r.get("TANK CAP", r.get("Tank Cap", ""))).strip()

            sqty = number_value(r, index, "Sale Qty", ["SALE QTY", "Sale Qty"])
            coll = number_value(r, index, "Collection", ["COLLECTION", "Collection"])
            nrate = number_value(r, index, "New Rate", ["NEW RATE", "New Rate"])
            other = number_value(r, index, "Other", ["OTHER"])
            diff = number_value(r, index, "Diff", ["DIFF"])
            erate = number_value(r, index, "ERP Rate", ["ERP RATE"])
            rtest = number_value(r, index, "Ret Test/Cal", ["RET TEST/CAL"])
            flit = number_value(r, index, "Free Sale Litres", ["FREE SALE LITRES", "Free Sale Litres"])
            frup = number_value(r, index, "Free Sale Rupees", ["FREE SALE RUPEES", "Free Sale Rupees"])
            scheme = estimate_scheme_discount(
                r.get("SCHEME", 0), sqty, nrate or erate, index + 2
            )
            paytm = number_value(r, index, "Paytm", ["PAYTM"])
            ncash = number_value(r, index, "Net Cash Collection", ["NET CASH COLLECTION"])
            cdip = number_value(r, index, "Closing Dip", ["CLOSING DIP IN LTR", "CLOSING DIP"])
            rem = str(r.get("REMARK", r.get("Remark", ""))).strip()
            net_tot = number_value(r, index, "Net Total Collection", ["NET TOTAL COLLECTION", "Net Total Collection"]) or coll
            eff_rsp = number_value(r, index, "Effective RSP", ["EFFECTIVE RSP", "Effective RSP"]) or (round(net_tot / sqty, 2) if sqty > 0 else (nrate or erate or 0))
            coll_chk = number_value(r, index, "Collection Check", ["COLLECTION CHECK", "Collection Check"])
            sch_ho = number_value(r, index, "Scheme As Per HO", ["SCHEME AS PER HO", "Scheme As Per HO"])
            fs_pct = number_value(r, index, "Free Sale %", ["FREE SALE PCT", "Free Sale %", "FREE SALE %"]) or (round((flit / sqty) * 100, 2) if sqty > 0 else 0)

            total_qty += sqty
            try:
                cur.execute(insert_sql, (
                    code, name, st, tm, coord, tp, cap,
                    sqty, coll, nrate, other, diff, erate, rtest,
                    flit, frup, scheme, paytm, ncash, cdip, rem,
                    net_tot, eff_rsp, coll_chk, sch_ho, fs_pct, sale_date
                ))
            except Exception as e:
                db_column = getattr(getattr(e, "diag", None), "column_name", None)
                location = f', column "{db_column}"' if db_column else ", database constraint/data"
                raise RuntimeError(f'[FAILED] Row {index + 2} (Cost Code "{code}"){location}: {e}') from e

        conn.commit()
        log(f"[LOADED] {os.path.basename(file_path)}: {len(df)} stations, date {sale_date}, total volume: {round(total_qty)} L.")

        cur.close()
        conn.close()
        return True
    except Exception as e:
        message = str(e)
        log(message if message.startswith("[FAILED]") else f"[FAILED] Database error: {message}")
        if conn:
            try:
                conn.rollback()
            except Exception as rollback_error:
                log(f"[ERROR] Could not roll back database transaction: {rollback_error}")
            if cur:
                try:
                    cur.close()
                except Exception as close_error:
                    log(f"[ERROR] Could not close database cursor: {close_error}")
            try:
                conn.close()
            except Exception as close_error:
                log(f"[ERROR] Could not close database connection: {close_error}")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manual Work - Sales Data Loader")
    parser.add_argument("--file", default=os.path.join(_this_dir, DEFAULT_FILE), help="Excel file to load")
    parser.add_argument("--dry-run", action="store_true", help="Validate without inserting into DB")
    args = parser.parse_args()

    process_file(args.file, dry_run=args.dry_run)
