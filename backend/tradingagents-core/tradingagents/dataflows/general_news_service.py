from __future__ import annotations

import copy
import hashlib
import html
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlsplit

from .general_news_cache import GeneralNewsCache, GeneralNewsCacheEntry
from .general_news_categories import (
    is_allowed_category,
    map_general_news_category,
)
from .google_news_light import GoogleNewsLightProvider
from .marketaux_news import MarketAuxProvider
from .news_deduplication import deduplicate_news_articles
from .news_models import NormalizedNewsArticle
from .news_provider_base import ProviderFetchResult, sanitize_error
from .news_scoring import content_hash
from .newsdata_news import NewsDataProvider
from .rss_news import RSSContextProvider

logger = logging.getLogger(__name__)

GENERAL_NEWS_PROVIDER_ORDER = ["rss_context", "google_news_light", "marketaux", "newsdata"]
GENERAL_NEWS_PROVIDER_SET = set(GENERAL_NEWS_PROVIDER_ORDER)
PROVIDER_PRIORITY_SCORE = {
    "rss_context": 400,
    "google_news_light": 300,
    "marketaux": 200,
    "newsdata": 100,
}
FAILURE_STATUSES = {"missing_api_key", "timeout", "unavailable", "auth_or_forbidden", "parse_error", "error", "disabled"}
GENERAL_QUERY_BY_CATEGORY = {
    "all": [
        "global markets",
        "stock market",
        "economy",
        "central bank",
        "inflation",
        "crypto market",
        "oil prices",
        "forex market",
        "Indonesia economy",
    ],
    "market": ["global markets", "stock market", "earnings", "bond yields"],
    "macro": ["economy", "central bank", "inflation", "gdp"],
    "crypto": ["crypto market", "bitcoin", "ethereum", "digital assets"],
    "forex": ["forex market", "currency markets", "dollar", "exchange rate"],
    "commodities": ["oil prices", "gold prices", "commodities", "energy market"],
    "regulatory": ["SEC enforcement", "financial regulation", "market regulator", "compliance"],
    "indonesia": ["Indonesia economy", "rupiah", "IHSG", "Bank Indonesia"],
}
HIGH_IMPACT_KEYWORDS = [
    "central bank decision",
    "inflation shock",
    "rate hike",
    "rate cut",
    "war",
    "geopolitical escalation",
    "sec enforcement",
    "crypto etf",
    "oil supply disruption",
    "market crash",
    "market rally",
]
MEDIUM_IMPACT_KEYWORDS = [
    "earnings",
    "macro data",
    "market movement",
    "commodity price",
    "forex volatility",
    "volatility",
]
POSITIVE_KEYWORDS = ["rise", "gain", "rally", "beat", "growth", "inflows", "approval", "recovery"]
NEGATIVE_KEYWORDS = ["fall", "drop", "slump", "miss", "loss", "outflows", "lawsuit", "probe", "enforcement", "recession"]
_TAG_RE = re.compile(r"<[^>]+>")


