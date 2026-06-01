from __future__ import annotations

from .news_aggregator import normalize_title, normalize_url, similar_title
from .news_models import NormalizedNewsArticle
from .news_scoring import content_hash


def deduplicate_news_articles(items: list[NormalizedNewsArticle]) -> list[NormalizedNewsArticle]:
    ranked = sorted(
        items,
        key=lambda item: (item.relevance_score, item.published_at.timestamp() if item.published_at else 0),
        reverse=True,
    )
    seen_hashes: set[str] = set()
    seen_urls: set[str] = set()
    seen_titles: list[str] = []
    result: list[NormalizedNewsArticle] = []

    for article in ranked:
        normalized_url = normalize_url(article.url)
        normalized_title = normalize_title(article.title)
        article.content_hash = article.content_hash or content_hash(article.title, normalized_url)
        if article.content_hash in seen_hashes:
            continue
        if normalized_url and normalized_url in seen_urls:
            continue
        if normalized_title and any(similar_title(normalized_title, title) for title in seen_titles):
            continue
        seen_hashes.add(article.content_hash)
        if normalized_url:
            seen_urls.add(normalized_url)
        if normalized_title:
            seen_titles.append(normalized_title)
        result.append(article)
    return result
