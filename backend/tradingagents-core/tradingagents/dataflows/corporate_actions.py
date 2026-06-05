"""Corporate action schemas and price-adjustment helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CorporateAction:
    ticker: str
    action_type: str
    effective_date: str
    announcement_date: str | None = None
    ratio: float | None = None
    cash_amount: float | None = None
    currency: str | None = None
    source: str = "unknown"


def adjustment_factor(action: CorporateAction) -> float:
    if action.action_type in {"stock_split", "split"} and action.ratio and action.ratio > 0:
        return 1 / float(action.ratio)
    if action.action_type in {"reverse_split"} and action.ratio and action.ratio > 0:
        return float(action.ratio)
    return 1.0


def annotate_adjusted_close(row: dict[str, Any], actions: list[CorporateAction]) -> dict[str, Any]:
    result = dict(row)
    close = result.get("close") or result.get("raw_close")
    try:
        adjusted = float(close)
    except (TypeError, ValueError):
        adjusted = None
    notes: list[str] = []
    factor = 1.0
    row_date = str(result.get("date") or "")[:10]
    for action in actions or []:
        if action.effective_date[:10] == row_date:
            factor *= adjustment_factor(action)
            notes.append(action.action_type)
    result["raw_close"] = close
    result["adjusted_close"] = adjusted * factor if adjusted is not None else None
    result["adjustment_factor"] = factor
    result["corporate_action_notes"] = notes
    return result
