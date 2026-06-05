from __future__ import annotations

from tradingagents.dataflows.period_metadata import (
    build_annual_period_metadata,
    build_quarter_period_metadata,
    infer_period_metadata,
)


def test_annual_period_metadata_schema():
    period = build_annual_period_metadata(2024, currency="idr", unit="million")
    assert period["period_label"] == "FY2024"
    assert period["period_type"] == "annual"
    assert period["period_end"] == "2024-12-31"
    assert period["currency"] == "IDR"


def test_quarter_is_not_annual():
    period = build_quarter_period_metadata(2026, 1)
    assert period["period_label"] == "FY2026Q1"
    assert period["period_type"] == "quarter"
    assert period["fiscal_quarter"] == 1


def test_infer_period_metadata_restated():
    period = infer_period_metadata("FY2023", is_restated=True)
    assert period["is_restated"] is True