class GeneralNewsService:
    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self.config = dict(config or {})
        self._cache = _active_cache(self.config)

    def fetch_general_news(
        self,
        *,
        category: str = "all",
        window_days: int | None = None,
        limit: int | None = None,
        provider_filter: str | None = None,
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        if not bool(self.config.get("enabled", True)):
            return {
                "enabled": False,
                "mode": "general_news",
                "articles": [],
                "articles_found": 0,
            }

        category = _normalized_category(category or str(self.config.get("default_category") or "all"))
        window_days = max(1, int(window_days or self.config.get("default_window_days", 7)))
        configured_limit = max(1, int(self.config.get("default_limit", 50)))
        max_ui = max(1, int(self.config.get("max_articles_for_ui", 100)))
        limit = min(max(1, int(limit or configured_limit)), max_ui)
        provider_filter = provider_filter.strip().lower() if provider_filter else None
        cache_key = self._cache_key(category, window_days, limit, provider_filter)

        stale_entry: GeneralNewsCacheEntry | None = None
        if self._cache is not None and not force_refresh:
            cached = self._cache.get(cache_key)
            if cached is not None:
                return _with_cache_metadata(cached.payload, hit=True, stale=False, age_seconds=cached.age_seconds)
            stale_entry = self._cache.get(cache_key, allow_stale=True)
            if stale_entry is not None and bool(self.config.get("enable_background_refresh", True)):
                return _with_cache_metadata(
                    stale_entry.payload,
                    hit=True,
                    stale=True,
                    age_seconds=stale_entry.age_seconds,
                )

        provider_status: dict[str, str] = {}
        articles: list[NormalizedNewsArticle] = []
        provider_order = self._provider_order(provider_filter)
        max_per_provider = max(1, int(self.config.get("max_articles_per_provider", 30)))

        for provider_name in provider_order:
            if provider_name not in GENERAL_NEWS_PROVIDER_SET:
                provider_status[provider_name] = "disabled"
                continue
            if provider_name == "rss_context":
                result = self._fetch_rss_context(window_days=window_days, limit=max_per_provider)
            elif provider_name == "google_news_light":
                result = self._fetch_google_news_light(category=category, window_days=window_days, limit=max_per_provider)
            elif provider_name == "marketaux":
                result = self._fetch_marketaux(category=category, window_days=window_days, limit=max_per_provider)
            elif provider_name == "newsdata":
                result = self._fetch_newsdata(category=category, limit=max_per_provider)
            else:
                result = ProviderFetchResult(provider=provider_name, status="disabled")

            provider_status[provider_name] = _public_status(result.status, result.articles)
            articles.extend(result.articles)

        normalized = self._normalize_articles(articles, category=category, window_days=window_days, limit=limit)
        result = {
            "enabled": True,
            "mode": "general_news",
            "category": category,
            "window_days": window_days,
            "limit": limit,
            "last_updated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "refresh_interval_seconds": int(self.config.get("refresh_interval_seconds", 120)),
            "cache": {
                "enabled": self._cache is not None,
                "hit": False,
                "age_seconds": 0,
            },
            "provider_status": provider_status,
            "articles_found": len(normalized),
            "articles": normalized,
        }

        if not normalized and _all_providers_failed(provider_status):
            if stale_entry is None and self._cache is not None:
                stale_entry = self._cache.get(cache_key, allow_stale=True)
            if stale_entry is not None:
                return _with_cache_metadata(
                    {
                        **copy.deepcopy(stale_entry.payload),
                        "warning": "Serving stale cached general news because all providers failed.",
                        "provider_status": provider_status,
                    },
                    hit=True,
                    stale=True,
                    age_seconds=stale_entry.age_seconds,
                )
            result["warning"] = "No general news available."

        if self._cache is not None:
            self._cache.set(cache_key, result)
        return result

    def _provider_order(self, provider_filter: str | None) -> list[str]:
        enabled = _string_list(self.config.get("enabled_providers") or ",".join(GENERAL_NEWS_PROVIDER_ORDER))
        priority = _string_list(self.config.get("provider_priority") or ",".join(GENERAL_NEWS_PROVIDER_ORDER))
        if provider_filter:
            return [provider_filter] if provider_filter in enabled or provider_filter in GENERAL_NEWS_PROVIDER_SET else [provider_filter]
        return [provider for provider in priority if provider in enabled]

    def _fetch_rss_context(self, *, window_days: int, limit: int) -> ProviderFetchResult:
        if not bool(self.config.get("rss_primary", True)):
            return ProviderFetchResult(provider="rss_context", status="disabled")

        rss_config = {
            "rss_enabled": bool(self.config.get("rss_enabled", True)),
            "rss_max_feeds": int(self.config.get("rss_max_feeds", 20)),
            "rss_max_items_per_feed": int(self.config.get("rss_max_items_per_feed", 30)),
            "rss_include_trial_feeds": bool(self.config.get("rss_include_trial_feeds", False)),
            "rss_google_news_fallback_enabled": bool(self.config.get("rss_google_news_fallback_enabled", True)),
            "rss_enabled_feed_ids": str(self.config.get("rss_enabled_feed_ids") or ""),
            "rss_disabled_feed_ids": str(self.config.get("rss_disabled_feed_ids") or "theblock-trial"),
            "rss_user_agent": str(self.config.get("rss_user_agent") or "TradingAgent/0.1 RSS Reader"),
        }
        provider = RSSContextProvider(
            "",
            timeout_seconds=int(self.config.get("vendor_timeout_seconds", 10)),
            max_retries=int(self.config.get("vendor_max_retries", 1)),
            config=rss_config,
        )
        try:
            return provider.fetch_news(_general_profile(), window_days=window_days, limit=limit)
        except Exception as exc:
            logger.info("general news rss_context failed: %s", exc)
            return ProviderFetchResult(provider="rss_context", status="unavailable", last_error=sanitize_error(exc))

    def _fetch_google_news_light(self, *, category: str, window_days: int, limit: int) -> ProviderFetchResult:
        provider = GoogleNewsLightProvider(
            str(self.config.get("google_news_light_api_key") or ""),
            timeout_seconds=int(self.config.get("vendor_timeout_seconds", 10)),
            max_retries=int(self.config.get("vendor_max_retries", 1)),
        )
        if not provider.api_key:
            return ProviderFetchResult(provider="google_news_light", status="missing_api_key")

        articles: list[NormalizedNewsArticle] = []
        attempts: list[dict[str, Any]] = []
        status = "empty"
        for query in _queries_for_category(category):
            params = {
                "api_key": provider.api_key,
                "engine": "google_news_light",
                "q": query,
                "gl": "us",
                "hl": "en",
                "time_period": _time_period(window_days),
                "sort_by": "most_recent",
                "filter": "1",
            }
            payload, attempt = provider._request_json(params, strategy=f"general:{query}", include_raw=False)
            attempts.append(attempt)
            status = _public_status(str(attempt.get("status") or "error"), articles)
            if payload is not None:
                articles.extend(_normalize_google_payload(payload, query=query))
            if len(articles) >= limit:
                break
        return ProviderFetchResult(provider="google_news_light", status="success" if articles else status, articles=articles[:limit], attempts=attempts)

    def _fetch_marketaux(self, *, category: str, window_days: int, limit: int) -> ProviderFetchResult:
        provider = MarketAuxProvider(
            str(self.config.get("marketaux_api_key") or ""),
            timeout_seconds=int(self.config.get("vendor_timeout_seconds", 10)),
            max_retries=int(self.config.get("vendor_max_retries", 1)),
        )
        if not provider.api_key:
            return ProviderFetchResult(provider="marketaux", status="missing_api_key")

        articles: list[NormalizedNewsArticle] = []
        attempts: list[dict[str, Any]] = []
        status = "empty"
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=max(1, int(window_days)))
        for query in _queries_for_category(category):
            params = {
                "api_token": provider.api_key,
                "search": query,
                "language": "id,en",
                "published_after": start.strftime("%Y-%m-%dT%H:%M:%S"),
                "published_before": end.strftime("%Y-%m-%dT%H:%M:%S"),
                "limit": max(1, min(limit, 100)),
            }
            payload, attempt = provider._request_json(params, strategy=f"general:{query}", include_raw=False)
            attempts.append(attempt)
            status = _public_status(str(attempt.get("status") or "error"), articles)
            if payload is not None:
                articles.extend(_normalize_marketaux_payload(payload, query=query))
            if len(articles) >= limit:
                break
        return ProviderFetchResult(provider="marketaux", status="success" if articles else status, articles=articles[:limit], attempts=attempts)

    def _fetch_newsdata(self, *, category: str, limit: int) -> ProviderFetchResult:
        provider = NewsDataProvider(
            str(self.config.get("newsdata_api_key") or ""),
            timeout_seconds=int(self.config.get("vendor_timeout_seconds", 10)),
            max_retries=int(self.config.get("vendor_max_retries", 1)),
        )
        if not provider.api_key:
            return ProviderFetchResult(provider="newsdata", status="missing_api_key")

        articles: list[NormalizedNewsArticle] = []
        attempts: list[dict[str, Any]] = []
        status = "empty"
        for query in _queries_for_category(category):
            params = {
                "apikey": provider.api_key,
                "q": query,
                "language": "en,id",
                "removeduplicate": "1",
                "size": max(1, min(limit, 50)),
            }
            payload, attempt = provider._request_json(params, strategy=f"general:{query}", include_raw=False)
            attempts.append(attempt)
            status = _public_status(str(attempt.get("status") or "error"), articles)
            if payload is not None:
                articles.extend(_normalize_newsdata_payload(payload, query=query))
            if len(articles) >= limit:
                break
        return ProviderFetchResult(provider="newsdata", status="success" if articles else status, articles=articles[:limit], attempts=attempts)

    def _normalize_articles(
        self,
        articles: list[NormalizedNewsArticle],
        *,
        category: str,
        window_days: int,
        limit: int,
    ) -> list[dict[str, Any]]:
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=max(1, int(window_days)))
        prepared: list[NormalizedNewsArticle] = []
        for article in articles:
            if not article.title or not article.url:
                continue
            published_at = _coerce_datetime(article.published_at)
            if published_at is not None and published_at < start:
                continue
            summary = _sanitize_summary(article.summary) or article.title
            article.summary = summary
            article.published_at = published_at
            article.relevance_score = _general_relevance_score(article)
            article.content_hash = article.content_hash or content_hash(article.title, article.url)
            mapped_category = map_general_news_category(article)
            article.bucket = mapped_category
            if category != "all" and mapped_category != category:
                continue
            prepared.append(article)

        deduped = deduplicate_news_articles(prepared)
        deduped.sort(
            key=lambda item: (
                item.published_at is not None,
                item.published_at.timestamp() if item.published_at else 0,
            ),
            reverse=True,
        )
        return [_article_payload(article) for article in deduped[:limit]]

    def _cache_key(self, category: str, window_days: int, limit: int, provider_filter: str | None) -> tuple[Any, ...]:
        return (
            "general_news:v1",
            category,
            window_days,
            limit,
            provider_filter,
            tuple(_string_list(self.config.get("provider_priority"))),
            tuple(_string_list(self.config.get("enabled_providers"))),
            bool(self.config.get("rss_enabled", True)),
            str(self.config.get("rss_enabled_feed_ids") or ""),
            str(self.config.get("rss_disabled_feed_ids") or ""),
            int(self.config.get("rss_max_feeds", 20)),
            int(self.config.get("rss_max_items_per_feed", 30)),
        )


