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


def _similar(a: str, b: str, threshold: float = 0.88) -> bool:
    return bool(a and b and SequenceMatcher(None, a, b).ratio() >= threshold)


def dedup_news_articles(articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen_urls: set[str] = set()
    seen_titles: list[str] = []
    result: list[dict[str, Any]] = []
    for article in articles or []:
        title_key = normalize_title(article.get("title", ""))
        url_key = normalize_url(article.get("url", ""))
        if url_key and url_key in seen_urls:
            continue
        if title_key and any(_similar(title_key, old) for old in seen_titles):
            continue
        if url_key:
            seen_urls.add(url_key)
        if title_key:
            seen_titles.append(title_key)
        result.append(article)
    return result
