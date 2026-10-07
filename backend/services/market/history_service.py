"""Small historical series for the Research cards, straight from yfinance accessors:
analyst rating history, quarterly revenue/earnings trend and dividend payments.

yfinance's historical accessors change shape across releases, so every fetch is
best-effort: any failure yields an empty series (logged) rather than a 500.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from services.market.yfinance_service import _as_float, market_cache, swr_cached_with_degraded_ttl

logger = logging.getLogger(__name__)

ANALYST_HISTORY_TTL_SECONDS = 3600
GROWTH_TREND_TTL_SECONDS = 3600
DIVIDEND_HISTORY_TTL_SECONDS = 86400
DEGRADED_HISTORY_TTL_SECONDS = 300  # empty may be a transient failure: look again soon
GROWTH_QUARTERS = 8
DIVIDEND_PAYMENTS = 12

__all__ = [
    "market_cache",
    "get_analyst_history_cached",
    "get_growth_trend_cached",
    "get_dividend_history_cached",
]


def _ticker(symbol: str) -> Any:
    from tradingagents.dataflows.providers.yfinance_runtime import yf  # noqa: PLC0415

    return yf.Ticker(symbol)


def _best_effort(
    kind: str, symbol: str, empty: dict[str, Any], build: Callable[[], dict[str, Any]]
):
    try:
        return build()
    except Exception as exc:  # noqa: BLE001
        logger.warning("%s failed for %s: %s", kind, symbol, type(exc).__name__)
        return empty


def _cached(kind: str, symbol: str, series_key: str, ttl: float, fetch: Callable[[], dict]):
    return swr_cached_with_degraded_ttl(
        f"{kind}:{symbol}",
        fetch,
        ttl,
        degraded_ttl=DEGRADED_HISTORY_TTL_SECONDS,
        is_degraded=lambda value: not value.get(series_key),
    )


# ── analyst rating history ────────────────────────────────────────────────────


def _fetch_analyst_history(symbol: str) -> dict[str, Any]:
    empty = {"ticker": symbol, "history": []}

    def build() -> dict[str, Any]:
        frame = _ticker(symbol).recommendations
        if frame is None or getattr(frame, "empty", True):
            return empty
        history = [
            {
                "period": str(row.get("period", "")),
                "strong_buy": _as_float(row.get("strongBuy")),
                "buy": _as_float(row.get("buy")),
                "hold": _as_float(row.get("hold")),
                "sell": _as_float(row.get("sell")),
                "strong_sell": _as_float(row.get("strongSell")),
            }
            for _, row in frame.iterrows()
        ]
        history.reverse()  # yfinance lists the newest period first; charts read oldest to newest
        return {"ticker": symbol, "history": history}

    return _best_effort("Analyst history", symbol, empty, build)


def get_analyst_history_cached(symbol: str) -> dict[str, Any]:
    return _cached(
        "analyst_history",
        symbol,
        "history",
        ANALYST_HISTORY_TTL_SECONDS,
        lambda: _fetch_analyst_history(symbol),
    )


# ── quarterly growth trend ────────────────────────────────────────────────────


def _fetch_growth_trend(symbol: str) -> dict[str, Any]:
    empty = {"ticker": symbol, "quarters": []}

    def build() -> dict[str, Any]:
        frame = _ticker(symbol).quarterly_income_stmt  # rows = line items, columns = quarter ends
        if frame is None or getattr(frame, "empty", True):
            return empty

        def line(name: str) -> Any:
            return frame.loc[name] if name in frame.index else None

        revenue, earnings = line("Total Revenue"), line("Net Income")
        quarters = []
        for period in sorted(frame.columns)[-GROWTH_QUARTERS:]:
            quarters.append(
                {
                    "period": period.strftime("%Y-%m-%d"),
                    "revenue": _as_float(revenue[period]) if revenue is not None else None,
                    "earnings": _as_float(earnings[period]) if earnings is not None else None,
                }
            )
        return {"ticker": symbol, "quarters": quarters}

    return _best_effort("Growth trend", symbol, empty, build)


def get_growth_trend_cached(symbol: str) -> dict[str, Any]:
    return _cached(
        "growth_trend",
        symbol,
        "quarters",
        GROWTH_TREND_TTL_SECONDS,
        lambda: _fetch_growth_trend(symbol),
    )


# ── dividend history ──────────────────────────────────────────────────────────


def _fetch_dividend_history(symbol: str) -> dict[str, Any]:
    empty = {"ticker": symbol, "payments": []}

    def build() -> dict[str, Any]:
        series = _ticker(symbol).dividends
        if series is None or len(series) == 0:
            return empty
        payments = [
            {"date": index.strftime("%Y-%m-%d"), "amount": _as_float(value)}
            for index, value in series.tail(DIVIDEND_PAYMENTS).items()
        ]
        return {"ticker": symbol, "payments": payments}

    return _best_effort("Dividend history", symbol, empty, build)


def get_dividend_history_cached(symbol: str) -> dict[str, Any]:
    return _cached(
        "dividend_history",
        symbol,
        "payments",
        DIVIDEND_HISTORY_TTL_SECONDS,
        lambda: _fetch_dividend_history(symbol),
    )