def infer_impact(article: NormalizedNewsArticle | dict[str, Any]) -> str:
    text = _article_text(article)
    if any(word in text for word in HIGH_IMPACT_KEYWORDS):
        return "HIGH"
    if any(word in text for word in MEDIUM_IMPACT_KEYWORDS):
        return "MEDIUM"
    return "LOW"


def infer_sentiment(article: NormalizedNewsArticle | dict[str, Any]) -> str:
    text = _article_text(article)
    positive = sum(1 for word in POSITIVE_KEYWORDS if word in text)
    negative = sum(1 for word in NEGATIVE_KEYWORDS if word in text)
    if positive > negative:
        return "POSITIVE"
    if negative > positive:
        return "NEGATIVE"
    return "NEUTRAL"


def _active_cache(config: dict[str, Any]) -> GeneralNewsCache | None:
    if not bool(config.get("cache_enabled", True)):
        return None
    return GeneralNewsCache(
        db_path=str(config.get("cache_db_path") or ".cache/general_news.sqlite3"),
        ttl_seconds=max(30, int(config.get("cache_ttl_seconds", 120))),
        max_entries=max(1, int(config.get("cache_max_entries", 1000))),
    )


def _general_profile() -> dict[str, Any]:
    return {
        "ticker": "GENERAL",
        "short_ticker": "GENERAL",
        "company_name": "Global Markets",
        "aliases": ["markets", "economy", "macro", "crypto", "forex", "commodities"],
        "country": None,
    }


