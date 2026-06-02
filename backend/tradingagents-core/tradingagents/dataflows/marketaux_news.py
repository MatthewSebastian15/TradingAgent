from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from .config import get_config
from .news_deduplication import deduplicate_news_articles
from .news_models import NewsEntity, NormalizedNewsArticle
from .news_provider_base import BaseNewsProvider, ProviderFetchResult
from .news_scoring import map_sentiment_label, score_news_article
from .news_ticker_aliases import resolve_news_ticker


class MarketAuxProvider(BaseNewsProvider):
    provider_name = "marketaux"
    base_url = "https://api.marketaux.com/v1/news/all"

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
        common = {
            "api_token": self.api_key,
            "filter_entities": "true",
            "must_have_entities": "true",
            "language": "id,en",
            "published_after": (end - timedelta(days=max(1, int(window_days)))).strftime("%Y-%m-%dT%H:%M:%S"),
            "published_before": end.strftime("%Y-%m-%dT%H:%M:%S"),
            "limit": max(1, int(limit)),
        }
        if ticker_profile.get("country"):
            common["countries"] = ticker_profile["country"]

        query_attempts = [
            ("strict_symbol", {**common, "symbols": ticker_profile["ticker"]}, False),
            ("relaxed_company_search", {**common, "search": ticker_profile["company_name"]}, False),
            ("country_market_context", {**common, "entity_types": "equity,index"}, True),
        ]
        attempts: list[dict[str, Any]] = []
        articles: list[NormalizedNewsArticle] = []
        status = "unavailable"

        for strategy, params, market_context_only in query_attempts:
            payload, attempt = self._request_json(params, strategy=strategy, include_raw=include_raw)
            attempts.append(attempt)
            status = str(attempt.get("status") or "unknown_error")
            if payload is not None:
                normalized = self._normalize_response(
                    payload,
                    ticker_profile,
                    strategy=strategy,
                    market_context_only=market_context_only,
                    include_raw=include_raw,
                )
                articles.extend(normalized)
                if normalized:
                    status = "success"
                    break
            if status in {"invalid_api_key", "rate_limited"}:
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
        market_context_only: bool,
        include_raw: bool,
    ) -> list[NormalizedNewsArticle]:
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            return []

        articles: list[NormalizedNewsArticle] = []
        for item in payload["data"]:
            if (
                not isinstance(item, dict)
                or not str(item.get("title") or "").strip()
                or not str(item.get("url") or "").strip()
            ):
                continue
            entities = [_normalize_entity(entity) for entity in item.get("entities", []) if isinstance(entity, dict)]
            scores = [entity.sentiment_score for entity in entities if entity.sentiment_score is not None]
            sentiment_score = sum(scores) / len(scores) if scores else None
            try:
                article = NormalizedNewsArticle(
                    provider=self.provider_name,
                    provider_article_id=item.get("uuid"),
                    ticker=ticker_profile["ticker"],
                    company_name=ticker_profile["company_name"],
                    title=str(item["title"]).strip(),
                    summary=item.get("description") or item.get("snippet"),
                    url=str(item["url"]).strip(),
                    image_url=item.get("image_url"),
                    source=item.get("source"),
                    source_domain=item.get("source_domain"),
                    author=item.get("author"),
                    language=item.get("language"),
                    country=item.get("country"),
                    published_at=item.get("published_at"),
                    entities=entities,
                    sentiment_score=sentiment_score,
                    sentiment_label=map_sentiment_label(sentiment_score),
                    raw_payload=item if include_raw else None,
                    query_strategy=strategy,
                    market_context_only=market_context_only,
                )
            except ValueError:
                continue
            articles.append(score_news_article(article, ticker_profile))
        return articles


def _normalize_entity(entity: dict[str, Any]) -> NewsEntity:
    return NewsEntity(
        symbol=entity.get("symbol"),
        name=entity.get("name"),
        exchange=entity.get("exchange"),
        country=entity.get("country"),
        entity_type=entity.get("type"),
        industry=entity.get("industry"),
        match_score=entity.get("match_score"),
        sentiment_score=entity.get("sentiment_score"),
    )


def _as_of_datetime(value: str | None) -> datetime:
    if value:
        try:
            return datetime.strptime(value[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def get_news(ticker: str, start_date: str, end_date: str) -> str:
    config = get_config().get("news", {})
    provider = MarketAuxProvider(
        str(config.get("marketaux_api_key") or ""),
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
        return f"No news found for {ticker} from MarketAux between {start_date} and {end_date}"
    lines = [f"## MarketAux News for {ticker}, from {start_date} to {end_date}:", ""]
    for article in result.articles:
        lines.append(f"### {article.title} (source: {article.source or 'Unknown'})")
        if article.summary:
            lines.append(article.summary)
        lines.append(f"Provider: marketaux | Relevance: {article.relevance_score:.0f}")
        if article.url:
            lines.append(f"Link: {article.url}")
        lines.append("")
    return "\n".join(lines).strip()
