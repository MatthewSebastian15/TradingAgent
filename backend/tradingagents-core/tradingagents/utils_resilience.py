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
import os
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
    half_open_probe_in_flight: bool = False


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
                if self._state.half_open_probe_in_flight:
                    raise CircuitOpenError(f"Circuit breaker is half-open for {self.name}; recovery probe already in progress.")
                logger.warning("Circuit half-open for %s after %.1fs", self.name, elapsed)
                self._state.half_open_probe_in_flight = True
                return
            raise CircuitOpenError(
                f"Circuit breaker is open for {self.name}. Retry after {self.recovery_seconds - elapsed:.0f}s."
            )

    def record_success(self) -> None:
        with self._lock:
            self._state.failures = 0
            self._state.opened_at = None
            self._state.half_open_probe_in_flight = False

    def record_failure(self, exc: Exception) -> None:
        with self._lock:
            if self._state.half_open_probe_in_flight:
                self._state.failures = self.failure_threshold
                self._state.opened_at = time.monotonic()
                self._state.half_open_probe_in_flight = False
                logger.error("Circuit reopened for %s after failed half-open probe. Last error: %s", self.name, exc)
                return
            self._state.failures += 1
            if self._state.failures >= self.failure_threshold:
                self._state.opened_at = time.monotonic()
                self._state.half_open_probe_in_flight = False
                logger.error("Circuit opened for %s after %d failures. Last error: %s", self.name, self._state.failures, exc)


_CIRCUITS: dict[str, CircuitBreaker] = {}
_CIRCUITS_LOCK = threading.Lock()
_TIMEOUT_EXECUTOR: concurrent.futures.ThreadPoolExecutor | None = None
_TIMEOUT_EXECUTOR_LOCK = threading.Lock()
_TIMEOUT_MAX_WORKERS = min(32, (os.cpu_count() or 1) + 4)


def get_circuit(name: str, failure_threshold: int = 5, recovery_seconds: int = 60) -> CircuitBreaker:
    with _CIRCUITS_LOCK:
        if name not in _CIRCUITS:
            _CIRCUITS[name] = CircuitBreaker(name, failure_threshold, recovery_seconds)
        return _CIRCUITS[name]


def _get_timeout_executor() -> concurrent.futures.ThreadPoolExecutor:
    global _TIMEOUT_EXECUTOR
    with _TIMEOUT_EXECUTOR_LOCK:
        if _TIMEOUT_EXECUTOR is None:
            _TIMEOUT_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
                max_workers=_TIMEOUT_MAX_WORKERS,
                thread_name_prefix="resilience-timeout",
            )
        return _TIMEOUT_EXECUTOR


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
    future = _get_timeout_executor().submit(func)
    try:
        return future.result(timeout=timeout_seconds)
    except concurrent.futures.TimeoutError as exc:
        future.cancel()
        raise TimeoutError(f"{service_name} timed out after {timeout_seconds}s") from exc


class NamedSemaphorePool:
    """Thread-safe named semaphore registry for provider concurrency limits."""

    def __init__(self) -> None:
        self._items: dict[str, tuple[int, threading.BoundedSemaphore]] = {}
        self._lock = threading.Lock()

    def acquire(self, name: str, limit: int):
        pool = self

        class _Lease:
            def __enter__(self):
                self._semaphore = pool._get(name, max(1, int(limit)))
                self._semaphore.acquire()
                return self

            def __exit__(self, exc_type, exc, tb):
                self._semaphore.release()
                return False

        return _Lease()

    def _get(self, name: str, limit: int) -> threading.BoundedSemaphore:
        with self._lock:
            current = self._items.get(name)
            if current is None or current[0] != limit:
                current = (limit, threading.BoundedSemaphore(limit))
                self._items[name] = current
            return current[1]


_SEMAPHORES = NamedSemaphorePool()


def limit_concurrency(name: str, limit: int):
    return _SEMAPHORES.acquire(name, limit)


def get_circuit_states() -> dict[str, dict[str, float | int | bool | None]]:
    """Return safe circuit-breaker status for /api/status."""
    now = time.monotonic()
    with _CIRCUITS_LOCK:
        circuits = list(_CIRCUITS.items())
    states: dict[str, dict[str, float | int | bool | None]] = {}
    for name, circuit in circuits:
        with circuit._lock:
            opened_at = circuit._state.opened_at
            retry_after = None
            if opened_at is not None:
                retry_after = max(0.0, circuit.recovery_seconds - (now - opened_at))
            states[name] = {
                "open": opened_at is not None,
                "half_open": circuit._state.half_open_probe_in_flight,
                "failures": circuit._state.failures,
                "retry_after_seconds": retry_after,
                "failure_threshold": circuit.failure_threshold,
                "recovery_seconds": circuit.recovery_seconds,
            }
    return states


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
