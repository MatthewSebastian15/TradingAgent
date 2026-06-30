"""Market data endpoints — lightweight ticker quotes and yfinance symbol search."""

from __future__ import annotations

import asyncio
import logging
import re
from collections import OrderedDict
from datetime import datetime
from time import monotonic
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Query, Request

from errors import BadRequestError
from rate_limiter import RateLimitPolicy, limit_request
from schemas import (
    MarketMoversResponse,
    MarketOverviewRequest,
    MarketOverviewResponse,
    MarketPresetsResponse,
    MarketQuotesResponse,
    StockOverviewResponse,
    SymbolValidationResponse,
)
from services.market_ohlcv_service import (
    OHLCV_RANGE_OPTIONS,
    fetch_ohlcv_range,
    parse_ohlcv_trade_date,
)
from services.market_search_index import get_popular_tickers, search_local_tickers
from services.market_yfinance_service import (
    build_stock_overview,
    dedupe_symbols,
    get_market_movers,
    get_market_presets,
    get_overview_data,
    normalize_market_symbol,
    validate_symbol,
)

logger = logging.getLogger(__name__)

router = APIRouter()

_MARKET_DATA_POLICY = RateLimitPolicy(scope="market", max_per_minute=180, max_concurrent=32)


def _market_data_limit(request: Request):
    """Rate-limit market data separately from long-running analysis jobs."""
    return limit_request(request, _MARKET_DATA_POLICY)


# Default tickers shown on the dashboard ticker tape.
_DEFAULT_TICKERS: list[str] = [
    "ES=F",
    "NQ=F",
    "^VIX",
    "DX-Y.NYB",
    "^TNX",
    "BTC-USD",
    "CL=F",
    "GC=F",
    "^N225",
    "^JKSE",
]
_QUOTE_SYMBOL_RE = re.compile(r"^[A-Z0-9^]{1,15}(?:[.=:-][A-Z0-9]{1,12}){0,3}$")
_QUOTE_CACHE_TTL_SECONDS = 90.0
_SEARCH_CACHE_TTL_SECONDS = 60.0
_SPARKLINE_CACHE_TTL_SECONDS = 300.0
_QUOTE_CACHE: OrderedDict[tuple[str, ...], tuple[float, list[dict]]] = OrderedDict()
_SEARCH_CACHE: OrderedDict[tuple[str, int, str, str], tuple[float, list[dict[str, Any]]]] = (
    OrderedDict()
)
_SPARKLINE_CACHE: OrderedDict[tuple[tuple[str, ...], str], tuple[float, dict[str, list[float]]]] = (
    OrderedDict()
)
_MOVER_LIMITS = {5, 10, 15, 20}
_MAX_CACHE_ENTRIES = 500


def _cache_set(cache: OrderedDict, key, value) -> None:
    cache[key] = value
    cache.move_to_end(key)  # most-recently-used end
    if len(cache) > _MAX_CACHE_ENTRIES:
        cache.popitem(last=False)  # evict least-recently-used


def _cache_get(cache: OrderedDict, key, default=None):
    if key in cache:
        cache.move_to_end(key)  # reads count as use, so LRU tracks access not insertion
        return cache[key]
    return default


_IDX_AUTO_SUFFIX_SYMBOLS = {
    "AALI",
    "ACES",
    "ADRO",
    "AKRA",
    "AMMN",
    "ANTM",
    "ARTO",
    "ASII",
    "BBCA",
    "BBNI",
    "BBRI",
    "BBTN",
    "BMRI",
    "BRIS",
    "BRPT",
    "CPIN",
    "ESSA",
    "EXCL",
    "GOTO",
    "ICBP",
    "INCO",
    "INDF",
    "INKP",
    "INTP",
    "ISAT",
    "ITMG",
    "KLBF",
    "MDKA",
    "MEDC",
    "PGAS",
    "PTBA",
    "SMGR",
    "TLKM",
    "UNTR",
    "UNVR",
}


def _normalize_quote_symbol(symbol: str) -> str:
    "Normalize symbols used by the global ticker tape without blocking Yahoo index/future syntax."
    normalized = symbol.strip().upper() if isinstance(symbol, str) else symbol
    if (
        isinstance(normalized, str)
        and "." not in normalized
        and normalized in _IDX_AUTO_SUFFIX_SYMBOLS
    ):
        normalized = f"{normalized}.JK"
    if not isinstance(normalized, str) or not _QUOTE_SYMBOL_RE.fullmatch(normalized):
        raise BadRequestError(
            "Invalid ticker symbol.",
            details={
                "fields": {
                    ("ticker"): (
                        "Ticker must be a canonical yfinance quote symbol, for example ES=F, "
                        + "^VIX, DX-Y.NYB, BTC-USD, or AAPL."
                    )
                }
            },
        )
    return normalized


