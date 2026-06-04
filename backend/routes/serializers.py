from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from zoneinfo import ZoneInfo
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
    "last_price",
    "price_currency",
    "price_source",
    "price_timestamp",
    "price_is_fallback",
    "market_status",
    "raw_ai_signal",
    "display_signal",
    "signal_context",
    "confidence_label",
    "confidence_tier",
    "volatility_scale",
    "volatility_method",
    "volatility_lookback_days",
    "volatility_classification",
    "mini_risk_summary",
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
    "key_reasons",
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
    "financial_trends",
    "valuation_multiples",
    "fair_value_range",
    "scenario_analysis",
    "quality_of_earnings",
    "balance_sheet_risk",
    "dividend_quality",
    "peer_comparison",
    "company_profile",
    "price_chart",
    "price_performance",
    "technical_entry",
    "related_news",
    "news_impact",
    "catalyst_tracker",
    "analyst_consensus",
    "news",
    "news_context",
    "analysis_overview",
    "risk_data_quality",
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
    return datetime.now(UTC).isoformat()


def _enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def _parse_datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            return datetime.fromisoformat(text[:10])
        except ValueError:
            return None


def get_market_status(timestamp: datetime) -> str:
    """Return IDX market status for a timestamp using WIB trading hours."""
    wib = ZoneInfo("Asia/Jakarta")
    dt = timestamp.astimezone(wib) if timestamp.tzinfo is not None else timestamp.replace(tzinfo=wib)

    if dt.weekday() >= 5:
        return "closed"

    time_val = dt.hour * 100 + dt.minute
    return "open" if 900 <= time_val <= 1549 else "closed"


def _market_status_from_value(value: Any) -> str | None:
    parsed = _parse_datetime(value)
    if parsed is None:
        return None
    return get_market_status(parsed)


def _get_current_price_fields(final_state: dict[str, Any], pd_obj: object | None = None) -> dict[str, Any]:
    current_price = final_state.get("last_price", final_state.get("last_close_price"))
    if current_price is None and pd_obj is not None:
        current_price = getattr(pd_obj, "current_price", None)

    price_timestamp = final_state.get("price_timestamp")
    current_price_as_of = price_timestamp or final_state.get("last_close_price_as_of")
    if current_price_as_of is None and pd_obj is not None:
        current_price_as_of = getattr(pd_obj, "current_price_as_of", None)
    current_price_as_of = current_price_as_of or final_state.get("trade_date")

    current_price_source = final_state.get("price_source") or final_state.get("last_close_price_source")
    if current_price_source is None and current_price is not None:
        current_price_source = "yfinance:last_close"
    if pd_obj is not None:
        current_price_source = getattr(pd_obj, "current_price_source", None) or current_price_source

    price_is_fallback = bool(final_state.get("price_is_fallback", False))
    price_currency = final_state.get("price_currency")
    market_status = final_state.get("market_status") or _market_status_from_value(current_price_as_of)

    return {
        "current_price": current_price,
        "current_price_as_of": current_price_as_of,
        "current_price_source": current_price_source,
        "last_price": current_price,
        "price_currency": price_currency,
        "price_source": final_state.get("price_source") or current_price_source,
        "price_timestamp": price_timestamp or current_price_as_of,
        "price_is_fallback": price_is_fallback,
        "market_status": market_status,
    }

