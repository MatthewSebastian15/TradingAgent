from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from analysis_cache import AnalysisCacheKey
from config import ANALYSIS_MODE, DEFAULT_ANALYSIS_DEPTH, llm
from routes.validation import AnalysisRequest

logger = logging.getLogger(__name__)

ACTIONABLE_DECISIONS = {"Buy", "Sell"}
FIXED_RR = 3.0
RISK_REWARD_DISPLAY = "1:3"

SUMMARY_FIELDS = {
    "decision",
    "llm_decision",
    "final_decision",
    "decision_adjusted",
    "decision_adjusted_reason",
    "trade_plan_valid",
    "has_existing_position",
    "position_quantity",
    "average_entry_price",
    "position_action",
    "new_entry_action",
    "current_price",
    "current_price_as_of",
    "current_price_source",
    "executive_summary",
    "investment_thesis",
    "price_target",
    "time_horizon",
    "data_fetched_at",
    "confidence_score",
    "suggested_allocation_percent",
    "entry_price",
    "stop_loss",
    "take_profit",
    "risk_per_share",
    "reward_per_share",
    "risk_reward_ratio",
    "risk_reward_display",
    "max_drawdown_estimate",
    "max_drawdown_min_pct",
    "max_drawdown_max_pct",
    "volatility_level",
    "volatility_score",
    "rebalancing_action",
    "position_size_hint",
    "key_catalysts",
    "invalidation_conditions",
    "data_quality",
    "validation_warnings",
    "validation_warning_details",
    "analysis_created_at",
    "analysis_depth",
    "time_horizon_months",
    "llm_call_budget",
    "llm_calls_used",
    "budget_exhausted",
    "agents_skipped",
    "financial_highlights",
    "company_profile",
    "price_chart",
    "news",
    "news_context",
}

AGENT_SEQUENCE = [
    ("data_collection", "Data Collection", "Fetching market data..."),
    ("market_analyst", "Market Analyst", "Reading price data and technical indicators..."),
    ("news_analyst", "News + Social Analyst", "Scanning headlines, macro events, and sentiment signals..."),
    ("fundamentals", "Fundamentals Analyst", "Reviewing financial statements and ratios..."),
    ("bull_researcher", "Bull Researcher", "Building or skipping the bullish investment case..."),
    ("bear_researcher", "Bear Researcher", "Building or skipping the bearish counterarguments..."),
    ("research_manager", "Research Manager", "Evaluating the debate and forming an investment plan..."),
    ("trader", "Trader", "Translating the plan into a transaction proposal..."),
    ("risk_analysts", "Risk Analysts", "Running or skipping risk debate..."),
    ("portfolio_manager", "Portfolio Manager", "Synthesizing all inputs into the final decision..."),
]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def _get_current_price_fields(final_state: dict[str, Any], pd_obj: object | None = None) -> dict[str, Any]:
    current_price = final_state.get("last_close_price")
    if current_price is None and pd_obj is not None:
        current_price = getattr(pd_obj, "current_price", None)
    current_price_as_of = final_state.get("last_close_price_as_of")
    if current_price_as_of is None and pd_obj is not None:
        current_price_as_of = getattr(pd_obj, "current_price_as_of", None)
    current_price_as_of = current_price_as_of or final_state.get("trade_date")
    current_price_source = "yfinance:last_close" if current_price is not None else None
    if pd_obj is not None:
        current_price_source = getattr(pd_obj, "current_price_source", None) or current_price_source
    return {
        "current_price": current_price,
        "current_price_as_of": current_price_as_of,
        "current_price_source": current_price_source,
    }


