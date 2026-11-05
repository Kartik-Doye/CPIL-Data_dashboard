-- 02_views.sql
-- Phase 2: All dashboard views. One agreed calculation per measure.
-- The page code never repeats the math, so cards and charts cannot disagree.
--
-- Grain: (sale_date, dimension) so the app can filter by date range and
--   aggregate to any period. Additive measures SUM cleanly; non-additive
--   rates expose their numerator (rate * sale_qty) so the app computes a
--   weighted average after summing. Percentages come from totals, never
--   from averaging percentages. All divisions use NULLIF.
--
-- State views merge MS -> MH via state_map (stored data unchanged).
-- TM views group empty/NULL tm as 'No TM' (152 of 315 rows on 15-10-2026).

-- =========================================================================
-- v_daily: PAN India totals per date
-- =========================================================================
CREATE OR REPLACE VIEW v_daily AS
SELECT
    sale_date,
    COUNT(*)                                              AS stations,
    SUM(sale_qty)                                         AS sale_qty,
    SUM(net_total_collection)                             AS net_total_collection,
    SUM(collection)                                       AS collection,
    SUM(paytm)                                            AS paytm,
    SUM(free_sale_litres)                                 AS free_sale_litres,
    SUM(free_sale_rupees)                                 AS free_sale_rupees,
    SUM(net_cash_collection)                              AS net_cash_collection,
    SUM(new_rate * sale_qty)                              AS rsp_num,
    SUM(effective_rsp * sale_qty)                         AS eff_rsp_num
FROM sale_tracker
GROUP BY sale_date;

-- =========================================================================
-- v_state_period: per date, per state (MS merged into MH)
-- =========================================================================
CREATE OR REPLACE VIEW v_state_period AS
SELECT
    s.sale_date,
    COALESCE(m.to_state, s.state)                         AS state,
    COUNT(*)                                              AS stations,
    SUM(s.sale_qty)                                       AS sale_qty,
    SUM(s.net_total_collection)                           AS net_total_collection,
    SUM(s.collection)                                     AS collection,
    SUM(s.paytm)                                          AS paytm,
    SUM(s.free_sale_litres)                               AS free_sale_litres,
    SUM(s.free_sale_rupees)                               AS free_sale_rupees,
    SUM(s.net_cash_collection)                            AS net_cash_collection,
    SUM(s.new_rate * s.sale_qty)                          AS rsp_num,
    SUM(s.effective_rsp * s.sale_qty)                     AS eff_rsp_num
FROM sale_tracker s
LEFT JOIN state_map m ON s.state = m.from_state
GROUP BY s.sale_date, COALESCE(m.to_state, s.state);

-- =========================================================================
-- v_coordinator_period: per date, per coordinator
-- =========================================================================
CREATE OR REPLACE VIEW v_coordinator_period AS
SELECT
    sale_date,
    COALESCE(NULLIF(TRIM(coordinator), ''), 'Unknown')    AS coordinator,
    COUNT(*)                                              AS stations,
    SUM(sale_qty)                                         AS sale_qty,
    SUM(net_total_collection)                             AS net_total_collection,
    SUM(collection)                                       AS collection,
    SUM(paytm)                                            AS paytm,
    SUM(free_sale_litres)                                 AS free_sale_litres,
    SUM(free_sale_rupees)                                 AS free_sale_rupees,
    SUM(net_cash_collection)                              AS net_cash_collection,
    SUM(new_rate * sale_qty)                              AS rsp_num,
    SUM(effective_rsp * s.sale_qty)                       AS eff_rsp_num
FROM sale_tracker s
GROUP BY sale_date, COALESCE(NULLIF(TRIM(coordinator), ''), 'Unknown');

-- =========================================================================
-- v_tm_period: per date, per TM (empty/NULL -> 'No TM')
-- =========================================================================
CREATE OR REPLACE VIEW v_tm_period AS
SELECT
    sale_date,
    COALESCE(NULLIF(TRIM(tm), ''), 'No TM')               AS tm,
    COUNT(*)                                              AS stations,
    SUM(sale_qty)                                         AS sale_qty,
    SUM(s.net_total_collection)                           AS net_total_collection,
    SUM(collection)                                       AS collection,
    SUM(paytm)                                            AS paytm,
    SUM(free_sale_litres)                                 AS free_sale_litres,
    SUM(free_sale_rupees)                                 AS free_sale_rupees,
    SUM(net_cash_collection)                              AS net_cash_collection,
    SUM(new_rate * sale_qty)                              AS rsp_num,
    SUM(s.effective_rsp * s.sale_qty)                     AS eff_rsp_num
