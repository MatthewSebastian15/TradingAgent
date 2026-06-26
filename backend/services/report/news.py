"""News/related-news row and item builders for report assembly.

Extracted from report_service.py to shrink that module's divergent-change
surface. Depends only on formatters + normalization helpers.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import urlsplit

from tradingagents.utils.normalization import as_dict as _as_dict
from tradingagents.utils.normalization import as_list as _as_list
from tradingagents.utils.normalization import clean_text as _clean_text

from services.report.formatters import _display, _row


def _news_impact_rows(result: dict[str, Any]) -> list[dict[str, str]]:
    impact = _as_dict(result.get("news_impact"))
    if not impact:
        return []
    quality = _as_dict(impact.get("data_quality"))
    rules = _as_dict(quality.get("rules"))
    return [
        _row("Overall Sentiment", impact.get("overall_sentiment")),
        _row("Sentiment Score", impact.get("sentiment_score")),
        _row(
            "High Impact Count",
            impact.get("high_impact_count") or len(impact.get("high_impact_news") or []),
        ),
        _row(
            "Full News Count",
            impact.get("full_news_count") or len(impact.get("full_news_list") or []),
        ),
        _row("News Count", impact.get("news_count")),
        _row("Deduplicated Count", impact.get("deduplicated_count")),
        _row("Duplicate Removed", impact.get("duplicate_excluded_count")),
        _row("High Impact Limited", rules.get("high_impact_limited")),
        _row("Full News Limited", rules.get("full_news_limited")),
        _row("Sources Used", ", ".join(str(item) for item in quality.get("sources_used", []))),
    ]


def _high_impact_news_items(result: dict[str, Any]) -> list[dict[str, Any]]:
    impact = _as_dict(result.get("news_impact"))
    raw_items = impact.get("high_impact_news") if impact else []
    if not isinstance(raw_items, list):
        return []
    items: list[dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict) or not item.get("title"):
            continue
        items.append(
            {
                "title": _display(item.get("title")),
                "source": _display(item.get("source")),
                "publisher": _display(item.get("publisher")),
                "published_at": _display(item.get("published_at")),
                "sentiment": _display(item.get("sentiment")),
                "impact": _display(item.get("impact")),
                "impact_score": _display(item.get("impact_score")),
                "relevance_score": _display(item.get("relevance_score")),
                "materiality_category": _display(item.get("materiality_category")),
                "source_confidence_label": _display(item.get("source_confidence_label")),
                "news_scope": _display(item.get("scope_label") or item.get("news_scope")),
                "impact_reason": _display(
                    item.get("impact_reason") or item.get("relevance_reason")
                ),
                "summary": _display(item.get("summary")),
                "url": _safe_external_http_url(item.get("url")),
                "dedupe_key": _display(item.get("dedupe_key")),
            }
        )
    return items


def _related_news_items(result: dict[str, Any]) -> list[dict[str, Any]]:
    related_news = _as_dict(result.get("related_news"))
    raw_items = related_news.get("items") if related_news else []
    if not isinstance(raw_items, list):
        return []

    items: list[dict[str, Any]] = []
    for item in _dedupe_report_news_items(raw_items):
        title = _clean_text(item.get("title"))
        if not title:
            continue

        items.append(
            {
                "title": title,
                "publisher": _display(item.get("publisher")),
                "published_at": _display(item.get("published_at")),
                "source": _display(item.get("source")),
                "event_type": _display(item.get("event_type")),
                "summary": _display(item.get("summary")),
                "relevance_reason": _display(item.get("relevance_reason")),
                "url": _safe_external_http_url(item.get("url")),
            }
        )
    return items


def _news_dedupe_key(item: dict[str, Any]) -> str:
    return _clean_text(
        item.get("dedupe_key")
        or item.get("normalized_url")
        or item.get("url")
        or item.get("normalized_title")
        or item.get("title")
    ).lower()


def _dedupe_report_news_items(items: list[Any]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    output: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        title = _clean_text(item.get("title"))
        if not title:
            continue
        key = _news_dedupe_key(item) or title.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output


def _full_news_items(result: dict[str, Any]) -> list[dict[str, Any]]:
    impact = _as_dict(result.get("news_impact"))
    related_news = _as_dict(result.get("related_news"))

    has_full_news_list = isinstance(impact.get("full_news_list"), list) if impact else False
    raw_items = (
        impact.get("full_news_list") if has_full_news_list else related_news.get("items", [])
    )
    high_items = impact.get("high_impact_news", []) if impact else []

    if not isinstance(raw_items, list):
        raw_items = []
    if not isinstance(high_items, list):
        high_items = []

    high_keys = {
        _news_dedupe_key(item)
        for item in high_items
        if isinstance(item, dict) and _news_dedupe_key(item)
    }

    items: list[dict[str, Any]] = []
    for item in _dedupe_report_news_items(raw_items):
        key = _news_dedupe_key(item)
        if key and key in high_keys:
            continue
        items.append(
            {
                "title": _display(item.get("title")),
                "publisher": _display(item.get("publisher")),
                "published_at": _display(item.get("published_at")),
                "source": _display(item.get("source")),
                "event_type": _display(item.get("event_type") or item.get("materiality_category")),
                "materiality_category": _display(item.get("materiality_category")),
                "news_scope": _display(item.get("scope_label") or item.get("news_scope")),
                "source_confidence_label": _display(item.get("source_confidence_label")),
                "impact": _display(item.get("impact")),
                "impact_score": _display(item.get("impact_score")),
                "relevance_score": _display(item.get("relevance_score")),
                "summary": _display(item.get("summary")),
                "impact_reason": _display(
                    item.get("impact_reason") or item.get("relevance_reason")
                ),
                "url": _safe_external_http_url(item.get("url")),
                "dedupe_key": _display(item.get("dedupe_key")),
            }
        )
    return items


def _safe_external_http_url(value: Any) -> str | None:
    text = _clean_text(value)
    if not text:
        return None
    try:
        parts = urlsplit(text)
        hostname = parts.hostname
        _ = parts.port
    except ValueError:
        return None
    return text if parts.scheme.lower() in {"http", "https"} and hostname else None


def _news_context(result: dict[str, Any]) -> dict[str, Any]:
    return _as_dict(result.get("news_context") or result.get("news"))


def _news_articles(result: dict[str, Any]) -> list[dict[str, Any]]:
    articles = _news_context(result).get("articles")
    if not isinstance(articles, list):
        return []
    items = []
    for article in articles:
        if not isinstance(article, dict) or not article.get("title"):
            continue
        item = dict(article)
        item["url"] = _safe_external_http_url(article.get("url"))
        items.append(item)
    return items


def _report_news_sections(result: dict[str, Any]) -> list[dict[str, Any]]:
    context = _news_context(result)
    sections: list[dict[str, Any]] = []

    decision_news = _as_list(context.get("decision_company_news"))
    market_news = _as_list(context.get("market_context_news"))
    if decision_news or market_news:
        if decision_news:
            sections.append(
                {
                    "title": "Company News Used for Decision",
                    "items": _report_news_items(decision_news),
                }
            )
        if market_news:
            sections.append(
                {
                    "title": "Market Context News",
                    "items": _report_news_items(market_news),
                }
            )
        return [section for section in sections if section["items"]]

    articles = _as_list(context.get("articles"))
    if articles:
        items = _report_news_items(articles)
        return [{"title": "News", "items": items}] if items else []

    impact = _as_dict(result.get("news_impact"))
    high_items = _as_list(impact.get("high_impact_news"))
    has_full_news_list = isinstance(impact.get("full_news_list"), list)
    full_items = _as_list(impact.get("full_news_list")) if has_full_news_list else []
    if high_items or full_items:
        items = _report_news_items([*high_items, *full_items])
        return [{"title": "News", "items": items}] if items else []

    related_items = _as_list(_as_dict(result.get("related_news")).get("items"))
    items = _report_news_items(related_items)
    return [{"title": "News", "items": items}] if items else []


def _report_news_items(raw_items: list[Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for item in _dedupe_report_news_items(raw_items):
        source = _news_source(item)
        items.append(
            {
                "title": _display(item.get("title")),
                "publisher": _display(
                    item.get("publisher") or item.get("source") or item.get("provider")
                ),
                "source": source,
                "published_label": _news_published_label(item),
                "summary": _display(
                    item.get("summary") or item.get("description") or item.get("impact_reason")
                ),
                "impact": _display(
                    item.get("impact") or item.get("impact_rule") or item.get("risk_level")
                ),
                "sentiment": _display(item.get("sentiment") or item.get("sentiment_label")),
                "url": _safe_external_http_url(item.get("url")),
            }
        )
    return items


def _news_source(item: dict[str, Any]) -> str:
    return _display(
        item.get("source") or item.get("publisher") or item.get("provider") or "Unknown Source"
    )


def _news_published_label(item: dict[str, Any]) -> str:
    age = _clean_text(
        item.get("published_age") or item.get("published_age_label") or item.get("age")
    )
    if age:
        return age
    value = (
        item.get("published_at")
        or item.get("publishedAt")
        or item.get("published_date")
        or item.get("pub_date")
    )
    if not value:
        return "N/A"
    text = str(value).strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed.strftime("%Y-%m-%d")
    except ValueError:
        return text[:10] if len(text) >= 10 else text


def _news_provider_rows(result: dict[str, Any]) -> list[dict[str, str]]:
    statuses = _news_context(result).get("provider_status")
    if not isinstance(statuses, dict):
        return []
    return [
        {"label": str(provider), "value": _display(status)} for provider, status in statuses.items()
    ]
