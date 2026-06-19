import logging
import math
import os
import threading
from collections import OrderedDict
from datetime import datetime, timedelta
from typing import Annotated, Any

import pandas as pd
import pytz
from dateutil.relativedelta import relativedelta

from tradingagents.dataflows.market.stockstats_utils import (
    StockstatsUtils,
    filter_financials_by_date,
    load_ohlcv,
    yf_deadline,
    yf_retry,
)
from tradingagents.yfinance_runtime import yf

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Ticker normalization
# ---------------------------------------------------------------------------


def normalize_ticker(ticker: str) -> str:
    """Normalize a ticker symbol for yfinance.

    A small allowlist of common Indonesian tickers can be submitted without
    ``.JK``. Other plain symbols are preserved exactly so US tickers such as
    AAPL, NVDA, MSFT, and META are not accidentally rewritten to IDX symbols.

    Rules applied in order:
    1. Strip surrounding whitespace and convert to uppercase.
    2. If the symbol already contains an exchange suffix (e.g. ``BBCA.JK``),
       leave it unchanged.
    3. If the symbol is in the common IDX allowlist, append ``.JK``.
    4. Everything else is returned as-is.
    """
    cleaned = ticker.strip().upper()

    # Already has an exchange suffix — honour it.
    if "." in cleaned:
        return cleaned

    idx_auto_suffix = {
        "AALI",
        "ACES",
        "ADRO",
        "AKRA",
        "AMMN",
        "ANTM",
        "ARTO",
        "ASII",
        "BBCA",
        "BBNI",
        "BBRI",
        "BBTN",
        "BMRI",
        "BRIS",
        "BRPT",
        "CPIN",
        "ESSA",
        "EXCL",
        "GOTO",
        "ICBP",
        "INCO",
        "INDF",
        "INKP",
        "INTP",
        "ISAT",
        "ITMG",
        "KLBF",
        "MDKA",
        "MEDC",
        "PGAS",
        "PTBA",
        "SMGR",
        "TLKM",
        "UNTR",
        "UNVR",
    }
    if cleaned in idx_auto_suffix:
        return f"{cleaned}.JK"

    return cleaned


# ---------------------------------------------------------------------------
# Shared yf.Ticker object cache (per-symbol, single Python process)
# ---------------------------------------------------------------------------


def _ticker_cache_max_entries() -> int:
    try:
        return max(1, int(os.getenv("YFINANCE_TICKER_CACHE_MAX_ENTRIES", "512")))
    except ValueError:
        return 512


_TICKER_CACHE_MAX_ENTRIES = _ticker_cache_max_entries()
_ticker_cache: OrderedDict[str, object] = OrderedDict()
_ticker_cache_lock = threading.RLock()


def _get_ticker(symbol: str):
    """Return a cached yf.Ticker instance for *symbol*.

    Creating a new yf.Ticker object for every financial-statement call
    triggers repeated DNS/HTTP resolution for the same instrument. Reusing
    one object per symbol eliminates that overhead inside a single process.
    The cache is bounded LRU so long-running API workers do not retain an
    unbounded number of unique symbols.
    """
    normalized = normalize_ticker(symbol)
    with _ticker_cache_lock:
        cached = _ticker_cache.get(normalized)
        if cached is not None:
            _ticker_cache.move_to_end(normalized)
            return cached

        ticker_obj = yf.Ticker(normalized)
        _ticker_cache[normalized] = ticker_obj
        if len(_ticker_cache) > _TICKER_CACHE_MAX_ENTRIES:
            _ticker_cache.popitem(last=False)
        return ticker_obj


def _currency_for_symbol(symbol: str) -> str:
    normalized = str(symbol or "").upper()
    if normalized.endswith(".JK"):
        return "IDR"
    if normalized.endswith(".HK"):
        return "HKD"
    if normalized.endswith(".T"):
        return "JPY"
    if normalized.endswith(".DE"):
        return "EUR"
    if normalized.endswith(".L"):
        return "GBP"
    return "USD"


def _fast_info_value(fast_info: Any, *names: str) -> Any:
    for name in names:
        try:
            if isinstance(fast_info, dict) and name in fast_info:
                return fast_info[name]
            value = getattr(fast_info, name, None)
            if value is not None:
                return value
        except Exception:
            continue
    return None


def _coerce_positive_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number <= 0:
        return None
    return number


def _inclusive_fetch_end(end_dt: datetime) -> str:
    """Return yfinance's exclusive end date that includes *end_dt*."""
    return (end_dt + timedelta(days=1)).strftime("%Y-%m-%d")


