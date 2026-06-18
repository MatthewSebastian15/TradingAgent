"""Market-aware yfinance-first source priority helpers."""

from __future__ import annotations

from .vendor_capabilities import VENDOR_CAPABILITIES, supports_vendor

NEWS_PRIORITY = [
    "yfinance",
    "google_news_light",
    "newsdata",
    "marketaux",
    "finnhub",
    "alpha_vantage",
]
NEWS_SENTIMENT_PRIORITY = ["finnhub", "alpha_vantage"]

SOURCE_PRIORITY: dict[str, dict[str, list[str]]] = {
    "IDX": {
        "symbol_search": ["yfinance"],
        "quote": ["yfinance", "finnhub", "alpha_vantage"],
        "history": ["yfinance", "alpha_vantage"],
        "chart": ["yfinance", "alpha_vantage"],
        "profile": ["yfinance", "finnhub"],
        "financials": ["yfinance", "finnhub"],
        "financial_statement": ["idx_official", "yfinance", "finnhub"],
        "ratios": ["yfinance"],
        "key_metrics": ["yfinance"],
        "market_cap": ["yfinance"],
        "historical_market_cap": ["yfinance"],
        "dividends": ["yfinance"],
        "splits": ["yfinance"],
        "ownership": ["yfinance", "alpha_vantage", "finnhub"],
        "news": NEWS_PRIORITY,
        "news_sentiment": NEWS_SENTIMENT_PRIORITY,
    },
    "ID": {
        "symbol_search": ["yfinance"],
        "quote": ["yfinance", "finnhub", "alpha_vantage"],
        "history": ["yfinance", "alpha_vantage"],
        "chart": ["yfinance", "alpha_vantage"],
        "profile": ["yfinance", "finnhub"],
        "financials": ["yfinance", "finnhub"],
        "financial_statement": ["idx_official", "yfinance", "finnhub"],
        "ratios": ["yfinance"],
        "key_metrics": ["yfinance"],
        "market_cap": ["yfinance"],
        "historical_market_cap": ["yfinance"],
        "dividends": ["yfinance"],
        "splits": ["yfinance"],
        "ownership": ["yfinance", "alpha_vantage", "finnhub"],
        "news": NEWS_PRIORITY,
        "news_sentiment": NEWS_SENTIMENT_PRIORITY,
    },
    "US": {
        "symbol_search": ["yfinance"],
        "quote": ["yfinance", "finnhub", "alpha_vantage"],
        "history": ["yfinance", "alpha_vantage"],
        "chart": ["yfinance", "alpha_vantage"],
        "profile": ["yfinance", "finnhub", "alpha_vantage"],
        "financials": ["yfinance", "alpha_vantage", "finnhub"],
        "financial_statement": ["yfinance", "sec_companyfacts", "alpha_vantage", "finnhub"],
        "ratios": ["yfinance"],
        "key_metrics": ["yfinance"],
        "market_cap": ["yfinance"],
        "historical_market_cap": ["yfinance"],
        "dividends": ["yfinance"],
        "splits": ["yfinance"],
        "ownership": ["yfinance", "alpha_vantage", "finnhub"],
        "news": NEWS_PRIORITY,
        "news_sentiment": NEWS_SENTIMENT_PRIORITY,
    },
    "GLOBAL": {
        "symbol_search": ["yfinance"],
        "quote": ["yfinance", "finnhub"],
        "history": ["yfinance"],
        "chart": ["yfinance"],
        "profile": ["yfinance", "finnhub", "alpha_vantage"],
        "financials": ["yfinance", "alpha_vantage", "finnhub"],
        "financial_statement": ["yfinance", "sec_companyfacts", "alpha_vantage", "finnhub"],
        "ratios": ["yfinance"],
        "key_metrics": ["yfinance"],
        "market_cap": ["yfinance"],
        "historical_market_cap": ["yfinance"],
        "dividends": ["yfinance"],
        "splits": ["yfinance"],
        "ownership": ["yfinance"],
        "news": NEWS_PRIORITY,
        "news_sentiment": NEWS_SENTIMENT_PRIORITY,
    },
    "CRYPTO": {
        "symbol_search": ["yfinance"],
        "quote": ["yfinance"],
        "history": ["yfinance"],
        "chart": ["yfinance"],
        "profile": ["yfinance"],
        "market_cap": ["yfinance"],
        "news": NEWS_PRIORITY,
    },
    "ETF": {
        "symbol_search": ["yfinance"],
        "quote": ["yfinance"],
        "history": ["yfinance"],
        "chart": ["yfinance"],
        "profile": ["yfinance"],
        "financials": ["yfinance"],
        "ratios": ["yfinance"],
        "key_metrics": ["yfinance"],
        "market_cap": ["yfinance"],
        "dividends": ["yfinance"],
        "news": NEWS_PRIORITY,
    },
    "FUND": {
        "symbol_search": ["yfinance"],
        "quote": ["yfinance"],
        "history": ["yfinance"],
        "chart": ["yfinance"],
        "profile": ["yfinance"],
        "financials": ["yfinance"],
        "ratios": ["yfinance"],
        "key_metrics": ["yfinance"],
        "market_cap": ["yfinance"],
        "dividends": ["yfinance"],
        "news": NEWS_PRIORITY,
    },
    "UNKNOWN": {
        "symbol_search": ["yfinance"],
        "quote": ["yfinance"],
        "history": ["yfinance"],
        "chart": ["yfinance"],
        "profile": ["yfinance"],
        "financials": ["yfinance"],
        "ratios": ["yfinance"],
        "key_metrics": ["yfinance"],
        "market_cap": ["yfinance"],
        "news": ["yfinance", "google_news_light"],
        "news_sentiment": NEWS_SENTIMENT_PRIORITY,
    },
}

