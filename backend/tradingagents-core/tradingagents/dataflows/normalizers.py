"""Unit and currency normalization for financial statement values."""

from __future__ import annotations

import re
from typing import Any

UNIT_MULTIPLIER = {
    "raw": 1,
    "unit": 1,
    "full": 1,
    "rupiah": 1,
    "idr": 1,
    "thousand": 1_000,
    "thousands": 1_000,
    "ribu": 1_000,
    "k": 1_000,
    "million": 1_000_000,
    "millions": 1_000_000,
    "juta": 1_000_000,
    "m": 1_000_000,
    "billion": 1_000_000_000,
    "billions": 1_000_000_000,
    "miliar": 1_000_000_000,
    "bn": 1_000_000_000,
    "b": 1_000_000_000,
    "trillion": 1_000_000_000_000,
    "trillions": 1_000_000_000_000,
    "triliun": 1_000_000_000_000,
    "tn": 1_000_000_000_000,
    "t": 1_000_000_000_000,
}

_UNIT_ALIASES = {
    "rp": "raw",
    "idr": "raw",
    "k": "thousand",
    "ribu": "thousand",
    "m": "million",
    "mn": "million",
    "juta": "million",
    "b": "billion",
    "bn": "billion",
    "miliar": "billion",
    "t": "trillion",
    "tn": "trillion",
    "triliun": "trillion",
}

_SUFFIX_PATTERN = re.compile(r"^\s*(?P<prefix>rp|idr|usd)?\s*(?P<number>[-+]?\d+(?:[.,]\d+)?)\s*(?P<suffix>k|m|mn|b|bn|t|tn|ribu|juta|miliar|triliun)?\s*$", re.IGNORECASE)


def _normalize_unit(unit: str | None) -> str:
    raw = str(unit or "raw").strip().lower()
    return _UNIT_ALIASES.get(raw, raw or "raw")


def _parse_numeric_and_unit(value: Any, unit: str) -> tuple[float | None, str, str | None]:
    if value in (None, "", "N/A", "n/a", "NA", "-"):
        return None, unit, None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        number = float(value)
        return (number if number == number else None), unit, None

    text = str(value).strip()
    if not text or text.lower() in {"n/a", "na", "none", "null", "-"}:
        return None, unit, None
    cleaned = text.replace("Rp", "Rp ").replace("IDR", "IDR ")
    match = _SUFFIX_PATTERN.match(cleaned.replace(" ", "")) or _SUFFIX_PATTERN.match(cleaned)
    if match:
        suffix = match.group("suffix")
        detected_unit = _normalize_unit(suffix) if suffix else unit
        raw_number = match.group("number")
        if "," in raw_number and "." not in raw_number:
            whole, fraction = raw_number.split(",", 1)
            if suffix and len(fraction) != 3:
                # Compact Indonesian-style values such as Rp 1,2T use comma as decimal separator.
                raw_number = f"{whole}.{fraction}"
            elif len(fraction) == 3:
                # Plain values such as 1,234 are thousands-separated.
                raw_number = whole + fraction
            else:
                raw_number = f"{whole}.{fraction}"
        else:
            raw_number = raw_number.replace(",", "")
        try:
            return float(raw_number), detected_unit, None
        except ValueError:
            return None, detected_unit, "value could not be parsed as a number"

    sanitized = re.sub(r"(?i)\b(rp|idr|usd)\b", "", text).strip()
    sanitized = sanitized.replace(",", "")
    try:
        return float(sanitized), unit, None
    except (TypeError, ValueError):
        return None, unit, "value could not be parsed as a number"


def normalize_financial_value(value: float | int | str | None, unit: str = "raw", currency: str = "IDR") -> dict[str, Any]:
    raw_unit = _normalize_unit(unit)
    normalized_currency = str(currency or "IDR").strip().upper()
    numeric, detected_unit, warning = _parse_numeric_and_unit(value, raw_unit)
    payload = {
        "raw_value": numeric if numeric is not None else value if value not in (None, "", "N/A", "n/a", "NA", "-") else None,
        "raw_unit": detected_unit,
        "raw_currency": normalized_currency,
        "normalized_value": None if numeric is None else numeric * UNIT_MULTIPLIER.get(detected_unit, 1),
        "normalized_currency": normalized_currency,
    }
    if warning:
        payload["warning"] = warning
    return payload


def normalized_number(value: Any, unit: str = "raw", currency: str = "IDR") -> float | None:
    """Convenience accessor for calculators that only need normalized_value."""
    result = normalize_financial_value(value, unit=unit, currency=currency)
    normalized = result.get("normalized_value")
    try:
        number = float(normalized)
    except (TypeError, ValueError):
        return None
    return number if number == number else None
