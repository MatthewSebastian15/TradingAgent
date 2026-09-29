from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any

logger = logging.getLogger(__name__)


def _article_ids(articles: list[Any]) -> set[str]:
    ids = {
        str(item.get("id") or item.get("url") or "") for item in articles if isinstance(item, dict)
    }
    ids.discard("")
    return ids


class GeneralNewsEventBus:
    def __init__(self, seed_article_ids: set[str] | None = None) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._last_article_ids: set[str] = set(seed_article_ids or ())

    def seed_from_store(self, store: Any) -> None:
        """Prime the baseline from a NewsArticleStore-like object (blocking read).

        Without it the first refresh after a restart only sets the baseline and never
        publishes, so a client already connected misses that update. Call this before
        writing the refreshed articles to the store; the baseline must be what was on
        disk beforehand. No-op once a baseline exists. A failed read leaves the bus
        unprimed, which is the old behavior, and never raises.
        """
        if self._last_article_ids:
            return
        try:
            stored = store.list_articles(category="all", window_days=365, limit=store.max_articles)
        except Exception:
            logger.warning(
                "could not seed the general news event bus from the store", exc_info=True
            )
            return
        self._last_article_ids = _article_ids(stored.articles)

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

        article_ids = _article_ids(articles)
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
                "event": "general_news_updated",
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
