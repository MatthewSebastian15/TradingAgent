from __future__ import annotations

import asyncio
import datetime
import logging
import time
from dataclasses import dataclass
from typing import Any

from config import (
    GENERAL_NEWS_CACHE_DB_PATH,
    RAG_CHATBOT_MARKET_POOL_TTL_SECONDS,
    RAG_CHATBOT_NEWS_POOL_TTL_SECONDS,
)
from services.analysis_repository import get_analysis_repository
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


async def get_news_pool() -> list[dict[str, Any]]:
    """Return cached general news articles from NewsArticleStore SQLite."""
    global _news_cache
    now = time.time()
    if _news_cache is not None and (now - _news_cache.fetched_at) < RAG_CHATBOT_NEWS_POOL_TTL_SECONDS:
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
    if _market_cache is not None and (now - _market_cache.fetched_at) < RAG_CHATBOT_MARKET_POOL_TTL_SECONDS:
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


async def get_analysis_pool(limit: int = 20) -> list[dict[str, Any]]:
    """Return latest completed analysis history metadata."""
    repo = get_analysis_repository()
    try:
        return await asyncio.to_thread(repo.list_analyses, limit=limit)
    except Exception:
        logger.exception("RAG: failed to fetch analysis pool")
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
    news, market, analyses = await asyncio.gather(
        get_news_pool(),
        get_market_pool(),
        get_analysis_pool(limit=100),
        return_exceptions=True,
    )

    news_list: list = news if isinstance(news, list) else []
    market_data: dict | None = market if isinstance(market, dict) else None
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
        "analysis": {
            "available": len(analysis_list) > 0,
            "count": len(analysis_list),
        },
    }