def _normalize_market_request_symbols(symbols: list[str]) -> list[str]:
    if not isinstance(symbols, list):
        raise BadRequestError(
            "Invalid market overview request.",
            details={"fields": {"symbols": "symbols must be an array."}},
        )

    errors: dict[str, str] = {}
    normalized: list[str] = []
    for index, symbol in enumerate(symbols):
        if not isinstance(symbol, str):
            errors[f"symbols[{index}]"] = "symbol must be string."
            continue
        value = normalize_market_symbol(symbol)
        if not value:
            errors[f"symbols[{index}]"] = "symbol must not be empty."
            continue
        if not _QUOTE_SYMBOL_RE.fullmatch(value):
            errors[f"symbols[{index}]"] = "symbol must be a canonical yfinance symbol."
            continue
        normalized.append(value)

    normalized = dedupe_symbols(normalized)
    if len(normalized) < 3:
        errors["symbols"] = "symbols.length must be >= 3."
    if len(normalized) > 6:
        errors["symbols"] = "symbols.length must be <= 6."

    if errors:
        raise BadRequestError("Invalid market overview request.", details={"fields": errors})
    return normalized


def _validate_movers_query(country: str, exchange: str, limit: int) -> tuple[str, str, int]:
    normalized_country = str(country or "").strip()
    normalized_exchange = str(exchange or "").strip()
    errors: dict[str, str] = {}

    if not normalized_country:
        errors["country"] = "country required."
    if not normalized_exchange:
        errors["exchange"] = "exchange required."
    if limit not in _MOVER_LIMITS:
        errors["limit"] = "limit must be one of 5, 10, 15, 20."

    if errors:
        raise BadRequestError("Invalid market movers request.", details={"fields": errors})
    return normalized_country, normalized_exchange, limit


def _clone_quotes(quotes: list[dict]) -> list[dict]:
    return [dict(item) for item in quotes]


def _clone_search_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [dict(item) for item in results]


@router.get("/market/presets", tags=["market"], response_model=MarketPresetsResponse)
async def get_market_preset_data(request: Request) -> dict[str, Any]:
    async with _market_data_limit(request):
        return get_market_presets()


@router.get("/market/validate-symbol", tags=["market"], response_model=SymbolValidationResponse)
async def validate_market_symbol(
    request: Request,
    symbol: str = Query(..., min_length=1, description="Yahoo Finance symbol."),
) -> dict[str, Any]:
    async with _market_data_limit(request):
        normalized_symbol = _normalize_quote_symbol(symbol)
        return await asyncio.to_thread(validate_symbol, normalized_symbol)


@router.post("/market/overview", tags=["market"], response_model=MarketOverviewResponse)
async def get_market_overview(
    payload: MarketOverviewRequest,
    request: Request,
    force_refresh: bool = Query(default=False),
) -> dict[str, Any]:
    normalized_symbols = _normalize_market_request_symbols(payload.symbols)
    async with _market_data_limit(request):
        return await asyncio.to_thread(
            get_overview_data, normalized_symbols, force_refresh=force_refresh
        )


@router.get("/market/movers", tags=["market"], response_model=MarketMoversResponse)
async def get_market_mover_data(
    request: Request,
    country: str = Query(..., min_length=1),
    exchange: str = Query(..., min_length=1),
    limit: int = Query(default=5),
) -> dict[str, Any]:
    normalized_country, normalized_exchange, normalized_limit = _validate_movers_query(
        country, exchange, limit
    )
    async with _market_data_limit(request):
        return await asyncio.to_thread(
            get_market_movers, normalized_country, normalized_exchange, normalized_limit
        )


def _as_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


_OVERVIEW_CACHE_TTL_SECONDS = 300.0
_OVERVIEW_CACHE: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()


@router.get("/market/stock-overview", tags=["market"], response_model=StockOverviewResponse)
async def get_stock_overview_data(
    request: Request,
    ticker: str = Query(..., min_length=1, description="Ticker symbol, e.g. BBCA.JK"),
) -> dict[str, Any]:
    async with _market_data_limit(request):
        normalized = _normalize_quote_symbol(ticker)
        cache_key = f"overview:{normalized}"
        cached = _cache_get(_OVERVIEW_CACHE, cache_key)
        if cached:
            ts, payload = cached
            if monotonic() - ts < _OVERVIEW_CACHE_TTL_SECONDS:
                return payload

    payload = await asyncio.to_thread(build_stock_overview, normalized)
    _cache_set(_OVERVIEW_CACHE, cache_key, (monotonic(), payload))
    return payload


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
        volume = _as_float(_fast_info_value(info, "last_volume", "regularMarketVolume", "volume"))

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
            "volume": volume,
            "error": False,
        }

    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch quote for %s: %s", symbol, exc)
        return {
            "sym": symbol,
            "chg": "N/A",
            "pos": True,
            "price": None,
            "volume": None,
            "error": True,
        }


