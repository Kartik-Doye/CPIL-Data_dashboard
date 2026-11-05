-- 03_state_map.sql
-- Phase 2: state mapping table. Merges applied in all dashboard views:
--   MS -> MH  (Maharashtra consolidation)
--   AP -> TG  (Andhra Pradesh merged into Telangana)
-- Stored data in sale_tracker is unchanged; views use this map.

CREATE TABLE IF NOT EXISTS state_map (
    from_state TEXT PRIMARY KEY,
    to_state   TEXT NOT NULL
);

INSERT INTO state_map (from_state, to_state) VALUES ('MS', 'MH')
ON CONFLICT (from_state) DO NOTHING;

INSERT INTO state_map (from_state, to_state) VALUES ('AP', 'TG')
ON CONFLICT (from_state) DO NOTHING;
