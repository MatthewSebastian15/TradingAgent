"""Local technical indicator fallback calculations from OHLCV history."""

from __future__ import annotations

import math
from typing import Any

SOURCE = "local_calculation_from_historical_price"


class IndicatorValue(dict):
    """Dict payload that still compares equal to its numeric value."""

    def __eq__(self, other: object) -> bool:
        if isinstance(other, (int, float)):
            return self.get("value") == other
        return super().__eq__(other)


def calculate_sma(closes: list[float], window: int) -> float | None:
    closes = [float(x) for x in closes if x is not None]
    if window <= 0 or len(closes) < window:
        return None
    return sum(closes[-window:]) / window


def extract_closes(price_history: list[dict[str, Any]] | str | Any) -> list[float]:
    if hasattr(price_history, "to_dict"):
        try:
            price_history = price_history.to_dict("records")
        except Exception:
            price_history = []
    if isinstance(price_history, str):
        import csv
        from io import StringIO

        rows = []
        try:
            for row in csv.DictReader(StringIO(price_history)):
                rows.append(row)
        except csv.Error:
            rows = []
        price_history = rows
    values: list[float] = []
    for row in price_history or []:
        try:
            value = float(row.get("close") or row.get("Close") or row.get("adj close") or row.get("Adj Close"))
        except (AttributeError, TypeError, ValueError):
            continue
        if value == value:
            values.append(value)
    return values


def calculate_volatility(closes: list[float]) -> dict[str, Any]:
    if len(closes) < 2:
        return build_indicator_value(None, "volatility", len(closes), 2)
    returns = []
    for prev, curr in zip(closes, closes[1:], strict=False):
        if prev:
            returns.append((curr - prev) / prev)
    if len(returns) < 2:
        return build_indicator_value(None, "volatility", len(closes), 3)
    mean = sum(returns) / len(returns)
    variance = sum((value - mean) ** 2 for value in returns) / (len(returns) - 1)
    return build_indicator_value(math.sqrt(variance) * math.sqrt(252), "volatility", len(closes), 3)


def calculate_rsi(closes: list[float], window: int = 14) -> dict[str, Any]:
    if len(closes) <= window:
        return build_indicator_value(None, "rsi_14", len(closes), window + 1)
    gains: list[float] = []
    losses: list[float] = []
    for prev, curr in zip(closes[-window - 1 : -1], closes[-window:], strict=False):
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
        return build_indicator_value(100.0, "rsi_14", len(closes), window + 1)
    rs = avg_gain / avg_loss
    return build_indicator_value(100 - (100 / (1 + rs)), "rsi_14", len(closes), window + 1)


def build_indicator_value(value: float | None, name: str, available_points: int, required_points: int) -> dict[str, Any]:
    if value is None:
        return IndicatorValue({
            "value": None,
            "status": "source_unavailable",
            "source": SOURCE,
            "reason": "insufficient_history",
            "required_points": required_points,
            "available_points": available_points,
            "warnings": [f"{name} unavailable: insufficient_history ({available_points}/{required_points} closes)"],
        })
    return IndicatorValue({
        "value": value,
        "status": "calculated",
        "source": SOURCE,
        "reason": None,
        "required_points": required_points,
        "available_points": available_points,
        "warnings": [],
    })


def calculate_technical_fallback(price_history: list[dict[str, Any]] | str | Any) -> dict[str, Any]:
    closes = extract_closes(price_history)
    result = {
        "sma_20": build_indicator_value(calculate_sma(closes, 20), "sma_20", len(closes), 20),
        "sma_50": build_indicator_value(calculate_sma(closes, 50), "sma_50", len(closes), 50),
        "sma_200": build_indicator_value(calculate_sma(closes, 200), "sma_200", len(closes), 200),
        "volatility": calculate_volatility(closes),
        "rsi_14": calculate_rsi(closes, 14),
        "source": SOURCE,
        "status": "calculated" if closes else "source_unavailable",
        "warnings": [],
        "reasons": {},
    }
    for key in ("sma_20", "sma_50", "sma_200", "volatility", "rsi_14"):
        payload = result[key]
        if isinstance(payload, dict) and payload.get("status") == "source_unavailable":
            result["reasons"][key] = payload.get("reason")
            result["warnings"].extend(payload.get("warnings") or [])
    # Compatibility aliases for older callers that read raw numeric keys.
    result["volatility_annualized"] = result["volatility"]
    return result


def is_missing_indicator(value: Any) -> bool:
    if value in (None, "", [], {}):
        return True
    if isinstance(value, dict):
        status = str(value.get("status") or "").lower()
        if status in {"source_unavailable", "missing", "unavailable", "failed"}:
            return True
        return value.get("value") in (None, "", [], {})
    return False


def indicator_numeric_value(value: Any) -> float | None:
    if isinstance(value, dict):
        value = value.get("value")
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None
