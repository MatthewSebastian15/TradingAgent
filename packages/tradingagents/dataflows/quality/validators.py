"""Cross-vendor validation helpers for market and fundamental data."""

from __future__ import annotations

from typing import Any


def _clean_numbers(values: dict[str, Any], *, allow_zero: bool = False) -> dict[str, float]:
    result: dict[str, float] = {}
    for source, value in (values or {}).items():
        if isinstance(value, bool):
            continue
        try:
            number = float(str(value).replace(",", ""))
        except (TypeError, ValueError):
            continue
        if number != number:
            continue
        if not allow_zero and number == 0:
            continue
        result[str(source)] = number
    return result


def _pct_diff(a: float, b: float) -> float:
    denominator = max(abs(a), abs(b), 1.0)
    return abs(a - b) / denominator * 100.0


def validate_numeric_consistency(
    field_name: str,
    values: dict[str, Any],
    tolerance_pct: float,
) -> list[str]:
    """Return explicit conflict warnings when vendor values exceed tolerance."""
    warnings: list[str] = []
    items = list(_clean_numbers(values).items())

    if len(items) < 2:
        return warnings

    for idx, (vendor_a, value_a) in enumerate(items):
        for vendor_b, value_b in items[idx + 1 :]:
            diff = _pct_diff(value_a, value_b)
            if diff > tolerance_pct:
                warnings.append(
                    f"{field_name} conflict: {vendor_a}={value_a}, "
                    f"{vendor_b}={value_b}, difference={round(diff, 2)}%, "
                    f"tolerance={tolerance_pct}%"
                )
    return warnings


def validate_price_consistency(values: dict[str, Any], tolerance_pct: float = 3.0) -> list[str]:
    return [
        f"Price mismatch: {warning}"
        for warning in validate_numeric_consistency("last_price", values, tolerance_pct)
    ]


def validate_volume_consistency(values: dict[str, Any], tolerance_pct: float = 20.0) -> list[str]:
    return validate_numeric_consistency("volume", values, tolerance_pct)


def validate_fundamental_consistency(
    field_name: str,
    values: dict[str, Any],
    tolerance_pct: float = 5.0,
) -> list[str]:
    return validate_numeric_consistency(field_name, values, tolerance_pct)
