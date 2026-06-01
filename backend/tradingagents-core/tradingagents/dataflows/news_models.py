from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class NewsEntity(BaseModel):
    symbol: str | None = None
    name: str | None = None
    exchange: str | None = None
    country: str | None = None
    entity_type: str | None = None
    industry: str | None = None
    match_score: float | None = None
    sentiment_score: float | None = None


class NormalizedNewsArticle(BaseModel):
    provider: str
    provider_article_id: str | None = None
    ticker: str
    company_name: str | None = None
    title: str
    summary: str | None = None
    url: str
    image_url: str | None = None
    source: str | None = None
    source_domain: str | None = None
    author: str | None = None
    language: str | None = None
    country: str | None = None
    published_at: datetime | None = None
    entities: list[NewsEntity] = Field(default_factory=list)
    sentiment_label: str | None = None
    sentiment_score: float | None = None
    relevance_score: float = 0
    relevance_reasons: list[str] = Field(default_factory=list)
    content_hash: str | None = None
    raw_payload: dict[str, Any] | None = None
    query_strategy: str | None = None
    market_context_only: bool = False


def article_to_dict(article: NormalizedNewsArticle, *, include_raw: bool = False) -> dict[str, Any]:
    payload = article.model_dump(mode="json")
    if not include_raw:
        payload.pop("raw_payload", None)
    return payload
