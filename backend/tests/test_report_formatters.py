"""Unit tests for services/report/formatters.py — pure value formatting."""

from __future__ import annotations

from services.report.formatters import (
    _as_text_list,
    _coalesce,
    _display,
    _financial_cell_display,
    _format_market_cap,
    _format_number,
    _format_percent,
    _format_price,
    _risk_reward_display,
    _row,
    _truncate_words,
)


def test_format_number():
    assert _format_number(1234567) == "1,234,567"
    assert _format_number(1234.5) == "1,234.5"
    assert _format_number(-1234.56) == "-1,234.56"
    assert _format_number(None) == "N/A"
    assert _format_number("abc") == "abc"
    assert _format_number(float("nan")) == "N/A"
    assert _format_number(float("inf")) == "N/A"


def test_format_price_by_market():
    assert _format_price(150.5, "AAPL", "US") == "$150.5"
    assert _format_price(9800, "BBCA.JK", "ID") == "Rp 9,800"
    assert _format_price(9800, "BBCA.JK", "") == "Rp 9,800"  # .JK suffix wins
    assert _format_price(None, "AAPL", "US") == "N/A"
    assert _format_price(-3.25, "AAPL", "US") == "$-3.25"


def test_format_market_cap_scales_by_currency():
    assert _format_market_cap(3_000_000_000_000, "USD") == "3,000,000.0 USD Mn"
    assert _format_market_cap(1_250_000_000_000, "IDR") == "1,250.0 IDR Bn"
    assert _format_market_cap(None, "USD") == "N/A"
    assert _format_market_cap(5_000_000, None) == "5,000,000"


def test_format_percent():
    assert _format_percent(2.5) == "2.5%"
    assert _format_percent(-1) == "-1%"
    assert _format_percent(None) == "N/A"
    assert _format_percent("already 3%") == "already 3%"


def test_display_and_row():
    assert _display(None) == "N/A"
    assert _display(True) == "Yes"
    assert _display(False) == "No"
    assert _display(1.5) == "1.5"
    assert _row("Label", None) == {"label": "Label", "value": "N/A"}


def test_coalesce_skips_none_and_empty():
    assert _coalesce(None, "", "value", "later") == "value"
    assert _coalesce(None, "") is None
    assert _coalesce(0, "x") == 0  # zero is a real value


def test_truncate_words():
    text = " ".join(f"w{i}" for i in range(200))
    truncated = _truncate_words(text, max_words=10)
    assert truncated == "w0 w1 w2 w3 w4 w5 w6 w7 w8 w9."
    assert _truncate_words("short text") == "short text"


def test_as_text_list_formats_warning_dicts():
    items = _as_text_list(
        [
            {"code": "X", "message": "msg", "severity": "warning", "blocking": False},
            "plain",
            "",
            {"code": "", "message": ""},
        ]
    )
    assert items == ["X - msg (warning, non-blocking)", "plain"]
    assert _as_text_list("not-a-list") == []


def test_financial_cell_display():
    assert _financial_cell_display({"status": "unavailable"}) == "-"
    assert _financial_cell_display({"value": "12.3", "status": "estimated"}, "Bn") == "12.3 Bn EST"
    assert _financial_cell_display({"display": "9.9"}, "%") == "9.9 %"
    assert _financial_cell_display(None) == "-"
    assert _financial_cell_display("5.1", "x") == "5.1x"


def test_risk_reward_display():
    assert _risk_reward_display({"risk_reward_display": "1:2"}) == "1:2"
    assert _risk_reward_display({"risk_reward_ratio": 3.0}) == "1:3"
    assert _risk_reward_display({}) == "N/A"