_FIELD_ALIASES = {
    "price": "quote",
    "last_price": "quote",
    "historical": "history",
    "historical_price": "history",
    "price_history": "history",
    "stock_data": "history",
    "ohlcv": "history",
    "financial_statement": "financial_statement",
    "financial_statements": "financial_statement",
    "income_statement": "financials",
    "annual_income_statement": "financials",
    "balance_sheet": "financials",
    "annual_balance_sheet": "financials",
    "cashflow": "financials",
    "cash_flow": "financials",
    "annual_cashflow": "financials",
    "fundamentals": "financials",
    "financial_metrics": "financials",
    "company_profile": "profile",
    "company_news": "news",
    "global_news": "news",
    "news_sentiment": "news_sentiment",
    "shareholders": "ownership",
    "shareholder": "ownership",
    "insider": "ownership",
    "insider_transactions": "ownership",
    "insider_sentiment": "ownership",
    "executives": "profile",
    "executive": "profile",
    "corporate_actions": "dividends",
    "corporate_action": "dividends",
    "dividend": "dividends",
}


def normalize_market(market: str | None) -> str:
    value = str(market or "").strip().upper()
    if value in SOURCE_PRIORITY:
        return value
    if value in {"INDONESIA", "IDN"}:
        return "ID"
    if value in {"USA", "UNITED_STATES", "NYSE", "NASDAQ"}:
        return "US"
    return "UNKNOWN"


def market_from_symbol(symbol: str | None) -> str:
    value = str(symbol or "").strip().upper()
    if not value:
        return "UNKNOWN"
    if value.endswith(".JK"):
        return "IDX"
    if "-USD" in value or value.endswith("-USDT"):
        return "CRYPTO"
    if "." in value:
        return "GLOBAL"
    return "US"


def _canonical_field(field_name: str | None) -> str:
    key = str(field_name or "").strip().lower()
    return _FIELD_ALIASES.get(key, key or "quote")


def get_source_priority(market: str | None, field_name: str) -> list[str]:
    """Return configured vendor priority for one normalized market and field."""
    market_key = normalize_market(market)
    field_key = _canonical_field(field_name)
    vendors = SOURCE_PRIORITY.get(market_key, SOURCE_PRIORITY["UNKNOWN"]).get(field_key)
    if vendors is None and market_key != "UNKNOWN":
        vendors = SOURCE_PRIORITY["UNKNOWN"].get(field_key)
    return list(vendors or ["yfinance"])


def get_field_vendor_order(
    field_name: str, ticker: str | None = None, market: str | None = None
) -> list[str]:
    """Return yfinance-first vendor order for a field and ticker market."""
    market_key = normalize_market(market) if market is not None else market_from_symbol(ticker)
    field_key = _canonical_field(field_name)
    priority = get_source_priority(market_key, field_key)
    supported = [
        vendor
        for vendor in priority
        if vendor in VENDOR_CAPABILITIES and supports_vendor(vendor, market_key, field_key)
    ]
    return supported or ["yfinance"]


def is_idx_ticker(ticker: str | None) -> bool:
    return market_from_symbol(ticker) == "IDX"
