from __future__ import annotations

import asyncio
import concurrent.futures
from datetime import datetime

import pytest
from dateutil.relativedelta import relativedelta

from errors import BadRequestError
from routes.analysis import _preflight_market_data
from routes.validation import AnalysisRequest


def _analysis_request(ticker: str = "BBCA.JK", trade_date: str = "2026-05-14") -> AnalysisRequest:
    return AnalysisRequest(
        ticker=ticker,
        trade_date=trade_date,
        max_debate_rounds=1,
        analysis_depth="fast",
        response_detail="summary",
    )


def _price_csv(*dates: str) -> str:
    rows = "\n".join(f"{date},100,110,95,105,1000000" for date in dates)
    return "\n".join(
        [
            "# Stock data for BBCA.JK",
            f"# Total records: {len(dates)}",
            "",
            "Date,Open,High,Low,Close,Volume",
            rows,
        ]
    )


def _mock_market_data(monkeypatch: pytest.MonkeyPatch, sample: str | Exception) -> list[tuple[str, str, str, str]]:
    calls: list[tuple[str, str, str, str]] = []

    class ImmediateExecutor:
        def submit(self, fn, *args):
            future: concurrent.futures.Future = concurrent.futures.Future()
            try:
                future.set_result(fn(*args))
            except BaseException as exc:
                future.set_exception(exc)
            return future

    async def fake_get_executor():
        return ImmediateExecutor()

    def fake_preflight_worker(
        ticker: str, trade_date: str, max_debate_rounds: int, analysis_depth: str, response_detail: str
    ) -> str:
        assert analysis_depth == "fast"
        trade_dt = datetime.strptime(trade_date, "%Y-%m-%d")
        start = (trade_dt - relativedelta(years=1)).strftime("%Y-%m-%d")
        end = (trade_dt + relativedelta(days=1)).strftime("%Y-%m-%d")
        calls.append(("get_stock_data", ticker, start, end))
        if isinstance(sample, Exception):
            raise sample
        return sample

    monkeypatch.setattr("routes.analysis._get_executor", fake_get_executor)
    monkeypatch.setattr("routes.analysis._preflight_market_data_worker", fake_preflight_worker)
    return calls


def test_preflight_market_data_accepts_valid_ticker(monkeypatch):
    calls = _mock_market_data(monkeypatch, _price_csv("2026-05-14"))

    asyncio.run(_preflight_market_data(_analysis_request()))

    assert calls == [("get_stock_data", "BBCA.JK", "2025-05-14", "2026-05-15")]


def test_preflight_market_data_rejects_missing_ticker(monkeypatch):
    _mock_market_data(
        monkeypatch,
        "No data found for symbol 'NOPE.JK' between 2025-05-14 and 2026-05-15",
    )

    with pytest.raises(BadRequestError) as exc_info:
        asyncio.run(_preflight_market_data(_analysis_request(ticker="NOPE.JK")))

    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "BAD_REQUEST"
    assert exc_info.value.details == {"ticker": "NOPE.JK", "trade_date": "2026-05-14"}


def test_preflight_market_data_allows_market_closed_when_recent_data_exists(monkeypatch):
    _mock_market_data(monkeypatch, _price_csv("2026-05-12", "2026-05-13"))

    asyncio.run(_preflight_market_data(_analysis_request(trade_date="2026-05-14")))


def test_preflight_market_data_converts_yfinance_timeout_to_bad_request(monkeypatch):
    _mock_market_data(monkeypatch, TimeoutError("yfinance timed out after 1s"))

    with pytest.raises(BadRequestError) as exc_info:
        asyncio.run(_preflight_market_data(_analysis_request()))

    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "BAD_REQUEST"
    assert exc_info.value.user_message == "Ticker preflight failed before the LLM pipeline started."
    assert exc_info.value.details["ticker"] == "BBCA.JK"
    assert "timed out" in exc_info.value.details["reason"]


def test_ticker_validate_endpoint_runs_fast_preflight(client, monkeypatch):
    seen: list[AnalysisRequest] = []

    async def fake_preflight_market_data(req: AnalysisRequest) -> None:
        seen.append(req)

    monkeypatch.setattr("routes.analysis._preflight_market_data", fake_preflight_market_data)

    response = client.get(
        "/api/ticker/validate",
        params={"ticker": "bbca", "trade_date": "2026-05-14"},
        headers={"x-api-key": "ticker-validate-test-key"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "ticker": "BBCA.JK",
        "trade_date": "2026-05-14",
        "valid": True,
        "message": "Ticker has usable market data.",
    }
    assert len(seen) == 1
    assert seen[0].ticker == "BBCA.JK"
    assert seen[0].analysis_depth == "fast"
    assert seen[0].max_debate_rounds == 1
    assert seen[0].response_detail == "summary"


def test_ticker_validate_endpoint_rejects_invalid_ticker_before_preflight(client, monkeypatch):
    async def should_not_run(req: AnalysisRequest) -> None:
        raise AssertionError("preflight should not run for invalid ticker syntax")

    monkeypatch.setattr("routes.analysis._preflight_market_data", should_not_run)

    response = client.get(
        "/api/ticker/validate",
        params={"ticker": "@@@", "trade_date": "2026-05-14"},
        headers={"x-api-key": "ticker-invalid-test-key"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"
    assert "ticker" in response.json()["error"]["details"]["fields"]
