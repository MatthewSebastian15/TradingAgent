from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


_SECRET_KEY_RE = re.compile(r"(api[_-]?key|token|secret|password|authorization|bearer)", re.IGNORECASE)
_RAW_KEY_RE = re.compile(r"(raw|body|response_text|response_body|payload)", re.IGNORECASE)
_SECRET_VALUE_PATTERNS = [
    re.compile(r"(api[_-]?key=)([^&\s]+)", re.IGNORECASE),
    re.compile(r"(apikey=)([^&\s]+)", re.IGNORECASE),
    re.compile(r"(token=)([^&\s]+)", re.IGNORECASE),
]
_SAFE_STATUSES = {"success", "ok", "partial", "fallback", "empty", "failed", "skipped", "cache_hit", "rate_limited"}
_FUNDAMENTAL_FIELDS = {
    "fundamentals",
    "financial_statements",
    "financial_statement",
    "fundamental_profile_metrics",
    "balance_sheet",
    "income_statement",
    "cashflow",
    "profile",
    "company_profile",
}
_NEWS_FIELDS = {"news", "company_news", "global_news", "news_sentiment", "social_sentiment", "event_risk"}
_MARKET_FIELDS = {"quote", "price", "ohlcv", "technical", "last_price", "historical_price"}


@dataclass
class SymbolDiscoveryLineage:
    input_symbol: str
    canonical_symbol: str
    market: str
    exchange: str | None
    verified: bool
    source: str | None


@dataclass
class VendorLineageItem:
    field: str
    source: str
    status: str
    confidence: str | None = None
    freshness: str | None = None
    as_of_date: str | None = None
    fallback_from: str | None = None
    fallback_reason: str | None = None


@dataclass
class LLMUsageLineage:
    quick_model: str | None
    deep_model: str | None
    quick_calls: int
    deep_calls: int
    budget_exceeded: bool = False


@dataclass
class DataLineage:
    symbol: str
    generated_at: str
    symbol_discovery: SymbolDiscoveryLineage
    market_data: list[VendorLineageItem]
    fundamental_data: list[VendorLineageItem]
    news_data: list[VendorLineageItem]
    llm_usage: LLMUsageLineage
    budget_summary: dict[str, Any]
    data_quality_summary: dict[str, Any]
    estimated_fields: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def build_data_lineage(analysis_result: dict) -> DataLineage:
    """
    Extract source metadata, fallbacks, budget usage, LLM usage,
    estimated fields, and warnings from analysis result.
    """
    result = analysis_result if isinstance(analysis_result, dict) else {}
    symbol = _safe_text(result.get("normalized_ticker") or result.get("ticker") or result.get("symbol"))
    generated_at = _safe_text(result.get("analysis_created_at") or result.get("data_fetched_at")) or _now_iso()
    source_items = _build_vendor_items(result)

    return DataLineage(
        symbol=symbol,
        generated_at=generated_at,
        symbol_discovery=_build_symbol_discovery(result, symbol),
        market_data=[item for item in source_items if item.field in _MARKET_FIELDS],
        fundamental_data=[item for item in source_items if item.field in _FUNDAMENTAL_FIELDS],
        news_data=[item for item in source_items if item.field in _NEWS_FIELDS],
        llm_usage=_build_llm_usage(result),
        budget_summary=_safe_mapping(
            {
                "request_budget": result.get("request_budget"),
                "vendor_budget": result.get("vendor_budget"),
                "llm_call_budget": result.get("llm_call_budget"),
                "llm_calls_used": result.get("llm_calls_used"),
                "budget_exhausted": result.get("budget_exhausted"),
            }
        ),
        data_quality_summary=_safe_mapping(
            {
                "data_quality": result.get("data_quality"),
                "data_completeness": result.get("data_completeness"),
                "validation_summary": result.get("validation_summary"),
            }
        ),
        estimated_fields=_estimated_fields(result),
        warnings=_warnings(result),
    )


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    for pattern in _SECRET_VALUE_PATTERNS:
        text = pattern.sub(lambda match: match.group(1) + "[REDACTED]", text)
    return text[:500]


