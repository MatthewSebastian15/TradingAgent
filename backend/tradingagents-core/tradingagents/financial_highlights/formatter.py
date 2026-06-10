from __future__ import annotations

from typing import Any

CURRENCY_LABELS = {
    "IDR": "Indonesian Rupiah",
    "USD": "US Dollar",
}


def currency_metadata(currency: str | None) -> dict[str, str | float]:
    code = str(currency or "USD").upper()
    is_idr = code == "IDR"
    scale = "billion" if is_idr else "million"
    scale_label = f"{code} {'Bn' if is_idr else 'Mn'}"
    scale_divisor = 1_000_000_000 if is_idr else 1_000_000
    currency_label = CURRENCY_LABELS.get(code, code)
    return {
        "currency": code,
        "currency_label": currency_label,
        "scale": scale,
        "scale_label": scale_label,
        "scale_divisor": scale_divisor,
        "unit_note": (
            f"Currency: {code} ({currency_label}) | "
            f"Amount figures: in {scale}s ({scale_label}) | "
            f"Per-share values: {code}/share | "
            "Percent metrics: shown with % | DER: ratio (x)"
        ),
    }


def convert_amount(value: float | None, *, source_unit: str | None, scale_divisor: float) -> float | None:
    if value is None:
        return None
    normalized_unit = str(source_unit or "raw").strip().lower()
    if normalized_unit in {"billion", "bn"}:
        raw_value = value * 1_000_000_000
    elif normalized_unit in {"million", "mn"}:
        raw_value = value * 1_000_000
    else:
        raw_value = value
    return raw_value / scale_divisor


def format_number(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return "-"
    return f"{value:,.{decimals}f}"


def format_currency_scaled(value: float | None, decimals: int = 1) -> str:
    return format_number(value, decimals)


def format_percent(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return "-"
    return f"{value:,.{decimals}f}%"


def format_ratio(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return "-"
    return f"{value:,.{decimals}f}x"


def format_per_share(value: float | None, decimals: int = 2) -> str:
    return format_number(value, decimals)


def format_financial_value(value: float | None, format_type: str) -> str:
    if format_type == "currency_scaled":
        return format_currency_scaled(value)
    if format_type == "percent":
        return format_percent(value)
    if format_type == "ratio":
        return format_ratio(value)
    if format_type == "per_share":
        return format_per_share(value)
    return format_number(value)


def number_or_none(value: Any) -> float | None:
    if isinstance(value, bool) or value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in {float("inf"), float("-inf")}:
        return None
    return number
