from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, FastAPI, HTTPException, Query, Request

from config import build_tradingagents_config
from errors import BadRequestError
from rate_limiter import limit_request, request_policy, stream_policy
from routes.sse import EventSourceResponse
from routes.validation import normalize_ticker_symbol
from schemas import NewsResponse

router = APIRouter(tags=["news"])
debug_router = APIRouter(tags=["news"])
_SUPPORTED_DEBUG_PROVIDERS = {
    "google_news_light",
    "marketaux",
    "rss_context",
    "newsdata",
    "yfinance",
}
_SUPPORTED_GENERAL_PROVIDERS = {"google_news_light", "marketaux", "rss_context", "newsdata"}
_TICKER_NEWS_STREAM_DEFAULT_POLL_SECONDS = 120
_TICKER_NEWS_STREAM_MIN_POLL_SECONDS = 30


def _fetch_general_news(
    *,
    category: str,
    window_days: int,
    limit: int,
    provider: str | None = None,
    force_refresh: bool = False,
) -> dict[str, Any]:
    from services.news_article_store import NewsArticleStore
    from services.news_provider_budget import provider_status_snapshot
    from tradingagents.dataflows.news.general_news_categories import (
        is_allowed_category,
        normalize_general_news_category,
    )
    from tradingagents.dataflows.news.general_news_service import GENERAL_NEWS_PROVIDER_ORDER

    config = build_tradingagents_config()
    general_config = dict(config.get("general_news", {}) or {})
    if not bool(general_config.get("enabled", True)):
        return {
            "enabled": False,
            "mode": "general_news",
            "articles": [],
            "articles_found": 0,
        }

    normalized_category = str(category or general_config.get("default_category") or "all").lower()
    normalized_category = normalized_category.strip().replace(" ", "_") or "all"
    if normalized_category != "all" and not is_allowed_category(normalized_category):
        normalized_category = "all"
    if normalized_category != "all":
        normalized_category = normalize_general_news_category(normalized_category)

    configured_limit = max(1, int(general_config.get("ui_default_limit") or 2000))
    max_ui = max(1, int(general_config.get("max_articles_for_ui") or 2000))
    limit = min(max(1, int(limit or configured_limit)), max_ui)
    ttl_seconds = max(30, int(general_config.get("cache_ttl_seconds") or 300))
    stale_ttl_seconds = max(ttl_seconds, int(general_config.get("stale_ttl_seconds") or 3600))

    store = NewsArticleStore(
        db_path=str(general_config.get("cache_db_path") or ".cache/general_news.sqlite3"),
        max_articles=max(1, int(general_config.get("max_stored_articles") or 2000)),
        retention_days=max(1, int(general_config.get("article_retention_days") or 30)),
    )
    query = store.list_articles(
        category=normalized_category,
        window_days=max(1, int(window_days)),
        limit=limit,
        provider=provider,
    )
    age_seconds = int(query.age_seconds or 0)
    stale = bool(query.articles) and age_seconds > ttl_seconds
    provider_order = list(general_config.get("provider_priority") or GENERAL_NEWS_PROVIDER_ORDER)

    return {
        "enabled": True,
        "mode": "general_news",
        "category": normalized_category,
        "window_days": max(1, int(window_days)),
        "limit": limit,
        "last_updated": query.last_updated,
        "refresh_interval_seconds": int(
            general_config.get("background_refresh_seconds")
            or general_config.get("refresh_interval_seconds")
            or 300
        ),
        "cache": {
            "enabled": True,
            "hit": bool(query.articles),
            "stale": stale,
            "age_seconds": age_seconds if query.articles else None,
            "ttl_seconds": ttl_seconds,
            "stale_ttl_seconds": stale_ttl_seconds,
        },
        "refresh": {
            "queued": False,
            "skipped": bool(force_refresh),
            "reason": "get_force_refresh_ignored" if force_refresh else None,
        },
        "provider_status": provider_status_snapshot(provider_order),
        "debug": {
            "articles_before_dedup": query.total_available,
            "articles_after_dedup": query.total_available,
            "articles_returned": len(query.articles),
        },
        "articles_found": len(query.articles),
        "articles": query.articles,
    }


def _general_news_categories() -> dict[str, Any]:
    from tradingagents.dataflows.news.general_news_categories import GENERAL_NEWS_CATEGORIES

    return {"categories": GENERAL_NEWS_CATEGORIES}