def _coerce_data_quality(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        try:
            value = value.model_dump()
        except Exception:
            value = None
    return dict(value) if isinstance(value, dict) else {}


VALIDATION_WARNING_META: dict[str, dict[str, Any]] = {
    "HOLD_TRADE_LEVELS_HIDDEN": {"severity": "info", "message": "Trade levels are hidden because recommendation is Hold.", "blocking": False},
    "NEWS_PARTIAL": {"severity": "warning", "message": "Partial news coverage is available.", "blocking": False},
    "NEWS_UNAVAILABLE": {"severity": "warning", "message": "No usable news was returned; analysis continues without blocking trade validation.", "blocking": False},
    "DATA_SOURCE_WARNING": {"severity": "warning", "message": "Some optional market data is unavailable. Analysis continues.", "blocking": False},
    "OHLCV_FALLBACK_USED": {"severity": "warning", "message": "Exact OHLCV date was not found; latest available trading day is used.", "blocking": False},
    "CURRENT_PRICE_MISSING": {"severity": "error", "message": "Current price missing.", "blocking": True},
    "PRICE_MISSING": {"severity": "error", "message": "Required price data is missing.", "blocking": True},
    "OHLCV_MISSING": {"severity": "error", "message": "No OHLCV row is available on or before the trade date.", "blocking": True},
    "TRADE_LEVELS_INVALID": {"severity": "error", "message": "Trade levels are invalid for the current recommendation.", "blocking": True},
    "TRADE_PLAN_INVALID": {"severity": "error", "message": "Trade plan invalid.", "blocking": True},
    "DECISION_DOWNGRADED_TO_HOLD": {"severity": "warning", "message": "Decision downgraded to Hold.", "blocking": False},
    "INVALID_REBALANCING_FIXED": {"severity": "warning", "message": "Invalid rebalancing action fixed.", "blocking": False},
}


def _warning_detail(code: str, message: str | None = None) -> dict[str, Any]:
    meta = VALIDATION_WARNING_META.get(code, {})
    return {
        "code": code,
        "severity": meta.get("severity", "warning"),
        "message": message or meta.get("message") or code.replace("_", " ").title(),
        "blocking": bool(meta.get("blocking", False)),
    }


def _validation_warning_details(warnings: Any) -> list[dict[str, Any]]:
    if not isinstance(warnings, list):
        return []
    details: list[dict[str, Any]] = []
    seen: set[str] = set()
    for warning in warnings:
        if isinstance(warning, dict):
            code = str(warning.get("code") or "WARNING").strip()
            if not code or code in seen:
                continue
            seen.add(code)
            details.append({
                "code": code,
                "severity": str(warning.get("severity") or VALIDATION_WARNING_META.get(code, {}).get("severity") or "warning"),
                "message": str(warning.get("message") or VALIDATION_WARNING_META.get(code, {}).get("message") or code),
                "blocking": bool(warning.get("blocking", VALIDATION_WARNING_META.get(code, {}).get("blocking", False))),
            })
            continue
        code = str(warning).strip()
        if not code or code in seen:
            continue
        seen.add(code)
        details.append(_warning_detail(code))
    return details


def _clean_data_source_message(message: str) -> str:
    lowered = str(message or "").lower()

    if "request budget exceeded" in lowered:
        return "Some optional market data was skipped because the request budget was reached. Analysis continues."

    if "invalid ticker format" in lowered and "alpha vantage" in lowered:
        return "Alpha Vantage does not support this ticker format for the requested optional data. Analysis continues."

    if "finnhub" in lowered and ("auth" in lowered or "plan" in lowered or "api key" in lowered):
        return "Finnhub optional data is unavailable for the current API key or plan. Analysis continues."

    if "finnhub enrichment disabled" in lowered:
        return "Some optional Finnhub enrichment was skipped. Analysis continues."

    if "no usable news" in lowered or "news_unavailable" in lowered or "no news found" in lowered:
        return "No usable news was returned for this ticker. Analysis continues without blocking trade validation."

    if "optional data unavailable" in lowered:
        return "Some optional vendor enrichment was skipped. Analysis continues."

    return str(message or "Data source warning")


def _data_quality_warning_detail_from_message(message: str) -> dict[str, Any]:
    message = _clean_data_source_message(message)
    lowered = message.lower()
    if "ohlcv_fallback_used" in lowered or "exact ohlcv date" in lowered:
        return _warning_detail("OHLCV_FALLBACK_USED", message)
    if "ohlcv_missing" in lowered or ("ohlcv" in lowered and "no available" in lowered):
        return _warning_detail("OHLCV_MISSING", message)
    if "news_partial" in lowered or "partial news" in lowered:
        return _warning_detail("NEWS_PARTIAL", message)
    if "news_unavailable" in lowered or "no usable" in lowered or "no news" in lowered:
        return _warning_detail("NEWS_UNAVAILABLE", message)
    if "price" in lowered and ("missing" in lowered or "unavailable" in lowered):
        return _warning_detail("PRICE_MISSING", message)
    return {"code": "DATA_SOURCE_WARNING", "severity": "warning", "message": message, "blocking": False}


def _complete_data_quality_warning_details(merged: dict[str, Any]) -> None:
    details: list[dict[str, Any]] = []
    existing = merged.get("warning_details")
    if isinstance(existing, list):
        for item in existing:
            if isinstance(item, dict):
                code = str(item.get("code") or "DATA_SOURCE_WARNING")
                message = _clean_data_source_message(str(item.get("message") or VALIDATION_WARNING_META.get(code, {}).get("message") or code))
                details.append({
                    "code": code,
                    "severity": str(item.get("severity") or VALIDATION_WARNING_META.get(code, {}).get("severity") or "warning"),
                    "message": message,
                    "blocking": bool(item.get("blocking", VALIDATION_WARNING_META.get(code, {}).get("blocking", False))),
                })
            elif item:
                details.append(_data_quality_warning_detail_from_message(str(item)))
    for message in merged.get("warnings") or []:
        if message:
            details.append(_data_quality_warning_detail_from_message(str(message)))
    if merged.get("price_data") in {"missing", "invalid_ticker"}:
        details.append(_warning_detail("PRICE_MISSING"))
    elif merged.get("price_data") == "market_closed":
        details.append(_warning_detail("OHLCV_FALLBACK_USED"))
    if merged.get("trade_levels") == "invalid":
        details.append(_warning_detail("TRADE_LEVELS_INVALID"))
    elif merged.get("trade_levels") == "hidden":
        details.append(_warning_detail("HOLD_TRADE_LEVELS_HIDDEN"))
    if merged.get("news") == "partial":
        details.append(_warning_detail("NEWS_PARTIAL"))
    elif merged.get("news") in {"unavailable", "missing"}:
        details.append(_warning_detail("NEWS_UNAVAILABLE"))
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for item in details:
        key = f"{item.get('code')}::{item.get('message')}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    merged["warning_details"] = deduped[:20]


def _complete_risk_engine_data_quality(
    value: Any,
    *,
    current_price: Any,
    trade_plan_valid: bool,
    decision_adjusted: bool,
    volatility_score: Any = None,
    llm_output_fallback: str = "ok",
) -> dict[str, Any]:
    """Return data_quality with the risk-engine keys required by the API contract."""
    merged = _coerce_data_quality(value)
    if "price_data" not in merged:
        merged["price_data"] = "ok" if current_price is not None else "missing"
    if "trade_levels" not in merged:
        merged["trade_levels"] = "ok" if trade_plan_valid else "invalid"
    if "llm_output" not in merged:
        merged["llm_output"] = "downgraded" if decision_adjusted else llm_output_fallback
    if "volatility_data" not in merged:
        merged["volatility_data"] = "ok" if volatility_score is not None else "missing"
    _complete_data_quality_warning_details(merged)
    return merged


def _empty_trade_contract(final_state: dict[str, Any], pd_obj: object | None = None) -> dict[str, Any]:
    current_price_fields = _get_current_price_fields(final_state, pd_obj)
    return {
        "llm_decision": None,
        "final_decision": "Hold",
        "decision_adjusted": False,
        "decision_adjusted_reason": None,
        "trade_plan_valid": False,
        "has_existing_position": bool(getattr(pd_obj, "has_existing_position", False)) if pd_obj is not None else False,
        "position_quantity": getattr(pd_obj, "position_quantity", None) if pd_obj is not None else None,
        "average_entry_price": getattr(pd_obj, "average_entry_price", None) if pd_obj is not None else None,
        "position_action": getattr(pd_obj, "position_action", None) if pd_obj is not None else None,
        "new_entry_action": getattr(pd_obj, "new_entry_action", None) if pd_obj is not None else "Avoid new entry",
        **current_price_fields,
        "risk_per_share": None,
        "reward_per_share": None,
        "risk_reward_display": None,
        "max_drawdown_min_pct": None,
        "max_drawdown_max_pct": None,
        "volatility_score": None,
        "position_size_hint": "No new position suggested.",
        "validation_warnings": [],
        "validation_warning_details": [],
    }


def parse_final_result(
    full_decision: str,
    pd_obj: object | None,
    portfolio_rating: object | None = None,
    final_state: dict | None = None,
) -> dict:
    """Convert the final agent state into API response fields."""
    final_state = final_state or {}
    if pd_obj is not None:
        try:
            from tradingagents.agents.schemas import PortfolioDecision

            if isinstance(pd_obj, dict):
                pd_obj = PortfolioDecision.model_validate(pd_obj)
        except Exception:
            full_decision = full_decision or ""
            pd_obj = None
    data_quality = final_state.get("data_quality")
    current_price_fields_for_common = _get_current_price_fields(final_state, pd_obj)
    configured_time_horizon = final_state.get("time_horizon")
    common = {
        "analysis_depth": final_state.get("analysis_depth", DEFAULT_ANALYSIS_DEPTH),
        "time_horizon_months": final_state.get("time_horizon_months"),
        "data_fetched_at": final_state.get("data_fetched_at") or _utc_now_iso(),
        "llm_call_budget": final_state.get("balanced_gemini_request_budget"),
        "llm_calls_used": final_state.get("balanced_gemini_calls_used"),
        "budget_exhausted": bool(final_state.get("budget_exhausted", False)),
        "agents_skipped": final_state.get("agents_skipped", []) or [],
        "financial_highlights": final_state.get("financial_highlights"),
        "company_profile": final_state.get("company_profile") or {},
        "price_chart": final_state.get("price_chart") or {},
        "news": final_state.get("news") or final_state.get("news_context") or {},
        "news_context": final_state.get("news_context") or final_state.get("news") or {},
        "data_quality": _complete_risk_engine_data_quality(
            data_quality
            or {
                "fundamentals": "missing",
                "news": "missing",
                "warnings": ["Pipeline did not return data quality metadata."],
            },
            current_price=current_price_fields_for_common["current_price"],
            trade_plan_valid=False,
            decision_adjusted=False,
            volatility_score=None,
            llm_output_fallback="fallback",
        ),
    }

    if pd_obj is None:
        return {
            "decision": "Hold",
            "full_decision": full_decision,
            "executive_summary": None,
            "investment_thesis": None,
            "price_target": None,
            "time_horizon": configured_time_horizon,
            "confidence_score": None,
            "suggested_allocation_percent": None,
            "entry_price": None,
            "stop_loss": None,
            "take_profit": None,
            "risk_reward_ratio": None,
            "max_drawdown_estimate": None,
            "volatility_level": "Medium",
            "position_sizing_reason": None,
            "rebalancing_action": "Avoid new entry",
            "key_catalysts": [],
            "invalidation_conditions": [],
            **_empty_trade_contract(final_state),
            **common,
        }

    rating = getattr(pd_obj, "rating", None)
    fallback_rating = _enum_value(rating)
    final_decision = getattr(pd_obj, "final_decision", None) or getattr(pd_obj, "decision", None) or fallback_rating
    current_price_fields = _get_current_price_fields(final_state, pd_obj)
    pd_data_quality = _complete_risk_engine_data_quality(
        getattr(pd_obj, "data_quality", None) or common["data_quality"],
        current_price=current_price_fields["current_price"],
        trade_plan_valid=bool(getattr(pd_obj, "trade_plan_valid", False)),
        decision_adjusted=bool(getattr(pd_obj, "decision_adjusted", False)),
        volatility_score=getattr(pd_obj, "volatility_score", None),
        llm_output_fallback="ok",
    )

    trade_plan_valid = bool(getattr(pd_obj, "trade_plan_valid", False))
    has_valid_actionable_trade = trade_plan_valid and final_decision in ACTIONABLE_DECISIONS
    risk_reward_ratio = FIXED_RR if has_valid_actionable_trade else getattr(pd_obj, "risk_reward_ratio", None)
    risk_reward_display = (
        RISK_REWARD_DISPLAY if has_valid_actionable_trade else getattr(pd_obj, "risk_reward_display", None)
    )

    return {
        "decision": final_decision,
        "llm_decision": getattr(pd_obj, "llm_decision", None) or fallback_rating,
        "final_decision": final_decision,
        "decision_adjusted": bool(getattr(pd_obj, "decision_adjusted", False)),
        "decision_adjusted_reason": getattr(pd_obj, "decision_adjusted_reason", None),
        "trade_plan_valid": trade_plan_valid,
        "has_existing_position": bool(getattr(pd_obj, "has_existing_position", False)),
        "position_quantity": getattr(pd_obj, "position_quantity", None),
        "average_entry_price": getattr(pd_obj, "average_entry_price", None),
        "position_action": getattr(pd_obj, "position_action", None),
        "new_entry_action": getattr(pd_obj, "new_entry_action", None),
        **current_price_fields,
        "full_decision": full_decision,
        "executive_summary": getattr(pd_obj, "executive_summary", None),
        "investment_thesis": getattr(pd_obj, "investment_thesis", None),
        "price_target": getattr(pd_obj, "price_target", None),
        "time_horizon": configured_time_horizon or getattr(pd_obj, "time_horizon", None),
        "confidence_score": getattr(pd_obj, "confidence_score", None),
        "suggested_allocation_percent": getattr(pd_obj, "suggested_allocation_percent", None),
        "entry_price": getattr(pd_obj, "entry_price", None),
        "stop_loss": getattr(pd_obj, "stop_loss", None),
        "take_profit": getattr(pd_obj, "take_profit", None),
        "risk_per_share": getattr(pd_obj, "risk_per_share", None),
        "reward_per_share": getattr(pd_obj, "reward_per_share", None),
        "risk_reward_ratio": risk_reward_ratio,
        "risk_reward_display": risk_reward_display,
        "max_drawdown_estimate": getattr(pd_obj, "max_drawdown_estimate", None),
        "max_drawdown_min_pct": getattr(pd_obj, "max_drawdown_min_pct", None),
        "max_drawdown_max_pct": getattr(pd_obj, "max_drawdown_max_pct", None),
        "volatility_level": _enum_value(getattr(pd_obj, "volatility_level", None)),
        "volatility_score": getattr(pd_obj, "volatility_score", None),
        "position_sizing_reason": getattr(pd_obj, "position_sizing_reason", None),
        "rebalancing_action": _enum_value(getattr(pd_obj, "rebalancing_action", None)),
        "position_size_hint": getattr(pd_obj, "position_size_hint", None),
        "key_catalysts": getattr(pd_obj, "key_catalysts", []) or [],
        "invalidation_conditions": getattr(pd_obj, "invalidation_conditions", []) or [],
        "data_quality": pd_data_quality,
        "validation_warnings": getattr(pd_obj, "validation_warnings", []) or [],
        "validation_warning_details": _validation_warning_details(getattr(pd_obj, "validation_warnings", []) or []),
        **{key: value for key, value in common.items() if key != "data_quality"},
    }


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
        has_existing_position=bool(req.has_existing_position) if req.has_existing_position is not None else False,
        position_quantity=req.position_quantity,
        average_entry_price=req.average_entry_price,
    )


