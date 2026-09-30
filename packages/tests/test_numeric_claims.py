from __future__ import annotations

from tradingagents.pipeline_balanced.numeric_claims import unverified_numbers

FACTS = {
    "stop_loss": 9150,
    "rsi": 64.83,
    "latest_revenue": 45_312_000_000_000,
    "return_20d_percent": -3.42,
    "confidence_percent": 72,
}


def test_matching_numbers_in_both_locales_and_scales_pass():
    text = (
        "Stop at 9.150 and RSI near 65. Revenue reached 45,3 triliun while the 20-day return "
        "was -3.4%. Confidence is 72% over 3 months with 1:3 R:R on 2026-09-14 at 10:30 in 2026."
    )
    assert unverified_numbers(text, FACTS) == []


def test_invented_numbers_are_reported_once():
    text = "Target 12,000 soon; analysts see 12,000 and a 38% upside."
    assert unverified_numbers(text, FACTS) == ["12,000", "38%"]
