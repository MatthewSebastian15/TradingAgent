from __future__ import annotations

import os

import psycopg
import pytest

from config import ANALYSIS_DATABASE_URL
from scripts.migrate_analyses_to_postgres import migrate
from services.analysis_repository import AnalysisRepository

pytestmark = [
    pytest.mark.postgres,
    pytest.mark.skipif(
        not os.environ.get("ANALYSIS_DATABASE_URL"),
        reason="ANALYSIS_DATABASE_URL not set; Postgres tests are opt-in.",
    ),
]

_OWNER = "owner:test"


def _result(request_id, ticker="AAPL"):
    return {
        "request_id": request_id,
        "ticker": ticker,
        "market": "US",
        "analysis_created_at": "2026-05-28T08:00:00+00:00",
        "final_decision": "Buy",
        "current_price": 185.25,
    }


def _pg_count():
    with psycopg.connect(ANALYSIS_DATABASE_URL) as conn:
        return conn.execute("SELECT COUNT(*) FROM analyses").fetchone()[0]


def test_migrate_copies_rows_and_is_idempotent(tmp_path):
    with psycopg.connect(ANALYSIS_DATABASE_URL) as conn:
        conn.execute("TRUNCATE analyses")
        conn.commit()

    sqlite_path = str(tmp_path / "analysis_history.sqlite3")
    repo = AnalysisRepository(sqlite_path, max_rows=100)
    repo.save_analysis(result=_result("req-1"), owner_id=_OWNER)
    repo.save_analysis(result=_result("req-2", "MSFT"), owner_id=_OWNER)

    assert migrate(sqlite_path, ANALYSIS_DATABASE_URL) == 2
    assert _pg_count() == 2

    # Second run reads the same 2 rows but ON CONFLICT DO NOTHING ⇒ zero added.
    assert migrate(sqlite_path, ANALYSIS_DATABASE_URL) == 2
    assert _pg_count() == 2
