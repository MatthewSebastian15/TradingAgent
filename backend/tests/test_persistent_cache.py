from __future__ import annotations

import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor

from persistent_cache import SQLiteTTLCache


def test_sqlite_ttl_cache_round_trips_json_values(tmp_path):
    cache = SQLiteTTLCache(str(tmp_path / "market_data.sqlite3"), ttl_seconds=60, max_entries=10)

    cache.set("message", "cached text")
    cache.set("answer", 42)

    assert cache.get("message") == "cached text"
    assert cache.get("answer") == 42


def test_sqlite_ttl_cache_ignores_non_json_legacy_values(tmp_path):
    cache = SQLiteTTLCache(str(tmp_path / "market_data.sqlite3"), ttl_seconds=60, max_entries=10)
    key = {"method": "legacy"}
    key_hash = cache._hash_key(key)

    with sqlite3.connect(cache.db_path) as conn:
        conn.execute(
            """
            INSERT INTO cache (key, expires_at, last_accessed_at, value)
            VALUES (?, ?, ?, ?)
            """,
            (key_hash, time.time() + 60, time.time(), sqlite3.Binary(b"\x80not-json")),
        )

    assert cache.get(key) is None

    with sqlite3.connect(cache.db_path) as conn:
        row = conn.execute("SELECT key FROM cache WHERE key = ?", (key_hash,)).fetchone()

    assert row is None


def test_sqlite_ttl_cache_serializes_concurrent_writes(tmp_path):
    cache = SQLiteTTLCache(str(tmp_path / "market_data.sqlite3"), ttl_seconds=60, max_entries=200)

    def write_value(index: int) -> None:
        cache.set({"key": index}, {"value": index})

    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(write_value, range(100)))

    assert cache.stats()["entries"] == 100
    assert cache.get({"key": 42}) == {"value": 42}
