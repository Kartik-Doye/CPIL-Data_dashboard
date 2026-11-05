-- 04_settings.sql
-- Phase 2: settings table for status bands, week rules, quarter rules.
-- The dashboard reads these so bands are configurable without code changes.

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

-- Target status bands (PRD section 2 / 8.15)
INSERT INTO settings (key, value) VALUES
('status_bands', '{
    "Achieved":  {"min": 100.0,  "max": null,  "color": "#28a745"},
    "On track":  {"min": 90.0,   "max": 99.99, "color": "#17a2b8"},
    "At risk":   {"min": 75.0,   "max": 89.99, "color": "#ffc107"},
    "Behind":    {"min": null,   "max": 74.99, "color": "#dc3545"}
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Station target distribution bands (PRD section 8.16)
INSERT INTO settings (key, value) VALUES
('station_target_bands', '[
    {"label": "Below 50%",   "min": null,  "max": 50},
    {"label": "50-75%",      "min": 50,    "max": 75},
    {"label": "75-100%",     "min": 75,    "max": 100},
    {"label": "100-125%",    "min": 100,   "max": 125},
    {"label": "Above 125%",  "min": 125,   "max": null}
]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Week rules (PRD section 2)
INSERT INTO settings (key, value) VALUES
('week_rules', '{
    "report_6":  {"start": "sunday",   "end": "saturday"},
    "report_17": {"start": "monday",   "end": "sunday"}
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Financial year and quarter rules (PRD section 2)
INSERT INTO settings (key, value) VALUES
('financial_year', '{
    "start_month": 4,
    "quarters": {
        "Q1": [4, 5, 6],
        "Q2": [7, 8, 9],
        "Q3": [10, 11, 12],
        "Q4": [1, 2, 3]
    }
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Weekend definition (PRD section 2)
INSERT INTO settings (key, value) VALUES
('weekend', '{"days": [0, 6]}'::jsonb)
ON CONFLICT (key) DO NOTHING;
