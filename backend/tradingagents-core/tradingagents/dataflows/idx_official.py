"""IDX official source placeholders with explicit unavailable metadata.

These functions define the source-of-truth contract for IDX data. They are kept
side-effect free here so the router can wire a real IDX downloader/parser later
without pretending scraped data exists when it does not.
"""

from __future__ import annotations

from typing import Any


def _unavailable(ticker: str, endpoint: str) -> dict[str, Any]:
    return {
        "available": False,
        "ticker": ticker,
        "source": "idx_official",
        "endpoint": endpoint,
        "status": "source_unavailable",
        "reason": "IDX official live adapter is not implemented yet",
    }


def get_idx_company_profile(ticker: str) -> dict[str, Any]:
    return _unavailable(ticker, "company_profile")


def get_idx_shareholders(ticker: str) -> dict[str, Any]:
    return {**_unavailable(ticker, "shareholders"), "shareholders": []}


def get_idx_financial_statements(ticker: str, period: str = "annual") -> dict[str, Any]:
    return {**_unavailable(ticker, "financial_statements"), "period": period}


def get_idx_corporate_actions(ticker: str, start_date: str | None = None, end_date: str | None = None) -> dict[str, Any]:
    return {
        **_unavailable(ticker, "corporate_actions"),
        "start_date": start_date,
        "end_date": end_date,
        "corporate_actions": [],
    }
