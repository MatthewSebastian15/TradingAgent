from __future__ import annotations

from datetime import datetime
from typing import Any

from .config import get_config
from .errors import ErrorCode
from .news_deduplication import deduplicate_news_articles
from .news_models import NewsEntity, NormalizedNewsArticle
from .news_provider_base import BaseNewsProvider, ProviderFetchResult
from .news_scoring import map_sentiment_label, score_news_article
from .news_ticker_aliases import resolve_news_ticker


class NewsDataProvider(BaseNewsProvider):
    provider_name = "newsdata"
    base_url = "https://newsdata.io/api/1/market"

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
        if not self.api_key:
            return ProviderFetchResult(provider=self.provider_name, status="missing_api_key")

        common = {
            "apikey": self.api_key,
            "language": "id,en",
            "removeduplicate": "1",
            "size": max(1, int(limit)),
        }
        if ticker_profile.get("country"):
            common["country"] = ticker_profile["country"]

        query_attempts = [
            ("symbol", {**common, "symbol": ticker_profile["short_ticker"]}),
            ("company_name_in_title", {**common, "qInTitle": ticker_profile["company_name"]}),
            ("alias_query", {**common, "q": build_newsdata_alias_query(ticker_profile["aliases"])}),
        ]
        attempts: list[dict[str, Any]] = []
        articles: list[NormalizedNewsArticle] = []
        status = "unavailable"

        for strategy, params in query_attempts:
            payload, attempt = self._request_json(params, strategy=strategy, include_raw=include_raw)
            attempts.append(attempt)
            status = str(attempt.get("status") or "unknown_error")
            if payload is not None:
                articles.extend(
                    self._normalize_response(payload, ticker_profile, strategy=strategy, include_raw=include_raw)
                )
                if articles:
                    status = "success"
                    break
            if status in {ErrorCode.VENDOR_AUTH_ERROR, ErrorCode.VENDOR_QUOTA_ERROR}:
                break

        return ProviderFetchResult(
            provider=self.provider_name,
            status=status if articles else ("unavailable" if status == "success" else status),
            articles=deduplicate_news_articles(articles),
            attempts=attempts,
        )

    def _normalize_response(
        self,
        payload: Any,
        ticker_profile: dict[str, Any],
        *,
        strategy: str,
        include_raw: bool,
    ) -> list[NormalizedNewsArticle]:
        if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
            return []

        articles: list[NormalizedNewsArticle] = []
        for item in payload["results"]:
            if (
                not isinstance(item, dict)
                or not str(item.get("title") or "").strip()
                or not str(item.get("link") or "").strip()
            ):
                continue
            sentiment_score = _float_or_none(item.get("sentiment_stats") or item.get("sentiment_score"))
            sentiment_label = str(item.get("sentiment") or "").strip().lower() or map_sentiment_label(sentiment_score)
            entities = [
                NewsEntity(symbol=symbol, name=ticker_profile["company_name"])
                for symbol in item.get("symbol", [])
                if isinstance(symbol, str)
            ]
            try:
                article = NormalizedNewsArticle(
                    provider=self.provider_name,
                    provider_article_id=item.get("article_id"),
                    ticker=ticker_profile["ticker"],
                    company_name=ticker_profile["company_name"],
                    title=str(item["title"]).strip(),
                    summary=item.get("description"),
                    url=str(item["link"]).strip(),
                    image_url=item.get("image_url"),
                    source=item.get("source_name") or item.get("source_id"),
                    source_domain=item.get("source_url"),
                    author=", ".join(item.get("creator", []))
                    if isinstance(item.get("creator"), list)
                    else item.get("creator"),
                    language=item.get("language"),
                    country=_first_string(item.get("country")),
                    published_at=item.get("pubDate") or item.get("pubDateTZ"),
                    entities=entities,
                    sentiment_score=sentiment_score,
                    sentiment_label=sentiment_label,
                    raw_payload=item if include_raw else None,
                    query_strategy=strategy,
                )
            except ValueError:
                continue
            articles.append(score_news_article(article, ticker_profile))
        return articles


def build_newsdata_alias_query(aliases: list[str]) -> str:
    values = [str(alias).strip() for alias in aliases if len(str(alias).strip()) >= 3]
    return " OR ".join(f'"{alias}"' for alias in list(dict.fromkeys(values))[:5])


def _float_or_none(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _first_string(value: Any) -> str | None:
    if isinstance(value, list):
        return str(value[0]) if value else None
    return str(value) if value else None


def get_news(ticker: str, start_date: str, end_date: str) -> str:
    config = get_config().get("news", {})
    provider = NewsDataProvider(
        str(config.get("newsdata_api_key") or ""),
        timeout_seconds=int(config.get("vendor_timeout_seconds", 15)),
        max_retries=int(config.get("vendor_max_retries", 2)),
    )
    profile = resolve_news_ticker(ticker)
    window_days = max(1, (datetime.strptime(end_date, "%Y-%m-%d") - datetime.strptime(start_date, "%Y-%m-%d")).days)
    result = provider.fetch_news(
        profile, as_of_date=end_date, window_days=window_days, limit=int(config.get("max_articles_per_provider", 10))
    )
    return _format_provider_result(result, ticker, start_date, end_date)


def _format_provider_result(result: ProviderFetchResult, ticker: str, start_date: str, end_date: str) -> str:
    if not result.articles:
        return f"No news found for {ticker} from NewsData between {start_date} and {end_date}"
    lines = [f"## NewsData.io News for {ticker}, from {start_date} to {end_date}:", ""]
    for article in result.articles:
        lines.append(f"### {article.title} (source: {article.source or 'Unknown'})")
        if article.summary:
            lines.append(article.summary)
        lines.append(f"Provider: newsdata | Relevance: {article.relevance_score:.0f}")
        if article.url:
            lines.append(f"Link: {article.url}")
        lines.append("")
    return "\n".join(lines).strip()
