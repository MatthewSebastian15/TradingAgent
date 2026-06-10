from __future__ import annotations

from datetime import date, datetime

from .models import FinancialPeriod

FUNDAMENTAL_HISTORY_START_YEAR = 2023


def parse_analysis_date(value: str | date | None) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value.strip():
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    return date.today()


def get_calendar_quarter(month: int) -> int:
    return ((month - 1) // 3) + 1


def _fy_key(year: int) -> str:
    return f"FY{str(year)[-2:]}"


def _annual_period(year: int) -> FinancialPeriod:
    key = _fy_key(year)
    label = f"FY {year}"
    return FinancialPeriod(
        key=key,
        label=label,
        type="annual",
        year=year,
        display_period=label,
        sort_key=f"{year}-12-31",
    )


def _quarter_period(year: int, quarter: int) -> FinancialPeriod:
    key = f"{_fy_key(year)}Q{quarter}"
    label = f"Q{quarter} {year}"
    quarter_end = {1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31"}[quarter]
    return FinancialPeriod(
        key=key,
        label=label,
        type="quarterly",
        year=year,
        quarter=quarter,
        display_period=label,
        sort_key=f"{year}-{quarter_end}",
    )


def resolve_financial_highlight_periods(analysis_date: str | date | None) -> list[FinancialPeriod]:
    current = parse_analysis_date(analysis_date)
    year = current.year
    quarter = get_calendar_quarter(current.month)

    periods = [_annual_period(item) for item in range(FUNDAMENTAL_HISTORY_START_YEAR, year)]
    if quarter > 1:
        periods.extend(_quarter_period(year, item) for item in range(1, quarter))
    return periods
