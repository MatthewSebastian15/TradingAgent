"""Market data endpoints — lightweight ticker quotes and yfinance symbol search."""

from __future__ import annotations

import asyncio
import logging
from time import monotonic
from typing import Any

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
_QUOTE_CACHE_TTL_SECONDS = 60.0
_SEARCH_CACHE_TTL_SECONDS = 60.0
_QUOTE_CACHE: dict[tuple[str, ...], tuple[float, list[dict]]] = {}
_SEARCH_CACHE: dict[tuple[str, int], tuple[float, list[dict[str, Any]]]] = {}


def _clone_quotes(quotes: list[dict]) -> list[dict]:
    return [dict(item) for item in quotes]


def _clone_search_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [dict(item) for item in results]


def _fast_info_value(info: Any, *names: str) -> Any:
    for name in names:
        if isinstance(info, dict) and name in info:
            return info.get(name)
        value = getattr(info, name, None)
        if value is not None:
            return value
    return None


def _fetch_quote(symbol: str) -> dict:
    """Return a minimal quote dict for *symbol* using yfinance fast_info."""
    try:
        from tradingagents.yfinance_runtime import yf  # noqa: PLC0415

        ticker = yf.Ticker(symbol)
        info = ticker.fast_info

        # fast_info attributes vary by symbol/exchange; fall back gracefully.
        previous_close = _fast_info_value(info, "previous_close", "regularMarketPreviousClose")
        last_price = _fast_info_value(info, "last_price", "regularMarketPrice")

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


def _search_instance(yf: Any, query: str, limit: int) -> Any:
    try:
        return yf.Search(
            query=query,
            max_results=limit,
            news_count=0,
            enable_fuzzy_query=True,
        )
    except TypeError:
        try:
            return yf.Search(query, max_results=limit, news_count=0, enable_fuzzy_query=True)
        except TypeError:
            return yf.Search(query)


def _extract_search_quotes(search: Any) -> list[dict[str, Any]]:
    quotes = getattr(search, "quotes", None)
    if isinstance(quotes, list):
        return [item for item in quotes if isinstance(item, dict)]

    all_results = getattr(search, "all", None)
    if callable(all_results):
        all_results = all_results()
    if isinstance(all_results, dict):
        candidates = all_results.get("quotes") or all_results.get("quotesResult") or []
        if isinstance(candidates, dict):
            candidates = candidates.get("result") or []
        if isinstance(candidates, list):
            return [item for item in candidates if isinstance(item, dict)]

    return []


def _fetch_last_price(yf: Any, symbol: str) -> float | None:
    try:
        info = yf.Ticker(symbol).fast_info
        value = _fast_info_value(
            info,
            "last_price",
            "regularMarketPrice",
            "lastPrice",
            "previous_close",
            "regularMarketPreviousClose",
        )
        number_value = float(value) if value is not None else None
        return round(number_value, 2) if number_value is not None else None
    except Exception as exc:  # noqa: BLE001
        logger.debug("Failed to fetch search price for %s: %s", symbol, exc)
        return None


def _clean_search_result(raw: dict[str, Any], yf: Any) -> dict[str, Any] | None:
    symbol = str(raw.get("symbol") or "").strip().upper()
    if not symbol:
        return None

    name = (
        raw.get("shortname")
        or raw.get("longname")
        or raw.get("name")
        or raw.get("displayName")
        or symbol
    )
    exchange = raw.get("exchDisp") or raw.get("exchange") or raw.get("fullExchangeName") or ""
    quote_type = raw.get("quoteType") or raw.get("typeDisp") or raw.get("type") or ""

    return {
        "symbol": symbol,
        "name": str(name).strip(),
        "exchange": str(exchange).strip().upper(),
        "type": str(quote_type).strip().upper(),
        "price": _fetch_last_price(yf, symbol),
    }


def _search_tickers(query: str, limit: int) -> list[dict[str, Any]]:
    try:
        from tradingagents.yfinance_runtime import yf  # noqa: PLC0415

        search = _search_instance(yf, query, limit)
        raw_quotes = _extract_search_quotes(search)
        results: list[dict[str, Any]] = []
        seen: set[str] = set()

        for raw in raw_quotes:
            item = _clean_search_result(raw, yf)
            if not item or item["symbol"] in seen:
                continue
            seen.add(item["symbol"])
            results.append(item)
            if len(results) >= limit:
                break

        return results
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to search yfinance tickers for %r: %s", query, exc)
        return []


@router.get("/market/search", tags=["market"])
async def search_market_tickers(
    request: Request,
    q: str = Query(..., min_length=2, description="Ticker or company search query."),
    limit: int = Query(default=10, ge=1, le=20, description="Maximum number of search results."),
) -> dict[str, list[dict[str, Any]]]:
    """Search yfinance tickers and return canonical symbols for the frontend autocomplete."""
    async with limit_request(request, request_policy()):
        query = q.strip()
        if len(query) < 2:
            return {"results": []}

        cache_key = (query.lower(), limit)
        now = monotonic()
        cached = _SEARCH_CACHE.get(cache_key)
        if cached is not None:
            cached_at, cached_results = cached
            if now - cached_at <= _SEARCH_CACHE_TTL_SECONDS:
                return {"results": _clone_search_results(cached_results)}

        results = await asyncio.to_thread(_search_tickers, query, limit)
        _SEARCH_CACHE[cache_key] = (monotonic(), _clone_search_results(results))

    return {"results": results}


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
    symbols fail — failed tickers include ``\"error\": true`` and ``\"chg\": \"N/A\"``.
    """
    async with limit_request(request, request_policy()):
        raw_symbols = [s.strip() for s in symbols.split(",") if s.strip()]

        # Cap at 20 to avoid overloading yfinance on a single request.
        capped = [normalize_ticker_symbol(sym) for sym in raw_symbols[:20]]

        cache_key = tuple(capped)
        cached_at, cached_quotes = _QUOTE_CACHE.get(cache_key, (0.0, []))
        now = monotonic()
        if cached_quotes and now - cached_at <= _QUOTE_CACHE_TTL_SECONDS:
            return {"quotes": _clone_quotes(cached_quotes)}

        quotes = await _fetch_quotes(capped)
        _QUOTE_CACHE[cache_key] = (now, _clone_quotes(quotes))

    return {"quotes": quotes}
