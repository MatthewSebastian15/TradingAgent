from __future__ import annotations

from tradingagents.dataflows.fundamentals.normalizers import (
    normalize_financial_field,
    normalize_financial_value,
    parse_numeric_value,
)


def test_normalizes_million_idr():
    result = normalize_financial_value(106_000_000, unit="million", currency="idr")
    assert result["normalized_value"] == 106_000_000_000_000
    assert result["normalized_currency"] == "IDR"


def test_normalizes_compact_rupiah_suffix_and_na():
    result = normalize_financial_value("Rp 1.2T")
    assert result["normalized_value"] == 1_200_000_000_000
    assert normalize_financial_value("N/A")["normalized_value"] is None
    assert normalize_financial_value("N/A")["status"] == "source_unavailable"


def test_normalizes_thousand_separator_string():
    assert normalize_financial_value("1,234")["normalized_value"] == 1234


def test_parse_numeric_currency_string():
    assert parse_numeric_value("Rp 1.2T") == 1_200_000_000_000
    assert parse_numeric_value("IDR 500 billion") == 500_000_000_000


def test_normalize_financial_field_million():
    result = normalize_financial_field(100, unit="million", currency="IDR")
    assert result["normalized_value"] == 100_000_000
    assert result["normalized_currency"] == "IDR"
