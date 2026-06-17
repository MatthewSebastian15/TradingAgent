"""Normalized financial row contract and market-aware helpers."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class FinancialRow:
    symbol: str
    period: str
    period_type: str
    currency: str
    unit: str

    revenue: float | None = None
    gross_profit: float | None = None
    operating_profit: float | None = None
    operating_expense: float | None = None
    ebitda: float | None = None
    net_profit: float | None = None
    eps: float | None = None
    interest_expense: float | None = None

    total_assets: float | None = None
    total_liabilities: float | None = None
    equity: float | None = None
    current_assets: float | None = None
    current_liabilities: float | None = None
    total_debt: float | None = None
    cash_and_equivalents: float | None = None

    operating_cash_flow: float | None = None
    capex: float | None = None
    free_cash_flow: float | None = None

    shares_outstanding: float | None = None

    source: str = ""
    source_confidence: str = "medium"
    fallback: bool = False
    fallback_source: str | None = None
    as_of_date: str | None = None
    retrieved_at: str = ""
    estimated_fields: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


FINANCIAL_ROW_FIELDS = {
    "revenue",
    "gross_profit",
    "operating_profit",
    "operating_expense",
    "ebitda",
    "net_profit",
    "eps",
    "interest_expense",
    "total_assets",
    "total_liabilities",
    "equity",
    "current_assets",
    "current_liabilities",
    "total_debt",
    "cash_and_equivalents",
    "operating_cash_flow",
    "capex",
    "free_cash_flow",
    "shares_outstanding",
}

BANK_METRICS = ["roe", "roa", "net_profit_growth_yoy", "npm"]
BANK_EXCLUDED = ["ebitda", "interest_coverage", "der"]

GENERAL_METRICS = [
    "revenue_growth_yoy",
    "net_profit_growth_yoy",
    "gross_margin",
    "npm",
    "roe",
    "roa",
    "der",
    "current_ratio",
    "free_cash_flow",
]

COMMODITY_METRICS = [
    "revenue_growth_yoy",
    "gross_margin",
    "npm",
    "net_profit_growth_yoy",
    "der",
    "free_cash_flow",
]

TECH_METRICS = [
    "revenue",
    "revenue_growth_yoy",
    "operating_cash_flow",
    "free_cash_flow",
    "gross_margin",
]

UNKNOWN_METRICS = ["revenue", "net_profit", "roe", "roa", "der"]

_UNIT_ALIASES = {
    "": "raw",
    "raw": "raw",
    "unit": "raw",
    "full": "raw",
    "rupiah": "raw",
    "idr": "raw",
    "usd": "raw",
    "k": "thousands",
    "thousand": "thousands",
    "thousands": "thousands",
    "ribu": "thousands",
    "m": "millions",
    "mn": "millions",
    "million": "millions",
    "millions": "millions",
    "juta": "millions",
    "b": "billions",
    "bn": "billions",
    "billion": "billions",
    "billions": "billions",
    "miliar": "billions",
}

_STATIC_SECTOR_MAP = {
    "BBCA.JK": "bank",
    "BBRI.JK": "bank",
    "BMRI.JK": "bank",
    "BBNI.JK": "bank",
    "BTC-USD": "crypto",
    "ETH-USD": "crypto",
    "SPY": "etf",
    "QQQ": "etf",
}


def normalize_currency(currency: str | None, market: str | None) -> str:
    """Return normalized currency code. IDX defaults to IDR, US defaults to USD."""
    value = str(currency or "").strip().upper()
    if value:
        return value
    market_key = str(market or "").strip().upper()
    if market_key in {"IDX", "ID", "INDONESIA"}:
        return "IDR"
    if market_key in {"US", "USA", "ETF", "FUND", "CRYPTO"}:
        return "USD"
    return "USD"


def normalize_unit(unit: str | None) -> str:
    """Return raw/thousands/millions/billions."""
    return _UNIT_ALIASES.get(str(unit or "raw").strip().lower(), "raw")


def build_period_label(date: str | None, period_type: str) -> str:
    """Return FY2024, Q1FY2025, or unknown period label."""
    text = str(date or "").strip()
    if not text:
        return "unknown"
    try:
        parsed = datetime.fromisoformat(text[:10])
    except ValueError:
        digits = "".join(ch for ch in text if ch.isdigit())
        if len(digits) >= 4:
            year = digits[:4]
            return f"FY{year}"
        return "unknown"

    normalized_period = str(period_type or "").strip().lower()
    if normalized_period in {"quarter", "quarterly", "q"}:
        quarter = ((parsed.month - 1) // 3) + 1
        return f"Q{quarter}FY{parsed.year}"
    return f"FY{parsed.year}"


def detect_sector(
    symbol: str,
    yfinance_info: dict | None = None,
    search_metadata: dict | None = None,
    finnhub_profile: dict | None = None,
) -> dict:
    """
    Return sector classification with source and confidence.
    Priority:
    1. yfinance sector/industry
    2. search metadata quote type / exchange / long name
    3. Finnhub profile if available as fallback
    4. small static correction map for known problematic tickers
    5. unknown
    """
    symbol_key = str(symbol or "").strip().upper()
    for source, payload in (
        ("yfinance", yfinance_info),
        ("search_metadata", search_metadata),
        ("finnhub", finnhub_profile),
    ):
        sector = _sector_from_payload(symbol_key, payload)
        if sector != "unknown":
            return {
                "sector": sector,
                "source": source,
                "confidence": "medium" if source == "finnhub" else "high",
            }
    if symbol_key in _STATIC_SECTOR_MAP:
        return {"sector": _STATIC_SECTOR_MAP[symbol_key], "source": "static_map", "confidence": "medium"}
    if symbol_key.endswith("-USD") or symbol_key.endswith("-USDT"):
        return {"sector": "crypto", "source": "static_map", "confidence": "medium"}
    return {"sector": "unknown", "source": "unknown", "confidence": "low"}


def metrics_profile_for_sector(sector: str | None) -> dict[str, Any]:
    sector_key = str(sector or "unknown").strip().lower()
    if sector_key == "bank":
        return {
            "metrics_profile": "bank",
            "included_metrics": BANK_METRICS,
            "excluded_metrics": BANK_EXCLUDED,
        }
    if sector_key in {"etf", "fund", "crypto"}:
        return {
            "metrics_profile": sector_key,
            "included_metrics": [],
            "excluded_metrics": GENERAL_METRICS + BANK_EXCLUDED,
        }
    if sector_key in {"commodity", "materials", "energy", "mining"}:
        return {
            "metrics_profile": "commodity",
            "included_metrics": COMMODITY_METRICS,
            "excluded_metrics": ["interest_coverage"],
        }
    if sector_key in {"technology", "tech"}:
        return {
            "metrics_profile": "tech",
            "included_metrics": TECH_METRICS,
            "excluded_metrics": [],
        }
    if sector_key == "unknown":
        return {
            "metrics_profile": "unknown",
            "included_metrics": UNKNOWN_METRICS,
            "excluded_metrics": [],
        }
    return {
        "metrics_profile": "general",
        "included_metrics": GENERAL_METRICS,
        "excluded_metrics": [],
    }


def _sector_from_payload(symbol: str, payload: dict | None) -> str:
    if not isinstance(payload, dict):
        return "unknown"
    quote_type = " ".join(
        str(payload.get(key) or "") for key in ("quoteType", "quote_type", "type", "assetType", "asset_type")
    ).lower()
    if "crypto" in quote_type or symbol.endswith("-USD") or symbol.endswith("-USDT"):
        return "crypto"
    if "etf" in quote_type:
        return "etf"
    if "fund" in quote_type:
        return "fund"

    text = " ".join(
        str(payload.get(key) or "")
        for key in (
            "sector",
            "industry",
            "finnhubIndustry",
            "longName",
            "shortName",
            "name",
            "exchange",
            "fullExchangeName",
        )
    ).lower()
    if any(word in text for word in ("bank", "banks", "banking")):
        return "bank"
    if any(word in text for word in ("oil", "gas", "coal", "mining", "metals", "materials", "commodity")):
        return "commodity"
    if any(word in text for word in ("technology", "software", "semiconductor", "internet", "tech")):
        return "technology"
    if "consumer" in text:
        return "consumer"
    return "unknown"
