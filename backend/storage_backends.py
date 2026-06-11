"""Runtime storage abstractions for cache and analysis persistence."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from persistent_cache import SQLiteTTLCache


class TTLCacheBackend(Protocol):
    def get(self, key): ...

    def set(self, key, value) -> None: ...

    def delete(self, key) -> None: ...

    def stats(self) -> dict[str, int | str]: ...


class RuntimeStorageBackend(Protocol):
    name: str

    def ttl_cache(self, path: str, *, ttl_seconds: int, max_entries: int) -> TTLCacheBackend: ...

    def sqlite_path(self, path: str) -> str: ...


@dataclass(frozen=True)
class SQLiteRuntimeStorage:
    """Local/shared-volume SQLite storage for development and single-host deploys."""

    name: str = "sqlite"

    def ttl_cache(self, path: str, *, ttl_seconds: int, max_entries: int) -> SQLiteTTLCache:
        return SQLiteTTLCache(path, ttl_seconds=ttl_seconds, max_entries=max_entries)

    def sqlite_path(self, path: str) -> str:
        resolved = Path(path).expanduser()
        resolved.parent.mkdir(parents=True, exist_ok=True)
        return str(resolved)


def build_runtime_storage(backend: str) -> RuntimeStorageBackend:
    if backend == "sqlite":
        return SQLiteRuntimeStorage()
    raise ValueError(f"Unsupported runtime storage backend: {backend}")
