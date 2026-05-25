from __future__ import annotations

import json

from .alpha_vantage_common import _make_api_request


def _load_json_payload(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _dump_payload(payload: dict) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False)


def _is_blank_value(value) -> bool:
    return value is None or value == "" or value == "None"


def _filter_reports_by_date(result, curr_date: str):
    """Filter annualReports/quarterlyReports to exclude entries after curr_date.

    Prevents look-ahead bias by removing fiscal periods that end after
    the simulation's current date.
    """
    if not curr_date or not isinstance(result, dict):
        return result
    for key in ("annualReports", "quarterlyReports"):
        if key in result:
            result[key] = [
                r for r in result[key]
                if r.get("fiscalDateEnding", "") <= curr_date
            ]
    return result


def get_fundamentals(ticker: str, curr_date: str = None) -> str:
    """
    Retrieve comprehensive fundamental data for a given ticker symbol using Alpha Vantage.

    Args:
        ticker (str): Ticker symbol of the company
        curr_date (str): Current date you are trading at, yyyy-mm-dd (not used for Alpha Vantage)

    Returns:
        str: Company overview data including financial ratios and key metrics
    """
    params = {
        "symbol": ticker,
    }

    payload = _load_json_payload(_make_api_request("OVERVIEW", params))
    if not payload or all(_is_blank_value(value) for value in payload.values()):
        return f"No fundamentals data found for symbol '{ticker}'"
    return _dump_payload(payload)


def get_balance_sheet(ticker: str, freq: str = "quarterly", curr_date: str = None):
    """Retrieve balance sheet data for a given ticker symbol using Alpha Vantage."""
    result = _filter_reports_by_date(_load_json_payload(_make_api_request("BALANCE_SHEET", {"symbol": ticker})), curr_date)
    if not result.get("annualReports") and not result.get("quarterlyReports"):
        return f"No balance sheet data found for symbol '{ticker}'"
    return _dump_payload(result)


def get_cashflow(ticker: str, freq: str = "quarterly", curr_date: str = None):
    """Retrieve cash flow statement data for a given ticker symbol using Alpha Vantage."""
    result = _filter_reports_by_date(_load_json_payload(_make_api_request("CASH_FLOW", {"symbol": ticker})), curr_date)
    if not result.get("annualReports") and not result.get("quarterlyReports"):
        return f"No cash flow data found for symbol '{ticker}'"
    return _dump_payload(result)


def get_income_statement(ticker: str, freq: str = "quarterly", curr_date: str = None):
    """Retrieve income statement data for a given ticker symbol using Alpha Vantage."""
    result = _filter_reports_by_date(_load_json_payload(_make_api_request("INCOME_STATEMENT", {"symbol": ticker})), curr_date)
    if not result.get("annualReports") and not result.get("quarterlyReports"):
        return f"No income statement data found for symbol '{ticker}'"
    return _dump_payload(result)

