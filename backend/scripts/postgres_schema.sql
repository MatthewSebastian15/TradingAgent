CREATE TABLE IF NOT EXISTS analyses (
    request_id           TEXT PRIMARY KEY,
    owner_id             TEXT NOT NULL,
    job_id               TEXT,
    ticker               TEXT NOT NULL,
    market               TEXT,
    trade_date           TEXT,
    time_horizon_months  INTEGER,
    analysis_depth       TEXT,
    response_detail      TEXT,
    decision             TEXT,
    recommendation       TEXT,
    current_price        DOUBLE PRECISION,
    entry_price          DOUBLE PRECISION,
    stop_loss            DOUBLE PRECISION,
    take_profit          DOUBLE PRECISION,
    rr_ratio             TEXT,
    source_summary       TEXT,
    status               TEXT NOT NULL DEFAULT 'completed',
    result_json          TEXT NOT NULL,
    request_json         TEXT,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    exported_html_at     TEXT,
    exported_pdf_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_analyses_owner_created_at  ON analyses (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_owner_request_id  ON analyses (owner_id, request_id);
CREATE INDEX IF NOT EXISTS idx_analyses_owner_job_id      ON analyses (owner_id, job_id);
CREATE INDEX IF NOT EXISTS idx_analyses_job_id            ON analyses (job_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at        ON analyses (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_ticker_created_at ON analyses (ticker, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_market_created_at ON analyses (market, created_at DESC);
