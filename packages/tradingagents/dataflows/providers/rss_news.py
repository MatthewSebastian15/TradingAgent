from __future__ import annotations

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import requests

try:
    import feedparser
except Exception:  # pragma: no cover - dependency may be absent before install
    feedparser = None  # type: ignore[assignment]

from tradingagents.dataflows.news.news_models import NewsEntity, NormalizedNewsArticle
from tradingagents.dataflows.news.news_provider_base import (
    BaseNewsProvider,
    ProviderFetchResult,
    sanitize_error,
)
from tradingagents.dataflows.news.news_query_builder import build_ticker_news_queries
from tradingagents.dataflows.news.news_relevance import is_relevant_news
from tradingagents.dataflows.news.news_scoring import content_hash, score_news_article

from .config import get_config
from .rss_news_config import (
    DEFAULT_RSS_FEEDS,
    GOOGLE_NEWS_FALLBACK_RSS_FEEDS,
    RSSFeedConfig,
    google_news_rss_url,
)

logger = logging.getLogger(__name__)

try:
    from services.news_provider_budget import is_provider_available as _is_feed_available
    from services.news_provider_budget import mark_provider_failure as _mark_feed_failure
    from services.news_provider_budget import mark_provider_success as _mark_feed_success
except Exception:  # pragma: no cover - package can run without backend service path

    def _is_feed_available(_feed_id: str) -> bool:
        return True

    def _mark_feed_failure(
        _feed_id: str, _error: str, *, cooldown_seconds: int | None = None
    ) -> None:
        return None

    def _mark_feed_success(_feed_id: str) -> None:
        return None


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
            return ProviderFetchResult(
                provider=self.provider_name, status="unavailable", last_error="feedparser_missing"
            )

        attempts: list[dict[str, Any]] = []
        articles: list[NormalizedNewsArticle] = []
        feed_limit = max(1, int(config.get("rss_max_items_per_feed", 20)))

        feeds = _select_feeds(config, ticker_profile)
        if not feeds:
            return ProviderFetchResult(provider=self.provider_name, status="disabled")

        max_workers = min(max(1, int(config.get("rss_fetch_workers", 8))), len(feeds))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(self._fetch_feed, feed, config): feed for feed in feeds}
            for future in as_completed(futures):
                feed = futures[future]
                try:
                    status, parsed, attempt = future.result()
                except Exception as exc:  # noqa: BLE001
                    status = "unavailable"
                    parsed = None
                    attempt = {
                        "strategy": feed.id,
                        "feed": feed.name,
                        "url": feed.url,
                        "status": status,
                        "error": sanitize_error(exc),
                    }
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
        return ProviderFetchResult(
            provider=self.provider_name, status=status, articles=[], attempts=attempts
        )

    def _fetch_feed(
        self,
        feed: RSSFeedConfig,
        config: dict[str, Any],
    ) -> tuple[str, Any | None, dict[str, Any]]:
        if not _is_feed_available(feed.id):
            attempt = {
                "strategy": feed.id,
                "feed": feed.name,
                "url": feed.url,
                "status": "skipped_cooldown",
            }
            return "skipped_cooldown", None, attempt

        headers = {"User-Agent": str(config.get("rss_user_agent") or "TradingAgent/0.1 RSS Reader")}
        max_retries = max(0, int(config.get("vendor_max_retries", 1)))
        retry_delays = [0.5, 1.5]
        failure_cooldown = int(config.get("rss_feed_failure_cooldown_seconds", 600))
        attempt: dict[str, Any] = {"strategy": feed.id, "feed": feed.name, "url": feed.url}

        def _done(status: str, parsed: Any | None) -> tuple[str, Any | None, dict[str, Any]]:
            if status == "success":
                _mark_feed_success(feed.id)
            else:
                _mark_feed_failure(feed.id, status, cooldown_seconds=failure_cooldown)
            return status, parsed, attempt

        for retry in range(max_retries + 1):
            try:
                response = requests.get(
                    feed.url, headers=headers, timeout=(5, self.timeout_seconds)
                )
                attempt["status_code"] = response.status_code
                if response.status_code in {401, 403}:
                    attempt["status"] = "auth_or_forbidden"
                    return _done("auth_or_forbidden", None)
                if response.status_code >= 500:
                    attempt["status"] = "unavailable"
                    if retry < max_retries:
                        time.sleep(retry_delays[min(retry, len(retry_delays) - 1)])
                        continue
                    return _done("unavailable", None)
                if response.status_code >= 400:
                    attempt["status"] = "unavailable"
                    return _done("unavailable", None)
                parsed = feedparser.parse(response.content)
                if getattr(parsed, "bozo", False):
                    attempt["status"] = "parse_error"
                    attempt["error"] = sanitize_error(
                        getattr(parsed, "bozo_exception", "parse_error")
                    )
                    return _done("parse_error", None)
                attempt["status"] = "success"
                return _done("success", parsed)
            except requests.Timeout:
                attempt["status"] = "timeout"
                if retry < max_retries:
                    time.sleep(retry_delays[min(retry, len(retry_delays) - 1)])
                    continue
                return _done("timeout", None)
            except Exception as exc:
                logger.info("rss_context feed failed feed=%s error=%s", feed.id, exc)
                attempt["status"] = "unavailable"
                attempt["error"] = sanitize_error(exc)
                return _done("unavailable", None)
        return _done(attempt.get("status", "unavailable"), None)


