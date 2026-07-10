from __future__ import annotations

import asyncio
import datetime
import logging
import time
from dataclasses import dataclass
from typing import Any

from config import (
    GENERAL_NEWS_CACHE_DB_PATH,
    RAG_CHATBOT_ECON_POOL_TTL_SECONDS,
    RAG_CHATBOT_MARKET_POOL_TTL_SECONDS,
    RAG_CHATBOT_NEWS_POOL_TTL_SECONDS,
)
from services.analysis_repository import get_analysis_repository
from services.economic_service import get_economic_data
from services.market_yfinance_service import get_market_movers, get_overview_data
from services.news_article_store import NewsArticleStore

logger = logging.getLogger(__name__)

_OVERVIEW_SYMBOLS = ["^GSPC", "^IXIC", "^DJI", "^VIX", "DX-Y.NYB", "GC=F", "CL=F", "BTC-USD"]
_MOVERS_COUNTRY = "US"
_MOVERS_EXCHANGE = "NASDAQ"
_MOVERS_LIMIT = 10


@dataclass
class _CacheEntry:
    data: Any
    fetched_at: float


_news_cache: _CacheEntry | None = None
_market_cache: _CacheEntry | None = None
_econ_cache: _CacheEntry | None = None

# ponytail: fixed US-macro snapshot. Add more (source, command, params) rows here
# if the chatbot needs CPI/GDP per-country — those need a countries param.
_ECON_SNAPSHOT = (
    ("federal_reserve", "federal_funds_rate", {"days": 5}),
    ("federal_reserve", "yield_curve", {}),
    ("yfinance", "gauges", {}),
)


async def get_news_pool() -> list[dict[str, Any]]:
    """Return cached general news articles from NewsArticleStore SQLite."""
    global _news_cache
    now = time.time()
    if (
        _news_cache is not None
        and (now - _news_cache.fetched_at) < RAG_CHATBOT_NEWS_POOL_TTL_SECONDS
    ):
        return _news_cache.data

    def _fetch() -> list[dict[str, Any]]:
        store = NewsArticleStore(db_path=GENERAL_NEWS_CACHE_DB_PATH)
        result = store.list_articles(category="all", window_days=7, limit=200)
        return result.articles

    try:
        articles = await asyncio.to_thread(_fetch)
        _news_cache = _CacheEntry(data=articles, fetched_at=now)
        return articles
    except Exception:
        logger.exception("RAG: failed to fetch news pool")
        return _news_cache.data if _news_cache is not None else []


async def get_market_pool() -> dict[str, Any] | None:
    """Return cached market overview + movers snapshot."""
    global _market_cache
    now = time.time()
    if (
        _market_cache is not None
        and (now - _market_cache.fetched_at) < RAG_CHATBOT_MARKET_POOL_TTL_SECONDS
    ):
        return _market_cache.data

    def _fetch() -> dict[str, Any]:
        overview = get_overview_data(_OVERVIEW_SYMBOLS)
        movers = get_market_movers(_MOVERS_COUNTRY, _MOVERS_EXCHANGE, _MOVERS_LIMIT)
        return {"overview": overview, "movers": movers, "fetched_at": now}

    try:
        data = await asyncio.to_thread(_fetch)
        _market_cache = _CacheEntry(data=data, fetched_at=now)
        return data
    except Exception:
        logger.exception("RAG: failed to fetch market pool")
        return _market_cache.data if _market_cache is not None else None


async def get_econ_pool() -> dict[str, Any] | None:
    """Return cached macro snapshot: fed funds, treasury yield curve, market gauges."""
    global _econ_cache
    now = time.time()
    if (
        _econ_cache is not None
        and (now - _econ_cache.fetched_at) < RAG_CHATBOT_ECON_POOL_TTL_SECONDS
    ):
        return _econ_cache.data

    snapshot: dict[str, Any] = {"fetched_at": now}
    for source, command, params in _ECON_SNAPSHOT:
        try:
            snapshot[f"{source}:{command}"] = await get_economic_data(source, command, params)
        except Exception:
            logger.exception("RAG: failed to fetch econ %s/%s", source, command)
    has_data = any(k != "fetched_at" for k in snapshot)
    if not has_data:
        return _econ_cache.data if _econ_cache is not None else None
    _econ_cache = _CacheEntry(data=snapshot, fetched_at=now)
    return snapshot


async def get_analysis_pool(limit: int = 20, ticker: str | None = None) -> list[dict[str, Any]]:
    """Return latest completed analysis history metadata, optionally for one ticker."""
    repo = get_analysis_repository()
    try:
        return await asyncio.to_thread(repo.list_analyses, limit=limit, ticker=ticker)
    except Exception:
        logger.exception("RAG: failed to fetch analysis pool")
        return []


async def get_ticker_quotes(symbols: list[str]) -> list[dict[str, Any]]:
    """Live quote snapshot for user-mentioned tickers.

    Reuses get_overview_data (SWR-cached); invalid symbols come back with
    status != ok and are dropped, so no separate validation call is needed.
    """
    if not symbols:
        return []
    try:
        data = await asyncio.to_thread(get_overview_data, symbols)
        return [i for i in (data.get("items") or []) if i.get("status") == "ok"]
    except Exception:
        logger.exception("RAG: failed to fetch ticker quotes %s", symbols)
        return []


async def get_analysis_detail(request_id: str) -> dict[str, Any] | None:
    """Return full result_json for one completed analysis."""
    repo = get_analysis_repository()
    try:
        return await asyncio.to_thread(repo.get_analysis, request_id)
    except Exception:
        logger.exception("RAG: failed to fetch analysis detail %s", request_id)
        return None


def _utc_iso(ts: float) -> str:
    return (
        datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


async def get_pool_status() -> dict[str, Any]:
    """Return availability status for all three pools."""
    news, market, econ, analyses = await asyncio.gather(
        get_news_pool(),
        get_market_pool(),
        get_econ_pool(),
        get_analysis_pool(limit=100),
        return_exceptions=True,
    )

    news_list: list = news if isinstance(news, list) else []
    market_data: dict | None = market if isinstance(market, dict) else None
    econ_data: dict | None = econ if isinstance(econ, dict) else None
    analysis_list: list = analyses if isinstance(analyses, list) else []

    return {
        "news": {
            "available": len(news_list) > 0,
            "count": len(news_list),
            "last_updated": _utc_iso(_news_cache.fetched_at) if _news_cache and news_list else None,
        },
        "market": {
            "available": market_data is not None,
            "snapshot_at": _utc_iso(float(market_data["fetched_at"])) if market_data else None,
        },
        "economic": {
            "available": econ_data is not None,
            "snapshot_at": _utc_iso(float(econ_data["fetched_at"])) if econ_data else None,
        },
        "analysis": {
            "available": len(analysis_list) > 0,
            "count": len(analysis_list),
        },
    }