_QUOTE_FETCH_TIMEOUT_SECONDS = 12.0
_QUOTES_INFLIGHT: dict[tuple, asyncio.Future] = {}


async def _fetch_one_quote_timed(symbol: str) -> dict:
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_fetch_quote, symbol),
            timeout=_QUOTE_FETCH_TIMEOUT_SECONDS,
        )
    except Exception:
        return {
            "sym": symbol,
            "chg": "N/A",
            "pos": True,
            "price": None,
            "volume": None,
            "error": True,
        }


async def _fetch_quotes(symbols: list[str]) -> list[dict]:
    """Fetch quotes without blocking the FastAPI event loop."""
    if not symbols:
        return []
    return list(await asyncio.gather(*[_fetch_one_quote_timed(s) for s in symbols]))


def _clone_sparklines(payload: dict[str, list[float]]) -> dict[str, list[float]]:
    return {symbol: list(values) for symbol, values in payload.items()}


def _sparkline_values_from_payload(payload: dict[str, Any]) -> list[float]:
    values: list[float] = []
    for point in payload.get("points") or payload.get("data") or []:
        value = _as_float(point.get("close") if isinstance(point, dict) else None)
        if value is not None:
            values.append(value)
    return values[-20:]


def _fetch_sparkline(symbol: str, range_key: str) -> list[float]:
    trade_date = datetime.utcnow().strftime("%Y-%m-%d")
    payload = fetch_ohlcv_range(symbol, range_key, trade_date)
    return _sparkline_values_from_payload(payload)


async def _fetch_sparklines(symbols: list[str], range_key: str) -> dict[str, list[float]]:
    if not symbols:
        return {}

    tasks = [asyncio.to_thread(_fetch_sparkline, symbol, range_key) for symbol in symbols]
    values = await asyncio.gather(*tasks)
    return {symbol: list(series) for symbol, series in zip(symbols, values, strict=False)}


