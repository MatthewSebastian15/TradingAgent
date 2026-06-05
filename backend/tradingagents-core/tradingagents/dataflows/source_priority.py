"""Field-aware vendor priority helpers.

Global vendor order is too blunt for mixed IDX/US data. These helpers keep
routing choices explicit per field while preserving the existing router
fallback model.
"""

from __future__ import annotations

FIELD_SOURCE_PRIORITY: dict[str, list[str]] = {
    "price": ["yfinance", "finnhub", "alpha_vantage"],
    "quote": ["yfinance", "finnhub", "alpha_vantage"],
    "last_price": ["yfinance", "finnhub", "alpha_vantage"],
    "historical_price": ["yfinance", "alpha_vantage", "finnhub"],
    "financial_statement_idx": ["idx_official", "yfinance", "alpha_vantage", "finnhub"],
    "financial_statement_us": ["alpha_vantage", "finnhub", "yfinance"],
    "company_news": ["marketaux", "newsdata", "yfinance"],
    "global_news": ["finnhub", "alpha_vantage", "yfinance"],
    "news_sentiment": ["finnhub", "internal_rule_scoring", "alpha_vantage"],
    "insider_idx": ["yfinance", "alpha_vantage", "finnhub"],
    "insider_us": ["finnhub", "alpha_vantage", "yfinance"],
    "shareholders_idx": ["idx_official", "yfinance"],
    "executives_idx": ["idx_official", "yfinance"],
    "corporate_actions_idx": ["idx_official", "yfinance"],
    "dividend_idx": ["idx_official", "yfinance"],
    "profile_idx": ["idx_official", "yfinance", "finnhub"],
    "profile_us": ["finnhub", "yfinance", "alpha_vantage"],
}


def is_idx_ticker(ticker: str | None) -> bool:
    return str(ticker or "").upper().endswith(".JK")


def get_field_vendor_order(field_name: str, ticker: str | None = None) -> list[str]:
    """Return the preferred vendor order for a field and ticker market."""
    key = str(field_name or "").strip().lower()
    is_idx = is_idx_ticker(ticker)

    if key in {"price", "quote", "last_price"}:
        return list(FIELD_SOURCE_PRIORITY["quote"])

    if key in {"historical", "historical_price", "price_history", "stock_data", "ohlcv"}:
        return list(FIELD_SOURCE_PRIORITY["historical_price"])

    if key in {
        "financial_statement",
        "financial_statements",
        "income_statement",
        "annual_income_statement",
        "balance_sheet",
        "annual_balance_sheet",
        "cashflow",
        "cash_flow",
        "annual_cashflow",
        "fundamentals",
        "financial_metrics",
    }:
        return list(FIELD_SOURCE_PRIORITY["financial_statement_idx" if is_idx else "financial_statement_us"])

    if key in {"insider", "insider_transactions", "insider_sentiment"}:
        return list(FIELD_SOURCE_PRIORITY["insider_idx" if is_idx else "insider_us"])

    idx_aliases = {
        "shareholders": "shareholders",
        "shareholder": "shareholders",
        "executives": "executives",
        "executive": "executives",
        "corporate_actions": "corporate_actions",
        "corporate_action": "corporate_actions",
        "dividend": "dividend",
        "dividends": "dividend",
    }
    if key in idx_aliases and is_idx:
        normalized_key = idx_aliases[key]
        return list(FIELD_SOURCE_PRIORITY.get(f"{normalized_key}_idx", ["idx_official", "yfinance"]))

    if key in {"profile", "company_profile"}:
        return list(FIELD_SOURCE_PRIORITY["profile_idx" if is_idx else "profile_us"])

    return list(FIELD_SOURCE_PRIORITY.get(key, ["yfinance", "finnhub", "alpha_vantage"]))
