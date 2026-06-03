"""Permanent SQLite repository for completed analysis snapshots."""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from config import ANALYSIS_DB_PATH, ANALYSIS_HISTORY_MAX_ROWS

SCHEMA_VERSION = 1

_WRITE_LOCKS: dict[Path, threading.RLock] = {}
_WRITE_LOCKS_GUARD = threading.Lock()


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _write_lock_for_path(path: Path) -> threading.RLock:
    resolved = path.resolve(strict=False)
    with _WRITE_LOCKS_GUARD:
        lock = _WRITE_LOCKS.get(resolved)
        if lock is None:
            lock = threading.RLock()
            _WRITE_LOCKS[resolved] = lock
        return lock


class AnalysisRepository:
    """Store completed analysis results independently from short-lived caches."""

    def __init__(self, db_path: str, max_rows: int = 1000) -> None:
        self.db_path = Path(db_path)
        self.max_rows = max(1, int(max_rows))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._write_lock = _write_lock_for_path(self.db_path)
        self._ensure_schema()

    def save_analysis(
        self,
        *,
        result: dict[str, Any],
        request_payload: dict[str, Any] | None = None,
        job_id: str | None = None,
    ) -> bool:
        """Save one valid completed result and return whether it was stored."""

        if not isinstance(result, dict) or result.get("error"):
            return False

        request_id = str(result.get("request_id") or "").strip()
        ticker = str(result.get("ticker") or "").strip().upper()
        if not request_id or not ticker:
            return False

        now = utc_now_iso()
        created_at = str(result.get("analysis_created_at") or result.get("created_at") or now)
        decision = result.get("final_decision") or result.get("decision") or result.get("recommendation")
        values = {
            "request_id": request_id,
            "job_id": str(job_id).strip() if job_id else None,
            "ticker": ticker,
            "market": result.get("market"),
            "trade_date": result.get("trade_date"),
            "time_horizon_months": result.get("time_horizon_months"),
            "analysis_depth": result.get("analysis_depth"),
            "response_detail": result.get("response_detail"),
            "decision": decision,
            "recommendation": result.get("recommendation") or decision,
            "current_price": result.get("current_price"),
            "entry_price": result.get("entry_price"),
            "stop_loss": result.get("stop_loss"),
            "take_profit": result.get("take_profit"),
            "rr_ratio": result.get("risk_reward_display") or result.get("rr_ratio"),
            "source_summary": result.get("current_price_source") or result.get("source") or result.get("data_source"),
            "status": "completed",
            "result_json": self._dumps(result),
            "request_json": self._dumps(request_payload or {}),
            "created_at": created_at,
            "updated_at": now,
        }

        with self._write_lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                INSERT INTO analyses (
                    request_id, job_id, ticker, market, trade_date,
                    time_horizon_months, analysis_depth, response_detail,
                    decision, recommendation, current_price, entry_price,
                    stop_loss, take_profit, rr_ratio, source_summary,
                    status, result_json, request_json, created_at, updated_at
                ) VALUES (
                    :request_id, :job_id, :ticker, :market, :trade_date,
                    :time_horizon_months, :analysis_depth, :response_detail,
                    :decision, :recommendation, :current_price, :entry_price,
                    :stop_loss, :take_profit, :rr_ratio, :source_summary,
                    :status, :result_json, :request_json, :created_at, :updated_at
                )
                ON CONFLICT(request_id) DO UPDATE SET
                    job_id = COALESCE(excluded.job_id, analyses.job_id),
                    ticker = excluded.ticker,
                    market = excluded.market,
                    trade_date = excluded.trade_date,
                    time_horizon_months = excluded.time_horizon_months,
                    analysis_depth = excluded.analysis_depth,
                    response_detail = excluded.response_detail,
                    decision = excluded.decision,
                    recommendation = excluded.recommendation,
                    current_price = excluded.current_price,
                    entry_price = excluded.entry_price,
                    stop_loss = excluded.stop_loss,
                    take_profit = excluded.take_profit,
                    rr_ratio = excluded.rr_ratio,
                    source_summary = excluded.source_summary,
                    status = excluded.status,
                    result_json = excluded.result_json,
                    request_json = excluded.request_json,
                    updated_at = excluded.updated_at
                """,
                values,
            )
            self._evict_old_rows(conn)
        return True

    def get_analysis(self, request_id: str) -> dict[str, Any] | None:
        row = self._fetch_record("request_id", request_id)
        return self._result_from_row(row)

    def get_analysis_by_job_id(self, job_id: str) -> dict[str, Any] | None:
        row = self._fetch_record("job_id", job_id)
        return self._result_from_row(row)

    def get_analysis_record_by_job_id(self, job_id: str) -> dict[str, Any] | None:
        row = self._fetch_record("job_id", job_id)
        if row is None:
            return None
        record = dict(row)
        result = self._loads_dict(record.pop("result_json"))
        request_payload = self._loads_dict(record.pop("request_json"))
        if result is None:
            return None
        record["result"] = result
        record["request_payload"] = request_payload or {}
        return record

    def list_analyses(self, *, ticker: str | None = None, limit: int = 25) -> list[dict[str, Any]]:
        safe_limit = max(1, min(int(limit), 100))
        params: list[Any] = []
        where = ""
        if ticker:
            where = "WHERE ticker = ?"
            params.append(ticker.strip().upper())
        params.append(safe_limit)

        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT
                    request_id, job_id, ticker, market, trade_date,
                    time_horizon_months, analysis_depth, response_detail,
                    decision, recommendation, current_price, entry_price,
                    stop_loss, take_profit, rr_ratio, source_summary,
                    status, created_at, created_at AS analysis_created_at,
                    updated_at, exported_html_at, exported_pdf_at
                FROM analyses
                {where}
                ORDER BY created_at DESC, request_id DESC
                LIMIT ?
                """,
                params,
            ).fetchall()
        return [dict(row) for row in rows]

    def delete_analysis(self, request_id: str) -> bool:
        with self._write_lock, self._connect() as conn:
            cursor = conn.execute("DELETE FROM analyses WHERE request_id = ?", (request_id,))
            return cursor.rowcount > 0

    def delete_all_analyses(self) -> int:
        with self._write_lock, self._connect() as conn:
            cursor = conn.execute("DELETE FROM analyses")
            return max(0, cursor.rowcount)

    def mark_exported(self, request_id: str, export_type: str) -> bool:
        if export_type not in {"html", "pdf"}:
            return False
        column = "exported_html_at" if export_type == "html" else "exported_pdf_at"
        now = utc_now_iso()
        with self._write_lock, self._connect() as conn:
            cursor = conn.execute(
                f"UPDATE analyses SET {column} = ?, updated_at = ? WHERE request_id = ?",
                (now, now, request_id),
            )
            return cursor.rowcount > 0

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout = 30000")
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _ensure_schema(self) -> None:
        with self._write_lock, self._connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            version = int(conn.execute("PRAGMA user_version").fetchone()[0])
            if version > SCHEMA_VERSION:
                raise RuntimeError(
                    f"SQLite analysis history schema version {version} is newer than supported version {SCHEMA_VERSION}."
                )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS analyses (
                    request_id TEXT PRIMARY KEY,
                    job_id TEXT,
                    ticker TEXT NOT NULL,
                    market TEXT,
                    trade_date TEXT,
                    time_horizon_months INTEGER,
                    analysis_depth TEXT,
                    response_detail TEXT,
                    decision TEXT,
                    recommendation TEXT,
                    current_price REAL,
                    entry_price REAL,
                    stop_loss REAL,
                    take_profit REAL,
                    rr_ratio TEXT,
                    source_summary TEXT,
                    status TEXT NOT NULL DEFAULT 'completed',
                    result_json TEXT NOT NULL,
                    request_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    exported_html_at TEXT,
                    exported_pdf_at TEXT
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_analyses_job_id ON analyses (job_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses (created_at DESC)")
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_analyses_ticker_created_at ON analyses (ticker, created_at DESC)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_analyses_market_created_at ON analyses (market, created_at DESC)"
            )
            conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

    def _fetch_record(self, column: str, value: str) -> sqlite3.Row | None:
        if column not in {"request_id", "job_id"}:
            raise ValueError(f"Unsupported lookup column: {column}")
        with self._connect() as conn:
            return conn.execute(
                f"""
                SELECT
                    request_id, job_id, ticker, market, trade_date,
                    time_horizon_months, analysis_depth, response_detail,
                    decision, recommendation, current_price, entry_price,
                    stop_loss, take_profit, rr_ratio, source_summary,
                    status, result_json, request_json, created_at, updated_at,
                    exported_html_at, exported_pdf_at
                FROM analyses
                WHERE {column} = ?
                """,
                (value,),
            ).fetchone()

    def _evict_old_rows(self, conn: sqlite3.Connection) -> None:
        rows = conn.execute(
            "SELECT request_id FROM analyses ORDER BY created_at DESC, request_id DESC LIMIT -1 OFFSET ?",
            (self.max_rows,),
        ).fetchall()
        if rows:
            conn.executemany("DELETE FROM analyses WHERE request_id = ?", [(row["request_id"],) for row in rows])

    @classmethod
    def _result_from_row(cls, row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        return cls._loads_dict(row["result_json"])

    @staticmethod
    def _dumps(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    @staticmethod
    def _loads_dict(value: Any) -> dict[str, Any] | None:
        try:
            parsed = json.loads(value or "{}")
        except (TypeError, json.JSONDecodeError):
            return None
        return parsed if isinstance(parsed, dict) else None


_REPOSITORY: AnalysisRepository | None = None


def get_analysis_repository() -> AnalysisRepository:
    global _REPOSITORY
    if _REPOSITORY is None:
        _REPOSITORY = AnalysisRepository(ANALYSIS_DB_PATH, max_rows=ANALYSIS_HISTORY_MAX_ROWS)
    return _REPOSITORY


def install_analysis_repository(repository: AnalysisRepository) -> AnalysisRepository:
    global _REPOSITORY
    _REPOSITORY = repository
    return repository
