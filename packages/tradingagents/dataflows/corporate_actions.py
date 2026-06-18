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


def _action_from_dict(value: CorporateAction | dict[str, Any]) -> CorporateAction:
    if isinstance(value, CorporateAction):
        return value
    return CorporateAction(
        ticker=str(value.get("ticker") or ""),
        action_type=str(value.get("action_type") or value.get("type") or "").lower(),
        effective_date=str(
            value.get("effective_date") or value.get("ex_date") or value.get("date") or ""
        ),
        announcement_date=value.get("announcement_date"),
        ratio=_float(value.get("ratio")),
        cash_amount=_float(value.get("cash_amount") or value.get("amount")),
        currency=value.get("currency"),
        source=str(value.get("source") or "unknown"),
    )


def _float(value: Any) -> float | None:
    try:
        number = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return number if number == number else None


ACTION_TYPES = {
    "split",
    "reverse_split",
    "cash_dividend",
    "stock_dividend",
    "rights_issue",
    "bonus_share",
}


def adjustment_factor(action: CorporateAction) -> float:
    if action.action_type in {"stock_split", "split"} and action.ratio and action.ratio > 0:
        return 1 / float(action.ratio)
    if action.action_type in {"reverse_split"} and action.ratio and action.ratio > 0:
        return float(action.ratio)
    return 1.0


def _action_note(action: CorporateAction, factor: float) -> str:
    date = f" effective {action.effective_date[:10]}" if action.effective_date else ""
    if action.action_type in {"split", "stock_split"} and action.ratio:
        return f"split 1:{action.ratio:g}{date}"
    if action.action_type == "reverse_split" and action.ratio:
        return f"reverse_split {action.ratio:g}:1{date}"
    if action.action_type in {"cash_dividend", "dividend"}:
        suffix = f" {action.cash_amount:g}" if action.cash_amount else ""
        return f"cash_dividend{suffix}{date}"
    if factor == 1.0 and action.action_type in {"split", "stock_split", "reverse_split"}:
        return f"{action.action_type} invalid ratio{date}"
    return f"{action.action_type}{date}".strip()


def _applies_to_row(row_date: str, action: CorporateAction) -> bool:
    # Historical adjustment applies to rows on/before the effective date.
    effective = str(action.effective_date or "")[:10]
    if not row_date or not effective:
        return False
    return row_date <= effective


def annotate_adjusted_close(
    row: dict[str, Any], actions: list[CorporateAction | dict[str, Any]]
) -> dict[str, Any]:
    result = dict(row)
    close = result.get("close") or result.get("Close") or result.get("raw_close")
    try:
        adjusted = float(close)
    except (TypeError, ValueError):
        adjusted = None
    notes: list[str] = []
    warnings: list[str] = []
    dividend_adjustment_applied = False
    factor = 1.0
    row_date = str(result.get("date") or result.get("Date") or "")[:10]
    for raw_action in actions or []:
        action = _action_from_dict(raw_action)
        if not _applies_to_row(row_date, action):
            continue
        if action.action_type in {"cash_dividend", "dividend"}:
            notes.append("cash_dividend")
            notes.append(_action_note(action, 1.0))
            # Cash-dividend total-return adjustment depends on source-specific
            # ex-date rules. Stage 1 records the event without mutating close.
            continue
        action_factor = adjustment_factor(action)
        if action.action_type in {"split", "stock_split", "reverse_split"} and action_factor == 1.0:
            warnings.append(f"invalid ratio for {action.action_type} on {action.effective_date}")
        factor *= action_factor
        if action.action_type:
            notes.append(_action_note(action, action_factor))
    result["raw_close"] = close
    result["adjusted_close"] = adjusted * factor if adjusted is not None else None
    result["adjustment_factor"] = factor
    result["corporate_action_notes"] = list(dict.fromkeys(notes))
    result["corporate_action_warnings"] = list(dict.fromkeys(warnings))
    result["dividend_adjustment_applied"] = dividend_adjustment_applied
    return result


def apply_corporate_action_adjustments(
    price_rows: list[dict[str, Any]], actions: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Return rows annotated with raw/adjusted close and action notes."""
    normalized_actions = [
        _action_from_dict(action) for action in actions or [] if isinstance(action, dict)
    ]
    if not price_rows:
        return []
    if not normalized_actions:
        result = []
        for row in price_rows:
            close = row.get("close") or row.get("Close") or row.get("raw_close")
            copied = dict(row)
            copied.setdefault("raw_close", close)
            copied.setdefault("adjusted_close", _float(close))
            copied.setdefault("adjustment_factor", 1.0)
            copied.setdefault("corporate_action_notes", [])
            copied.setdefault("corporate_action_warnings", [])
            copied.setdefault("dividend_adjustment_applied", False)
            result.append(copied)
        return result
    return [annotate_adjusted_close(row, normalized_actions) for row in price_rows]
