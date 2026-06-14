from __future__ import annotations

import logging
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import requests

try:
    import feedparser
except Exception:  # pragma: no cover - dependency may be absent before install
    feedparser = None  # type: ignore[assignment]

from .config import get_config
from .news_models import NewsEntity, NormalizedNewsArticle
from .news_provider_base import BaseNewsProvider, ProviderFetchResult, sanitize_error
from .news_relevance import is_relevant_news
from .news_scoring import content_hash
from .rss_news_config import DEFAULT_RSS_FEEDS, GOOGLE_NEWS_FALLBACK_RSS_FEEDS, RSSFeedConfig

logger = logging.getLogger(__name__)


class RSSContextProvider(BaseNewsProvider):
    provider_name = "rss_context"

    def __init__(
        self,
        api_key: str = "",
        *,
        timeout_seconds: int = 15,
        max_retries: int = 2,
        config: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(api_key, timeout_seconds=timeout_seconds, max_retries=max_retries)
        self.config = dict(config or {})

    def fetch_news(
        self,
        ticker_profile: dict[str, Any],
        *,
        as_of_date: str | None = None,
        window_days: int = 30,
        limit: int = 10,
        include_raw: bool = False,
    ) -> ProviderFetchResult:
        del as_of_date, window_days
        config = self.config or dict(get_config().get("news") or {})
        if not bool(config.get("rss_enabled", True)):
            return ProviderFetchResult(provider=self.provider_name, status="disabled")
        if feedparser is None:
            return ProviderFetchResult(provider=self.provider_name, status="unavailable", last_error="feedparser_missing")

        attempts: list[dict[str, Any]] = []
        articles: list[NormalizedNewsArticle] = []
        feed_limit = max(1, int(config.get("rss_max_items_per_feed", 20)))

        for feed in _select_feeds(config):
            status, parsed, attempt = self._fetch_feed(feed, config)
            attempts.append(attempt)
            if status != "success" or parsed is None:
                continue
            articles.extend(
                _normalize_feed_entries(
                    parsed,
                    feed,
                    ticker_profile,
                    limit=feed_limit,
                    include_raw=include_raw,
                )
            )

        if articles:
            return ProviderFetchResult(
                provider=self.provider_name,
                status="success",
                articles=articles[: max(1, int(limit))],
                attempts=attempts,
            )

        statuses = {str(attempt.get("status") or "") for attempt in attempts}
        status = _overall_status(statuses)
        return ProviderFetchResult(provider=self.provider_name, status=status, articles=[], attempts=attempts)

    def _fetch_feed(
        self,
        feed: RSSFeedConfig,
        config: dict[str, Any],
    ) -> tuple[str, Any | None, dict[str, Any]]:
        headers = {"User-Agent": str(config.get("rss_user_agent") or "TradingAgent/0.1 RSS Reader")}
        attempt: dict[str, Any] = {"strategy": feed.id, "feed": feed.name, "url": feed.url}
        try:
            response = requests.get(feed.url, headers=headers, timeout=(5, self.timeout_seconds))
            attempt["status_code"] = response.status_code
            if response.status_code in {401, 403}:
                attempt["status"] = "auth_or_forbidden"
                return "auth_or_forbidden", None, attempt
            if response.status_code >= 400:
                attempt["status"] = "unavailable"
                return "unavailable", None, attempt
            parsed = feedparser.parse(response.content)
            if getattr(parsed, "bozo", False):
                attempt["status"] = "parse_error"
                attempt["error"] = sanitize_error(getattr(parsed, "bozo_exception", "parse_error"))
                return "parse_error", None, attempt
            attempt["status"] = "success"
            return "success", parsed, attempt
        except requests.Timeout:
            attempt["status"] = "timeout"
            return "timeout", None, attempt
        except Exception as exc:
            logger.info("rss_context feed failed feed=%s error=%s", feed.id, exc)
            attempt["status"] = "unavailable"
            attempt["error"] = sanitize_error(exc)
            return "unavailable", None, attempt


def _select_feeds(config: dict[str, Any]) -> list[RSSFeedConfig]:
    feeds = list(DEFAULT_RSS_FEEDS)
    if bool(config.get("rss_google_news_fallback_enabled", True)):
        feeds.extend(GOOGLE_NEWS_FALLBACK_RSS_FEEDS)

    enabled_ids = set(_string_list(config.get("rss_enabled_feed_ids")))
    disabled_ids = set(_string_list(config.get("rss_disabled_feed_ids") or "theblock-trial"))
    include_trial = bool(config.get("rss_include_trial_feeds", False))
    selected = []
    for feed in feeds:
        if enabled_ids and feed.id not in enabled_ids:
            continue
        if feed.id in disabled_ids:
            continue
        if not feed.enabled and not include_trial:
            continue
        selected.append(feed)
    return selected[: max(1, int(config.get("rss_max_feeds", 10)))]


def _normalize_feed_entries(
    parsed: Any,
    feed: RSSFeedConfig,
    ticker_profile: dict[str, Any],
    *,
    limit: int,
    include_raw: bool,
) -> list[NormalizedNewsArticle]:
    entries = list(getattr(parsed, "entries", []) or [])[: max(1, int(limit))]
    articles: list[NormalizedNewsArticle] = []
    for entry in entries:
        item = dict(entry) if isinstance(entry, dict) else {}
        title = str(item.get("title") or "").strip()
        url = str(item.get("link") or item.get("id") or "").strip()
        if not title or not url:
            continue
        summary = _strip_html(str(item.get("summary") or item.get("description") or ""))
        company_match = is_relevant_news(
            {
                "title": title,
                "summary": summary,
                "url": url,
                "entities": item.get("tags") or item.get("symbols") or [],
            },
            str(ticker_profile.get("ticker") or ""),
            ticker_profile.get("company_name"),
            ticker_profile.get("aliases"),
        )
        relevance_score = 65 if company_match else 45
        relevance_category = "company_match" if company_match else "market_context"
        market_context_only = not company_match
        bucket = "full_news" if company_match else "macro_context"
        try:
            article = NormalizedNewsArticle(
                provider="rss_context",
                provider_article_id=str(item.get("id") or url),
                ticker=str(ticker_profile.get("ticker") or ""),
                company_name=ticker_profile.get("company_name"),
                title=title,
                summary=summary or None,
                url=url,
                source=_entry_source(item, feed),
                published_at=_parse_rss_date(item.get("published") or item.get("updated")),
                entities=[
                    NewsEntity(symbol=ticker_profile.get("ticker"), name=ticker_profile.get("company_name"))
                ]
                if company_match
                else [],
                relevance_score=relevance_score,
                relevance_category=relevance_category,
                relevance_reasons=["rss_company_match"] if company_match else ["rss_market_context"],
                entity_match="company_exact" if company_match else "none",
                matched_terms=[str(ticker_profile.get("ticker") or "")] if company_match else [],
                bucket=bucket,
                content_hash=content_hash(title, url),
                raw_payload=item if include_raw else None,
                query_strategy=feed.id,
                market_context_only=market_context_only,
            )
        except ValueError:
            continue
        articles.append(article)
    return articles


def _overall_status(statuses: set[str]) -> str:
    if not statuses:
        return "unavailable"
    if statuses == {"auth_or_forbidden"}:
        return "auth_or_forbidden"
    if statuses == {"timeout"}:
        return "timeout"
    if statuses == {"parse_error"}:
        return "parse_error"
    return "unavailable"


def _parse_rss_date(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = parsedate_to_datetime(text)
    except (TypeError, ValueError):
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _strip_html(value: str) -> str:
    text = str(value or "").replace("<br>", " ").replace("<br/>", " ").replace("<br />", " ")
    chunks: list[str] = []
    in_tag = False
    for char in text:
        if char == "<":
            in_tag = True
            continue
        if char == ">":
            in_tag = False
            continue
        if not in_tag:
            chunks.append(char)
    return " ".join("".join(chunks).split())


def _entry_source(item: dict[str, Any], feed: RSSFeedConfig) -> str:
    source = item.get("source")
    if isinstance(source, dict):
        value = str(source.get("title") or "").strip()
        if value:
            return value
    value = str(item.get("source") or "").strip()
    return value or feed.source


def _string_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    if isinstance(value, list | tuple | set):
        return [str(item).strip() for item in value if str(item).strip()]
    return []
