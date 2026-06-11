"""Owner-session aware in-memory rate limiting with automatic state cleanup."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import time
from collections import deque
from dataclasses import dataclass, field

from fastapi import Request

from config import (
    MAX_CONCURRENT_REQUESTS_PER_KEY,
    MAX_CONCURRENT_STREAMS_PER_KEY,
    REQUEST_RATE_LIMIT_PER_MINUTE,
    REQUIRE_API_KEY_FOR_RATE_LIMIT,
    STREAM_RATE_LIMIT_PER_MINUTE,
    llm,
)
from errors import AuthenticationError, RateLimitError
from owner_session import OWNER_SESSION_COOKIE_NAME, owner_identifier_from_token

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


@dataclass
class RateLimiterState:
    """Mutable limiter state kept behind a small resettable container."""

    ttl_seconds: int = _TTL_SECONDS
    states: dict[tuple[str, str], _ClientState] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


def create_rate_limiter_state() -> RateLimiterState:
    return RateLimiterState()


_RATE_LIMITER_STATE = create_rate_limiter_state()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def get_rate_limiter_state(request: Request | None = None) -> RateLimiterState:
    if request is not None:
        state = getattr(request.app.state, "rate_limiter_state", None)
        if isinstance(state, RateLimiterState):
            return state
    return _RATE_LIMITER_STATE


def _evict_stale_entries(now: float, limiter_state: RateLimiterState) -> None:
    """Remove entries that have no active requests and haven't been seen recently.

    Must be called while holding *limiter_state.lock*.
    """
    stale = [
        key
        for key, state in limiter_state.states.items()
        if state.active == 0 and (now - state.last_seen) > limiter_state.ttl_seconds
    ]
    for key in stale:
        del limiter_state.states[key]


def validate_service_credential(request: Request) -> str:
    """Validate the reverse-proxy credential without using it as owner scope."""
    api_key = request.headers.get("x-api-key", "").strip()
    auth = request.headers.get("authorization", "")
    if not api_key and auth.lower().startswith("bearer "):
        api_key = auth.split(" ", 1)[1].strip()

    configured_api_key = llm.api_key
    if configured_api_key:
        if not api_key:
            raise AuthenticationError("Missing API key. Send x-api-key or Authorization: Bearer <key>.")
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


# ---------------------------------------------------------------------------
# Rate-limit lease (context manager)
# ---------------------------------------------------------------------------


class RateLimitLease:
    def __init__(
        self,
        identifier: str,
        policy: RateLimitPolicy,
        limiter_state: RateLimiterState | None = None,
    ) -> None:
        self.identifier = identifier
        self.policy = policy
        self._state = limiter_state or get_rate_limiter_state()
        self._acquired = False

    async def __aenter__(self) -> RateLimitLease:
        now = time.monotonic()
        key = (self.policy.scope, self.identifier)

        async with self._state.lock:
            _evict_stale_entries(now, self._state)

            state = self._state.states.setdefault(key, _ClientState())
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
                    "Too many analyses are already running for this owner session.",
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
        async with self._state.lock:
            state = self._state.states.get(key)
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


def limit_request(
    request: Request,
    policy: RateLimitPolicy,
    limiter_state: RateLimiterState | None = None,
) -> RateLimitLease:
    return RateLimitLease(get_client_identifier(request), policy, limiter_state or get_rate_limiter_state(request))


# ---------------------------------------------------------------------------
# Test utility
# ---------------------------------------------------------------------------


def reset_rate_limiter_for_tests() -> None:
    """Clear in-memory limiter state for deterministic tests."""
    global _RATE_LIMITER_STATE
    _RATE_LIMITER_STATE = create_rate_limiter_state()
