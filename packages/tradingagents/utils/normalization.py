from __future__ import annotations

import math
from typing import Any

_BLANK_VALUES = {"", "None", "none", "null", "NULL", "N/A", "n/a", "NA", "-"}


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def as_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        if text in _BLANK_VALUES:
            return None
        value = text.replace(",", "")
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def number_or_int(value: Any) -> float | int | None:
    parsed = number(value)
    if parsed is None:
        return None
    return int(parsed) if parsed.is_integer() else parsed
