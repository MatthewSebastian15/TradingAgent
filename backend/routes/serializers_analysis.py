from __future__ import annotations

# ruff: noqa: E402, F401, F821
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
from tradingagents.risk.thesis_monitor import build_thesis_monitor

logger = logging.getLogger(__name__)

ACTIONABLE_DECISIONS = {"Buy", "Sell"}
FIXED_RR = 3.0
RISK_REWARD_DISPLAY = "1:3"

SUMMARY_FIELDS = {
    "decision",
    "disclaimer",
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
    "currency",
    "exchange",
    "normalized_ticker",
    "input_ticker",
    "total_pipeline_seconds",
    "agent_pipeline",
    "technical_levels",
    "data_sources",
    "field_sources",
    "validation_summary",
    "market_status",
    "raw_ai_signal",
    "display_signal",
    "signal",
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
    "confidence",
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
    "key_reasons_paragraph",
    "key_catalysts",
    "invalidation_conditions",
    "data_quality",
    "data_completeness",
    "fundamental_gap_report",
    "fundamental_field_quality",
    "sector_classification",
    "metrics_profile",
    "included_metrics",
    "excluded_metrics",
    "gap_report",
    "source_metadata",
    "fallback_metadata",
    "data_limitations",
    "limitations",
    "vendor_attempts",
    "request_budget",
    "vendor_budget",
    "warnings",
    "validation_warnings",
    "validation_warning_details",
    "analysis_created_at",
    "analysis_depth",
    "time_horizon_months",
    "llm_call_budget",
    "llm_calls_used",
    "budget_exhausted",
    "agents_skipped",
    "analysis_incomplete",
    "llm_budget",
    "thesis_monitor",
    "financial_highlights",
    "normalized_period_rows",
    "derived_fundamentals",
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
    "is_partial",
    "partial_reason",
    "completed_stages",
    "missing_stages",
    "partial_signal",
    "partial_confidence",
    "available_data",
    "analysis_overview",
    "risk_data_quality",
    "confidence_breakdown",
    "data_freshness",
    "tab_status",
    "analysis_params",
    "entry_quality",
    "position_sizing",
    "data_lineage",
    "observability",
}

AGENT_SEQUENCE = [
    (PipelineAgent.DATA_COLLECTION.value, "Data Collection", "Fetching market data..."),
    (
        PipelineAgent.MARKET_ANALYST.value,
        "Market Analyst",
        "Reading price data and technical indicators...",
    ),
    (
        PipelineAgent.NEWS_ANALYST.value,
        "News + Social Analyst",
        "Scanning headlines, macro events, and sentiment signals...",
    ),
    (
        PipelineAgent.FUNDAMENTALS.value,
        "Fundamentals Analyst",
        "Reviewing financial statements and ratios...",
    ),
    (
        PipelineAgent.BULL_RESEARCHER.value,
        "Bull Researcher",
        "Building or skipping the bullish investment case...",
    ),
    (
        PipelineAgent.BEAR_RESEARCHER.value,
        "Bear Researcher",
        "Building or skipping the bearish counterarguments...",
    ),
    (
        PipelineAgent.RESEARCH_MANAGER.value,
        "Research Manager",
        "Evaluating the debate and forming an investment plan...",
    ),
    (PipelineAgent.TRADER.value, "Trader", "Translating the plan into a transaction proposal..."),
    (PipelineAgent.RISK_ANALYSTS.value, "Risk Analysts", "Running or skipping risk debate..."),
    (
        PipelineAgent.PORTFOLIO_MANAGER.value,
        "Portfolio Manager",
        "Synthesizing all inputs into the final decision...",
    ),
]

