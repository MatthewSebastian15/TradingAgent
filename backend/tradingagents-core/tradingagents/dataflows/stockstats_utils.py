import logging
import time
from datetime import timedelta
from typing import Annotated

import pandas as pd
from dateutil.relativedelta import relativedelta
from stockstats import wrap
from yfinance.exceptions import YFRateLimitError

from tradingagents.yfinance_runtime import yf


logger = logging.getLogger(__name__)

_retryable_yf_errors: list[type[BaseException]] = [
    YFRateLimitError,
    ConnectionError,
    TimeoutError,
]

try:  # requests is a direct dependency, but keep import defensive for packaging.
    from requests import exceptions as requests_exceptions

    _retryable_yf_errors.extend(
        [
            requests_exceptions.ConnectionError,
            requests_exceptions.Timeout,
            requests_exceptions.ReadTimeout,
        ]
    )
except Exception:  # pragma: no cover - dependency absence only
    pass

try:  # yfinance may surface curl_cffi request exceptions on newer versions.
    from curl_cffi.requests import exceptions as curl_exceptions

    _retryable_yf_errors.extend(
        [
            curl_exceptions.ConnectionError,
            curl_exceptions.Timeout,
            curl_exceptions.RequestsError,
        ]
    )
except Exception:  # pragma: no cover - optional dependency shape varies
    pass

_RETRYABLE_YF_EXCEPTIONS = tuple(dict.fromkeys(_retryable_yf_errors))


def yf_retry(func, max_retries=3, base_delay=2.0):
    """Execute a yfinance call with exponential backoff on transient failures.

    yfinance raises YFRateLimitError on HTTP 429 responses and can also surface
    network timeouts/connection errors from requests or curl_cffi. Retry only
    those transient failures; other exceptions still propagate immediately.
    """
    for attempt in range(max_retries + 1):
        try:
            return func()
        except _RETRYABLE_YF_EXCEPTIONS as exc:
            if attempt < max_retries:
                delay = base_delay * (2**attempt)
                logger.warning(
                    "Yahoo Finance transient failure (%s), retrying in %.0fs (attempt %d/%d)",
                    exc,
                    delay,
                    attempt + 1,
                    max_retries,
                )
                time.sleep(delay)
            else:
                raise


def _clean_dataframe(data: pd.DataFrame) -> pd.DataFrame:
    """Normalize a stock DataFrame for stockstats: parse dates, drop invalid rows, fill price gaps."""
    data["Date"] = pd.to_datetime(data["Date"], errors="coerce")
    data = data.dropna(subset=["Date"])

    price_cols = [c for c in ["Open", "High", "Low", "Close", "Volume"] if c in data.columns]
    data[price_cols] = data[price_cols].apply(pd.to_numeric, errors="coerce")
    data = data.dropna(subset=["Close"])
    data[price_cols] = data[price_cols].ffill().bfill()

    return data


def load_ohlcv(symbol: str, curr_date: str) -> pd.DataFrame:
    """Fetch OHLCV data without cache, filtered to prevent look-ahead bias.

    Price and indicator data must be anchored to the requested trade_date on
    every run. The old file cache could serve a stale YoY window and make local
    indicators disagree with the Analysis/Chart price snapshot, so this path
    always downloads fresh data.
    """
    curr_date_dt = pd.to_datetime(curr_date)

    current_dt = curr_date_dt.to_pydatetime()
    start_dt = current_dt - relativedelta(years=1)
    fetch_end_dt = current_dt + timedelta(days=1)
    start_str = start_dt.strftime("%Y-%m-%d")
    fetch_end_str = fetch_end_dt.strftime("%Y-%m-%d")

    data = yf_retry(
        lambda: yf.download(
            symbol,
            start=start_str,
            end=fetch_end_str,
            multi_level_index=False,
            progress=False,
            auto_adjust=True,
            threads=False,
        )
    )

    if data is None or data.empty:
        data = yf_retry(
            lambda: yf.Ticker(symbol).history(
                start=start_str,
                end=fetch_end_str,
                auto_adjust=True,
            )
        )

    if data is None or data.empty:
        return pd.DataFrame(columns=["Date", "Open", "High", "Low", "Close", "Volume"])

    data = data.reset_index()
    data = _clean_dataframe(data)

    # Filter to curr_date to prevent look-ahead bias in backtesting.
    data = data[data["Date"] <= curr_date_dt]

    return data


def filter_financials_by_date(data: pd.DataFrame, curr_date: str) -> pd.DataFrame:
    """Drop financial statement columns (fiscal period timestamps) after curr_date.

    yfinance financial statements use fiscal period end dates as columns.
    Columns after curr_date represent future data and are removed to
    prevent look-ahead bias.
    """
    if not curr_date or data.empty:
        return data
    cutoff = pd.Timestamp(curr_date)
    mask = pd.to_datetime(data.columns, errors="coerce") <= cutoff
    return data.loc[:, mask]


class StockstatsUtils:
    @staticmethod
    def get_stock_stats(
        symbol: Annotated[str, "ticker symbol for the company"],
        indicator: Annotated[str, "quantitative indicators based off of the stock data for the company"],
        curr_date: Annotated[str, "curr date for retrieving stock price data, YYYY-mm-dd"],
    ):
        data = load_ohlcv(symbol, curr_date)
        df = wrap(data)
        df["Date"] = df["Date"].dt.strftime("%Y-%m-%d")
        curr_date_str = pd.to_datetime(curr_date).strftime("%Y-%m-%d")

        df[indicator]  # trigger stockstats to calculate the indicator
        matching_rows = df[df["Date"].str.startswith(curr_date_str)]

        if not matching_rows.empty:
            indicator_value = matching_rows[indicator].values[0]
            return indicator_value
        else:
            return "N/A: Not a trading day (weekend or holiday)"
