from __future__ import annotations

import csv
import logging
from datetime import datetime
from io import StringIO

from dateutil.relativedelta import relativedelta

from .alpha_vantage_common import _make_api_request

logger = logging.getLogger(__name__)

SUPPORTED_INDICATORS: dict[str, tuple[str, str | None, str | None, str | None]] = {
    "close_50_sma": ("SMA", "SMA", "50", "close"),
    "close_200_sma": ("SMA", "SMA", "200", "close"),
    "close_10_ema": ("EMA", "EMA", "10", "close"),
    "macd": ("MACD", "MACD", None, "close"),
    "macds": ("MACD", "MACD_Signal", None, "close"),
    "macdh": ("MACD", "MACD_Hist", None, "close"),
    "rsi": ("RSI", "RSI", None, "close"),
    "boll": ("BBANDS", "Real Middle Band", "20", "close"),
    "boll_ub": ("BBANDS", "Real Upper Band", "20", "close"),
    "boll_lb": ("BBANDS", "Real Lower Band", "20", "close"),
    "atr": ("ATR", "ATR", None, None),
    "vwma": ("VWMA", None, None, "close"),
}

INDICATOR_DESCRIPTIONS = {
    ("close_50_sma"): (
        "50 SMA: A medium-term trend indicator. Usage: Identify trend direction and serve as "
        + "dynamic support/resistance. Tips: It lags price; combine with faster indicators for "
        + "timely signals."
    ),
    ("close_200_sma"): (
        "200 SMA: A long-term trend benchmark. Usage: Confirm overall market trend and identify "
        + "golden/death cross setups. Tips: It reacts slowly; best for strategic trend "
        + "confirmation rather than frequent trading entries."
    ),
    ("close_10_ema"): (
        "10 EMA: A responsive short-term average. Usage: Capture quick shifts in momentum and "
        + "potential entry points. Tips: Prone to noise in choppy markets; use alongside longer "
        + "averages for filtering false signals."
    ),
    ("macd"): (
        "MACD: Computes momentum via differences of EMAs. Usage: Look for crossovers and "
        + "divergence as signals of trend changes. Tips: Confirm with other indicators in "
        + "low-volatility or sideways markets."
    ),
    ("macds"): (
        "MACD Signal: An EMA smoothing of the MACD line. Usage: Use crossovers with the MACD "
        + "line to trigger trades. Tips: Should be part of a broader strategy to avoid false "
        + "positives."
    ),
    ("macdh"): (
        "MACD Histogram: Shows the gap between the MACD line and its signal. Usage: Visualize "
        + "momentum strength and spot divergence early. Tips: Can be volatile; complement with "
        + "additional filters in fast-moving markets."
    ),
    ("rsi"): (
        "RSI: Measures momentum to flag overbought/oversold conditions. Usage: Apply 70/30 "
        + "thresholds and watch for divergence to signal reversals. Tips: In strong trends, RSI "
        + "may remain extreme; always cross-check with trend analysis."
    ),
    ("boll"): (
        "Bollinger Middle: A 20 SMA serving as the basis for Bollinger Bands. Usage: Acts as a "
        + "dynamic benchmark for price movement. Tips: Combine with the upper and lower bands to "
        + "effectively spot breakouts or reversals."
    ),
    ("boll_ub"): (
        "Bollinger Upper Band: Typically 2 standard deviations above the middle line. Usage: "
        + "Signals potential overbought conditions and breakout zones. Tips: Confirm signals with "
        + "other tools; prices may ride the band in strong trends."
    ),
    ("boll_lb"): (
        "Bollinger Lower Band: Typically 2 standard deviations below the middle line. Usage: "
        + "Indicates potential oversold conditions. Tips: Use additional analysis to avoid false "
        + "reversal signals."
    ),
    ("atr"): (
        "ATR: Averages true range to measure volatility. Usage: Set stop-loss levels and adjust "
        + "position sizes based on current market volatility. Tips: It's a reactive measure, so "
        + "use it as part of a broader risk management strategy."
    ),
    ("vwma"): (
        "VWMA: A moving average weighted by volume. Usage: Confirm trends by integrating price "
        + "action with volume data. Tips: Watch for skewed results from volume spikes; use in "
        + "combination with other volume analyses."
    ),
}


