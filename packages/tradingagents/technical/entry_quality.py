from __future__ import annotations

import csv
from collections.abc import Iterable
from io import StringIO
from typing import Any


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return number if number == number and number not in {float("inf"), float("-inf")} else None


def _safe_int(value: Any) -> int | None:
    number = _safe_float(value)
    if number is None:
        return None
    try:
        return int(number)
    except (TypeError, ValueError, OverflowError):
        return None


def _round(value: float | None, digits: int = 2) -> float | None:
    return round(value, digits) if value is not None else None


def _rows_from_csv(value: str) -> list[dict[str, Any]]:
    lines = [
        line for line in value.splitlines() if line.strip() and not line.lstrip().startswith("#")
    ]
    if not lines:
        return []
    rows: list[dict[str, Any]] = []
    for row in csv.DictReader(StringIO("\n".join(lines))):
        if not row:
            continue
        rows.append(
            {
                "date": row.get("Date")
                or row.get("date")
                or row.get("")
                or next(iter(row.values()), ""),
                "open": row.get("Open") or row.get("open"),
                "high": row.get("High") or row.get("high"),
                "low": row.get("Low") or row.get("low"),
                "close": row.get("Close")
                or row.get("close")
                or row.get("Adj Close")
                or row.get("adjusted_close"),
                "adjusted_close": row.get("Adj Close") or row.get("adjusted_close"),
                "volume": row.get("Volume") or row.get("volume"),
            }
        )
    return rows


def _normalize_rows(ohlcv_data: Any) -> list[dict[str, Any]]:
    if isinstance(ohlcv_data, str):
        source_rows = _rows_from_csv(ohlcv_data)
    elif isinstance(ohlcv_data, dict):
        source_rows = ohlcv_data.get("data") or ohlcv_data.get("points") or []
    elif isinstance(ohlcv_data, Iterable):
        source_rows = list(ohlcv_data)
    else:
        source_rows = []

    rows: list[dict[str, Any]] = []
    for item in source_rows:
        if not isinstance(item, dict):
            continue
        date = str(item.get("date") or item.get("Date") or "").strip()
        close = _safe_float(item.get("close") or item.get("Close") or item.get("adjusted_close"))
        open_price = _safe_float(item.get("open") or item.get("Open") or close)
        high = _safe_float(item.get("high") or item.get("High") or close)
        low = _safe_float(item.get("low") or item.get("Low") or close)
        if not date or close is None or open_price is None or high is None or low is None:
            continue
        rows.append(
            {
                "date": date[:10],
                "open": open_price,
                "high": max(high, open_price, close, low),
                "low": min(low, open_price, close, high),
                "close": close,
                "adjusted_close": _safe_float(
                    item.get("adjusted_close") or item.get("Adj Close") or close
                ),
                "volume": _safe_int(item.get("volume") or item.get("Volume")),
            }
        )
    return sorted(rows, key=lambda row: row["date"])


def _sma(values: list[float], window: int) -> float | None:
    if len(values) < window:
        return None
    return sum(values[-window:]) / window


def _ema_series(values: list[float], span: int) -> list[float]:
    if not values:
        return []
    alpha = 2 / (span + 1)
    result = [values[0]]
    for value in values[1:]:
        result.append((value * alpha) + (result[-1] * (1 - alpha)))
    return result


def _rsi(closes: list[float], window: int = 14) -> float | None:
    if len(closes) <= window:
        return None
    changes = [closes[index] - closes[index - 1] for index in range(1, len(closes))]
    recent = changes[-window:]
    gains = [max(change, 0) for change in recent]
    losses = [abs(min(change, 0)) for change in recent]
    avg_gain = sum(gains) / window
    avg_loss = sum(losses) / window
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def _macd(closes: list[float]) -> tuple[float | None, float | None]:
    if len(closes) < 26:
        return None, None
    ema12 = _ema_series(closes, 12)
    ema26 = _ema_series(closes, 26)
    macd_values = [fast - slow for fast, slow in zip(ema12, ema26, strict=False)]
    signal_values = _ema_series(macd_values, 9)
    return macd_values[-1], signal_values[-1] if signal_values else None


def _atr(rows: list[dict[str, Any]], window: int = 14) -> float | None:
    if len(rows) <= window:
        return None
    true_ranges: list[float] = []
    for index, row in enumerate(rows):
        high = float(row["high"])
        low = float(row["low"])
        if index == 0:
            true_ranges.append(high - low)
            continue
        previous_close = float(rows[index - 1]["close"])
        true_ranges.append(max(high - low, abs(high - previous_close), abs(low - previous_close)))
    return sum(true_ranges[-window:]) / window


