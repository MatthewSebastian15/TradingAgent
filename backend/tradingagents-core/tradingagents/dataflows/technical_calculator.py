"""Local technical indicator fallback calculations from OHLCV history."""

from __future__ import annotations

import math
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


def _volatility(closes: list[float]) -> float | None:
    if len(closes) < 2:
        return None
    returns = []
    for prev, curr in zip(closes, closes[1:]):
        if prev:
            returns.append((curr - prev) / prev)
    if len(returns) < 2:
        return None
    mean = sum(returns) / len(returns)
    variance = sum((value - mean) ** 2 for value in returns) / (len(returns) - 1)
    return math.sqrt(variance) * math.sqrt(252)


def _rsi(closes: list[float], window: int = 14) -> float | None:
    if len(closes) <= window:
        return None
    gains: list[float] = []
    losses: list[float] = []
    for prev, curr in zip(closes[-window - 1 : -1], closes[-window:]):
        change = curr - prev
        if change >= 0:
            gains.append(change)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(abs(change))
    avg_gain = sum(gains) / window
    avg_loss = sum(losses) / window
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def calculate_technical_fallback(price_history: list[dict[str, Any]]) -> dict[str, Any]:
    closes = _closes(price_history)
    result = {
        "sma_20": calculate_sma(closes, 20),
        "sma_50": calculate_sma(closes, 50),
        "sma_200": calculate_sma(closes, 200),
        "volatility_annualized": _volatility(closes),
        "rsi_14": _rsi(closes, 14),
        "source": "local_calculation_from_historical_price",
        "status": "calculated" if closes else "source_unavailable",
        "warnings": [],
        "reasons": {},
    }
    for key, window in {"sma_20": 20, "sma_50": 50, "sma_200": 200}.items():
        if result[key] is None:
            result["reasons"][key] = "insufficient_history"
            result["warnings"].append(f"{key} unavailable: insufficient_history ({len(closes)}/{window} closes)")
    if result["volatility_annualized"] is None:
        result["reasons"]["volatility_annualized"] = "insufficient_history"
    if result["rsi_14"] is None:
        result["reasons"]["rsi_14"] = "insufficient_history"
    return result
