"""Unit and currency normalization for financial statement values."""

from __future__ import annotations

from typing import Any

UNIT_MULTIPLIER = {
    "raw": 1,
    "unit": 1,
    "full": 1,
    "rupiah": 1,
    "thousand": 1_000,
    "thousands": 1_000,
    "million": 1_000_000,
    "millions": 1_000_000,
    "billion": 1_000_000_000,
    "billions": 1_000_000_000,
    "trillion": 1_000_000_000_000,
    "trillions": 1_000_000_000_000,
}


def normalize_financial_value(value: float | int | str | None, unit: str = "raw", currency: str = "IDR") -> dict[str, Any]:
    raw_unit = str(unit or "raw").strip().lower()
    normalized_currency = str(currency or "IDR").strip().upper()
    if value in (None, "", "N/A"):
        return {
            "raw_value": None,
            "raw_unit": raw_unit,
            "raw_currency": normalized_currency,
            "normalized_value": None,
            "normalized_currency": normalized_currency,
        }
    try:
        numeric = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return {
            "raw_value": value,
            "raw_unit": raw_unit,
            "raw_currency": normalized_currency,
            "normalized_value": None,
            "normalized_currency": normalized_currency,
            "warning": "value could not be parsed as a number",
        }
    multiplier = UNIT_MULTIPLIER.get(raw_unit, 1)
    return {
        "raw_value": numeric,
        "raw_unit": raw_unit,
        "raw_currency": normalized_currency,
        "normalized_value": numeric * multiplier,
        "normalized_currency": normalized_currency,
    }
