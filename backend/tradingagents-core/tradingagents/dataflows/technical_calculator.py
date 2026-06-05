"""Local technical indicator fallback calculations from OHLCV history."""

from __future__ import annotations

from typing import Any


def calculate_sma(closes: list[float], window: int) -> float | None:
    if window <= 0 or len(closes) < window:
        return None
    return sum(closes[-window:]) / window


def _closes(price_history: list[dict[str, Any]]) -> list[float]:
    values: list[float] = []
    for row in price_history or []:
        try:
            value = float(row.get("close") or row.get("Close"))
        except (AttributeError, TypeError, ValueError):
            continue
        if value == value:
            values.append(value)
    return values


def calculate_technical_fallback(price_history: list[dict[str, Any]]) -> dict[str, Any]:
    closes = _closes(price_history)
    return {
        "sma_20": calculate_sma(closes, 20),
        "sma_50": calculate_sma(closes, 50),
        "sma_200": calculate_sma(closes, 200),
        "source": "local_calculation_from_historical_price",
        "status": "calculated" if closes else "source_unavailable",
    }
