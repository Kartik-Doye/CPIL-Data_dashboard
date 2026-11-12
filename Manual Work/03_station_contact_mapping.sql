-- Run as a PostgreSQL administrator in database sale_alds.
-- Adds a current station/TM mapping without rewriting sale_tracker history.
CREATE TABLE IF NOT EXISTS public.station_contact_mapping (
    erp_code    TEXT PRIMARY KEY,
    alds_name   TEXT NOT NULL,
    state       TEXT NOT NULL,
    region      TEXT NOT NULL,
    tm          TEXT NOT NULL,
    source_file TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT station_contact_mapping_nonblank
        CHECK (
            LENGTH(TRIM(erp_code)) > 0
            AND LENGTH(TRIM(alds_name)) > 0
            AND LENGTH(TRIM(tm)) > 0
        )
);

GRANT SELECT ON public.station_contact_mapping TO bot_reader;
GRANT SELECT, INSERT, UPDATE ON public.station_contact_mapping TO bot_loader;