def _normalize_price_dataframe(data: pd.DataFrame | None) -> pd.DataFrame:
    """Normalize raw yfinance OHLCV data without using any price cache."""
    if data is None or data.empty:
        return pd.DataFrame()

    normalized = data.copy()
    if isinstance(normalized.columns, pd.MultiIndex):
        normalized.columns = [str(col[0] if col[0] else col[-1]) for col in normalized.columns]

    normalized = normalized.sort_index()
    normalized = normalized[~normalized.index.duplicated(keep="last")]
    if getattr(normalized.index, "tz", None) is not None:
        normalized.index = normalized.index.tz_localize(None)
    normalized.index = pd.to_datetime(normalized.index, errors="coerce")
    normalized = normalized[normalized.index.notna()]

    numeric_columns = ["Open", "High", "Low", "Close", "Adj Close", "Volume"]
    for col in numeric_columns:
        if col in normalized.columns:
            normalized[col] = pd.to_numeric(normalized[col], errors="coerce")
    if "Close" in normalized.columns:
        normalized = normalized.dropna(subset=["Close"])
    return normalized


def _download_price_history(symbol: str, start_dt: datetime, end_dt: datetime) -> pd.DataFrame:
    """Download historical OHLCV with trade_date-inclusive end and no cache."""
    start_str = start_dt.strftime("%Y-%m-%d")
    fetch_end_str = _inclusive_fetch_end(end_dt)
    deadline = yf_deadline()
    data = yf_retry(
        lambda: yf.download(
            symbol,
            start=start_str,
            end=fetch_end_str,
            multi_level_index=False,
            progress=False,
            auto_adjust=False,
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
                auto_adjust=False,
            ),
            deadline=deadline,
            service_name="yfinance.history",
        )
    return _normalize_price_dataframe(data)


def _with_start_anchor_row(
    data: pd.DataFrame, start_dt: datetime, end_dt: datetime
) -> pd.DataFrame:
    """Keep rows through end_dt and prepend last close <= start_dt when needed."""
    if data is None or data.empty:
        return pd.DataFrame()

    eligible = data[data.index <= end_dt]
    if eligible.empty:
        return pd.DataFrame()

    window_rows = eligible[eligible.index >= start_dt]
    start_candidates = eligible[eligible.index <= start_dt]
    if not start_candidates.empty:
        anchor_row = start_candidates.tail(1)
        anchor_index = anchor_row.index[-1]
        has_exact_start = not window_rows.empty and window_rows.index[0] == anchor_index
        if not has_exact_start:
            window_rows = pd.concat([anchor_row, window_rows])
            window_rows = window_rows[~window_rows.index.duplicated(keep="first")]

    return window_rows.sort_index()


def _last_close_at_or_before(
    data: pd.DataFrame, cutoff_dt: datetime
) -> tuple[float | None, str | None]:
    """Return the last valid close and date at or before cutoff_dt."""
    if data is None or data.empty or "Close" not in data.columns:
        return None, None
    eligible = data[data.index <= cutoff_dt].dropna(subset=["Close"])
    if eligible.empty:
        return None, None
    row = eligible.iloc[-1]
    price = _coerce_positive_float(row.get("Close"))
    if price is None:
        return None, None
    row_date = eligible.index[-1]
    return price, row_date.strftime("%Y-%m-%d")


def fetch_current_price(symbol: str, trade_date: str | None = None) -> dict[str, Any]:
    """Fetch the analysis price anchor once using trade_date as the end date.

    When trade_date is supplied, this intentionally uses the latest historical
    daily close at or before trade_date. This keeps Analysis, trade levels, and
    Chart & Price on the same snapshot instead of mixing a live fast_info quote
    with a daily YOY price window. No price result is served from cache here.
    """
    normalized = normalize_ticker(symbol)
    wib = pytz.timezone("Asia/Jakarta")
    now = datetime.now(wib)
    currency = _currency_for_symbol(normalized)

    if trade_date:
        try:
            cutoff_dt = datetime.strptime(str(trade_date)[:10], "%Y-%m-%d")
            start_dt = cutoff_dt - timedelta(days=14)
            hist = _download_price_history(normalized, start_dt, cutoff_dt)
            price, price_date = _last_close_at_or_before(hist, cutoff_dt)
            if price is None:
                raise ValueError("No historical Close row found at or before trade_date")
            return {
                "price": price,
                "price_currency": currency,
                "price_source": "yfinance:daily:last_close",
                "price_timestamp": price_date,
                "requested_trade_date": cutoff_dt.strftime("%Y-%m-%d"),
                "price_is_fallback": False,
            }
        except Exception as trade_date_exc:
            logger.warning(
                "Unable to fetch trade-date anchored price for %s on %s: %s",
                normalized,
                trade_date,
                trade_date_exc,
            )

    try:
        ticker = yf.Ticker(normalized)
        fast_info = ticker.fast_info
        price = _coerce_positive_float(
            _fast_info_value(fast_info, "last_price", "regularMarketPrice", "lastPrice")
        )
        if price is None:
            raise ValueError("fast_info.last_price returned None or 0")

        return {
            "price": price,
            "price_currency": currency,
            "price_source": "fast_info.last_price",
            "price_timestamp": now.isoformat(),
            "price_is_fallback": False,
        }
    except Exception as primary_exc:
        try:
            now_naive = now.replace(tzinfo=None)
            hist = _download_price_history(
                normalized,
                now_naive - timedelta(days=7),
                now_naive,
            )
            price, price_date = _last_close_at_or_before(hist, now_naive)
            if price is None:
                raise ValueError("history fallback returned no valid Close rows") from primary_exc

            return {
                "price": price,
                "price_currency": currency,
                "price_source": "yfinance:daily:last_close",
                "price_timestamp": price_date,
                "price_is_fallback": False,
            }
        except Exception as fallback_exc:
            logger.warning("Unable to fetch current price for %s: %s", normalized, fallback_exc)
            return {
                "price": None,
                "price_currency": currency,
                "price_source": "unavailable",
                "price_timestamp": now.isoformat(),
                "price_is_fallback": False,
                "warning": str(fallback_exc),
            }


