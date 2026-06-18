from __future__ import annotations

import copy
import json
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_WRITE_LOCKS: dict[Path, threading.RLock] = {}
_WRITE_LOCKS_GUARD = threading.Lock()


@dataclass(frozen=True)
class GeneralNewsCacheEntry:
    payload: dict[str, Any]
    created_at: float
    expires_at: float

    @property
    def age_seconds(self) -> int:
        return max(0, int(time.time() - self.created_at))

    @property
    def stale(self) -> bool:
        return self.expires_at <= time.time()


class GeneralNewsCache:
    def __init__(self, *, db_path: str, ttl_seconds: int, max_entries: int) -> None:
        self.db_path = Path(db_path)
        self.ttl_seconds = max(1, int(ttl_seconds))
        self.max_entries = max(1, int(max_entries))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = _write_lock_for_path(self.db_path)
        self._ensure_schema()

    def get(self, key: Any, *, allow_stale: bool = False) -> GeneralNewsCacheEntry | None:
        key_text = _cache_key(key)
        now = time.time()
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT created_at, expires_at, payload_json FROM general_news_cache WHERE key = ?",
                (key_text,),
            ).fetchone()
            if row is None:
                return None

            created_at, expires_at, payload_json = row
            if expires_at <= now and not allow_stale:
                return None

            try:
                payload = json.loads(payload_json)
            except (TypeError, ValueError):
                conn.execute("DELETE FROM general_news_cache WHERE key = ?", (key_text,))
                return None

            conn.execute("UPDATE general_news_cache SET last_accessed_at = ? WHERE key = ?", (now, key_text))
            return GeneralNewsCacheEntry(
                payload=copy.deepcopy(payload),
                created_at=float(created_at),
                expires_at=float(expires_at),
            )

    def set(self, key: Any, payload: dict[str, Any]) -> None:
        key_text = _cache_key(key)
        now = time.time()
        expires_at = now + self.ttl_seconds
        payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)
        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                INSERT OR REPLACE INTO general_news_cache (key, created_at, expires_at, last_accessed_at, payload_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (key_text, now, expires_at, now, payload_json),
            )
            self._evict(conn, now)

    def latest(self) -> GeneralNewsCacheEntry | None:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                """
                SELECT created_at, expires_at, payload_json
                FROM general_news_cache
                ORDER BY created_at DESC
                LIMIT 1
                """
            ).fetchone()
            if row is None:
                return None
            try:
                payload = json.loads(row[2])
            except (TypeError, ValueError):
                return None
            return GeneralNewsCacheEntry(payload=payload, created_at=float(row[0]), expires_at=float(row[1]))

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.execute("PRAGMA busy_timeout = 30000")
        return conn

    def _ensure_schema(self) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS general_news_cache (
                    key TEXT PRIMARY KEY,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL,
                    last_accessed_at REAL NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_general_news_cache_created_at ON general_news_cache (created_at)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_general_news_cache_last_accessed_at ON general_news_cache (last_accessed_at)"
            )

    def _evict(self, conn: sqlite3.Connection, now: float) -> None:
        stale_cutoff = now - (self.ttl_seconds * 24)
        conn.execute("DELETE FROM general_news_cache WHERE expires_at < ?", (stale_cutoff,))
        rows = conn.execute(
            "SELECT key FROM general_news_cache ORDER BY last_accessed_at DESC LIMIT -1 OFFSET ?",
            (self.max_entries,),
        ).fetchall()
        if rows:
            conn.executemany("DELETE FROM general_news_cache WHERE key = ?", rows)


def _write_lock_for_path(path: Path) -> threading.RLock:
    resolved = path.resolve(strict=False)
    with _WRITE_LOCKS_GUARD:
        lock = _WRITE_LOCKS.get(resolved)
        if lock is None:
            lock = threading.RLock()
            _WRITE_LOCKS[resolved] = lock
        return lock


def _cache_key(key: Any) -> str:
    return json.dumps(key, sort_keys=True, separators=(",", ":"), default=str)
