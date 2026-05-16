"""API-key aware in-memory rate limiting."""

from __future__ import annotations

import asyncio
import hashlib
import time
from collections import defaultdict, deque
from dataclasses import dataclass

from fastapi import Request

from config import (REQUIRE_API_KEY_FOR_RATE_LIMIT, REQUEST_RATE_LIMIT_PER_MINUTE,
    MAX_CONCURRENT_REQUESTS_PER_KEY, STREAM_RATE_LIMIT_PER_MINUTE,
    MAX_CONCURRENT_STREAMS_PER_KEY)
from errors import RateLimitError


@dataclass(frozen=True)
class RateLimitPolicy:
    scope: str
    max_per_minute: int
    max_concurrent: int


@dataclass
class _ClientState:
    timestamps: deque[float]
    active: int = 0


_states: dict[tuple[str, str], _ClientState] = defaultdict(lambda: _ClientState(deque()))
_lock = asyncio.Lock()


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def get_client_identifier(request: Request) -> str:
    api_key = request.headers.get("x-api-key")
    auth = request.headers.get("authorization", "")
    if not api_key and auth.lower().startswith("bearer "):
        api_key = auth.split(" ", 1)[1].strip()

    if api_key:
        return f"api_key:{_hash(api_key)}"

    if REQUIRE_API_KEY_FOR_RATE_LIMIT:
        raise RateLimitError("Missing API key. Send x-api-key or Authorization: Bearer <key>.")

    forwarded_for = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip", "").strip()
    client_host = request.client.host if request.client else "unknown-client"
    user_agent = request.headers.get("user-agent", "unknown-agent")[:160]
    fallback = forwarded_for or real_ip or client_host or "unknown-client"
    return f"fallback:{_hash(fallback + '|' + user_agent)}"


class RateLimitLease:
    def __init__(self, identifier: str, policy: RateLimitPolicy):
        self.identifier = identifier
        self.policy = policy
        self.acquired = False

    async def __aenter__(self):
        now = time.monotonic()
        key = (self.policy.scope, self.identifier)
        async with _lock:
            state = _states[key]
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
            self.acquired = True
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if not self.acquired:
            return
        key = (self.policy.scope, self.identifier)
        async with _lock:
            state = _states[key]
            state.active = max(0, state.active - 1)


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


def reset_rate_limiter_for_tests() -> None:
    """Clear in-memory limiter state for deterministic tests."""
    _states.clear()
