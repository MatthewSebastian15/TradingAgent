# ruff: noqa: E501
from __future__ import annotations

import copy
import logging
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any

from tradingagents.dataflows.market.stockstats_utils import yf_retry
from tradingagents.dataflows.providers.config import get_config
from tradingagents.dataflows.providers.errors import ErrorCode
from tradingagents.dataflows.providers.google_news_light import GoogleNewsLightProvider
from tradingagents.dataflows.providers.marketaux_news import MarketAuxProvider
from tradingagents.dataflows.providers.newsdata_news import NewsDataProvider
from tradingagents.dataflows.providers.rss_news import RSSContextProvider
from tradingagents.dataflows.providers.vendor_budget import get_budget
from tradingagents.dataflows.providers.vendor_router import get_attempt_recorder
from tradingagents.dataflows.providers.yfinance_news import _extract_article_data
from tradingagents.utils_resilience import TTLCache
from tradingagents.yfinance_runtime import yf

from .news_aggregator import deduplicate_news as deduplicate_news_articles
from .news_decision_filter import split_ai_analysis_news
from .news_models import NewsEntity, NormalizedNewsArticle, article_to_dict
from .news_query_builder import build_ticker_news_queries
from .news_relevance import is_relevant_news
from .news_scoring import score_news_article
from .news_ticker_aliases import resolve_news_ticker

