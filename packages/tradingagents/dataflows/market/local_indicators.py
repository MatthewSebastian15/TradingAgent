from __future__ import annotations

from typing import Any

import pandas as pd


def _to_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def calculate_local_indicators(price_df: pd.DataFrame) -> dict[str, Any]:
    """Calculate technical indicators from OHLCV data without vendor calls."""
    if price_df is None or price_df.empty:
        return {
            "available": False,
            "reason": "No OHLCV data available for local indicator calculation.",
        }

    df = price_df.copy()
    df.columns = [str(col).lower() for col in df.columns]

    close_col = "close"
    high_col = "high"
    low_col = "low"
    volume_col = "volume"

    if close_col not in df.columns:
        return {
            "available": False,
            "reason": "Close column missing from OHLCV data.",
        }

    close = pd.to_numeric(df[close_col], errors="coerce")
    result: dict[str, Any] = {
        "available": True,
        "source": "local_ohlcv",
        "close_50_sma": _to_float(close.rolling(50).mean().iloc[-1]) if len(close) >= 50 else None,
        "close_200_sma": _to_float(close.rolling(200).mean().iloc[-1])
        if len(close) >= 200
        else None,
    }

    delta = close.diff()
    # Wilder smoothing (ewm alpha=1/14) to match standard charting-platform RSI/ATR values.
    gain = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    rs = gain / loss.replace(0, pd.NA)
    rsi = 100 - (100 / (1 + rs))
    result["rsi"] = _to_float(rsi.iloc[-1])

    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    result["macd"] = _to_float(macd.iloc[-1])
    result["macd_signal"] = _to_float(signal.iloc[-1])

    sma20 = close.rolling(20).mean()
    std20 = close.rolling(20).std()
    result["boll_ub"] = _to_float((sma20 + 2 * std20).iloc[-1])
    result["boll_lb"] = _to_float((sma20 - 2 * std20).iloc[-1])

    if high_col in df.columns and low_col in df.columns:
        high = pd.to_numeric(df[high_col], errors="coerce")
        low = pd.to_numeric(df[low_col], errors="coerce")
        prev_close = close.shift(1)
        tr = pd.concat(
            [
                high - low,
                (high - prev_close).abs(),
                (low - prev_close).abs(),
            ],
            axis=1,
        ).max(axis=1)
        result["atr"] = _to_float(
            tr.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean().iloc[-1]
        )
    else:
        result["atr"] = None

    if high_col in df.columns and low_col in df.columns and volume_col in df.columns:
        high = pd.to_numeric(df[high_col], errors="coerce")
        low = pd.to_numeric(df[low_col], errors="coerce")
        volume = pd.to_numeric(df[volume_col], errors="coerce")
        typical_price = (high + low + close) / 3
        money_flow = typical_price * volume
        positive_flow = money_flow.where(typical_price > typical_price.shift(1), 0)
        negative_flow = money_flow.where(typical_price < typical_price.shift(1), 0)
        money_ratio = positive_flow.rolling(14).sum() / negative_flow.rolling(14).sum().replace(
            0, pd.NA
        )
        mfi = 100 - (100 / (1 + money_ratio))
        result["mfi"] = _to_float(mfi.iloc[-1])
    else:
        result["mfi"] = None

    return result
