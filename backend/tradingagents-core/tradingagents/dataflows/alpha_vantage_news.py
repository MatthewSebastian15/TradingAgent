from __future__ import annotations

import json

from .alpha_vantage_common import _make_api_request, format_datetime_for_api


def _load_news_payload(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _format_news_payload(raw, label: str, start_date: str, end_date: str, limit: int = 20) -> str:
    payload = _load_news_payload(raw)
    feed = payload.get("feed") if isinstance(payload, dict) else None
    if not isinstance(feed, list) or not feed:
        return f"No news found for {label} between {start_date} and {end_date}"

    parts = []
    for article in feed[:limit]:
        if not isinstance(article, dict):
            continue
        title = article.get("title") or "No title"
        source = article.get("source") or article.get("source_domain") or "Unknown"
        summary = article.get("summary") or ""
        url = article.get("url") or ""
        published = article.get("time_published") or ""
        ticker_sentiment = article.get("ticker_sentiment") or []
        relevance = ""
        if isinstance(ticker_sentiment, list) and ticker_sentiment:
            tickers = [
                str(item.get("ticker", "")).strip()
                for item in ticker_sentiment
                if isinstance(item, dict) and item.get("ticker")
            ]
            if tickers:
                relevance = f"Relevant tickers: {', '.join(tickers[:8])}\n"

        article_text = f"### {title} (source: {source})\n"
        if published:
            article_text += f"Published: {published}\n"
        if summary:
            article_text += f"{summary}\n"
        if relevance:
            article_text += relevance
        if url:
            article_text += f"Link: {url}\n"
        parts.append(article_text)

    if not parts:
        return f"No news found for {label} between {start_date} and {end_date}"
    return f"## Alpha Vantage News for {label}, from {start_date} to {end_date}:\n\n" + "\n".join(parts)


def get_news(ticker, start_date, end_date) -> dict[str, str] | str:
    """Returns live and historical market news & sentiment data from premier news outlets worldwide.

    Covers stocks, cryptocurrencies, forex, and topics like fiscal policy, mergers & acquisitions, IPOs.

    Args:
        ticker: Stock symbol for news articles.
        start_date: Start date for news search.
        end_date: End date for news search.

    Returns:
        Dictionary containing news sentiment data or JSON string.
    """

    params = {
        "tickers": ticker,
        "time_from": format_datetime_for_api(start_date),
        "time_to": format_datetime_for_api(end_date),
    }

    raw = _make_api_request("NEWS_SENTIMENT", params)
    return _format_news_payload(raw, ticker, start_date, end_date, limit=20)


def get_global_news(curr_date, look_back_days: int = 7, limit: int = 50) -> dict[str, str] | str:
    """Returns global market news & sentiment data without ticker-specific filtering.

    Covers broad market topics like financial markets, economy, and more.

    Args:
        curr_date: Current date in yyyy-mm-dd format.
        look_back_days: Number of days to look back (default 7).
        limit: Maximum number of articles (default 50).

    Returns:
        Dictionary containing global news sentiment data or JSON string.
    """
    from datetime import datetime, timedelta

    # Calculate start date
    curr_dt = datetime.strptime(curr_date, "%Y-%m-%d")
    start_dt = curr_dt - timedelta(days=look_back_days)
    start_date = start_dt.strftime("%Y-%m-%d")

    params = {
        "topics": "financial_markets,economy_macro,economy_monetary",
        "time_from": format_datetime_for_api(start_date),
        "time_to": format_datetime_for_api(curr_date),
        "limit": str(limit),
    }

    raw = _make_api_request("NEWS_SENTIMENT", params)
    return _format_news_payload(raw, "global markets", start_date, curr_date, limit=limit)


def get_insider_transactions(symbol: str) -> dict[str, str] | str:
    """Returns latest and historical insider transactions by key stakeholders.

    Covers transactions by founders, executives, board members, etc.

    Args:
        symbol: Ticker symbol. Example: "IBM".

    Returns:
        Dictionary containing insider transaction data or JSON string.
    """

    params = {
        "symbol": symbol,
    }

    return _make_api_request("INSIDER_TRANSACTIONS", params)