def _normalized_category(category: str) -> str:
    normalized = str(category or "all").strip().lower()
    return normalized if is_allowed_category(normalized) else "all"


def _queries_for_category(category: str) -> list[str]:
    return list(GENERAL_QUERY_BY_CATEGORY.get(_normalized_category(category), GENERAL_QUERY_BY_CATEGORY["all"]))


def _normalize_google_payload(payload: Any, *, query: str) -> list[NormalizedNewsArticle]:
    if not isinstance(payload, dict):
        return []
    raw_items = []
    for key in ("organic_results", "top_stories", "news_results"):
        value = payload.get(key)
        if isinstance(value, list):
            raw_items.extend((key, item) for item in value if isinstance(item, dict))
    articles = []
    for bucket, item in raw_items:
        title = _string_value(item.get("title"))
        url = _string_value(item.get("link") or item.get("url"))
        if not title or not url:
            continue
        articles.append(
            _make_article(
                provider="google_news_light",
                provider_article_id=_article_id(item, url),
                title=title,
                summary=item.get("snippet") or item.get("description"),
                url=url,
                source=item.get("source"),
                source_domain=_domain(url),
                published_at=_parse_date(item.get("date")),
                query_strategy=f"{bucket}:{query}",
            )
        )
    return articles


def _normalize_marketaux_payload(payload: Any, *, query: str) -> list[NormalizedNewsArticle]:
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        return []
    articles = []
    for item in payload["data"]:
        if not isinstance(item, dict):
            continue
        title = _string_value(item.get("title"))
        url = _string_value(item.get("url"))
        if not title or not url:
            continue
        articles.append(
            _make_article(
                provider="marketaux",
                provider_article_id=item.get("uuid"),
                title=title,
                summary=item.get("description") or item.get("snippet"),
                url=url,
                source=item.get("source"),
                source_domain=item.get("source_domain") or _domain(url),
                published_at=_parse_date(item.get("published_at")),
                query_strategy=f"general:{query}",
            )
        )
    return articles


