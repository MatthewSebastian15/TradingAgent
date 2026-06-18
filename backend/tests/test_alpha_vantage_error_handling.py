from __future__ import annotations

from types import SimpleNamespace

import pytest


def test_alpha_vantage_http_error_redacts_api_key(monkeypatch):
    from tradingagents.dataflows import alpha_vantage_common
    from tradingagents.dataflows.config import set_config

    set_config({"tool_timeout_seconds": 7})
    monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", "alpha-secret-key")

    class Response:
        status_code = 500
        text = ""
        url = "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&apikey=alpha-secret-key&symbol=AAPL"
        request = SimpleNamespace(url=url)

        def raise_for_status(self):
            raise alpha_vantage_common.requests.HTTPError(
                f"500 Server Error for url: {self.url}", response=self
            )

    response = Response()

    def fake_get(url, params, timeout):
        return response

    monkeypatch.setattr(alpha_vantage_common.requests, "get", fake_get)

    with pytest.raises(alpha_vantage_common.requests.HTTPError) as exc_info:
        alpha_vantage_common._make_api_request("TIME_SERIES_DAILY", {"symbol": "AAPL"})

    assert "alpha-secret-key" not in str(exc_info.value)
    assert "alpha-secret-key" not in response.url
    assert "alpha-secret-key" not in response.request.url
    assert "apikey=%5Bredacted%5D" in str(exc_info.value)
