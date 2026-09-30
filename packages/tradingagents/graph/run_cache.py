from __future__ import annotations

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
