"""Resilience primitives for LLM and external API calls.

Provides:
- retry with exponential backoff and jitter
- per-service circuit breaker
- sync timeout wrapper for blocking vendor calls
- small TTL/LRU cache
"""

from __future__ import annotations

import concurrent.futures
import functools
import logging
import random
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Callable, Hashable, Optional, TypeVar

logger = logging.getLogger(__name__)
T = TypeVar("T")


class CircuitOpenError(RuntimeError):
    pass


@dataclass
class CircuitState:
    failures: int = 0
    opened_at: float | None = None


class CircuitBreaker:
    def __init__(self, name: str, failure_threshold: int = 5, recovery_seconds: int = 60):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_seconds = recovery_seconds
        self._state = CircuitState()
        self._lock = threading.Lock()

    def before_call(self) -> None:
        with self._lock:
            if self._state.opened_at is None:
                return
            elapsed = time.monotonic() - self._state.opened_at
            if elapsed >= self.recovery_seconds:
                logger.warning("Circuit half-open for %s after %.1fs", self.name, elapsed)
                self._state.opened_at = None
                self._state.failures = 0
                return
            raise CircuitOpenError(
                f"Circuit breaker is open for {self.name}. Retry after {self.recovery_seconds - elapsed:.0f}s."
            )

    def record_success(self) -> None:
        with self._lock:
            self._state.failures = 0
            self._state.opened_at = None

    def record_failure(self, exc: Exception) -> None:
        with self._lock:
            self._state.failures += 1
            if self._state.failures >= self.failure_threshold:
                self._state.opened_at = time.monotonic()
                logger.error("Circuit opened for %s after %d failures. Last error: %s", self.name, self._state.failures, exc)


_CIRCUITS: dict[str, CircuitBreaker] = {}
_CIRCUITS_LOCK = threading.Lock()


def get_circuit(name: str, failure_threshold: int = 5, recovery_seconds: int = 60) -> CircuitBreaker:
    with _CIRCUITS_LOCK:
        if name not in _CIRCUITS:
            _CIRCUITS[name] = CircuitBreaker(name, failure_threshold, recovery_seconds)
        return _CIRCUITS[name]


def call_with_retry(
    func: Callable[[], T],
    *,
    service_name: str,
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    circuit_failure_threshold: int = 5,
    circuit_recovery_seconds: int = 60,
    retryable: tuple[type[BaseException], ...] = (Exception,),
) -> T:
    circuit = get_circuit(service_name, circuit_failure_threshold, circuit_recovery_seconds)
    attempt = 0
    last_exc: Exception | None = None

    while attempt < max_attempts:
        attempt += 1
        circuit.before_call()
        try:
            result = func()
            circuit.record_success()
            return result
        except retryable as exc:
            last_exc = exc
            circuit.record_failure(exc if isinstance(exc, Exception) else Exception(str(exc)))
            if attempt >= max_attempts:
                break
            sleep_for = min(max_delay, base_delay * (2 ** (attempt - 1)))
            sleep_for += random.uniform(0, min(1.0, sleep_for * 0.25))
            logger.warning(
                "%s failed on attempt %d/%d: %s. Retrying in %.2fs",
                service_name,
                attempt,
                max_attempts,
                exc,
                sleep_for,
            )
            time.sleep(sleep_for)

    raise last_exc or RuntimeError(f"{service_name} failed without an exception")


def call_with_timeout(func: Callable[[], T], *, timeout_seconds: int, service_name: str) -> T:
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(func)
        try:
            return future.result(timeout=timeout_seconds)
        except concurrent.futures.TimeoutError as exc:
            future.cancel()
            raise TimeoutError(f"{service_name} timed out after {timeout_seconds}s") from exc


class TTLCache:
    def __init__(self, maxsize: int = 256, ttl_seconds: int = 900):
        self.maxsize = maxsize
        self.ttl_seconds = ttl_seconds
        self._data: OrderedDict[Hashable, tuple[float, Any]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: Hashable) -> Any | None:
        now = time.monotonic()
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at < now:
                self._data.pop(key, None)
                return None
            self._data.move_to_end(key)
            return value

    def set(self, key: Hashable, value: Any) -> None:
        expires_at = time.monotonic() + self.ttl_seconds
        with self._lock:
            self._data[key] = (expires_at, value)
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)

    def clear_expired(self) -> None:
        now = time.monotonic()
        with self._lock:
            for key in list(self._data.keys()):
                if self._data[key][0] < now:
                    self._data.pop(key, None)


def ttl_cache(maxsize: int = 256, ttl_seconds: int = 900):
    cache = TTLCache(maxsize=maxsize, ttl_seconds=ttl_seconds)

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            key = (func.__module__, func.__name__, args, tuple(sorted(kwargs.items())))
            cached = cache.get(key)
            if cached is not None:
                return cached
            value = func(*args, **kwargs)
            cache.set(key, value)
            return value
        wrapper.cache_clear_expired = cache.clear_expired  # type: ignore[attr-defined]
        return wrapper

    return decorator
