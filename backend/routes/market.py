"""Market data endpoints — lightweight ticker quotes for the dashboard ticker tape."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Query, Request
from rate_limiter import limit_request, request_policy
from routes.validation import normalize_ticker_symbol
from schemas import MarketQuotesResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# Default tickers shown on the dashboard ticker tape.
_DEFAULT_TICKERS: list[str] = [
    "BBCA.JK",
    "BBRI.JK",
    "TLKM.JK",
    "NVDA",
    "AAPL",
    "TSLA",
    "MSFT",
    "META",
    "GOTO.JK",
    "ASII.JK",
]


def _fetch_quote(symbol: str) -> dict:
    """Return a minimal quote dict for *symbol* using yfinance fast_info."""
    try:
        from tradingagents.yfinance_runtime import yf  # noqa: PLC0415

        ticker = yf.Ticker(symbol)
        info = ticker.fast_info

        # fast_info attributes vary by symbol/exchange; fall back gracefully.
        previous_close = getattr(info, "previous_close", None) or getattr(info, "regularMarketPreviousClose", None)
        last_price = getattr(info, "last_price", None) or getattr(info, "regularMarketPrice", None)

        if previous_close and last_price and previous_close != 0:
            raw_chg = (last_price - previous_close) / previous_close * 100
            sign = "+" if raw_chg >= 0 else ""
            chg_str = f"{sign}{raw_chg:.2f}%"
            pos = raw_chg >= 0
        else:
            chg_str = "N/A"
            pos = True

        return {
            "sym": symbol,
            "chg": chg_str,
            "pos": pos,
            "price": round(last_price, 2) if last_price else None,
            "error": False,
        }

    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch quote for %s: %s", symbol, exc)
        return {"sym": symbol, "chg": "N/A", "pos": True, "price": None, "error": True}


async def _fetch_quotes(symbols: list[str]) -> list[dict]:
    """Fetch quotes without blocking the FastAPI event loop."""
    if not symbols:
        return []
    tasks = [asyncio.to_thread(_fetch_quote, symbol) for symbol in symbols]
    return await asyncio.gather(*tasks)


@router.get("/market/quotes", tags=["market"], response_model=MarketQuotesResponse)
async def get_market_quotes(
    request: Request,
    symbols: str = Query(
        default=",".join(_DEFAULT_TICKERS),
        description="Comma-separated list of ticker symbols, e.g. BBCA.JK,NVDA",
    ),
) -> dict:
    """Return latest price-change data for a list of ticker symbols.

    Fetches data from yfinance using ``fast_info`` (single HTTP call per
    symbol, no historical download).  Results are returned even when some
    symbols fail — failed tickers include ``"error": true`` and ``"chg": "N/A"``.
    """
    async with limit_request(request, request_policy()):
        raw_symbols = [s.strip() for s in symbols.split(",") if s.strip()]

        # Cap at 20 to avoid overloading yfinance on a single request.
        capped = [normalize_ticker_symbol(sym) for sym in raw_symbols[:20]]

        quotes = await _fetch_quotes(capped)

    return {"quotes": quotes}
