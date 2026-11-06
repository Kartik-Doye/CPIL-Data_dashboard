-- Forecast validation ledger. Run as the PostgreSQL admin in sale_alds.
-- The dashboard writes through bot_loader; the read-only dashboard role does
-- not receive write privileges.
CREATE TABLE IF NOT EXISTS forecast_feedback (
    forecast_origin_date DATE NOT NULL,
    target_date DATE NOT NULL,
    predicted_ensemble NUMERIC NOT NULL,
    predicted_linear NUMERIC NOT NULL,
    predicted_holt_winters NUMERIC NOT NULL,
    predicted_naive NUMERIC NOT NULL,
    predicted_weekday NUMERIC NOT NULL,
    actual_sale_qty NUMERIC,
    evaluated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (forecast_origin_date, target_date)
);

CREATE INDEX IF NOT EXISTS idx_forecast_feedback_target
    ON forecast_feedback (target_date);

GRANT SELECT, INSERT, UPDATE ON forecast_feedback TO bot_loader;
