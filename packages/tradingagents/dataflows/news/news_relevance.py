"""Company-specific news relevance scoring and hard filtering."""

from __future__ import annotations

import re
from typing import Any

from .news_entity_resolver import resolve_news_entities
from .news_ticker_aliases import resolve_news_ticker

NEWS_PRIORITY = ["google_news_light", "marketaux", "rss_context", "newsdata", "yfinance"]

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
    "guidance",
    "buyback",
    "share buyback",
    "stock split",
    "lawsuit",
    "probe",
    "regulator",
    "default",
    "debt",
    "downgrade",
    "upgrade",
    "analyst rating",
    "target price",
}

INDONESIA_MARKET_MOVING_KEYWORDS = {
    "laba bersih",
    "pendapatan",
    "dividen",
    "rights issue",
    "akuisisi",
    "merger",
    "ekspansi",
    "utang",
    "obligasi",
    "buyback saham",
    "pemecahan saham",
    "stock split",
    "suspensi",
    "BEI",
    "OJK",
}

ALL_MARKET_MOVING_KEYWORDS = MARKET_MOVING_KEYWORDS | INDONESIA_MARKET_MOVING_KEYWORDS

MACRO_KEYWORDS = {
    "rupiah",
    "bank indonesia",
    "fed",
    "interest rate",
    "inflation",
    "commodity",
    "coal",
    "cpo",
    "nickel",
}
_ENTITY_FIELDS = ("entities", "symbols", "tickers", "keywords")
_TEXT_FIELDS = ("title", "description", "summary", "content", "publisher", "url")
_STOPWORDS = {"pt", "tbk", "inc", "corp", "corporation", "ltd", "plc", "llc", "co", "company"}


def _base_symbol(symbol: str) -> str:
    value = str(symbol or "").strip().upper()
    if not value:
        return ""
    base = value.split(".", 1)[0]
    if "-" in base and base.endswith(("-USD", "-USDT")):
        return base.split("-", 1)[0]
    return base


def _clean_term(value: Any) -> str | None:
    text = " ".join(str(value or "").split()).strip()
    if len(text) < 2:
        return None
    return text


def _company_aliases(company_name: str | None) -> list[str]:
    if not company_name:
        return []
    clean = re.sub(
        r"\b(PT|TBK|Tbk|Inc|Corp|Corporation|Ltd|PLC|LLC|Co)\b\.?", "", company_name
    ).strip()
    clean = " ".join(clean.split())
    aliases = [company_name]
    if clean and clean.lower() != company_name.lower():
        aliases.append(clean)
    words = [
        word
        for word in re.split(r"[^A-Za-z0-9]+", clean)
        if word and word.lower() not in _STOPWORDS
    ]
    acronym = "".join(word[0] for word in words if word)
    if len(acronym) >= 2:
        aliases.append(acronym.upper())
    return aliases


def build_news_relevance_terms(
    symbol: str,
    company_name: str | None = None,
    aliases: list[str] | None = None,
) -> set[str]:
    """Build ticker, company, and alias terms for article relevance filtering."""
    terms: list[str] = []
    canonical = str(symbol or "").strip().upper()
    base = _base_symbol(canonical)
    terms.extend([canonical, base])
    terms.extend(_company_aliases(company_name))
    terms.extend(str(alias or "").strip() for alias in aliases or [])
    try:
        profile = resolve_news_ticker(canonical)
    except ValueError:
        profile = {}
    terms.extend(str(alias or "").strip() for alias in profile.get("aliases", []))
    terms.extend(str(alias or "").strip() for alias in profile.get("subsidiaries", []))
    return {term for raw in terms if (term := _clean_term(raw))}


def _article_text(article: dict[str, Any]) -> str:
    chunks: list[str] = []
    for field in _TEXT_FIELDS:
        value = article.get(field)
        if isinstance(value, (str, int, float)):
            chunks.append(str(value))
    for field in _ENTITY_FIELDS:
        value = article.get(field)
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    chunks.extend(
                        str(item.get(key) or "") for key in ("symbol", "ticker", "name", "title")
                    )
                else:
                    chunks.append(str(item))
        elif isinstance(value, dict):
            chunks.extend(str(item) for item in value.values())
        elif isinstance(value, str):
            chunks.append(value)
    return " ".join(chunks)


