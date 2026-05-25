from __future__ import annotations

import asyncio
import os

import pytest

from analysis_cache import AnalysisCacheKey, AnalysisJobLimitError, AnalysisJobStore, AnalysisResultCache


def _cache_key(ticker: str) -> AnalysisCacheKey:
    return AnalysisCacheKey(
        ticker=ticker,
        trade_date="2026-05-14",
        provider=os.environ["LLM_PROVIDER"],
        quick_model=os.environ["QUICK_THINK_LLM"],
        deep_model=os.environ["DEEP_THINK_LLM"],
        analysis_mode="balanced",
        analysis_depth="balanced",
        max_debate_rounds=1,
        response_detail="summary",
    )


def test_result_cache_preserves_original_data_fetched_at_on_hit():
    async def main():
        cache = AnalysisResultCache(ttl_seconds=60, max_entries=2)
        await cache.set(_cache_key("BBCA.JK"), {"decision": "Buy", "data_fetched_at": "2026-05-20T10:11:12"})

        cached = await cache.get(_cache_key("BBCA.JK"))

        assert cached is not None
        assert cached["data_fetched_at"] == "2026-05-20T10:11:12"
        assert cached["cache"] == {"hit": True, "source": "result_cache"}

    asyncio.run(main())


def test_result_cache_uses_recently_touched_lru_entry():
    async def main():
        cache = AnalysisResultCache(ttl_seconds=60, max_entries=2)
        await cache.set(_cache_key("BBCA.JK"), {"decision": "Buy"})
        await cache.set(_cache_key("BBRI.JK"), {"decision": "Hold"})
        assert await cache.get(_cache_key("BBCA.JK")) is not None

        await cache.set(_cache_key("TLKM.JK"), {"decision": "Sell"})

        assert await cache.get(_cache_key("BBCA.JK")) is not None
        assert await cache.get(_cache_key("BBRI.JK")) is None
        assert await cache.get(_cache_key("TLKM.JK")) is not None

    asyncio.run(main())


def test_job_store_rejects_jobs_over_active_cap():
    async def main():
        store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=1)
        await store.create(
            owner_id="owner-1", request_id="request-1", cache_key=_cache_key("BBCA.JK"), payload={"ticker": "BBCA.JK"}
        )

        with pytest.raises(AnalysisJobLimitError) as exc_info:
            await store.create(
                owner_id="owner-2",
                request_id="request-2",
                cache_key=_cache_key("BBRI.JK"),
                payload={"ticker": "BBRI.JK"},
            )

        assert exc_info.value.max_active_jobs == 1
        assert (await store.stats())["active"] == 1

    asyncio.run(main())


def test_job_event_history_is_bounded():
    async def main():
        store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10, max_event_history=2)
        job = await store.create(
            owner_id="owner-1", request_id="request-1", cache_key=_cache_key("BBCA.JK"), payload={"ticker": "BBCA.JK"}
        )

        for index in range(5):
            await job.publish("progress", {"index": index})

        events = await job.events_since(0)

        assert [event["payload"]["index"] for event in events] == [3, 4]
        assert [event["sequence"] for event in events] == [3, 4]

    asyncio.run(main())


def test_job_terminal_transition_does_not_overwrite_cancelled_state():
    async def main():
        store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
        job = await store.create(
            owner_id="owner-1", request_id="request-1", cache_key=_cache_key("BBCA.JK"), payload={"ticker": "BBCA.JK"}
        )

        cancelled = await job.cancel(
            {"request_id": "request-1", "error": {"code": "ANALYSIS_CANCELLED", "message": "cancelled"}}
        )
        completed = await job.complete({"decision": "Buy"})

        assert cancelled is True
        assert completed is False
        assert job.status == "cancelled"
        assert job.result is None
        assert job.error["error"]["code"] == "ANALYSIS_CANCELLED"

    asyncio.run(main())
