from typing import Annotated

from langchain_core.tools import tool

from tradingagents.dataflows.interface import route_to_vendor


@tool
def get_news_sentiment(
    ticker: Annotated[str, "Ticker symbol"],
) -> str:
    """
    Retrieve structured news sentiment for a ticker.

    Returns unavailable metadata when structured sentiment is not available.
    Do not treat unavailable sentiment as neutral sentiment.
    """
    return route_to_vendor("get_news_sentiment", ticker)


@tool
def get_social_sentiment(
    ticker: Annotated[str, "Ticker symbol"],
    start_date: Annotated[str, "Start date in yyyy-mm-dd format"],
    end_date: Annotated[str, "End date in yyyy-mm-dd format"],
) -> str:
    """
    Retrieve direct social sentiment for a ticker from supported sources.

    If unavailable, the response explicitly says unavailable. News sentiment must not be relabeled
    as direct social sentiment.
    """
    return route_to_vendor("get_social_sentiment", ticker, start_date, end_date)