def _volatility_classification(score: float | None) -> str | None:
    if score is None:
        return None
    if score < 20:
        return "Very Low"
    if score < 40:
        return "Low"
    if score < 60:
        return "Moderate"
    if score < 80:
        return "High"
    return "Very High"


def calculate_volatility(symbol: str, trade_date: str | None = None) -> dict[str, Any]:
    """Calculate annualized daily-return volatility on a 0-100 scale."""
    normalized = normalize_ticker(symbol)
    end_dt = datetime.strptime(trade_date, "%Y-%m-%d") if trade_date else datetime.now()
    start_dt = end_dt - relativedelta(years=1)
    # yfinance end is exclusive — add 1 day so trade_date row is included
    fetch_end_dt = end_dt + timedelta(days=1)
    metadata = {
        "volatility_score": None,
        "volatility_scale": "0–100",
        "volatility_method": "Annualized standard deviation of daily returns, normalized to 0–100",
        "volatility_lookback_days": 365,
        "volatility_window": "YoY",
        "volatility_start_date": start_dt.strftime("%Y-%m-%d"),
        "volatility_end_date": end_dt.strftime("%Y-%m-%d"),
        "volatility_classification": None,
    }
    try:
        hist = yf.Ticker(normalized).history(
            start=start_dt.strftime("%Y-%m-%d"),
            end=fetch_end_dt.strftime("%Y-%m-%d"),
        )
        if hist is None or hist.empty or "Close" not in hist:
            return metadata
        returns = hist["Close"].pct_change().dropna()
        if len(returns) < 2:
            return metadata
        annual_vol = float(returns.std()) * math.sqrt(252)
        if not math.isfinite(annual_vol):
            return metadata
        score = round(min(max(annual_vol * 100, 0.0), 100.0), 2)
        metadata["volatility_score"] = score
        metadata["volatility_classification"] = _volatility_classification(score)
        return metadata
    except Exception as exc:
        logger.warning("Unable to calculate volatility for %s: %s", normalized, exc)
        return metadata


def get_yfin_data_online(
    symbol: Annotated[str, "ticker symbol of the company"],
    start_date: Annotated[str, "Start date in yyyy-mm-dd format"],
    end_date: Annotated[str, "End date in yyyy-mm-dd format"],
):

    datetime.strptime(start_date, "%Y-%m-%d")
    datetime.strptime(end_date, "%Y-%m-%d")

    # Normalize ticker (handles IDX suffix e.g. BBCA -> BBCA.JK)
    symbol = normalize_ticker(symbol)

    requested_start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    requested_end_dt = datetime.strptime(end_date, "%Y-%m-%d")

    # Fetch a small internal pre-start buffer so a non-trading YOY anchor such as
    # a weekend/holiday can still use the last close at or before start_date.
    # The requested business window remains start_date -> end_date; this buffer
    # is only to locate the anchor close and is never used as the displayed end.
    internal_start_dt = requested_start_dt - timedelta(days=14)
    data = _download_price_history(symbol, internal_start_dt, requested_end_dt)
    data = _with_start_anchor_row(data, requested_start_dt, requested_end_dt)

    # Check if data is empty
    if data is None or data.empty:
        return f"No data found for symbol '{symbol}' between {start_date} and {end_date}"

    # Round numerical values to 2 decimal places for cleaner display
    numeric_columns = ["Open", "High", "Low", "Close", "Adj Close"]
    for col in numeric_columns:
        if col in data.columns:
            data[col] = pd.to_numeric(data[col], errors="coerce").round(2)

    # Convert DataFrame to CSV string
    csv_string = data.to_csv(index_label="Date")

    # Add header information
    header = f"# Stock data for {symbol.upper()} from {start_date} to {end_date}\n"
    header += f"# Total records: {len(data)}\n"
    header += f"# Data retrieved on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"

    return header + csv_string


