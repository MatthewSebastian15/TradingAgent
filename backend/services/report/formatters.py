"""Pure value/text formatting primitives for report assembly.

Leaf helpers: depend only on the standard library and each other. Extracted
from report_service.py to shrink that module's divergent-change surface.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any


def _coalesce(*values: Any) -> Any:
    for value in values:
        if value is not None and value != "":
            return value
    return None


def _as_text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for item in value:
        if isinstance(item, dict):
            code = str(item.get("code") or "").strip()
            message = str(item.get("message") or "").strip()
            severity = str(item.get("severity") or "").strip()
            blocking = item.get("blocking")
            text = " - ".join(part for part in (code, message) if part)
            meta = ", ".join(
                part
                for part in (
                    severity if severity else None,
                    "blocking"
                    if blocking is True
                    else "non-blocking"
                    if blocking is False
                    else None,
                )
                if part
            )
            if meta:
                text = f"{text} ({meta})" if text else meta
            if text:
                items.append(text)
            continue
        text = str(item).strip()
        if text:
            items.append(text)
    return items


def _normalize_inline_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def _truncate_words(text: str, max_words: int = 125) -> str:
    words = [word for word in _normalize_inline_text(text).split(" ") if word]
    if len(words) <= max_words:
        return " ".join(words)
    return f"{' '.join(words[:max_words])}.".replace("..", ".")


def _reason_items(value: Any) -> list[str]:
    if isinstance(value, list):
        return [_normalize_inline_text(item) for item in value if _normalize_inline_text(item)]
    text = _normalize_inline_text(value)
    return [text] if text else []


def _display(value: Any) -> str:
    if value is None or value == "":
        return "N/A"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, float):
        return _format_number(value)
    return str(value)


def _display_dash(value: Any) -> str:
    text = _display(value)
    return "-" if text == "N/A" else text


def _format_datetime(value: Any) -> str:
    if not value:
        return "N/A"
    text = str(value)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed.strftime("%Y-%m-%d %H:%M UTC")
    except ValueError:
        return text


def _format_number(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return _display(value) if value is not None else "N/A"
    if number != number or number in {float("inf"), float("-inf")}:
        return "N/A"
    if number.is_integer():
        return f"{number:,.0f}"
    return f"{number:,.2f}".rstrip("0").rstrip(".")


def _format_price(value: Any, ticker: str, market: str) -> str:
    if value is None or value == "":
        return "N/A"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if number != number or number in {float("inf"), float("-inf")}:
        return "N/A"
    if market == "ID" or ticker.endswith(".JK"):
        return f"Rp {number:,.0f}"
    return f"${number:,.2f}".rstrip("0").rstrip(".")


def _format_market_cap(value: Any, currency: Any) -> str:
    if value is None or value == "":
        return "N/A"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if number != number or number in {float("inf"), float("-inf")}:
        return "N/A"

    currency_code = str(currency or "").upper()
    if not currency_code:
        return _format_number(number)

    is_idr = currency_code == "IDR"
    divisor = 1_000_000_000 if is_idr else 1_000_000
    scale = "Bn" if is_idr else "Mn"
    return f"{number / divisor:,.1f} {currency_code} {scale}"


def _format_percent(value: Any) -> str:
    if value is None or value == "":
        return "N/A"
    if isinstance(value, (int, float)):
        return f"{value:g}%"
    return str(value)


def _unit_suffix(unit: Any) -> str:
    text = str(unit or "")
    if re.search(r"\bBn\b", text, re.IGNORECASE):
        return "Bn"
    if re.search(r"\bMn\b", text, re.IGNORECASE):
        return "Mn"
    if "%" in text:
        return "%"
    if "/share" in text.lower():
        return text
    if re.search(r"\bx\b", text, re.IGNORECASE) or "ratio" in text.lower():
        return "x"
    return ""


def _append_financial_unit(value: Any, unit: Any) -> str:
    if value is None or value == "":
        return "-"
    text = str(value).strip()
    if text in {"-", "N/A"} or text.lower() in {"source unavailable", "none", "null", "nan"}:
        return "-"
    suffix = _unit_suffix(unit)
    if not suffix:
        return re.sub(r"\s*%", " %", text)
    if suffix == "%":
        base = re.sub(r"\s*%$", "", text)
        return f"{base} %"
    if suffix == "x":
        return text if re.search(r"\s*x$", text, re.IGNORECASE) else f"{text}x"
    if text.lower().endswith(suffix.lower()):
        return text
    return f"{text} {suffix}"


def _financial_cell_display(cell: Any, unit: Any = "") -> str:
    if isinstance(cell, dict):
        if cell.get("status") in {"unavailable", "source_unavailable"}:
            return "-"
        value = cell.get("display") if cell.get("display") is not None else cell.get("value")
        displayed = _append_financial_unit(value, unit)
        return (
            f"{displayed} EST"
            if cell.get("status") == "estimated" and displayed != "-"
            else displayed
        )
    return _append_financial_unit(cell, unit)


def _risk_reward_display(result: dict[str, Any]) -> str:
    if result.get("risk_reward_display"):
        return str(result["risk_reward_display"])
    if result.get("risk_reward_ratio") is None or result.get("risk_reward_ratio") == "":
        return "N/A"
    return "1:3"


def _row(label: str, value: Any) -> dict[str, str]:
    return {"label": label, "value": _display(value)}
