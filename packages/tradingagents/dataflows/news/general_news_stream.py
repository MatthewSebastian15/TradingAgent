from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any


class GeneralNewsEventBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._last_article_ids: set[str] = set()

    async def subscribe(self) -> AsyncIterator[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=16)
        self._subscribers.add(queue)
        try:
            while True:
                yield await queue.get()
                queue.task_done()
        finally:
            self._subscribers.discard(queue)

    async def publish_if_changed(self, result: dict[str, Any]) -> None:
        articles = result.get("articles") if isinstance(result, dict) else []
        if not isinstance(articles, list):
            return

        article_ids = {
            str(item.get("id") or item.get("url") or "")
            for item in articles
            if isinstance(item, dict)
        }
        article_ids.discard("")
        if not article_ids:
            return

        if not self._last_article_ids:
            self._last_article_ids = set(article_ids)
            return

        new_ids = article_ids - self._last_article_ids
        self._last_article_ids = set(article_ids)
        if not new_ids:
            return

        await self.publish(
            {
                "last_updated": result.get("last_updated"),
                "new_count": len(new_ids),
            }
        )

    async def publish(self, event: dict[str, Any]) -> None:
        stale: list[asyncio.Queue[dict[str, Any]]] = []
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(dict(event))
            except asyncio.QueueFull:
                stale.append(queue)
        for queue in stale:
            self._subscribers.discard(queue)


general_news_event_bus = GeneralNewsEventBus()
