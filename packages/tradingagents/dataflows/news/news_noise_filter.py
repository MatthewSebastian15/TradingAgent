"""Route news into UI/prompt buckets based on relevance category."""

from __future__ import annotations

from typing import Any


def route_news_bucket(article: dict[str, Any]) -> str:
    category = article.get("relevance_category") or article.get("category")
    score = float(article.get("relevance_score") or 0)
    if category in {"company_specific", "subsidiary_related"}:
        return "full_news"
    if category == "sector_related" and score >= 55:
        return "full_news"
    if category == "macro_related" and score >= 65:
        return "macro_context"
    if category == "market_noise":
        return "hidden_debug"
    return "discard"
