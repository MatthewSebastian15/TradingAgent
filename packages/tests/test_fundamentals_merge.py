from tradingagents.dataflows.fundamentals.financial_rows import FinancialRow
from tradingagents.dataflows.fundamentals.merge import merge_financial_rows_yfinance_first


def _row(source: str, **values) -> FinancialRow:
    return FinancialRow(
        symbol="AAPL",
        period="2023",
        period_type="annual",
        currency="USD",
        unit="raw",
        source=source,
        as_of_date="2023-12-31",
        **values,
    )


def test_yfinance_kept_over_finnhub_conflict():
    merged = merge_financial_rows_yfinance_first(
        [_row("yfinance", revenue=100.0)], [_row("finnhub", revenue=90.0)]
    )
    row = merged["rows"][0]
    assert row.revenue == 100.0
    assert merged["field_quality"]["revenue"]["source"] == "yfinance"
    assert any("kept yfinance" in warning for warning in merged["metadata"]["warnings"])
    assert merged["metadata"]["fallback_used"] is False
    assert merged["metadata"]["source"] == "yfinance"


def test_finnhub_fills_gap():
    merged = merge_financial_rows_yfinance_first(
        [_row("yfinance", revenue=100.0)], [_row("finnhub", net_profit=10.0)]
    )
    row = merged["rows"][0]
    assert row.net_profit == 10.0
    assert row.fallback is True
    assert row.source == "mixed"
    assert "net_profit" in merged["metadata"]["filled_by_fallback"]
    quality = merged["field_quality"]["net_profit"]
    assert quality["source"] == "finnhub"
    assert quality["fallback"] is True
    assert merged["metadata"]["source"] == "mixed"


def test_finnhub_only_period_appended():
    extra = FinancialRow(
        symbol="AAPL",
        period="2022",
        period_type="annual",
        currency="USD",
        unit="raw",
        source="finnhub",
        revenue=80.0,
    )
    merged = merge_financial_rows_yfinance_first([_row("yfinance", revenue=100.0)], [extra])
    assert len(merged["rows"]) == 2
    appended = merged["rows"][1]
    assert appended.fallback is True
    assert appended.fallback_source == "finnhub"


def test_empty_inputs():
    merged = merge_financial_rows_yfinance_first(None, None)
    assert merged["rows"] == []
    assert merged["metadata"]["source"] == "unavailable"
    assert "revenue" in merged["metadata"]["missing_fields"]


def test_field_missing_from_both_vendors_tracked():
    merged = merge_financial_rows_yfinance_first([_row("yfinance", revenue=100.0)], [])
    assert merged["field_quality"]["net_profit"]["confidence"] == "unavailable"
    assert "net_profit" in merged["metadata"]["missing_fields"]
