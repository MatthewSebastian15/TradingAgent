"""Cross-vendor validation helpers for market and fundamental data."""

from __future__ import annotations

from typing import Any


def _numbers(values: dict[str, Any], *, allow_zero: bool = False) -> dict[str, float]:
    result: dict[str, float] = {}
    for source, value in (values or {}).items():
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if number != number:
            continue
        if allow_zero or number != 0:
            result[str(source)] = number
    return result


def validate_price_consistency(values: dict[str, Any], tolerance_pct: float = 3.0) -> list[str]:
    nums = _numbers(values)
    positive = {source: value for source, value in nums.items() if value > 0}
    if len(positive) < 2:
        return []
    min_price = min(positive.values())
    max_price = max(positive.values())
    diff_pct = ((max_price - min_price) / min_price) * 100 if min_price else 0
    if diff_pct > tolerance_pct:
        return [f"Price mismatch across vendors: min={min_price}, max={max_price}, diff={diff_pct:.2f}%"]
    return []


def validate_volume_consistency(values: dict[str, Any], tolerance_pct: float = 20.0) -> list[str]:
    nums = {source: value for source, value in _numbers(values).items() if value > 0}
    if len(nums) < 2:
        return []
    min_volume = min(nums.values())
    max_volume = max(nums.values())
    diff_pct = ((max_volume - min_volume) / min_volume) * 100 if min_volume else 0
    if diff_pct > tolerance_pct:
        return [f"Volume mismatch across vendors: min={min_volume}, max={max_volume}, diff={diff_pct:.2f}%"]
    return []


def validate_fundamental_consistency(
    field_name: str,
    values: dict[str, Any],
    tolerance_pct: float = 5.0,
) -> list[str]:
    nums = _numbers(values)
    usable = [abs(value) for value in nums.values() if value != 0]
    if len(usable) < 2:
        return []
    low = min(usable)
    high = max(usable)
    diff_pct = ((high - low) / low) * 100 if low else 0
    if diff_pct > tolerance_pct:
        return [f"{field_name} mismatch across vendors: diff={diff_pct:.2f}%"]
    return []
