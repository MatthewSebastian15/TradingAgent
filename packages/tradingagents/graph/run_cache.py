from __future__ import annotations

import copy
import time
from threading import Lock
from typing import Any


class RunCache:
    def __init__(self, job_id: str):
        self.job_id = job_id
        self._store: dict[str, Any] = {}
        self._lock = Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            return self._store.get(key)

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._store[key] = value

    def has(self, key: str) -> bool:
        with self._lock:
            return key in self._store

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def build_key(self, data_type: str, symbol: str, *extras: str) -> str:
        parts = [f"run:{self.job_id}", data_type, symbol, *extras]
        return ":".join(str(p) for p in parts if p)

    def __deepcopy__(self, memo: dict) -> "RunCache":
        memo[id(self)] = self
        return self


class ShortLivedTickerCache:
    def __init__(self, ttl_seconds: int = 300):
        self.ttl_seconds = max(1, int(ttl_seconds))
        self._store: dict[tuple[str, str], tuple[float, Any]] = {}
        self._lock = Lock()

    def get(self, ticker: str, trade_date: str) -> Any | None:
        key = self.build_key(ticker, trade_date)
        now = time.monotonic()
        with self._lock:
            item = self._store.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= now:
                self._store.pop(key, None)
                return None
            return copy.deepcopy(value)

    def set(self, ticker: str, trade_date: str, value: Any) -> None:
        key = self.build_key(ticker, trade_date)
        expires_at = time.monotonic() + self.ttl_seconds
        with self._lock:
            self._store[key] = (expires_at, copy.deepcopy(value))

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    @staticmethod
    def build_key(ticker: str, trade_date: str) -> tuple[str, str]:
        return (str(ticker or "").strip().upper(), str(trade_date or "").strip())


SHORT_LIVED_TICKER_CACHE = ShortLivedTickerCache()