async def _stream_general_news_events(request: Request):
    from tradingagents.dataflows.news.general_news_stream import general_news_event_bus

    async for event in general_news_event_bus.subscribe():
        if await request.is_disconnected():
            return
        yield {"event": "general_news_updated", "data": json.dumps(event)}


@router.get("/news/general")
async def get_general_news(
    request: Request,
    category: str = Query(default="all"),
    window_days: int = Query(default=14, ge=1, le=365),
    limit: int = Query(default=2000, ge=1, le=2000),
    provider: str | None = Query(default=None),
    force_refresh: bool = Query(default=False),
):
    normalized_provider = provider.strip().lower() if provider else None
    if normalized_provider is not None and normalized_provider not in _SUPPORTED_GENERAL_PROVIDERS:
        raise BadRequestError(
            "Unsupported general news provider.",
            details={
                "provider": provider,
                "supported_providers": sorted(_SUPPORTED_GENERAL_PROVIDERS),
            },
        )
    result = await asyncio.to_thread(
        _fetch_general_news,
        category=category,
        window_days=window_days,
        limit=limit,
        provider=normalized_provider,
        force_refresh=force_refresh,
    )
    if _should_queue_read_refresh(result, force_refresh=force_refresh):
        from services.news_background_worker import queue_general_news_refresh

        refresh_status = await queue_general_news_refresh(
            "legacy_force_refresh" if force_refresh else "cache_stale"
        )
        result["refresh"] = {**dict(result.get("refresh") or {}), **refresh_status}
    return result


@router.post("/news/general/refresh")
async def refresh_general_news(
    request: Request,
    category: str = Query(default="all"),
    window_days: int = Query(default=14, ge=1, le=365),
    limit: int = Query(default=2000, ge=1, le=2000),
    provider: str | None = Query(default=None),
):
    normalized_provider = provider.strip().lower() if provider else None
    if normalized_provider is not None and normalized_provider not in _SUPPORTED_GENERAL_PROVIDERS:
        raise BadRequestError(
            "Unsupported general news provider.",
            details={
                "provider": provider,
                "supported_providers": sorted(_SUPPORTED_GENERAL_PROVIDERS),
            },
        )

    from services.news_background_worker import (
        manual_refresh_cooldown_remaining,
        mark_manual_refresh_requested,
        queue_general_news_refresh,
    )

    result = await asyncio.to_thread(
        _fetch_general_news,
        category=category,
        window_days=window_days,
        limit=limit,
        provider=normalized_provider,
        force_refresh=False,
    )
    remaining = manual_refresh_cooldown_remaining()
    if remaining > 0:
        result["status"] = "skipped"
        result["message"] = "Refresh is cooling down. Showing latest cached news."
        result["refresh"] = {
            **dict(result.get("refresh") or {}),
            "queued": False,
            "skipped": True,
            "reason": "manual_refresh_cooldown",
            "cooldown_remaining_seconds": remaining,
        }
        return result

    mark_manual_refresh_requested()
    refresh_status = await queue_general_news_refresh("manual_refresh")
    result["status"] = "queued" if refresh_status.get("queued") else "skipped"
    result["message"] = (
        "News refresh queued"
        if refresh_status.get("queued")
        else "News refresh already running. Showing latest cached news."
    )
    result["refresh"] = {**dict(result.get("refresh") or {}), **refresh_status}
    return result


def _should_queue_read_refresh(result: dict[str, Any], *, force_refresh: bool) -> bool:
    if force_refresh:
        return True
    cache = result.get("cache") if isinstance(result, dict) else {}
    refresh = result.get("refresh") if isinstance(result, dict) else {}
    if not isinstance(cache, dict) or not isinstance(refresh, dict):
        return False
    return bool(cache.get("stale")) and not bool(refresh.get("queued"))


@router.get("/news/general/categories")
async def get_general_news_categories(request: Request):
    return _general_news_categories()


@router.get("/news/general/stream")
async def stream_general_news(request: Request):
    config = build_tradingagents_config()
    if not bool((config.get("general_news") or {}).get("enable_sse", True)):
        raise HTTPException(status_code=404, detail="Not found")
    return EventSourceResponse(_stream_general_news_events(request))


def _fetch_news(
    ticker: str,
    *,
    window_days: int,
    limit: int,
    provider: str | None = None,
    debug: bool = False,
    include_raw: bool = False,
    force_refresh: bool = False,
) -> dict[str, Any]:
    from tradingagents.dataflows.news.news_service import NewsService
    from tradingagents.dataflows.providers.config import use_config

    config = build_tradingagents_config()
    with use_config(config):
        return NewsService().fetch_news(
            ticker,
            window_days=window_days,
            limit=limit,
            provider_filter=provider,
            debug=debug,
            include_raw=include_raw,
            bypass_cache=bool(debug and include_raw),
            force_refresh=force_refresh,
        )