PARTIAL_STAGE_SEQUENCE = [
    "symbol_resolution",
    "market_data_fetch",
    "technical_analysis",
    "news_analysis",
    "fundamental_analysis",
    "final_synthesis",
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
    dt = (
        timestamp.astimezone(wib) if timestamp.tzinfo is not None else timestamp.replace(tzinfo=wib)
    )

    if dt.weekday() >= 5:
        return "closed"

    time_val = dt.hour * 100 + dt.minute
    return "open" if 900 <= time_val <= 1549 else "closed"


def _market_status_from_value(value: Any) -> str | None:
    parsed = _parse_datetime(value)
    if parsed is None:
        return None
    return get_market_status(parsed)


def _get_current_price_fields(
    final_state: dict[str, Any], pd_obj: object | None = None
) -> dict[str, Any]:
    current_price = final_state.get("last_price", final_state.get("last_close_price"))
    if current_price is None and pd_obj is not None:
        current_price = getattr(pd_obj, "current_price", None)

    price_timestamp = final_state.get("price_timestamp")
    current_price_as_of = price_timestamp or final_state.get("last_close_price_as_of")
    if current_price_as_of is None and pd_obj is not None:
        current_price_as_of = getattr(pd_obj, "current_price_as_of", None)
    if current_price_as_of is None and current_price is not None:
        current_price_as_of = final_state.get("trade_date")

    current_price_source = final_state.get("price_source") or final_state.get(
        "last_close_price_source"
    )
    if current_price_source is None and current_price is not None:
        current_price_source = "yfinance:last_close"
    if pd_obj is not None:
        current_price_source = getattr(pd_obj, "current_price_source", None) or current_price_source

    price_is_fallback = bool(final_state.get("price_is_fallback", False))
    price_currency = final_state.get("price_currency")
    market_status = final_state.get("market_status") or _market_status_from_value(
        current_price_as_of
    )

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


def resolve_display_signal(
    raw_ai_signal: str, has_existing_position: bool, rebalancing_action: str | None = None
) -> str:
    """Convert the raw AI recommendation into the user-position-aware signal."""
    signal = _normalize_raw_signal(raw_ai_signal)
    action = str(rebalancing_action or "").strip()

    if not has_existing_position:
        return "BUY" if signal == "BUY" and action == "Open new position" else "WAIT"

    if action == "Trim position":
        return "REDUCE"
    if action == "Exit position":
        return "SELL"
    if signal == "SELL":
        return "SELL"
    return "HOLD"


def _signal_context(raw_signal: str, display_signal: str, has_existing_position: bool) -> str:
    position_text = (
        "User has an existing position"
        if has_existing_position
        else "User has no existing position"
    )
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


def _normalize_inline_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def _truncate_words(text: str, max_words: int = 125) -> str:
    words = [word for word in _normalize_inline_text(text).split(" ") if word]
    if len(words) <= max_words:
        return " ".join(words)
    return f"{' '.join(words[:max_words])}.".replace("..", ".")


def _as_reason_items(value: Any) -> list[str]:
    if isinstance(value, list):
        return [_normalize_inline_text(item) for item in value if _normalize_inline_text(item)]
    text = _normalize_inline_text(value)
    return [text] if text else []


def _build_key_reasons_paragraph(payload: dict[str, Any]) -> str:
    overview = (
        payload.get("analysis_overview")
        if isinstance(payload.get("analysis_overview"), dict)
        else {}
    )

    direct = _normalize_inline_text(
        overview.get("key_reasons_paragraph") or payload.get("key_reasons_paragraph")
    )
    if direct:
        return _truncate_words(direct, 125)

    items: list[str] = []
    items.extend(_as_reason_items(overview.get("key_reasons") or payload.get("key_reasons")))
    items.extend(_as_reason_items(payload.get("key_catalysts")))
    items.extend(_as_reason_items(payload.get("mini_risk_summary")))
    items.extend(_as_reason_items(payload.get("decision_adjusted_reason")))

    unique_items = list(dict.fromkeys(item for item in items if item))
    if not unique_items:
        return ""

    paragraph = ". ".join(unique_items)
    if not paragraph.endswith("."):
        paragraph = f"{paragraph}."

    return _truncate_words(paragraph, 125)


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
        "key_reasons_paragraph",
    ]
    for field in text_fields:
        if field in enriched and isinstance(enriched[field], str):
            enriched[field] = sanitize_text(enriched[field])

    for field in ["key_reasons", "key_catalysts", "invalidation_conditions"]:
        if field in enriched:
            enriched[field] = _sanitize_text_list(enriched[field])

    has_position = bool(enriched.get("has_existing_position", False))
    raw_signal = _normalize_raw_signal(
        enriched.get("final_decision") or enriched.get("decision") or enriched.get("llm_decision")
    )
    display_signal = resolve_display_signal(
        raw_signal,
        has_position,
        enriched.get("rebalancing_action"),
    )
    enriched["raw_ai_signal"] = raw_signal
    enriched["display_signal"] = display_signal
    enriched["signal_context"] = _signal_context(raw_signal, display_signal, has_position)

    confidence = get_confidence_label(enriched.get("confidence_score"))
    enriched["confidence_label"] = confidence["label"]
    enriched["confidence_tier"] = confidence["tier"]

    volatility_metadata = (
        final_state.get("volatility_metadata") if isinstance(final_state, dict) else None
    )
    volatility_metadata = volatility_metadata if isinstance(volatility_metadata, dict) else {}
    volatility_score = enriched.get("volatility_score")
    enriched["volatility_scale"] = volatility_metadata.get("volatility_scale") or "0–100"
    enriched["volatility_method"] = volatility_metadata.get("volatility_method") or (
        "Annualized standard deviation of daily returns, normalized to 0–100"
    )
    enriched["volatility_lookback_days"] = (
        volatility_metadata.get("volatility_lookback_days") or 365
    )
    enriched["volatility_classification"] = volatility_metadata.get(
        "volatility_classification"
    ) or _volatility_classification(volatility_score)

    risk_reason = (
        enriched.get("decision_adjusted_reason")
        or enriched.get("position_sizing_reason")
        or f"Volatility level is {enriched.get('volatility_level') or 'N/A'}."
    )
    risk_label = (
        enriched.get("volatility_classification") or enriched.get("volatility_level") or "N/A"
    )
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
        "key_reasons_paragraph": payload.get("key_reasons_paragraph")
        or _build_key_reasons_paragraph(payload),
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


