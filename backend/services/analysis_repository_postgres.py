"""Postgres-backed repository for completed analysis snapshots.

Same public surface as ``AnalysisRepository`` (SQLite); routes call the factory,
never a concrete class, so swapping ``ANALYSIS_STORAGE_BACKEND=postgres`` changes
nothing for callers. Method bodies are mechanically ported from
``analysis_repository.py``: ``?``→``%s``, ``:name``→``%(name)s``, ``BEGIN
IMMEDIATE`` dropped, ``threading.RLock`` dropped (Postgres handles concurrency),
``dict_row`` row factory.
"""

from __future__ import annotations

from typing import Any

import psycopg
from psycopg.rows import dict_row

from config import ANALYSIS_DATABASE_URL
from services.analysis_repository import (
    AnalysisRepository,
    _confidence_score_percent,
    _history_signal,
    _require_owner_id,
    utc_now_iso,
)

# Reuse the SQLite repo's pure JSON helpers verbatim — identical semantics.
_dumps = AnalysisRepository._dumps
_loads_dict = AnalysisRepository._loads_dict


class PostgresAnalysisRepository:
    """Same public surface as AnalysisRepository, Postgres-backed.

    ponytail: connect-per-call, no pool until a profiler demands one — then
    swap in psycopg_pool.ConnectionPool. Connect cost is negligible on a local
    server / pgbouncer.
    """

    def __init__(self, max_rows: int = 1000) -> None:
        self.max_rows = max(1, int(max_rows))

    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(ANALYSIS_DATABASE_URL, row_factory=dict_row)

    def save_analysis(
        self,
        *,
        result: dict[str, Any],
        request_payload: dict[str, Any] | None = None,
        job_id: str | None = None,
        owner_id: str,
    ) -> bool:
        """Save one valid completed result and return whether it was stored."""

        if not isinstance(result, dict) or result.get("error"):
            return False

        request_id = str(result.get("request_id") or "").strip()
        ticker = str(result.get("ticker") or "").strip().upper()
        if not request_id or not ticker:
            return False

        owner = _require_owner_id(owner_id)
        now = utc_now_iso()
        created_at = str(result.get("analysis_created_at") or result.get("created_at") or now)
        decision = (
            result.get("final_decision") or result.get("decision") or result.get("recommendation")
        )
        values = {
            "request_id": request_id,
            "owner_id": owner,
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
            "source_summary": result.get("current_price_source")
            or result.get("source")
            or result.get("data_source"),
            "status": "completed",
            "result_json": _dumps(result),
            "request_json": _dumps(request_payload or {}),
            "created_at": created_at,
            "updated_at": now,
        }

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO analyses (
                    request_id, owner_id, job_id, ticker, market, trade_date,
                    time_horizon_months, analysis_depth, response_detail,
                    decision, recommendation, current_price, entry_price,
                    stop_loss, take_profit, rr_ratio, source_summary,
                    status, result_json, request_json, created_at, updated_at
                ) VALUES (
                    %(request_id)s, %(owner_id)s, %(job_id)s, %(ticker)s, %(market)s,
                    %(trade_date)s, %(time_horizon_months)s, %(analysis_depth)s,
                    %(response_detail)s, %(decision)s, %(recommendation)s,
                    %(current_price)s, %(entry_price)s, %(stop_loss)s, %(take_profit)s,
                    %(rr_ratio)s, %(source_summary)s, %(status)s, %(result_json)s,
                    %(request_json)s, %(created_at)s, %(updated_at)s
                )
                ON CONFLICT (request_id) DO UPDATE SET
                    owner_id = excluded.owner_id,
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

    def get_analysis(
        self,
        request_id: str,
        *,
        owner_id: str | None = None,
    ) -> dict[str, Any] | None:
        row = self._fetch_record("request_id", request_id, owner_id=owner_id)
        return _loads_dict(row["result_json"]) if row is not None else None

    def get_analysis_by_job_id(
        self,
        job_id: str,
        *,
        owner_id: str | None = None,
    ) -> dict[str, Any] | None:
        row = self._fetch_record("job_id", job_id, owner_id=owner_id)
        return _loads_dict(row["result_json"]) if row is not None else None

    def get_analysis_record_by_job_id(
        self,
        job_id: str,
        *,
        owner_id: str | None = None,
    ) -> dict[str, Any] | None:
        row = self._fetch_record("job_id", job_id, owner_id=owner_id)
        if row is None:
            return None
        record = dict(row)
        result = _loads_dict(record.pop("result_json"))
        request_payload = _loads_dict(record.pop("request_json"))
        if result is None:
            return None
        record["result"] = result
        record["request_payload"] = request_payload or {}
        return record

    def list_analyses(
        self,
        *,
        ticker: str | None = None,
        limit: int = 25,
        owner_id: str | None = None,
    ) -> list[dict[str, Any]]:
        safe_limit = max(1, min(int(limit), 100))
        params: list[Any] = []
        filters: list[str] = []
        if owner_id is not None:
            filters.append("owner_id = %s")
            params.append(_require_owner_id(owner_id))
        if ticker:
            filters.append("ticker = %s")
            params.append(ticker.strip().upper())
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        params.append(safe_limit)

        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT
                    request_id, job_id, ticker, market, trade_date,
                    time_horizon_months, analysis_depth, response_detail,
                    decision, recommendation, current_price, entry_price,
                    stop_loss, take_profit, rr_ratio, source_summary,
                    status, result_json, created_at, created_at AS analysis_created_at,
                    updated_at, exported_html_at, exported_pdf_at
                FROM analyses
                {where}
                ORDER BY created_at DESC, request_id DESC
                LIMIT %s
                """,
                params,
            ).fetchall()
        items: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            result = _loads_dict(item.pop("result_json", None)) or {}
            item["display_signal"] = _history_signal(result, item.get("decision"))
            item["confidence_score"] = _confidence_score_percent(result.get("confidence_score"))
            item["confidence_tier"] = (
                result.get("confidence_tier")
                if isinstance(result.get("confidence_tier"), str)
                else None
            )
            items.append(item)
        return items

    def delete_analysis(self, request_id: str, *, owner_id: str | None = None) -> bool:
        with self._connect() as conn:
            if owner_id is None:
                cursor = conn.execute("DELETE FROM analyses WHERE request_id = %s", (request_id,))
            else:
                cursor = conn.execute(
                    "DELETE FROM analyses WHERE request_id = %s AND owner_id = %s",
                    (request_id, _require_owner_id(owner_id)),
                )
            return cursor.rowcount > 0

    def delete_all_analyses(self, *, owner_id: str | None = None) -> int:
        with self._connect() as conn:
            if owner_id is None:
                cursor = conn.execute("DELETE FROM analyses")
            else:
                cursor = conn.execute(
                    "DELETE FROM analyses WHERE owner_id = %s", (_require_owner_id(owner_id),)
                )
            return max(0, cursor.rowcount)

    def mark_exported(
        self, request_id: str, export_type: str, *, owner_id: str | None = None
    ) -> bool:
        if export_type not in {"html", "pdf"}:
            return False
        column = "exported_html_at" if export_type == "html" else "exported_pdf_at"
        now = utc_now_iso()
        with self._connect() as conn:
            if owner_id is None:
                cursor = conn.execute(
                    f"UPDATE analyses SET {column} = %s, updated_at = %s WHERE request_id = %s",
                    (now, now, request_id),
                )
            else:
                cursor = conn.execute(
                    f"UPDATE analyses SET {column} = %s, updated_at = %s "
                    "WHERE request_id = %s AND owner_id = %s",
                    (now, now, request_id, _require_owner_id(owner_id)),
                )
            return cursor.rowcount > 0

    def _fetch_record(
        self,
        column: str,
        value: str,
        *,
        owner_id: str | None = None,
    ) -> dict[str, Any] | None:
        if column not in {"request_id", "job_id"}:
            raise ValueError(f"Unsupported lookup column: {column}")

        owner_filter = "AND owner_id = %s" if owner_id is not None else ""
        params: tuple[Any, ...] = (
            (value, _require_owner_id(owner_id)) if owner_id is not None else (value,)
        )
        with self._connect() as conn:
            return conn.execute(
                f"""
                SELECT
                    request_id, owner_id, job_id, ticker, market, trade_date,
                    time_horizon_months, analysis_depth, response_detail,
                    decision, recommendation, current_price, entry_price,
                    stop_loss, take_profit, rr_ratio, source_summary,
                    status, result_json, request_json, created_at, updated_at,
                    exported_html_at, exported_pdf_at
                FROM analyses
                WHERE {column} = %s {owner_filter}
                """,
                params,
            ).fetchone()

    def _evict_old_rows(self, conn: psycopg.Connection) -> None:
        rows = conn.execute(
            "SELECT request_id FROM analyses ORDER BY created_at DESC, request_id DESC OFFSET %s",
            (self.max_rows,),
        ).fetchall()
        if rows:
            conn.cursor().executemany(
                "DELETE FROM analyses WHERE request_id = %s",
                [(row["request_id"],) for row in rows],
            )
