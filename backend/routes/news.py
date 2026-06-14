from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, FastAPI, Query, Request

from config import build_tradingagents_config
from errors import BadRequestError
from rate_limiter import limit_request, request_policy
from routes.validation import normalize_ticker_symbol
from schemas import NewsResponse

router = APIRouter(tags=["news"])
debug_router = APIRouter(tags=["news"])
_SUPPORTED_DEBUG_PROVIDERS = {"google_news_light", "marketaux", "rss_context", "newsdata", "yfinance"}


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