def _model_to_dict(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if hasattr(value, "model_dump"):
        try:
            value = value.model_dump()
        except Exception:
            return {}
    return dict(value) if isinstance(value, dict) else {}


def _clamp_int_score(value: Any, default: int | None = None) -> int | None:
    if value is None or value == "":
        return default
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    if numeric != numeric:
        return default
    if 0 <= numeric <= 1:
        numeric *= 100
    return max(0, min(100, int(round(numeric))))


def _status_to_score(status: Any) -> int:
    normalized = str(status or "").strip().lower()
    if normalized in {"ok", "fresh", "complete", "completed", "available"}:
        return 80
    if normalized in {"partial", "stale", "fallback", "limited", "market_closed"}:
        return 55
    if normalized in {"missing", "outdated", "unavailable", "error", "invalid"}:
        return 25
    return 50


def _price_momentum_score(payload: dict[str, Any]) -> int:
    technical_entry = (
        payload.get("technical_entry") if isinstance(payload.get("technical_entry"), dict) else {}
    )
    for key in ("entry_quality_score", "score", "technical_score"):
        score = _clamp_int_score(technical_entry.get(key))
        if score is not None:
            return score

    performance = (
        payload.get("price_performance")
        if isinstance(payload.get("price_performance"), dict)
        else {}
    )
    for key in ("period_return_percent", "one_month_return_percent", "return_percent"):
        value = performance.get(key)
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            continue
        return max(0, min(100, int(round(50 + numeric * 2))))
    return 50


def _fundamental_quality_score(payload: dict[str, Any]) -> int:
    data_quality = _coerce_data_quality(payload.get("data_quality"))
    if data_quality.get(PipelineAgent.FUNDAMENTALS.value):
        return _status_to_score(data_quality.get(PipelineAgent.FUNDAMENTALS.value))
    data_sources = (
        payload.get("data_sources") if isinstance(payload.get("data_sources"), dict) else {}
    )
    fundamentals = (
        data_sources.get(PipelineAgent.FUNDAMENTALS.value)
        if isinstance(data_sources.get(PipelineAgent.FUNDAMENTALS.value), dict)
        else {}
    )
    return _status_to_score(fundamentals.get("completeness"))


def _news_sentiment_score(payload: dict[str, Any]) -> int:
    impact = payload.get("news_impact") if isinstance(payload.get("news_impact"), dict) else {}
    for key in ("sentiment_score", "score"):
        score = _clamp_int_score(impact.get(key))
        if score is not None:
            return score
    label = str(impact.get("sentiment_label") or impact.get("overall_sentiment") or "").lower()
    if any(word in label for word in ("positive", "bullish", "favorable")):
        return 70
    if any(word in label for word in ("negative", "bearish", "unfavorable")):
        return 35
    if label:
        return 50
    data_quality = _coerce_data_quality(payload.get("data_quality"))
    return _status_to_score(data_quality.get("news"))


def _risk_level_component_score(payload: dict[str, Any]) -> int:
    volatility_score = _clamp_int_score(payload.get("volatility_score"))
    if volatility_score is not None:
        return max(0, min(100, 100 - volatility_score))
    level = str(payload.get("volatility_level") or "").strip().lower()
    if level in {"low", "very low"}:
        return 80
    if level == "medium":
        return 60
    if level == "high":
        return 35
    if level == "very high":
        return 20
    return 50


def _data_quality_score(payload: dict[str, Any]) -> int:
    risk_payload = (
        payload.get("risk_data_quality")
        if isinstance(payload.get("risk_data_quality"), dict)
        else {}
    )
    risk_quality = (
        risk_payload.get("data_quality")
        if isinstance(risk_payload.get("data_quality"), dict)
        else {}
    )
    score = _clamp_int_score(risk_quality.get("score"))
    if score is not None:
        return score

    data_quality = _coerce_data_quality(payload.get("data_quality"))
    statuses = [
        data_quality.get("price_data"),
        data_quality.get(PipelineAgent.FUNDAMENTALS.value),
        data_quality.get("news"),
        data_quality.get("volatility_data"),
        data_quality.get("llm_output"),
    ]
    scores = [_status_to_score(item) for item in statuses if item is not None]
    return int(round(sum(scores) / len(scores))) if scores else 50


def _normalize_confidence_breakdown(value: Any) -> dict[str, Any]:
    data = _model_to_dict(value)
    if not data:
        return {}
    normalized: dict[str, Any] = {}
    mapping = {
        "price_momentum": "price_momentum",
        "fundamental_quality": "fundamental_quality",
        "news_sentiment": "news_sentiment",
        "risk_level_score": "risk_level_score",
        "risk": "risk_level_score",
        "data_quality": "data_quality",
        "overall": "overall",
    }
    for source, target in mapping.items():
        if source in data and target not in normalized:
            score = _clamp_int_score(data.get(source))
            if score is not None:
                normalized[target] = score
    return normalized


def _build_confidence_breakdown(
    payload: dict[str, Any], final_state: dict[str, Any]
) -> dict[str, int]:
    supplied = _normalize_confidence_breakdown(
        payload.get("confidence_breakdown")
    ) or _normalize_confidence_breakdown(final_state.get("confidence_breakdown"))
    components = {
        "price_momentum": supplied.get("price_momentum", _price_momentum_score(payload)),
        "fundamental_quality": supplied.get(
            "fundamental_quality", _fundamental_quality_score(payload)
        ),
        "news_sentiment": supplied.get("news_sentiment", _news_sentiment_score(payload)),
        "risk_level_score": supplied.get("risk_level_score", _risk_level_component_score(payload)),
        "data_quality": supplied.get("data_quality", _data_quality_score(payload)),
    }
    confidence_percent = _confidence_score_percent(payload.get("confidence_score"))
    if supplied.get("overall") is not None:
        overall = supplied["overall"]
    elif confidence_percent is not None:
        overall = confidence_percent
    else:
        overall = int(
            round(
                components["price_momentum"] * 0.30
                + components["fundamental_quality"] * 0.20
                + components["news_sentiment"] * 0.15
                + components["risk_level_score"] * 0.20
                + components["data_quality"] * 0.15
            )
        )
    return {**components, "overall": max(0, min(100, int(overall)))}


def _with_analysis_overview(payload: dict[str, Any]) -> dict[str, Any]:
    key_reasons_paragraph = _build_key_reasons_paragraph(payload)
    enriched = {**payload, "key_reasons_paragraph": key_reasons_paragraph}
    return {**enriched, "analysis_overview": _analysis_overview(enriched)}


def _build_common_result_fields(
    final_state: dict[str, Any], pd_obj: object | None
) -> dict[str, Any]:
    data_quality = final_state.get("data_quality")
    current_price_fields = _get_current_price_fields(final_state, pd_obj)
    return {
        "analysis_depth": final_state.get("analysis_depth", DEFAULT_ANALYSIS_DEPTH),
        "time_horizon_months": final_state.get("time_horizon_months"),
        "data_fetched_at": final_state.get("data_fetched_at") or _utc_now_iso(),
        "llm_call_budget": final_state.get("llm_call_budget")
        or final_state.get("balanced_gemini_request_budget"),
        "llm_calls_used": final_state.get("llm_calls_used")
        or final_state.get("balanced_gemini_calls_used"),
        "budget_exhausted": bool(final_state.get("budget_exhausted", False)),
        "agents_skipped": final_state.get("agents_skipped", []) or [],
        "analysis_incomplete": bool(final_state.get("budget_exhausted", False)),
        "llm_budget": {
            "used": final_state.get("llm_calls_used") or final_state.get("balanced_gemini_calls_used") or 0,
            "limit": final_state.get("llm_call_budget") or final_state.get("balanced_gemini_request_budget") or 0,
            "exhausted": bool(final_state.get("budget_exhausted", False)),
        },
        "is_partial": bool(final_state.get("is_partial", False)),
        "partial_reason": final_state.get("partial_reason"),
        "completed_stages": final_state.get("completed_stages") or [],
        "missing_stages": final_state.get("missing_stages") or [],
        "partial_signal": final_state.get("partial_signal"),
        "partial_confidence": final_state.get("partial_confidence"),
        "available_data": final_state.get("available_data") or {},
        "limitations": final_state.get("limitations") or final_state.get("data_limitations") or [],
        **_build_common_fundamental_fields(final_state),
        **_build_common_market_fields(final_state),
        **_build_common_quality_fields(final_state),
        "data_quality": _complete_risk_engine_data_quality(
            data_quality
            or {
                PipelineAgent.FUNDAMENTALS.value: "missing",
                "news": "missing",
                "warnings": ["Pipeline did not return data quality metadata."],
            },
            current_price=current_price_fields["current_price"],
            trade_plan_valid=False,
            decision_adjusted=False,
            volatility_score=None,
            llm_output_fallback="fallback",
        ),
    }


def _build_common_fundamental_fields(final_state: dict[str, Any]) -> dict[str, Any]:
    field_quality = _quality_from_state(final_state)
    sector_classification = _sector_classification_from_state(final_state)
    metrics_profile = _metrics_profile_from_sector(sector_classification)
    gap_report = _gap_report_from_state(final_state)
    return {
        "financial_highlights": final_state.get("financial_highlights"),
        "normalized_period_rows": final_state.get("normalized_period_rows") or [],
        "derived_fundamentals": final_state.get("derived_fundamentals") or [],
        "fundamental_field_quality": field_quality,
        "sector_classification": sector_classification,
        "metrics_profile": final_state.get("metrics_profile")
        or metrics_profile.get("metrics_profile"),
        "included_metrics": final_state.get("included_metrics")
        or metrics_profile.get("included_metrics")
        or [],
        "excluded_metrics": final_state.get("excluded_metrics")
        or metrics_profile.get("excluded_metrics")
        or [],
        "gap_report": gap_report,
        "source_metadata": _source_metadata_from_state(final_state, field_quality),
        "fallback_metadata": _fallback_metadata_from_state(final_state, field_quality),
        "financial_trends": final_state.get("financial_trends"),
        "valuation_multiples": final_state.get("valuation_multiples"),
        "fair_value_range": final_state.get("fair_value_range"),
        "scenario_analysis": final_state.get("scenario_analysis"),
        "quality_of_earnings": final_state.get("quality_of_earnings"),
        "balance_sheet_risk": final_state.get("balance_sheet_risk"),
        "dividend_quality": final_state.get("dividend_quality"),
        "peer_comparison": final_state.get("peer_comparison"),
        "company_profile": final_state.get("company_profile") or {},
    }


def _build_common_market_fields(final_state: dict[str, Any]) -> dict[str, Any]:
    return {
        "price_chart": final_state.get("price_chart") or {},
        "price_performance": final_state.get("price_performance") or {},
        "technical_entry": final_state.get("technical_entry") or {},
        "related_news": final_state.get("related_news") or {},
        "news_impact": final_state.get("news_impact") or {},
        "catalyst_tracker": final_state.get("catalyst_tracker") or {},
        "analyst_consensus": final_state.get("analyst_consensus") or {},
        "news": final_state.get("news") or final_state.get("news_context") or {},
        "news_context": final_state.get("news_context") or final_state.get("news") or {},
        "technical_levels": final_state.get("technical_levels") or {},
        "agent_pipeline": final_state.get("agent_pipeline") or [],
        "total_pipeline_seconds": final_state.get("total_pipeline_seconds"),
    }


def _missing_portfolio_payload(
    *,
    full_decision: str,
    final_state: dict[str, Any],
    common: dict[str, Any],
) -> dict[str, Any]:
    return {
        "decision": "Hold",
        "full_decision": full_decision,
        "executive_summary": None,
        "investment_thesis": None,
        "price_target": None,
        "time_horizon": final_state.get("time_horizon"),
        "confidence_score": None,
        "suggested_allocation_percent": None,
        "entry_price": None,
        "stop_loss": None,
        "take_profit": None,
        "risk_reward_ratio": None,
        "max_drawdown_estimate": None,
        "volatility_level": "Medium",
        "position_sizing_reason": None,
        "rebalancing_action": "No position to rebalance",
        "key_catalysts": [],
        "key_reasons": [],
        "invalidation_conditions": [],
        **_empty_trade_contract(final_state),
        **common,
    }


def parse_final_result(
    full_decision: str,
    pd_obj: object | None,
    portfolio_rating: object | None = None,
    final_state: dict | None = None,
) -> dict:
    """Convert the final agent state into API response fields."""
    final_state = dict(final_state or {})
    full_decision, pd_obj, coercion_warnings = _coerce_portfolio_decision(full_decision, pd_obj)
    if coercion_warnings:
        existing_warnings = final_state.get("warnings")
        if isinstance(existing_warnings, list):
            final_state["warnings"] = [*existing_warnings, *coercion_warnings]
        elif existing_warnings:
            final_state["warnings"] = [str(existing_warnings), *coercion_warnings]
        else:
            final_state["warnings"] = coercion_warnings
    common = _build_common_result_fields(final_state, pd_obj)
    payload = (
        _missing_portfolio_payload(
            full_decision=full_decision, final_state=final_state, common=common
        )
        if pd_obj is None
        else _portfolio_payload(
            full_decision=full_decision,
            pd_obj=pd_obj,
            final_state=final_state,
            common=common,
        )
    )
    response = _with_analysis_overview_and_risk_data_quality(payload, final_state)
    thesis_monitor = build_thesis_monitor(
        response,
        data_quality_score=response.get("source_confidence_score"),
    )
    response["thesis_monitor"] = thesis_monitor
    return response


def build_partial_result(
    req: AnalysisRequest,
    *,
    partial_reason: str,
    completed_stages: list[str] | None = None,
    timeout_seconds: int | None = None,
) -> dict[str, Any]:
    completed = [stage for stage in PARTIAL_STAGE_SEQUENCE if stage in set(completed_stages or [])]
    missing = [stage for stage in PARTIAL_STAGE_SEQUENCE if stage not in set(completed)]
    reason_text = partial_reason or "partial_result"
    timeout_message = (
        f"Analysis incomplete: pipeline timeout after {timeout_seconds} seconds."
        if reason_text == "pipeline_timeout" and timeout_seconds
        else "Analysis incomplete: partial backend result returned."
    )
    warnings = [
        timeout_message,
        "Showing partial results from completed stages only.",
    ]
    limitations = [
        "Final synthesis was not completed.",
        "No actionable AI signal is available from a partial result.",
    ]
    available_data = {
        "price": "market_data_fetch" in completed,
        "technical": "technical_analysis" in completed,
        "news": "news_analysis" in completed,
        "fundamental": "fundamental_analysis" in completed,
        "ai_signal": False,
    }
    final_state = {
        "trade_date": req.trade_date,
        "analysis_depth": req.analysis_depth,
        "time_horizon_months": req.time_horizon_months,
        "data_quality": {
            "price_data": "missing" if not available_data["price"] else "partial",
            "fundamentals": "missing" if not available_data["fundamental"] else "partial",
            "news": "missing" if not available_data["news"] else "partial",
            "trade_levels": "invalid",
            "llm_output": "fallback",
            "warnings": warnings,
        },
        "data_limitations": limitations,
        "warnings": warnings,
    }
    payload = _missing_portfolio_payload(
        full_decision="",
        final_state=final_state,
        common=_build_common_result_fields(final_state, None),
    )
    payload.update(
        {
            "is_partial": True,
            "partial_reason": reason_text,
            "completed_stages": completed,
            "missing_stages": missing,
            "partial_signal": "WAIT",
            "partial_confidence": 0,
            "signal": "WAIT",
            "confidence": 0,
            "available_data": available_data,
            "warnings": warnings,
            "limitations": limitations,
            "data_limitations": limitations,
            "llm_decision": None,
            "final_decision": "Hold",
            "decision": "Hold",
            "display_signal": "WAIT",
            "trade_plan_valid": False,
        }
    )
    return _with_analysis_overview_and_risk_data_quality(payload, final_state)


def shape_result(result_fields: dict[str, Any], response_detail: str) -> dict[str, Any]:
    """Trim response payload for summary mode; keep debug metadata only in debug."""
    if response_detail == "summary":
        return {
            key: value
            for key, value in result_fields.items()
            if key in SUMMARY_FIELDS or key == "cache"
        }
    if response_detail == "debug":
        return result_fields
    return {key: value for key, value in result_fields.items() if key not in {"raw_agent_state"}}


from routes import serializers_quality as _quality
from routes import serializers_report as _report
from routes import serializers_trade_plan as _trade_plan

_MODULES = (_quality, _trade_plan, _report)


def _link_serializer_modules() -> dict[str, object]:
    exports = {
        name: value
        for name, value in globals().items()
        if not name.startswith("__") and callable(value)
    }
    exports.update({"SUMMARY_FIELDS": SUMMARY_FIELDS, "AGENT_SEQUENCE": AGENT_SEQUENCE})
    for module in _MODULES:
        exports.update(
            {name: getattr(module, name) for name in dir(module) if not name.startswith("__")}
        )
    for module in _MODULES + (sys.modules[__name__],):
        for name, value in exports.items():
            if name not in module.__dict__:
                module.__dict__[name] = value
    return exports


import sys

_EXPORTS = _link_serializer_modules()
globals().update(_EXPORTS)

__all__ = sorted(name for name in _EXPORTS if not name.startswith("_")) + [
    name for name in sorted(_EXPORTS) if name.startswith("_")
]
