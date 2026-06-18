from __future__ import annotations

from .news_aggregator import normalize_title, normalize_url, similar_title
from .news_models import NormalizedNewsArticle
from .news_scoring import content_hash


def deduplicate_news_articles(items: list[NormalizedNewsArticle]) -> list[NormalizedNewsArticle]:
    ranked = sorted(items, key=_dedupe_preference, reverse=True)
    seen_hashes: set[str] = set()
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    seen_source_titles: set[str] = set()
    seen_similar_titles: list[str] = []
    result: list[NormalizedNewsArticle] = []

    for article in ranked:
        normalized_url = normalize_url(article.url)
        normalized_title = normalize_title(article.title)
        source_title = (
            f"{str(article.source or '').strip().lower()}:{normalized_title}"
            if normalized_title
            else ""
        )
        article.content_hash = article.content_hash or content_hash(article.title, normalized_url)

        if article.content_hash in seen_hashes:
            continue
        if normalized_url and normalized_url in seen_urls:
            continue
        if normalized_title and normalized_title in seen_titles:
            continue
        if source_title and source_title in seen_source_titles:
            continue
        if normalized_title and any(
            similar_title(normalized_title, title) for title in seen_similar_titles
        ):
            continue

        seen_hashes.add(article.content_hash)
        if normalized_url:
            seen_urls.add(normalized_url)
        if normalized_title:
            seen_titles.add(normalized_title)
            seen_similar_titles.append(normalized_title)
        if source_title:
            seen_source_titles.add(source_title)
        result.append(article)
    return result


def _dedupe_preference(article: NormalizedNewsArticle) -> tuple[float, int, int, int, int, float]:
    tier = int(article.feed_tier or 3)
    tier_score = max(0, 5 - tier)
    has_summary = 1 if str(article.summary or "").strip() else 0
    direct_rss = 0 if _is_google_news_fallback(article) else 1
    company_match = 1 if not article.market_context_only else 0
    published = article.published_at.timestamp() if article.published_at else 0.0
    return (
        tier_score,
        has_summary,
        direct_rss,
        company_match,
        int(float(article.relevance_score or 0)),
        published,
    )


def _is_google_news_fallback(article: NormalizedNewsArticle) -> bool:
    feed_id = str(article.feed_id or article.query_strategy or "").lower()
    source = str(article.source or "").lower()
    return "google-news" in feed_id or source == "google news"
