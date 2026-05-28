from __future__ import annotations

import os

import pytest

from tradingagents.dataflows.config import use_config
from tradingagents.dataflows.finnhub_stock import get_quote


@pytest.mark.live_api
def test_finnhub_live_quote_smoke():
    api_key = os.environ.get("FINNHUB_API_KEY")
    if not api_key:
        pytest.skip("FINNHUB_API_KEY is not configured; live API smoke test skipped by default.")
    with use_config({"finnhub": {"enabled": True, "api_key": api_key, "enable_stock_data": True, "max_retries": 0}}):
        quote = get_quote("AAPL")
    assert quote["source"] == "finnhub"
    assert quote["current_price"] > 0
