"""Field-aware vendor priority helpers.

Global vendor order is too blunt for IDX data. These helpers keep routing
choices explicit per field while preserving the existing router fallback model.
"""

from __future__ import annotations

FIELD_SOURCE_PRIORITY: dict[str, list[str]] = {
    "price": ["yfinance", "finnhub", "alpha_vantage"],
    "quote": ["yfinance", "finnhub", "alpha_vantage"],
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
}


def is_idx_ticker(ticker: str | None) -> bool:
    return str(ticker or "").upper().endswith(".JK")


def get_field_vendor_order(field_name: str, ticker: str | None = None) -> list[str]:
    """Return the preferred vendor order for a field and ticker market."""
    key = str(field_name or "").strip().lower()
    if key in {"financial_statement", "financial_statements", "balance_sheet", "cashflow", "income_statement"}:
        return list(FIELD_SOURCE_PRIORITY["financial_statement_idx" if is_idx_ticker(ticker) else "financial_statement_us"])
    if key in {"insider", "insider_transactions", "insider_sentiment"}:
        return list(FIELD_SOURCE_PRIORITY["insider_idx" if is_idx_ticker(ticker) else "insider_us"])
    if key in {"shareholders", "executives"} and is_idx_ticker(ticker):
        return list(FIELD_SOURCE_PRIORITY[f"{key}_idx"])
    return list(FIELD_SOURCE_PRIORITY.get(key, ["yfinance", "finnhub", "alpha_vantage"]))