def get_stock_stats_indicators_window(
    symbol: Annotated[str, "ticker symbol of the company"],
    indicator: Annotated[str, "technical indicator to get the analysis and report of"],
    curr_date: Annotated[str, "The current trading date you are trading on, YYYY-mm-dd"],
    look_back_days: Annotated[int, "how many days to look back"],
) -> str:

    # Concise one-line descriptions reduce token usage on every LLM call
    # while still giving the agent enough context to interpret each indicator.
    best_ind_params = {
        ("close_50_sma"): (
            "50 SMA: medium-term trend; dynamic support/resistance. Lags price \u2014 combine with "
            + "faster indicators."
        ),
        ("close_200_sma"): (
            "200 SMA: long-term benchmark; golden/death cross confirmation. Reacts slowly "
            "\u2014 use " + "for strategic trend only."
        ),
        ("close_10_ema"): (
            "10 EMA: responsive short-term average for momentum shifts. Prone to noise "
            "\u2014 filter " + "with longer averages."
        ),
        ("macd"): (
            "MACD: momentum via EMA difference; watch crossovers and divergence. Confirm in "
            + "low-volatility markets."
        ),
        ("macds"): (
            "MACD Signal: EMA of MACD; crossovers trigger trades. Use as part of a broader "
            + "strategy."
        ),
        ("macdh"): (
            "MACD Histogram: gap between MACD and signal; visualise momentum strength. Can be "
            + "volatile."
        ),
        ("rsi"): (
            "RSI: overbought (>70) / oversold (<30) momentum. In strong trends RSI may stay "
            + "extreme \u2014 cross-check with trend."
        ),
        ("boll"): (
            "Bollinger Middle: 20 SMA basis; dynamic benchmark. Combine with upper/lower bands "
            + "for breakout signals."
        ),
        ("boll_ub"): (
            "Bollinger Upper: ~2 std above middle; potential overbought / breakout zone. Confirm "
            + "with other tools."
        ),
        ("boll_lb"): (
            "Bollinger Lower: ~2 std below middle; potential oversold zone. Use extra analysis "
            + "to avoid false reversals."
        ),
        ("atr"): (
            "ATR: average true range; set stop-loss and size positions by current volatility. "
            + "Reactive \u2014 part of risk strategy."
        ),
        ("vwma"): (
            "VWMA: volume-weighted moving average; confirm trends with price+volume. Watch for "
            + "spikes skewing results."
        ),
        ("mfi"): (
            "MFI: volume-weighted momentum; overbought (>80) / oversold (<20). Use with "
            + "RSI/MACD; divergence signals reversals."
        ),
    }

    if indicator not in best_ind_params:
        raise ValueError(
            f"Indicator {indicator} is not supported. Please choose from: "
            f"{list(best_ind_params.keys())}"
        )

    curr_date_dt = datetime.strptime(curr_date, "%Y-%m-%d")
    before = curr_date_dt - relativedelta(years=1)

    # Optimized: Get stock data once and calculate indicators for all dates
    try:
        indicator_data = _get_stock_stats_bulk(symbol, indicator, curr_date)

        # Generate the date range we need
        current_dt = curr_date_dt
        date_values = []

        while current_dt >= before:
            date_str = current_dt.strftime("%Y-%m-%d")

            # Look up the indicator value for this date
            if date_str in indicator_data:
                indicator_value = indicator_data[date_str]
            else:
                indicator_value = "N/A: Not a trading day (weekend or holiday)"

            date_values.append((date_str, indicator_value))
            current_dt = current_dt - relativedelta(days=1)

        # Build the result string
        ind_string = ""
        for date_str, value in date_values:
            ind_string += f"{date_str}: {value}\n"

    except Exception as e:
        logger.warning("Error getting bulk stockstats data for %s %s: %s", symbol, indicator, e)
        # Fallback to original implementation if bulk method fails
        ind_string = ""
        curr_date_dt = datetime.strptime(curr_date, "%Y-%m-%d")
        while curr_date_dt >= before:
            indicator_value = get_stockstats_indicator(
                symbol, indicator, curr_date_dt.strftime("%Y-%m-%d")
            )
            ind_string += f"{curr_date_dt.strftime('%Y-%m-%d')}: {indicator_value}\n"
            curr_date_dt = curr_date_dt - relativedelta(days=1)

    result_str = (
        f"## {indicator} values from {before.strftime('%Y-%m-%d')} to {curr_date}:\n\n"
        + ind_string
        + "\n\n"
        + best_ind_params.get(indicator, "No description available.")
    )

    return result_str