def _volume_trend(rows: list[dict[str, Any]]) -> str:
    volumes = [int(row["volume"]) for row in rows if row.get("volume") is not None]
    if len(volumes) < 2:
        return "N/A"
    average_volume = sum(volumes) / len(volumes)
    latest_volume = volumes[-1]
    if latest_volume >= average_volume * 1.1:
        return "above_average"
    if latest_volume <= average_volume * 0.9:
        return "below_average"
    return "average"


def _signal_from_rsi(value: float | None) -> str:
    if value is None:
        return "N/A"
    if value >= 70:
        return "overbought"
    if value <= 30:
        return "oversold"
    return "neutral"


def _signal_from_macd(macd: float | None, signal: float | None) -> str:
    if macd is None or signal is None:
        return "N/A"
    if macd > signal:
        return "bullish"
    if macd < signal:
        return "bearish"
    return "neutral"


def _trend(current_price: float, sma20: float | None, sma50: float | None) -> str:
    if sma20 is None or sma50 is None:
        return "N/A"
    if current_price > sma20 > sma50:
        return "uptrend"
    if current_price < sma20 < sma50:
        return "downtrend"
    return "sideways"


def score_to_label(score: float) -> str:
    if score >= 8.0:
        return "Strong Entry"
    if score >= 6.5:
        return "Good Entry"
    if score >= 5.0:
        return "Acceptable Entry"
    if score >= 3.5:
        return "Weak Entry"
    return "Poor Entry"


def calculate_entry_quality(
    price_data: dict,
    trade_levels: dict,
    technical_indicators: dict,
) -> dict:
    """
    Return entry quality score 0.0-10.0 with label, action, drivers,
    or unavailable_reason if data is insufficient.
    """
    price_payload = price_data if isinstance(price_data, dict) else {}
    levels = trade_levels if isinstance(trade_levels, dict) else {}
    technical = technical_indicators if isinstance(technical_indicators, dict) else {}

    current_price = _first_number(
        price_payload.get("current_price"),
        price_payload.get("last_price"),
        price_payload.get("latest_close"),
        levels.get("entry_price"),
        levels.get("entry"),
    )
    entry_price = _first_number(levels.get("entry_price"), levels.get("entry"), current_price)
    stop_loss = _first_number(levels.get("stop_loss"), levels.get("stop"))
    take_profit = _first_number(levels.get("take_profit"), levels.get("target"))
    risk_reward_ratio = _first_number(levels.get("risk_reward_ratio"), levels.get("risk_reward"))
    if (
        current_price is None
        or entry_price is None
        or stop_loss is None
        or (take_profit is None and risk_reward_ratio is None)
    ):
        return _entry_quality_unavailable(
            (
                "Entry quality requires current price, entry, stop loss, and take profit or "
                + "risk/reward ratio."
            )
        )

    direction = _entry_direction(levels)
    components = {
        "trend": _trend_alignment_component(direction, current_price, technical),
        "risk_reward": _risk_reward_component(
            entry_price, stop_loss, take_profit, risk_reward_ratio
        ),
        "volume": _volume_component(price_payload, technical),
        "support_resistance": _support_resistance_component(direction, current_price, technical),
        "volatility": _volatility_component(current_price, technical),
    }
    if components["risk_reward"] is None:
        return _entry_quality_unavailable("Entry quality requires a non-zero risk/reward setup.")

    weights = {
        "trend": 0.30,
        "risk_reward": 0.25,
        "volume": 0.20,
        "support_resistance": 0.15,
        "volatility": 0.10,
    }
    score = 0.0
    for key, weight in weights.items():
        value = components[key]
        score += (0.5 if value is None else value) * weight * 10
    score = max(0.0, min(10.0, round(score, 1)))
    return {
        "score": score,
        "label": score_to_label(score),
        "action": _entry_action(score),
        "drivers": _entry_drivers(components),
        "unavailable_reason": None,
    }


def _entry_quality_unavailable(reason: str) -> dict[str, Any]:
    return {
        "score": None,
        "label": None,
        "action": None,
        "drivers": [],
        "unavailable_reason": reason,
    }


def _first_number(*values: Any) -> float | None:
    for value in values:
        number = _safe_float(value)
        if number is not None:
            return number
    return None


def _entry_direction(levels: dict[str, Any]) -> str:
    text = str(
        levels.get("direction")
        or levels.get("action")
        or levels.get("signal")
        or levels.get("decision")
        or "buy"
    ).lower()
    return "sell" if any(word in text for word in ("sell", "short", "reduce")) else "buy"


