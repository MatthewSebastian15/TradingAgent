"""Tiny SQLite-backed cache for external market data calls."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from pathlib import Path
from typing import Any


class SQLiteTTLCache:
    """Persistent TTL cache for JSON-serializable values.

    This is intentionally small and dependency-free. It is not Redis, because
    this project is personal-scale and apparently not every nail needs a cloud
    invoice attached to it.
    """

    def __init__(self, db_path: str, ttl_seconds: int, max_entries: int) -> None:
        self.db_path = Path(db_path)
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def get(self, key: Any) -> Any | None:
        key_hash = self._hash_key(key)
        now = time.time()
        with self._connect() as conn:
            row = conn.execute("SELECT expires_at, value FROM cache WHERE key = ?", (key_hash,)).fetchone()
            if row is None:
                return None
            expires_at, serialized_value = row
            if expires_at <= now:
                conn.execute("DELETE FROM cache WHERE key = ?", (key_hash,))
                return None
            try:
                value = self._loads(serialized_value)
            except (TypeError, ValueError):
                conn.execute("DELETE FROM cache WHERE key = ?", (key_hash,))
                return None
            conn.execute("UPDATE cache SET last_accessed_at = ? WHERE key = ?", (now, key_hash))
            return value

    def set(self, key: Any, value: Any) -> None:
        key_hash = self._hash_key(key)
        now = time.time()
        expires_at = now + self.ttl_seconds
        serialized_value = self._dumps(value)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO cache (key, expires_at, last_accessed_at, value)
                VALUES (?, ?, ?, ?)
                """,
                (key_hash, expires_at, now, serialized_value),
            )
            self._evict(conn)

    def stats(self) -> dict[str, int | str]:
        with self._connect() as conn:
            count = conn.execute("SELECT COUNT(*) FROM cache WHERE expires_at > ?", (time.time(),)).fetchone()[0]
        return {
            "backend": "sqlite",
            "path": str(self.db_path),
            "entries": int(count),
            "ttl_seconds": int(self.ttl_seconds),
            "max_entries": int(self.max_entries),
        }

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path, timeout=5)

    def _ensure_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS cache (
                    key TEXT PRIMARY KEY,
                    expires_at REAL NOT NULL,
                    last_accessed_at REAL NOT NULL,
                    value BLOB NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache (expires_at)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_cache_last_accessed_at ON cache (last_accessed_at)")

    def _evict(self, conn: sqlite3.Connection) -> None:
        now = time.time()
        conn.execute("DELETE FROM cache WHERE expires_at <= ?", (now,))
        rows = conn.execute("SELECT key FROM cache ORDER BY last_accessed_at DESC LIMIT -1 OFFSET ?", (self.max_entries,)).fetchall()
        if rows:
            conn.executemany("DELETE FROM cache WHERE key = ?", rows)

    @staticmethod
    def _hash_key(key: Any) -> str:
        raw = json.dumps(key, sort_keys=True, default=str).encode("utf-8")
        return hashlib.sha256(raw).hexdigest()

    @staticmethod
    def _dumps(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    @staticmethod
    def _loads(value: Any) -> Any:
        if isinstance(value, memoryview):
            value = value.tobytes()
        return json.loads(value)
