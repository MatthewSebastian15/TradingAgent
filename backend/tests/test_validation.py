from __future__ import annotations

import importlib
import logging
from datetime import date, timedelta

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

    assert req.ticker == "BBCA.JK"


def test_us_ticker_is_not_normalized_to_idx_suffix():
    req = normalize_and_validate_analysis_request(
        AnalysisRequest(ticker="aapl", trade_date="2026-05-14", max_debate_rounds=1)
    )

    assert req.ticker == "AAPL"


def test_single_character_ticker_is_valid():
    req = normalize_and_validate_analysis_request(
        AnalysisRequest(ticker="F", trade_date="2026-05-14", max_debate_rounds=1)
    )

    assert req.ticker == "F"


def test_invalid_trade_date_is_rejected():
    with pytest.raises(BadRequestError) as exc_info:
        normalize_and_validate_analysis_request(
            AnalysisRequest(ticker="BBCA.JK", trade_date="2026-02-31", max_debate_rounds=1)
        )

    assert exc_info.value.status_code == 400
    assert "trade_date" in exc_info.value.details["fields"]


def test_trade_date_more_than_one_day_in_future_is_rejected():
    future_date = (date.today() + timedelta(days=2)).strftime("%Y-%m-%d")

    with pytest.raises(BadRequestError) as exc_info:
        normalize_and_validate_analysis_request(
            AnalysisRequest(ticker="BBCA.JK", trade_date=future_date, max_debate_rounds=1)
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


def _restore_test_config(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("REQUIRE_API_KEY_FOR_RATE_LIMIT", "false")
    monkeypatch.delenv("CORS_ORIGINS", raising=False)

    import config

    importlib.reload(config)


def test_production_defaults_require_api_key_and_same_origin_cors(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("REQUIRE_API_KEY_FOR_RATE_LIMIT", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)

    import config

    reloaded = importlib.reload(config)
    try:
        assert reloaded.REQUIRE_API_KEY_FOR_RATE_LIMIT is True
        assert reloaded.CORS_ORIGINS == []
    finally:
        _restore_test_config(monkeypatch)


def test_missing_app_env_uses_secure_defaults(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("REQUIRE_API_KEY_FOR_RATE_LIMIT", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)

    import config

    reloaded = importlib.reload(config)
    try:
        assert reloaded.APP_ENV == "production"
        assert reloaded.REQUIRE_API_KEY_FOR_RATE_LIMIT is True
        assert reloaded.CORS_ORIGINS == []
    finally:
        _restore_test_config(monkeypatch)


def test_cors_origins_can_be_overridden_from_environment(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com, https://admin.example.com")

    import config

    reloaded = importlib.reload(config)
    try:
        assert reloaded.CORS_ORIGINS == ["https://app.example.com", "https://admin.example.com"]
    finally:
        _restore_test_config(monkeypatch)


def test_production_logs_warning_when_api_key_requirement_is_disabled(monkeypatch, caplog):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("REQUIRE_API_KEY_FOR_RATE_LIMIT", "false")

    import config

    with caplog.at_level(logging.WARNING, logger="config"):
        reloaded = importlib.reload(config)
    try:
        assert reloaded.REQUIRE_API_KEY_FOR_RATE_LIMIT is False
        assert "APP_ENV=production but REQUIRE_API_KEY_FOR_RATE_LIMIT is disabled" in caplog.text
    finally:
        _restore_test_config(monkeypatch)
