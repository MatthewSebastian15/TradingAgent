from __future__ import annotations

from tradingagents.dataflows.technical_calculator import calculate_sma, calculate_technical_fallback


def test_sma_200_requires_history():
    short = calculate_technical_fallback([{"close": i} for i in range(1, 51)])
    assert short["sma_50"]["value"] == sum(range(1, 51)) / 50
    assert short["sma_50"]["status"] == "calculated"
    assert short["sma_200"]["value"] is None
    assert short["sma_200"]["reason"] == "insufficient_history"
    assert short["reasons"]["sma_200"] == "insufficient_history"


def test_calculate_sma_window():
    assert calculate_sma([1, 2, 3], 2) == 2.5
