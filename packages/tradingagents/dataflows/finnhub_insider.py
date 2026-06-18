from __future__ import annotations

import json
from typing import Any

from .finnhub_common import FinnhubUnavailableError, build_metadata, handle_finnhub_error, make_api_request


def _dump(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False, default=str)


def get_insider_transactions(ticker: str, start_date: str | None = None, end_date: str | None = None) -> str:
    try:
        params: dict[str, Any] = {"symbol": ticker}
        if start_date:
            params["from"] = start_date
        if end_date:
            params["to"] = end_date
        payload = make_api_request("/stock/insider-transactions", params, feature_key="enable_insider")
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list) or not data:
            raise FinnhubUnavailableError("No insider transactions returned.")
        return _dump(
            {
                "symbol": ticker,
                "source": "finnhub",
                "insider_transactions": data[:30],
                "metadata": build_metadata("/stock/insider-transactions", is_enrichment=True, confidence="medium"),
            }
        )
    except Exception as exc:
        return handle_finnhub_error(f"insider transactions for {ticker}", exc, fallback_next="alpha_vantage")


def get_insider_sentiment(ticker: str, start_date: str | None = None, end_date: str | None = None) -> str:
    try:
        params: dict[str, Any] = {"symbol": ticker}
        if start_date:
            params["from"] = start_date
        if end_date:
            params["to"] = end_date
        payload = make_api_request("/stock/insider-sentiment", params, feature_key="enable_insider")
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list) or not data:
            raise FinnhubUnavailableError("No insider sentiment returned.")
        return _dump(
            {
                "symbol": ticker,
                "source": "finnhub",
                "insider_sentiment": data[:24],
                "metadata": build_metadata("/stock/insider-sentiment", is_enrichment=True, confidence="medium"),
            }
        )
    except Exception as exc:
        return handle_finnhub_error(f"insider sentiment for {ticker}", exc, fallback_next=None)
