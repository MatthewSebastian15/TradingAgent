from __future__ import annotations

import copy
import logging
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any

from tradingagents.utils_resilience import TTLCache
from tradingagents.yfinance_runtime import yf

from .config import get_config
from .marketaux_news import MarketAuxProvider
from .news_deduplication import deduplicate_news_articles
from .news_models import NewsEntity, NormalizedNewsArticle, article_to_dict
from .news_scoring import score_news_article
from .news_ticker_aliases import resolve_news_ticker
from .newsdata_news import NewsDataProvider
from .stockstats_utils import yf_retry
from .vendor_budget import get_budget
from .vendor_router import get_attempt_recorder
from .yfinance_news import _extract_article_data

logger = logging.getLogger(__name__)
_MEMORY_CACHE = TTLCache(maxsize=512, ttl_seconds=6 * 60 * 60)
_PERSISTENT_CACHE = None
_PERSISTENT_CACHE_CONFIG = None
_CACHE_LOCK = Lock()

try:
    from persistent_cache import SQLiteTTLCache
except Exception:  # pragma: no cover - CLI mode may not have the backend wrapper
    SQLiteTTLCache = None  # type: ignore[assignment]


class NewsService:
    def __init__(self, config: dict[str, Any] | None = None) -> None:
        full_config = get_config()
        self.full_config = full_config
        self.config = dict(config or full_config.get("news", {}) or {})

    def fetch_news(
        self,
        ticker: str,
        *,
        as_of_date: str | None = None,
        window_days: int | None = None,
        limit: int | None = None,
        provider_filter: str | None = None,
        debug: bool = False,
        include_raw: bool = False,
        bypass_cache: bool = False,
    ) -> dict[str, Any]:
        profile = resolve_news_ticker(ticker)
        window_days = max(1, int(window_days or self.config.get("default_window_days", 30)))
        ui_limit = max(1, int(limit or self.config.get("max_articles_for_ui", 20)))
        include_raw = bool(debug and include_raw and self.config.get("debug_raw_response", False))
        cache_key = (
            "normalized_news",
            profile["ticker"],
            as_of_date,
            window_days,
            ui_limit,
            provider_filter,
            self.config.get("provider_priority"),
            self.config.get("enabled_providers"),
        )
        cache = _active_cache(self.config)

        if self.config.get("cache_enabled", True) and not bypass_cache and not debug:
            cached = cache.get(cache_key)
            if isinstance(cached, dict):
                result = copy.deepcopy(cached)
                result["cache"] = {"hit": True}
                return result

        enabled_providers = _string_list(self.config.get("enabled_providers", ["marketaux", "newsdata"]))
        provider_priority = _string_list(self.config.get("provider_priority", ["marketaux", "newsdata"]))
        if provider_filter:
            provider_priority = [provider_filter]
            if provider_filter not in enabled_providers:
                enabled_providers.append(provider_filter)

        provider_status: dict[str, str] = {}
        provider_health: dict[str, dict[str, Any]] = {}
        debug_attempts: dict[str, list[dict[str, Any]]] = {}
        articles: list[NormalizedNewsArticle] = []
        max_per_provider = max(1, int(self.config.get("max_articles_per_provider", 10)))
        required_primary_count = max(1, int(self.config.get("secondary_fetch_threshold", 5)))
        min_relevance = float(self.config.get("min_relevance_score", 50))

        for provider_name in provider_priority:
            if provider_name not in {"marketaux", "newsdata"}:
                provider_status[provider_name] = "disabled"
                continue
            if provider_name not in enabled_providers:
                provider_status[provider_name] = "disabled"
                provider_health[provider_name] = _provider_health(False, "disabled")
                continue
            if (
                provider_name == "newsdata"
                and not self.config.get("fetch_secondary_always", False)
                and len([item for item in articles if item.relevance_score >= min_relevance]) >= required_primary_count
            ):
                provider_status[provider_name] = "skipped_sufficient_primary"
                provider_health[provider_name] = _provider_health(True, "skipped_sufficient_primary")
                continue
            provider = self._provider(provider_name)
            if provider.api_key and not self._consume_budget(provider_name):
                provider_status[provider_name] = "budget_exceeded"
                provider_health[provider_name] = _provider_health(bool(provider.api_key), "budget_exceeded")
                self._record_attempt(provider_name, "budget_exceeded")
                continue
            fetch_result = provider.fetch_news(
                profile,
                as_of_date=as_of_date,
                window_days=window_days,
                limit=max_per_provider,
                include_raw=include_raw,
            )
            provider_status[provider_name] = fetch_result.status
            provider_health[provider_name] = _provider_health(bool(provider.api_key), fetch_result.status)
            debug_attempts[provider_name] = fetch_result.attempts
            articles.extend(fetch_result.articles)
            self._record_attempt(provider_name, fetch_result.status)
            if self.config.get("log_provider_requests", True):
                logger.info(
                    "news_provider provider=%s ticker=%s status=%s articles=%d",
                    provider_name,
                    profile["ticker"],
                    fetch_result.status,
                    len(fetch_result.articles),
                )

        if (
            not provider_filter
            and self.config.get("enable_yfinance_fallback", True)
            and len([item for item in articles if item.relevance_score >= min_relevance]) < required_primary_count
        ):
            yfinance_articles = (
                _fetch_yfinance_fallback(profile, limit=max_per_provider) if self._consume_budget("yfinance") else []
            )
            articles.extend(yfinance_articles)
            provider_status["yfinance"] = "success" if yfinance_articles else "unavailable"
            provider_health["yfinance"] = _provider_health(True, provider_status["yfinance"])
            self._record_attempt("yfinance", provider_status["yfinance"])

        articles = _filter_articles_by_window(articles, as_of_date=as_of_date, window_days=window_days)
        deduped = deduplicate_news_articles(articles)
        ui_articles = [
            article for article in deduped if article.relevance_score >= min_relevance or article.market_context_only
        ][:ui_limit]
        prompt_min = float(self.config.get("prompt_min_relevance_score", 65))
        prompt_limit = max(1, int(self.config.get("max_articles_for_prompt", 5)))
        prompt_articles = [
            article
            for article in ui_articles
            if article.relevance_score >= prompt_min and not article.market_context_only
        ][:prompt_limit]
        serialized_articles = [article_to_dict(article) for article in ui_articles]
        serialized_prompt_articles = [article_to_dict(article) for article in prompt_articles]
        providers_used = list(dict.fromkeys(article.provider for article in ui_articles))
        result = {
            "enabled": bool(enabled_providers or self.config.get("enable_yfinance_fallback", True)),
            "ticker": profile["ticker"],
            "company_name": profile["company_name"],
            "window_days": window_days,
            "providers_used": providers_used,
            "provider_status": provider_status,
            "provider_health": provider_health,
            "articles_found": len(ui_articles),
            "articles_used_in_prompt": len(prompt_articles),
            "average_sentiment": _average_sentiment(ui_articles),
            "articles": serialized_articles,
            "prompt_articles": serialized_prompt_articles,
            "empty_reason": None if ui_articles else "No relevant company-specific news was found.",
            "cache": {"hit": False},
        }
        if debug:
            result["debug"] = {
                "raw_response_enabled": include_raw,
                "provider_attempts": debug_attempts,
                "deduplication": {
                    "articles_before": len(articles),
                    "articles_after": len(deduped),
                    "articles_for_ui": len(ui_articles),
                    "articles_for_prompt": len(prompt_articles),
                },
            }
            if include_raw:
                result["debug"]["normalized_response"] = [
                    article_to_dict(article, include_raw=True) for article in ui_articles
                ]

        if self.config.get("cache_enabled", True) and not debug:
            cache.set(cache_key, result)
        return result

    def _provider(self, provider_name: str):
        kwargs = {
            "timeout_seconds": int(self.config.get("vendor_timeout_seconds", 15)),
            "max_retries": int(self.config.get("vendor_max_retries", 2)),
        }
        if provider_name == "marketaux":
            return MarketAuxProvider(str(self.config.get("marketaux_api_key") or ""), **kwargs)
        return NewsDataProvider(str(self.config.get("newsdata_api_key") or ""), **kwargs)

    def _consume_budget(self, provider_name: str) -> bool:
        budget = get_budget(self.full_config.get("_vendor_budget_id"))
        if budget is None:
            return True
        if not budget.can_call(provider_name):
            budget.record_blocked(provider_name, "get_news", "request budget exceeded")
            return False
        budget.record_call(provider_name, "get_news")
        return True

    def _record_attempt(self, provider_name: str, status: str) -> None:
        recorder = get_attempt_recorder(self.full_config.get("_vendor_attempt_recorder_id"))
        if recorder is not None:
            recorder.record("get_news", provider_name, status)