def _get_stock_stats_bulk(
    symbol: Annotated[str, "ticker symbol of the company"],
    indicator: Annotated[str, "technical indicator to calculate"],
    curr_date: Annotated[str, "current date for reference"],
) -> dict:
    """
    Optimized bulk calculation of stock stats indicators.
    Fetches data once and calculates indicator for all available dates.
    Returns dict mapping date strings to indicator values.
    """
    from stockstats import wrap

    data = load_ohlcv(symbol, curr_date)
    df = wrap(data)
    df["Date"] = df["Date"].dt.strftime("%Y-%m-%d")

    # Calculate the indicator for all rows at once
    df[indicator]  # This triggers stockstats to calculate the indicator

    # Create a dictionary mapping date strings to indicator values
    result_dict = {}
    for _, row in df.iterrows():
        date_str = row["Date"]
        indicator_value = row[indicator]

        # Handle NaN/None values
        if pd.isna(indicator_value):
            result_dict[date_str] = "N/A"
        else:
            result_dict[date_str] = str(indicator_value)

    return result_dict


def get_stockstats_indicator(
    symbol: Annotated[str, "ticker symbol of the company"],
    indicator: Annotated[str, "technical indicator to get the analysis and report of"],
    curr_date: Annotated[str, "The current trading date you are trading on, YYYY-mm-dd"],
) -> str:

    curr_date_dt = datetime.strptime(curr_date, "%Y-%m-%d")
    curr_date = curr_date_dt.strftime("%Y-%m-%d")

    try:
        indicator_value = StockstatsUtils.get_stock_stats(
            symbol,
            indicator,
            curr_date,
        )
    except Exception as e:
        logger.warning(
            "Error getting stockstats indicator data for %s on %s: %s", indicator, curr_date, e
        )
        return ""

    return str(indicator_value)


def get_fundamentals(
    ticker: Annotated[str, "ticker symbol of the company"],
    curr_date: Annotated[str, "current date (not used for yfinance)"] = None,
):
    """Get company fundamentals overview from yfinance."""
    try:
        ticker = normalize_ticker(ticker)
        ticker_obj = _get_ticker(ticker)
        info = yf_retry(lambda: ticker_obj.info)

        if not info:
            return f"No fundamentals data found for symbol '{ticker}'"

        fields = [
            ("Name", info.get("longName")),
            ("Sector", info.get("sector")),
            ("Industry", info.get("industry")),
            ("Market Cap", info.get("marketCap")),
            ("PE Ratio (TTM)", info.get("trailingPE")),
            ("Forward PE", info.get("forwardPE")),
            ("PEG Ratio", info.get("pegRatio")),
            ("Price to Book", info.get("priceToBook")),
            ("EPS (TTM)", info.get("trailingEps")),
            ("Forward EPS", info.get("forwardEps")),
            ("Dividend Yield", info.get("dividendYield")),
            ("Beta", info.get("beta")),
            ("52 Week High", info.get("fiftyTwoWeekHigh")),
            ("52 Week Low", info.get("fiftyTwoWeekLow")),
            ("50 Day Average", info.get("fiftyDayAverage")),
            ("200 Day Average", info.get("twoHundredDayAverage")),
            ("Revenue (TTM)", info.get("totalRevenue")),
            ("Gross Profit", info.get("grossProfits")),
            ("EBITDA", info.get("ebitda")),
            ("Net Income", info.get("netIncomeToCommon")),
            ("Profit Margin", info.get("profitMargins")),
            ("Operating Margin", info.get("operatingMargins")),
            ("Return on Equity", info.get("returnOnEquity")),
            ("Return on Assets", info.get("returnOnAssets")),
            ("Debt to Equity", info.get("debtToEquity")),
            ("Current Ratio", info.get("currentRatio")),
            ("Book Value", info.get("bookValue")),
            ("Free Cash Flow", info.get("freeCashflow")),
        ]

        lines = []
        for label, value in fields:
            if value is not None:
                lines.append(f"{label}: {value}")

        header = f"# Company Fundamentals for {ticker.upper()}\n"
        header += f"# Data retrieved on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"

        return header + "\n".join(lines)

    except Exception as e:
        return f"Error retrieving fundamentals for {ticker}: {str(e)}"