def _normalize_newsdata_payload(payload: Any, *, query: str) -> list[NormalizedNewsArticle]:
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        return []
    articles = []
    for item in payload["results"]:
        if not isinstance(item, dict):
            continue
        title = _string_value(item.get("title"))
        url = _string_value(item.get("link"))
        if not title or not url:
            continue
        articles.append(
            _make_article(
                provider="newsdata",
                provider_article_id=item.get("article_id"),
                title=title,
                summary=item.get("description"),
                url=url,
                source=item.get("source_name") or item.get("source_id"),
                source_domain=item.get("source_url") or _domain(url),
                published_at=_parse_date(item.get("pubDate") or item.get("pubDateTZ")),
                query_strategy=f"general:{query}",
            )
        )
    return articles


def _make_article(
    *,
    provider: str,
    provider_article_id: Any,
    title: str,
    summary: Any,
    url: str,
    source: Any,
    source_domain: Any,
    published_at: datetime | None,
    query_strategy: str,
) -> NormalizedNewsArticle:
    return NormalizedNewsArticle(
        provider=provider,
        provider_article_id=_string_value(provider_article_id) or None,
        ticker="GENERAL",
        company_name="Global Markets",
        title=title,
        summary=_sanitize_summary(summary) or title,
        url=url,
        source=_source_name(source) or _domain(url),
        source_domain=_string_value(source_domain) or _domain(url),
        published_at=published_at,
        relevance_score=PROVIDER_PRIORITY_SCORE.get(provider, 0),
        content_hash=content_hash(title, url),
        query_strategy=query_strategy,
        market_context_only=True,
    )


def _article_payload(article: NormalizedNewsArticle) -> dict[str, Any]:
    category = article.bucket or map_general_news_category(article)
    published_at = _coerce_datetime(article.published_at)
    return {
        "id": _stable_article_id(article),
        "title": article.title,
        "summary": article.summary or article.title,
        "url": article.url,
        "source": article.source,
        "source_domain": article.source_domain or _domain(article.url),
        "provider": article.provider,
        "category": category,
        "published_at": _date_text(published_at),
        "published_age": _published_age(published_at),
        "impact": infer_impact(article),
        "sentiment": infer_sentiment(article),
    }


def _stable_article_id(article: NormalizedNewsArticle) -> str:
    raw = article.provider_article_id or article.url or f"{article.provider}:{article.title}"
    digest = hashlib.sha256(str(raw).encode("utf-8")).hexdigest()[:16]
    return f"{article.provider}:{digest}"


def _article_text(article: NormalizedNewsArticle | dict[str, Any]) -> str:
    if isinstance(article, dict):
        title = article.get("title")
        summary = article.get("summary")
    else:
        title = article.title
        summary = article.summary
    return f"{title or ''} {summary or ''}".lower()


