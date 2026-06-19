from __future__ import annotations

from tradingagents.dataflows.fundamentals.period_metadata import (
    attach_period_metadata_to_rows,
    build_annual_period_metadata,
    build_quarter_period_metadata,
    infer_period_metadata,
)


def test_annual_period_metadata_schema():
    period = build_annual_period_metadata(
        2024, reported_date="2025-03-31", currency="idr", unit="million"
    )
    assert period["period_label"] == "FY2024"
    assert period["period_type"] == "annual"
    assert period["period_end"] == "2024-12-31"
    assert period["as_of_date"] == "2025-03-31"
    assert period["currency"] == "IDR"


def test_quarter_is_not_annual():
    period = build_quarter_period_metadata(2026, 1)
    assert period["period_label"] == "Q1 2026"
    assert period["period_type"] == "quarterly"
    assert period["fiscal_quarter"] == 1


def test_infer_period_metadata_restated():
    period = infer_period_metadata("FY2023", is_restated=True)
    assert period["is_restated"] is True


def test_infer_period_metadata_from_quarter_date():
    period = infer_period_metadata("2026-03-31")
    assert period["period_label"] == "Q1 2026"
    assert period["period_type"] == "quarterly"


def test_annual_hint_keeps_year_end_date_as_fy_period():
    period = infer_period_metadata("2025-12-31", period_type_hint="annual")
    assert period["period_label"] == "FY2025"
    assert period["period_type"] == "annual"


def test_quarter_hint_keeps_quarter_display_period():
    period = infer_period_metadata("2026-03-31", period_type_hint="quarterly")
    assert period["period_label"] == "Q1 2026"
    assert period["period_type"] == "quarterly"


def test_attach_period_metadata_to_rows():
    rows = [{"fiscalDateEnding": "2024-12-31", "revenue": 100}]
    result = attach_period_metadata_to_rows(rows, default_period_type="annual")
    assert result[0]["period"]["period_label"] == "FY2024"
    assert result[0]["period"]["as_of_date"] == "2024-12-31"
