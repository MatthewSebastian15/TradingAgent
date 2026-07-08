from __future__ import annotations

import pytest
from tradingagents.dataflows.market.technical_calculator import (
    atr_value,
    calculate_sma,
    calculate_technical_fallback,
    rsi_value,
)

# Classic Wilder RSI reference series (StockCharts example).
WILDER_CLOSES = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
                 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00]  # fmt: skip


def test_rsi_matches_wilder_reference():
    assert rsi_value(WILDER_CLOSES[:15]) == pytest.approx(70.46, abs=0.01)
    # The 16th close applies Wilder smoothing, not a plain window average.
    assert rsi_value(WILDER_CLOSES) == pytest.approx(66.25, abs=0.01)


def test_rsi_flat_series_is_neutral():
    assert rsi_value([100.0] * 20) == 50.0


def test_atr_constant_true_range():
    rows = [{"high": 101.0, "low": 99.0, "close": 100.0} for _ in range(40)]
    assert atr_value(rows) == 2.0


def test_atr_short_history_degrades_to_plain_average():
    rows = [{"high": 102.0, "low": 98.0, "close": 100.0} for _ in range(5)]
    assert atr_value(rows) == 4.0
    assert atr_value([]) is None


def test_sma_200_requires_history():
    short = calculate_technical_fallback([{"close": i} for i in range(1, 51)])
    assert short["sma_50"]["value"] == sum(range(1, 51)) / 50
    assert short["sma_50"]["status"] == "calculated"
    assert short["sma_200"]["value"] is None
    assert short["sma_200"]["reason"] == "insufficient_history"
    assert short["reasons"]["sma_200"] == "insufficient_history"


def test_calculate_sma_window():
    assert calculate_sma([1, 2, 3], 2) == 2.5
