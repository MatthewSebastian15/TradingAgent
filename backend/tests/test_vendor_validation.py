from __future__ import annotations

from tradingagents.dataflows.validators import (
    validate_fundamental_consistency,
    validate_price_consistency,
    validate_volume_consistency,
)


def test_price_conflict_above_tolerance():
    warnings = validate_price_consistency({"yfinance": 1000, "finnhub": 1060})
    assert warnings
    assert "last_price conflict" in warnings[0]
    assert "tolerance=3.0%" in warnings[0]


def test_price_no_conflict_within_tolerance():
    warnings = validate_price_consistency({"yfinance": 1000, "finnhub": 1010})
    assert warnings == []


def test_volume_conflict_above_tolerance():
    warnings = validate_volume_consistency({"yfinance": 1_000_000, "alpha_vantage": 1_300_000})
    assert warnings
    assert "volume conflict" in warnings[0]


def test_fundamental_conflict_above_tolerance():
    warnings = validate_fundamental_consistency(
        "revenue",
        {"idx_official": 100_000_000, "yfinance": 112_000_000},
    )
    assert warnings
    assert "revenue conflict" in warnings[0]
