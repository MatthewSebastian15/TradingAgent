from __future__ import annotations

import logging
import time
from collections.abc import Callable
from datetime import datetime, timezone
from typing import TypeVar

from tradingagents.dataflows.data_quality import DataQualityReport
from tradingagents.pipeline_balanced_data import _check_cancel
from tradingagents.pipeline_balanced_types import AnalysisCancelledError, ProgressCallback

logger = logging.getLogger(__name__)

T = TypeVar("T")

AGENT_LABELS = {
    "data_collection": "Data Collection",
    "news_fetch": "News Providers",
    "data_quality": "Data Quality",
    "market_analyst": "Market Analyst",
    "news_analyst": "News + Social Analyst",
    "fundamentals": "Fundamentals Analyst",
    "bull_researcher": "Bull Researcher",
    "bear_researcher": "Bear Researcher",
    "research_manager": "Research Manager",
    "trader": "Trader",
    "risk_analysts": "Risk Analysts",
    "portfolio_manager": "Portfolio Manager",
}


def _emit_progress(callback: ProgressCallback | None, agent_id: str, status: str, message: str) -> None:
    if callback is None:
        return
    try:
        callback(
            {
                "agent_id": agent_id,
                "agent_name": AGENT_LABELS.get(agent_id, agent_id.replace("_", " ").title()),
                "status": status,
                "status_message": message,
                "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            }
        )
    except Exception as exc:
        logger.debug("Progress callback failed for %s: %s", agent_id, exc)


def _emit_data_quality(callback: ProgressCallback | None, report: DataQualityReport) -> None:
    if callback is None:
        return
    message = f"Data quality: price={report.price_data}, fundamentals={report.fundamentals}, news={report.news}."
    if report.warnings:
        message = f"{message} Warning: {report.warnings[0]}"
    try:
        callback(
            {
                "agent_id": "data_quality",
                "agent_name": AGENT_LABELS["data_quality"],
                "status": "completed",
                "status_message": message,
                "data_quality": report.model_dump(),
                "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            }
        )
    except Exception as exc:
        logger.debug("Progress callback failed for data_quality: %s", exc)


def _run_tracked(
    callback: ProgressCallback | None,
    agent_id: str,
    message: str,
    func: Callable[[], T],
    cancel_check=None,
    timings: dict[str, dict] | None = None,
) -> T:
    _check_cancel(cancel_check)
    _emit_progress(callback, agent_id, "started", message)
    start = time.perf_counter()
    try:
        result = func()
    except AnalysisCancelledError:
        if timings is not None:
            timings[agent_id] = {
                "name": AGENT_LABELS.get(agent_id, agent_id.replace("_", " ").title()),
                "status": "error",
                "duration_seconds": round(time.perf_counter() - start, 1),
                "warning": "Agent was cancelled before completion.",
            }
        _emit_progress(callback, agent_id, "failed", f"{AGENT_LABELS.get(agent_id, agent_id)} cancelled.")
        raise
    except Exception:
        if timings is not None:
            timings[agent_id] = {
                "name": AGENT_LABELS.get(agent_id, agent_id.replace("_", " ").title()),
                "status": "error",
                "duration_seconds": round(time.perf_counter() - start, 1),
                "warning": f"{AGENT_LABELS.get(agent_id, agent_id)} failed.",
            }
        _emit_progress(callback, agent_id, "failed", f"{AGENT_LABELS.get(agent_id, agent_id)} failed.")
        raise
    _check_cancel(cancel_check)
    if timings is not None:
        timings[agent_id] = {
            "name": AGENT_LABELS.get(agent_id, agent_id.replace("_", " ").title()),
            "status": "ok",
            "duration_seconds": round(time.perf_counter() - start, 1),
            "warning": None,
        }
    _emit_progress(callback, agent_id, "completed", f"{AGENT_LABELS.get(agent_id, agent_id)} completed.")
    return result
