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

INSERT INTO state_map (from_state, to_state) VALUES ('KAR', 'KA')
ON CONFLICT (from_state) DO NOTHING;

INSERT INTO state_map (from_state, to_state) VALUES ('RAJ', 'RJ')
ON CONFLICT (from_state) DO NOTHING;

-- ELANGO R is a Territory Manager name, not a state; this legacy value belongs to Tamil Nadu.
INSERT INTO state_map (from_state, to_state) VALUES ('ELANGO R', 'TN')
ON CONFLICT (from_state) DO UPDATE
SET to_state = EXCLUDED.to_state
WHERE state_map.to_state IS DISTINCT FROM EXCLUDED.to_state;
