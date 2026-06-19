"""Owner-session aware rate limiting with pluggable shared storage."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import sqlite3
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from fastapi import Request

from config import (
    API_KEY,
    MAX_CONCURRENT_REQUESTS_PER_KEY,
    MAX_CONCURRENT_STATUS_REQUESTS_PER_KEY,
    MAX_CONCURRENT_STREAMS_PER_KEY,
    RATE_LIMIT_DB_PATH,
    RATE_LIMIT_STORAGE_BACKEND,
    REQUEST_RATE_LIMIT_PER_MINUTE,
    REQUIRE_API_KEY_FOR_RATE_LIMIT,
    STATUS_RATE_LIMIT_PER_MINUTE,
    STREAM_RATE_LIMIT_PER_MINUTE,
)
from errors import AuthenticationError, RateLimitError
from owner_session import OWNER_SESSION_COOKIE_NAME, owner_identifier_from_token

# Idle slots older than this are eligible for eviction.
_TTL_SECONDS = 120

_WRITE_LOCKS: dict[Path, threading.RLock] = {}
_WRITE_LOCKS_GUARD = threading.Lock()


class _ServiceCredential:
    @property
    def api_key(self) -> str:
        return API_KEY


llm = _ServiceCredential()


@dataclass(frozen=True)
class RateLimitPolicy:
    scope: str
    max_per_minute: int
    max_concurrent: int


@dataclass
class _ClientState:
    timestamps: deque[float] = field(default_factory=deque)
    active: int = 0
    last_seen: float = field(default_factory=time.monotonic)


@dataclass
class RateLimiterState:
    """Process-local limiter state used for tests and single-process development."""

    ttl_seconds: int = _TTL_SECONDS
    states: dict[tuple[str, str], _ClientState] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class RateLimiterBackend(Protocol):
    async def acquire(self, identifier: str, policy: RateLimitPolicy) -> None: ...

    async def release(self, identifier: str, policy: RateLimitPolicy) -> None: ...

    async def touch(self, identifier: str, policy: RateLimitPolicy) -> None: ...


class MemoryRateLimiterBackend:
    def __init__(self, state: RateLimiterState | None = None) -> None:
        self.state = state or RateLimiterState()

    async def acquire(self, identifier: str, policy: RateLimitPolicy) -> None:
        now = time.monotonic()
        key = (policy.scope, identifier)

        async with self.state.lock:
            _evict_stale_entries(now, self.state)

            state = self.state.states.setdefault(key, _ClientState())
            state.last_seen = now

            while state.timestamps and now - state.timestamps[0] >= 60:
                state.timestamps.popleft()

            _raise_if_limited(state.timestamps, state.active, policy)

            state.timestamps.append(now)
            state.active += 1

    async def release(self, identifier: str, policy: RateLimitPolicy) -> None:
        key = (policy.scope, identifier)
        async with self.state.lock:
            state = self.state.states.get(key)
            if state is not None:
                state.active = max(0, state.active - 1)
                state.last_seen = time.monotonic()

    async def touch(self, identifier: str, policy: RateLimitPolicy) -> None:
        key = (policy.scope, identifier)
        async with self.state.lock:
            state = self.state.states.get(key)
            if state is not None and state.active > 0:
                state.last_seen = time.monotonic()


class SQLiteRateLimiterBackend:
    """SQLite-backed limiter for shared-volume deployments.

    It uses BEGIN IMMEDIATE around each bucket update so the sliding-window and
    active-count checks stay atomic across workers sharing the same database.
    """

    def __init__(self, db_path: str, ttl_seconds: int = _TTL_SECONDS) -> None:
        self.db_path = Path(db_path)
        self.ttl_seconds = ttl_seconds
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._write_lock = _write_lock_for_path(self.db_path)
        self._ensure_schema()

    async def acquire(self, identifier: str, policy: RateLimitPolicy) -> None:
        await asyncio.to_thread(self._acquire_sync, identifier, policy)

    async def release(self, identifier: str, policy: RateLimitPolicy) -> None:
        await asyncio.to_thread(self._release_sync, identifier, policy)

    async def touch(self, identifier: str, policy: RateLimitPolicy) -> None:
        await asyncio.to_thread(self._touch_sync, identifier, policy)

    def _acquire_sync(self, identifier: str, policy: RateLimitPolicy) -> None:
        now = time.time()
        with self._write_lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            self._evict_stale_entries(conn, now)
            row = conn.execute(
                """
                SELECT timestamps_json, active
                FROM rate_limit_buckets
                WHERE scope = ? AND identifier = ?
                """,
                (policy.scope, identifier),
            ).fetchone()
            timestamps = _loads_timestamps(row[0] if row else None)
            active = int(row[1] or 0) if row else 0
            timestamps = [value for value in timestamps if now - value < 60]

            _raise_if_limited(timestamps, active, policy)

            timestamps.append(now)
            conn.execute(
                (
                    "\n"
                    + "                INSERT INTO rate_limit_buckets (scope, identifier, "
                    + "timestamps_json, active, last_seen)\n"
                    + "                VALUES (?, ?, ?, ?, ?)\n"
                    + "                ON CONFLICT(scope, identifier) DO UPDATE SET\n"
                    + "                    timestamps_json = excluded.timestamps_json,\n"
                    + "                    active = excluded.active,\n"
                    + "                    last_seen = excluded.last_seen\n"
                    + "                "
                ),
                (
                    policy.scope,
                    identifier,
                    json.dumps(timestamps, separators=(",", ":")),
                    active + 1,
                    now,
                ),
            )

    def _release_sync(self, identifier: str, policy: RateLimitPolicy) -> None:
        now = time.time()
        with self._write_lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                """
                SELECT active
                FROM rate_limit_buckets
                WHERE scope = ? AND identifier = ?
                """,
                (policy.scope, identifier),
            ).fetchone()
            if row is None:
                return
            active = max(0, int(row[0] or 0) - 1)
            conn.execute(
                """
                UPDATE rate_limit_buckets
                SET active = ?, last_seen = ?
                WHERE scope = ? AND identifier = ?
                """,
                (active, now, policy.scope, identifier),
            )

    def _touch_sync(self, identifier: str, policy: RateLimitPolicy) -> None:
        now = time.time()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                """
                UPDATE rate_limit_buckets
                SET last_seen = ?
                WHERE scope = ? AND identifier = ? AND active > 0
                """,
                (now, policy.scope, identifier),
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.execute("PRAGMA busy_timeout = 30000")
        return conn

    def _ensure_schema(self) -> None:
        with self._write_lock, self._connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS rate_limit_buckets (
                    scope TEXT NOT NULL,
                    identifier TEXT NOT NULL,
                    timestamps_json TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 0,
                    last_seen REAL NOT NULL,
                    PRIMARY KEY (scope, identifier)
                )
                """
            )
            conn.execute(
                (
                    "CREATE INDEX IF NOT EXISTS idx_rate_limit_last_seen ON rate_limit_buckets "
                    + "(last_seen)"
                )
            )

    def _evict_stale_entries(self, conn: sqlite3.Connection, now: float) -> None:
        conn.execute(
            """
            DELETE FROM rate_limit_buckets
            WHERE (active <= 0 AND last_seen < ?)
               OR (scope = 'stream' AND active > 0 AND last_seen < ?)
            """,
            (now - self.ttl_seconds, now - self.ttl_seconds),
        )