def _contains_term(text: str, term: str) -> bool:
    value = str(term or "").strip()
    if len(value) < 2:
        return False
    if re.fullmatch(r"[A-Za-z0-9]+", value):
        return bool(
            re.search(rf"(?<![a-z0-9]){re.escape(value.lower())}(?![a-z0-9])", text.lower())
        )
    return value.lower() in text.lower()


def is_relevant_news(
    article: dict,
    symbol: str,
    company_name: str | None = None,
    aliases: list[str] | None = None,
) -> bool:
    """Return True only if article text or entities match the analyzed ticker/company."""
    terms = build_news_relevance_terms(symbol, company_name, aliases)
    text = _article_text(article)
    return any(_contains_term(text, term) for term in terms)


# Tickers that collide with common words need a stronger signal than a bare token match.
AMBIGUOUS_TICKER_MAX_LEN = 3
COMMON_WORD_TICKERS = {
    "on",
    "in",
    "at",
    "it",
    "go",
    "so",
    "by",
    "or",
    "up",
    "an",
    "as",
    "be",
    "do",
    "no",
    "all",
    "one",
    "are",
    "key",
    "car",
    "fun",
    "now",
    "new",
    "old",
    "big",
    "hot",
    "run",
    "cash",
    "real",
    "open",
    "well",
    "play",
    "love",
    "food",
    "fast",
    "best",
    "gold",
    "life",
    "turn",
    "flow",
    "post",
    "wave",
    "edge",
    "core",
    "peak",
    "true",
}


def has_company_match_in_title_or_entities(
    article: dict[str, Any],
    ticker: str,
    company_name: str = "",
    aliases: list[str] | None = None,
) -> bool:
    """Company match requires the ticker/name in the TITLE or a resolved entity match.

    A stray token in the URL or buried body no longer counts (F4). Ambiguous short
    tickers (<= 3 chars or a common word) need a name/entity hit or a market-moving
    keyword — never a bare ticker token in the title (F1 tail).
    """
    scored = score_news_relevance(article, ticker, company_name or "")
    short = _base_symbol(ticker).lower()
    symbols = {str(ticker or "").lower(), short}
    ambiguous = len(short) <= AMBIGUOUS_TICKER_MAX_LEN or short in COMMON_WORD_TICKERS

    # Trust an entity match unless it only fired on the bare ambiguous symbol itself.
    matched = [str(term).lower() for term in scored.get("matched_terms", [])]
    strong_matched = any(term and term not in symbols for term in matched)
    if scored.get("entity_match") in {"company_exact", "subsidiary"} and (
        strong_matched or not ambiguous
    ):
        return True

    title = str(article.get("title") or "").lower()
    name_terms = [
        term
        for term in [company_name or "", *(aliases or [])]
        if term and str(term).lower() not in symbols
    ]
    if any(_contains_term(title, str(term)) for term in name_terms):
        return True

    if short and _contains_term(title, short):
        if not ambiguous:
            return True
        text = f"{title} {article.get('summary') or ''}".lower()
        if any(keyword.lower() in text for keyword in ALL_MARKET_MOVING_KEYWORDS):
            return True
    return False


def score_news_relevance(
    article: dict[str, Any], ticker: str, company_name: str = "", sector: str = ""
) -> dict[str, Any]:
    title = str(article.get("title") or "")
    body = str(article.get("summary") or article.get("description") or article.get("content") or "")
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
        return {
            "relevance_score": 0,
            "category": "irrelevant",
            "reasons": ["negative_entity_term"],
            **entity,
        }

    short_ticker = _base_symbol(ticker).lower()
    if short_ticker and _contains_term(text, short_ticker):
        score += 20
        reasons.append("ticker_match")
    if company_name and _contains_term(text, company_name):
        score += 25
        reasons.append("company_name_match")
    if sector and _contains_term(text, sector):
        score += 15
        reasons.append("sector_match")
    if any(keyword.lower() in text for keyword in ALL_MARKET_MOVING_KEYWORDS):
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

    return {
        "relevance_score": min(score, 100),
        "category": category,
        "reasons": list(dict.fromkeys(reasons)),
        **entity,
    }


def is_high_impact_news(article_score: dict[str, Any]) -> bool:
    return (
        article_score.get("category")
        in {"company_specific", "subsidiary_related", "sector_related", "macro_related"}
        and float(article_score.get("relevance_score") or 0) >= 60
    )
