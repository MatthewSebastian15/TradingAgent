"""Standard period metadata schema for fundamental data."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
from typing import Any


@dataclass(frozen=True)
class PeriodMetadata:
    period_label: str
    period_type: str
    fiscal_year: int | None = None
    fiscal_quarter: int | None = None
    period_start: str | None = None
    period_end: str | None = None
    reported_date: str | None = None
    as_of_date: str | None = None
    is_restated: bool = False
    audit_status: str | None = None
    currency: str = "IDR"
    unit: str = "raw"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _year(value: int | str | None) -> int | None:
    try:
        year = int(str(value)[:4])
    except (TypeError, ValueError):
        return None
    return year if 1900 <= year <= 2200 else None


def build_annual_period_metadata(
    year: int | str,
    *,
    reported_date: str | None = None,
    as_of_date: str | None = None,
    currency: str = "IDR",
    unit: str = "raw",
    is_restated: bool = False,
    audit_status: str | None = None,
) -> dict[str, Any]:
    fiscal_year = _year(year)
    if fiscal_year is None:
        raise ValueError("annual period metadata requires a valid fiscal year")
    return PeriodMetadata(
        period_label=f"FY{fiscal_year}",
        period_type="annual",
        fiscal_year=fiscal_year,
        period_start=f"{fiscal_year}-01-01",
        period_end=f"{fiscal_year}-12-31",
        reported_date=reported_date,
        as_of_date=as_of_date or reported_date,
        is_restated=bool(is_restated),
        audit_status=audit_status,
        currency=str(currency or "IDR").upper(),
        unit=str(unit or "raw").lower(),
    ).to_dict()


def build_quarter_period_metadata(
    year: int | str,
    quarter: int | str,
    *,
    reported_date: str | None = None,
    as_of_date: str | None = None,
    currency: str = "IDR",
    unit: str = "raw",
    is_restated: bool = False,
    audit_status: str | None = None,
) -> dict[str, Any]:
    fiscal_year = _year(year)
    try:
        fiscal_quarter = int(quarter)
    except (TypeError, ValueError):
        fiscal_quarter = 0
    if fiscal_year is None or fiscal_quarter not in {1, 2, 3, 4}:
        raise ValueError("quarter period metadata requires a valid fiscal year and quarter 1-4")
    quarter_end_month_day = {1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31"}[fiscal_quarter]
    quarter_start_month_day = {1: "01-01", 2: "04-01", 3: "07-01", 4: "10-01"}[fiscal_quarter]
    return PeriodMetadata(
        period_label=f"FY{fiscal_year}Q{fiscal_quarter}",
        period_type="quarter",
        fiscal_year=fiscal_year,
        fiscal_quarter=fiscal_quarter,
        period_start=f"{fiscal_year}-{quarter_start_month_day}",
        period_end=f"{fiscal_year}-{quarter_end_month_day}",
        reported_date=reported_date,
        as_of_date=as_of_date or reported_date,
        is_restated=bool(is_restated),
        audit_status=audit_status,
        currency=str(currency or "IDR").upper(),
        unit=str(unit or "raw").lower(),
    ).to_dict()



def build_ttm_period_metadata(
    end_date: str,
    *,
    reported_date: str | None = None,
    as_of_date: str | None = None,
    currency: str = "IDR",
    unit: str = "raw",
    is_restated: bool = False,
    audit_status: str | None = None,
) -> dict[str, Any]:
    parsed = date.fromisoformat(str(end_date)[:10])
    return PeriodMetadata(
        period_label=f"TTM {parsed.year}",
        period_type="ttm",
        fiscal_year=parsed.year,
        fiscal_quarter=None,
        period_start=None,
        period_end=parsed.isoformat(),
        reported_date=reported_date,
        as_of_date=as_of_date or reported_date or parsed.isoformat(),
        is_restated=bool(is_restated),
        audit_status=audit_status,
        currency=str(currency or "IDR").upper(),
        unit=str(unit or "raw").lower(),
    ).to_dict()


def attach_period_metadata_to_rows(
    rows: list[dict[str, Any]] | None,
    default_currency: str = "IDR",
    default_unit: str = "raw",
) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        item = dict(row)
        if not isinstance(item.get("period"), dict):
            label = item.get("period_label") or item.get("period") or item.get("date") or item.get("fiscalDateEnding")
            reported_date = item.get("reported_date") or item.get("reportedDate") or item.get("acceptedDate")
            is_restated = bool(item.get("is_restated") or "restated" in str(item.get("status") or "").lower())
            try:
                item["period"] = infer_period_metadata(
                    str(label or ""),
                    period_end=item.get("period_end") or item.get("fiscalDateEnding"),
                    reported_date=reported_date,
                    currency=item.get("currency") or default_currency,
                    unit=item.get("unit") or default_unit,
                    is_restated=is_restated,
                )
            except Exception:
                period_end = item.get("period_end") or item.get("fiscalDateEnding")
                if period_end:
                    try:
                        item["period"] = build_ttm_period_metadata(
                            str(period_end),
                            reported_date=reported_date,
                            currency=item.get("currency") or default_currency,
                            unit=item.get("unit") or default_unit,
                            is_restated=is_restated,
                        )
                    except Exception:
                        pass
        enriched.append(item)
    return enriched

def infer_period_metadata(
    label: str,
    *,
    period_end: str | None = None,
    reported_date: str | None = None,
    currency: str = "IDR",
    unit: str = "raw",
    is_restated: bool = False,
) -> dict[str, Any]:
    """Infer annual/quarter metadata from common labels like FY2024 or Q1 2026."""
    text = str(label or "").strip().upper().replace(" ", "")
    import re

    if text.startswith("TTM") and period_end:
        return build_ttm_period_metadata(
            period_end,
            reported_date=reported_date,
            currency=currency,
            unit=unit,
            is_restated=is_restated,
        )
    quarter_match = re.search(r"(?:FY)?(20\d{2})Q([1-4])|Q([1-4])(?:FY)?(20\d{2})", text)
    if quarter_match:
        year = quarter_match.group(1) or quarter_match.group(4)
        quarter = quarter_match.group(2) or quarter_match.group(3)
        return build_quarter_period_metadata(
            year,
            quarter,
            reported_date=reported_date,
            currency=currency,
            unit=unit,
            is_restated=is_restated,
        )
    annual_match = re.search(r"(?:FY)?(20\d{2})", text)
    if annual_match:
        return build_annual_period_metadata(
            annual_match.group(1),
            reported_date=reported_date,
            currency=currency,
            unit=unit,
            is_restated=is_restated,
        )
    if period_end:
        try:
            parsed = date.fromisoformat(period_end[:10])
            return build_annual_period_metadata(
                parsed.year,
                reported_date=reported_date,
                currency=currency,
                unit=unit,
                is_restated=is_restated,
            )
        except ValueError:
            pass
    raise ValueError(f"Cannot infer period metadata from label={label!r}")
