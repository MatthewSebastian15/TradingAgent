"""Market-aware vendor capability matrix for Sprint 1 routing."""

from __future__ import annotations

SPRINT_1_VENDORS = {
    "yfinance",
    "idx_official",
    "sec_companyfacts",
    "finnhub",
    "alpha_vantage",
    "google_news_light",
    "newsdata",
    "marketaux",
}

VENDOR_CAPABILITIES: dict[str, dict[str, object]] = {
    "yfinance": {
        "markets": ["IDX", "ID", "US", "GLOBAL", "ETF", "FUND", "CRYPTO", "UNKNOWN"],
        "requires_api_key": False,
        "fields": {
            "symbol_search": "best",
            "quote": "best",
            "history": "best",
            "chart": "best",
            "profile": "best",
            "financials": "good",
            "financial_statement": "good",
            "ratios": "partial",
            "key_metrics": "partial",
            "market_cap": "best",
            "historical_market_cap": "partial",
            "dividends": "good",
            "splits": "good",
            "ownership": "partial",
            "news": "partial",
        },
    },
    "idx_official": {
        "markets": ["IDX", "ID"],
        "requires_api_key": False,
        "fields": {
            "financials": "best",
            "financial_statement": "best",
        },
    },
    "sec_companyfacts": {
        "markets": ["US", "GLOBAL"],
        "requires_api_key": False,
        "fields": {
            "financials": "best",
            "financial_statement": "best",
        },
    },
    "finnhub": {
        "markets": ["US", "GLOBAL", "IDX", "ID"],
        "requires_api_key": True,
        "fields": {
            "quote": "good",
            "profile": "good",
            "financials": "partial",
            "financial_statement": "partial",
            "ownership": "partial",
            "news": "good",
            "news_sentiment": "good",
        },
    },
    "alpha_vantage": {
        "markets": ["US", "GLOBAL"],
        "requires_api_key": True,
        "fields": {
            "quote": "partial",
            "history": "partial",
            "chart": "partial",
            "profile": "good",
            "financials": "good",
            "financial_statement": "good",
            "ratios": "good",
            "key_metrics": "good",
            "market_cap": "good",
            "ownership": "partial",
            "news": "good",
            "news_sentiment": "good",
            "technical_indicators": "good",
        },
    },
    "google_news_light": {
        "markets": ["IDX", "ID", "US", "GLOBAL", "ETF", "FUND", "CRYPTO", "UNKNOWN"],
        "requires_api_key": False,
        "fields": {
            "news": "good",
            "news_search": "good",
        },
    },
    "marketaux": {
        "markets": ["IDX", "ID", "US", "GLOBAL", "ETF", "FUND", "CRYPTO"],
        "requires_api_key": True,
        "fields": {
            "news": "good",
            "entity_news": "good",
            "sentiment": "good",
        },
    },
    "newsdata": {
        "markets": ["IDX", "ID", "US", "GLOBAL", "ETF", "FUND", "CRYPTO"],
        "requires_api_key": True,
        "fields": {
            "news": "good",
            "language_filter": "good",
        },
    },
}


def _normalize_vendor(vendor: str | None) -> str:
    return str(vendor or "").strip().lower()


def _normalize_market(market: str | None) -> str:
    value = str(market or "UNKNOWN").strip().upper()
    if value in {"INDONESIA", "IDN"}:
        return "ID"
    if value in {"USA", "UNITED_STATES", "NYSE", "NASDAQ"}:
        return "US"
    return value or "UNKNOWN"


def _fields_for(vendor: str) -> dict[str, str]:
    payload = VENDOR_CAPABILITIES.get(vendor) or {}
    fields = payload.get("fields")
    return dict(fields) if isinstance(fields, dict) else {}


def supports_vendor(vendor: str, market: str, field: str) -> bool:
    """Return True if vendor supports the requested market and field."""
    vendor_key = _normalize_vendor(vendor)
    capability = VENDOR_CAPABILITIES.get(vendor_key)
    if not capability:
        return False

    market_key = _normalize_market(market)
    if vendor_key == "alpha_vantage" and str(field or "") == "ownership" and market_key in {"IDX", "ID"}:
        return True
    markets = capability.get("markets")
    fields = _fields_for(vendor_key)
    return market_key in set(markets if isinstance(markets, list) else []) and str(field or "") in fields


def get_vendor_strength(vendor: str, market: str, field: str) -> str | None:
    """Return best/good/partial/limited/optional, or None if unsupported."""
    vendor_key = _normalize_vendor(vendor)
    if not supports_vendor(vendor_key, market, field):
        return None
    return _fields_for(vendor_key).get(str(field or ""))


def vendor_requires_api_key(vendor: str) -> bool:
    """Return True if vendor requires API key."""
    capability = VENDOR_CAPABILITIES.get(_normalize_vendor(vendor))
    return bool((capability or {}).get("requires_api_key"))


def get_supported_vendors(market: str, field: str) -> list[str]:
    """Return vendors that support the market and field."""
    return [vendor for vendor in VENDOR_CAPABILITIES if supports_vendor(vendor, market, field)]
