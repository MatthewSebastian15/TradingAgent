import json

import pytest

from tradingagents.dataflows.providers import finnhub_insider
from tradingagents.dataflows.providers.finnhub_common import FinnhubRateLimitError


def _patch_api(monkeypatch, payload):
    monkeypatch.setattr(finnhub_insider, "make_api_request", lambda *args, **kwargs: payload)


def test_transactions_normalized_and_capped(monkeypatch):
    rows = [{"name": f"Insider {index}", "share": index} for index in range(40)]
    _patch_api(monkeypatch, {"data": rows})
    result = json.loads(
        finnhub_insider.get_insider_transactions("AAPL", "2026-01-01", "2026-06-30")
    )
    assert result["symbol"] == "AAPL"
    assert result["source"] == "finnhub"
    assert len(result["insider_transactions"]) == 30  # capped
    assert result["metadata"]["endpoint"] == "/stock/insider-transactions"
    assert result["metadata"]["quality"]["available"] is True


def test_transactions_empty_payload_falls_back(monkeypatch):
    _patch_api(monkeypatch, {"data": []})
    result = finnhub_insider.get_insider_transactions("AAPL")
    assert result.startswith("Finnhub unavailable:")
    assert "Fallback next: alpha_vantage." in result


def test_transactions_non_dict_payload_safe(monkeypatch):
    _patch_api(monkeypatch, "garbage")
    result = finnhub_insider.get_insider_transactions("AAPL")
    assert result.startswith("Finnhub unavailable:")


def test_transactions_rate_limited(monkeypatch):
    def raise_rate_limit(*args, **kwargs):
        raise FinnhubRateLimitError("429")

    monkeypatch.setattr(finnhub_insider, "make_api_request", raise_rate_limit)
    result = finnhub_insider.get_insider_transactions("AAPL")
    assert "rate limited" in result


def test_sentiment_normalized_and_no_fallback(monkeypatch):
    _patch_api(monkeypatch, {"data": [{"mspr": 1.5}] * 30})
    result = json.loads(finnhub_insider.get_insider_sentiment("AAPL"))
    assert len(result["insider_sentiment"]) == 24  # capped
    assert result["metadata"]["endpoint"] == "/stock/insider-sentiment"

    _patch_api(monkeypatch, {"data": []})
    error = finnhub_insider.get_insider_sentiment("AAPL")
    assert error.startswith("Finnhub unavailable:")
    assert "Fallback next" not in error


@pytest.mark.parametrize(
    "date_kwargs", [{}, {"start_date": "2026-01-01", "end_date": "2026-06-30"}]
)
def test_date_params_forwarded(monkeypatch, date_kwargs):
    captured = {}

    def capture(endpoint, params, **kwargs):
        captured.update(params)
        return {"data": [{"name": "x"}]}

    monkeypatch.setattr(finnhub_insider, "make_api_request", capture)
    finnhub_insider.get_insider_transactions("AAPL", **date_kwargs)
    assert captured["symbol"] == "AAPL"
    assert ("from" in captured) == bool(date_kwargs)
