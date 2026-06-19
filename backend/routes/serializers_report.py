from __future__ import annotations

# ruff: noqa: F401, F821
import logging
import re
from dataclasses import asdict, is_dataclass
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import ValidationError

from analysis_cache import AnalysisCacheKey
from config import ANALYSIS_MODE, DEFAULT_ANALYSIS_DEPTH, llm
from routes.event_contract import PipelineAgent
from routes.validation import AnalysisRequest
from services.report_disclaimer import REPORT_DISCLAIMER

logger = logging.getLogger(__name__)

ACTIONABLE_DECISIONS = {"Buy", "Sell"}
FIXED_RR = 3.0
RISK_REWARD_DISPLAY = "1:3"


def cache_key(req: AnalysisRequest) -> AnalysisCacheKey:
    return AnalysisCacheKey(
        ticker=req.ticker,
        trade_date=req.trade_date,
        provider=llm.provider,
        quick_model=llm.quick_think_llm,
        deep_model=llm.deep_think_llm,
        analysis_mode=ANALYSIS_MODE,
        analysis_depth=req.analysis_depth,
        time_horizon_months=req.time_horizon_months,
        max_debate_rounds=req.max_debate_rounds,
        response_detail=req.response_detail,
        has_existing_position=bool(req.has_existing_position)
        if req.has_existing_position is not None
        else False,
        position_quantity=req.position_quantity,
        average_entry_price=req.average_entry_price,
    )


def with_data_fetched_at(result_fields: dict[str, Any]) -> dict[str, Any]:
    stamped = dict(result_fields)
    stamped.setdefault("data_fetched_at", _utc_now_iso())
    return stamped


def request_warnings(req: AnalysisRequest) -> list[str]:
    if req.analysis_depth == "fast" and req.max_debate_rounds > 1:
        return [
            (
                "analysis_depth=fast skips the bull/bear and risk debate stages, so "
                + "max_debate_rounds greater than 1 is ignored."
            ),
        ]
    return []


def _dataclass_payload(value: Any) -> dict[str, Any] | None:
    if is_dataclass(value):
        return asdict(value)
    if isinstance(value, dict):
        return value
    return None


def _data_lineage_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    existing = payload.get("data_lineage")
    if isinstance(existing, dict):
        return existing
    try:
        from tradingagents.dataflows.quality.lineage_builder import build_data_lineage

        lineage = build_data_lineage(payload)
        return _dataclass_payload(lineage)
    except Exception:
        logger.exception("Failed to build data_lineage response contract")
        return None


def _record_observability_metrics(payload: dict[str, Any]) -> bool:
    try:
        from tradingagents.observability.metrics_collector import get_metrics_collector

        collector = get_metrics_collector()
        vendor_attempts = (
            payload.get("vendor_attempts")
            if isinstance(payload.get("vendor_attempts"), dict)
            else {}
        )
        for data_type, attempts in vendor_attempts.items():
            if not isinstance(attempts, list):
                continue
            previous_failed_vendor = None
            for attempt in attempts:
                if not isinstance(attempt, dict):
                    continue
                vendor = str(attempt.get("vendor") or "unknown")
                status = str(attempt.get("status") or "unknown")
                latency_ms = attempt.get("duration_ms")
                collector.record_vendor_call(
                    vendor,
                    status,
                    int(latency_ms) if isinstance(latency_ms, int | float) else None,
                    str(data_type),
                )
                if status in {"empty", "failed", "fail", "rate_limited", "skipped"}:
                    previous_failed_vendor = vendor
                elif previous_failed_vendor and status in {"success", "cache_hit", "fallback"}:
                    collector.record_fallback(previous_failed_vendor, vendor, str(data_type))
                    previous_failed_vendor = None

        vendor_budget = (
            payload.get("vendor_budget") if isinstance(payload.get("vendor_budget"), dict) else {}
        )
        llm_calls = (
            vendor_budget.get("llm_calls")
            if isinstance(vendor_budget.get("llm_calls"), dict)
            else {}
        )
        for agent_name, usage in (llm_calls.get("agents") or {}).items():
            if not isinstance(usage, dict):
                continue
            used = int(usage.get("used") or 0)
            model_type = (
                "deep"
                if str(agent_name)
                in {
                    "Bull Researcher",
                    "Bear Researcher",
                    "Research Manager",
                    "Risk Committee",
                    "Portfolio Manager",
                }
                else "quick"
            )
            for _ in range(max(0, min(used, 20))):
                collector.record_llm_call(model_type, True, None)
        if payload.get("budget_exhausted"):
            collector.record_llm_call("budget_exceeded", False, None)
        if payload.get("is_partial"):
            collector.record_partial_result(str(payload.get("partial_reason") or "partial_result"))
        for warning in payload.get("warnings") or []:
            collector.record_warning(str(warning)[:80])
        return True
    except Exception:
        logger.exception("Failed to record observability metrics")
        return False


def response_payload(request_id: str, req: AnalysisRequest, result_fields: dict) -> dict:
    input_ticker = req.input_ticker or req.ticker
    normalized_ticker = req.ticker
    exchange = (
        "IDX"
        if str(normalized_ticker).upper().endswith(".JK") or req.market == "ID"
        else "US"
        if req.market == "US"
        else None
    )
    currency = (
        "IDR"
        if exchange == "IDX"
        else "USD"
        if exchange == "US"
        else result_fields.get("price_currency")
    )

    analysis_params = {
        "ticker": input_ticker,
        "normalized_ticker": normalized_ticker,
        "market": req.market,
        "horizon": f"{req.time_horizon_months}M",
        "trade_date": req.trade_date,
        "debate_rounds": req.max_debate_rounds,
        "max_debate_rounds": req.max_debate_rounds,
        "analysis_depth": req.analysis_depth,
        "response_detail": req.response_detail,
        "has_existing_position": bool(req.has_existing_position)
        if req.has_existing_position is not None
        else False,
        "position_quantity": req.position_quantity,
        "average_entry_price": req.average_entry_price,
    }

    payload = {
        "request_id": request_id,
        "input_ticker": input_ticker,
        "normalized_ticker": normalized_ticker,
        "exchange": exchange,
        "currency": currency,
        "ticker": normalized_ticker,
        "market": req.market,
        "trade_date": req.trade_date,
        "analysis_created_at": _utc_now_iso(),
        "analysis_depth": req.analysis_depth,
        "response_detail": req.response_detail,
        "has_existing_position": bool(req.has_existing_position)
        if req.has_existing_position is not None
        else False,
        "position_quantity": req.position_quantity,
        "average_entry_price": req.average_entry_price,
        "analysis_params": analysis_params,
        "agents_used": [agent[1] for agent in AGENT_SEQUENCE],
        **result_fields,
        "disclaimer": REPORT_DISCLAIMER,
        "time_horizon_months": req.time_horizon_months,
    }
    warnings = request_warnings(req)
    if warnings:
        payload["warnings"] = list(dict.fromkeys([*(payload.get("warnings") or []), *warnings]))
    return _attach_sprint5_fields(payload, req)


def log_request_accepted(mode: str, request_id: str, req: AnalysisRequest) -> None:
    logger.info(
        "Analysis %s accepted",
        mode,
        extra={
            "event": f"analysis_{mode}_accepted",
            "request_id": request_id,
            "ticker": req.ticker,
            "trade_date": req.trade_date,
            "time_horizon_months": req.time_horizon_months,
            "max_debate_rounds": req.max_debate_rounds,
            "analysis_depth": req.analysis_depth,
            "response_detail": req.response_detail,
        },
    )
