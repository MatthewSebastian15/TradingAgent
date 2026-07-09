"""Characterization test: the SQLite and Postgres `analyses` schemas must not drift.

The SQLite DDL lives inline in services/analysis_repository.py; the Postgres DDL
is hand-maintained in scripts/postgres_schema.sql (audit DB-001). A column added
to one but not the other only fails at runtime on the other backend — this test
fails at CI time instead.
"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path

from services.analysis_repository import AnalysisRepository

POSTGRES_SCHEMA = Path(__file__).parents[1] / "scripts" / "postgres_schema.sql"


def _sqlite_columns(tmp_path) -> list[str]:
    repo = AnalysisRepository(db_path=tmp_path / "analyses.db")
    with sqlite3.connect(repo.db_path) as conn:
        return [row[1] for row in conn.execute("PRAGMA table_info(analyses)")]


def _postgres_columns() -> list[str]:
    sql = POSTGRES_SCHEMA.read_text(encoding="utf-8")
    match = re.search(r"CREATE TABLE IF NOT EXISTS analyses \((.*?)\);", sql, flags=re.S)
    assert match, "analyses CREATE TABLE not found in postgres_schema.sql"
    columns = []
    for line in match.group(1).splitlines():
        line = line.strip().rstrip(",")
        if not line or line.startswith("--"):
            continue
        columns.append(line.split()[0])
    return columns


def test_postgres_schema_matches_sqlite_columns(tmp_path):
    assert _postgres_columns() == _sqlite_columns(tmp_path)
