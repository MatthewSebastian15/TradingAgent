from __future__ import annotations

from tradingagents.dataflows.dividend_data import build_dividend_status


def test_no_dividend_history_reason():
    result = build_dividend_status(ticker="GOTO.JK", dividends=[])
    assert result["dividend_status"] == "no_dividend_history"
    assert result["reason"]


def test_negative_earnings_payout_not_applicable():
    result = build_dividend_status(
        ticker="TEST.JK",
        dividends=[{"amount": 10, "ex_date": "2026-01-01"}],
        latest_price=100,
        net_profit=-1,
    )
    assert result["dividend_status"] == "not_applicable_negative_earnings"
    assert result["payout_ratio"] is None
