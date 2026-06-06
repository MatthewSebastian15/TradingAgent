import json
import logging
import os
from datetime import datetime
from io import StringIO

import pandas as pd
import requests

from .config import get_config

API_BASE_URL = "https://www.alphavantage.co/query"
logger = logging.getLogger(__name__)


def get_api_key() -> str:
    """Retrieve the API key for Alpha Vantage from environment variables."""
    api_key = os.getenv("ALPHA_VANTAGE_API_KEY", "").strip()
    if not api_key:
        raise ValueError("ALPHA_VANTAGE_API_KEY environment variable is not set.")
    return api_key


def format_datetime_for_api(date_input) -> str:
    """Convert various date formats to YYYYMMDDTHHMM format required by Alpha Vantage API."""
    if isinstance(date_input, str):
        # If already in correct format, return as-is
        if len(date_input) == 13 and "T" in date_input:
            return date_input
        # Try to parse common date formats
        try:
            dt = datetime.strptime(date_input, "%Y-%m-%d")
            return dt.strftime("%Y%m%dT0000")
        except ValueError:
            try:
                dt = datetime.strptime(date_input, "%Y-%m-%d %H:%M")
                return dt.strftime("%Y%m%dT%H%M")
            except ValueError:
                raise ValueError(f"Unsupported date format: {date_input}")
    elif isinstance(date_input, datetime):
        return date_input.strftime("%Y%m%dT%H%M")
    else:
        raise ValueError(f"Date must be string or datetime object, got {type(date_input)}")


class AlphaVantageRateLimitError(Exception):
    """Exception raised when Alpha Vantage API rate limit is exceeded."""

    pass


class AlphaVantagePermanentError(Exception):
    """Raised when Alpha Vantage returns a permanent non-retryable error."""

    pass


def _make_api_request(function_name: str, params: dict) -> dict | str:
    """Helper function to make API requests and handle responses.

    Raises:
        AlphaVantageRateLimitError: When API rate limit is exceeded
    """
    # Create a copy of params to avoid modifying the original
    api_params = params.copy()
    api_params.update(
        {
            "function": function_name,
            "apikey": get_api_key(),
            "source": "trading_agents",
        }
    )

    # Handle entitlement parameter if present in params or global variable
    current_entitlement = globals().get("_current_entitlement")
    entitlement = api_params.get("entitlement") or current_entitlement

    if entitlement:
        api_params["entitlement"] = entitlement
    elif "entitlement" in api_params:
        # Remove entitlement if it's None or empty
        api_params.pop("entitlement", None)

    timeout_seconds = max(1, int(get_config().get("tool_timeout_seconds", 45)))
    response = requests.get(API_BASE_URL, params=api_params, timeout=(5, timeout_seconds))
    response.raise_for_status()

    response_text = response.text

    # Check if response is JSON (error responses are typically JSON)
    try:
        response_json = json.loads(response_text)
        if "Error Message" in response_json:
            message = str(response_json["Error Message"])
            lowered_message = message.lower()
            if "invalid ticker format" in lowered_message or "invalid api call" in lowered_message:
                raise AlphaVantagePermanentError(f"Alpha Vantage error: {message}")
            raise ValueError(f"Alpha Vantage error: {message}")
        if "Note" in response_json:
            note_message = str(response_json["Note"])
            if "call frequency" in note_message.lower() or "rate limit" in note_message.lower():
                raise AlphaVantageRateLimitError(f"Alpha Vantage rate limit exceeded: {note_message}")
            raise ValueError(f"Alpha Vantage note: {note_message}")
        if "Information" in response_json:
            info_message = str(response_json["Information"])
            lowered_info = info_message.lower()
            if "rate limit" in lowered_info or "api key" in lowered_info or "premium" in lowered_info:
                raise AlphaVantageRateLimitError(f"Alpha Vantage rate limit exceeded: {info_message}")
            raise ValueError(f"Alpha Vantage information: {info_message}")
    except json.JSONDecodeError:
        # Response is not JSON (likely CSV data), which is normal
        pass

    return response_text


def _filter_csv_by_date_range(csv_data: str, start_date: str, end_date: str) -> str:
    """
    Filter CSV data to include only rows within the specified date range.

    Args:
        csv_data: CSV string from Alpha Vantage API
        start_date: Start date in yyyy-mm-dd format
        end_date: End date in yyyy-mm-dd format

    Returns:
        Filtered CSV string
    """
    if not csv_data or csv_data.strip() == "":
        return csv_data

    try:
        # Parse CSV data
        df = pd.read_csv(StringIO(csv_data))

        # Assume the first column is the date column (timestamp)
        date_col = df.columns[0]
        df[date_col] = pd.to_datetime(df[date_col])

        # Filter by date range
        start_dt = pd.to_datetime(start_date)
        end_dt = pd.to_datetime(end_date)

        filtered_df = df[(df[date_col] >= start_dt) & (df[date_col] <= end_dt)]

        # Convert back to CSV string
        return filtered_df.to_csv(index=False)

    except Exception as e:
        logger.warning("Failed to filter Alpha Vantage CSV data by date range: %s", e)
        return csv_data