def _general_relevance_score(article: NormalizedNewsArticle) -> float:
    score = PROVIDER_PRIORITY_SCORE.get(article.provider, 0)
    if article.source:
        score += 20
    if article.summary:
        score += 10
    if article.published_at:
        score += 10
    return float(score)


def _with_cache_metadata(payload: dict[str, Any], *, hit: bool, stale: bool, age_seconds: int) -> dict[str, Any]:
    result = copy.deepcopy(payload)
    cache = dict(result.get("cache") or {})
    cache.update(
        {
            "enabled": True,
            "hit": hit,
            "stale": stale,
            "age_seconds": age_seconds,
        }
    )
    result["cache"] = cache
    return result


def _all_providers_failed(provider_status: dict[str, str]) -> bool:
    if not provider_status:
        return True
    return all(status in FAILURE_STATUSES for status in provider_status.values())


def _public_status(status: str, articles: list[NormalizedNewsArticle]) -> str:
    if articles:
        return "success"
    mapping = {
        "success": "empty",
        "missing_api_key": "missing_api_key",
        "vendor_timeout": "timeout",
        "timeout": "timeout",
        "vendor_auth_error": "auth_or_forbidden",
        "auth_or_forbidden": "auth_or_forbidden",
        "vendor_quota_error": "auth_or_forbidden",
        "vendor_empty_response": "unavailable",
        "unavailable": "unavailable",
        "vendor_schema_error": "error",
        "parse_error": "parse_error",
        "disabled": "disabled",
        "empty": "empty",
    }
    return mapping.get(str(status or ""), "error")


def _time_period(window_days: int) -> str:
    days = max(1, int(window_days))
    if days <= 1:
        return "last_day"
    if days <= 7:
        return "last_week"
    if days <= 31:
        return "last_month"
    return "last_year"


def _sanitize_summary(value: Any) -> str:
    text = html.unescape(str(value or ""))
    text = _TAG_RE.sub(" ", text)
    return " ".join(text.split())


def _parse_date(value: Any) -> datetime | None:
    text = _string_value(value)
    if not text:
        return None
    relative = _parse_relative_date(text)
    if relative is not None:
        return relative
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%a, %d %b %Y %H:%M:%S %Z"):
            try:
                parsed = datetime.strptime(text, fmt)
                break
            except ValueError:
                parsed = None
        if parsed is None:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _parse_relative_date(text: str) -> datetime | None:
    match = re.match(r"(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks)\s+ago", text.lower())
    if not match:
        return None
    amount = int(match.group(1))
    unit = match.group(2)
    if unit.startswith("minute"):
        delta = timedelta(minutes=amount)
    elif unit.startswith("hour"):
        delta = timedelta(hours=amount)
    elif unit.startswith("day"):
        delta = timedelta(days=amount)
    else:
        delta = timedelta(weeks=amount)
    return datetime.now(timezone.utc) - delta


def _coerce_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = _parse_date(value)
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _date_text(value: datetime | None) -> str | None:
    return value.isoformat().replace("+00:00", "Z") if value is not None else None


def _published_age(value: datetime | None) -> str:
    if value is None:
        return "-"
    seconds = max(0, int((datetime.now(timezone.utc) - value).total_seconds()))
    if seconds < 3600:
        return f"{max(1, seconds // 60)}m"
    if seconds < 86400:
        return f"{seconds // 3600}h"
    return f"{seconds // 86400}d"


def _source_name(value: Any) -> str:
    if isinstance(value, dict):
        return _string_value(value.get("title") or value.get("name"))
    return _string_value(value)


def _string_value(value: Any) -> str:
    return str(value or "").strip()


def _domain(url: str) -> str | None:
    try:
        return urlsplit(url).netloc.lower().removeprefix("www.") or None
    except ValueError:
        return None


def _article_id(item: dict[str, Any], url: str) -> str:
    return _string_value(item.get("id") or item.get("position") or item.get("story_token") or url)


def _string_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return [item.strip().lower() for item in value.split(",") if item.strip()]
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip().lower() for item in value if str(item).strip()]
    return []