def _safe_mapping(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    clean: dict[str, Any] = {}
    for key, item in value.items():
        key_text = str(key)
        if _SECRET_KEY_RE.search(key_text) or _RAW_KEY_RE.search(key_text):
            continue
        clean[key_text] = _safe_value(item)
    return clean


def _safe_value(value: Any) -> Any:
    if isinstance(value, dict):
        return _safe_mapping(value)
    if isinstance(value, list):
        return [_safe_value(item) for item in value[:100]]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value if not isinstance(value, str) else value[:500]
    return _safe_text(value)


def _build_symbol_discovery(result: dict[str, Any], symbol: str) -> SymbolDiscoveryLineage:
    search_metadata = result.get("search_metadata") if isinstance(result.get("search_metadata"), dict) else {}
    analysis_params = result.get("analysis_params") if isinstance(result.get("analysis_params"), dict) else {}
    input_symbol = _safe_text(
        result.get("input_ticker")
        or analysis_params.get("ticker")
        or search_metadata.get("input")
        or search_metadata.get("query")
        or symbol
    )
    market = _safe_text(result.get("market") or analysis_params.get("market") or result.get("exchange") or "UNKNOWN")
    source = _safe_text(search_metadata.get("source") or search_metadata.get("provider") or result.get("current_price_source"))
    return SymbolDiscoveryLineage(
        input_symbol=input_symbol,
        canonical_symbol=symbol,
        market=market or "UNKNOWN",
        exchange=_safe_text(result.get("exchange") or search_metadata.get("exchange")) or None,
        verified=bool(search_metadata.get("verified", search_metadata.get("search_verified", bool(symbol)))),
        source=source or None,
    )


def _build_vendor_items(result: dict[str, Any]) -> list[VendorLineageItem]:
    items: list[VendorLineageItem] = []
    data_sources = result.get("data_sources") if isinstance(result.get("data_sources"), dict) else {}
    field_sources = result.get("field_sources") if isinstance(result.get("field_sources"), dict) else {}
    data_freshness = result.get("data_freshness") if isinstance(result.get("data_freshness"), dict) else {}
    vendor_attempts = result.get("vendor_attempts") if isinstance(result.get("vendor_attempts"), dict) else {}

    for field_name, source_value in data_sources.items():
        field_key = str(field_name)
        selected_source = _selected_source(source_value)
        quality = field_sources.get(field_key) if isinstance(field_sources.get(field_key), dict) else {}
        freshness = data_freshness.get(field_key) if isinstance(data_freshness.get(field_key), dict) else {}
        attempts = vendor_attempts.get(field_key) if isinstance(vendor_attempts.get(field_key), list) else []
        status = _status_from_attempts(attempts) or _status_from_source(selected_source)
        fallback_from, fallback_reason = _fallback_from_attempts(attempts)
        items.append(
            VendorLineageItem(
                field=field_key,
                source=selected_source,
                status=status,
                confidence=_safe_text(quality.get("confidence")) or None,
                freshness=_safe_text(freshness.get("status") or quality.get("freshness")) or None,
                as_of_date=_safe_text(freshness.get("as_of_date") or freshness.get("as_of") or quality.get("as_of_date")) or None,
                fallback_from=fallback_from,
                fallback_reason=fallback_reason,
            )
        )

    for field_key, attempts_value in vendor_attempts.items():
        if not isinstance(attempts_value, list) or str(field_key) in data_sources:
            continue
        status = _status_from_attempts(attempts_value)
        fallback_from, fallback_reason = _fallback_from_attempts(attempts_value)
        source = _source_from_attempts(attempts_value)
        items.append(
            VendorLineageItem(
                field=str(field_key),
                source=source,
                status=status or "unknown",
                fallback_from=fallback_from,
                fallback_reason=fallback_reason,
            )
        )

    return _dedupe_items(items)


def _selected_source(value: Any) -> str:
    if isinstance(value, dict):
        return _safe_text(value.get("selected_source") or value.get("source") or value.get("vendor")) or "unavailable"
    return _safe_text(value) or "unavailable"


def _status_from_source(source: str) -> str:
    lowered = source.lower()
    if not source or "unavailable" in lowered or "missing" in lowered:
        return "empty"
    if "fallback" in lowered:
        return "fallback"
    if "partial" in lowered:
        return "partial"
    return "success"


def _status_from_attempts(attempts: list[Any]) -> str | None:
    statuses = [_attempt_status(attempt) for attempt in attempts]
    statuses = [status for status in statuses if status]
    for status in ("success", "cache_hit", "fallback", "partial", "empty", "failed", "rate_limited", "skipped"):
        if status in statuses:
            return status
    return statuses[-1] if statuses else None


def _attempt_status(attempt: Any) -> str:
    if isinstance(attempt, dict):
        status = _safe_text(attempt.get("status")).lower()
    else:
        text = _safe_text(attempt)
        _, _, rest = text.partition(":")
        status = rest.split("(", 1)[0].strip().lower()
    return status if status in _SAFE_STATUSES else status[:80]


def _attempt_vendor(attempt: Any) -> str:
    if isinstance(attempt, dict):
        return _safe_text(attempt.get("vendor")) or "unknown"
    text = _safe_text(attempt)
    vendor, _, _ = text.partition(":")
    return vendor or "unknown"


def _attempt_reason(attempt: Any) -> str | None:
    if isinstance(attempt, dict):
        reason = _safe_text(attempt.get("reason"))
        return reason or None
    text = _safe_text(attempt)
    if "(" in text and text.endswith(")"):
        return text.split("(", 1)[1][:-1] or None
    return None


def _fallback_from_attempts(attempts: list[Any]) -> tuple[str | None, str | None]:
    if not attempts:
        return None, None
    failed_vendor = None
    failed_reason = None
    for attempt in attempts:
        status = _attempt_status(attempt)
        if status in {"empty", "failed", "rate_limited", "skipped"}:
            failed_vendor = _attempt_vendor(attempt)
            failed_reason = _attempt_reason(attempt)
        if status in {"success", "fallback", "cache_hit"} and failed_vendor:
            return failed_vendor, failed_reason or "fallback_after_vendor_attempt"
    return None, None


def _source_from_attempts(attempts: list[Any]) -> str:
    for attempt in attempts:
        if _attempt_status(attempt) in {"success", "cache_hit", "fallback", "partial"}:
            return _attempt_vendor(attempt)
    return _attempt_vendor(attempts[-1]) if attempts else "unavailable"


def _dedupe_items(items: list[VendorLineageItem]) -> list[VendorLineageItem]:
    deduped: list[VendorLineageItem] = []
    seen: set[tuple[str, str]] = set()
    for item in items:
        key = (item.field, item.source)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _build_llm_usage(result: dict[str, Any]) -> LLMUsageLineage:
    vendor_budget = result.get("vendor_budget") if isinstance(result.get("vendor_budget"), dict) else {}
    llm_calls = vendor_budget.get("llm_calls") if isinstance(vendor_budget.get("llm_calls"), dict) else {}
    models = llm_calls.get("models") if isinstance(llm_calls.get("models"), dict) else {}
    agents = llm_calls.get("agents") if isinstance(llm_calls.get("agents"), dict) else {}
    quick_calls = _safe_int(result.get("llm_quick_calls"))
    deep_calls = _safe_int(result.get("llm_deep_calls"))

    if quick_calls is None or deep_calls is None:
        quick_calls, deep_calls = _calls_from_agents(agents, _safe_int(result.get("llm_calls_used")) or _safe_int(llm_calls.get("used")) or 0)

    return LLMUsageLineage(
        quick_model=_safe_text(result.get("quick_model") or models.get("quick_think") or llm_calls.get("quick_model")) or None,
        deep_model=_safe_text(result.get("deep_model") or models.get("deep_think") or llm_calls.get("deep_model")) or None,
        quick_calls=quick_calls or 0,
        deep_calls=deep_calls or 0,
        budget_exceeded=bool(result.get("budget_exhausted") or llm_calls.get("budget_exceeded")),
    )


def _safe_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _calls_from_agents(agents: dict[str, Any], total_used: int) -> tuple[int, int]:
    deep_names = {"Bull Researcher", "Bear Researcher", "Research Manager", "Risk Committee", "Portfolio Manager"}
    quick = 0
    deep = 0
    for agent_name, payload in agents.items():
        used = _safe_int(payload.get("used") if isinstance(payload, dict) else payload) or 0
        if str(agent_name) in deep_names:
            deep += used
        else:
            quick += used
    if not agents and total_used:
        return total_used, 0
    return quick, deep


def _estimated_fields(result: dict[str, Any]) -> list[str]:
    fields: list[str] = []
    gap_report = result.get("gap_report") or result.get("fundamental_gap_report")
    if isinstance(gap_report, dict):
        fields.extend(str(item) for item in gap_report.get("estimated_fields") or [] if item)

    highlights = result.get("financial_highlights") if isinstance(result.get("financial_highlights"), dict) else {}
    for row in highlights.get("rows") or []:
        if not isinstance(row, dict):
            continue
        for cell in (row.get("values") or {}).values():
            if isinstance(cell, dict) and cell.get("status") == "estimated":
                fields.append(str(row.get("key") or row.get("label") or "financial_metric"))

    return list(dict.fromkeys(fields))


def _warnings(result: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    for key in ("warnings", "validation_warnings", "data_limitations", "limitations"):
        value = result.get(key)
        if isinstance(value, list):
            warnings.extend(_safe_text(item) for item in value if item)
        elif value:
            warnings.append(_safe_text(value))
    return list(dict.fromkeys(warnings))
