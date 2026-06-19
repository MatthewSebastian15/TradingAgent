from __future__ import annotations

import hashlib
import re
from typing import Any

from .news_models import NormalizedNewsArticle
from .news_noise_filter import route_news_bucket
from .news_relevance import score_news_relevance


def map_sentiment_label(score: float | None) -> str | None:
    if score is None:
        return None
    if score >= 0.15:
        return "positive"
    if score <= -0.15:
        return "negative"
    return "neutral"


def content_hash(title: str, url: str) -> str:
    value = f"{title.strip().lower()}::{url.strip().lower()}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _contains(text: str, value: str) -> bool:
    candidate = str(value or "").strip().lower()
    if len(candidate) < 3:
        return False
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(candidate)}(?![a-z0-9])", text))


def score_news_article(
    article: NormalizedNewsArticle, ticker_profile: dict[str, Any]
) -> NormalizedNewsArticle:
    ticker = str(ticker_profile.get("ticker") or article.ticker).upper()
    short_ticker = str(ticker_profile.get("short_ticker") or ticker.removesuffix(".JK")).upper()
    company_name = str(ticker_profile.get("company_name") or "").strip()
    aliases = [
        str(alias).strip() for alias in ticker_profile.get("aliases", []) if str(alias).strip()
    ]
    title = article.title.lower()
    summary = str(article.summary or "").lower()
    score = 0.0
    reasons: list[str] = []

    entity_symbols = {str(entity.symbol or "").upper() for entity in article.entities}
    if ticker in entity_symbols or short_ticker in entity_symbols:
        score += 45
        reasons.append("exact_entity_symbol")

    matching_entities = [
        entity
        for entity in article.entities
        if str(entity.symbol or "").upper() in {ticker, short_ticker}
        or (company_name and _contains(str(entity.name or "").lower(), company_name))
    ]
    entity_match_scores = [
        entity.match_score for entity in matching_entities if entity.match_score is not None
    ]
    if entity_match_scores:
        match_score = max(entity_match_scores)
        score += min(20.0, max(0.0, float(match_score)) / 5)
        reasons.append("provider_entity_match")

    if _contains(title, short_ticker):
        score += 25
        reasons.append("ticker_in_title")
    if company_name and _contains(title, company_name):
        score += 25
        reasons.append("company_name_in_title")
    elif any(_contains(title, alias) for alias in aliases):
        score += 16
        reasons.append("company_alias_in_title")

    if company_name and _contains(summary, company_name):
        score += 12
        reasons.append("company_name_in_summary")
    elif any(_contains(summary, alias) for alias in aliases):
        score += 8
        reasons.append("company_alias_in_summary")

    if article.provider == "marketaux" and article.entities:
        score += 5
        reasons.append("financial_entity_source")
    if article.market_context_only:
        score = min(score, 45)
        reasons.append("market_context_only")

    rule_score = score_news_relevance(
        {"title": article.title, "summary": article.summary or ""},
        ticker,
        company_name,
        str(ticker_profile.get("sector") or ""),
    )
    score = max(score, float(rule_score.get("relevance_score") or 0))
    article.relevance_score = round(min(100.0, score), 2)
    article.relevance_category = str(
        rule_score.get("category") or article.relevance_category or "market_noise"
    )
    article.entity_match = str(rule_score.get("entity_match") or article.entity_match or "none")
    article.matched_terms = list(rule_score.get("matched_terms") or [])
    article.relevance_reasons = list(dict.fromkeys([*reasons, *(rule_score.get("reasons") or [])]))
    article.bucket = route_news_bucket(
        {
            "relevance_category": article.relevance_category,
            "relevance_score": article.relevance_score,
        }
    )
    article.content_hash = article.content_hash or content_hash(article.title, article.url)
    if article.sentiment_label is None:
        article.sentiment_label = map_sentiment_label(article.sentiment_score)
    return article
