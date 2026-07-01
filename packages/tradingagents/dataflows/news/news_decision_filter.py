from __future__ import annotations

from typing import Any

from .news_models import NormalizedNewsArticle
from .news_relevance import is_relevant_news

COMPANY_NEWS_PROVIDERS = {
    "google_news_light",
    "marketaux",
    "newsdata",
    "yfinance",
}

DECISION_ALLOWED_CATEGORIES = {
    "company_specific",
    "subsidiary_related",
    "company_match",
}

DECISION_ALLOWED_BUCKETS = {
    "full_news",
}

# Excluded reasons that still guarantee a company match (the score gate runs only after the
# match + category gates pass). Safe to promote when the strict feed would otherwise be blank.
FALLBACK_DECISION_REASONS = {
    "score_below_decision_threshold",
    "rss_score_below_decision_threshold",
}

# Second-tier rescue: articles that matched the company but were excluded on category, not
# on match. The category gate runs only after has_company_match passes, so these are still
# genuine company hits — safe to surface (capped) when no score near-misses exist either.
# Never rescue no_company_match: that reintroduces random news.
WEAK_PROFILE_RESCUE_REASONS = {
    "category_not_decision_allowed",
    "rss_category_not_decision_allowed",
}
WEAK_PROFILE_RESCUE_LIMIT = 3

PROVIDER_TRUST_SCORE = {
    "google_news_light": 5,
    "marketaux": 4,
    "newsdata": 3,
    "yfinance": 2,
    "rss_context": 1,
}


def split_ai_analysis_news(
    articles: list[NormalizedNewsArticle],
    ticker_profile: dict[str, Any],
    *,
    decision_min_score: float = 70,
    rss_decision_min_score: float = 80,
    prompt_limit: int = 8,
) -> dict[str, list[NormalizedNewsArticle] | list[dict[str, Any]]]:
    decision: list[NormalizedNewsArticle] = []
    market_context: list[NormalizedNewsArticle] = []
    excluded: list[dict[str, Any]] = []

    for article in articles:
        verdict = classify_article_for_ai_decision(
            article,
            ticker_profile,
            decision_min_score=decision_min_score,
            rss_decision_min_score=rss_decision_min_score,
        )
        bucket = verdict["bucket"]
        article.decision_filter_reason = verdict["reason"]
        if bucket == "decision_company_news":
            article.bucket = article.bucket or "full_news"
            decision.append(article)
        elif bucket == "market_context_news":
            article.market_context_only = True
            market_context.append(article)
        else:
            article.bucket = "discard" if not article.bucket else article.bucket
            excluded.append({"article": article, "reason": verdict["reason"]})

    # Strict thresholds can empty the decision feed even when ticker-matched news was
    # retrieved, blanking the decision-maker news. Promote the best company-matched
    # near-misses so the section stays populated whenever relevant news exists.
    if not decision:
        promoted = [item for item in excluded if item["reason"] in FALLBACK_DECISION_REASONS]
        if promoted:
            for item in promoted:
                article = item["article"]
                article.bucket = article.bucket if article.bucket != "discard" else "full_news"
                article.market_context_only = False
                article.decision_filter_reason = "fallback_below_threshold"
                decision.append(article)
            excluded = [
                item for item in excluded if item["reason"] not in FALLBACK_DECISION_REASONS
            ]

    # Still blank and no score near-misses: surface the best company-matched articles that
    # only failed the category gate, so a weak/atypical category can't hide real company news.
    if not decision:
        candidates = sorted(
            (item for item in excluded if item["reason"] in WEAK_PROFILE_RESCUE_REASONS),
            key=lambda item: _rank_decision_article(item["article"]),
            reverse=True,
        )
        rescued = candidates[:WEAK_PROFILE_RESCUE_LIMIT]
        for item in rescued:
            article = item["article"]
            article.bucket = article.bucket if article.bucket != "discard" else "full_news"
            article.market_context_only = False
            article.decision_filter_reason = "fallback_weak_profile"
            decision.append(article)
        rescued_ids = {id(item["article"]) for item in rescued}
        excluded = [item for item in excluded if id(item["article"]) not in rescued_ids]

    decision = sorted(decision, key=_rank_decision_article, reverse=True)[
        : max(1, int(prompt_limit))
    ]
    market_context = sorted(market_context, key=_rank_context_article, reverse=True)

    return {
        "decision_company_news": decision,
        "market_context_news": market_context,
        "excluded_news": excluded,
    }


def classify_article_for_ai_decision(
    article: NormalizedNewsArticle,
    ticker_profile: dict[str, Any],
    *,
    decision_min_score: float,
    rss_decision_min_score: float,
) -> dict[str, str]:
    provider = str(article.provider or "").lower()
    category = str(article.relevance_category or "").lower()
    bucket = str(article.bucket or "").lower()
    score = float(article.relevance_score or 0)

    if not article.title or not article.url:
        return {"bucket": "excluded_news", "reason": "missing_title_or_url"}

    if article.entity_match == "negative":
        return {"bucket": "excluded_news", "reason": "negative_entity_match"}

    if bucket == "discard":
        return {"bucket": "excluded_news", "reason": "discard_bucket"}

    article_payload = article.model_dump(mode="json")
    has_company_match = is_relevant_news(
        article_payload,
        str(ticker_profile.get("ticker") or article.ticker),
        ticker_profile.get("company_name"),
        ticker_profile.get("aliases"),
    ) or article.entity_match in {"company_exact", "subsidiary", "provider_entity"}

    if provider == "rss_context":
        if article.market_context_only:
            return {"bucket": "market_context_news", "reason": "rss_market_context_only"}
        if not has_company_match:
            return {"bucket": "excluded_news", "reason": "rss_without_company_match"}
        if category not in DECISION_ALLOWED_CATEGORIES:
            return {"bucket": "excluded_news", "reason": "rss_category_not_decision_allowed"}
        if score < rss_decision_min_score:
            return {"bucket": "excluded_news", "reason": "rss_score_below_decision_threshold"}
        return {"bucket": "decision_company_news", "reason": "rss_strong_company_match"}

    if provider not in COMPANY_NEWS_PROVIDERS:
        return {"bucket": "excluded_news", "reason": "provider_not_allowed_for_decision"}

    if article.market_context_only:
        return {"bucket": "market_context_news", "reason": "market_context_only"}

    if not has_company_match:
        return {"bucket": "excluded_news", "reason": "no_company_match"}

    if category not in DECISION_ALLOWED_CATEGORIES and bucket not in DECISION_ALLOWED_BUCKETS:
        return {"bucket": "excluded_news", "reason": "category_not_decision_allowed"}

    if score < decision_min_score:
        return {"bucket": "excluded_news", "reason": "score_below_decision_threshold"}

    return {"bucket": "decision_company_news", "reason": "company_news_passed"}


def _rank_decision_article(article: NormalizedNewsArticle) -> float:
    trust = float(article.provider_trust_score or PROVIDER_TRUST_SCORE.get(article.provider, 0))
    article.final_rank_score = float(article.relevance_score or 0) + trust
    return article.final_rank_score


def _rank_context_article(article: NormalizedNewsArticle) -> float:
    return float(article.relevance_score or 0)
