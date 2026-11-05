-- 01_create_table.sql
-- sale_tracker table + protective indexes + loader/reader roles.
--
-- Database: sale_ALDS    Table: sale_tracker
--
-- HOW TO RUN (as the PostgreSQL admin):
--   1. Create the database first. Connect to the `postgres` database and run:
--        CREATE DATABASE sale_ALDS;
--   2. Connect to the new sale_ALDS database, then run this whole file:
--        psql -U postgres -h localhost -d sale_ALDS -f 01_create_table.sql

-- =========================================================================
-- Table: id + 27 columns in sequence order.
-- id fills itself. erp_code (Cost Code) is NOT NULL.
-- sale_date is NOT NULL (every row must have a date).
-- =========================================================================
CREATE TABLE IF NOT EXISTS sale_tracker (
    id                    BIGSERIAL PRIMARY KEY,
    type                  TEXT,
    coordinator           TEXT,
    state                 TEXT,
    tm                    TEXT,
    erp_code              TEXT NOT NULL,
    alds_name             TEXT,
    tank_cap              TEXT,
    sale_qty              NUMERIC,
    collection            NUMERIC,
    new_rate              NUMERIC,
    other                 NUMERIC,
    diff                  NUMERIC,
    erp_rate              NUMERIC,
    ret_test_cal          NUMERIC,
    free_sale_litres      NUMERIC,
    free_sale_rupees      NUMERIC,
    scheme                NUMERIC,
    paytm                 NUMERIC,
    net_cash_collection   NUMERIC,
    closing_dip_in_ltr    NUMERIC,
    remark                TEXT,
    net_total_collection  NUMERIC,
    effective_rsp         NUMERIC,
    collection_check      NUMERIC,
    scheme_as_per_ho      NUMERIC,
    free_sale_pct         NUMERIC,
    sale_date             DATE NOT NULL
);

-- =========================================================================
-- Indexes
-- =========================================================================
-- Fast "is this date already loaded?" lookup.
CREATE INDEX IF NOT EXISTS idx_sale_tracker_sale_date
    ON sale_tracker (sale_date);

-- One Cost Code per date. Prevents duplicate uploads for the same day.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_tracker_date_erp
    ON sale_tracker (sale_date, erp_code);

-- =========================================================================
-- Roles
--   bot_loader : SELECT + INSERT only (cannot UPDATE/DELETE). Used by loader.
--   bot_reader : SELECT only, queries time out after 15 s. Used by dashboard.
-- =========================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_loader') THEN
        CREATE ROLE bot_loader LOGIN PASSWORD 'CHANGE_ME_LOADER';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_reader') THEN
        CREATE ROLE bot_reader LOGIN PASSWORD 'CHANGE_ME_READER';
    END IF;
END $$;

-- Replace the placeholders above with real passwords, then put the SAME
-- loader password in .env as BOT_LOADER_PASSWORD. Never commit .env.

GRANT CONNECT ON DATABASE sale_alds TO bot_loader, bot_reader;
GRANT USAGE ON SCHEMA public TO bot_loader, bot_reader;

GRANT SELECT, INSERT ON sale_tracker TO bot_loader;
GRANT USAGE, SELECT ON SEQUENCE sale_tracker_id_seq TO bot_loader;

GRANT SELECT ON sale_tracker TO bot_reader;

-- Reader (dashboard): read-only, 15-second query timeout.
ALTER ROLE bot_reader   SET statement_timeout = '15s';
ALTER ROLE bot_loader   SET statement_timeout = '0';   -- no limit for loads