def _clean_ownership_ratio(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    if number > 1:
        number = number / 100
    return max(0, min(number, 1))


def _first_numeric_from_record(record: Any, keys: tuple[str, ...]) -> float | None:
    if not isinstance(record, dict):
        return None
    for key in keys:
        value = record.get(key)
        if isinstance(value, (int, float)) and math.isfinite(float(value)):
            return float(value)
    return None


def _latest_numeric_from_frame(data: Any, keys: tuple[str, ...]) -> float | None:
    if data is None:
        return None
    if isinstance(data, dict):
        return _first_numeric_from_record(data, keys)
    if isinstance(data, pd.Series):
        return _first_numeric_from_record(data.to_dict(), keys)
    if not isinstance(data, pd.DataFrame) or data.empty:
        return None

    for key in keys:
        if key in data.columns:
            series = pd.to_numeric(data[key], errors="coerce").dropna()
            if not series.empty:
                return float(series.iloc[-1])
        if key in data.index:
            series = pd.to_numeric(data.loc[key], errors="coerce").dropna()
            if not series.empty:
                return float(series.iloc[-1])
    return None


def _load_optional_ticker_table(ticker_obj: Any, attribute: str) -> Any | None:
    try:
        return yf_retry(lambda: getattr(ticker_obj, attribute))
    except Exception as exc:
        logger.debug("Unable to load yfinance %s table: %s", attribute, exc)
        return None


def _clean_profile_text(value: Any, max_length: int | None = None) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())
    if not text:
        return None
    if max_length and len(text) > max_length:
        return text[: max_length - 3].rstrip() + "..."
    return text


def _first_profile_text(
    info: dict[str, Any], *keys: str, max_length: int | None = None
) -> str | None:
    for key in keys:
        value = _clean_profile_text(info.get(key), max_length=max_length)
        if value:
            return value
    return None


def _safe_current_price_payload(ticker: str, curr_date: str | None = None) -> dict[str, Any]:
    try:
        payload = fetch_current_price(ticker, curr_date)
    except Exception as exc:
        logger.warning("Unable to attach current price to company profile for %s: %s", ticker, exc)
        payload = {}

    return {
        "price": payload.get("price"),
        "price_source": payload.get("price_source") or "unavailable",
        "price_timestamp": payload.get("price_timestamp"),
    }


def get_company_profile(
    ticker: Annotated[str, "ticker symbol of the company"],
    curr_date: Annotated[str, "current date, not used for yfinance"] = None,
) -> dict:
    """Get frontend-ready company profile data from yfinance."""
    try:
        ticker = normalize_ticker(ticker)
        ticker_obj = _get_ticker(ticker)
        info = yf_retry(lambda: ticker_obj.info)

        if not info:
            return {
                "available": False,
                "ticker": ticker,
                "warning": f"No company profile data found for symbol '{ticker}'",
            }

        address_parts = []
        for field in ["address1", "address2", "city", "state", "zip", "country"]:
            value = _clean_profile_text(info.get(field))
            if value:
                address_parts.append(value)

        executives = []
        officers = info.get("companyOfficers")
        if isinstance(officers, list):
            for officer in officers[:10]:
                if not isinstance(officer, dict):
                    continue
                name = _clean_profile_text(officer.get("name"))
                title = _clean_profile_text(officer.get("title"))
                if name:
                    executives.append({"name": name, "title": title or "N/A"})

        shares_table = _load_optional_ticker_table(ticker_obj, "shares")
        valuation_table = _load_optional_ticker_table(ticker_obj, "valuation")
        shares_out = info.get("sharesOutstanding") or _latest_numeric_from_frame(
            shares_table,
            ("Shares Outstanding", "sharesOutstanding", "shares_outstanding"),
        )
        enterprise_value = info.get("enterpriseValue") or _latest_numeric_from_frame(
            valuation_table,
            ("Enterprise Value", "enterpriseValue", "enterprise_value"),
        )
        trailing_pe = info.get("trailingPE") or _latest_numeric_from_frame(
            valuation_table,
            ("Trailing P/E", "Trailing PE", "trailingPE", "trailing_pe"),
        )
        price_to_book = info.get("priceToBook") or _latest_numeric_from_frame(
            valuation_table,
            ("Price/Book", "Price To Book", "priceToBook", "price_to_book"),
        )
        price_to_sales = info.get("priceToSalesTrailing12Months") or _latest_numeric_from_frame(
            valuation_table,
            ("Price/Sales", "Price To Sales", "priceToSalesTrailing12Months", "price_to_sales"),
        )
        enterprise_to_ebitda = info.get("enterpriseToEbitda") or _latest_numeric_from_frame(
            valuation_table,
            ("Enterprise/EBITDA", "EV/EBITDA", "enterpriseToEbitda", "enterprise_to_ebitda"),
        )
        insider_pct = _clean_ownership_ratio(info.get("heldPercentInsiders"))
        institution_pct = _clean_ownership_ratio(info.get("heldPercentInstitutions"))
        short_ratio = info.get("shortRatio")
        public_pct = None
        if insider_pct is not None and institution_pct is not None:
            public_pct = max(0, 1 - (insider_pct + institution_pct))

        current_price_payload = _safe_current_price_payload(ticker, curr_date)
        current_price = (
            current_price_payload.get("price")
            or info.get("currentPrice")
            or info.get("regularMarketPrice")
        )

        profile = {
            "available": True,
            "ticker": ticker,
            "name": _first_profile_text(info, "longName", "shortName"),
            "exchange": _first_profile_text(info, "exchange", "fullExchangeName", "exchangeName"),
            "currency": _first_profile_text(info, "currency", "financialCurrency"),
            "country": _first_profile_text(info, "country"),
            "sector": _first_profile_text(info, "sector", "sectorDisp", "sectorKey"),
            "industry": _first_profile_text(info, "industry", "industryDisp", "industryKey"),
            "address": ", ".join(address_parts) if address_parts else None,
            "phone": _clean_profile_text(info.get("phone")),
            "website": _clean_profile_text(info.get("website") or info.get("ir_website")),
            "market_cap": info.get("marketCap"),
            "enterprise_value": enterprise_value,
            "trailing_pe": trailing_pe,
            "forward_pe": info.get("forwardPE"),
            "price_to_book": price_to_book,
            "price_to_sales": price_to_sales,
            "enterprise_to_ebitda": enterprise_to_ebitda,
            "dividend_yield": info.get("dividendYield"),
            "payout_ratio": info.get("payoutRatio"),
            "peg_ratio": info.get("pegRatio"),
            "beta": info.get("beta"),
            "float_shares": info.get("floatShares"),
            "current_ratio": info.get("currentRatio"),
            "quick_ratio": info.get("quickRatio"),
            "revenue_per_share": info.get("revenuePerShare"),
            "shares_outstanding": shares_out,
            "shares_out": shares_out,
            "insider_percent": insider_pct,
            "insider_pct": insider_pct,
            "institution_percent": institution_pct,
            "institution_pct": institution_pct,
            "public_percent": public_pct,
            "public_pct": public_pct,
            "short_ratio": short_ratio,
            "current_price": current_price,
            "current_price_source": current_price_payload.get("price_source"),
            "current_price_as_of": current_price_payload.get("price_timestamp"),
            "fiscal_year_end": info.get("lastFiscalYearEnd"),
            "employee_count": info.get("fullTimeEmployees"),
            "full_time_employees": info.get("fullTimeEmployees"),
            "business_summary": _first_profile_text(info, "longBusinessSummary", max_length=2000),
            "description": _first_profile_text(info, "longBusinessSummary", max_length=2000),
            "executives": executives,
            "shares_ownership": {
                "shares_out": shares_out,
                "insider_pct": insider_pct,
                "institution_pct": institution_pct,
                "public_pct": public_pct,
                "short_ratio": short_ratio,
            },
        }

        ownership_keys = {
            "shares_outstanding",
            "shares_out",
            "insider_percent",
            "insider_pct",
            "institution_percent",
            "institution_pct",
            "public_percent",
            "public_pct",
            "short_ratio",
            "shares_ownership",
        }
        return {
            key: value
            for key, value in profile.items()
            if value not in (None, "") or key in ownership_keys
        }

    except Exception as exc:
        logger.warning("Error retrieving company profile for %s: %s", ticker, exc)
        return {
            "available": False,
            "ticker": ticker,
            "warning": f"Error retrieving company profile: {str(exc)}",
        }


