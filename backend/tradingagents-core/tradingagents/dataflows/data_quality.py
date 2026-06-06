"""Utilities for classifying yfinance data quality before agent analysis."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class DataQualityWarning(BaseModel):
    """Structured data-quality warning for API/UI severity rendering."""

    code: str
    severity: Literal["info", "warning", "error"] = "warning"
    message: str
    blocking: bool = False


class DataQualityReport(BaseModel):
    """Compact API-facing data quality summary for a yfinance collection run."""

    price_data: str = Field(default="missing", description="ok, partial, missing, invalid_ticker, or market_closed")
    fundamentals: str = Field(default="missing", description="ok, partial, or missing")
    news: str = Field(default="missing", description="ok, partial, unavailable, or missing")
    warnings: list[str] = Field(default_factory=list)
    warning_details: list[DataQualityWarning] = Field(default_factory=list)
    field_quality: dict[str, dict[str, Any]] = Field(default_factory=dict)
    data_sources: dict[str, str] = Field(default_factory=dict)

    @property
    def is_usable(self) -> bool:
        return self.price_data in {"ok", "partial", "market_closed"}


@dataclass
class DataField:
    value: str
    status: str = "ok"
    warning: str | None = None

    @classmethod
    def from_text(cls, value: str) -> DataField:
        status = "missing" if looks_missing(value) else "ok"
        warning = value.splitlines()[0] if status == "missing" and value else None
        return cls(value=value, status=status, warning=warning)

    @classmethod
    def unavailable(cls, label: str, exc: Exception) -> DataField:
        message = f"{label} unavailable: {exc}"
        return cls(value=message, status="missing", warning=message)


def looks_missing(text: str) -> bool:
    lowered = (text or "").lower()
    missing_markers = [
        "no data found",
        "no fundamentals data found",
        "no balance sheet data found",
        "no cash flow data found",
        "no income statement data found",
        "no news found",
        "error retrieving",
        "error fetching",
        "alpha vantage error",
        "alpha vantage note",
        "alpha vantage information",
        "rate limit exceeded",
        "premium endpoint",
        "premium api",
        "unavailable:",
        "possibly delisted",
        "not found",
    ]
    return not text.strip() or any(marker in lowered for marker in missing_markers)


def extract_price_dates(price_data: str) -> set[str]:
    """Return the set of valid calendar dates found at the start of each line.

    A candidate is accepted only when it passes a full datetime.strptime parse,
    so strings like '2026-99-99' are silently discarded rather than counted as
    present-but-invalid trading days.
    """
    dates: set[str] = set()
    for line in (price_data or "").splitlines():
        # Fast pre-filter: lines must start with YYYY-MM-DD format characters.
        if len(line) < 10 or not line[:4].isdigit() or line[4] != "-" or line[7] != "-":
            continue
        candidate = line[:10]
        try:
            datetime.strptime(candidate, "%Y-%m-%d")
            dates.add(candidate)
        except ValueError:
            # Not a real calendar date — skip silently.
            pass
    return dates


def _quality(
    *,
    available: bool,
    confidence: str = "medium",
    is_empty: bool = False,
    is_stale: bool = False,
    missing_fields: list[str] | None = None,
    warnings: list[str] | None = None,
) -> dict:
    missing = missing_fields or []
    return {
        "available": bool(available),
        "confidence": confidence if available else "unavailable",
        "is_empty": bool(is_empty),
        "is_stale": bool(is_stale),
        "has_required_fields": not missing,
        "missing_fields": missing,
        "warnings": warnings or [],
    }


def _number(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def validate_quote(result: dict) -> dict:
    if not isinstance(result, dict) or not result:
        return _quality(available=False, is_empty=True, missing_fields=["current_price", "source"])
    missing: list[str] = []
    warnings: list[str] = []
    current = _number(result.get("current_price") or result.get("price") or result.get("c"))
    previous = _number(result.get("previous_close") or result.get("pc"))
    if current is None or current <= 0:
        missing.append("current_price")
    if not result.get("source"):
        missing.append("source")
    if previous is None or previous <= 0:
        warnings.append("previous_close is missing or invalid; quote confidence lowered.")
    if not result.get("timestamp"):
        warnings.append("timestamp is missing; quote freshness cannot be verified.")
    confidence = "high"
    if warnings:
        confidence = "medium"
    if missing:
        confidence = "unavailable"
    return _quality(available=not missing, confidence=confidence, missing_fields=missing, warnings=warnings)


def validate_ohlcv(result) -> dict:
    if isinstance(result, str):
        if looks_missing(result):
            return _quality(
                available=False,
                is_empty=True,
                missing_fields=["rows"],
                warnings=[result.splitlines()[0] if result else "empty OHLCV"],
            )
        dates = extract_price_dates(result)
        warnings = [] if len(dates) >= 10 else [f"Only {len(dates)} OHLCV rows detected."]
        return _quality(
            available=bool(dates),
            confidence="high" if len(dates) >= 30 else "medium",
            is_empty=not bool(dates),
            warnings=warnings,
        )
    if not isinstance(result, dict):
        return _quality(available=False, is_empty=True, missing_fields=["rows"])
    rows = result.get("rows") if isinstance(result.get("rows"), list) else []
    missing = [] if rows else ["rows"]
    warnings = [] if len(rows) >= 30 else ["Partial OHLCV history: fewer than 30 candles returned."]
    required = {"date", "open", "high", "low", "close", "volume"}
    if rows:
        row_missing = sorted(required - set(rows[-1].keys()))
        missing.extend(row_missing)
    return _quality(
        available=not missing,
        confidence="high" if len(rows) >= 30 else "medium",
        is_empty=not rows,
        missing_fields=missing,
        warnings=warnings,
    )


def validate_fundamentals(result) -> dict:
    if isinstance(result, str):
        if looks_missing(result):
            return _quality(
                available=False,
                is_empty=True,
                missing_fields=["fundamentals"],
                warnings=[result.splitlines()[0] if result else "empty fundamentals"],
            )
        lowered = result.lower()
        warnings = []
        if "source" not in lowered:
            warnings.append("field-level source metadata not detected in fundamentals text.")
        return _quality(available=True, confidence="medium" if warnings else "high", warnings=warnings)
    if not isinstance(result, dict) or not result:
        return _quality(available=False, is_empty=True, missing_fields=["fundamentals"])
    metrics = result.get("metrics") if isinstance(result.get("metrics"), dict) else {}
    company = result.get("company") if isinstance(result.get("company"), dict) else {}
    missing = []
    if not metrics:
        missing.append("metrics")
    if not company:
        missing.append("company")
    warnings = []
    for key, value in metrics.items():
        if isinstance(value, dict) and not value.get("source"):
            warnings.append(f"metric {key} is missing field source.")
    return _quality(
        available=bool(metrics or company),
        confidence="medium" if missing or warnings else "high",
        is_empty=not bool(metrics or company),
        missing_fields=missing,
        warnings=warnings,
    )


def validate_news(result) -> dict:
    if isinstance(result, str):
        if looks_missing(result):
            return _quality(
                available=False,
                is_empty=True,
                missing_fields=["news"],
                warnings=[result.splitlines()[0] if result else "empty news"],
            )
        article_count = result.count("### ")
        return _quality(
            available=True,
            confidence="high" if article_count >= 3 else "medium",
            warnings=[] if article_count else ["No markdown article headings detected."],
        )
    if not isinstance(result, dict):
        return _quality(available=False, is_empty=True, missing_fields=["items"])
    items = result.get("items") if isinstance(result.get("items"), list) else []
    return _quality(
        available=bool(items),
        confidence="high" if len(items) >= 3 else "medium",
        is_empty=not bool(items),
        missing_fields=[] if items else ["items"],
    )


def validate_sentiment(result) -> dict:
    if isinstance(result, str):
        if looks_missing(result) or '"available": false' in result.lower():
            return _quality(
                available=False,
                is_empty=True,
                missing_fields=["sentiment"],
                warnings=["Sentiment unavailable; do not fabricate it from unrelated fields."],
            )
        return _quality(available=True, confidence="medium")
    if not isinstance(result, dict) or not result:
        return _quality(available=False, is_empty=True, missing_fields=["sentiment"])
    if result.get("available") is False:
        return _quality(
            available=False,
            is_empty=True,
            missing_fields=["sentiment"],
            warnings=[str(result.get("reason") or "Sentiment unavailable")],
        )
    return _quality(available=True, confidence="medium")


@dataclass
class FieldQuality:
    """Field-level quality metadata for API/UI/report consumers."""

    field_name: str
    source: str | None
    status: str
    confidence_score: int | float | None
    freshness_score: int = 0
    completeness_score: int = 0
    source_reliability_score: int = 0
    cross_vendor_match_score: int = 0
    warnings: list[str] = field(default_factory=list)
    as_of_date: str | None = None
    freshness_status: dict[str, Any] | None = None
    freshness: dict[str, Any] | None = None
    reason: str | None = None
    vendor_attempts: list[dict[str, Any]] = field(default_factory=list)
    vendor_values: dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def calculate_confidence_score(
    source_reliability_score: int,
    freshness_score: int,
    completeness_score: int,
    cross_vendor_match_score: int,
    missing_field_penalty: int = 0,
    stale_data_penalty: int = 0,
) -> int:
    """Calculate a bounded 0-100 confidence score for a data field."""
    score = (
        int(source_reliability_score)
        + int(freshness_score)
        + int(completeness_score)
        + int(cross_vendor_match_score)
        - int(missing_field_penalty)
        - int(stale_data_penalty)
    )
    return max(0, min(100, score))


DATA_STATUS_LABELS = {
    "available": "data tersedia dan valid",
    "calculated": "data dihitung lokal dari field mentah",
    "not_applicable": "metric memang tidak berlaku",
    "no_history": "perusahaan tidak punya riwayat data tersebut",
    "source_unavailable": "vendor/source gagal atau tidak punya coverage",
    "stale": "data tersedia tapi melewati TTL",
    "conflict": "vendor berbeda signifikan",
    "partial": "sebagian subfield tersedia, sebagian tidak",
    "no_dividend_history": "perusahaan tidak punya riwayat dividen tunai",
    "not_applicable_negative_earnings": "metrik tidak relevan saat laba negatif",
}

_SOURCE_RELIABILITY_SCORE = {
    "idx_official": 35,
    "finnhub": 31,
    "google_news_light": 30,
    "marketaux": 30,
    "newsdata": 28,
    "alpha_vantage": 28,
    "yfinance": 26,
    "local_calculation_from_historical_price": 30,
    "local_calculation_from_normalized_financials": 30,
    "configured_ohlcv:local_calculation": 28,
    "unavailable": 0,
}

_ALLOWED_STATUSES = {
    "available",
    "calculated",
    "not_applicable",
    "no_history",
    "no_dividend_history",
    "not_applicable_negative_earnings",
    "source_unavailable",
    "stale",
    "conflict",
    "partial",
    "empty",
    "failed",
    "skipped",
    "success",
    "unknown",
    "unavailable",
}

_MISSING_SENTINELS = {"", "n/a", "na", "none", "null", "unavailable", "source_unavailable"}


def _is_missing_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, (list, tuple, set, dict)) and not value:
        return True
    if isinstance(value, str):
        text = value.strip().lower()
        if text in _MISSING_SENTINELS:
            return True
        return looks_missing(value)
    return False


def _source_score(source: str) -> int:
    source_text = str(source or "unavailable").lower()
    for key, score in _SOURCE_RELIABILITY_SCORE.items():
        if key in source_text:
            return score
    return 20 if source_text and source_text != "unavailable" else 0


def build_field_quality(
    field_name: str,
    value: Any,
    source: str | None = "unknown",
    confidence_score: int | float | None = None,
    warnings: list[str] | None = None,
    *,
    as_of_date: str | None = None,
    status: str | None = None,
    status_override: str | None = None,
    calculated: bool = False,
    reason: str | None = None,
    conflict_warnings: list[str] | None = None,
    vendor_attempts: list[dict[str, Any]] | None = None,
    vendor_values: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Build standardized field-level quality metadata.

    The returned shape is intentionally plain dict so it can be added to API
    payloads without forcing legacy text fields to change shape.
    """
    field_warnings = list(warnings or []) + list(conflict_warnings or [])
    normalized_vendor_values = dict(vendor_values or {})
    source_text = str(source or "unavailable") if source is not None else None
    missing = _is_missing_value(value)
    status = status_override or status
    if status is None:
        if conflict_warnings:
            status = "conflict"
        elif calculated and not missing:
            status = "calculated"
        elif missing:
            status = "source_unavailable"
        else:
            status = "available"
    if status not in _ALLOWED_STATUSES:
        status = "partial" if status else "source_unavailable"

    source_reliability_score = _source_score(source_text or "unavailable")
    completeness_score = 25 if not missing else 0
    cross_vendor_match_score = 0 if conflict_warnings else 15
    freshness_score = 0
    freshness_detail: dict[str, Any] | None = None
    stale_penalty = 0

    try:
        from tradingagents.dataflows.freshness_policy import get_freshness_status

        freshness_detail = get_freshness_status(field_name, as_of_date)
        freshness_score = int(freshness_detail.get("freshness_score") or 0)
        if freshness_detail.get("is_stale") and status == "available":
            if freshness_detail.get("status") == "stale":
                status = "stale"
            stale_penalty = 10
        field_warnings.extend(freshness_detail.get("warnings") or [])
    except Exception:
        freshness_score = 0
        freshness_detail = None

    missing_penalty = 25 if missing else 0
    confidence = (
        confidence_score
        if confidence_score is not None
        else calculate_confidence_score(
            source_reliability_score=source_reliability_score,
            freshness_score=freshness_score,
            completeness_score=completeness_score,
            cross_vendor_match_score=cross_vendor_match_score,
            missing_field_penalty=missing_penalty,
            stale_data_penalty=stale_penalty,
        )
    )
    if reason is None and missing:
        reason = "Source did not return usable data for this field."
    elif reason is None and conflict_warnings:
        reason = "Cross-vendor validation found a material mismatch."
    if conflict_warnings:
        status = "conflict"

    return FieldQuality(
        field_name=str(field_name),
        source=source_text,
        status=status,
        confidence_score=confidence,
        freshness_score=freshness_score,
        completeness_score=completeness_score,
        source_reliability_score=source_reliability_score,
        cross_vendor_match_score=cross_vendor_match_score,
        warnings=list(dict.fromkeys(field_warnings)),
        as_of_date=as_of_date,
        freshness_status=freshness_detail,
        freshness=freshness_detail,
        reason=reason,
        vendor_attempts=list(vendor_attempts or []),
        vendor_values=normalized_vendor_values,
    ).to_dict()
