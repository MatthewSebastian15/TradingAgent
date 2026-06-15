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
_SUPPORTED_DEBUG_PROVIDERS = {"google_news_light", "marketaux", "rss_context", "newsdata", "yfinance"}
_SUPPORTED_GENERAL_PROVIDERS = {"google_news_light", "marketaux", "rss_context", "newsdata"}


def _fetch_general_news(
    *,
    category: str,
    window_days: int,
    limit: int,
    provider: str | None = None,
    force_refresh: bool = False,
) -> dict[str, Any]:
    from tradingagents.dataflows.config import use_config
    from tradingagents.dataflows.general_news_service import GeneralNewsService

    config = build_tradingagents_config()
    with use_config(config):
        return GeneralNewsService(config.get("general_news", {})).fetch_general_news(
            category=category,
            window_days=window_days,
            limit=limit,
            provider_filter=provider,
            force_refresh=force_refresh,
        )


def _general_news_categories() -> dict[str, Any]:
    from tradingagents.dataflows.general_news_categories import GENERAL_NEWS_CATEGORIES

    return {"categories": GENERAL_NEWS_CATEGORIES}


async def _stream_general_news_events(request: Request, rate_limit_lease):
    from tradingagents.dataflows.general_news_stream import general_news_event_bus

    try:
        async for event in general_news_event_bus.subscribe():
            if await request.is_disconnected():
                return
            yield {"event": "general_news_updated", "data": json.dumps(event)}
    finally:
        await rate_limit_lease.__aexit__(None, None, None)


@router.get("/news/general")
async def get_general_news(
    request: Request,
    category: str = Query(default="all"),
    window_days: int = Query(default=7, ge=1, le=365),
    limit: int = Query(default=50, ge=1, le=100),
    provider: str | None = Query(default=None),
    force_refresh: bool = Query(default=False),
):
    normalized_provider = provider.strip().lower() if provider else None
    if normalized_provider is not None and normalized_provider not in _SUPPORTED_GENERAL_PROVIDERS:
        raise BadRequestError(
            "Unsupported general news provider.",
            details={"provider": provider, "supported_providers": sorted(_SUPPORTED_GENERAL_PROVIDERS)},
        )
    async with limit_request(request, request_policy()):
        return await asyncio.to_thread(
            _fetch_general_news,
            category=category,
            window_days=window_days,
            limit=limit,
            provider=normalized_provider,
            force_refresh=force_refresh,
        )


@router.get("/news/general/categories")
async def get_general_news_categories(request: Request):
    async with limit_request(request, request_policy()):
        return _general_news_categories()


@router.get("/news/general/stream")
async def stream_general_news(request: Request):
    config = build_tradingagents_config()
    if not bool((config.get("general_news") or {}).get("enable_sse", True)):
        raise HTTPException(status_code=404, detail="Not found")
    rate_limit_lease = limit_request(request, stream_policy())
    await rate_limit_lease.__aenter__()
    return EventSourceResponse(_stream_general_news_events(request, rate_limit_lease))


def _fetch_news(
    ticker: str,
    *,
    window_days: int,
    limit: int,
    provider: str | None = None,
    debug: bool = False,
    include_raw: bool = False,
) -> dict[str, Any]:
    from tradingagents.dataflows.config import use_config
    from tradingagents.dataflows.news_service import NewsService

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
        )


@router.get("/news/{ticker}", response_model=NewsResponse, response_model_exclude_none=True)
async def get_news(
    ticker: str,
    request: Request,
    window_days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=20, ge=1, le=100),
):
    normalized_ticker = normalize_ticker_symbol(ticker)
    async with limit_request(request, request_policy()):
        return await asyncio.to_thread(_fetch_news, normalized_ticker, window_days=window_days, limit=limit)


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
            details={"provider": provider, "supported_providers": sorted(_SUPPORTED_DEBUG_PROVIDERS)},
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