def _select_feeds(
    config: dict[str, Any], ticker_profile: dict[str, Any] | None = None
) -> list[RSSFeedConfig]:
    feeds: list[RSSFeedConfig] = []
    if bool(config.get("rss_google_news_fallback_enabled", True)):
        feeds.extend(_company_google_news_feeds(ticker_profile))
    feeds.extend(DEFAULT_RSS_FEEDS)
    if bool(config.get("rss_google_news_fallback_enabled", True)):
        feeds.extend(GOOGLE_NEWS_FALLBACK_RSS_FEEDS)

    enabled_ids = set(_string_list(config.get("rss_enabled_feed_ids")))
    disabled_ids = set(_string_list(config.get("rss_disabled_feed_ids")))
    include_trial = bool(config.get("rss_include_trial_feeds", True))
    selected = []
    for feed in feeds:
        if enabled_ids and feed.id not in enabled_ids:
            continue
        if feed.id in disabled_ids:
            continue
        if not feed.enabled and not include_trial:
            continue
        selected.append(feed)
    return selected[: max(1, int(config.get("rss_max_feeds", 50)))]


def build_company_rss_queries(ticker_profile: dict[str, Any]) -> list[str]:
    return build_ticker_news_queries(ticker_profile, max_queries=12)[:8]


def _company_google_news_feeds(ticker_profile: dict[str, Any] | None) -> list[RSSFeedConfig]:
    if not ticker_profile:
        return []

    locale = _google_news_locale(ticker_profile)
    feeds: list[RSSFeedConfig] = []
    for index, query in enumerate(build_company_rss_queries(ticker_profile), start=1):
        feeds.append(
            RSSFeedConfig(
                id=f"company-google-news-{index}",
                name=f"Company Google News {index}",
                url=google_news_rss_url(query, **locale),
                category="markets",
                region=str(
                    ticker_profile.get("region") or ticker_profile.get("country") or "global"
                ),
                source="GOOGLE NEWS",
                tier=1,
                enabled=True,
                is_google_news_fallback=True,
            )
        )
    return feeds


