"""Merge normalized financial rows with yfinance-primary, finnhub-fallback policy.

Extracted from normalizers.py. Pure row-merging — depends only on the
FinancialRow contract.
"""

from __future__ import annotations

from typing import Any

from .financial_rows import FINANCIAL_ROW_FIELDS, FinancialRow


def _copy_financial_row(row: FinancialRow) -> FinancialRow:
    return FinancialRow(**row.to_dict())


def _period_key(row: FinancialRow) -> tuple[str, str]:
    return (str(row.period_type or ""), str(row.period or ""))


def _field_quality_entry(
    *,
    source: str | None,
    confidence: str,
    fallback: bool = False,
    fallback_source: str | None = None,
    estimated: bool = False,
    as_of_date: str | None = None,
    unavailable_reason: str | None = None,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "source": source,
        "confidence": confidence,
        "estimated": estimated,
        "fallback": fallback,
        "as_of_date": as_of_date,
    }
    if fallback_source:
        entry["fallback_source"] = fallback_source
    if unavailable_reason:
        entry["unavailable_reason"] = unavailable_reason
    return entry


def merge_financial_rows_yfinance_first(
    yfinance_rows: list[FinancialRow] | None,
    finnhub_rows: list[FinancialRow] | None,
) -> dict[str, Any]:
    """Merge normalized rows with YFinance primary and Finnhub fallback only."""
    primary_rows = list(yfinance_rows or [])
    fallback_rows = list(finnhub_rows or [])
    fallback_by_period = {_period_key(row): row for row in fallback_rows}
    merged_rows: list[FinancialRow] = []
    filled_by_fallback: list[str] = []
    warnings: list[str] = []
    field_quality: dict[str, dict[str, Any]] = {}

    for primary in primary_rows:
        merged = _copy_financial_row(primary)
        fallback = fallback_by_period.pop(_period_key(primary), None)
        for field in FINANCIAL_ROW_FIELDS:
            primary_value = getattr(merged, field)
            fallback_value = getattr(fallback, field) if fallback else None
            if primary_value is not None:
                field_quality[field] = _field_quality_entry(
                    source="yfinance",
                    confidence=merged.source_confidence or "high",
                    fallback=False,
                    as_of_date=merged.as_of_date,
                )
                if fallback_value is not None:
                    message = f"{field} available from yfinance and finnhub; kept yfinance."
                    warnings.append(message)
                    merged.warnings.append(message)
                continue
            if fallback_value is not None:
                setattr(merged, field, fallback_value)
                merged.fallback = True
                merged.fallback_source = "finnhub"
                merged.source = "mixed"
                merged.source_confidence = "medium"
                filled_by_fallback.append(field)
                field_quality[field] = _field_quality_entry(
                    source="finnhub",
                    confidence="medium",
                    fallback=True,
                    fallback_source="finnhub",
                    as_of_date=fallback.as_of_date,
                )
                continue
            field_quality.setdefault(
                field,
                _field_quality_entry(
                    source=None,
                    confidence="unavailable",
                    as_of_date=merged.as_of_date,
                    unavailable_reason="field_not_returned_by_yfinance_or_finnhub",
                ),
            )
        merged_rows.append(merged)

    for fallback in fallback_by_period.values():
        row = _copy_financial_row(fallback)
        row.fallback = True
        row.fallback_source = "finnhub"
        row.warnings.append(
            "Entire period supplied by Finnhub fallback because YFinance period was unavailable."
        )
        for field in FINANCIAL_ROW_FIELDS:
            if getattr(row, field) is not None:
                filled_by_fallback.append(field)
                field_quality.setdefault(
                    field,
                    _field_quality_entry(
                        source="finnhub",
                        confidence="medium",
                        fallback=True,
                        fallback_source="finnhub",
                        as_of_date=row.as_of_date,
                    ),
                )
        merged_rows.append(row)

    missing_fields = sorted(
        field
        for field in FINANCIAL_ROW_FIELDS
        if not any(getattr(row, field) is not None for row in merged_rows)
    )
    fallback_used = bool(filled_by_fallback)
    metadata = {
        "source": "mixed"
        if fallback_used
        else "yfinance"
        if primary_rows
        else "finnhub"
        if fallback_rows
        else "unavailable",
        "source_priority": ["yfinance", "finnhub"],
        "fallback_used": fallback_used,
        "fallback_source": "finnhub" if fallback_used else None,
        "missing_fields": missing_fields,
        "filled_by_fallback": sorted(set(filled_by_fallback)),
        "warnings": list(dict.fromkeys(warnings)),
    }
    return {"rows": merged_rows, "metadata": metadata, "field_quality": field_quality}
