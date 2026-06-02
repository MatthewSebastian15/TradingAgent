"""Utilities for classifying yfinance data quality before agent analysis."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

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
