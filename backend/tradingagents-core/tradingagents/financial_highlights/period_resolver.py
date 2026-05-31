from __future__ import annotations

from datetime import date, datetime

from .models import FinancialPeriod


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
    return FinancialPeriod(key=key, label=key, type="annual", year=year)


def _quarter_period(year: int, quarter: int) -> FinancialPeriod:
    key = f"{_fy_key(year)}Q{quarter}"
    return FinancialPeriod(key=key, label=key, type="quarter", year=year, quarter=quarter)


def resolve_financial_highlight_periods(analysis_date: str | date | None) -> list[FinancialPeriod]:
    current = parse_analysis_date(analysis_date)
    year = current.year
    quarter = get_calendar_quarter(current.month)

    if quarter == 1:
        return [_annual_period(item) for item in [year - 4, year - 3, year - 2, year - 1]]

    periods = [_annual_period(item) for item in [year - 3, year - 2, year - 1]]
    periods.extend(_quarter_period(year, item) for item in range(1, quarter))
    return periods
