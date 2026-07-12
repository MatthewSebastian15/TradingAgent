"""Economic tab endpoint — generic forwarder to per-source fetchers.

`GET /api/economic/{source}/{command}` forwards query params to the economic
service, which fetches the public data source, caches, and throttles. Phase 1
wires Federal Reserve only.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from rate_limiter import RateLimitPolicy, limit_request
from services.economic_service import get_economic_data

router = APIRouter(tags=["economic"])
logger = logging.getLogger(__name__)

_ECONOMIC_POLICY = RateLimitPolicy(scope="economic", max_per_minute=120, max_concurrent=16)


@router.get("/economic/{source}/{command}")
async def economic_data(source: str, command: str, request: Request):
    async with limit_request(request, _ECONOMIC_POLICY):
        params = dict(request.query_params)
        return await get_economic_data(source, command, params)