def format_news_for_prompt(context: dict[str, Any]) -> str:
    articles = context.get("prompt_articles") if isinstance(context, dict) else []
    if not isinstance(articles, list) or not articles:
        ticker = context.get("ticker") if isinstance(context, dict) else "ticker"
        return f"No high-relevance company-specific news found for {ticker}."

    lines = [
        f"## Normalized Company News for {context.get('ticker')}",
        "",
        "Use these normalized headlines only as supporting context. Do not invent missing events or sentiment.",
        "",
    ]
    for article in articles:
        lines.append(f"### {article.get('title')} (source: {article.get('source') or 'Unknown'})")
        lines.append(
            f"Provider: {article.get('provider')} | Relevance: {article.get('relevance_score')} | "
            f"Sentiment: {article.get('sentiment_label') or 'unavailable'}"
        )
        if article.get("summary"):
            lines.append(str(article["summary"]))
        if article.get("url"):
            lines.append(f"Link: {article['url']}")
        lines.append("")
    return "\n".join(lines).strip()


def _fetch_yfinance_fallback(profile: dict[str, Any], *, limit: int) -> list[NormalizedNewsArticle]:
    try:
        stock = yf.Ticker(profile["ticker"])
        payload = yf_retry(lambda: stock.get_news(count=max(1, int(limit))))
    except Exception as exc:
        logger.info("yfinance news fallback failed for %s: %s", profile["ticker"], exc)
        return []

    articles: list[NormalizedNewsArticle] = []
    for item in payload or []:
        if not isinstance(item, dict):
            continue
        extracted = _extract_article_data(item)
        if not extracted.get("title") or not extracted.get("link"):
            continue
        try:
            article = NormalizedNewsArticle(
                provider="yfinance",
                ticker=profile["ticker"],
                company_name=profile["company_name"],
                title=extracted["title"],
                summary=extracted.get("summary"),
                url=extracted["link"],
                source=extracted.get("publisher"),
                published_at=extracted.get("pub_date"),
                entities=[NewsEntity(symbol=profile["ticker"], name=profile["company_name"], match_score=50)],
            )
        except ValueError:
            continue
        articles.append(score_news_article(article, profile))
    return articles


