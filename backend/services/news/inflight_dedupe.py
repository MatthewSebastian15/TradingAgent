from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import TypeVar

T = TypeVar("T")

_NEWS_REFRESH_INFLIGHT: dict[str, asyncio.Task] = {}
_LOCK = asyncio.Lock()


async def run_once(key: str, factory: Callable[[], Awaitable[T]]) -> T:
    async with _LOCK:
        existing = _NEWS_REFRESH_INFLIGHT.get(key)
        if existing is not None:
            task = existing
        else:
            task = asyncio.create_task(factory())
            _NEWS_REFRESH_INFLIGHT[key] = task

    try:
        return await task
    finally:
        async with _LOCK:
            if _NEWS_REFRESH_INFLIGHT.get(key) is task:
                _NEWS_REFRESH_INFLIGHT.pop(key, None)


def has_inflight(key: str) -> bool:
    task = _NEWS_REFRESH_INFLIGHT.get(key)
    return task is not None and not task.done()


def clear_inflight_for_tests() -> None:
    _NEWS_REFRESH_INFLIGHT.clear()
