from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlsplit, urlunsplit

_WRITE_LOCKS: dict[Path, threading.RLock] = {}
_WRITE_LOCKS_GUARD = threading.Lock()
_SPACE_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class ArticleQueryResult:
    articles: list[dict[str, Any]]
    total_available: int
    last_updated: str | None
    age_seconds: int | None


def normalize_title(title: str) -> str:
    return _SPACE_RE.sub(" ", str(title or "").lower()).strip()


def canonicalize_url(url: str | None) -> str | None:
    text = str(url or "").strip()
    if not text:
        return None
    try:
        parts = urlsplit(text)
    except ValueError:
        return text
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, parts.query, ""))


def build_content_hash(title: str, url: str | None = None) -> str:
    raw = f"{normalize_title(title)}|{canonicalize_url(url) or ''}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class NewsArticleStore:
    def __init__(
        self,
        *,
        db_path: str,
        max_articles: int = 2000,
        retention_days: int = 30,
    ) -> None:
        self.db_path = Path(db_path)
        self.max_articles = max(1, int(max_articles))
        self.retention_days = max(1, int(retention_days))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = _write_lock_for_path(self.db_path)
        self._ensure_schema()

    def upsert_many(self, articles: Iterable[dict[str, Any]]) -> int:
        now_text = _utc_now_text()
        rows = []
        for article in articles:
            row = self._row_from_article(article, now_text=now_text)
            if row is not None:
                rows.append(row)

        if not rows:
            return 0

        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.executemany(
                """
                INSERT INTO news_articles (
                    id, title, description, url, canonical_url, source, source_domain,
                    provider, category, published_at, tickers_json, sentiment, impact,
                    content_hash, article_json, created_at, updated_at
                )
                VALUES (
                    :id, :title, :description, :url, :canonical_url, :source, :source_domain,
                    :provider, :category, :published_at, :tickers_json, :sentiment, :impact,
                    :content_hash, :article_json, :created_at, :updated_at
                )
                ON CONFLICT(content_hash) DO UPDATE SET
                    title = excluded.title,
                    description = excluded.description,
                    url = excluded.url,
                    canonical_url = excluded.canonical_url,
                    source = excluded.source,
                    source_domain = excluded.source_domain,
                    provider = excluded.provider,
                    category = excluded.category,
                    published_at = COALESCE(excluded.published_at, news_articles.published_at),
                    tickers_json = excluded.tickers_json,
                    sentiment = excluded.sentiment,
                    impact = excluded.impact,
                    article_json = excluded.article_json,
                    updated_at = excluded.updated_at
                """,
                rows,
            )
            self.cleanup(conn=conn, now=datetime.now(timezone.utc))
        return len(rows)

    def list_articles(
        self,
        *,
        category: str = "all",
        window_days: int = 7,
        limit: int = 100,
        provider: str | None = None,
    ) -> ArticleQueryResult:
        category = str(category or "all").strip().lower() or "all"
        provider = str(provider or "").strip().lower() or None
        cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, int(window_days)))
        cutoff_text = cutoff.isoformat().replace("+00:00", "Z")
        limit = max(1, int(limit))

        clauses = ["(published_at IS NULL OR published_at >= ?)"]
        params: list[Any] = [cutoff_text]
        if category != "all":
            clauses.append("category = ?")
            params.append(category)
        if provider:
            clauses.append("provider = ?")
            params.append(provider)

        where = " AND ".join(clauses)
        with self._lock, self._connect() as conn:
            total_row = conn.execute(
                f"SELECT COUNT(*) FROM news_articles WHERE {where}", params
            ).fetchone()
            total = int(total_row[0])
            rows = conn.execute(
                f"""
                SELECT article_json, updated_at
                FROM news_articles
                WHERE {where}
                ORDER BY COALESCE(published_at, created_at) DESC, updated_at DESC
                LIMIT ?
                """,
                [*params, limit],
            ).fetchall()
            last_updated_row = conn.execute("SELECT MAX(updated_at) FROM news_articles").fetchone()

        last_updated = (
            str(last_updated_row[0])
            if last_updated_row and last_updated_row[0]
            else None
        )
        age_seconds = _age_seconds(last_updated) if last_updated else None
        articles = []
        for row in rows:
            try:
                payload = json.loads(row[0])
            except (TypeError, ValueError):
                continue
            if isinstance(payload, dict):
                articles.append(payload)
        return ArticleQueryResult(
            articles=articles,
            total_available=total,
            last_updated=last_updated,
            age_seconds=age_seconds,
        )

    def cleanup(
        self,
        *,
        conn: sqlite3.Connection | None = None,
        now: datetime | None = None,
    ) -> None:
        close_conn = conn is None
        active_conn = conn or self._connect()
        current = now or datetime.now(timezone.utc)
        cutoff = current - timedelta(days=self.retention_days)
        cutoff_text = cutoff.isoformat().replace("+00:00", "Z")
        try:
            active_conn.execute(
                """
                DELETE FROM news_articles
                WHERE COALESCE(published_at, created_at) < ?
                """,
                (cutoff_text,),
            )
            rows = active_conn.execute(
                """
                SELECT content_hash
                FROM news_articles
                ORDER BY COALESCE(published_at, created_at) DESC, updated_at DESC
                LIMIT -1 OFFSET ?
                """,
                (self.max_articles,),
            ).fetchall()
            if rows:
                active_conn.executemany(
                    "DELETE FROM news_articles WHERE content_hash = ?",
                    [(row[0],) for row in rows],
                )
            if close_conn:
                active_conn.commit()
        finally:
            if close_conn:
                active_conn.close()

    def _row_from_article(self, article: dict[str, Any], *, now_text: str) -> dict[str, Any] | None:
        title = str(article.get("title") or "").strip()
        url = str(article.get("url") or "").strip()
        if not title or not url:
            return None

        canonical_url = str(article.get("canonical_url") or canonicalize_url(url) or url)
        content_hash = str(article.get("content_hash") or build_content_hash(title, canonical_url))
        provider = str(article.get("provider") or "rss_context").strip().lower() or "rss_context"
        category = str(article.get("category") or "all").strip().lower() or "all"
        source_domain = str(article.get("source_domain") or _domain(url) or "").strip() or None
        article_id = str(article.get("id") or f"{provider}:{content_hash[:16]}")
        published_at = _normalize_datetime_text(article.get("published_at"))
        payload = dict(article)
        payload.update(
            {
                "id": article_id,
                "title": title,
                "url": url,
                "canonical_url": canonical_url,
                "provider": provider,
                "category": category,
                "source_domain": source_domain,
                "content_hash": content_hash,
            }
        )
        if published_at:
            payload["published_at"] = published_at

        return {
            "id": article_id,
            "title": title,
            "description": str(
                article.get("description") or article.get("summary") or title
            ).strip(),
            "url": url,
            "canonical_url": canonical_url,
            "source": str(article.get("source") or "").strip() or None,
            "source_domain": source_domain,
            "provider": provider,
            "category": category,
            "published_at": published_at,
            "tickers_json": json.dumps(article.get("tickers") or [], separators=(",", ":")),
            "sentiment": str(
                article.get("sentiment") or article.get("sentiment_label") or ""
            ).strip()
            or None,
            "impact": str(article.get("impact") or "").strip() or None,
            "content_hash": content_hash,
            "article_json": json.dumps(
                payload, ensure_ascii=False, separators=(",", ":"), default=str
            ),
            "created_at": now_text,
            "updated_at": now_text,
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
                CREATE TABLE IF NOT EXISTS news_articles (
                    id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    url TEXT NOT NULL,
                    canonical_url TEXT,
                    source TEXT,
                    source_domain TEXT,
                    provider TEXT NOT NULL,
                    category TEXT NOT NULL,
                    published_at TEXT,
                    tickers_json TEXT,
                    sentiment TEXT,
                    impact TEXT,
                    content_hash TEXT PRIMARY KEY,
                    article_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_news_articles_category_published
                ON news_articles (category, published_at)
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_news_articles_provider_published
                ON news_articles (provider, published_at)
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_news_articles_updated_at
                ON news_articles (updated_at)
                """
            )


def _write_lock_for_path(path: Path) -> threading.RLock:
    resolved = path.resolve(strict=False)
    with _WRITE_LOCKS_GUARD:
        lock = _WRITE_LOCKS.get(resolved)
        if lock is None:
            lock = threading.RLock()
            _WRITE_LOCKS[resolved] = lock
        return lock


def _utc_now_text() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_datetime_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value or "").strip()
        if not text:
            return None
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return text
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _age_seconds(value: str) -> int:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return 0
    return max(0, int((datetime.now(timezone.utc) - parsed).total_seconds()))


def _domain(url: str) -> str | None:
    try:
        return urlsplit(url).netloc.lower().removeprefix("www.") or None
    except ValueError:
        return None
