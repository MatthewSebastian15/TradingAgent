from datetime import datetime
from io import StringIO

import pandas as pd

from .alpha_vantage_common import _make_api_request, _filter_csv_by_date_range

def get_stock(
    symbol: str,
    start_date: str,
    end_date: str
) -> str:
    """
    Returns raw daily OHLCV values filtered to the specified date range.

    Args:
        symbol: The name of the equity. For example: symbol=IBM
        start_date: Start date in yyyy-mm-dd format
        end_date: End date in yyyy-mm-dd format

    Returns:
        CSV string containing the daily adjusted time series data filtered to the date range.
    """
    # Parse dates to determine the range
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    today = datetime.now()

    # Choose outputsize based on whether the requested range is within the latest 100 days
    # Compact returns latest 100 data points, so check if start_date is recent enough
    days_from_today_to_start = (today - start_dt).days
    outputsize = "compact" if days_from_today_to_start < 100 else "full"

    params = {
        "symbol": symbol,
        "outputsize": outputsize,
        "datatype": "csv",
    }

    response = _make_api_request("TIME_SERIES_DAILY", params)
    filtered = _filter_csv_by_date_range(response, start_date, end_date)
    if not filtered or not str(filtered).strip():
        return f"No data found for symbol '{symbol}' between {start_date} and {end_date}"

    try:
        data = pd.read_csv(StringIO(str(filtered)))
    except Exception:
        return str(filtered)

    rename_map = {
        "timestamp": "Date",
        "open": "Open",
        "high": "High",
        "low": "Low",
        "close": "Close",
        "volume": "Volume",
    }
    data = data.rename(columns=rename_map)
    expected_columns = ["Date", "Open", "High", "Low", "Close", "Volume"]
    available_columns = [column for column in expected_columns if column in data.columns]
    if not available_columns or "Date" not in available_columns:
        return str(filtered)

    data = data[available_columns]
    header = f"# Alpha Vantage daily stock data for {symbol.upper()} from {start_date} to {end_date}\n"
    header += f"# Total records: {len(data)}\n"
    header += f"# Data retrieved on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
    return header + data.to_csv(index=False)
