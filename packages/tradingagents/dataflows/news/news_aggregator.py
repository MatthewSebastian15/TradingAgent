from __future__ import annotations

import re
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

TRACKING_QUERY_KEYS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "cmpid",
    "mod",
    "ref",
    "fbclid",
    "gclid",
}


def normalize_url(url: str | None) -> str:
    if not url:
        return ""
    parts = urlsplit(str(url).strip())
    query = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if k.lower() not in TRACKING_QUERY_KEYS
    ]
    return urlunsplit(
        (parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), urlencode(query), "")
    )


def normalize_title(title: str | None) -> str:
    text = re.sub(r"[^a-z0-9\s]", " ", str(title or "").lower())
    return " ".join(text.split())


def similar_title(a: str | None, b: str | None, threshold: float = 0.88) -> bool:
    first = normalize_title(a)
    second = normalize_title(b)
    if not first or not second:
        return False
    if first == second:
        return True
    return SequenceMatcher(None, first, second).ratio() >= threshold


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    text = str(value or "").strip()
    if not text:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            return datetime.strptime(text[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return datetime.min.replace(tzinfo=timezone.utc)


def deduplicate_news(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    seen_similar_titles: list[str] = []
    seen_publisher_date_title: set[str] = set()
    result: list[dict[str, Any]] = []

    for item in items:
        if not isinstance(item, dict):
            continue

        title = str(item.get("title") or item.get("headline") or "")
        normalized_title = normalize_title(title)
        normalized_url = normalize_url(str(item.get("url") or ""))
        publisher = str(item.get("publisher") or item.get("source") or "").lower().strip()
        published_date = str(item.get("published_at") or item.get("datetime") or "")[:10]
        publisher_key = (
            f"{publisher}:{published_date}:{normalized_title}" if normalized_title else ""
        )

        if not normalized_title:
            continue
        if normalized_url and normalized_url in seen_urls:
            continue
        if normalized_title in seen_titles:
            continue
        if any(similar_title(normalized_title, existing) for existing in seen_similar_titles):
            continue
        if publisher_key and publisher_key in seen_publisher_date_title:
            continue

        if normalized_url:
            seen_urls.add(normalized_url)
        seen_titles.add(normalized_title)
        seen_similar_titles.append(normalized_title)
        if publisher_key:
            seen_publisher_date_title.add(publisher_key)

        enriched = dict(item)
        enriched["normalized_title"] = normalized_title
        if normalized_url:
            enriched["normalized_url"] = normalized_url
        result.append(enriched)

    return result


def rank_news(items: list[dict[str, Any]], ticker: str | None = None) -> list[dict[str, Any]]:
    ticker_text = str(ticker or "").upper()

    def score(item: dict[str, Any]) -> tuple[float, datetime]:
        title = str(item.get("title") or "")
        summary = str(item.get("summary") or "")
        related = str(item.get("related_ticker") or item.get("related") or "").upper()
        relevance = float(item.get("relevance_score") or 0)
        if ticker_text and (
            ticker_text in related or ticker_text in title.upper() or ticker_text in summary.upper()
        ):
            relevance += 1.0
        event_bonus = 0.4 if str(item.get("event_type") or "general") != "general" else 0.0
        published = _parse_dt(item.get("published_at") or item.get("datetime"))
        return (relevance + event_bonus, published)

    return sorted(items, key=score, reverse=True)


def aggregate_news(
    vendor_items: dict[str, list[dict[str, Any]]],
    ticker: str | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    # Backward-compatible limit only. Aggregated news should not be capped after collection.
    _ = limit
    merged: list[dict[str, Any]] = []
    for vendor, items in vendor_items.items():
        for item in items:
            row = dict(item)
            row.setdefault("source", vendor)
            merged.append(row)
    return rank_news(deduplicate_news(merged), ticker=ticker)
