"""Dictionary-based news deduplication helper."""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any
from urllib.parse import urlparse


def normalize_title(title: str) -> str:
    title = str(title or "").lower().strip()
    title = re.sub(r"[^a-z0-9\s]", " ", title)
    return re.sub(r"\s+", " ", title).strip()


def normalize_url(url: str) -> str:
    parsed = urlparse(str(url or ""))
    return f"{parsed.netloc}{parsed.path}".lower().rstrip("/")


def _published_day(article: dict[str, Any]) -> str:
    return str(article.get("published_at") or article.get("published_date") or article.get("date") or "")[:10]


def _topic(article: dict[str, Any]) -> str:
    return str(article.get("event_type") or article.get("topic") or article.get("bucket") or "general").lower()


def _similar(a: str, b: str, threshold: float = 0.88) -> bool:
    return bool(a and b and SequenceMatcher(None, a, b).ratio() >= threshold)


def dedup_news_articles_with_metadata(articles: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    seen_urls: set[str] = set()
    seen_title_day_topic: list[tuple[str, str, str]] = []
    result: list[dict[str, Any]] = []
    removed = 0
    for article in articles or []:
        if not isinstance(article, dict):
            removed += 1
            continue
        title_key = normalize_title(article.get("title", ""))
        url_key = normalize_url(article.get("url", ""))
        day = _published_day(article)
        topic = _topic(article)
        if url_key and url_key in seen_urls:
            removed += 1
            continue
        duplicate_title = False
        for old_title, old_day, old_topic in seen_title_day_topic:
            if _similar(title_key, old_title) and (not day or not old_day or day == old_day) and topic == old_topic:
                duplicate_title = True
                break
        if duplicate_title:
            removed += 1
            continue
        if url_key:
            seen_urls.add(url_key)
        if title_key:
            seen_title_day_topic.append((title_key, day, topic))
        result.append(article)
    return result, {"dedup_removed_count": removed, "dedup_input_count": len(articles or []), "dedup_output_count": len(result)}


def dedup_news_articles(articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return dedup_news_articles_with_metadata(articles)[0]
