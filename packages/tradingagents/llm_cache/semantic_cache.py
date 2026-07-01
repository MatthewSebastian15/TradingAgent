from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

_EMBED_DIMS = 256
_TOKEN_RE = re.compile(r"[a-z0-9]+")


def embed_text(text: str, dims: int = _EMBED_DIMS) -> list[float]:
    """Deterministic local embedding via signed feature hashing (no API, no deps).

    ponytail: bag-of-tokens hashing, not a learned embedding. Good enough to match
    near-duplicate prompts sharing a data snapshot; swap for a real embedding model
    only if telemetry shows the hashed vector misses meaningful near-hits.
    """
    vec = [0.0] * dims
    for token in _TOKEN_RE.findall((text or "").lower()):
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        h = int.from_bytes(digest, "big")
        vec[h % dims] += 1.0 if (h >> 8) & 1 else -1.0
    norm = math.sqrt(sum(v * v for v in vec))
    return [v / norm for v in vec] if norm else vec


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def semantic_guard_for_agent(
    *,
    ticker: str,
    trade_date: str,
    time_horizon_months: int,
    agent_name: str,
    schema_name: str,
    provider: str,
    model: str,
    data_hash: str,
) -> dict[str, Any]:
    return {
        "ticker": ticker,
        "trade_date": trade_date,
        "time_horizon_months": time_horizon_months,
        "agent_name": agent_name,
        "schema_name": schema_name,
        "provider": provider,
        "model": model,
        "data_hash": data_hash,
    }


def semantic_guard_for_news_summary(
    *,
    normalized_url: str,
    title_hash: str,
    published_at: str | None,
    source: str | None,
) -> dict[str, Any]:
    return {
        "normalized_url": normalized_url,
        "title_hash": title_hash,
        "published_at": published_at,
        "source": source,
    }


def semantic_guard_for_company_profile(
    *,
    ticker: str,
    profile_source: str | None,
    profile_hash: str,
) -> dict[str, Any]:
    return {
        "ticker": ticker,
        "profile_source": profile_source,
        "profile_hash": profile_hash,
    }


class SemanticCache:
    def __init__(self, db_path: str, ttl_seconds: int, max_entries: int, threshold: float) -> None:
        self.db_path = Path(db_path)
        self.ttl_seconds = max(1, int(ttl_seconds))
        self.max_entries = max(1, int(max_entries))
        self.threshold = max(0.0, min(1.0, float(threshold)))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._ensure_schema()

    def find(
        self,
        *,
        namespace: str,
        guard: dict[str, Any],
        embedding: list[float],
    ) -> dict[str, Any] | None:
        now = time.time()
        guard_json = _dumps(guard)
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, embedding, value
                FROM llm_semantic_cache
                WHERE namespace = ? AND guard_json = ? AND expires_at > ?
                ORDER BY last_accessed_at DESC
                LIMIT 100
                """,
                (namespace, guard_json, now),
            ).fetchall()

            best_id = None
            best_value = None
            best_score = 0.0
            for row_id, embedding_json, value_json in rows:
                old_embedding = json.loads(embedding_json)
                score = cosine_similarity(embedding, old_embedding)
                if score > best_score:
                    best_score = score
                    best_id = row_id
                    best_value = json.loads(value_json)

            if best_id is not None and best_score >= self.threshold:
                conn.execute(
                    "UPDATE llm_semantic_cache SET last_accessed_at = ? WHERE id = ?",
                    (now, best_id),
                )
                return {"value": best_value, "similarity": best_score}

        return None

    def set(
        self,
        *,
        namespace: str,
        guard: dict[str, Any],
        embedding: list[float],
        value: dict[str, Any],
    ) -> None:
        now = time.time()
        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                INSERT INTO llm_semantic_cache
                (namespace, guard_json, embedding, value, expires_at, last_accessed_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    namespace,
                    _dumps(guard),
                    json.dumps(embedding, separators=(",", ":")),
                    json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str),
                    now + self.ttl_seconds,
                    now,
                ),
            )
            self._evict(conn)

    def stats(self) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM llm_semantic_cache WHERE expires_at > ?",
                (time.time(),),
            ).fetchone()[0]
        return {
            "enabled": True,
            "backend": "sqlite",
            "path": str(self.db_path),
            "entries": int(count),
            "ttl_seconds": self.ttl_seconds,
            "max_entries": self.max_entries,
            "threshold": self.threshold,
        }

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.execute("PRAGMA busy_timeout = 30000")
        return conn

    def _ensure_schema(self) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS llm_semantic_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    namespace TEXT NOT NULL,
                    guard_json TEXT NOT NULL,
                    embedding TEXT NOT NULL,
                    value TEXT NOT NULL,
                    expires_at REAL NOT NULL,
                    last_accessed_at REAL NOT NULL
                )
                """
            )
            conn.execute(
                (
                    "CREATE INDEX IF NOT EXISTS idx_semantic_guard ON llm_semantic_cache "
                    + "(namespace, guard_json)"
                )
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_semantic_expires ON llm_semantic_cache (expires_at)"
            )

    def _evict(self, conn: sqlite3.Connection) -> None:
        now = time.time()
        conn.execute("DELETE FROM llm_semantic_cache WHERE expires_at <= ?", (now,))
        rows = conn.execute(
            "SELECT id FROM llm_semantic_cache ORDER BY last_accessed_at DESC LIMIT -1 OFFSET ?",
            (self.max_entries,),
        ).fetchall()
        if rows:
            conn.executemany("DELETE FROM llm_semantic_cache WHERE id = ?", rows)


def _dumps(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)


_CACHE_INSTANCE: SemanticCache | None = None
_CACHE_LOCK = threading.Lock()


def get_semantic_cache(config: dict[str, Any]) -> SemanticCache | None:
    global _CACHE_INSTANCE
    if not bool(config.get("llm_semantic_cache_enabled", False)):
        return None

    db_path = str(config.get("llm_semantic_cache_db_path") or ".cache/llm_semantic_cache.sqlite3")
    ttl_seconds = int(config.get("llm_semantic_cache_ttl_seconds") or 3600)
    max_entries = int(config.get("llm_semantic_cache_max_entries") or 2048)
    threshold = float(config.get("llm_semantic_cache_similarity_threshold") or 0.97)

    with _CACHE_LOCK:
        if (
            _CACHE_INSTANCE is None
            or str(_CACHE_INSTANCE.db_path) != db_path
            or _CACHE_INSTANCE.ttl_seconds != ttl_seconds
            or _CACHE_INSTANCE.max_entries != max_entries
            or _CACHE_INSTANCE.threshold != threshold
        ):
            _CACHE_INSTANCE = SemanticCache(db_path, ttl_seconds, max_entries, threshold)
        return _CACHE_INSTANCE
