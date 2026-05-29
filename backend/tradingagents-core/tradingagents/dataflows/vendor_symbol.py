from __future__ import annotations

from tradingagents.dataflows.y_finance import normalize_ticker as normalize_yfinance_ticker


def is_idx_symbol(symbol: str) -> bool:
    """Return True for Indonesian Exchange symbols in yfinance .JK format."""
    value = str(symbol or "").strip().upper()
    return value.endswith(".JK")


def normalize_symbol_for_vendor(symbol: str, vendor: str) -> str:
    """Normalize ticker symbols for a specific data vendor.

    yfinance uses exchange suffixes such as UNVR.JK. Other vendors and endpoints
    may require a different symbol format or may reject IDX suffixes entirely,
    so the router must not blindly reuse the yfinance-normalized symbol for all
    vendors.
    """
    value = str(symbol or "").strip().upper()

    if vendor == "yfinance":
        return normalize_yfinance_ticker(value)

    if vendor in {"alpha_vantage", "finnhub"}:
        return value

    return value
