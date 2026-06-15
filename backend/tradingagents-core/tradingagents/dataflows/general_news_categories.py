from __future__ import annotations

from typing import Any

GENERAL_NEWS_CATEGORIES = [
    {"key": "all", "label": "ALL"},
    {"key": "market", "label": "MARKET"},
    {"key": "macro", "label": "MACRO"},
    {"key": "crypto", "label": "CRYPTO"},
    {"key": "forex", "label": "FOREX"},
    {"key": "commodities", "label": "COMMODITIES"},
    {"key": "regulatory", "label": "REGULATORY"},
    {"key": "indonesia", "label": "INDONESIA"},
]

SOURCE_CATEGORY_MAP = {
    "CNBC": "market",
    "BBC": "macro",
    "COINDESK": "crypto",
    "THE BLOCK": "crypto",
    "SEC": "regulatory",
    "FXSTREET": "forex",
    "INVESTING.COM": "market",
    "OILPRICE.COM": "commodities",
    "BLOOMBERG": "market",
    "THE ECONOMIST": "macro",
}

CATEGORY_KEYWORDS = {
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
    "macro": [
        "inflation",
        "gdp",
        "interest rate",
        "central bank",
        "fed",
        "federal reserve",
        "ecb",
        "recession",
        "economy",
        "economic growth",
        "jobs report",
        "unemployment",
    ],
    "market": [
        "stock",
        "stocks",
        "equities",
        "market",
        "s&p 500",
        "nasdaq",
        "dow",
        "bond",
        "treasury",
        "yield",
        "earnings",
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
    ],
    "commodities": [
        "oil",
        "brent",
        "wti",
        "gold",
        "coal",
        "gas",
        "lng",
        "commodity",
        "commodities",
        "copper",
    ],
    "regulatory": [
        "sec",
        "regulation",
        "regulator",
        "enforcement",
        "filing",
        "lawsuit",
        "probe",
        "compliance",
    ],
    "indonesia": [
        "indonesia",
        "rupiah",
        "jakarta",
        "ihsg",
        "idx",
        "bei",
        "bank indonesia",
        "bi rate",
        "ojk",
        "bursa efek",
    ],
}

CATEGORY_PRIORITY = [
    "regulatory",
    "indonesia",
    "crypto",
    "commodities",
    "forex",
    "macro",
    "market",
]


def allowed_category_keys() -> set[str]:
    return {category["key"] for category in GENERAL_NEWS_CATEGORIES}


def is_allowed_category(category: str) -> bool:
    return str(category or "").strip().lower() in allowed_category_keys()


def _article_value(article: Any, name: str) -> str:
    if isinstance(article, dict):
        value = article.get(name)
    else:
        value = getattr(article, name, None)
    return str(value or "").strip()


def map_general_news_category(article: Any) -> str:
    source = _article_value(article, "source").upper()
    if source in SOURCE_CATEGORY_MAP:
        return SOURCE_CATEGORY_MAP[source]

    text = f"{_article_value(article, 'title')} {_article_value(article, 'summary')}".lower()
    for category in CATEGORY_PRIORITY:
        keywords = CATEGORY_KEYWORDS.get(category, [])
        if any(keyword in text for keyword in keywords):
            return category

    return "market"