def _trend_alignment_component(
    direction: str, current_price: float, technical: dict[str, Any]
) -> float | None:
    trend = str(technical.get("trend") or "").lower()
    sma20 = _safe_float(technical.get("sma_20"))
    sma50 = _safe_float(technical.get("sma_50"))
    macd_signal = str(technical.get("macd_signal") or "").lower()
    if direction == "buy":
        if trend == "uptrend" or (
            sma20 is not None and sma50 is not None and current_price > sma20 > sma50
        ):
            return 1.0
        if trend == "downtrend" or macd_signal == "bearish":
            return 0.2
    else:
        if trend == "downtrend" or (
            sma20 is not None and sma50 is not None and current_price < sma20 < sma50
        ):
            return 1.0
        if trend == "uptrend" or macd_signal == "bullish":
            return 0.2
    if trend == "sideways" or macd_signal == "neutral":
        return 0.5
    return None


def _risk_reward_component(
    entry_price: float,
    stop_loss: float,
    take_profit: float | None,
    risk_reward_ratio: float | None,
) -> float | None:
    risk = abs(entry_price - stop_loss)
    if risk <= 0:
        return None
    ratio = risk_reward_ratio
    if ratio is None:
        if take_profit is None:
            return None
        reward = abs(take_profit - entry_price)
        ratio = reward / risk
    if ratio >= 3:
        return 1.0
    if ratio >= 2:
        return 0.8
    if ratio >= 1.5:
        return 0.65
    if ratio >= 1:
        return 0.4
    return 0.15


def _volume_component(price_data: dict[str, Any], technical: dict[str, Any]) -> float | None:
    volume_trend = str(
        technical.get("volume_trend") or price_data.get("volume_trend") or ""
    ).lower()
    if volume_trend in {"above_average", "strong", "high"}:
        return 1.0
    if volume_trend in {"average", "normal", "neutral"}:
        return 0.65
    if volume_trend in {"below_average", "weak", "low"}:
        return 0.25
    latest_volume = _safe_float(price_data.get("latest_volume"))
    average_volume = _safe_float(price_data.get("average_volume"))
    if latest_volume is not None and average_volume and average_volume > 0:
        ratio = latest_volume / average_volume
        if ratio >= 1.1:
            return 1.0
        if ratio >= 0.9:
            return 0.65
        return 0.25
    return None


def _support_resistance_component(
    direction: str, current_price: float, technical: dict[str, Any]
) -> float | None:
    support = _safe_float(technical.get("support"))
    resistance = _safe_float(technical.get("resistance"))
    if current_price <= 0:
        return None
    if direction == "buy" and support is not None and resistance is not None:
        support_gap_pct = abs(current_price - support) / current_price * 100
        resistance_gap_pct = (resistance - current_price) / current_price * 100
        if support_gap_pct <= 3 and resistance_gap_pct >= 6:
            return 1.0
        if resistance_gap_pct >= 3:
            return 0.65
        return 0.25
    if direction == "sell" and support is not None and resistance is not None:
        support_gap_pct = (current_price - support) / current_price * 100
        resistance_gap_pct = abs(resistance - current_price) / current_price * 100
        if resistance_gap_pct <= 3 and support_gap_pct >= 6:
            return 1.0
        if support_gap_pct >= 3:
            return 0.65
        return 0.25
    return None


def _volatility_component(current_price: float, technical: dict[str, Any]) -> float | None:
    atr = _safe_float(technical.get("atr"))
    if atr is not None and current_price > 0:
        atr_pct = atr / current_price * 100
        if atr_pct <= 2:
            return 1.0
        if atr_pct <= 4:
            return 0.7
        if atr_pct <= 6:
            return 0.45
        return 0.2
    level = str(technical.get("volatility_level") or "").lower()
    if level in {"low", "very low"}:
        return 1.0
    if level == "medium":
        return 0.65
    if level in {"high", "very high"}:
        return 0.25
    return None


def _entry_action(score: float) -> str:
    if score >= 8.0:
        return "Proceed with planned position size"
    if score >= 6.5:
        return "Proceed with reduced position size"
    if score >= 5.0:
        return "Wait for confirmation or reduce position size"
    if score >= 3.5:
        return "Wait for a cleaner entry"
    return "Avoid new entry"


def _entry_drivers(components: dict[str, float | None]) -> list[str]:
    drivers: list[str] = []
    trend = components.get("trend")
    if trend is not None:
        drivers.append(
            "trend aligned with entry direction" if trend >= 0.75 else "trend alignment weak"
        )
    rr = components.get("risk_reward")
    if rr is not None:
        drivers.append("risk/reward ratio acceptable" if rr >= 0.65 else "risk/reward ratio weak")
    volume = components.get("volume")
    if volume is not None:
        drivers.append(
            "volume confirmation strong" if volume >= 0.75 else "volume confirmation weak"
        )
    proximity = components.get("support_resistance")
    if proximity is not None:
        drivers.append(
            "support/resistance proximity favorable"
            if proximity >= 0.65
            else "support/resistance proximity unfavorable"
        )
    volatility = components.get("volatility")
    if volatility is not None:
        drivers.append(
            "volatility condition manageable"
            if volatility >= 0.65
            else "volatility condition elevated"
        )
    return drivers or ["entry quality uses limited technical data"]