def get_balance_sheet(
    ticker: Annotated[str, "ticker symbol of the company"],
    freq: Annotated[str, "frequency of data: 'annual' or 'quarterly'"] = "quarterly",
    curr_date: Annotated[str, "current date in YYYY-MM-DD format"] = None,
):
    """Get balance sheet data from yfinance."""
    try:
        ticker = normalize_ticker(ticker)
        ticker_obj = _get_ticker(ticker)

        if freq.lower() == "quarterly":
            data = yf_retry(lambda: ticker_obj.quarterly_balance_sheet)
        else:
            data = yf_retry(lambda: ticker_obj.balance_sheet)

        data = filter_financials_by_date(data, curr_date)

        if data.empty:
            return f"No balance sheet data found for symbol '{ticker}'"

        # Convert to CSV string for consistency with other functions
        csv_string = data.to_csv()

        # Add header information
        header = f"# Balance Sheet data for {ticker.upper()} ({freq})\n"
        header += f"# Data retrieved on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"

        return header + csv_string

    except Exception as e:
        return f"Error retrieving balance sheet for {ticker}: {str(e)}"


def get_cashflow(
    ticker: Annotated[str, "ticker symbol of the company"],
    freq: Annotated[str, "frequency of data: 'annual' or 'quarterly'"] = "quarterly",
    curr_date: Annotated[str, "current date in YYYY-MM-DD format"] = None,
):
    """Get cash flow data from yfinance."""
    try:
        ticker = normalize_ticker(ticker)
        ticker_obj = _get_ticker(ticker)

        if freq.lower() == "quarterly":
            data = yf_retry(lambda: ticker_obj.quarterly_cashflow)
        elif freq.lower() == "ttm" and hasattr(ticker_obj, "ttm_cashflow"):
            data = yf_retry(lambda: ticker_obj.ttm_cashflow)
        else:
            data = yf_retry(lambda: ticker_obj.cashflow)

        data = filter_financials_by_date(data, curr_date)

        if data.empty:
            return f"No cash flow data found for symbol '{ticker}'"

        # Convert to CSV string for consistency with other functions
        csv_string = data.to_csv()

        # Add header information
        header = f"# Cash Flow data for {ticker.upper()} ({freq})\n"
        header += f"# Data retrieved on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"

        return header + csv_string

    except Exception as e:
        return f"Error retrieving cash flow for {ticker}: {str(e)}"


