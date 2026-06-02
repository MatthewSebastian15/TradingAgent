from __future__ import annotations

from tradingagents.financial_highlights.formatter import (
    convert_amount,
    format_currency_scaled,
    format_percent,
    format_ratio,
)


def test_format_percent_adds_percent_symbol():
    assert format_percent(7.4) == "7.40%"


def test_format_percent_none_returns_na():
    assert format_percent(None) == "N/A"


def test_format_ratio_adds_x_symbol():
    assert format_ratio(0.51) == "0.51x"


def test_format_currency_scaled_uses_thousand_separator():
    assert format_currency_scaled(124193.8) == "124,193.8"


def test_convert_amount_tracks_source_unit_without_double_division():
    assert convert_amount(1_250_000_000, source_unit="raw", scale_divisor=1_000_000_000) == 1.25
    assert convert_amount(1_250, source_unit="million", scale_divisor=1_000_000_000) == 1.25
    assert convert_amount(1.25, source_unit="billion", scale_divisor=1_000_000_000) == 1.25