logger = logging.getLogger(__name__)
STRUCTURED_NEWS_PROVIDERS = {
    "google_news_light",
    "marketaux",
    "rss_context",
    "newsdata",
    "yfinance",
}
DEFAULT_NEWS_PROVIDER_ORDER = [
    "google_news_light",
    "marketaux",
    "rss_context",
    "newsdata",
    "yfinance",
]
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
        force_refresh: bool = False,
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
            tuple(_string_list(self.config.get("provider_priority"))),
            tuple(_string_list(self.config.get("enabled_providers"))),
            bool(self.config.get("strict_ai_analysis_mode", True)),
            float(self.config.get("decision_min_relevance_score", 70)),
            float(self.config.get("rss_decision_min_relevance_score", 80)),
            bool(self.config.get("rss_enabled", True)),
            int(self.config.get("rss_max_feeds", 10)),
            int(self.config.get("rss_max_items_per_feed", 20)),
            bool(self.config.get("rss_include_trial_feeds", False)),
            bool(self.config.get("rss_google_news_fallback_enabled", True)),
            str(self.config.get("rss_enabled_feed_ids") or ""),
            str(self.config.get("rss_disabled_feed_ids") or ""),
        )
        cache = _active_cache(self.config)

        if (
            self.config.get("cache_enabled", True)
            and not (bypass_cache or force_refresh)
            and not debug
        ):
            cached = cache.get(cache_key)
            if isinstance(cached, dict):
                result = copy.deepcopy(cached)
                result["cache"] = {**dict(result.get("cache") or {}), "enabled": True, "hit": True}
                return result

        enabled_providers = _string_list(
            self.config.get("enabled_providers", DEFAULT_NEWS_PROVIDER_ORDER)
        )
        provider_priority = _string_list(
            self.config.get("provider_priority", DEFAULT_NEWS_PROVIDER_ORDER)
        )
        if provider_filter:
            provider_priority = [provider_filter]
            if provider_filter not in enabled_providers:
                enabled_providers.append(provider_filter)

        provider_status: dict[str, str] = {}
        ticker_queries = build_ticker_news_queries(profile, max_queries=12)
        provider_health: dict[str, dict[str, Any]] = {}
        debug_attempts: dict[str, list[dict[str, Any]]] = {}
        articles: list[NormalizedNewsArticle] = []
        max_per_provider = max(1, int(self.config.get("max_articles_per_provider", 10)))
        required_primary_count = max(1, int(self.config.get("secondary_fetch_threshold", 5)))
        min_relevance = float(self.config.get("min_relevance_score", 50))
        strict_mode = bool(self.config.get("strict_ai_analysis_mode", True))
        force_all = bool(self.config.get("force_all_providers", False if strict_mode else True))

        def enough_relevant(candidate_articles: list[NormalizedNewsArticle]) -> bool:
            return (
                len([item for item in candidate_articles if item.relevance_score >= min_relevance])
                >= required_primary_count
            )

        def should_stop_for_enough(candidate_articles: list[NormalizedNewsArticle]) -> bool:
            if force_all:
                return False
            if strict_mode:
                return enough_relevant(candidate_articles)
            if self.config.get("fetch_secondary_always", False):
                return False
            return enough_relevant(candidate_articles)

        def skipped_sufficient_primary(provider_name: str) -> None:
            provider_status[provider_name] = "skipped_sufficient_primary"
            provider_health[provider_name] = _provider_health(True, "skipped_sufficient_primary")

        def fetch_provider(provider_name: str) -> dict[str, Any]:
            if provider_name == "yfinance":
                if not self._consume_budget("yfinance"):
                    self._record_attempt("yfinance", "budget_exceeded")
                    return {
                        "status": "budget_exceeded",
                        "health": _provider_health(True, "budget_exceeded"),
                        "attempts": [
                            {"strategy": "yfinance_get_news", "status": "budget_exceeded"}
                        ],
                        "articles": [],
                    }
                yfinance_articles = _fetch_yfinance_fallback(profile, limit=max_per_provider)
                status = "success" if yfinance_articles else "unavailable"
                self._record_attempt(provider_name, status)
                return {
                    "status": status,
                    "health": _provider_health(True, status),
                    "attempts": [
                        {
                            "strategy": "yfinance_get_news",
                            "status": status,
                            "items_used": len(yfinance_articles),
                        }
                    ],
                    "articles": yfinance_articles,
                }

            provider = self._provider(provider_name)
            if provider.api_key and not self._consume_budget(provider_name):
                self._record_attempt(provider_name, "budget_exceeded")
                return {
                    "status": "budget_exceeded",
                    "health": _provider_health(bool(provider.api_key), "budget_exceeded"),
                    "attempts": [],
                    "articles": [],
                }
            try:
                fetch_result = provider.fetch_news(
                    profile,
                    as_of_date=as_of_date,
                    window_days=window_days,
                    limit=max_per_provider,
                    include_raw=include_raw,
                )
            except Exception as exc:
                logger.info(
                    "news provider failed provider=%s ticker=%s error=%s",
                    provider_name,
                    profile["ticker"],
                    exc,
                )
                self._record_attempt(provider_name, "unavailable")
                return {
                    "status": "unavailable",
                    "health": _provider_health(bool(provider.api_key), "unavailable"),
                    "attempts": [
                        {
                            "strategy": provider_name,
                            "status": "unavailable",
                            "error": str(exc)[:300],
                        }
                    ],
                    "articles": [],
                }

            self._record_attempt(provider_name, fetch_result.status)
            if self.config.get("log_provider_requests", True):
                logger.info(
                    "news_provider provider=%s ticker=%s status=%s articles=%d",
                    provider_name,
                    profile["ticker"],
                    fetch_result.status,
                    len(fetch_result.articles),
                )
            return {
                "status": fetch_result.status,
                "health": _provider_health(bool(provider.api_key), fetch_result.status),
                "attempts": fetch_result.attempts,
                "articles": fetch_result.articles,
            }

        active_providers: list[str] = []
        deferred_yfinance = False
        for provider_name in provider_priority:
            if provider_name not in STRUCTURED_NEWS_PROVIDERS:
                provider_status[provider_name] = "disabled"
                continue
            if provider_name not in enabled_providers:
                provider_status[provider_name] = "disabled"
                provider_health[provider_name] = _provider_health(False, "disabled")
                continue
            if provider_name == "yfinance":
                if not self.config.get("enable_yfinance_fallback", True):
                    provider_status[provider_name] = "disabled"
                    provider_health[provider_name] = _provider_health(False, "disabled")
                    continue
                deferred_yfinance = True
                continue
            active_providers.append(provider_name)

        completed_results: dict[str, dict[str, Any]] = {}
        stopped_after_sufficient = False
        parallel_providers = active_providers
        if active_providers and not force_all:
            first_provider = active_providers[0]
            completed_results[first_provider] = fetch_provider(first_provider)
            current_articles = completed_results[first_provider].get("articles", [])
            if should_stop_for_enough(current_articles):
                stopped_after_sufficient = True
                parallel_providers = []
            else:
                parallel_providers = active_providers[1:]

        if parallel_providers:
            executor = ThreadPoolExecutor(
                max_workers=len(parallel_providers), thread_name_prefix="news-provider"
            )
            futures = {
                executor.submit(fetch_provider, provider_name): provider_name
                for provider_name in parallel_providers
            }
            try:
                for future in as_completed(futures):
                    provider_name = futures[future]
                    completed_results[provider_name] = future.result()
                    current_articles = [
                        article
                        for name in provider_priority
                        for article in completed_results.get(name, {}).get("articles", [])
                    ]
                    if should_stop_for_enough(current_articles):
                        stopped_after_sufficient = True
                        for pending in futures:
                            if pending is not future:
                                pending.cancel()
                        break
            finally:
                executor.shutdown(wait=not stopped_after_sufficient, cancel_futures=True)

        for provider_name in provider_priority:
            if provider_name not in active_providers:
                continue
            result = completed_results.get(provider_name)
            if result is None:
                skipped_sufficient_primary(provider_name)
                continue
            provider_status[provider_name] = result["status"]
            provider_health[provider_name] = result["health"]
            debug_attempts[provider_name] = result["attempts"]
            articles.extend(result["articles"])

        if deferred_yfinance:
            if should_stop_for_enough(articles):
                skipped_sufficient_primary("yfinance")
            else:
                result = fetch_provider("yfinance")
                provider_status["yfinance"] = result["status"]
                provider_health["yfinance"] = result["health"]
                debug_attempts["yfinance"] = result["attempts"]
                articles.extend(result["articles"])

        if (
            not strict_mode
            and "yfinance" not in provider_priority
            and not provider_filter
            and self.config.get("enable_yfinance_fallback", True)
            and len([item for item in articles if item.relevance_score >= min_relevance])
            < required_primary_count
        ):
            if self._consume_budget("yfinance"):
                yfinance_articles = _fetch_yfinance_fallback(profile, limit=max_per_provider)
                articles.extend(yfinance_articles)
                provider_status["yfinance"] = "success" if yfinance_articles else "unavailable"
            else:
                yfinance_articles = []
                provider_status["yfinance"] = "budget_exceeded"
            provider_health["yfinance"] = _provider_health(True, provider_status["yfinance"])
            debug_attempts["yfinance"] = [
                {
                    "strategy": "yfinance_get_news",
                    "status": provider_status["yfinance"],
                    "items_used": len(yfinance_articles),
                }
            ]
            self._record_attempt("yfinance", provider_status["yfinance"])

        articles = _filter_articles_by_window(
            articles, as_of_date=as_of_date, window_days=window_days
        )
        deduped = deduplicate_news_articles(articles)
        dedup_removed_count = max(0, len(articles) - len(deduped))
        prompt_limit = max(1, int(self.config.get("max_articles_for_prompt", 5)))
        decision_min = float(self.config.get("decision_min_relevance_score", 70))
        rss_decision_min = float(self.config.get("rss_decision_min_relevance_score", 80))
        if strict_mode:
            split_news = split_ai_analysis_news(
                deduped,
                profile,
                decision_min_score=decision_min,
                rss_decision_min_score=rss_decision_min,
                prompt_limit=prompt_limit,
            )
            decision_company_news = split_news["decision_company_news"]
            market_context_news = split_news["market_context_news"]
            excluded_news = split_news["excluded_news"]
            ui_articles = [*decision_company_news, *market_context_news][:ui_limit]
            prompt_articles = decision_company_news[:prompt_limit]
        else:
            relevant_articles = [
                article
                for article in deduped
                if article.market_context_only
                or is_relevant_news(
                    article_to_dict(article),
                    profile["ticker"],
                    profile.get("company_name"),
                    profile.get("aliases"),
                )
            ]
            ui_articles = [
                article
                for article in relevant_articles
                if (article.relevance_score >= min_relevance or article.market_context_only)
                and (article.bucket or "full_news") != "discard"
            ][:ui_limit]
            prompt_min = float(self.config.get("prompt_min_relevance_score", 65))
            prompt_articles = [
                article
                for article in ui_articles
                if article.relevance_score >= prompt_min
                and not article.market_context_only
                and (article.bucket or "full_news") in {"full_news", "macro_context"}
            ][:prompt_limit]
            decision_company_news = prompt_articles
            market_context_news = [
                article for article in ui_articles if article.market_context_only
            ]
            excluded_news = []
        serialized_articles = [article_to_dict(article) for article in ui_articles]
        serialized_prompt_articles = [article_to_dict(article) for article in prompt_articles]
        serialized_decision_news = [article_to_dict(article) for article in decision_company_news]
        serialized_context_news = [article_to_dict(article) for article in market_context_news]
        providers_used = list(provider_status.keys())
        latest_article_date = max(
            (
                str(item.get("published_at"))
                for item in serialized_articles
                if item.get("published_at")
            ),
            default=None,
        )
        result = {
            "enabled": bool(enabled_providers or self.config.get("enable_yfinance_fallback", True)),
            "mode": "ticker_news",
            "ticker": profile["ticker"],
            "company_name": profile["company_name"],
            "aliases": profile.get("aliases", []),
            "window_days": window_days,
            "limit": ui_limit,
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "providers_used": providers_used,
            "provider_status": provider_status,
            "provider_health": provider_health,
            "articles_found": len(ui_articles),
            "articles_used_in_prompt": len(prompt_articles),
            "latest_article_date": latest_article_date,
            "dedup_removed_count": dedup_removed_count,
            "duplicate_removed_count": dedup_removed_count,
            "average_sentiment": _average_sentiment(ui_articles),
            "articles": serialized_articles,
            "decision_company_news": serialized_decision_news,
            "market_context_news": serialized_context_news,
            "excluded_news_count": len(excluded_news),
            "prompt_articles": serialized_prompt_articles,
            "strict_news_filter": {
                "enabled": strict_mode,
                "decision_min_relevance_score": decision_min,
                "rss_decision_min_relevance_score": rss_decision_min,
                "decision_company_news_count": len(decision_company_news),
                "market_context_news_count": len(market_context_news),
                "excluded_news_count": len(excluded_news),
            },
            "limitations": []
            if prompt_articles
            else [
                "No company-specific news passed the strict decision filter. Market context was not used as direct company evidence."
            ],
            "empty_reason": None if ui_articles else "No relevant company-specific news was found.",
            "cache": {"enabled": bool(self.config.get("cache_enabled", True)), "hit": False},
        }
        if debug:
            result["debug"] = {
                "raw_response_enabled": include_raw,
                "provider_attempts": debug_attempts,
                "deduplication": {
                    "articles_before": len(articles),
                    "articles_after": len(deduped),
                    "removed_count": dedup_removed_count,
                    "articles_for_ui": len(ui_articles),
                    "articles_for_prompt": len(prompt_articles),
                },
                "ticker_profile": profile,
                "queries": ticker_queries,
                "decision_filter": {
                    "decision_min_relevance_score": decision_min,
                    "rss_decision_min_relevance_score": rss_decision_min,
                    "excluded_reasons": dict(
                        Counter(str(item["reason"]) for item in excluded_news)
                    ),
                },
                "strict_news_filter": {
                    "excluded_news": [
                        {
                            "reason": str(item["reason"]),
                            "provider": item["article"].provider,
                            "title": item["article"].title,
                            "relevance_score": item["article"].relevance_score,
                            "relevance_category": item["article"].relevance_category,
                            "market_context_only": item["article"].market_context_only,
                        }
                        for item in excluded_news
                    ]
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
        if provider_name == "google_news_light":
            return GoogleNewsLightProvider(
                str(self.config.get("google_news_light_api_key") or ""), **kwargs
            )
        if provider_name == "marketaux":
            return MarketAuxProvider(str(self.config.get("marketaux_api_key") or ""), **kwargs)
        if provider_name == "rss_context":
            return RSSContextProvider("", config=self.config, **kwargs)
        if provider_name == "newsdata":
            return NewsDataProvider(str(self.config.get("newsdata_api_key") or ""), **kwargs)
        raise ValueError(f"Unsupported news provider: {provider_name}")

    def _consume_budget(self, provider_name: str) -> bool:
        budget = get_budget(self.full_config.get("_vendor_budget_id"))
        if budget is None:
            return True
        if not budget.can_call(provider_name):
            budget.record_blocked(provider_name, "get_news", ErrorCode.VENDOR_BUDGET_EXCEEDED)
            return False
        budget.record_call(provider_name, "get_news")
        return True

    def _record_attempt(self, provider_name: str, status: str) -> None:
        recorder = get_attempt_recorder(self.full_config.get("_vendor_attempt_recorder_id"))
        if recorder is not None:
            recorder.record("get_news", provider_name, status)


def format_news_for_prompt(context: dict[str, Any]) -> str:
    if isinstance(context, dict):
        articles = context.get("decision_company_news") or context.get("prompt_articles") or []
    else:
        articles = []
    if not isinstance(articles, list) or not articles:
        ticker = context.get("ticker") if isinstance(context, dict) else "ticker"
        return (
            f"No company-specific news passed the strict decision filter for {ticker}. "
            "Broad market context is available only as background and should not be used as direct company catalyst evidence."
        )

    lines = [
        f"## Company News Used for AI Decision: {context.get('ticker')}",
        "",
        "Use only these company-specific articles as decision news.",
        "Do not treat market context or excluded news as company-specific evidence.",
        "Do not invent missing events.",
        "",
    ]
    for index, article in enumerate(articles, start=1):
        if not isinstance(article, dict):
            continue
        title = str(article.get("title") or "").strip()[:160]
        summary = str(article.get("summary") or "").strip()
        if len(summary) > 280:
            summary = summary[:277].rstrip() + "..."

        lines.append(f"### NEWS #{index}: {title}")
        lines.append(f"Source: {article.get('source') or 'Unknown'}")
        lines.append(f"Provider: {article.get('provider')}")
        lines.append(f"Published: {article.get('published_at') or 'Unknown'}")
        lines.append(f"Relevance: {article.get('relevance_score')}")
        lines.append(f"Category: {article.get('relevance_category') or 'Unknown'}")
        lines.append(f"Sentiment: {article.get('sentiment_label') or 'unavailable'}")
        if summary:
            lines.append(f"Summary: {summary}")
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
                entities=[
                    NewsEntity(
                        symbol=profile["ticker"], name=profile["company_name"], match_score=50
                    )
                ],
            )
        except ValueError:
            continue
        articles.append(score_news_article(article, profile))
    return articles


def _average_sentiment(articles: list[NormalizedNewsArticle]) -> str | None:
    scores = [
        article.sentiment_score for article in articles if article.sentiment_score is not None
    ]
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
        end = datetime.strptime(as_of_date[:10], "%Y-%m-%d").replace(
            tzinfo=timezone.utc
        ) + timedelta(days=1)
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
            _PERSISTENT_CACHE = SQLiteTTLCache(
                db_path=db_path, ttl_seconds=ttl_seconds, max_entries=max_entries
            )
            _PERSISTENT_CACHE_CONFIG = cache_config
    return _PERSISTENT_CACHE