def _google_news_locale(ticker_profile: dict[str, Any]) -> dict[str, str]:
    country = str(ticker_profile.get("country") or ticker_profile.get("region") or "").lower()
    exchange = str(ticker_profile.get("exchange") or "").upper()
    if country == "id" or exchange == "IDX":
        return {"hl": "id-ID", "gl": "ID", "ceid": "ID:id"}
    return {"hl": "en-US", "gl": "US", "ceid": "US:en"}


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
        relevance_score, matched_terms = score_rss_article(
            {"title": title, "summary": summary},
            ticker_profile,
        )
        is_general_profile = str(ticker_profile.get("ticker") or "").upper() == "GENERAL"
        company_match = (
            not is_general_profile
            and bool(matched_terms)
            and is_relevant_news(
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
        )
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
                source_domain=_domain_from_url(url),
                category=feed.category,
                feed_id=feed.id,
                feed_tier=feed.tier,
                published_at=_parse_rss_date(item.get("published") or item.get("updated")),
                entities=[
                    NewsEntity(
                        symbol=ticker_profile.get("ticker"), name=ticker_profile.get("company_name")
                    )
                ]
                if company_match
                else [],
                relevance_score=relevance_score,
                relevance_category=relevance_category,
                relevance_reasons=["rss_company_match"]
                if company_match
                else ["rss_market_context"],
                entity_match="company_exact" if company_match else "none",
                matched_terms=matched_terms if company_match else [],
                bucket=bucket,
                content_hash=content_hash(title, url),
                raw_payload=item if include_raw else None,
                query_strategy=feed.id,
                market_context_only=market_context_only,
            )
        except ValueError:
            continue
        articles.append(score_news_article(article, ticker_profile))
    return articles


def score_rss_article(
    article: dict[str, Any], ticker_profile: dict[str, Any]
) -> tuple[float, list[str]]:
    text = f"{article.get('title', '')} {article.get('summary', '')}".lower()
    ticker = str(ticker_profile.get("ticker") or "").lower()
    short_ticker = str(ticker_profile.get("short_ticker") or ticker.split(".", 1)[0]).lower()
    company_name = str(ticker_profile.get("company_name") or "").lower()
    aliases = [str(alias).lower() for alias in ticker_profile.get("aliases", [])]
    sector = str(ticker_profile.get("sector") or "").lower()
    industry = str(ticker_profile.get("industry") or "").lower()
    exchange = str(ticker_profile.get("exchange") or "").lower()
    region = str(ticker_profile.get("region") or ticker_profile.get("country") or "").lower()

    score = 0.0
    matched_terms: list[str] = []

    if ticker and _term_in_text(text, ticker):
        score += 45
        matched_terms.append(ticker)

    if short_ticker and _term_in_text(text, short_ticker):
        score += 35
        matched_terms.append(short_ticker)

    if company_name and _term_in_text(text, company_name):
        score += 40
        matched_terms.append(company_name)

    for alias in aliases:
        if alias and _term_in_text(text, alias):
            score += 25
            matched_terms.append(alias)

    material_terms = [
        "earnings",
        "revenue",
        "profit",
        "guidance",
        "forecast",
        "shares",
        "stock",
        "acquisition",
        "merger",
        "lawsuit",
        "regulatory",
    ]
    if any(term in text for term in material_terms):
        score += 15

    if not matched_terms:
        if any(term and _term_in_text(text, term) for term in (sector, industry, exchange, region)):
            score = max(score, 55)
        elif any(
            term in text
            for term in ("market", "economy", "inflation", "rates", "sector", "industry")
        ):
            score = max(score, 45)

    return min(score, 100), list(dict.fromkeys(matched_terms))


def _term_in_text(text: str, term: str) -> bool:
    value = str(term or "").strip().lower()
    if len(value) < 2:
        return False
    if re.fullmatch(r"[a-z0-9]+", value):
        return bool(re.search(rf"(?<![a-z0-9]){re.escape(value)}(?![a-z0-9])", text))
    return value in text


def _overall_status(statuses: set[str]) -> str:
    if not statuses:
        return "unavailable"
    if "success" in statuses:
        # At least one feed fetched fine; zero matching articles is a real
        # empty result, not an outage, so don't collapse it into "unavailable".
        return "success"
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


def _domain_from_url(url: str) -> str | None:
    match = re.match(r"^https?://([^/]+)", str(url or "").strip(), flags=re.IGNORECASE)
    return match.group(1).lower() if match else None


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
