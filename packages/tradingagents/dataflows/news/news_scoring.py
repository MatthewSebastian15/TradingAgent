from __future__ import annotations

import hashlib
import re
from typing import Any
from urllib.parse import urlsplit

from .news_models import NormalizedNewsArticle
from .news_noise_filter import route_news_bucket
from .news_relevance import ALL_MARKET_MOVING_KEYWORDS, score_news_relevance

PROVIDER_TRUST_SCORE = {
    "google_news_light": 5,
    "marketaux": 4,
    "newsdata": 3,
    "yfinance": 2,
    "rss_context": 1,
}


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
    if len(candidate) < 2:
        return False
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(candidate)}(?![a-z0-9])", text))


def _domain_from_url(url: str) -> str | None:
    try:
        domain = urlsplit(str(url or "")).netloc.lower().removeprefix("www.")
    except Exception:
        return None
    return domain or None


def _dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        key = text.casefold()
        if not text or key in seen:
            continue
        seen.add(key)
        result.append(text)
    return result


def _market_keyword_in(text: str) -> bool:
    return any(keyword.lower() in text for keyword in ALL_MARKET_MOVING_KEYWORDS)


def score_news_article(
    article: NormalizedNewsArticle, ticker_profile: dict[str, Any]
) -> NormalizedNewsArticle:
    ticker = str(ticker_profile.get("ticker") or article.ticker).upper()
    short_ticker = str(ticker_profile.get("short_ticker") or ticker.removesuffix(".JK")).upper()
    company_name = str(ticker_profile.get("company_name") or "").strip()
    aliases = [
        str(alias).strip() for alias in ticker_profile.get("aliases", []) if str(alias).strip()
    ]
    subsidiaries = [
        str(alias).strip() for alias in ticker_profile.get("subsidiaries", []) if str(alias).strip()
    ]
    title = str(article.title or "").lower()
    summary = str(article.summary or "").lower()
    score = 0.0
    reasons: list[str] = []

    if not article.title or not article.url:
        article.relevance_score = 0
        article.relevance_category = "irrelevant"
        article.relevance_reasons = ["missing_title_or_url"]
        return article

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
        reasons.append("short_ticker_in_title")
    if company_name and _contains(title, company_name):
        score += 25
        reasons.append("company_name_in_title")
    elif any(_contains(title, alias) for alias in aliases):
        score += 16
        reasons.append("alias_in_title")

    if company_name and _contains(summary, company_name):
        score += 12
        reasons.append("company_name_in_summary")
    elif any(_contains(summary, alias) for alias in aliases):
        score += 8
        reasons.append("alias_in_summary")

    title_subsidiary_matches = [term for term in subsidiaries if _contains(title, term)]
    summary_subsidiary_matches = [term for term in subsidiaries if _contains(summary, term)]
    if title_subsidiary_matches:
        score += 18
        reasons.append("subsidiary_in_title")
    if summary_subsidiary_matches:
        score += 10
        reasons.append("subsidiary_in_summary")

    if _market_keyword_in(title):
        score += 20
        reasons.append("market_moving_keyword_in_title")
    if _market_keyword_in(summary):
        score += 10
        reasons.append("market_moving_keyword_in_summary")

    if article.provider == "marketaux" and article.entities:
        score += 5
        reasons.append("structured_financial_provider")

    rule_score = score_news_relevance(
        {"title": article.title, "summary": article.summary or ""},
        ticker,
        company_name,
        str(ticker_profile.get("sector") or ""),
    )
    if rule_score.get("entity_match") == "negative":
        article.relevance_score = 0
        article.relevance_category = "irrelevant"
        article.relevance_reasons = _dedupe([*reasons, "negative_entity_match"])
        article.entity_match = "negative"
        article.matched_terms = list(rule_score.get("matched_terms") or [])
        article.bucket = "discard"
        article.decision_filter_reason = "negative_entity_match"
        return article

    entity_match = str(rule_score.get("entity_match") or article.entity_match or "none")
    matched_terms = _dedupe(
        [
            *(str(term) for term in (rule_score.get("matched_terms") or [])),
            *title_subsidiary_matches,
            *summary_subsidiary_matches,
        ]
    )
    if rule_score.get("relevance_score"):
        score = max(score, float(rule_score.get("relevance_score") or 0))
        reasons.extend(str(reason) for reason in rule_score.get("reasons") or [])

    if entity_match == "subsidiary" or title_subsidiary_matches or summary_subsidiary_matches:
        category = "subsidiary_related"
    elif entity_match in {"company_exact", "provider_entity"} and score >= 50:
        category = "company_specific"
    elif score >= 45 and article.market_context_only:
        category = "macro_related"
    elif score >= 45:
        category = "sector_related"
    elif score >= 25:
        category = "macro_related"
    elif score >= 10:
        category = "market_noise"
    else:
        category = "irrelevant"

    if article.provider == "rss_context" and article.market_context_only:
        score = min(score, 45)
        reasons.append("rss_general_market_context_capped")
    elif article.market_context_only:
        score = min(score, 45)
        reasons.append("market_context_only")

    if not article.source_domain:
        article.source_domain = _domain_from_url(article.url)
    article.summary = _truncate(article.summary, 800)
    article.provider = str(article.provider or "").strip().lower()
    article.relevance_score = min(score, 100)
    article.relevance_category = category
    article.relevance_reasons = _dedupe(reasons)
    article.entity_match = entity_match
    article.matched_terms = matched_terms
    article.bucket = article.bucket or route_news_bucket(article.model_dump(mode="json"))
    article.content_hash = article.content_hash or content_hash(article.title, article.url)
    article.provider_trust_score = PROVIDER_TRUST_SCORE.get(article.provider, 0)
    article.final_rank_score = float(article.relevance_score or 0) + float(
        article.provider_trust_score or 0
    )
    return article


def _truncate(value: str | None, max_length: int) -> str | None:
    if value is None:
        return None
    text = str(value)
    if len(text) <= max_length:
        return text
    return text[: max(0, max_length - 3)].rstrip() + "..."
