"""Analysis result cache, in-flight de-duplication, cancellation, and job state.

The API runs expensive analysis jobs that can consume several LLM calls. This
module keeps those costs under control by caching finished results, sharing
identical in-flight work, and tracking cancellable streaming jobs.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any, Hashable, Literal

AnalysisStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


class AnalysisJobLimitError(RuntimeError):
    """Raised when the in-memory job store is at active-job capacity."""

    def __init__(self, max_active_jobs: int) -> None:
        self.max_active_jobs = max_active_jobs
        super().__init__("Too many analysis jobs are already queued or running.")


@dataclass(frozen=True)
class AnalysisCacheKey:
    ticker: str
    trade_date: str
    provider: str
    quick_model: str
    deep_model: str
    analysis_mode: str
    analysis_depth: str
    max_debate_rounds: int
    response_detail: str

    def as_tuple(self) -> tuple[Hashable, ...]:
        return (
            self.ticker,
            self.trade_date,
            self.provider,
            self.quick_model,
            self.deep_model,
            self.analysis_mode,
            self.analysis_depth,
            self.max_debate_rounds,
            self.response_detail,
        )


@dataclass
class CacheEntry:
    value: dict[str, Any]
    expires_at: float


class AnalysisResultCache:
    """Small async TTL/LRU cache for completed analysis responses."""

    def __init__(self, ttl_seconds: int, max_entries: int) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._items: dict[tuple[Hashable, ...], CacheEntry] = {}
        self._order: OrderedDict[tuple[Hashable, ...], None] = OrderedDict()
        self._lock = asyncio.Lock()

    async def get(self, key: AnalysisCacheKey) -> dict[str, Any] | None:
        raw_key = key.as_tuple()
        now = time.monotonic()
        async with self._lock:
            entry = self._items.get(raw_key)
            if entry is None:
                return None
            if entry.expires_at <= now:
                self._items.pop(raw_key, None)
                self._order.pop(raw_key, None)
                return None
            self._touch(raw_key)
            cached = dict(entry.value)
            cached["cache"] = {"hit": True, "source": "result_cache"}
            return cached

    async def set(self, key: AnalysisCacheKey, value: dict[str, Any]) -> None:
        raw_key = key.as_tuple()
        async with self._lock:
            stored = dict(value)
            stored["cache"] = {"hit": False, "source": "pipeline"}
            self._items[raw_key] = CacheEntry(
                value=stored,
                expires_at=time.monotonic() + self.ttl_seconds,
            )
            self._touch(raw_key)
            while len(self._order) > self.max_entries:
                stale_key, _ = self._order.popitem(last=False)
                self._items.pop(stale_key, None)

    async def stats(self) -> dict[str, int]:
        now = time.monotonic()
        async with self._lock:
            expired = [key for key, entry in self._items.items() if entry.expires_at <= now]
            for key in expired:
                self._items.pop(key, None)
                self._order.pop(key, None)
            return {
                "entries": len(self._items),
                "max_entries": self.max_entries,
                "ttl_seconds": self.ttl_seconds,
            }

    def _touch(self, raw_key: tuple[Hashable, ...]) -> None:
        self._order[raw_key] = None
        self._order.move_to_end(raw_key)


class InFlightRegistry:
    """Shares the same async work for identical analysis requests."""

    def __init__(self) -> None:
        self._tasks: dict[tuple[Hashable, ...], asyncio.Task] = {}
        self._lock = asyncio.Lock()

    async def run(self, key: AnalysisCacheKey, factory) -> tuple[dict[str, Any], bool]:
        raw_key = key.as_tuple()
        async with self._lock:
            task = self._tasks.get(raw_key)
            joined = task is not None and not task.done()
            if not joined:
                task = asyncio.create_task(factory())
                self._tasks[raw_key] = task

        try:
            result = await task
            result = dict(result)
            if joined:
                result["cache"] = {"hit": True, "source": "in_flight"}
            return result, joined
        finally:
            if not joined:
                async with self._lock:
                    if self._tasks.get(raw_key) is task:
                        self._tasks.pop(raw_key, None)

    async def stats(self) -> dict[str, int]:
        async with self._lock:
            return {"in_flight": sum(1 for task in self._tasks.values() if not task.done())}


@dataclass
class AnalysisJob:
    id: str
    request_id: str
    owner_id: str
    cache_key: AnalysisCacheKey
    payload: dict[str, Any]
    status: AnalysisStatus = "queued"
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    events: list[dict[str, Any]] = field(default_factory=list)
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    done_event: asyncio.Event = field(default_factory=asyncio.Event)
    event_condition: asyncio.Condition = field(default_factory=asyncio.Condition)
    queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    task: asyncio.Task | None = None

    async def publish(self, event_type: str, payload: dict[str, Any]) -> None:
        """Append a replayable job event and wake all current subscribers."""
        event = {
            "sequence": len(self.events),
            "type": event_type,
            "payload": payload,
            "created_at": time.time(),
        }
        async with self.event_condition:
            self.events.append(event)
            self.updated_at = time.time()
            self.event_condition.notify_all()

    def public_summary(self) -> dict[str, Any]:
        return {
            "job_id": self.id,
            "request_id": self.request_id,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "payload": self.payload,
            "result": self.result,
            "error": self.error,
        }


class AnalysisJobStore:
    """In-memory job registry for job-based API and cancellation."""

    def __init__(self, ttl_seconds: int, max_entries: int, max_active_jobs: int | None = None) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self.max_active_jobs = max_active_jobs if max_active_jobs is not None else max_entries
        self._jobs: dict[str, AnalysisJob] = {}
        self._lock = asyncio.Lock()

    async def create(self, *, owner_id: str, request_id: str, cache_key: AnalysisCacheKey, payload: dict[str, Any]) -> AnalysisJob:
        await self.cleanup()
        async with self._lock:
            active_jobs = self._active_job_count_locked()
            if active_jobs >= self.max_active_jobs:
                raise AnalysisJobLimitError(self.max_active_jobs)

            job = AnalysisJob(
                id=str(uuid.uuid4()),
                request_id=request_id,
                owner_id=owner_id,
                cache_key=cache_key,
                payload=payload,
            )
            self._jobs[job.id] = job
            await self._evict_locked()
        return job

    async def get(self, job_id: str, *, owner_id: str | None = None) -> AnalysisJob | None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if owner_id is not None and job.owner_id != owner_id:
                return None
            return job

    async def cancel(self, job_id: str, *, owner_id: str | None = None) -> AnalysisJob | None:
        job = await self.get(job_id, owner_id=owner_id)
        if job is None:
            return None
        job.cancel_event.set()
        if job.status not in {"completed", "failed", "cancelled"}:
            job.status = "cancelled"
            job.updated_at = time.time()
            job.error = {"request_id": job.request_id, "error": {"code": "ANALYSIS_CANCELLED", "message": "Analysis was cancelled by the client."}}
            await job.publish("error", job.error)
            job.done_event.set()
        if job.task and not job.task.done():
            job.task.cancel()
        return job

    async def cleanup(self) -> None:
        cutoff = time.time() - self.ttl_seconds
        async with self._lock:
            stale = [job_id for job_id, job in self._jobs.items() if job.updated_at < cutoff and job.status in {"completed", "failed", "cancelled"}]
            for job_id in stale:
                self._jobs.pop(job_id, None)
            await self._evict_locked()

    async def stats(self) -> dict[str, int]:
        await self.cleanup()
        async with self._lock:
            return {
                "jobs": len(self._jobs),
                "running": sum(1 for job in self._jobs.values() if job.status == "running"),
                "queued": sum(1 for job in self._jobs.values() if job.status == "queued"),
                "active": self._active_job_count_locked(),
                "max_active": self.max_active_jobs,
                "ttl_seconds": self.ttl_seconds,
            }

    def _active_job_count_locked(self) -> int:
        return sum(1 for job in self._jobs.values() if job.status in {"queued", "running"})

    async def _evict_locked(self) -> None:
        if len(self._jobs) <= self.max_entries:
            return
        ordered = sorted(self._jobs.values(), key=lambda item: item.updated_at)
        for job in ordered:
            if len(self._jobs) <= self.max_entries:
                break
            if job.status in {"completed", "failed", "cancelled"}:
                self._jobs.pop(job.id, None)