def _coerce_data_quality(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        try:
            value = value.model_dump()
        except Exception:
            value = None
    return dict(value) if isinstance(value, dict) else {}


VALIDATION_WARNING_META: dict[str, dict[str, Any]] = {
    "HOLD_TRADE_LEVELS_HIDDEN": {
        "severity": "info",
        "message": "Trade levels are hidden because recommendation is Hold.",
        "blocking": False,
    },
    "NEWS_PARTIAL": {"severity": "warning", "message": "Partial news coverage is available.", "blocking": False},
    "NEWS_UNAVAILABLE": {
        "severity": "warning",
        "message": "No usable news was returned; analysis continues without blocking trade validation.",
        "blocking": False,
    },
    "DATA_SOURCE_WARNING": {
        "severity": "warning",
        "message": "Some optional market data is unavailable. Analysis continues.",
        "blocking": False,
    },
    "OHLCV_FALLBACK_USED": {
        "severity": "warning",
        "message": "Exact OHLCV date was not found; latest available trading day is used.",
        "blocking": False,
    },
    "CURRENT_PRICE_MISSING": {"severity": "error", "message": "Current price missing.", "blocking": True},
    "PRICE_MISSING": {"severity": "error", "message": "Required price data is missing.", "blocking": True},
    "OHLCV_MISSING": {
        "severity": "error",
        "message": "No OHLCV row is available on or before the trade date.",
        "blocking": True,
    },
    "TRADE_LEVELS_INVALID": {
        "severity": "error",
        "message": "Trade levels are invalid for the current recommendation.",
        "blocking": True,
    },
    "TRADE_PLAN_INVALID": {"severity": "error", "message": "Trade plan invalid.", "blocking": True},
    "DECISION_DOWNGRADED_TO_HOLD": {
        "severity": "warning",
        "message": "Decision downgraded to Hold.",
        "blocking": False,
    },
    "INVALID_REBALANCING_FIXED": {
        "severity": "warning",
        "message": "Invalid rebalancing action fixed.",
        "blocking": False,
    },
    "POSITION_FLAG_CONFLICT_FIXED": {
        "severity": "warning",
        "message": "Existing position flag was corrected from position quantity.",
        "blocking": False,
    },
    "POSITION_QUANTITY_INVALID": {
        "severity": "warning",
        "message": "Position quantity is invalid for a long-only portfolio.",
        "blocking": False,
    },
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
            details.append(
                {
                    "code": code,
                    "severity": str(
                        warning.get("severity") or VALIDATION_WARNING_META.get(code, {}).get("severity") or "warning"
                    ),
                    "message": str(
                        warning.get("message") or VALIDATION_WARNING_META.get(code, {}).get("message") or code
                    ),
                    "blocking": bool(
                        warning.get("blocking", VALIDATION_WARNING_META.get(code, {}).get("blocking", False))
                    ),
                }
            )
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
                message = _clean_data_source_message(
                    str(item.get("message") or VALIDATION_WARNING_META.get(code, {}).get("message") or code)
                )
                details.append(
                    {
                        "code": code,
                        "severity": str(
                            item.get("severity") or VALIDATION_WARNING_META.get(code, {}).get("severity") or "warning"
                        ),
                        "message": message,
                        "blocking": bool(
                            item.get("blocking", VALIDATION_WARNING_META.get(code, {}).get("blocking", False))
                        ),
                    }
                )
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



def _confidence_score_percent(value: Any) -> float | None:
    try:
        score = float(value)
    except (TypeError, ValueError):
        return None
    if score != score:
        return None
    return score * 100 if 0 <= score <= 1 else score


def get_confidence_label(score: int | float | None) -> dict[str, str | None]:
    score_pct = _confidence_score_percent(score)
    if score_pct is None:
        return {"label": None, "tier": None}
    if score_pct < 50:
        return {"label": "Very Low Conviction", "tier": "very_low"}
    if score_pct < 65:
        return {"label": "Low Conviction", "tier": "low"}
    if score_pct < 75:
        return {"label": "Moderate Conviction", "tier": "moderate"}
    if score_pct < 85:
        return {"label": "High Conviction", "tier": "high"}
    return {"label": "Very High Conviction", "tier": "very_high"}


def _normalize_raw_signal(raw_ai_signal: str | None) -> str:
    signal = str(raw_ai_signal or "HOLD").strip().upper()
    if signal in {"BUY", "OVERWEIGHT", "ACCUMULATE", "ADD"}:
        return "BUY"
    if signal in {"SELL", "UNDERWEIGHT", "AVOID", "EXIT"}:
        return "SELL"
    if signal in {"HOLD", "NEUTRAL", "WAIT"}:
        return "HOLD"
    return signal or "HOLD"


def resolve_display_signal(raw_ai_signal: str, has_existing_position: bool) -> str:
    """Convert the raw AI recommendation into the user-position-aware signal."""
    signal = _normalize_raw_signal(raw_ai_signal)

    if not has_existing_position:
        return "BUY" if signal == "BUY" else "WAIT"

    if signal == "BUY":
        return "HOLD"
    if signal == "HOLD":
        return "HOLD"
    if signal in {"SELL", "AVOID"}:
        return "SELL"
    return "REDUCE"


def _signal_context(raw_signal: str, display_signal: str, has_existing_position: bool) -> str:
    position_text = "User has an existing position" if has_existing_position else "User has no existing position"
    return f"{position_text}. AI signal {raw_signal} translated to {display_signal}."


def sanitize_text(text: str | None) -> str | None:
    """Normalize AI text capitalization and simple label-prefix formatting."""
    if text is None:
        return text
    cleaned = re.sub(r"[ \t]+", " ", str(text).strip())
    cleaned = re.sub(r"\n{2,}", "\n", cleaned)
    if not cleaned:
        return cleaned

    def normalize_label(match: re.Match[str]) -> str:
        label = match.group(1).strip()
        words = [word if word.isupper() else word.capitalize() for word in label.split()]
        return f"{' '.join(words)}. "

    cleaned = re.sub(r"^([a-zA-Z][a-zA-Z ]{1,40}):\s*", normalize_label, cleaned)
    cleaned = re.sub(
        r"(^|(?<=[.!?])\s+)([a-z])",
        lambda match: match.group(1) + match.group(2).upper(),
        cleaned,
    )
    return cleaned.strip()


def _sanitize_text_list(value: Any) -> list[Any]:
    if not isinstance(value, list):
        return []
    return [sanitize_text(item) if isinstance(item, str) else item for item in value]


def _volatility_classification(score: Any) -> str | None:
    try:
        numeric = float(score)
    except (TypeError, ValueError):
        return None
    if numeric != numeric:
        return None
    if numeric < 20:
        return "Very Low"
    if numeric < 40:
        return "Low"
    if numeric < 60:
        return "Moderate"
    if numeric < 80:
        return "High"
    return "Very High"


def _attach_phase1_fields(payload: dict[str, Any], final_state: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(payload)

    text_fields = [
        "executive_summary",
        "investment_thesis",
        "decision_adjusted_reason",
        "position_sizing_reason",
        "rebalancing_action",
        "position_action",
        "new_entry_action",
        "position_size_hint",
    ]
    for field in text_fields:
        if field in enriched and isinstance(enriched[field], str):
            enriched[field] = sanitize_text(enriched[field])

    for field in ["key_reasons", "key_catalysts", "invalidation_conditions"]:
        if field in enriched:
            enriched[field] = _sanitize_text_list(enriched[field])

    has_position = bool(enriched.get("has_existing_position", False))
    raw_signal = _normalize_raw_signal(enriched.get("final_decision") or enriched.get("decision") or enriched.get("llm_decision"))
    display_signal = resolve_display_signal(raw_signal, has_position)
    enriched["raw_ai_signal"] = raw_signal
    enriched["display_signal"] = display_signal
    enriched["signal_context"] = _signal_context(raw_signal, display_signal, has_position)

    confidence = get_confidence_label(enriched.get("confidence_score"))
    enriched["confidence_label"] = confidence["label"]
    enriched["confidence_tier"] = confidence["tier"]

    volatility_metadata = final_state.get("volatility_metadata") if isinstance(final_state, dict) else None
    volatility_metadata = volatility_metadata if isinstance(volatility_metadata, dict) else {}
    volatility_score = enriched.get("volatility_score")
    enriched["volatility_scale"] = volatility_metadata.get("volatility_scale") or "0–100"
    enriched["volatility_method"] = volatility_metadata.get("volatility_method") or (
        "Annualized standard deviation of daily returns, normalized to 0–100"
    )
    enriched["volatility_lookback_days"] = volatility_metadata.get("volatility_lookback_days") or 20
    enriched["volatility_classification"] = (
        volatility_metadata.get("volatility_classification") or _volatility_classification(volatility_score)
    )

    risk_reason = (
        enriched.get("decision_adjusted_reason")
        or enriched.get("position_sizing_reason")
        or f"Volatility level is {enriched.get('volatility_level') or 'N/A'}."
    )
    risk_label = enriched.get("volatility_classification") or enriched.get("volatility_level") or "N/A"
    enriched["mini_risk_summary"] = sanitize_text(f"{risk_label}: {risk_reason}")

    return enriched

def _confidence_label(value: Any) -> str:
    score = _confidence_score_percent(value)
    if score is None:
        return "Low"
    if score >= 75:
        return "High"
    if score >= 50:
        return "Medium"
    return "Low"


def _analysis_overview(payload: dict[str, Any]) -> dict[str, Any]:
    key_reasons = payload.get("key_reasons") or payload.get("key_catalysts") or []
    volatility = payload.get("volatility_level") or "N/A"
    risk_reason = (
        payload.get("decision_adjusted_reason")
        or payload.get("position_sizing_reason")
        or f"Volatility level is {volatility}."
    )
    return {
        "recommendation": payload.get("final_decision") or payload.get("decision") or "Hold",
        "confidence": _confidence_label(payload.get("confidence_score")),
        "executive_summary": payload.get("executive_summary"),
        "investment_thesis": payload.get("investment_thesis"),
        "key_reasons": list(key_reasons) if isinstance(key_reasons, list) else [],
        "action_plan": {
            "current_price": payload.get("current_price"),
            "entry": payload.get("entry_price"),
            "stop_loss": payload.get("stop_loss"),
            "take_profit": payload.get("take_profit"),
            "max_drawdown": payload.get("max_drawdown_estimate"),
            "volatility": payload.get("volatility_level"),
            "position_action": payload.get("position_action") or payload.get("new_entry_action"),
            "position_size_hint": payload.get("position_size_hint"),
            "risk_reward_ratio": payload.get("risk_reward_ratio"),
            "risk_reward_display": payload.get("risk_reward_display"),
        },
        "risk_summary": {
            "overall_risk": str(volatility).lower(),
            "short_reason": sanitize_text(risk_reason) or "N/A",
        },
    }


def _with_analysis_overview(payload: dict[str, Any]) -> dict[str, Any]:
    return {**payload, "analysis_overview": _analysis_overview(payload)}


def _with_analysis_overview_and_risk_data_quality(
    payload: dict[str, Any],
    final_state: dict[str, Any],
) -> dict[str, Any]:
    payload = _attach_phase1_fields(payload, final_state)
    enriched = _with_analysis_overview(payload)
    try:
        from tradingagents.risk import build_risk_data_quality  # noqa: PLC0415

        enriched["risk_data_quality"] = build_risk_data_quality(enriched, final_state)
    except Exception:
        logger.exception("Failed to build risk_data_quality response contract")
        enriched["risk_data_quality"] = {}
    return enriched


def _empty_trade_contract(final_state: dict[str, Any], pd_obj: object | None = None) -> dict[str, Any]:
    current_price_fields = _get_current_price_fields(final_state, pd_obj)
    has_pos = bool(getattr(pd_obj, "has_existing_position", False)) if pd_obj is not None else False
    position_action = getattr(pd_obj, "position_action", None) if pd_obj is not None else None
    if not has_pos:
        position_action = None
    new_entry_action = getattr(pd_obj, "new_entry_action", None) if pd_obj is not None else None
    if not new_entry_action:
        new_entry_action = "No new entry; maintain existing position" if has_pos else "No new entry"
    position_size_hint = getattr(pd_obj, "position_size_hint", None) if pd_obj is not None else None
    if not position_size_hint:
        position_size_hint = (
            "Maintain current position size; no additional exposure suggested."
            if has_pos
            else "No new position suggested."
        )
    return {
        "llm_decision": None,
        "final_decision": "Hold",
        "decision_adjusted": False,
        "decision_adjusted_reason": None,
        "trade_plan_valid": False,
        "has_existing_position": has_pos,
        "position_quantity": getattr(pd_obj, "position_quantity", None) if pd_obj is not None else None,
        "average_entry_price": getattr(pd_obj, "average_entry_price", None) if pd_obj is not None else None,
        "position_action": position_action,
        "new_entry_action": new_entry_action,
        **current_price_fields,
        "risk_per_share": None,
        "reward_per_share": None,
        "risk_reward_display": None,
        "max_drawdown_min_pct": None,
        "max_drawdown_max_pct": None,
        "volatility_score": None,
        "position_size_hint": position_size_hint,
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
        "financial_trends": final_state.get("financial_trends"),
        "valuation_multiples": final_state.get("valuation_multiples"),
        "fair_value_range": final_state.get("fair_value_range"),
        "scenario_analysis": final_state.get("scenario_analysis"),
        "quality_of_earnings": final_state.get("quality_of_earnings"),
        "balance_sheet_risk": final_state.get("balance_sheet_risk"),
        "dividend_quality": final_state.get("dividend_quality"),
        "peer_comparison": final_state.get("peer_comparison"),
        "company_profile": final_state.get("company_profile") or {},
        "price_chart": final_state.get("price_chart") or {},
        "price_performance": final_state.get("price_performance") or {},
        "technical_entry": final_state.get("technical_entry") or {},
        "related_news": final_state.get("related_news") or {},
        "news_impact": final_state.get("news_impact") or {},
        "catalyst_tracker": final_state.get("catalyst_tracker") or {},
        "analyst_consensus": final_state.get("analyst_consensus") or {},
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
        return _with_analysis_overview_and_risk_data_quality(
            {
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
                "key_reasons": [],
                "invalidation_conditions": [],
                **_empty_trade_contract(final_state),
                **common,
            },
            final_state,
        )

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
    has_existing_position_value = bool(getattr(pd_obj, "has_existing_position", False))
    position_action_value = getattr(pd_obj, "position_action", None)
    if not has_existing_position_value:
        position_action_value = None
    new_entry_action_value = getattr(pd_obj, "new_entry_action", None)
    if not new_entry_action_value:
        new_entry_action_value = (
            "No new entry; maintain existing position" if has_existing_position_value else "No new entry"
        )
    rebalancing_action_value = _enum_value(getattr(pd_obj, "rebalancing_action", None))
    if not rebalancing_action_value:
        rebalancing_action_value = "Maintain position" if has_existing_position_value else "Avoid new entry"
    position_size_hint_value = getattr(pd_obj, "position_size_hint", None)
    if not position_size_hint_value:
        position_size_hint_value = (
            "Maintain current position size; no additional exposure suggested."
            if has_existing_position_value
            else "No new position suggested."
        )

    return _with_analysis_overview_and_risk_data_quality(
        {
            "decision": final_decision,
            "llm_decision": getattr(pd_obj, "llm_decision", None) or fallback_rating,
            "final_decision": final_decision,
            "decision_adjusted": bool(getattr(pd_obj, "decision_adjusted", False)),
            "decision_adjusted_reason": getattr(pd_obj, "decision_adjusted_reason", None),
            "trade_plan_valid": trade_plan_valid,
            "has_existing_position": has_existing_position_value,
            "position_quantity": getattr(pd_obj, "position_quantity", None),
            "average_entry_price": getattr(pd_obj, "average_entry_price", None),
            "position_action": position_action_value,
            "new_entry_action": new_entry_action_value,
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
            "rebalancing_action": rebalancing_action_value,
            "position_size_hint": position_size_hint_value,
            "key_reasons": getattr(pd_obj, "key_reasons", []) or [],
            "key_catalysts": getattr(pd_obj, "key_catalysts", []) or [],
            "invalidation_conditions": getattr(pd_obj, "invalidation_conditions", []) or [],
            "data_quality": pd_data_quality,
            "validation_warnings": getattr(pd_obj, "validation_warnings", []) or [],
            "validation_warning_details": _validation_warning_details(getattr(pd_obj, "validation_warnings", []) or []),
            **{key: value for key, value in common.items() if key != "data_quality"},
        },
        final_state,
    )


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
