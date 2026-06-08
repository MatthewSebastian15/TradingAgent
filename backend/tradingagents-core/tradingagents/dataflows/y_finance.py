import logging
import math
import os
import threading
from collections import OrderedDict
from datetime import datetime
from typing import Annotated, Any

import pandas as pd
import pytz
from dateutil.relativedelta import relativedelta

from tradingagents.yfinance_runtime import yf

from .stockstats_utils import StockstatsUtils, filter_financials_by_date, load_ohlcv, yf_retry

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


def fetch_current_price(symbol: str) -> dict[str, Any]:
    """Fetch the latest available quote once at the start of an analysis run.

    The first choice is yfinance ``fast_info.last_price`` because it represents
    the freshest quote yfinance exposes for the instrument. If that is missing,
    the function falls back to the latest available historical close and marks
    the result as a fallback so the UI can warn the user clearly.
    """
    normalized = normalize_ticker(symbol)
    wib = pytz.timezone("Asia/Jakarta")
    now = datetime.now(wib)
    currency = _currency_for_symbol(normalized)

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
            ticker = yf.Ticker(normalized)
            hist = ticker.history(period="2d")
            if hist is None or hist.empty or "Close" not in hist:
                raise ValueError("history fallback returned no Close rows") from primary_exc

            price = _coerce_positive_float(hist["Close"].iloc[-1])
            if price is None:
                raise ValueError("history fallback returned invalid Close value") from primary_exc

            price_date = hist.index[-1]
            try:
                price_timestamp = price_date.isoformat()
            except AttributeError:
                price_timestamp = str(price_date)

            return {
                "price": price,
                "price_currency": currency,
                "price_source": "history_close_fallback",
                "price_timestamp": price_timestamp,
                "price_is_fallback": True,
            }
        except Exception as fallback_exc:
            logger.warning("Unable to fetch current price for %s: %s", normalized, fallback_exc)
            return {
                "price": None,
                "price_currency": currency,
                "price_source": "unavailable",
                "price_timestamp": now.isoformat(),
                "price_is_fallback": True,
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
    end_exclusive = end_dt + relativedelta(days=1)
    metadata = {
        "volatility_score": None,
        "volatility_scale": "0–100",
        "volatility_method": "Annualized standard deviation of daily returns, normalized to 0–100",
        "volatility_lookback_days": 365,
        "volatility_window": "YoY",
        "volatility_start_date": start_dt.strftime("%Y-%m-%d"),
        "volatility_end_date": end_exclusive.strftime("%Y-%m-%d"),
        "volatility_classification": None,
    }
    try:
        hist = yf.Ticker(normalized).history(
            start=start_dt.strftime("%Y-%m-%d"),
            end=end_exclusive.strftime("%Y-%m-%d"),
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


def get_YFin_data_online(
    symbol: Annotated[str, "ticker symbol of the company"],
    start_date: Annotated[str, "Start date in yyyy-mm-dd format"],
    end_date: Annotated[str, "End date in yyyy-mm-dd format"],
):

    datetime.strptime(start_date, "%Y-%m-%d")
    datetime.strptime(end_date, "%Y-%m-%d")

    # Normalize ticker (handles IDX suffix e.g. BBCA -> BBCA.JK)
    symbol = normalize_ticker(symbol)

    # Create ticker object
    ticker = _get_ticker(symbol)

    # Fetch historical data for the specified date range
    data = yf_retry(lambda: ticker.history(start=start_date, end=end_date))

    # Check if data is empty
    if data.empty:
        return f"No data found for symbol '{symbol}' between {start_date} and {end_date}"

    # Remove timezone info from index for cleaner output
    if data.index.tz is not None:
        data.index = data.index.tz_localize(None)

    # Round numerical values to 2 decimal places for cleaner display
    numeric_columns = ["Open", "High", "Low", "Close", "Adj Close"]
    for col in numeric_columns:
        if col in data.columns:
            data[col] = data[col].round(2)

    # Convert DataFrame to CSV string
    csv_string = data.to_csv()

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
        "close_50_sma": "50 SMA: medium-term trend; dynamic support/resistance. Lags price — combine with faster indicators.",
        "close_200_sma": "200 SMA: long-term benchmark; golden/death cross confirmation. Reacts slowly — use for strategic trend only.",
        "close_10_ema": "10 EMA: responsive short-term average for momentum shifts. Prone to noise — filter with longer averages.",
        "macd": "MACD: momentum via EMA difference; watch crossovers and divergence. Confirm in low-volatility markets.",
        "macds": "MACD Signal: EMA of MACD; crossovers trigger trades. Use as part of a broader strategy.",
        "macdh": "MACD Histogram: gap between MACD and signal; visualise momentum strength. Can be volatile.",
        "rsi": "RSI: overbought (>70) / oversold (<30) momentum. In strong trends RSI may stay extreme — cross-check with trend.",
        "boll": "Bollinger Middle: 20 SMA basis; dynamic benchmark. Combine with upper/lower bands for breakout signals.",
        "boll_ub": "Bollinger Upper: ~2 std above middle; potential overbought / breakout zone. Confirm with other tools.",
        "boll_lb": "Bollinger Lower: ~2 std below middle; potential oversold zone. Use extra analysis to avoid false reversals.",
        "atr": "ATR: average true range; set stop-loss and size positions by current volatility. Reactive — part of risk strategy.",
        "vwma": "VWMA: volume-weighted moving average; confirm trends with price+volume. Watch for spikes skewing results.",
        "mfi": "MFI: volume-weighted momentum; overbought (>80) / oversold (<20). Use with RSI/MACD; divergence signals reversals.",
    }

    if indicator not in best_ind_params:
        raise ValueError(f"Indicator {indicator} is not supported. Please choose from: {list(best_ind_params.keys())}")

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
            indicator_value = get_stockstats_indicator(symbol, indicator, curr_date_dt.strftime("%Y-%m-%d"))
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
        logger.warning("Error getting stockstats indicator data for %s on %s: %s", indicator, curr_date, e)
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


def _clean_profile_text(value: Any, max_length: int | None = None) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())
    if not text:
        return None
    if max_length and len(text) > max_length:
        return text[: max_length - 3].rstrip() + "..."
    return text


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

        shares_out = info.get("sharesOutstanding")
        insider_pct = _clean_ownership_ratio(info.get("heldPercentInsiders"))
        institution_pct = _clean_ownership_ratio(info.get("heldPercentInstitutions"))
        short_ratio = info.get("shortRatio")
        public_pct = None
        if insider_pct is not None and institution_pct is not None:
            public_pct = max(0, 1 - insider_pct - institution_pct)

        profile = {
            "available": True,
            "ticker": ticker,
            "name": _clean_profile_text(info.get("longName") or info.get("shortName")),
            "exchange": _clean_profile_text(info.get("exchange") or info.get("fullExchangeName")),
            "currency": _clean_profile_text(info.get("currency") or info.get("financialCurrency")),
            "country": _clean_profile_text(info.get("country")),
            "sector": _clean_profile_text(info.get("sector")),
            "industry": _clean_profile_text(info.get("industry")),
            "address": ", ".join(address_parts) if address_parts else None,
            "phone": _clean_profile_text(info.get("phone")),
            "website": _clean_profile_text(info.get("website") or info.get("ir_website")),
            "market_cap": info.get("marketCap"),
            "shares_outstanding": shares_out,
            "shares_out": shares_out,
            "insider_percent": insider_pct,
            "insider_pct": insider_pct,
            "institution_percent": institution_pct,
            "institution_pct": institution_pct,
            "public_percent": public_pct,
            "public_pct": public_pct,
            "short_ratio": short_ratio,
            "current_price": info.get("currentPrice") or info.get("regularMarketPrice"),
            "fiscal_year_end": info.get("lastFiscalYearEnd"),
            "full_time_employees": info.get("fullTimeEmployees"),
            "description": _clean_profile_text(info.get("longBusinessSummary"), max_length=2000),
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


def get_corporate_actions(ticker: Annotated[str, "ticker symbol of the company"], start_date: str | None = None, end_date: str | None = None) -> dict[str, Any]:
    """Return yfinance split/dividend events in the corporate-action schema."""
    try:
        ticker_obj = yf.Ticker(ticker)
        actions = yf_retry(lambda: ticker_obj.actions)
        rows: list[dict[str, Any]] = []
        if actions is not None and not getattr(actions, "empty", True):
            for index, row in actions.iterrows():
                date_text = str(getattr(index, "date", lambda: index)())[:10]
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
