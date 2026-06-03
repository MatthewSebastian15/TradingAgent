"""Analysis result cache, in-flight de-duplication, cancellation, and job state.

The API runs expensive analysis jobs that can consume several LLM calls. This
module keeps those costs under control by caching finished results, sharing
identical in-flight work, and tracking cancellable streaming jobs.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections import OrderedDict, deque
from collections.abc import Awaitable, Callable, Hashable
from dataclasses import dataclass, field
from typing import Any, Literal

AnalysisStatus = Literal["queued", "running", "completed", "failed", "cancelled"]
TERMINAL_ANALYSIS_STATUSES = {"completed", "failed", "cancelled"}
DEFAULT_JOB_EVENT_REPLAY_LIMIT = 500


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
    time_horizon_months: int
    max_debate_rounds: int
    response_detail: str
    has_existing_position: bool = False
    position_quantity: float | None = None
    average_entry_price: float | None = None

    def as_tuple(self) -> tuple[Hashable, ...]:
        return (
            self.ticker,
            self.trade_date,
            self.provider,
            self.quick_model,
            self.deep_model,
            self.analysis_mode,
            self.analysis_depth,
            self.time_horizon_months,
            self.max_debate_rounds,
            self.response_detail,
            self.has_existing_position,
            self.position_quantity,
            self.average_entry_price,
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
    events: deque[dict[str, Any]] = field(default_factory=deque)
    max_event_history: int = DEFAULT_JOB_EVENT_REPLAY_LIMIT
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    done_event: asyncio.Event = field(default_factory=asyncio.Event)
    event_condition: asyncio.Condition = field(default_factory=asyncio.Condition)
    queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    state_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    task: asyncio.Task | None = None
    persist_callback: Callable[[AnalysisJob], Awaitable[None]] | None = field(default=None, repr=False)
    _next_event_sequence: int = 0

    def __post_init__(self) -> None:
        self.max_event_history = max(1, int(self.max_event_history))
        self.events = deque(self.events, maxlen=self.max_event_history)
        if self.events:
            self._next_event_sequence = max(int(event.get("sequence", -1)) for event in self.events) + 1
        if self.status in TERMINAL_ANALYSIS_STATUSES:
            self.done_event.set()
        if self.status == "cancelled":
            self.cancel_event.set()

    @classmethod
    def from_snapshot(
        cls,
        snapshot: dict[str, Any],
        *,
        persist_callback: Callable[[AnalysisJob], Awaitable[None]] | None = None,
    ) -> AnalysisJob:
        cache_key = snapshot.get("cache_key")
        if isinstance(cache_key, dict):
            parsed_cache_key = AnalysisCacheKey(**cache_key)
        else:
            parsed_cache_key = AnalysisCacheKey(*cache_key)

        return cls(
            id=snapshot["id"],
            request_id=snapshot["request_id"],
            owner_id=snapshot["owner_id"],
            cache_key=parsed_cache_key,
            payload=snapshot.get("payload") or {},
            status=snapshot.get("status", "queued"),
            created_at=float(snapshot.get("created_at") or time.time()),
            updated_at=float(snapshot.get("updated_at") or time.time()),
            events=deque(snapshot.get("events") or []),
            max_event_history=int(snapshot.get("max_event_history") or DEFAULT_JOB_EVENT_REPLAY_LIMIT),
            result=snapshot.get("result"),
            error=snapshot.get("error"),
            persist_callback=persist_callback,
        )

    def to_snapshot(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "request_id": self.request_id,
            "owner_id": self.owner_id,
            "cache_key": self.cache_key.__dict__,
            "payload": self.payload,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "events": list(self.events),
            "max_event_history": self.max_event_history,
            "result": self.result,
            "error": self.error,
        }

    async def _persist(self) -> None:
        if self.persist_callback is not None:
            await self.persist_callback(self)

    async def _append_event(self, event_type: str, payload: dict[str, Any]) -> None:
        event = {
            "sequence": self._next_event_sequence,
            "type": event_type,
            "payload": payload,
            "created_at": time.time(),
        }
        self._next_event_sequence += 1
        async with self.event_condition:
            self.events.append(event)
            self.updated_at = time.time()
            self.event_condition.notify_all()

    async def publish(self, event_type: str, payload: dict[str, Any]) -> bool:
        """Append a bounded replayable job event and wake all subscribers."""
        async with self.state_lock:
            if self.status in TERMINAL_ANALYSIS_STATUSES and event_type not in {"result", "error"}:
                return False
            await self._append_event(event_type, payload)
            return True

    async def events_since(self, sequence: int) -> list[dict[str, Any]]:
        async with self.event_condition:
            return [event for event in self.events if event["sequence"] >= sequence]

    async def mark_running(self) -> bool:
        async with self.state_lock:
            if self.status in TERMINAL_ANALYSIS_STATUSES:
                return False
            self.status = "running"
            self.updated_at = time.time()
            return True

    async def complete(self, result: dict[str, Any]) -> bool:
        async with self.state_lock:
            if self.status in TERMINAL_ANALYSIS_STATUSES:
                return False
            self.result = result
            self.error = None
            self.status = "completed"
            self.done_event.set()
            await self._append_event("result", result)
        await self._persist()
        return True

    async def fail(self, error: dict[str, Any]) -> bool:
        async with self.state_lock:
            if self.status in TERMINAL_ANALYSIS_STATUSES:
                return False
            self.error = error
            self.status = "failed"
            self.done_event.set()
            await self._append_event("error", error)
        await self._persist()
        return True

    async def cancel(self, error: dict[str, Any]) -> bool:
        async with self.state_lock:
            self.cancel_event.set()
            if self.status in TERMINAL_ANALYSIS_STATUSES:
                return False
            self.error = error
            self.status = "cancelled"
            self.done_event.set()
            await self._append_event("error", error)
        await self._persist()
        return True

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
    """Job registry for job-based API and cancellation.

    Active jobs live in memory. Terminal jobs can also be written through the
    optional persistent cache so completed results survive backend restarts.
    """

    def __init__(
        self,
        ttl_seconds: int,
        max_entries: int,
        max_active_jobs: int | None = None,
        max_event_history: int = DEFAULT_JOB_EVENT_REPLAY_LIMIT,
        persistent_cache: Any | None = None,
    ) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self.max_active_jobs = max_active_jobs if max_active_jobs is not None else max_entries
        self.max_event_history = max(1, int(max_event_history))
        self.persistent_cache = persistent_cache
        self._jobs: dict[str, AnalysisJob] = {}
        self._job_ids_by_request_id: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def create(
        self, *, owner_id: str, request_id: str, cache_key: AnalysisCacheKey, payload: dict[str, Any]
    ) -> AnalysisJob:
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
                max_event_history=self.max_event_history,
                persist_callback=self._persist_terminal_job,
            )
            self._register_job_locked(job)
            await self._evict_locked()
        return job

    async def get(self, job_id: str, *, owner_id: str | None = None) -> AnalysisJob | None:
        async with self._lock:
            job = self._jobs.get(job_id)
        if job is None:
            job = await self._load_persisted_job("job_id", job_id)
        if job is None:
            return None
        if owner_id is not None and job.owner_id != owner_id:
            return None
        return job

    async def get_by_request_id(self, request_id: str, *, owner_id: str | None = None) -> AnalysisJob | None:
        async with self._lock:
            job_id = self._job_ids_by_request_id.get(request_id)
            job = self._jobs.get(job_id) if job_id is not None else None
        if job is None:
            job = await self._load_persisted_job("request_id", request_id)
        if job is None:
            return None
        if owner_id is not None and job.owner_id != owner_id:
            return None
        return job

    async def cancel(self, job_id: str, *, owner_id: str | None = None) -> AnalysisJob | None:
        job = await self.get(job_id, owner_id=owner_id)
        if job is None:
            return None
        changed = await job.cancel(
            {
                "request_id": job.request_id,
                "error": {"code": "ANALYSIS_CANCELLED", "message": "Analysis was cancelled by the client."},
            }
        )
        if changed and job.task and not job.task.done():
            job.task.cancel()
        return job

    async def cleanup(self) -> None:
        cutoff = time.time() - self.ttl_seconds
        async with self._lock:
            stale = [
                job_id
                for job_id, job in self._jobs.items()
                if job.updated_at < cutoff and job.status in {"completed", "failed", "cancelled"}
            ]
            for job_id in stale:
                self._remove_job_locked(job_id)
            await self._evict_locked()

    async def stats(self) -> dict[str, int]:
        await self.cleanup()
        async with self._lock:
            stats = {
                "jobs": len(self._jobs),
                "running": sum(1 for job in self._jobs.values() if job.status == "running"),
                "queued": sum(1 for job in self._jobs.values() if job.status == "queued"),
                "active": self._active_job_count_locked(),
                "max_active": self.max_active_jobs,
                "ttl_seconds": self.ttl_seconds,
            }
        if self.persistent_cache is not None:
            cache_stats = await asyncio.to_thread(self.persistent_cache.stats)
            stats["persistent_entries"] = int(cache_stats.get("entries", 0))
        return stats

    def _active_job_count_locked(self) -> int:
        return sum(1 for job in self._jobs.values() if job.status in {"queued", "running"})

    def _register_job_locked(self, job: AnalysisJob) -> None:
        existing = self._jobs.get(job.id)
        if existing is not None and self._job_ids_by_request_id.get(existing.request_id) == job.id:
            self._job_ids_by_request_id.pop(existing.request_id, None)
        self._jobs[job.id] = job
        self._job_ids_by_request_id[job.request_id] = job.id

    def _remove_job_locked(self, job_id: str) -> None:
        job = self._jobs.pop(job_id, None)
        if job is not None and self._job_ids_by_request_id.get(job.request_id) == job_id:
            self._job_ids_by_request_id.pop(job.request_id, None)

    async def _evict_locked(self) -> None:
        if len(self._jobs) <= self.max_entries:
            return
        ordered = sorted(self._jobs.values(), key=lambda item: item.updated_at)
        for job in ordered:
            if len(self._jobs) <= self.max_entries:
                break
            if job.status in {"completed", "failed", "cancelled"}:
                self._remove_job_locked(job.id)

    async def _persist_terminal_job(self, job: AnalysisJob) -> None:
        if self.persistent_cache is None or job.status not in TERMINAL_ANALYSIS_STATUSES:
            return

        snapshot = job.to_snapshot()
        await asyncio.to_thread(self.persistent_cache.set, self._persistent_key("job_id", job.id), snapshot)
        await asyncio.to_thread(self.persistent_cache.set, self._persistent_key("request_id", job.request_id), snapshot)

    async def _load_persisted_job(self, key_type: str, value: str) -> AnalysisJob | None:
        if self.persistent_cache is None:
            return None

        snapshot = await asyncio.to_thread(self.persistent_cache.get, self._persistent_key(key_type, value))
        if not isinstance(snapshot, dict):
            return None

        try:
            job = AnalysisJob.from_snapshot(snapshot, persist_callback=self._persist_terminal_job)
        except (KeyError, TypeError, ValueError):
            return None

        async with self._lock:
            self._register_job_locked(job)
            await self._evict_locked()
        return job

    @staticmethod
    def _persistent_key(key_type: str, value: str) -> list[str]:
        return ["analysis_job", key_type, value]
