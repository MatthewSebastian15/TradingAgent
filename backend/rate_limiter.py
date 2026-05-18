"""API-key aware in-memory rate limiting with automatic state cleanup."""

from __future__ import annotations

import asyncio
import hashlib
import time
from collections import deque
from dataclasses import dataclass, field

from fastapi import Request

from config import (
    REQUIRE_API_KEY_FOR_RATE_LIMIT,
    REQUEST_RATE_LIMIT_PER_MINUTE,
    MAX_CONCURRENT_REQUESTS_PER_KEY,
    STREAM_RATE_LIMIT_PER_MINUTE,
    MAX_CONCURRENT_STREAMS_PER_KEY,
)
from errors import RateLimitError

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Idle slots older than this are eligible for eviction.
_TTL_SECONDS = 120

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


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


# Single global lock guards both _states and the cleanup routine so they never
# race against each other.
_states: dict[tuple[str, str], _ClientState] = {}
_lock = asyncio.Lock()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def _evict_stale_entries(now: float) -> None:
    """Remove entries that have no active requests and haven't been seen recently.

    Must be called while holding *_lock*.
    """
    stale = [
        key
        for key, state in _states.items()
        if state.active == 0 and (now - state.last_seen) > _TTL_SECONDS
    ]
    for key in stale:
        del _states[key]


def get_client_identifier(request: Request) -> str:
    """Derive a stable, opaque identifier for the caller.

    Priority:
      1. x-api-key header
      2. Authorization: Bearer <token>
      3. Fallback: direct client IP (not x-forwarded-for, which can be spoofed)

    When *REQUIRE_API_KEY_FOR_RATE_LIMIT* is True and neither key nor bearer
    token is present, a *RateLimitError* is raised immediately.

    The fallback deliberately ignores x-forwarded-for and x-real-ip to prevent
    clients from spoofing those headers to bypass per-IP limits.  If the
    server sits behind a trusted reverse proxy that strips and re-injects those
    headers you can re-enable them, but that is a deployment-level decision, not
    a default.
    """
    api_key = request.headers.get("x-api-key", "").strip()
    auth = request.headers.get("authorization", "")
    if not api_key and auth.lower().startswith("bearer "):
        api_key = auth.split(" ", 1)[1].strip()

    if api_key:
        return f"api_key:{_hash(api_key)}"

    if REQUIRE_API_KEY_FOR_RATE_LIMIT:
        raise RateLimitError(
            "Missing API key. Send x-api-key or Authorization: Bearer <key>."
        )

    # Use only the direct TCP peer address — it cannot be forged by the client.
    client_host = request.client.host if request.client else "unknown-client"
    return f"ip:{_hash(client_host)}"


# ---------------------------------------------------------------------------
# Rate-limit lease (context manager)
# ---------------------------------------------------------------------------


class RateLimitLease:
    def __init__(self, identifier: str, policy: RateLimitPolicy) -> None:
        self.identifier = identifier
        self.policy = policy
        self._acquired = False

    async def __aenter__(self) -> "RateLimitLease":
        now = time.monotonic()
        key = (self.policy.scope, self.identifier)

        async with _lock:
            _evict_stale_entries(now)

            state = _states.setdefault(key, _ClientState())
            state.last_seen = now

            # Drop timestamps older than 60 s sliding window.
            while state.timestamps and now - state.timestamps[0] >= 60:
                state.timestamps.popleft()

            if len(state.timestamps) >= self.policy.max_per_minute:
                raise RateLimitError(
                    "Too many requests. Try again shortly.",
                    details={
                        "scope": self.policy.scope,
                        "limit_per_minute": self.policy.max_per_minute,
                    },
                )

            if state.active >= self.policy.max_concurrent:
                raise RateLimitError(
                    "Too many analyses are already running for this API key.",
                    details={
                        "scope": self.policy.scope,
                        "max_concurrent": self.policy.max_concurrent,
                    },
                )

            state.timestamps.append(now)
            state.active += 1
            self._acquired = True

        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if not self._acquired:
            return
        key = (self.policy.scope, self.identifier)
        async with _lock:
            state = _states.get(key)
            if state is not None:
                state.active = max(0, state.active - 1)
                state.last_seen = time.monotonic()


# ---------------------------------------------------------------------------
# Policy factories
# ---------------------------------------------------------------------------


def request_policy() -> RateLimitPolicy:
    return RateLimitPolicy(
        scope="request",
        max_per_minute=REQUEST_RATE_LIMIT_PER_MINUTE,
        max_concurrent=MAX_CONCURRENT_REQUESTS_PER_KEY,
    )


def stream_policy() -> RateLimitPolicy:
    return RateLimitPolicy(
        scope="stream",
        max_per_minute=STREAM_RATE_LIMIT_PER_MINUTE,
        max_concurrent=MAX_CONCURRENT_STREAMS_PER_KEY,
    )


def limit_request(request: Request, policy: RateLimitPolicy) -> RateLimitLease:
    return RateLimitLease(get_client_identifier(request), policy)


# ---------------------------------------------------------------------------
# Test utility
# ---------------------------------------------------------------------------


def reset_rate_limiter_for_tests() -> None:
    """Clear in-memory limiter state for deterministic tests."""
    _states.clear()
