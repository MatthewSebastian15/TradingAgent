from __future__ import annotations

import importlib

import pytest

from errors import BadRequestError
from routes.validation import AnalysisRequest, normalize_and_validate_analysis_request


def test_ticker_bbcajk_is_valid():
    req = normalize_and_validate_analysis_request(
        AnalysisRequest(ticker="BBCA.JK", trade_date="2026-05-14", max_debate_rounds=3)
    )

    assert req.ticker == "BBCA.JK"
    assert req.trade_date == "2026-05-14"
    assert req.max_debate_rounds == 3


def test_ticker_bbca_is_valid_and_normalized():
    req = normalize_and_validate_analysis_request(
        AnalysisRequest(ticker="bbca", trade_date="2026-05-14", max_debate_rounds=1)
    )

    assert req.ticker == "BBCA"


def test_invalid_trade_date_is_rejected():
    with pytest.raises(BadRequestError) as exc_info:
        normalize_and_validate_analysis_request(
            AnalysisRequest(ticker="BBCA.JK", trade_date="2026-02-31", max_debate_rounds=1)
        )

    assert exc_info.value.status_code == 400
    assert "trade_date" in exc_info.value.details["fields"]


def test_max_debate_rounds_above_five_is_rejected():
    with pytest.raises(BadRequestError) as exc_info:
        normalize_and_validate_analysis_request(
            AnalysisRequest(ticker="BBCA.JK", trade_date="2026-05-14", max_debate_rounds=6)
        )

    assert exc_info.value.status_code == 400
    assert "max_debate_rounds" in exc_info.value.details["fields"]


def test_deepseek_provider_is_valid_when_api_key_exists(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-key")
    monkeypatch.setenv("ANALYSIS_MODE", "balanced")
    monkeypatch.setenv("MAX_GEMINI_CALLS", "9")

    import config

    reloaded = importlib.reload(config)
    errors = reloaded.validate_startup_config()

    assert not [error for error in errors if "DEEPSEEK_API_KEY" in error or "LLM_PROVIDER" in error]

    monkeypatch.setenv("LLM_PROVIDER", "google")
    importlib.reload(config)
