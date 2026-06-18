from __future__ import annotations

from typing import Any

GENERAL_NEWS_CATEGORIES = [
    {"key": "all", "label": "ALL"},
    {"key": "markets", "label": "MARKETS"},
    {"key": "world", "label": "WORLD"},
    {"key": "finance", "label": "FINANCE"},
    {"key": "tech", "label": "TECH"},
    {"key": "macro", "label": "MACRO"},
    {"key": "central_bank", "label": "CENTRAL BANK"},
    {"key": "regulatory", "label": "REGULATORY"},
    {"key": "forex", "label": "FOREX"},
    {"key": "crypto", "label": "CRYPTO"},
]

LEGACY_CATEGORY_ALIASES = {
    "market": "markets",
    "business": "finance",
    "commodities": "markets",
    "energy": "markets",
    "central-bank": "central_bank",
    "centralbank": "central_bank",
    "indonesia": "markets",
}

SOURCE_CATEGORY_MAP = {
    "CNBC": "finance",
    "BBC": "world",
    "COINDESK": "crypto",
    "THE BLOCK": "crypto",
    "COINTELEGRAPH": "crypto",
    "SEC": "regulatory",
    "FEDERAL RESERVE": "central_bank",
    "BANK OF ENGLAND": "central_bank",
    "FXSTREET": "forex",
    "INVESTING.COM": "markets",
    "OILPRICE.COM": "markets",
    "BLOOMBERG": "markets",
    "WSJ": "markets",
    "MARKETWATCH": "markets",
    "SEEKING ALPHA": "markets",
    "WOLF STREET": "macro",
    "THE ECONOMIST": "macro",
}

CATEGORY_KEYWORDS = {
    "markets": [
        "stock",
        "stocks",
        "equity",
        "equities",
        "market",
        "markets",
        "s&p 500",
        "nasdaq",
        "dow",
        "bond",
        "treasury",
        "yield",
        "earnings",
        "valuation",
        "rally",
        "selloff",
        "futures",
    ],
    "world": [
        "world",
        "global",
        "geopolitics",
        "war",
        "conflict",
        "election",
        "sanctions",
        "diplomacy",
        "international",
        "trade tension",
        "supply chain",
    ],
    "finance": [
        "finance",
        "banking",
        "bank",
        "banks",
        "credit",
        "loan",
        "mortgage",
        "asset manager",
        "private equity",
        "hedge fund",
        "wealth",
        "insurance",
        "financials",
    ],
    "tech": [
        "technology",
        "tech",
        "ai",
        "artificial intelligence",
        "chip",
        "semiconductor",
        "software",
        "cloud",
        "cybersecurity",
        "data center",
        "nvidia",
        "microsoft",
        "apple",
        "google",
        "meta",
    ],
    "macro": [
        "inflation",
        "gdp",
        "economy",
        "recession",
        "unemployment",
        "payroll",
        "jobs report",
        "cpi",
        "ppi",
        "pmi",
        "consumer confidence",
        "fiscal",
        "deficit",
    ],
    "central_bank": [
        "central bank",
        "federal reserve",
        "fed",
        "fomc",
        "bank of england",
        "boe",
        "ecb",
        "rate decision",
        "interest rate",
        "policy rate",
        "quantitative tightening",
        "quantitative easing",
    ],
    "regulatory": [
        "sec",
        "regulator",
        "regulation",
        "enforcement",
        "filing",
        "lawsuit",
        "probe",
        "compliance",
        "fraud",
        "settlement",
        "charges",
    ],
    "forex": [
        "forex",
        "currency",
        "dollar",
        "usd",
        "eur",
        "jpy",
        "gbp",
        "rupiah",
        "exchange rate",
        "fx",
        "dxy",
    ],
    "crypto": [
        "bitcoin",
        "btc",
        "ethereum",
        "eth",
        "crypto",
        "blockchain",
        "digital asset",
        "stablecoin",
        "token",
        "binance",
        "coinbase",
        "etf inflows",
    ],
}

CATEGORY_PRIORITY = [
    "regulatory",
    "central_bank",
    "crypto",
    "forex",
    "tech",
    "finance",
    "world",
    "macro",
    "markets",
]


def normalize_general_news_category(category: str | None) -> str:
    normalized = str(category or "").strip().lower().replace(" ", "_")
    normalized = LEGACY_CATEGORY_ALIASES.get(normalized, normalized)
    return normalized if normalized in allowed_category_keys() else "markets"


def allowed_category_keys() -> set[str]:
    return {category["key"] for category in GENERAL_NEWS_CATEGORIES}


def is_allowed_category(category: str) -> bool:
    normalized = str(category or "").strip().lower().replace(" ", "_")
    normalized = LEGACY_CATEGORY_ALIASES.get(normalized, normalized)
    return normalized in allowed_category_keys()


def _article_value(article: Any, name: str) -> str:
    if isinstance(article, dict):
        value = article.get(name)
    else:
        value = getattr(article, name, None)
    return str(value or "").strip()


def map_general_news_category(article: Any) -> str:
    explicit_category = _article_value(article, "category")
    if explicit_category:
        return normalize_general_news_category(explicit_category)

    source = _article_value(article, "source").upper()
    if source in SOURCE_CATEGORY_MAP:
        return SOURCE_CATEGORY_MAP[source]

    text = f"{_article_value(article, 'title')} {_article_value(article, 'summary')}".lower()
    for category in CATEGORY_PRIORITY:
        keywords = CATEGORY_KEYWORDS.get(category, [])
        if any(keyword in text for keyword in keywords):
            return category

    return "markets"