FROM sale_tracker s
GROUP BY sale_date, COALESCE(NULLIF(TRIM(tm), ''), 'No TM');

-- =========================================================================
-- v_station_period: per date, per station (erp_code + name)
-- =========================================================================
CREATE OR REPLACE VIEW v_station_period AS
SELECT
    sale_date,
    erp_code,
    MAX(alds_name)                                        AS alds_name,
    COALESCE(NULLIF(TRIM(MAX(state)), ''), 'Unknown')     AS state,
    COALESCE(NULLIF(TRIM(MAX(coordinator)), ''), 'Unknown') AS coordinator,
    COALESCE(NULLIF(TRIM(MAX(tm)), ''), 'No TM')          AS tm,
    MAX(type)                                             AS type,
    SUM(sale_qty)                                         AS sale_qty,
    SUM(net_total_collection)                             AS net_total_collection,
    SUM(collection)                                       AS collection,
    SUM(paytm)                                            AS paytm,
    SUM(free_sale_litres)                                 AS free_sale_litres,
    SUM(free_sale_rupees)                                 AS free_sale_rupees,
    SUM(net_cash_collection)                              AS net_cash_collection,
    SUM(new_rate * sale_qty)                              AS rsp_num,
    SUM(effective_rsp * sale_qty)                         AS eff_rsp_num,
    -- latest closing dip (last value, never summed)
    (ARRAY_AGG(closing_dip_in_ltr ORDER BY sale_date))[1] AS closing_dip,
    MAX(remark)                                           AS remark
FROM sale_tracker
GROUP BY sale_date, erp_code;

-- =========================================================================
-- v_type_period: per date, per station type
-- =========================================================================
CREATE OR REPLACE VIEW v_type_period AS
SELECT
    sale_date,
    COALESCE(NULLIF(TRIM(type), ''), 'Unknown')           AS type,
    COUNT(*)                                              AS stations,
    SUM(sale_qty)                                         AS sale_qty,
    SUM(net_total_collection)                             AS net_total_collection,
    SUM(collection)                                       AS collection,
    SUM(paytm)                                            AS paytm,
    SUM(free_sale_litres)                                 AS free_sale_litres,
    SUM(free_sale_rupees)                                 AS free_sale_rupees,
    SUM(net_cash_collection)                              AS net_cash_collection,
    SUM(new_rate * sale_qty)                              AS rsp_num,
    SUM(effective_rsp * sale_qty)                         AS eff_rsp_num
FROM sale_tracker
GROUP BY sale_date, COALESCE(NULLIF(TRIM(type), ''), 'Unknown');

-- =========================================================================
-- v_calendar: date dimension with week/FY/quarter/weekend info
--   week_sun_*  = Sunday-Saturday week  (report 6)
--   week_mon_*  = Monday-Sunday week    (report 17)
--   FY = April to March (Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar)
--   weekend = Saturday + Sunday
-- =========================================================================
CREATE OR REPLACE VIEW v_calendar AS
WITH bounds AS (
    SELECT MIN(sale_date) AS min_d, MAX(sale_date) AS max_d FROM sale_tracker
),
dates AS (
    SELECT generate_series(min_d, max_d, '1 day'::interval)::date AS d
    FROM bounds
)
SELECT
    d AS sale_date,
    -- Sunday-Saturday week (report 6): Sunday = dow 0
    (d - extract(dow FROM d)::int)::date                    AS week_sun_start,
    (d - extract(dow FROM d)::int + 6)::date                AS week_sun_end,
    -- Monday-Sunday week (report 17): date_trunc('week') = Monday
    date_trunc('week', d)::date                             AS week_mon_start,
    (date_trunc('week', d)::date + 6)::date                 AS week_mon_end,
    -- Week of month (Sun-Sat based, consistent with report 6 & 17)
    -- FLOOR((day + 6 - dow) / 7) + 1
    (FLOOR((extract(day FROM d)::int + 6 - extract(dow FROM d)::int) / 7.0)::int + 1) AS week_of_month,
    -- Month and year
    date_trunc('month', d)::date                            AS month_start,
    extract(year FROM d)::int                               AS yr,
    extract(month FROM d)::int                              AS mon,
    -- Financial year (April to March)
    CASE
        WHEN extract(month FROM d)::int >= 4
        THEN extract(year FROM d)::text || '-' ||
             (extract(year FROM d)::int + 1)::text
        ELSE (extract(year FROM d)::int - 1)::text || '-' ||
             extract(year FROM d)::text
    END                                                     AS financial_year,
    -- Quarter (Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar)
    CASE
        WHEN extract(month FROM d)::int IN (4, 5, 6)   THEN 'Q1'
        WHEN extract(month FROM d)::int IN (7, 8, 9)   THEN 'Q2'
        WHEN extract(month FROM d)::int IN (10, 11, 12) THEN 'Q3'
        ELSE 'Q4'
    END                                                     AS quarter,
    -- Weekend flag (Saturday=6, Sunday=0)
    extract(dow FROM d)::int IN (0, 6)                      AS is_weekend,
    -- Day of week
    extract(dow FROM d)::int                                AS dow,
    trim(to_char(d, 'Day'))                                 AS day_name
