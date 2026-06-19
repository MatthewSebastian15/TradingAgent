from typing import Annotated

from langchain_core.tools import tool

from tradingagents.dataflows.providers.interface import route_to_vendor


@tool
def get_earnings_calendar(
    ticker: Annotated[str, "Ticker symbol"],
    start_date: Annotated[str, "Start date in yyyy-mm-dd format"],
    end_date: Annotated[str, "End date in yyyy-mm-dd format"],
) -> str:
    """Retrieve earnings calendar and simple event-risk classification for a ticker."""
    return route_to_vendor("get_earnings_calendar", ticker, start_date, end_date)


@tool
def get_recommendation_trends(
    ticker: Annotated[str, "Ticker symbol"],
) -> str:
    """Retrieve analyst recommendation trends as external comparison context only."""
    return route_to_vendor("get_recommendation_trends", ticker)