def _build_indicator_params(
    symbol: str,
    indicator: str,
    interval: str,
    time_period: int,
    series_type: str,
) -> tuple[str, dict[str, str]]:
    function_name, _target_column, mapped_period, required_series_type = SUPPORTED_INDICATORS[
        indicator
    ]
    params = {
        "symbol": symbol,
        "interval": interval,
        "datatype": "csv",
    }
    if required_series_type:
        params["series_type"] = required_series_type or series_type
    if mapped_period:
        params["time_period"] = mapped_period
    elif function_name in {"RSI", "ATR"}:
        params["time_period"] = str(time_period)
    return function_name, params


def _parse_indicator_csv(
    csv_data: str,
    indicator: str,
    start_date: datetime,
    end_date: datetime,
) -> tuple[list[tuple[datetime, str]], str | None]:
    reader = csv.DictReader(StringIO(csv_data.strip()))
    if not reader.fieldnames:
        return [], f"Error: No data returned for {indicator}"
    if "time" not in reader.fieldnames:
        return (
            [],
            f"Error: 'time' column not found in data for {indicator}. "
            f"Available columns: {reader.fieldnames}",
        )

    target_column = SUPPORTED_INDICATORS[indicator][1]
    if not target_column:
        return [], f"Error: Indicator {indicator} does not expose a CSV value column."
    if target_column not in reader.fieldnames:
        return (
            [],
            f"Error: Column '{target_column}' not found for indicator '{indicator}'. "
            f"Available columns: {reader.fieldnames}",
        )

    rows: list[tuple[datetime, str]] = []
    for row in reader:
        date_str = (row.get("time") or "").strip()
        value = (row.get(target_column) or "").strip()
        if not date_str or not value:
            continue
        try:
            date_value = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            continue
        if start_date <= date_value <= end_date:
            rows.append((date_value, value))

    rows.sort(key=lambda item: item[0])
    return rows, None


def _format_indicator_result(
    indicator: str,
    start_date: datetime,
    end_date: str,
    rows: list[tuple[datetime, str]],
) -> str:
    if rows:
        values = "".join(
            f"{date_value.strftime('%Y-%m-%d')}: {value}\n" for date_value, value in rows
        )
    else:
        values = "No data available for the specified date range.\n"

    return (
        f"## {indicator.upper()} values from {start_date.strftime('%Y-%m-%d')} to {end_date}:\n\n"
        + values
        + "\n\n"
        + INDICATOR_DESCRIPTIONS.get(indicator, "No description available.")
    )


def get_indicator(
    symbol: str,
    indicator: str,
    curr_date: str,
    look_back_days: int,
    interval: str = "daily",
    time_period: int = 14,
    series_type: str = "close",
) -> str:
    """Return Alpha Vantage technical indicator values over a time window."""
    if indicator not in SUPPORTED_INDICATORS:
        raise ValueError(
            f"Indicator {indicator} is not supported. Please choose from: "
            f"{list(SUPPORTED_INDICATORS.keys())}"
        )

    if indicator == "vwma":
        return (
            f"## VWMA (Volume Weighted Moving Average) for {symbol}:\n\n"
            + (
                "VWMA calculation requires OHLCV data and is not directly available from Alpha "
                + "Vantage API.\n"
            )
            + (
                "This indicator would need to be calculated from the raw stock data using "
                + "volume-weighted price averaging.\n"
                + "\n"
            )
            + f"{INDICATOR_DESCRIPTIONS['vwma']}"
        )

    try:
        curr_date_dt = datetime.strptime(curr_date, "%Y-%m-%d")
        start_date = curr_date_dt - relativedelta(years=1)
        function_name, params = _build_indicator_params(
            symbol, indicator, interval, time_period, series_type
        )
        data = _make_api_request(function_name, params)
        if not isinstance(data, str) or not data.strip():
            return f"Error: No data returned for {indicator}"

        rows, parse_error = _parse_indicator_csv(data, indicator, start_date, curr_date_dt)
        if parse_error:
            return parse_error
        return _format_indicator_result(indicator, start_date, curr_date, rows)
    except Exception as exc:
        logger.warning("Error getting Alpha Vantage indicator data for %s: %s", indicator, exc)
        return f"Error retrieving {indicator} data: {exc}"
