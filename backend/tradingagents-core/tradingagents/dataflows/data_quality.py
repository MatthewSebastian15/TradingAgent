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
