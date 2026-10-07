"""Key financial statements for the Research FINANCIALS tab.

Wraps the engine's `build_financial_highlights` (the same builder the analysis report
uses) over yfinance statements, SWR-cached per symbol: one vendor fetch serves both the
income and balance-sheet views.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from tradingagents.dataflows.providers import y_finance
from tradingagents.financial_highlights import build_financial_highlights, to_dict

from services.market.yfinance_service import market_cache, swr_cached_with_degraded_ttl

logger = logging.getLogger(__name__)

FINANCIALS_TTL_SECONDS = 3600  # statements change quarterly, never intraday
DEGRADED_FINANCIALS_TTL_SECONDS = 30
Statement = Literal["income", "balance"]
_SECTION_KEY: dict[str, str] = {"income": "income", "balance": "balance_sheet"}
_UNAVAILABLE: dict[str, Any] = {
    "currency": None,
    "unit_note": None,
    "periods": [],
    "sections": [],
    "data_quality": {"status": "unavailable"},
}

__all__ = ["market_cache", "get_financials_cached"]


def _fetch_statements(symbol: str) -> dict[str, Any]:
    return {
        name: {"quarterly": getter(symbol, "quarterly"), "annual": getter(symbol, "annual")}
        for name, getter in (
            ("income_statement", y_finance.get_income_statement),
            ("balance_sheet", y_finance.get_balance_sheet),
            ("cashflow", y_finance.get_cashflow),
        )
    }


def _build_financials(symbol: str) -> dict[str, Any]:
    try:
        highlights = build_financial_highlights(
            ticker=symbol, analysis_date=None, **_fetch_statements(symbol)
        )
        return to_dict(highlights) or _UNAVAILABLE
    except Exception as exc:  # noqa: BLE001
        logger.warning("Financials failed for %s: %s", symbol, type(exc).__name__)
        return _UNAVAILABLE


def _statement_view(highlights: dict[str, Any], statement: Statement) -> dict[str, Any]:
    section = next(
        (s for s in highlights.get("sections") or [] if s.get("key") == _SECTION_KEY[statement]),
        None,
    )
    rows = [
        {
            "key": row["key"],
            "label": row["label"],
            "unit": row.get("unit"),
            "values": {period: cell["display"] for period, cell in row["values"].items()},
        }
        for row in (section or {}).get("rows") or []
    ]
    return {
        "statement": statement,
        "currency": highlights.get("currency"),
        "unit_note": highlights.get("unit_note"),
        "periods": [
            {"key": p["key"], "label": p.get("label") or p["key"]}
            for p in highlights.get("periods") or []
        ],
        "rows": rows,
        "data_quality": highlights.get("data_quality") or {"status": "unavailable"},
    }


def get_financials_cached(symbol: str, statement: Statement = "income") -> dict[str, Any]:
    highlights = swr_cached_with_degraded_ttl(
        f"financials:{symbol}",
        lambda: _build_financials(symbol),
        FINANCIALS_TTL_SECONDS,
        degraded_ttl=DEGRADED_FINANCIALS_TTL_SECONDS,
        is_degraded=lambda value: (value.get("data_quality") or {}).get("status") == "unavailable",
    )
    return _statement_view(highlights, statement)
