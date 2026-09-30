from __future__ import annotations

from collections.abc import Callable
from typing import Any

from tradingagents.dataflows.providers.source_priority import market_from_symbol
from tradingagents.prompt_context import parse_ohlcv_csv

BENCHMARK_BY_MARKET = {"US": "^GSPC", "IDX": "^JKSE"}
US_SECTOR_ETFS = {
    "Technology": "XLK",
    "Financial Services": "XLF",
    "Healthcare": "XLV",
    "Consumer Cyclical": "XLY",
    "Consumer Defensive": "XLP",
    "Energy": "XLE",
    "Industrials": "XLI",
    "Basic Materials": "XLB",
    "Real Estate": "XLRE",
    "Utilities": "XLU",
    "Communication Services": "XLC",
}
_WINDOWS = {"5d": 5, "20d": 20, "60d": 60}


def _closes(csv_text: str) -> list[float]:
    return [row["close"] for row in parse_ohlcv_csv(csv_text or "") if row.get("close")]


def _returns(closes: list[float]) -> dict[str, float | None]:
    return {
        label: round((closes[-1] - closes[-days - 1]) / closes[-days - 1] * 100, 2)
        if len(closes) > days and closes[-days - 1]
        else None
        for label, days in _WINDOWS.items()
    }


def _block(
    symbol: str, fetch: Callable[[str], str], stock_returns: dict[str, float | None]
) -> dict[str, Any]:
    try:
        closes = _closes(fetch(symbol))
    except Exception as exc:
        return {"symbol": symbol, "available": False, "reason": str(exc)[:200]}
    if len(closes) < 6:
        return {"symbol": symbol, "available": False, "reason": "insufficient_history"}
    returns = _returns(closes)
    return {
        "symbol": symbol,
        "available": True,
        "returns_percent": returns,
        "relative_strength_pts": {
            label: round(stock_returns[label] - value, 2)
            if stock_returns.get(label) is not None and value is not None
            else None
            for label, value in returns.items()
        },
    }


def build_benchmark_context(
    *,
    ticker: str,
    sector: str | None,
    stock_price_csv: str,
    fetch_price_csv: Callable[[str], str],
) -> dict[str, Any]:
    market = market_from_symbol(ticker)
    benchmark = BENCHMARK_BY_MARKET.get(market)
    if benchmark is None:
        return {"available": False, "reason": f"No benchmark configured for market {market}."}
    stock_returns = _returns(_closes(stock_price_csv))
    context: dict[str, Any] = {
        "available": True,
        "benchmark": _block(benchmark, fetch_price_csv, stock_returns),
    }
    etf = US_SECTOR_ETFS.get(str(sector or "")) if market == "US" else None
    if etf:
        context["sector"] = {"sector": sector, **_block(etf, fetch_price_csv, stock_returns)}
    return context
