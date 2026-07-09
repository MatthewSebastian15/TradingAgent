import logging
import math
import random
import time
from datetime import timedelta
from typing import Annotated

import pandas as pd
from dateutil.relativedelta import relativedelta

try:
    from stockstats import wrap
except ImportError:  # pragma: no cover - dependency may be absent before install

    def wrap(data):
        return data


try:
    from yfinance.exceptions import YFRateLimitError
except ImportError:  # pragma: no cover - dependency may be absent before install

    class YFRateLimitError(Exception):
        pass


from tradingagents import env
from tradingagents.utils_resilience import call_with_timeout
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
except ImportError:  # pragma: no cover - dependency absence only
    logger.warning(
        "requests exception classes are unavailable for Yahoo Finance retry mapping", exc_info=True
    )

try:  # yfinance may surface curl_cffi request exceptions on newer versions.
    from curl_cffi.requests import exceptions as curl_exceptions

    _retryable_yf_errors.extend(
        error_cls
        for error_cls in (
            getattr(curl_exceptions, "ConnectionError", None),
            getattr(curl_exceptions, "Timeout", None),
            getattr(curl_exceptions, "RequestsError", None),
        )
        if isinstance(error_cls, type) and issubclass(error_cls, BaseException)
    )
except ImportError:  # pragma: no cover - optional dependency absence only
    logger.warning(
        "curl_cffi exception classes are unavailable for Yahoo Finance retry mapping", exc_info=True
    )

_RETRYABLE_YF_EXCEPTIONS = tuple(dict.fromkeys(_retryable_yf_errors))


def _env_float(name: str, default: float, *, min_value: float = 0.0) -> float:
    return env.floating(name, default, min_value=min_value)


_YFINANCE_CALL_TIMEOUT_SECONDS = _env_float("YFINANCE_CALL_TIMEOUT_SECONDS", 20.0, min_value=1.0)
_YFINANCE_TOTAL_TIMEOUT_SECONDS = _env_float("YFINANCE_TOTAL_TIMEOUT_SECONDS", 45.0, min_value=1.0)
_YFINANCE_RETRY_MAX_DELAY_SECONDS = _env_float(
    "YFINANCE_RETRY_MAX_DELAY_SECONDS", 8.0, min_value=0.0
)


def yf_deadline(total_timeout_seconds: float | None = None) -> float:
    """Return a shared deadline for one Yahoo Finance provider attempt chain."""

    budget = (
        _YFINANCE_TOTAL_TIMEOUT_SECONDS
        if total_timeout_seconds is None
        else max(1.0, total_timeout_seconds)
    )
    return time.monotonic() + budget


def _remaining_budget(deadline: float | None) -> float:
    if deadline is None:
        return _YFINANCE_TOTAL_TIMEOUT_SECONDS
    return max(0.0, deadline - time.monotonic())


def _retry_delay(attempt: int, base_delay: float, remaining: float) -> float:
    base = min(_YFINANCE_RETRY_MAX_DELAY_SECONDS, base_delay * (2**attempt))
    jitter = random.uniform(0.0, min(1.0, base * 0.25))
    return min(remaining, base + jitter)


def yf_retry(
    func,
    max_retries=3,
    base_delay=2.0,
    *,
    timeout_seconds: float | None = None,
    deadline: float | None = None,
    service_name: str = "yfinance",
):
    """Execute a yfinance call with hard timeout, total budget, and jittered backoff.

    yfinance raises YFRateLimitError on HTTP 429 responses and can also surface
    network timeouts/connection errors from requests or curl_cffi. Retry only
    those transient failures; other exceptions still propagate immediately.
    """

    call_timeout = (
        _YFINANCE_CALL_TIMEOUT_SECONDS if timeout_seconds is None else max(1.0, timeout_seconds)
    )
    deadline = yf_deadline() if deadline is None else deadline

    for attempt in range(max_retries + 1):
        remaining = _remaining_budget(deadline)
        if remaining <= 0:
            raise TimeoutError(f"{service_name} exceeded total timeout budget")

        try:
            return call_with_timeout(
                func,
                timeout_seconds=max(1, math.ceil(min(call_timeout, remaining))),
                service_name=service_name,
            )
        except _RETRYABLE_YF_EXCEPTIONS as exc:
            if attempt >= max_retries:
                raise

            remaining = _remaining_budget(deadline)
            delay = _retry_delay(attempt, base_delay, remaining)
            if delay <= 0:
                continue
            logger.warning(
                "Yahoo Finance transient failure (%s), retrying in %.2fs (attempt %d/%d)",
                exc,
                delay,
                attempt + 1,
                max_retries,
            )
            time.sleep(delay)


def _clean_dataframe(data: pd.DataFrame) -> pd.DataFrame:
    "Normalize a stock DataFrame for stockstats: parse dates, drop invalid rows, fill price gaps."
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

    deadline = yf_deadline()
    data = yf_retry(
        lambda: yf.download(
            symbol,
            start=start_str,
            end=fetch_end_str,
            multi_level_index=False,
            progress=False,
            auto_adjust=True,
            threads=False,
        ),
        deadline=deadline,
        service_name="yfinance.download",
    )

    if data is None or data.empty:
        data = yf_retry(
            lambda: yf.Ticker(symbol).history(
                start=start_str,
                end=fetch_end_str,
                auto_adjust=True,
            ),
            deadline=deadline,
            service_name="yfinance.history",
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
        indicator: Annotated[
            str, "quantitative indicators based off of the stock data for the company"
        ],
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