def _average_sentiment(articles: list[NormalizedNewsArticle]) -> str | None:
    scores = [article.sentiment_score for article in articles if article.sentiment_score is not None]
    if not scores:
        return None
    average = sum(scores) / len(scores)
    if average >= 0.35:
        return "positive"
    if average > 0.05:
        return "neutral_positive"
    if average <= -0.35:
        return "negative"
    if average < -0.05:
        return "neutral_negative"
    return "neutral"


def _filter_articles_by_window(
    articles: list[NormalizedNewsArticle],
    *,
    as_of_date: str | None,
    window_days: int,
) -> list[NormalizedNewsArticle]:
    if not as_of_date:
        return articles
    try:
        end = datetime.strptime(as_of_date[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
    except ValueError:
        return articles
    start = end - timedelta(days=max(1, int(window_days)))
    filtered: list[NormalizedNewsArticle] = []
    for article in articles:
        published_at = article.published_at
        if published_at is None:
            continue
        if published_at.tzinfo is None:
            published_at = published_at.replace(tzinfo=timezone.utc)
        if start <= published_at <= end:
            filtered.append(article)
    return filtered


def _provider_health(enabled: bool, status: str) -> dict[str, Any]:
    return {
        "enabled": enabled,
        "status": status,
        "last_error": None if status in {"success", "skipped_sufficient_primary"} else status,
        "last_success_at": datetime.now().astimezone().isoformat() if status == "success" else None,
    }


def _string_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def _active_cache(config: dict[str, Any]):
    global _PERSISTENT_CACHE, _PERSISTENT_CACHE_CONFIG
    ttl_seconds = max(60, int(config.get("cache_ttl_minutes", 360)) * 60)
    max_entries = max(1, int(config.get("cache_max_entries", 512)))
    db_path = str(config.get("cache_db_path") or ".cache/news_data.sqlite3")
    if SQLiteTTLCache is None:
        _MEMORY_CACHE.ttl_seconds = ttl_seconds
        _MEMORY_CACHE.maxsize = max_entries
        return _MEMORY_CACHE

    cache_config = (db_path, ttl_seconds, max_entries)
    with _CACHE_LOCK:
        if _PERSISTENT_CACHE is None or cache_config != _PERSISTENT_CACHE_CONFIG:
            _PERSISTENT_CACHE = SQLiteTTLCache(db_path=db_path, ttl_seconds=ttl_seconds, max_entries=max_entries)
            _PERSISTENT_CACHE_CONFIG = cache_config
    return _PERSISTENT_CACHE
