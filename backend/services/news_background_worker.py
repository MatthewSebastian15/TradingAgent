from __future__ import annotations

import asyncio
import logging
import time
from contextlib import suppress
from typing import Any

from config_llm import build_tradingagents_config
from services.news_article_store import NewsArticleStore
from services.news_inflight_dedupe import has_inflight, run_once

logger = logging.getLogger(__name__)

_REFRESH_KEY = "general_news_refresh"
_MANUAL_REFRESH_LAST_AT = 0.0
_QUEUED_REFRESH_TASK: asyncio.Task | None = None

# Watchdog: the scheduled loop already self-heals (catches, sleeps, retries next
# cycle), so this is visibility only — how many cycles in a row have failed, so
# an operator (or /api/debug/health) can tell "quiet" apart from "stuck failing".
_CONSECUTIVE_FAILURE_WARN_THRESHOLD = 3
_consecutive_failures = 0
_last_success_at = 0.0
_last_failure_at = 0.0
_last_failure_error: str | None = None


def _general_news_config() -> dict[str, Any]:
    return dict((build_tradingagents_config().get("general_news") or {}))


def _article_store(config: dict[str, Any]) -> NewsArticleStore:
    return NewsArticleStore(
        db_path=str(config.get("cache_db_path") or ".cache/general_news.sqlite3"),
        max_articles=max(1, int(config.get("max_stored_articles", 2000))),
        retention_days=max(1, int(config.get("article_retention_days", 30))),
    )


def manual_refresh_cooldown_remaining(config: dict[str, Any] | None = None) -> int:
    active_config = dict(config or _general_news_config())
    cooldown = max(1, int(active_config.get("manual_refresh_cooldown_seconds", 90)))
    return max(0, int((_MANUAL_REFRESH_LAST_AT + cooldown) - time.time()))


def mark_manual_refresh_requested() -> None:
    global _MANUAL_REFRESH_LAST_AT
    _MANUAL_REFRESH_LAST_AT = time.time()


async def refresh_general_news_background(reason: str = "scheduled") -> dict[str, Any]:
    async def factory() -> dict[str, Any]:
        from tradingagents.dataflows.news.general_news_service import GeneralNewsService
        from tradingagents.dataflows.news.general_news_stream import general_news_event_bus
        from tradingagents.dataflows.providers.config import use_config

        config = build_tradingagents_config()
        general_config = dict(config.get("general_news", {}) or {})
        general_config["force_refresh_allowed"] = True
        limit = max(1, int(general_config.get("max_articles_for_ui") or 2000))

        with use_config(config):
            result = await asyncio.to_thread(
                GeneralNewsService(general_config).fetch_general_news,
                category="all",
                window_days=max(1, int(general_config.get("default_window_days", 14))),
                limit=limit,
                force_refresh=True,
            )

        articles = result.get("articles") if isinstance(result, dict) else []
        inserted_count = 0
        if isinstance(articles, list):
            inserted_count = await asyncio.to_thread(
                _article_store(general_config).upsert_many, articles
            )

        result = dict(result or {})
        result["refresh"] = {
            **dict(result.get("refresh") or {}),
            "queued": False,
            "skipped": False,
            "reason": reason,
            "stored_articles": inserted_count,
        }
        await general_news_event_bus.publish_if_changed(result)
        return result

    return await run_once(_REFRESH_KEY, factory)


async def queue_general_news_refresh(reason: str = "queued") -> dict[str, Any]:
    global _QUEUED_REFRESH_TASK

    if has_inflight(_REFRESH_KEY) or (_QUEUED_REFRESH_TASK and not _QUEUED_REFRESH_TASK.done()):
        return {"queued": False, "skipped": True, "reason": "refresh_inflight"}

    async def runner() -> None:
        try:
            await refresh_general_news_background(reason=reason)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("queued general news refresh failed")

    _QUEUED_REFRESH_TASK = asyncio.create_task(runner())
    return {"queued": True, "skipped": False, "reason": reason}


async def news_worker_loop() -> None:
    global _consecutive_failures, _last_success_at, _last_failure_at, _last_failure_error
    while True:
        config = _general_news_config()
        interval = max(
            30,
            int(
                config.get("background_refresh_seconds")
                or config.get("refresh_interval_seconds")
                or 300
            ),
        )
        try:
            await refresh_general_news_background(reason="scheduled")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _consecutive_failures += 1
            _last_failure_at = time.time()
            _last_failure_error = str(exc)[:300]
            if _consecutive_failures >= _CONSECUTIVE_FAILURE_WARN_THRESHOLD:
                logger.warning(
                    "news worker failed %d consecutive cycles, serving stale cache: %s",
                    _consecutive_failures,
                    exc,
                )
            else:
                logger.exception("news worker failed")
        else:
            _consecutive_failures = 0
            _last_success_at = time.time()
        await asyncio.sleep(interval)


def get_worker_health() -> dict[str, Any]:
    return {
        "consecutive_failures": _consecutive_failures,
        "degraded": _consecutive_failures >= _CONSECUTIVE_FAILURE_WARN_THRESHOLD,
        "last_success_at": _last_success_at or None,
        "last_failure_at": _last_failure_at or None,
        "last_failure_error": _last_failure_error,
    }


async def stop_queued_refresh_task() -> None:
    global _QUEUED_REFRESH_TASK
    task = _QUEUED_REFRESH_TASK
    if task is None:
        return
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task
    _QUEUED_REFRESH_TASK = None


def reset_news_worker_state_for_tests() -> None:
    global _MANUAL_REFRESH_LAST_AT, _QUEUED_REFRESH_TASK
    global _consecutive_failures, _last_success_at, _last_failure_at, _last_failure_error
    _MANUAL_REFRESH_LAST_AT = 0.0
    _QUEUED_REFRESH_TASK = None
    _consecutive_failures = 0
    _last_success_at = 0.0
    _last_failure_at = 0.0
    _last_failure_error = None