def _merge_search_results(*groups: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in [item for group in groups for item in group]:
        symbol = str(item.get("symbol") or "").strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        merged.append({**item, "symbol": symbol})
        if len(merged) >= limit:
            break
    return merged


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


def _infer_search_market(symbol: str, asset_type: str) -> str:
    if symbol.endswith(".JK"):
        return "ID"
    if asset_type == "CRYPTO" or symbol.endswith("-USD"):
        return "CRYPTO"
    if asset_type == "FX" or symbol.endswith("=X"):
        return "FX"
    return "US"


def _clean_search_result(raw: dict[str, Any]) -> dict[str, Any] | None:
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
    qt_raw = raw.get("quoteType") or raw.get("typeDisp") or raw.get("type") or ""
    quote_type = str(qt_raw).strip().upper()

    return {
        "symbol": symbol,
        "name": str(name).strip(),
        "exchange": str(exchange).strip().upper(),
        "type": quote_type,
        "market": _infer_search_market(symbol, quote_type),
        "source": "yfinance_search",
    }


def _search_tickers(query: str, limit: int) -> list[dict[str, Any]]:
    try:
        from tradingagents.yfinance_runtime import yf  # noqa: PLC0415

        search = _search_instance(yf, query, limit)
        raw_quotes = _extract_search_quotes(search)
        results: list[dict[str, Any]] = []
        seen: set[str] = set()

        for raw in raw_quotes:
            item = _clean_search_result(raw)
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


def _refresh_search_cache(
    query: str,
    limit: int,
    market: str,
    asset_type: str,
    local_results: list[dict[str, Any]],
) -> None:
    remote_results = _search_tickers(query, limit)
    results = _merge_search_results(local_results, remote_results, limit=limit)
    _cache_set(
        _SEARCH_CACHE,
        (query.lower(), limit, market, asset_type),
        (monotonic(), _clone_search_results(results)),
    )


def _search_meta(
    *,
    started_at: float,
    query: str,
    limit: int,
    market: str,
    asset_type: str,
    source: str,
    cache_hit: bool = False,
    remote_refresh_queued: bool = False,
) -> dict[str, Any]:
    return {
        "query": query,
        "limit": limit,
        "market": market,
        "type": asset_type,
        "source": source,
        "cache_hit": cache_hit,
        "remote_refresh_queued": remote_refresh_queued,
        "latency_ms": int((monotonic() - started_at) * 1000),
    }


@router.get("/market/search", tags=["market"])
async def search_market_tickers(
    background_tasks: BackgroundTasks,
    request: Request,
    q: str = Query(default="", description="Ticker or company search query."),
    limit: int = Query(default=10, ge=1, le=20, description="Maximum number of search results."),
    market: str = Query(default="ALL"),
    asset_type: str = Query(default="ALL", alias="type"),
) -> dict[str, Any]:
    """Search ticker metadata without blocking on yfinance quote data."""
    started_at = monotonic()
    async with _market_data_limit(request):
        query = q.strip()
        normalized_market = str(market or "ALL").strip().upper() or "ALL"
        normalized_type = str(asset_type or "ALL").strip().upper() or "ALL"
        if len(query) < 2:
            return {
                "results": [],
                "meta": _search_meta(
                    started_at=started_at,
                    query=query,
                    limit=limit,
                    market=normalized_market,
                    asset_type=normalized_type,
                    source="empty",
                    remote_refresh_queued=False,
                ),
            }

        cache_key = (query.lower(), limit, normalized_market, normalized_type)
        now = monotonic()
        local_results = search_local_tickers(
            query, limit, market=normalized_market, asset_type=normalized_type
        )
        if len(local_results) >= limit:
            source = (
                "manual_symbol"
                if local_results[0].get("source") == "manual_symbol"
                else "local_universe"
            )
            return {
                "results": local_results[:limit],
                "meta": _search_meta(
                    started_at=started_at,
                    query=query,
                    limit=limit,
                    market=normalized_market,
                    asset_type=normalized_type,
                    source=source,
                ),
            }

        cached = _cache_get(_SEARCH_CACHE, cache_key)
        if cached is not None:
            cached_at, cached_results = cached
            if now - cached_at <= _SEARCH_CACHE_TTL_SECONDS:
                results = _merge_search_results(
                    local_results, _clone_search_results(cached_results), limit=limit
                )
                if local_results and cached_results:
                    source = "local_plus_remote_cache"
                elif cached_results:
                    source = "remote_cache"
                elif local_results and local_results[0].get("source") == "manual_symbol":
                    source = "manual_symbol"
                elif local_results:
                    source = "local_universe"
                else:
                    source = "empty"
                return {
                    "results": results,
                    "meta": _search_meta(
                        started_at=started_at,
                        query=query,
                        limit=limit,
                        market=normalized_market,
                        asset_type=normalized_type,
                        source=source,
                        cache_hit=True,
                    ),
                }

        background_tasks.add_task(
            _refresh_search_cache,
            query,
            limit,
            normalized_market,
            normalized_type,
            _clone_search_results(local_results),
        )
        results = local_results[:limit]
        if results and results[0].get("source") == "manual_symbol":
            source = "manual_symbol"
        elif results:
            source = "local_with_remote_refresh_queued"
        else:
            source = "empty"

    return {
        "results": results,
        "meta": _search_meta(
            started_at=started_at,
            query=query,
            limit=limit,
            market=normalized_market,
            asset_type=normalized_type,
            source=source,
            remote_refresh_queued=True,
        ),
    }


@router.get("/market/search/warmup", tags=["market"])
async def warmup_market_search(
    request: Request, limit: int = Query(default=100, ge=1, le=100)
) -> dict[str, Any]:
    """Return lightweight popular search metadata for local-first autocomplete warmup."""
    async with _market_data_limit(request):
        popular = get_popular_tickers(limit)

    return {
        "popular": popular,
        "markets": ["ALL", "US", "ID", "ETF", "FX", "CRYPTO", "INDEX"],
        "types": ["ALL", "EQUITY", "ETF", "INDEX", "FX", "CRYPTO", "FUTURE"],
        "meta": {"source": "local_universe", "count": len(popular)},
    }


@router.get("/market/ohlcv", tags=["market"])
async def get_market_ohlcv(
    request: Request,
    ticker: str = Query(..., min_length=1, description="Ticker symbol."),
    range_key: str = Query(
        default="1Y", alias="range", description="One of YTD, 5Y, 2Y, 1Y, 6M, 3M, 1M, 1W."
    ),
    trade_date: str | None = Query(default=None, description="Optional YYYY-MM-DD upper bound."),
) -> dict[str, Any]:
    async with _market_data_limit(request):
        symbol = _normalize_quote_symbol(ticker)
        normalized_range = str(range_key or "").strip().upper()
        if normalized_range not in OHLCV_RANGE_OPTIONS:
            raise BadRequestError(
                "Invalid chart range.",
                details={
                    "fields": {"range": "Range must be one of YTD, 5Y, 2Y, 1Y, 6M, 3M, 1M, 1W."}
                },
            )
        parsed_trade_date = parse_ohlcv_trade_date(trade_date).strftime("%Y-%m-%d")
        payload = await asyncio.to_thread(
            fetch_ohlcv_range, symbol, normalized_range, parsed_trade_date
        )

    return payload


@router.get("/market/sparklines", tags=["market"])
async def get_market_sparklines(
    request: Request,
    symbols: str = Query(..., min_length=1, description="Comma-separated list of ticker symbols."),
    range_key: str = Query(
        default="1M", alias="range", description="One of YTD, 5Y, 2Y, 1Y, 6M, 3M, 1M, 1W."
    ),
) -> dict[str, dict[str, list[float]]]:
    async with _market_data_limit(request):
        raw_symbols = [symbol.strip() for symbol in symbols.split(",") if symbol.strip()]
        if len(raw_symbols) > 20:
            raise BadRequestError(
                "Too many ticker symbols.",
                details={"fields": {"symbols": "symbols.length must be <= 20."}},
            )

        normalized_range = str(range_key or "").strip().upper()
        if normalized_range not in OHLCV_RANGE_OPTIONS:
            raise BadRequestError(
                "Invalid chart range.",
                details={
                    "fields": {"range": "Range must be one of YTD, 5Y, 2Y, 1Y, 6M, 3M, 1M, 1W."}
                },
            )

        capped = [_normalize_quote_symbol(symbol) for symbol in raw_symbols]
        cache_key = (tuple(capped), normalized_range)
        cached_at, cached_sparklines = _cache_get(_SPARKLINE_CACHE, cache_key, (0.0, {}))
        now = monotonic()
        if cached_sparklines and now - cached_at <= _SPARKLINE_CACHE_TTL_SECONDS:
            return {"sparklines": _clone_sparklines(cached_sparklines)}

        sparklines = await _fetch_sparklines(capped, normalized_range)
        _cache_set(_SPARKLINE_CACHE, cache_key, (now, _clone_sparklines(sparklines)))

    return {"sparklines": sparklines}


@router.get("/market/quotes", tags=["market"], response_model=MarketQuotesResponse)
async def get_market_quotes(
    request: Request,
    symbols: str = Query(
        default=",".join(_DEFAULT_TICKERS),
        description="Comma-separated list of yfinance symbols, e.g. ES=F,^VIX,BTC-USD",
    ),
) -> dict:
    """Return latest price-change data for a list of ticker symbols.

    Fetches data from yfinance using ``fast_info`` (single HTTP call per
    symbol, no historical download).  Results are returned even when some
    symbols fail — failed tickers include ``\"error\": true`` and ``\"chg\": \"N/A\"``.
    """
    raw_symbols = [s.strip() for s in symbols.split(",") if s.strip()]
    capped = [_normalize_quote_symbol(sym) for sym in raw_symbols[:20]]
    cache_key = tuple(capped)

    # Admission control + cache check: release the active slot before slow yfinance I/O
    # so it doesn't accumulate while Yahoo Finance is slow or hanging.
    async with _market_data_limit(request):
        cached_at, cached_quotes = _cache_get(_QUOTE_CACHE, cache_key, (0.0, []))
        now = monotonic()
        if cached_quotes and now - cached_at <= _QUOTE_CACHE_TTL_SECONDS:
            return {"quotes": _clone_quotes(cached_quotes)}
        # Slot released here; yfinance fetch happens outside the lease.

    # Deduplicate concurrent fetches for the same symbol set.
    if cache_key in _QUOTES_INFLIGHT:
        quotes = await asyncio.shield(_QUOTES_INFLIGHT[cache_key])
        return {"quotes": _clone_quotes(quotes)}

    loop = asyncio.get_event_loop()
    future: asyncio.Future = loop.create_future()
    _QUOTES_INFLIGHT[cache_key] = future
    try:
        quotes = await _fetch_quotes(capped)
        future.set_result(quotes)
    except Exception as exc:
        future.set_exception(exc)
        raise
    finally:
        _QUOTES_INFLIGHT.pop(cache_key, None)

    _cache_set(_QUOTE_CACHE, cache_key, (monotonic(), _clone_quotes(quotes)))
    return {"quotes": quotes}
