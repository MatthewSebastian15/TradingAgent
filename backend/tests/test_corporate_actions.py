from __future__ import annotations

from types import SimpleNamespace

from tradingagents.dataflows import y_finance
from tradingagents.dataflows.corporate_actions import apply_corporate_action_adjustments


def test_split_adjusts_historical_close():
    rows = [{"date": "2026-01-01", "close": 100}, {"date": "2026-01-03", "close": 50}]
    adjusted = apply_corporate_action_adjustments(
        rows,
        [{"ticker": "A.JK", "action_type": "split", "effective_date": "2026-01-02", "ratio": 2}],
    )
    assert adjusted[0]["adjusted_close"] == 50
    assert adjusted[1]["adjusted_close"] == 50


def test_cash_dividend_adds_note_without_price_mutation():
    adjusted = apply_corporate_action_adjustments(
        [{"date": "2026-01-01", "close": 100}],
        [
            {
                "ticker": "A.JK",
                "action_type": "cash_dividend",
                "effective_date": "2026-01-01",
                "cash_amount": 5,
            }
        ],
    )
    assert adjusted[0]["adjusted_close"] == 100
    assert "cash_dividend" in adjusted[0]["corporate_action_notes"]


def test_yfinance_corporate_actions_preserve_distinct_index_dates(monkeypatch):
    class FakeActions:
        empty = False

        def iterrows(self):
            return iter(
                [
                    ("2026-01-02", {"Dividends": 1.25, "Stock Splits": 0.0}),
                    ("2026-02-03", {"Dividends": 0.0, "Stock Splits": 2.0}),
                ]
            )

    monkeypatch.setattr(
        y_finance,
        "yf",
        SimpleNamespace(Ticker=lambda _ticker: SimpleNamespace(actions=FakeActions())),
    )
    monkeypatch.setattr(y_finance, "yf_retry", lambda func: func())

    result = y_finance.get_corporate_actions("AAPL")

    assert result["corporate_actions"] == [
        {
            "ticker": "AAPL",
            "action_type": "cash_dividend",
            "effective_date": "2026-01-02",
            "cash_amount": 1.25,
            "source": "yfinance",
        },
        {
            "ticker": "AAPL",
            "action_type": "split",
            "effective_date": "2026-02-03",
            "ratio": 2.0,
            "source": "yfinance",
        },
    ]
