from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from tradingagents.dataflows.news_relevance import is_relevant_news

NEWS_CONTEXT_SOURCES = ("yfinance", "google_news_light", "newsdata", "marketaux")
SOURCE_PRIORITY = {"yfinance": 4, "google_news_light": 3, "marketaux": 2, "newsdata": 1}


def build_news_context(
    symbol: str,
    market: str,
    news_result: dict,
    max_articles: int = 8,
) -> dict:
    """
    Build compact news context from existing news service output.
    No LLM per article. No heavy dedup pipeline.
    """
    result = dict(news_result or {})
    limit = max(1, min(int(max_articles or 8), 10))
    articles = _candidate_articles(result)
    company_name = result.get("company_name")
    aliases = result.get("aliases")
    relevant = [
        article
        for article in (_normalize_article(item) for item in articles)
        if article
        and (
            article.get("market_context_only")
            or is_relevant_news(article, symbol, str(company_name) if company_name else None, aliases)
        )
    ]
    ranked = sorted(relevant, key=lambda article: _rank_score(article, symbol), reverse=True)
    top_articles = [_compact_article(article) for article in ranked[:limit]]
    vendor_summary = _vendor_summary(result, articles)
    limitations = _limitations(result, top_articles)
    status = _status(result, top_articles)
    return {
        "news_context": {
            "status": status,
            "articles_fetched": int(result.get("articles_found") or len(articles) or 0),
            "used_in_prompt_count": len(top_articles),
            "top_articles": top_articles,
            "limitations": limitations,
            "vendor_summary": vendor_summary,
            "market": market,
        }
    }


def _candidate_articles(result: dict[str, Any]) -> list[Any]:
    prompt_articles = result.get("prompt_articles")
    articles = result.get("articles")
    if isinstance(prompt_articles, list) and prompt_articles:
        return [*prompt_articles, *([item for item in articles if item not in prompt_articles] if isinstance(articles, list) else [])]
    return articles if isinstance(articles, list) else []


def _normalize_article(item: Any) -> dict[str, Any]:
    if not isinstance(item, dict):
        return {}
    source = item.get("source") or item.get("publisher") or item.get("provider")
    provider = item.get("provider") or item.get("source")
    return {
        "title": item.get("title"),
        "source": source,
        "provider": provider,
        "published_at": item.get("published_at") or item.get("pub_date") or item.get("published_date"),
        "summary": item.get("summary") or item.get("description"),
        "url": item.get("url") or item.get("link"),
        "relevance_score": item.get("relevance_score"),
        "sentiment_label": item.get("sentiment_label"),
        "market_context_only": bool(item.get("market_context_only", False)),
        "entities": item.get("entities") or item.get("symbols") or item.get("tickers") or [],
    }


def _compact_article(article: dict[str, Any]) -> dict[str, Any]:
    return {
        key: article.get(key)
        for key in ("title", "source", "provider", "published_at", "summary", "url", "relevance_score", "sentiment_label")
        if article.get(key) not in (None, "", [])
    }


def _rank_score(article: dict[str, Any], symbol: str) -> float:
    provider = str(article.get("provider") or article.get("source") or "").lower()
    title = str(article.get("title") or "").lower()
    score = float(article.get("relevance_score") or 0)
    score += SOURCE_PRIORITY.get(provider, 0) * 5
    score += _recency_score(article.get("published_at"))
    base_symbol = str(symbol or "").split(".", 1)[0].lower()
    if base_symbol and base_symbol in title:
        score += 15
    return score


def _recency_score(value: Any) -> float:
    parsed = _parse_date(value)
    if parsed is None:
        return 0
    now = datetime.now(timezone.utc)
    days = max(0.0, (now - parsed).total_seconds() / 86400)
    return max(0.0, 20.0 - min(days, 20.0))


def _parse_date(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        try:
            parsed = datetime.strptime(text[:10], "%Y-%m-%d")
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _vendor_summary(result: dict[str, Any], articles: list[Any]) -> dict[str, dict[str, Any]]:
    statuses = result.get("provider_status") if isinstance(result.get("provider_status"), dict) else {}
    summary: dict[str, dict[str, Any]] = {}
    for source in NEWS_CONTEXT_SOURCES:
        count = 0
        for item in articles:
            if not isinstance(item, dict):
                continue
            provider = str(item.get("provider") or item.get("source") or "").lower()
            if provider == source:
                count += 1
        summary[source] = {"articles": count, "status": statuses.get(source, "empty" if count == 0 else "success")}
    return summary


def _limitations(result: dict[str, Any], top_articles: list[dict[str, Any]]) -> list[str]:
    limitations = [
        "News coverage is from available vendors only",
        "No official exchange filing source configured",
    ]
    if not top_articles:
        limitations.append(str(result.get("empty_reason") or "News data is unavailable."))
    return list(dict.fromkeys(limitations))


def _status(result: dict[str, Any], top_articles: list[dict[str, Any]]) -> str:
    if not top_articles:
        return "empty"
    fetched = int(result.get("articles_found") or len(top_articles) or 0)
    return "success" if fetched == len(top_articles) else "partial_success"
