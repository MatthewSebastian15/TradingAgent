from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from tradingagents.llm_cache.keys import ExactLLMCacheKey

SCHEMA_VERSION = 1


class ExactLLMCache:
    def __init__(self, db_path: str, ttl_seconds: int, max_entries: int) -> None:
        self.db_path = Path(db_path)
        self.ttl_seconds = max(1, int(ttl_seconds))
        self.max_entries = max(1, int(max_entries))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._ensure_schema()

    def get(self, key: ExactLLMCacheKey, schema: type[BaseModel]) -> BaseModel | None:
        now = time.time()
        key_json = _dumps(key.as_dict())
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT expires_at, value FROM llm_exact_cache WHERE cache_key = ?",
                (key_json,),
            ).fetchone()
            if row is None:
                return None

            expires_at, value = row
            if float(expires_at) <= now:
                conn.execute("DELETE FROM llm_exact_cache WHERE cache_key = ?", (key_json,))
                return None

            try:
                parsed = schema.model_validate(json.loads(value))
            except Exception:
                conn.execute("DELETE FROM llm_exact_cache WHERE cache_key = ?", (key_json,))
                return None

            conn.execute(
                "UPDATE llm_exact_cache SET last_accessed_at = ? WHERE cache_key = ?",
                (now, key_json),
            )
            return parsed

    def set(self, key: ExactLLMCacheKey, value: BaseModel) -> None:
        now = time.time()
        key_json = _dumps(key.as_dict())
        value_json = value.model_dump_json()
        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                INSERT OR REPLACE INTO llm_exact_cache
                (cache_key, expires_at, last_accessed_at, value)
                VALUES (?, ?, ?, ?)
                """,
                (key_json, now + self.ttl_seconds, now, value_json),
            )
            self._evict(conn)

    def stats(self) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM llm_exact_cache WHERE expires_at > ?",
                (time.time(),),
            ).fetchone()[0]
            schema_version = int(conn.execute("PRAGMA user_version").fetchone()[0])
        return {
            "enabled": True,
            "backend": "sqlite",
            "path": str(self.db_path),
            "entries": int(count),
            "ttl_seconds": self.ttl_seconds,
            "max_entries": self.max_entries,
            "schema_version": schema_version,
        }

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.execute("PRAGMA busy_timeout = 30000")
        return conn

    def _ensure_schema(self) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            version = int(conn.execute("PRAGMA user_version").fetchone()[0])
            if version > SCHEMA_VERSION:
                raise RuntimeError("llm exact cache schema is newer than supported")
            if version < 1:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS llm_exact_cache (
                        cache_key TEXT PRIMARY KEY,
                        expires_at REAL NOT NULL,
                        last_accessed_at REAL NOT NULL,
                        value TEXT NOT NULL
                    )
                    """
                )
                conn.execute(
                    (
                        "CREATE INDEX IF NOT EXISTS idx_llm_exact_expires ON llm_exact_cache "
                        + "(expires_at)"
                    )
                )
                conn.execute(
                    (
                        "CREATE INDEX IF NOT EXISTS idx_llm_exact_last_accessed ON "
                        + "llm_exact_cache (last_accessed_at)"
                    )
                )
                conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

    def _evict(self, conn: sqlite3.Connection) -> None:
        now = time.time()
        conn.execute("DELETE FROM llm_exact_cache WHERE expires_at <= ?", (now,))
        rows = conn.execute(
            (
                "SELECT cache_key FROM llm_exact_cache ORDER BY last_accessed_at DESC LIMIT -1 "
                + "OFFSET ?"
            ),
            (self.max_entries,),
        ).fetchall()
        if rows:
            conn.executemany("DELETE FROM llm_exact_cache WHERE cache_key = ?", rows)


def _dumps(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)


_CACHE_INSTANCE: ExactLLMCache | None = None
_CACHE_LOCK = threading.Lock()


def get_exact_llm_cache(config: dict[str, Any]) -> ExactLLMCache | None:
    global _CACHE_INSTANCE
    if not bool(config.get("llm_exact_cache_enabled", False)):
        return None

    db_path = str(config.get("llm_exact_cache_db_path") or ".cache/llm_exact_cache.sqlite3")
    ttl_seconds = int(config.get("llm_exact_cache_ttl_seconds") or 1800)
    max_entries = int(config.get("llm_exact_cache_max_entries") or 1024)

    with _CACHE_LOCK:
        if (
            _CACHE_INSTANCE is None
            or str(_CACHE_INSTANCE.db_path) != db_path
            or _CACHE_INSTANCE.ttl_seconds != ttl_seconds
            or _CACHE_INSTANCE.max_entries != max_entries
        ):
            _CACHE_INSTANCE = ExactLLMCache(db_path, ttl_seconds, max_entries)
        return _CACHE_INSTANCE
