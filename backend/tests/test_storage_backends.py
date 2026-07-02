"""Unit tests for storage_backends.py."""

from __future__ import annotations

import pytest

from storage_backends import SQLiteRuntimeStorage, build_runtime_storage


def test_build_sqlite_backend():
    storage = build_runtime_storage("sqlite")
    assert isinstance(storage, SQLiteRuntimeStorage)
    assert storage.name == "sqlite"


def test_build_unknown_backend_raises():
    with pytest.raises(ValueError, match="Unsupported runtime storage backend"):
        build_runtime_storage("redis")


def test_sqlite_path_creates_parent_dirs(tmp_path):
    target = tmp_path / "nested" / "deeper" / "store.sqlite3"
    resolved = build_runtime_storage("sqlite").sqlite_path(str(target))
    assert resolved == str(target)
    assert target.parent.is_dir()


def test_ttl_cache_round_trip_and_missing_key(tmp_path):
    cache = build_runtime_storage("sqlite").ttl_cache(
        str(tmp_path / "cache.sqlite3"), ttl_seconds=60, max_entries=10
    )
    cache.set("key", {"value": 42})
    assert cache.get("key") == {"value": 42}
    assert cache.get("absent") is None
