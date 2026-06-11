"""API routes for permanent analysis history snapshots."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Query, Request

from config import ANALYSIS_HISTORY_DEFAULT_LIMIT
from errors import NotFoundError
from rate_limiter import limit_request, request_policy
from services.analysis_repository import get_analysis_repository

router = APIRouter(tags=["analysis-history"])


def _history_not_found(request_id: str) -> NotFoundError:
    return NotFoundError("Analysis history result was not found.", details={"request_id": request_id})


@router.get("/analysis/history")
async def list_analysis_history(
    request: Request,
    ticker: str | None = None,
    limit: int = Query(default=ANALYSIS_HISTORY_DEFAULT_LIMIT, ge=1, le=100),
):
    """Return owner-scoped analysis history metadata."""

    async with limit_request(request, request_policy()) as lease:
        repository = get_analysis_repository()
        items = await asyncio.to_thread(repository.list_analyses, ticker=ticker, limit=limit, owner_id=lease.identifier)
        return {"items": items}


@router.get("/analysis/history/{request_id}")
async def get_analysis_history_result(request_id: str, request: Request):
    """Return one full stored analysis snapshot."""

    async with limit_request(request, request_policy()) as lease:
        repository = get_analysis_repository()
        result = await asyncio.to_thread(
            repository.get_analysis,
            request_id,
            owner_id=lease.identifier,
            bind_legacy_owner=True,
        )
        if result is None:
            raise _history_not_found(request_id)
        return result


@router.delete("/analysis/history/{request_id}")
async def delete_analysis_history_result(request_id: str, request: Request):
    """Delete one stored analysis snapshot."""

    async with limit_request(request, request_policy()) as lease:
        repository = get_analysis_repository()
        deleted = await asyncio.to_thread(repository.delete_analysis, request_id, owner_id=lease.identifier)
        if not deleted:
            raise _history_not_found(request_id)
        return {"deleted": True, "request_id": request_id}


@router.delete("/analysis/history")
async def clear_analysis_history(request: Request):
    """Delete all stored analysis snapshots for this owner session."""

    async with limit_request(request, request_policy()) as lease:
        repository = get_analysis_repository()
        deleted_count = await asyncio.to_thread(repository.delete_all_analyses, owner_id=lease.identifier)
        return {"deleted": True, "deleted_count": deleted_count}
