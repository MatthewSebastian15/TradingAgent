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

VALIDATION_WARNING_META: dict[str, dict[str, Any]] = {
    "HOLD_TRADE_LEVELS_HIDDEN": {
        "severity": "info",
        "message": "Trade levels are hidden because recommendation is Hold.",
        "blocking": False,
    },
    "NEWS_PARTIAL": {
        "severity": "warning",
        "message": "Partial news coverage is available.",
        "blocking": False,
    },
    "NEWS_UNAVAILABLE": {
        "severity": "warning",
        ("message"): (
            "No usable news was returned; analysis continues without blocking trade validation."
        ),
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
    "CURRENT_PRICE_MISSING": {
        "severity": "error",
        "message": "Current price missing.",
        "blocking": True,
    },
    "PRICE_MISSING": {
        "severity": "error",
        "message": "Required price data is missing.",
        "blocking": True,
    },
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


def _coerce_data_quality(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        try:
            value = value.model_dump()
        except Exception:
            value = None
    return dict(value) if isinstance(value, dict) else {}


def _quality_from_state(final_state: dict[str, Any]) -> dict[str, Any]:
    data_quality = _coerce_data_quality(final_state.get("data_quality"))
    field_quality = final_state.get("fundamental_field_quality") or data_quality.get(
        "fundamental_field_quality"
    )
    if isinstance(field_quality, dict):
        return field_quality
    field_quality = data_quality.get("field_quality") or final_state.get("field_quality")
    if isinstance(field_quality, dict):
        return {str(key): value for key, value in field_quality.items() if isinstance(value, dict)}
    return {}


def _sector_classification_from_state(final_state: dict[str, Any]) -> dict[str, Any]:
    existing = final_state.get("sector_classification")
    if isinstance(existing, dict) and existing.get("sector"):
        return existing
    profile = (
        final_state.get("company_profile")
        if isinstance(final_state.get("company_profile"), dict)
        else {}
    )
    sector = profile.get("sector") or profile.get("industry")
    if sector:
        return {"sector": str(sector).strip().lower(), "source": "yfinance", "confidence": "medium"}
    return {"sector": "unknown", "source": "unknown", "confidence": "low"}


def _metrics_profile_from_sector(sector_classification: dict[str, Any]) -> dict[str, Any]:
    try:
        from tradingagents.dataflows.fundamentals.financial_rows import metrics_profile_for_sector

        return metrics_profile_for_sector(str(sector_classification.get("sector") or "unknown"))
    except Exception:
        return {
            "metrics_profile": "unknown",
            "included_metrics": ["revenue", "net_profit", "roe", "roa", "der"],
            "excluded_metrics": [],
        }


def _gap_report_from_state(final_state: dict[str, Any]) -> dict[str, Any]:
    gap_report = final_state.get("gap_report") or final_state.get("fundamental_gap_report")
    if isinstance(gap_report, dict):
        return gap_report
    return {
        "missing_fields": [],
        "fallback_fields": [],
        "estimated_fields": [],
        "unresolvable_fields": [],
        "warnings": [],
    }


def _source_metadata_from_state(
    final_state: dict[str, Any], field_quality: dict[str, Any]
) -> dict[str, Any]:
    existing = final_state.get("source_metadata")
    if isinstance(existing, dict):
        return existing
    data_sources = (
        final_state.get("data_sources") if isinstance(final_state.get("data_sources"), dict) else {}
    )
    sources = [
        value.get("source")
        for value in field_quality.values()
        if isinstance(value, dict) and value.get("source")
    ]
    return {
        "source": data_sources.get("fundamentals")
        or data_sources.get("financials")
        or data_sources.get("fundamental_data"),
        "source_priority": ["yfinance", "finnhub"],
        "sources_used": list(dict.fromkeys(str(source) for source in sources if source)),
    }


def _fallback_metadata_from_state(
    final_state: dict[str, Any], field_quality: dict[str, Any]
) -> dict[str, Any]:
    existing = final_state.get("fallback_metadata")
    if isinstance(existing, dict):
        return existing
    fallback_fields = [
        key
        for key, value in field_quality.items()
        if isinstance(value, dict) and value.get("fallback")
    ]
    return {
        "fallback_used": bool(fallback_fields),
        "fallback_source": "finnhub" if fallback_fields else None,
        "filled_by_fallback": fallback_fields,
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
                        warning.get("severity")
                        or VALIDATION_WARNING_META.get(code, {}).get("severity")
                        or "warning"
                    ),
                    "message": str(
                        warning.get("message")
                        or VALIDATION_WARNING_META.get(code, {}).get("message")
                        or code
                    ),
                    "blocking": bool(
                        warning.get(
                            "blocking", VALIDATION_WARNING_META.get(code, {}).get("blocking", False)
                        )
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
        return (
            "Some optional market data was skipped because the request budget was reached. "
            + "Analysis continues."
        )

    if "invalid ticker format" in lowered and "alpha vantage" in lowered:
        return (
            "Alpha Vantage does not support this ticker format for the requested optional data. "
            + "Analysis continues."
        )

    if "finnhub" in lowered and ("auth" in lowered or "plan" in lowered or "api key" in lowered):
        return (
            "Finnhub optional data is unavailable for the current API key or plan. Analysis "
            + "continues."
        )

    if "finnhub enrichment disabled" in lowered:
        return "Some optional Finnhub enrichment was skipped. Analysis continues."

    if "no usable news" in lowered or "news_unavailable" in lowered or "no news found" in lowered:
        return (
            "No usable news was returned for this ticker. Analysis continues without blocking "
            + "trade validation."
        )

    if "optional data unavailable" in lowered:
        return "Some optional vendor enrichment was skipped. Analysis continues."

    return str(message or "Data source warning")


def _data_quality_warning_detail_from_message(message: str) -> dict[str, Any]:
    message = _clean_data_source_message(message)
    lowered = message.lower()
    if "action downgraded to wait" in lowered:
        return {
            "code": "data_quality_blocking",
            "severity": "warning",
            "message": message,
            "blocking": True,
        }
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
    return {
        "code": "DATA_SOURCE_WARNING",
        "severity": "warning",
        "message": message,
        "blocking": False,
    }


def _complete_data_quality_warning_details(merged: dict[str, Any]) -> None:
    details: list[dict[str, Any]] = []
    existing = merged.get("warning_details")
    if isinstance(existing, list):
        for item in existing:
            if isinstance(item, dict):
                code = str(item.get("code") or "DATA_SOURCE_WARNING")
                message = _clean_data_source_message(
                    str(
                        item.get("message")
                        or VALIDATION_WARNING_META.get(code, {}).get("message")
                        or code
                    )
                )
                details.append(
                    {
                        "code": code,
                        "severity": str(
                            item.get("severity")
                            or VALIDATION_WARNING_META.get(code, {}).get("severity")
                            or "warning"
                        ),
                        "message": message,
                        "blocking": bool(
                            item.get(
                                "blocking",
                                VALIDATION_WARNING_META.get(code, {}).get("blocking", False),
                            )
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


def _date_from_any(value: Any) -> datetime | None:
    parsed = _parse_datetime(value)
    if parsed is not None:
        return parsed
    return None


def _days_old(value: Any) -> int | None:
    parsed = _date_from_any(value)
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    now = datetime.now(UTC)
    return max(0, (now.date() - parsed.astimezone(UTC).date()).days)


def _freshness_status_from_date(value: Any) -> str:
    age_days = _days_old(value)
    if age_days is None:
        return "unknown"
    if age_days < 30:
        return "fresh"
    if age_days <= 90:
        return "stale"
    return "outdated"


def _field_freshness_payload(field_name: str, as_of_date: Any) -> dict[str, Any]:
    try:
        from tradingagents.dataflows.quality.freshness_policy import (
            get_freshness_status,  # noqa: PLC0415
        )

        detail = get_freshness_status(field_name, as_of_date)
        return {
            "freshness_status": detail.get("status"),
            "freshness_detail": detail,
        }
    except Exception:
        return {
            "freshness_status": _freshness_status_from_date(as_of_date),
            "freshness_detail": None,
        }


def _period_end_from_label(label: Any) -> str | None:
    text = str(label or "").strip().upper().replace(" ", "")
    if not text:
        return None
    match = re.search(r"FY(\d{2,4})Q([1-4])", text)
    if match:
        year = int(match.group(1))
        if year < 100:
            year += 2000
        quarter_end = {"1": "03-31", "2": "06-30", "3": "09-30", "4": "12-31"}[match.group(2)]
        return f"{year}-{quarter_end}"
    match = re.search(r"FY(\d{2,4})", text)
    if match:
        year = int(match.group(1))
        if year < 100:
            year += 2000
        return f"{year}-12-31"
    return None


def _build_response_warnings(payload: dict[str, Any], final_state: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    for source in (
        payload.get("warnings"),
        final_state.get("warnings") if isinstance(final_state, dict) else None,
    ):
        if isinstance(source, list):
            warnings.extend(str(item) for item in source if item)
        elif source:
            warnings.append(str(source))

    data_quality = _coerce_data_quality(
        payload.get("data_quality") or final_state.get("data_quality")
    )
    for item in data_quality.get("warnings") or []:
        warnings.append(str(item))

    for item in final_state.get("data_limitations", []) if isinstance(final_state, dict) else []:
        warnings.append(str(item))

    gap_report = (
        final_state.get("fundamental_gap_report") if isinstance(final_state, dict) else None
    )
    if isinstance(gap_report, dict):
        missing = gap_report.get("missing_fields") or gap_report.get("missing") or []
        if missing:
            warnings.append(
                f"{len(missing)} fundamental field(s) have explicit missing-data metadata."
            )

    return list(dict.fromkeys(warnings))[:30]


def _normalize_data_sources_for_response(data_sources: Any) -> dict[str, Any]:
    if not isinstance(data_sources, dict):
        return {}
    normalized = dict(data_sources)
    for key, value in list(normalized.items()):
        if isinstance(value, str):
            normalized[key] = {
                "primary": value,
                "sources": [value],
                "status": "available" if value else "source_unavailable",
            }
        elif isinstance(value, list):
            normalized[key] = {
                "sources": value,
                "primary": value[0] if value else None,
                "status": "available" if value else "source_unavailable",
            }
    return normalized


def _build_data_freshness(payload: dict[str, Any], final_state: dict[str, Any]) -> dict[str, Any]:
    existing = final_state.get("data_freshness") if isinstance(final_state, dict) else None
    if isinstance(existing, dict) and existing:
        return existing

    data_sources = (
        payload.get("data_sources") if isinstance(payload.get("data_sources"), dict) else {}
    )
    price_source = data_sources.get("price") if isinstance(data_sources.get("price"), dict) else {}
    fundamentals = (
        data_sources.get(PipelineAgent.FUNDAMENTALS.value)
        if isinstance(data_sources.get(PipelineAgent.FUNDAMENTALS.value), dict)
        else {}
    )
    news_source = data_sources.get("news") if isinstance(data_sources.get("news"), dict) else {}
    macro_source = data_sources.get("macro") if isinstance(data_sources.get("macro"), dict) else {}

    price_timestamp = (
        payload.get("price_timestamp")
        or price_source.get("timestamp")
        or payload.get("current_price_as_of")
    )
    financial_period = fundamentals.get("last_period")
    period_end_date = (
        fundamentals.get("as_of_date")
        or fundamentals.get("period_end_date")
        or _period_end_from_label(financial_period)
    )
    news_payload = (
        payload.get("news_context")
        if isinstance(payload.get("news_context"), dict)
        else payload.get("news")
        if isinstance(payload.get("news"), dict)
        else {}
    )
    news_impact = payload.get("news_impact") if isinstance(payload.get("news_impact"), dict) else {}
    news_articles = news_payload.get("articles") if isinstance(news_payload, dict) else []
    impact_articles = news_impact.get("full_news_list") if isinstance(news_impact, dict) else []
    latest_article_date = (
        news_source.get("latest_article_date")
        or (news_payload or {}).get("latest_article_date")
        or max(
            (
                str(item.get("published_at"))
                for item in [*(news_articles or []), *(impact_articles or [])]
                if isinstance(item, dict) and item.get("published_at")
            ),
            default=None,
        )
    )

    market_status = str(payload.get("market_status") or "").lower()
    price_type = (
        "intraday"
        if market_status == "open" and not payload.get("price_is_fallback")
        else "previous_close"
    )
    if not payload.get("price_is_fallback") and market_status != "open":
        price_type = price_source.get("method") or "daily"

    return {
        "price": {
            "timestamp": price_timestamp,
            "type": price_type,
            **_field_freshness_payload("historical_price", price_timestamp),
        },
        "financials": {
            "period": financial_period,
            "period_end_date": period_end_date,
            "as_of_date": period_end_date,
            **_field_freshness_payload("financial_statement", period_end_date),
        },
        "news": {
            "lookback_days": news_source.get("lookback_days")
            or (news_payload or {}).get("window_days"),
            "articles_count": news_source.get("articles_found")
            or (news_payload or {}).get("articles_found")
            or len(news_articles or []),
            "latest_article_date": latest_article_date,
            "duplicate_removed_count": (news_payload or {}).get("duplicate_removed_count")
            or (news_payload or {}).get("dedup_removed_count")
            or news_impact.get("duplicate_excluded_count"),
            **_field_freshness_payload("company_news", latest_article_date),
        },
        "macro": {
            "description": macro_source.get("description") or "Latest available from provider",
            "freshness_status": "unknown",
        },
    }


def _build_tab_status(payload: dict[str, Any]) -> dict[str, str]:
    statuses = {
        "analysis": "ok",
        "profile": "ok",
        "fundamental": "ok",
        "chart_price": "ok",
        "news": "ok",
        "risk_data_quality": "ok",
    }
    data_sources = (
        payload.get("data_sources") if isinstance(payload.get("data_sources"), dict) else {}
    )
    fundamentals = (
        data_sources.get(PipelineAgent.FUNDAMENTALS.value)
        if isinstance(data_sources.get(PipelineAgent.FUNDAMENTALS.value), dict)
        else {}
    )
    data_quality = _coerce_data_quality(payload.get("data_quality"))
    completeness = (
        payload.get("data_completeness")
        if isinstance(payload.get("data_completeness"), dict)
        else {}
    )
    gap_report = (
        payload.get("fundamental_gap_report")
        if isinstance(payload.get("fundamental_gap_report"), dict)
        else {}
    )
    fundamental_completeness = (
        completeness.get("fundamental_data")
        or completeness.get(PipelineAgent.FUNDAMENTALS.value)
        or {}
    )
    pct = None
    if isinstance(fundamental_completeness, dict):
        pct = fundamental_completeness.get("percent") or fundamental_completeness.get("score")
    if (
        str(
            fundamentals.get("completeness")
            or data_quality.get(PipelineAgent.FUNDAMENTALS.value)
            or ""
        ).lower()
        == "partial"
        or bool(gap_report.get("missing_fields") or gap_report.get("missing"))
        or (isinstance(pct, (int, float)) and pct < 80)
    ):
        statuses["fundamental"] = "partial"

    freshness = (
        payload.get("data_freshness") if isinstance(payload.get("data_freshness"), dict) else {}
    )
    if any(
        str(item.get("freshness_status") if isinstance(item, dict) else "").lower()
        in {"stale", "outdated"}
        for item in freshness.values()
    ):
        statuses["risk_data_quality"] = "warning"
    return statuses


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
    enriched["data_freshness"] = _build_data_freshness(enriched, final_state)
    enriched["confidence_breakdown"] = _build_confidence_breakdown(enriched, final_state)
    enriched["tab_status"] = _build_tab_status(enriched)
    return enriched


def _build_common_quality_fields(final_state: dict[str, Any]) -> dict[str, Any]:
    return {
        "data_sources": _normalize_data_sources_for_response(final_state.get("data_sources") or {}),
        "field_sources": final_state.get("field_sources") or {},
        "validation_summary": final_state.get("validation_summary") or {},
        "data_freshness": final_state.get("data_freshness") or {},
        "data_completeness": final_state.get("data_completeness") or {},
        "fundamental_gap_report": final_state.get("fundamental_gap_report") or {},
        "data_limitations": final_state.get("data_limitations") or [],
        "vendor_attempts": final_state.get("vendor_attempts") or {},
        "request_budget": final_state.get("request_budget") or {},
        "vendor_budget": final_state.get("vendor_budget") or {},
        "warnings": _build_response_warnings(final_state, final_state),
    }
