"""Technical indicators for the Research TECHNICALS tab: the engine's
`build_technical_entry` (same builder as the Technical Analyst) over cached daily OHLCV."""

from __future__ import annotations

from typing import Any

from tradingagents.technical.entry_quality import build_technical_entry

from services.market.ohlcv_service import fetch_ohlcv_range
from services.market.yfinance_service import market_cache, swr_cached_with_degraded_ttl

TECHNICALS_TTL_SECONDS = 300
DEGRADED_TECHNICALS_TTL_SECONDS = 30

__all__ = ["market_cache", "get_technicals_cached"]


def get_technicals_cached(symbol: str) -> dict[str, Any]:
    # 1Y of daily candles: enough history for SMA200 and the 30-row indicator minimum.
    return swr_cached_with_degraded_ttl(
        f"technicals:{symbol}",
        lambda: build_technical_entry(fetch_ohlcv_range(symbol, "1Y", None)),
        TECHNICALS_TTL_SECONDS,
        degraded_ttl=DEGRADED_TECHNICALS_TTL_SECONDS,
        is_degraded=lambda value: not value.get("available"),
    )
