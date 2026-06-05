"""IDX financial statement parser contract and normalization helpers."""

from __future__ import annotations

from typing import Any

from .normalizers import normalize_financial_value
from .period_metadata import infer_period_metadata

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
    if "period" not in normalized and (normalized.get("period_label") or normalized.get("period_end")):
        try:
            normalized["period"] = infer_period_metadata(
                str(normalized.get("period_label") or normalized.get("period_end")),
                period_end=normalized.get("period_end"),
                reported_date=normalized.get("reported_date"),
                currency=currency,
                unit="raw",
                is_restated=bool(normalized.get("is_restated")),
            )
        except ValueError:
            pass
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
    result = {
        **payload,
        "available": True,
        "source": "idx_official",
        "income_statement": normalize_idx_statement_row(payload.get("income_statement") or {}, currency=currency, unit=unit),
        "balance_sheet": normalize_idx_statement_row(payload.get("balance_sheet") or {}, currency=currency, unit=unit),
        "cashflow": normalize_idx_statement_row(payload.get("cashflow") or {}, currency=currency, unit=unit),
    }
    if "period" not in result:
        label = str(payload.get("period") or payload.get("period_label") or payload.get("period_end") or "")
        try:
            result["period"] = infer_period_metadata(
                label,
                period_end=payload.get("period_end"),
                reported_date=payload.get("reported_date"),
                currency=currency,
                unit="raw",
                is_restated=bool(payload.get("is_restated")),
            )
        except ValueError:
            pass
    return result
