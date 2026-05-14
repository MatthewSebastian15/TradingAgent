"""Utilities for classifying yfinance data quality before agent analysis."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from pydantic import BaseModel, Field


class DataQualityReport(BaseModel):
    """Compact API-facing data quality summary for a yfinance collection run."""

    price_data: str = Field(default="missing", description="ok, partial, missing, invalid_ticker, or market_closed")
    fundamentals: str = Field(default="missing", description="ok, partial, or missing")
    news: str = Field(default="missing", description="ok, partial, or missing")
    warnings: list[str] = Field(default_factory=list)

    @property
    def is_usable(self) -> bool:
        return self.price_data in {"ok", "partial", "market_closed"}


@dataclass
class DataField:
    value: str
    status: str = "ok"
    warning: Optional[str] = None


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
        "unavailable:",
        "possibly delisted",
        "not found",
    ]
    return not text.strip() or any(marker in lowered for marker in missing_markers)


def extract_price_dates(price_data: str) -> set[str]:
    dates: set[str] = set()
    for line in (price_data or "").splitlines():
        if len(line) >= 10 and line[:4].isdigit() and line[4] == "-" and line[7] == "-":
            dates.add(line[:10])
    return dates
