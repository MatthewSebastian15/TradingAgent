from __future__ import annotations

import math
import statistics
from typing import Any

from tradingagents.utils.normalization import number as _number


def _round(value: float | None, digits: int = 2) -> float | None:
    return round(value, digits) if value is not None else None


def _ohlcv_rows(price_chart: dict[str, Any] | None) -> list[dict[str, Any]]:
    chart = price_chart if isinstance(price_chart, dict) else {}
    rows = chart.get("data") or chart.get("points") or []
    if not isinstance(rows, list):
        return []
    normalized = [
        row for row in rows if isinstance(row, dict) and _number(row.get("close")) is not None
    ]
    return sorted(normalized, key=lambda row: str(row.get("date") or ""))


def _annualized_volatility(closes: list[float]) -> float | None:
    returns = [
        (closes[index] - closes[index - 1]) / closes[index - 1]
        for index in range(1, len(closes))
        if closes[index - 1] not in (0, None)
    ]
    if len(returns) < 2:
        return None
    return statistics.stdev(returns) * math.sqrt(252) * 100


def _max_drawdown(closes: list[float]) -> float | None:
    peak: float | None = None
    max_drawdown = 0.0
    for close in closes:
        if peak is None or close > peak:
            peak = close
            continue
        if peak:
            max_drawdown = min(max_drawdown, ((close - peak) / peak) * 100)
    return max_drawdown


def _atr(rows: list[dict[str, Any]], period: int = 14) -> float | None:
    true_ranges: list[float] = []
    previous_close: float | None = None
    for row in rows:
        high = _number(row.get("high"))
        low = _number(row.get("low"))
        close = _number(row.get("close"))
        if high is None or low is None:
            previous_close = close
            continue
        if previous_close is None:
            true_range = high - low
        else:
            true_range = max(high - low, abs(high - previous_close), abs(low - previous_close))
        if true_range >= 0:
            true_ranges.append(true_range)
        previous_close = close
    if not true_ranges:
        return None
    window = true_ranges[-period:]
    return sum(window) / len(window)


def _risk_bucket(
    volatility: float | None,
    max_drawdown: float | None,
    atr: float | None,
    latest_close: float | None,
) -> str:
    atr_percent = (atr / latest_close * 100) if atr is not None and latest_close else None
    if (
        (volatility is not None and volatility >= 35)
        or (max_drawdown is not None and max_drawdown <= -25)
        or (atr_percent is not None and atr_percent >= 6)
    ):
        return "high"
    if (
        (volatility is not None and volatility >= 18)
        or (max_drawdown is not None and max_drawdown <= -12)
        or (atr_percent is not None and atr_percent >= 3)
    ):
        return "medium"
    if volatility is None and max_drawdown is None and atr is None:
        return "unknown"
    return "low"


def build_market_risk(
    price_chart: dict[str, Any] | None,
    price_performance: dict[str, Any] | None = None,
    technical_entry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    rows = _ohlcv_rows(price_chart)
    closes = [_number(row.get("close")) for row in rows]
    closes = [value for value in closes if value is not None]
    summary = price_performance if isinstance(price_performance, dict) else {}
    technical = technical_entry if isinstance(technical_entry, dict) else {}

    volatility = _annualized_volatility(closes)
    drawdown = _number(summary.get("max_drawdown_percent"))
    if drawdown is None:
        drawdown = _max_drawdown(closes)

    atr = _number(technical.get("atr"))
    if atr is None:
        atr = _atr(rows)

    highs = [_number(row.get("high")) for row in rows]
    lows = [_number(row.get("low")) for row in rows]
    highs = [value for value in highs if value is not None]
    lows = [value for value in lows if value is not None and value > 0]
    period_high = _number(summary.get("period_high")) or (max(highs) if highs else None)
    period_low = _number(summary.get("period_low")) or (min(lows) if lows else None)
    price_range = (
        ((period_high - period_low) / period_low * 100)
        if period_high is not None and period_low
        else None
    )
    latest_close = closes[-1] if closes else None
    bucket = _risk_bucket(volatility, drawdown, atr, latest_close)

    notes = []
    if volatility is None:
        notes.append("Volatility is unavailable because there are not enough price returns.")
    else:
        notes.append(f"Volatility is {bucket} for the selected price window.")
    if drawdown is None:
        notes.append("Max drawdown is unavailable because price history is incomplete.")
    else:
        notes.append("Max drawdown uses the largest peak-to-trough decline in the selected window.")

    return {
        "volatility_percent": _round(volatility),
        "max_drawdown_percent": _round(drawdown),
        "atr": _round(atr),
        "price_range_percent": _round(price_range),
        "risk_bucket": bucket,
        "notes": notes,
    }
