"""Company-specific news relevance scoring."""

from __future__ import annotations

from typing import Any

from .news_entity_resolver import resolve_news_entities

NEWS_RELEVANCE_CATEGORIES = {
    "company_specific",
    "subsidiary_related",
    "sector_related",
    "macro_related",
    "market_noise",
    "irrelevant",
}

MARKET_MOVING_KEYWORDS = {
    "earnings",
    "laba",
    "profit",
    "revenue",
    "pendapatan",
    "dividen",
    "dividend",
    "akuisisi",
    "acquisition",
    "merger",
    "rights issue",
    "fundraising",
    "ipo",
    "stock split",
    "regulatory",
    "sanksi",
    "lawsuit",
}

MACRO_KEYWORDS = {"rupiah", "bank indonesia", "fed", "interest rate", "inflation", "commodity", "coal", "cpo", "nickel"}


def score_news_relevance(article: dict[str, Any], ticker: str, company_name: str = "", sector: str = "") -> dict[str, Any]:
    title = str(article.get("title") or "")
    body = str(article.get("summary") or article.get("description") or "")
    text = f"{title} {body}".lower()
    entity = resolve_news_entities(article, ticker, company_name)
    score = 0
    reasons: list[str] = []

    if entity["entity_match"] == "company_exact":
        score += 55
        reasons.append("company_entity_match")
    elif entity["entity_match"] == "subsidiary":
        score += 45
        reasons.append("subsidiary_entity_match")
    elif entity["entity_match"] == "negative":
        return {"relevance_score": 0, "category": "irrelevant", "reasons": ["negative_entity_term"], **entity}

    short_ticker = str(ticker or "").upper().removesuffix(".JK").lower()
    if short_ticker and short_ticker in text:
        score += 20
        reasons.append("ticker_match")
    if company_name and company_name.lower() in text:
        score += 25
        reasons.append("company_name_match")
    if sector and sector.lower() in text:
        score += 15
        reasons.append("sector_match")
    if any(keyword in text for keyword in MARKET_MOVING_KEYWORDS):
        score += 20
        reasons.append("market_moving_keyword")
    if any(keyword in text for keyword in MACRO_KEYWORDS):
        score += 10
        reasons.append("macro_keyword")

    if score >= 60 and entity["entity_match"] == "company_exact":
        category = "company_specific"
    elif score >= 50 and entity["entity_match"] == "subsidiary":
        category = "subsidiary_related"
    elif score >= 45:
        category = "sector_related"
    elif score >= 25:
        category = "macro_related"
    elif score >= 10:
        category = "market_noise"
    else:
        category = "irrelevant"

    return {"relevance_score": min(score, 100), "category": category, "reasons": list(dict.fromkeys(reasons)), **entity}


def is_high_impact_news(article_score: dict[str, Any]) -> bool:
    return article_score.get("category") in {"company_specific", "subsidiary_related", "sector_related", "macro_related"} and float(article_score.get("relevance_score") or 0) >= 60
