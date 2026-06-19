from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any


class TickerNewsEventBus:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = {}
        self._last_article_ids: dict[str, set[str]] = {}

    async def subscribe(self, ticker: str) -> AsyncIterator[dict[str, Any]]:
        normalized_ticker = _normalize_ticker(ticker)
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=16)
        subscribers = self._subscribers.setdefault(normalized_ticker, set())
        subscribers.add(queue)
        try:
            while True:
                yield await queue.get()
                queue.task_done()
        finally:
            subscribers.discard(queue)
            if not subscribers:
                self._subscribers.pop(normalized_ticker, None)

    async def publish_if_changed(self, result: dict[str, Any]) -> bool:
        if not isinstance(result, dict):
            return False

        ticker = _normalize_ticker(str(result.get("ticker") or ""))
        if not ticker:
            return False

        articles = result.get("articles")
        if not isinstance(articles, list):
            return False

        article_ids = {
            str(item.get("id") or item.get("url") or item.get("title") or "")
            for item in articles
            if isinstance(item, dict)
        }
        article_ids.discard("")
        if not article_ids:
            return False

        old_ids = self._last_article_ids.get(ticker)
        self._last_article_ids[ticker] = set(article_ids)
        if old_ids is None:
            return False

        new_ids = article_ids - old_ids
        if not new_ids:
            return False

        await self.publish(
            ticker,
            {
                "ticker": ticker,
                "latest_article_date": result.get("latest_article_date"),
                "articles_found": result.get("articles_found"),
                "new_count": len(new_ids),
            },
        )
        return True

    async def publish(self, ticker: str, event: dict[str, Any]) -> None:
        normalized_ticker = _normalize_ticker(ticker)
        stale: list[asyncio.Queue[dict[str, Any]]] = []
        for queue in list(self._subscribers.get(normalized_ticker, set())):
            try:
                queue.put_nowait(dict(event))
            except asyncio.QueueFull:
                stale.append(queue)
        for queue in stale:
            self._subscribers.get(normalized_ticker, set()).discard(queue)

    def reset_for_tests(self) -> None:
        self._subscribers.clear()
        self._last_article_ids.clear()


def _normalize_ticker(ticker: str) -> str:
    return str(ticker or "").strip().upper()


ticker_news_event_bus = TickerNewsEventBus()
