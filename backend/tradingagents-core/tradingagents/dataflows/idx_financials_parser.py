"""IDX financial statement parser contract and normalization helpers."""

from __future__ import annotations

from typing import Any

from .normalizers import normalize_financial_value

IDX_SOURCE_PRIORITY = [
    "idx_official_xbrl_or_excel",
    "idx_official_pdf",
    "yfinance",
    "alpha_vantage",
    "finnhub",
]


def normalize_idx_statement_row(row: dict[str, Any], *, currency: str = "IDR", unit: str = "raw") -> dict[str, Any]:
    normalized = dict(row or {})
    for field in [
        "revenue",
        "gross_profit",
        "ebitda",
        "net_profit",
        "cash",
        "debt",
        "equity",
        "operating_cash_flow",
        "capex",
        "free_cash_flow",
    ]:
        if field in normalized:
            normalized[field] = normalize_financial_value(normalized[field], unit, currency)["normalized_value"]
    normalized.setdefault("currency", currency.upper())
    normalized.setdefault("unit", "raw")
    normalized.setdefault("source", "idx_official")
    return normalized


def parse_idx_financial_statement(payload: dict[str, Any]) -> dict[str, Any]:
    if not payload:
        return {
            "available": False,
            "source": "idx_official",
            "status": "source_unavailable",
            "reason": "No IDX financial statement payload was provided.",
        }
    currency = str(payload.get("currency") or "IDR")
    unit = str(payload.get("unit") or "raw")
    return {
        **payload,
        "available": True,
        "source": "idx_official",
        "income_statement": normalize_idx_statement_row(payload.get("income_statement") or {}, currency=currency, unit=unit),
        "balance_sheet": normalize_idx_statement_row(payload.get("balance_sheet") or {}, currency=currency, unit=unit),
        "cashflow": normalize_idx_statement_row(payload.get("cashflow") or {}, currency=currency, unit=unit),
    }
