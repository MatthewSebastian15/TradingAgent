from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qs, urlsplit

from .config import get_config
from .news_deduplication import deduplicate_news_articles
from .news_models import NormalizedNewsArticle
from .news_provider_base import BaseNewsProvider, ProviderFetchResult
from .news_scoring import score_news_article
from .news_ticker_aliases import resolve_news_ticker


class GoogleNewsLightProvider(BaseNewsProvider):
    provider_name = "google_news_light"
    base_url = "https://www.searchapi.io/api/v1/search"

    def fetch_news(
        self,
        ticker_profile: dict[str, Any],
        *,
        as_of_date: str | None = None,
        window_days: int = 30,
        limit: int = 10,
        include_raw: bool = False,
    ) -> ProviderFetchResult:
        if not self.api_key:
            return ProviderFetchResult(provider=self.provider_name, status="missing_api_key")

        end = _as_of_datetime(as_of_date)
        params = {
            "api_key": self.api_key,
            "engine": "google_news_light",
            "q": _build_query(ticker_profile),
            "gl": "id" if ticker_profile.get("country") == "id" else "us",
            "hl": "id" if ticker_profile.get("country") == "id" else "en",
            "time_period": _time_period(window_days),
            "sort_by": "most_recent",
            "filter": "1",
        }
        payload, attempt = self._request_json(
            params, strategy="company_query", include_raw=include_raw
        )
        status = str(attempt.get("status") or "unknown_error")
        articles = (
            self._normalize_response(
                payload, ticker_profile, as_of_datetime=end, include_raw=include_raw
            )
            if payload is not None
            else []
        )
        return ProviderFetchResult(
            provider=self.provider_name,
            status=status if articles else ("unavailable" if status == "success" else status),
            articles=deduplicate_news_articles(articles)[: max(1, int(limit))],
            attempts=[attempt],
        )

    def _normalize_response(
        self,
        payload: Any,
        ticker_profile: dict[str, Any],
        *,
        as_of_datetime: datetime,
        include_raw: bool,
    ) -> list[NormalizedNewsArticle]:
        if not isinstance(payload, dict):
            return []

        raw_items = []
        for key in ("organic_results", "top_stories", "news_results"):
            value = payload.get(key)
            if isinstance(value, list):
                raw_items.extend((key, item) for item in value if isinstance(item, dict))

        articles: list[NormalizedNewsArticle] = []
        for bucket, item in raw_items:
            title = str(item.get("title") or "").strip()
            url = _unwrap_google_url(str(item.get("link") or item.get("url") or "").strip())
            if not title or not url:
                continue
            try:
                article = NormalizedNewsArticle(
                    provider=self.provider_name,
                    provider_article_id=_article_id(item),
                    ticker=ticker_profile["ticker"],
                    company_name=ticker_profile["company_name"],
                    title=title,
                    summary=item.get("snippet") or item.get("description"),
                    url=url,
                    image_url=item.get("thumbnail") or item.get("image"),
                    source=item.get("source"),
                    language="id" if ticker_profile.get("country") == "id" else "en",
                    country=ticker_profile.get("country") or "us",
                    published_at=_parse_relative_date(item.get("date"), as_of_datetime),
                    raw_payload=item if include_raw else None,
                    query_strategy=bucket,
                )
            except ValueError:
                continue
            articles.append(score_news_article(article, ticker_profile))
        return articles


def _build_query(ticker_profile: dict[str, Any]) -> str:
    aliases = [str(item).strip() for item in ticker_profile.get("aliases", []) if str(item).strip()]
    company_name = str(ticker_profile.get("company_name") or "").strip()
    short_ticker = str(
        ticker_profile.get("short_ticker") or ticker_profile.get("ticker") or ""
    ).strip()
    if ticker_profile.get("country") == "id":
        terms = list(dict.fromkeys([company_name, short_ticker, *aliases]))[:4]
        quoted = " OR ".join(f'"{term}"' for term in terms if len(term) >= 3)
        return f"({quoted}) saham"
    terms = list(dict.fromkeys([short_ticker, company_name, *aliases]))[:4]
    quoted = " OR ".join(f'"{term}"' for term in terms if len(term) >= 2)
    return f"({quoted}) stock"


def _time_period(window_days: int) -> str:
    days = max(1, int(window_days))
    if days <= 1:
        return "last_day"
    if days <= 7:
        return "last_week"
    if days <= 31:
        return "last_month"
    return "last_year"


def _as_of_datetime(value: str | None) -> datetime:
    if value:
        try:
            return datetime.strptime(value[:10], "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            ) + timedelta(days=1)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _parse_relative_date(value: Any, now: datetime) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00").replace("z", "+00:00"))
    except ValueError:
        pass
    text = raw.lower()
    match = re.match(
        r"^(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago$",
        text,
    )
    if match:
        amount = int(match.group(1))
        unit = match.group(2)
        if unit.startswith("minute"):
            return now - timedelta(minutes=amount)
        if unit.startswith("hour"):
            return now - timedelta(hours=amount)
        if unit.startswith("day"):
            return now - timedelta(days=amount)
        if unit.startswith("week"):
            return now - timedelta(weeks=amount)
        if unit.startswith("month"):
            return now - timedelta(days=30 * amount)
        if unit.startswith("year"):
            return now - timedelta(days=365 * amount)
    for fmt in ("%Y-%m-%d", "%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _unwrap_google_url(url: str) -> str:
    parts = urlsplit(url)
    if parts.netloc.lower().endswith("google.com") and parts.path == "/url":
        target = parse_qs(parts.query).get("q")
        if target and target[0]:
            return target[0]
    return url


def _article_id(item: dict[str, Any]) -> str | None:
    if item.get("position") is None and not item.get("link"):
        return None
    return f"{item.get('position', '')}:{item.get('link') or item.get('url')}"


def get_news(ticker: str, start_date: str, end_date: str) -> str:
    config = get_config().get("news", {})
    provider = GoogleNewsLightProvider(
        str(config.get("google_news_light_api_key") or ""),
        timeout_seconds=int(config.get("vendor_timeout_seconds", 15)),
        max_retries=int(config.get("vendor_max_retries", 2)),
    )
    profile = resolve_news_ticker(ticker)
    window_days = max(
        1,
        (datetime.strptime(end_date, "%Y-%m-%d") - datetime.strptime(start_date, "%Y-%m-%d")).days,
    )
    result = provider.fetch_news(
        profile,
        as_of_date=end_date,
        window_days=window_days,
        limit=int(config.get("max_articles_per_provider", 10)),
    )
    return _format_provider_result(result, ticker, start_date, end_date)


def _format_provider_result(
    result: ProviderFetchResult, ticker: str, start_date: str, end_date: str
) -> str:
    if not result.articles:
        return (
            f"No news found for {ticker} from Google News Light between {start_date} and {end_date}"
        )
    lines = [f"## Google News Light News for {ticker}, from {start_date} to {end_date}:", ""]
    for article in result.articles:
        lines.append(f"### {article.title} (source: {article.source or 'Unknown'})")
        if article.summary:
            lines.append(article.summary)
        lines.append(f"Provider: google_news_light | Relevance: {article.relevance_score:.0f}")
        if article.url:
            lines.append(f"Link: {article.url}")
        lines.append("")
    return "\n".join(lines).strip()
