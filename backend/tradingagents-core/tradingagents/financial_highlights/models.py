from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

FinancialPeriodType = Literal["annual", "quarter"]
FinancialValueStatus = Literal["reported", "calculated", "estimated", "unavailable"]


@dataclass(frozen=True)
class FinancialPeriod:
    key: str
    label: str
    type: FinancialPeriodType
    year: int
    quarter: int | None = None


@dataclass
class FinancialCell:
    value: float | None
    display: str
    status: FinancialValueStatus
    source_vendor: str | None = None
    source_field: str | None = None
    formula: str | None = None


@dataclass
class FinancialHighlightRow:
    key: str
    label: str
    unit: str
    values: dict[str, FinancialCell] = field(default_factory=dict)


@dataclass
class FinancialHighlights:
    title: str
    currency: str | None
    scale: str
    analysis_date: str
    period_logic: str
    periods: list[FinancialPeriod]
    rows: list[FinancialHighlightRow]
    notes: list[str]
    data_quality: dict[str, Any]


def to_dict(highlights: FinancialHighlights | None) -> dict[str, Any] | None:
    if highlights is None:
        return None
    return asdict(highlights)
