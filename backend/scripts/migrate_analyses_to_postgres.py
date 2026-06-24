"""Copy the `analyses` table from SQLite into Postgres.

Idempotent: `ON CONFLICT (request_id) DO NOTHING` ⇒ safe to re-run. Stop backend
writers before running against real data (no writes mid-copy).
"""

from __future__ import annotations

import sqlite3

import psycopg

from config import ANALYSIS_DATABASE_URL, ANALYSIS_DB_PATH

COLUMNS = [
    "request_id",
    "owner_id",
    "job_id",
    "ticker",
    "market",
    "trade_date",
    "time_horizon_months",
    "analysis_depth",
    "response_detail",
    "decision",
    "recommendation",
    "current_price",
    "entry_price",
    "stop_loss",
    "take_profit",
    "rr_ratio",
    "source_summary",
    "status",
    "result_json",
    "request_json",
    "created_at",
    "updated_at",
    "exported_html_at",
    "exported_pdf_at",
]


def migrate(sqlite_path: str, pg_url: str) -> int:
    """Copy every analyses row from `sqlite_path` into `pg_url`. Returns row count read."""
    src = sqlite3.connect(sqlite_path)
    src.row_factory = sqlite3.Row
    rows = src.execute(f"SELECT {','.join(COLUMNS)} FROM analyses").fetchall()
    src.close()
    placeholders = ",".join(["%s"] * len(COLUMNS))
    sql = (
        f"INSERT INTO analyses ({','.join(COLUMNS)}) VALUES ({placeholders}) "
        "ON CONFLICT (request_id) DO NOTHING"
    )
    with psycopg.connect(pg_url) as dst:
        with dst.cursor() as cur:
            cur.executemany(sql, [tuple(r[c] for c in COLUMNS) for r in rows])
        dst.commit()
    return len(rows)


if __name__ == "__main__":
    count = migrate(ANALYSIS_DB_PATH, ANALYSIS_DATABASE_URL)
    print(f"Migrated {count} analyses")