FROM dates;

-- =========================================================================
-- v_exceptions: flags stations needing attention
--   no_sale            = sale_qty is 0 or NULL
--   no_stock           = remark contains "no stock" (case/space insensitive)
--   sale_not_received  = remark contains "sale not received"
--   low_sale           = sale_qty > 0 but very low (below 10 L, configurable)
-- =========================================================================
CREATE OR REPLACE VIEW v_exceptions AS
SELECT
    sale_date,
    erp_code,
    alds_name,
    COALESCE(NULLIF(TRIM(state), ''), 'Unknown')            AS state,
    COALESCE(NULLIF(TRIM(coordinator), ''), 'Unknown')      AS coordinator,
    COALESCE(NULLIF(TRIM(tm), ''), 'No TM')                 AS tm,
    sale_qty,
    remark,
    CASE
        WHEN sale_qty IS NULL OR sale_qty = 0 THEN 'no_sale'
        WHEN lower(regexp_replace(COALESCE(remark, ''), '\s+', ' ', 'g'))
             LIKE '%no stock%' THEN 'no_stock'
        WHEN lower(regexp_replace(COALESCE(remark, ''), '\s+', ' ', 'g'))
             LIKE '%sale not received%' THEN 'sale_not_received'
        WHEN sale_qty < 10 THEN 'low_sale'
        ELSE NULL
    END                                                     AS exception_type
FROM sale_tracker;

-- =========================================================================
-- v_data_status: per-date load health (for the Data-check page)
-- =========================================================================
CREATE OR REPLACE VIEW v_data_status AS
SELECT
    sale_date,
    COUNT(*)                                                AS rows_loaded,
    COUNT(*) FILTER (WHERE tm IS NULL OR TRIM(tm) = '')     AS empty_tm_count,
    COUNT(*) FILTER (WHERE erp_code IS NULL OR TRIM(erp_code) = '') AS blank_erp_count,
    COUNT(DISTINCT erp_code)                                AS distinct_stations,
    ROUND(SUM(sale_qty), 2)                                 AS sum_sale_qty,
    ROUND(SUM(net_total_collection), 2)                     AS sum_collection
FROM sale_tracker
GROUP BY sale_date
ORDER BY sale_date;

-- =========================================================================
-- v_target_progress: stub (depends on targets table, not yet supplied)
--   When targets exist, this view joins targets to MTD sale per level.
--   For now it returns MTD sale per state so the target page can show
--   "targets not loaded yet" alongside the achieved numbers.
-- =========================================================================
CREATE OR REPLACE VIEW v_target_progress AS
SELECT
    COALESCE(m.to_state, s.state)                           AS level_name,
    'State'                                                 AS level_type,
    SUM(s.sale_qty)                                         AS mtd_sale,
    NULL::numeric                                           AS target,
    NULL::numeric                                           AS achievement_pct,
    NULL::text                                              AS status
FROM sale_tracker s
LEFT JOIN state_map m ON s.state = m.from_state
GROUP BY COALESCE(m.to_state, s.state);

-- =========================================================================
-- Grants: bot_reader needs SELECT on all views + lookup tables
-- =========================================================================
GRANT SELECT ON v_daily, v_state_period, v_coordinator_period, v_tm_period,
    v_station_period, v_type_period, v_calendar, v_exceptions,
    v_data_status, v_target_progress TO bot_reader;
GRANT SELECT ON state_map, settings TO bot_reader;