def get_income_statement(
    ticker: Annotated[str, "ticker symbol of the company"],
    freq: Annotated[str, "frequency of data: 'annual' or 'quarterly'"] = "quarterly",
    curr_date: Annotated[str, "current date in YYYY-MM-DD format"] = None,
):
    """Get income statement data from yfinance."""
    try:
        ticker = normalize_ticker(ticker)
        ticker_obj = _get_ticker(ticker)

        if freq.lower() == "quarterly":
            data = yf_retry(lambda: ticker_obj.quarterly_income_stmt)
        elif freq.lower() == "ttm" and hasattr(ticker_obj, "ttm_income_stmt"):
            data = yf_retry(lambda: ticker_obj.ttm_income_stmt)
        else:
            data = yf_retry(lambda: ticker_obj.income_stmt)

        data = filter_financials_by_date(data, curr_date)

        if data.empty:
            return f"No income statement data found for symbol '{ticker}'"

        # Convert to CSV string for consistency with other functions
        csv_string = data.to_csv()

        # Add header information
        header = f"# Income Statement data for {ticker.upper()} ({freq})\n"
        header += f"# Data retrieved on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"

        return header + csv_string

    except Exception as e:
        return f"Error retrieving income statement for {ticker}: {str(e)}"


def get_insider_transactions(ticker: Annotated[str, "ticker symbol of the company"]):
    """Get insider transactions data from yfinance."""
    try:
        ticker = normalize_ticker(ticker)
        ticker_obj = _get_ticker(ticker)
        data = yf_retry(lambda: ticker_obj.insider_transactions)

        if data is None or data.empty:
            return f"No insider transactions data found for symbol '{ticker}'"

        # Convert to CSV string for consistency with other functions
        csv_string = data.to_csv()

        # Add header information
        header = f"# Insider Transactions data for {ticker.upper()}\n"
        header += f"# Data retrieved on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"

        return header + csv_string

    except Exception as e:
        return f"Error retrieving insider transactions for {ticker}: {str(e)}"


def get_corporate_actions(
    ticker: Annotated[str, "ticker symbol of the company"],
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    """Return yfinance split/dividend events in the corporate-action schema."""
    try:
        ticker_obj = yf.Ticker(ticker)
        actions = yf_retry(lambda: ticker_obj.actions)
        rows: list[dict[str, Any]] = []
        if actions is not None and not getattr(actions, "empty", True):
            for index, row in actions.iterrows():
                index_date = getattr(index, "date", None)
                date_text = str(index_date() if callable(index_date) else index)[:10]
                if start_date and date_text < str(start_date)[:10]:
                    continue
                if end_date and date_text > str(end_date)[:10]:
                    continue
                dividend = row.get("Dividends") if hasattr(row, "get") else None
                split = row.get("Stock Splits") if hasattr(row, "get") else None
                try:
                    dividend_value = float(dividend or 0)
                except (TypeError, ValueError):
                    dividend_value = 0.0
                try:
                    split_value = float(split or 0)
                except (TypeError, ValueError):
                    split_value = 0.0
                if dividend_value:
                    rows.append(
                        {
                            "ticker": ticker,
                            "action_type": "cash_dividend",
                            "effective_date": date_text,
                            "cash_amount": dividend_value,
                            "source": "yfinance",
                        }
                    )
                if split_value:
                    action_type = "reverse_split" if split_value < 1 else "split"
                    ratio = (1 / split_value) if split_value < 1 else split_value
                    rows.append(
                        {
                            "ticker": ticker,
                            "action_type": action_type,
                            "effective_date": date_text,
                            "ratio": ratio,
                            "source": "yfinance",
                        }
                    )
        return {
            "available": True,
            "ticker": ticker,
            "source": "yfinance",
            "start_date": start_date,
            "end_date": end_date,
            "corporate_actions": rows,
        }
    except Exception as exc:  # pragma: no cover - depends on optional yfinance endpoint
        return {
            "available": False,
            "ticker": ticker,
            "source": "yfinance",
            "start_date": start_date,
            "end_date": end_date,
            "corporate_actions": [],
            "reason": f"yfinance corporate actions unavailable: {exc}",
        }