def create_rate_limiter_state() -> RateLimiterState:
    return RateLimiterState()


_RATE_LIMITER_STATE = create_rate_limiter_state()
_RATE_LIMITER_BACKEND: RateLimiterBackend | None = None


def _write_lock_for_path(path: Path) -> threading.RLock:
    resolved = path.resolve(strict=False)
    with _WRITE_LOCKS_GUARD:
        lock = _WRITE_LOCKS.get(resolved)
        if lock is None:
            lock = threading.RLock()
            _WRITE_LOCKS[resolved] = lock
        return lock


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def _loads_timestamps(value: str | None) -> list[float]:
    try:
        parsed = json.loads(value or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    timestamps: list[float] = []
    for item in parsed:
        try:
            timestamps.append(float(item))
        except (TypeError, ValueError):
            continue
    return timestamps


def _raise_if_limited(timestamps, active: int, policy: RateLimitPolicy) -> None:
    if len(timestamps) >= policy.max_per_minute:
        raise RateLimitError(
            "Too many requests. Try again shortly.",
            details={"scope": policy.scope, "limit_per_minute": policy.max_per_minute},
        )

    if active >= policy.max_concurrent:
        if policy.scope == "request":
            message = "Too many analyses are already running for this owner session."
        elif policy.scope == "market":
            message = "Too many market data requests are already running for this owner session."
        else:
            message = "Too many requests are already running for this owner session."
        raise RateLimitError(
            message,
            details={"scope": policy.scope, "max_concurrent": policy.max_concurrent},
        )


def _evict_stale_entries(now: float, limiter_state: RateLimiterState) -> None:
    stale = [
        key
        for key, state in limiter_state.states.items()
        if (now - state.last_seen) > limiter_state.ttl_seconds
        and (state.active == 0 or (key[0] == "stream" and state.active > 0))
    ]
    for key in stale:
        del limiter_state.states[key]


def create_rate_limiter_backend() -> RateLimiterBackend:
    if RATE_LIMIT_STORAGE_BACKEND == "sqlite":
        return SQLiteRateLimiterBackend(RATE_LIMIT_DB_PATH)
    return MemoryRateLimiterBackend(_RATE_LIMITER_STATE)


def get_rate_limiter_backend(request: Request | None = None) -> RateLimiterBackend:
    if request is not None:
        backend = getattr(request.app.state, "rate_limiter_backend", None)
        if backend is not None:
            return backend

    global _RATE_LIMITER_BACKEND
    if _RATE_LIMITER_BACKEND is None:
        _RATE_LIMITER_BACKEND = create_rate_limiter_backend()
    return _RATE_LIMITER_BACKEND


def get_rate_limiter_state(request: Request | None = None) -> RateLimiterState:
    if request is not None:
        state = getattr(request.app.state, "rate_limiter_state", None)
        if isinstance(state, RateLimiterState):
            return state
    return _RATE_LIMITER_STATE


def validate_service_credential(request: Request) -> str:
    """Validate the reverse-proxy credential without using it as owner scope."""
    api_key = request.headers.get("x-api-key", "").strip()
    auth = request.headers.get("authorization", "")
    if not api_key and auth.lower().startswith("bearer "):
        api_key = auth.split(" ", 1)[1].strip()

    configured_api_key = llm.api_key
    if configured_api_key:
        if not api_key:
            raise AuthenticationError(
                "Missing API key. Send x-api-key or Authorization: Bearer <key>."
            )
        if not hmac.compare_digest(api_key, configured_api_key):
            raise AuthenticationError("Invalid API key.")
        return f"service:{_hash(api_key)}"

    if api_key:
        if REQUIRE_API_KEY_FOR_RATE_LIMIT:
            raise AuthenticationError("Server API key is not configured.")
        return f"service:{_hash(api_key)}"

    if REQUIRE_API_KEY_FOR_RATE_LIMIT:
        raise AuthenticationError("Missing API key. Send x-api-key or Authorization: Bearer <key>.")

    return "service:development"


def get_client_identifier(request: Request) -> str:
    """Return the signed browser owner scope used for resources and quotas."""
    validate_service_credential(request)
    owner_token = (
        request.headers.get("x-owner-token", "").strip()
        or str(request.cookies.get(OWNER_SESSION_COOKIE_NAME) or "").strip()
    )
    if not owner_token:
        raise AuthenticationError("Missing owner session token. Call POST /api/session first.")
    return owner_identifier_from_token(owner_token)


class RateLimitLease:
    def __init__(
        self,
        identifier: str,
        policy: RateLimitPolicy,
        backend: RateLimiterBackend | None = None,
    ) -> None:
        self.identifier = identifier
        self.policy = policy
        self._backend = backend or get_rate_limiter_backend()
        self._acquired = False

    async def __aenter__(self) -> RateLimitLease:
        await self._backend.acquire(self.identifier, self.policy)
        self._acquired = True
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if not self._acquired:
            return
        await self._backend.release(self.identifier, self.policy)
        self._acquired = False

    async def touch(self) -> None:
        if self._acquired:
            await self._backend.touch(self.identifier, self.policy)


def request_policy() -> RateLimitPolicy:
    return RateLimitPolicy(
        scope="request",
        max_per_minute=REQUEST_RATE_LIMIT_PER_MINUTE,
        max_concurrent=MAX_CONCURRENT_REQUESTS_PER_KEY,
    )


def status_policy() -> RateLimitPolicy:
    return RateLimitPolicy(
        scope="status",
        max_per_minute=STATUS_RATE_LIMIT_PER_MINUTE,
        max_concurrent=MAX_CONCURRENT_STATUS_REQUESTS_PER_KEY,
    )


def stream_policy() -> RateLimitPolicy:
    return RateLimitPolicy(
        scope="stream",
        max_per_minute=STREAM_RATE_LIMIT_PER_MINUTE,
        max_concurrent=MAX_CONCURRENT_STREAMS_PER_KEY,
    )


def limit_request(
    request: Request,
    policy: RateLimitPolicy,
    limiter_state: RateLimiterState | None = None,
) -> RateLimitLease:
    backend: RateLimiterBackend
    if limiter_state is not None:
        backend = MemoryRateLimiterBackend(limiter_state)
    else:
        backend = get_rate_limiter_backend(request)
    return RateLimitLease(get_client_identifier(request), policy, backend)


def reset_rate_limiter_for_tests() -> None:
    """Clear limiter state for deterministic tests."""
    global _RATE_LIMITER_STATE, _RATE_LIMITER_BACKEND
    _RATE_LIMITER_STATE = create_rate_limiter_state()
    _RATE_LIMITER_BACKEND = None