def shape_result(result_fields: dict[str, Any], response_detail: str) -> dict[str, Any]:
    """Trim response payload for summary mode; keep debug metadata only in debug."""
    if response_detail == "summary":
        return {key: value for key, value in result_fields.items() if key in SUMMARY_FIELDS or key == "cache"}
    if response_detail == "debug":
        return result_fields
    return {key: value for key, value in result_fields.items() if key not in {"raw_agent_state"}}


def with_data_fetched_at(result_fields: dict[str, Any]) -> dict[str, Any]:
    stamped = dict(result_fields)
    stamped.setdefault("data_fetched_at", _utc_now_iso())
    return stamped


def request_warnings(req: AnalysisRequest) -> list[str]:
    if req.analysis_depth == "fast" and req.max_debate_rounds > 1:
        return [
            "analysis_depth=fast skips the bull/bear and risk debate stages, so max_debate_rounds greater than 1 is ignored.",
        ]
    return []


def response_payload(request_id: str, req: AnalysisRequest, result_fields: dict) -> dict:
    payload = {
        "request_id": request_id,
        "ticker": req.ticker,
        "market": req.market,
        "trade_date": req.trade_date,
        "analysis_created_at": _utc_now_iso(),
        "analysis_depth": req.analysis_depth,
        "response_detail": req.response_detail,
        "has_existing_position": bool(req.has_existing_position) if req.has_existing_position is not None else False,
        "position_quantity": req.position_quantity,
        "average_entry_price": req.average_entry_price,
        "agents_used": [agent[1] for agent in AGENT_SEQUENCE],
        **result_fields,
        "time_horizon_months": req.time_horizon_months,
    }
    warnings = request_warnings(req)
    if warnings:
        payload["warnings"] = warnings
    return payload


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