async def _stream_ticker_news_events(
    request: Request,
    rate_limit_lease,
    *,
    ticker: str,
    window_days: int,
    limit: int,
    poll_seconds: int,
):
    from tradingagents.dataflows.news.ticker_news_stream import ticker_news_event_bus

    async def poll_for_updates() -> None:
        while True:
            if await request.is_disconnected():
                return
            result = await asyncio.to_thread(
                _fetch_news,
                ticker,
                window_days=window_days,
                limit=limit,
                force_refresh=True,
            )
            await ticker_news_event_bus.publish_if_changed(result)
            await asyncio.sleep(max(_TICKER_NEWS_STREAM_MIN_POLL_SECONDS, poll_seconds))

    poll_task = asyncio.create_task(poll_for_updates())
    try:
        yield {
            "event": "ticker_news_stream_ready",
            "data": json.dumps({"ticker": ticker, "poll_seconds": poll_seconds}),
        }
        async for event in ticker_news_event_bus.subscribe(ticker):
            if await request.is_disconnected():
                return
            yield {"event": "ticker_news_updated", "data": json.dumps(event)}
    finally:
        poll_task.cancel()
        try:
            await poll_task
        except asyncio.CancelledError:
            pass
        await rate_limit_lease.__aexit__(None, None, None)


@router.get("/news/{ticker}/stream")
async def stream_ticker_news(
    ticker: str,
    request: Request,
    window_days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=20, ge=1, le=100),
    poll_seconds: int = Query(default=_TICKER_NEWS_STREAM_DEFAULT_POLL_SECONDS, ge=30, le=900),
):
    config = build_tradingagents_config()
    if not bool((config.get("general_news") or {}).get("enable_sse", True)):
        raise HTTPException(status_code=404, detail="Not found")

    normalized_ticker = normalize_ticker_symbol(ticker)
    rate_limit_lease = limit_request(request, stream_policy())
    await rate_limit_lease.__aenter__()
    return EventSourceResponse(
        _stream_ticker_news_events(
            request,
            rate_limit_lease,
            ticker=normalized_ticker,
            window_days=window_days,
            limit=limit,
            poll_seconds=poll_seconds,
        )
    )


@router.get("/news/{ticker}", response_model=NewsResponse, response_model_exclude_none=True)
async def get_news(
    ticker: str,
    request: Request,
    window_days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=20, ge=1, le=100),
    provider: str | None = Query(default=None),
    force_refresh: bool = Query(default=False),
):
    normalized_provider = provider.strip().lower() if provider else None
    if normalized_provider is not None and normalized_provider not in _SUPPORTED_DEBUG_PROVIDERS:
        raise BadRequestError(
            "Unsupported news provider.",
            details={
                "provider": provider,
                "supported_providers": sorted(_SUPPORTED_DEBUG_PROVIDERS),
            },
        )
    normalized_ticker = normalize_ticker_symbol(ticker)
    async with limit_request(request, request_policy()):
        return await asyncio.to_thread(
            _fetch_news,
            normalized_ticker,
            window_days=window_days,
            limit=limit,
            provider=normalized_provider,
            force_refresh=force_refresh,
        )


@debug_router.get("/debug/news/{ticker}")
async def debug_news(
    ticker: str,
    request: Request,
    provider: str | None = Query(default=None),
    window_days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=20, ge=1, le=100),
    include_raw: bool = Query(default=False),
):
    normalized_provider = provider.strip().lower() if provider else None
    if normalized_provider is not None and normalized_provider not in _SUPPORTED_DEBUG_PROVIDERS:
        raise BadRequestError(
            "Unsupported news provider.",
            details={
                "provider": provider,
                "supported_providers": sorted(_SUPPORTED_DEBUG_PROVIDERS),
            },
        )
    normalized_ticker = normalize_ticker_symbol(ticker)
    async with limit_request(request, request_policy()):
        return await asyncio.to_thread(
            _fetch_news,
            normalized_ticker,
            window_days=window_days,
            limit=limit,
            provider=normalized_provider,
            debug=True,
            include_raw=include_raw,
        )


def include_news_routes(app: FastAPI, *, prefix: str, is_development: bool) -> None:
    app.include_router(router, prefix=prefix)
    if is_development:
        app.include_router(debug_router, prefix=prefix)
