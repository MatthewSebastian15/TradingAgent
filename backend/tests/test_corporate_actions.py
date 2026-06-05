from __future__ import annotations

from tradingagents.dataflows.corporate_actions import apply_corporate_action_adjustments


def test_split_adjusts_historical_close():
    rows = [{"date": "2026-01-01", "close": 100}, {"date": "2026-01-03", "close": 50}]
    adjusted = apply_corporate_action_adjustments(rows, [{"ticker": "A.JK", "action_type": "split", "effective_date": "2026-01-02", "ratio": 2}])
    assert adjusted[0]["adjusted_close"] == 50
    assert adjusted[1]["adjusted_close"] == 50


def test_cash_dividend_adds_note_without_price_mutation():
    adjusted = apply_corporate_action_adjustments(
        [{"date": "2026-01-01", "close": 100}],
        [{"ticker": "A.JK", "action_type": "cash_dividend", "effective_date": "2026-01-01", "cash_amount": 5}],
    )
    assert adjusted[0]["adjusted_close"] == 100
    assert "cash_dividend" in adjusted[0]["corporate_action_notes"]