def build_technical_entry(
    ohlcv_data: Any, current_price: float | None = None, config: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Build a deterministic technical entry quality payload from normalized OHLCV rows."""
    _ = config
    rows = _normalize_rows(ohlcv_data)
    base_quality = {"status": "insufficient", "missing_fields": []}
    if len(rows) < 30:
        return {
            "available": False,
            "entry_quality": "N/A",
            "trend": "N/A",
            "rsi": None,
            "rsi_signal": "N/A",
            "macd": None,
            "macd_signal_value": None,
            "macd_signal": "N/A",
            "atr": None,
            "sma_20": None,
            "sma_50": None,
            "sma_200": None,
            "support": None,
            "resistance": None,
            "volume_trend": "N/A",
            "reasons": ["At least 30 usable OHLCV rows are required for technical entry quality."],
            "data_quality": {**base_quality, "missing_fields": ["ohlcv_history"]},
        }

    closes = [float(row["close"]) for row in rows]
    latest_close = _safe_float(current_price) or closes[-1]
    sma20 = _sma(closes, 20)
    sma50 = _sma(closes, 50)
    sma200 = _sma(closes, 200)
    rsi = _rsi(closes)
    macd, macd_signal_value = _macd(closes)
    atr = _atr(rows)
    recent_rows = rows[-20:]
    support = min(float(row["low"]) for row in recent_rows)
    resistance = max(float(row["high"]) for row in recent_rows)
    volume_trend = _volume_trend(rows)
    trend = _trend(latest_close, sma20, sma50)
    rsi_signal = _signal_from_rsi(rsi)
    macd_signal = _signal_from_macd(macd, macd_signal_value)

    reasons: list[str] = []
    if sma20 is not None and latest_close > sma20:
        reasons.append("Price is above the 20-day moving average.")
    elif sma20 is not None:
        reasons.append("Price is below the 20-day moving average.")
    if rsi_signal != "N/A":
        reasons.append(f"RSI is {rsi_signal}.")
    if macd_signal != "N/A":
        reasons.append(f"MACD signal is {macd_signal}.")

    distance_to_support = latest_close - support if support is not None else None
    distance_to_resistance = resistance - latest_close if resistance is not None else None
    resistance_gap_pct = (
        (distance_to_resistance / latest_close * 100)
        if latest_close and distance_to_resistance is not None
        else None
    )
    support_gap_pct = (
        (distance_to_support / latest_close * 100)
        if latest_close and distance_to_support is not None
        else None
    )
    atr_pct = (atr / latest_close * 100) if latest_close and atr is not None else None
    if resistance_gap_pct is not None and resistance_gap_pct <= 3:
        reasons.append("Resistance is close to the latest price.")
    if support_gap_pct is not None and support_gap_pct <= 3:
        reasons.append("Support is close to the latest price.")
    if volume_trend != "N/A":
        reasons.append(f"Latest volume is {volume_trend.replace('_', ' ')}.")

    if trend == "downtrend" or rsi_signal == "overbought" or (atr_pct is not None and atr_pct >= 6):
        entry_quality = "risky"
    elif (
        trend == "uptrend"
        and rsi is not None
        and 40 <= rsi <= 65
        and macd_signal == "bullish"
        and distance_to_resistance is not None
        and distance_to_support is not None
        and distance_to_resistance > distance_to_support * 1.4
    ):
        entry_quality = "good"
    else:
        entry_quality = "neutral"

    missing_fields = []
    if sma50 is None:
        missing_fields.append("sma_50")
    if sma200 is None:
        missing_fields.append("sma_200")
    if atr is None:
        missing_fields.append("atr")

    return {
        "available": True,
        "entry_quality": entry_quality,
        "trend": trend,
        "rsi": _round(rsi),
        "rsi_signal": rsi_signal,
        "macd": _round(macd),
        "macd_signal_value": _round(macd_signal_value),
        "macd_signal": macd_signal,
        "atr": _round(atr),
        "sma_20": _round(sma20),
        "sma_50": _round(sma50),
        "sma_200": _round(sma200),
        "support": _round(support),
        "resistance": _round(resistance),
        "volume_trend": volume_trend,
        "reasons": reasons[:6] or ["Technical signals are mixed."],
        "data_quality": {
            "status": "complete" if not missing_fields else "partial",
            "missing_fields": missing_fields,
        },
    }
