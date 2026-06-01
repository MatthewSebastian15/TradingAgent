from __future__ import annotations

import importlib
import logging
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import pytest
from tradingagents.llm_clients.model_catalog import (
    DEEPSEEK_CHAT_MODEL,
    DEEPSEEK_REASONER_MODEL,
    MODEL_CATALOG,
)

from errors import BadRequestError
from routes.validation import AnalysisRequest, normalize_and_validate_analysis_request

_GOOGLE_QUICK_LLM = MODEL_CATALOG["google"]["quick"][0][1]
_GOOGLE_DEEP_LLM = MODEL_CATALOG["google"]["deep"][0][1]


def test_env_example_does_not_define_duplicate_keys():
    env_example = Path(__file__).resolve().parents[1] / ".env.example"
    keys = [
        line.split("=", 1)[0].strip()
        for line in env_example.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#") and "=" in line
    ]

    duplicates = sorted(key for key, count in Counter(keys).items() if count > 1)

    assert duplicates == []


def test_invalid_boolean_environment_value_is_rejected(monkeypatch):
    from config_env import env_bool

    monkeypatch.setenv("TEST_BOOLEAN_VALUE", "sometimes")

    with pytest.raises(ValueError, match="TEST_BOOLEAN_VALUE"):
        env_bool("TEST_BOOLEAN_VALUE", False)


def test_invalid_integer_environment_value_is_rejected(monkeypatch):
    from config_env import env_int

    monkeypatch.setenv("TEST_INTEGER_VALUE", "1.5")

    with pytest.raises(ValueError, match="TEST_INTEGER_VALUE"):
        env_int("TEST_INTEGER_VALUE", 1, min_value=1)


def test_out_of_range_float_environment_value_is_rejected(monkeypatch):
    from config_env import env_float

    monkeypatch.setenv("TEST_FLOAT_VALUE", "1.5")

    with pytest.raises(ValueError, match="TEST_FLOAT_VALUE"):
        env_float("TEST_FLOAT_VALUE", 0.35, min_value=0, max_value=1)


def test_startup_rejects_invalid_data_vendor_news_relevance_score(monkeypatch):
    import config

    try:
        with monkeypatch.context() as env:
            env.setenv("DATA_VENDOR_NEWS_MIN_RELEVANCE_SCORE", "1.5")
            with pytest.raises(ValueError, match="DATA_VENDOR_NEWS_MIN_RELEVANCE_SCORE"):
                importlib.reload(config)
    finally:
        importlib.reload(config)


def test_ticker_bbcajk_is_valid():
    req = normalize_and_validate_analysis_request(
        AnalysisRequest(ticker="BBCA.JK", trade_date="2026-05-14", max_debate_rounds=3)
    )

    assert req.ticker == "BBCA.JK"
    assert req.trade_date == "2026-05-14"
    assert req.time_horizon_months == 1
    assert req.max_debate_rounds == 3


def test_time_horizon_months_accepts_supported_values():
    req = normalize_and_validate_analysis_request(
        AnalysisRequest(ticker="BBCA.JK", trade_date="2026-05-14", time_horizon_months=3)
    )

    assert req.time_horizon_months == 3


def test_time_horizon_months_rejects_unsupported_values():
    with pytest.raises(BadRequestError) as exc_info:
        normalize_and_validate_analysis_request(
            AnalysisRequest(ticker="BBCA.JK", trade_date="2026-05-14", time_horizon_months=6)
        )

    assert exc_info.value.status_code == 400
    assert "time_horizon_months" in exc_info.value.details["fields"]


def test_ticker_bbca_is_valid_and_normalized():
    req = normalize_and_validate_analysis_request(
        AnalysisRequest(ticker="bbca", trade_date="2026-05-14", max_debate_rounds=1)
    )

    assert req.ticker == "BBCA.JK"


def test_indonesia_market_appends_jk_for_plain_symbol():
    req = normalize_and_validate_analysis_request(
        AnalysisRequest(ticker="unvr", market="ID", trade_date="2026-05-14", max_debate_rounds=1)
    )

    assert req.ticker == "UNVR.JK"
    assert req.market == "ID"


def test_indonesia_market_appends_jk_for_symbol_outside_common_allowlist():
    req = normalize_and_validate_analysis_request(
        AnalysisRequest(ticker="bren", market="id", trade_date="2026-05-14", max_debate_rounds=1)
    )

    assert req.ticker == "BREN.JK"
    assert req.market == "ID"


def test_us_ticker_is_not_normalized_to_idx_suffix():
    req = normalize_and_validate_analysis_request(
        AnalysisRequest(ticker="aapl", trade_date="2026-05-14", max_debate_rounds=1)
    )

    assert req.ticker == "AAPL"


def test_explicit_us_market_does_not_apply_idx_allowlist():
    req = normalize_and_validate_analysis_request(
        AnalysisRequest(ticker="bbca", market="US", trade_date="2026-05-14", max_debate_rounds=1)
    )

    assert req.ticker == "BBCA"


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
    monkeypatch.setenv("DEEP_THINK_LLM", DEEPSEEK_REASONER_MODEL)
    monkeypatch.setenv("QUICK_THINK_LLM", DEEPSEEK_CHAT_MODEL)
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-key")
    monkeypatch.setenv("ANALYSIS_MODE", "balanced")
    monkeypatch.setenv("MAX_GEMINI_CALLS", "9")

    import config

    reloaded = importlib.reload(config)
    errors = reloaded.validate_startup_config()

    assert not [error for error in errors if "DEEPSEEK_API_KEY" in error or "LLM_PROVIDER" in error]

    monkeypatch.setenv("LLM_PROVIDER", "google")
    importlib.reload(config)


def test_startup_config_requires_model_env(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "google")
    monkeypatch.setenv("GOOGLE_API_KEY", "test-google-key")
    monkeypatch.delenv("DEEP_THINK_LLM", raising=False)
    monkeypatch.delenv("QUICK_THINK_LLM", raising=False)

    import config

    reloaded = importlib.reload(config)
    try:
        errors = reloaded.validate_startup_config()
        assert "DEEP_THINK_LLM must not be empty." in errors
        assert "QUICK_THINK_LLM must not be empty." in errors
    finally:
        _restore_test_config(monkeypatch)


def test_google_model_env_values_are_normalized_to_lowercase(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "google")
    monkeypatch.setenv("GOOGLE_API_KEY", "test-google-key")
    monkeypatch.setenv("DEEP_THINK_LLM", "gemini-3.5-Flash")
    monkeypatch.setenv("QUICK_THINK_LLM", "gemini-3.1-Flash-Lite")

    import config

    reloaded = importlib.reload(config)
    try:
        assert reloaded.llm.deep_think_llm == "gemini-3.5-flash"
        assert reloaded.llm.quick_think_llm == "gemini-3.1-flash-lite"
    finally:
        _restore_test_config(monkeypatch)


def _restore_test_config(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("LLM_PROVIDER", "google")
    monkeypatch.setenv("DEEP_THINK_LLM", _GOOGLE_DEEP_LLM)
    monkeypatch.setenv("QUICK_THINK_LLM", _GOOGLE_QUICK_LLM)
    monkeypatch.setenv("REQUIRE_API_KEY_FOR_RATE_LIMIT", "false")
    monkeypatch.delenv("OWNER_SESSION_SECRET", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)

    import config

    importlib.reload(config)


def test_production_defaults_require_api_key_and_rate_limit(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com")
    monkeypatch.setenv("API_KEY", "test-api-key")
    monkeypatch.setenv("OWNER_SESSION_SECRET", "test-owner-session-secret")
    monkeypatch.delenv("REQUIRE_API_KEY_FOR_RATE_LIMIT", raising=False)

    import config

    reloaded = importlib.reload(config)
    try:
        assert reloaded.APP_ENV == "production"
        assert reloaded.IS_PRODUCTION is True
        assert reloaded.REQUIRE_API_KEY_FOR_RATE_LIMIT is True
        assert reloaded.CORS_ORIGINS == ["https://app.example.com"]
    finally:
        _restore_test_config(monkeypatch)


def test_missing_app_env_uses_development_defaults(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("REQUIRE_API_KEY_FOR_RATE_LIMIT", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)

    import config

    reloaded = importlib.reload(config)
    try:
        assert reloaded.APP_ENV == "development"
        assert reloaded.IS_DEVELOPMENT is True
        assert reloaded.REQUIRE_API_KEY_FOR_RATE_LIMIT is False
        assert reloaded.CORS_ORIGINS == [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ]
    finally:
        _restore_test_config(monkeypatch)


def test_invalid_app_env_is_rejected(monkeypatch):
    import config

    monkeypatch.setenv("APP_ENV", "staging")

    try:
        with pytest.raises(ValueError, match="Invalid APP_ENV"):
            importlib.reload(config)
    finally:
        _restore_test_config(monkeypatch)


def test_production_requires_cors_origins(monkeypatch):
    import config

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("API_KEY", "test-api-key")
    monkeypatch.delenv("CORS_ORIGINS", raising=False)

    try:
        with pytest.raises(ValueError, match="CORS_ORIGINS must be explicitly configured"):
            importlib.reload(config)
    finally:
        _restore_test_config(monkeypatch)


def test_production_requires_api_key(monkeypatch):
    import config

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com")
    monkeypatch.delenv("API_KEY", raising=False)

    try:
        with pytest.raises(ValueError, match="API_KEY must be configured in production"):
            importlib.reload(config)
    finally:
        _restore_test_config(monkeypatch)


def test_production_requires_owner_session_secret(monkeypatch):
    import config

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com")
    monkeypatch.setenv("API_KEY", "test-api-key")
    monkeypatch.delenv("OWNER_SESSION_SECRET", raising=False)

    try:
        with pytest.raises(ValueError, match="OWNER_SESSION_SECRET must be configured in production"):
            importlib.reload(config)
    finally:
        _restore_test_config(monkeypatch)


def test_wildcard_cors_is_rejected(monkeypatch):
    import config

    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("CORS_ORIGINS", "*")

    try:
        with pytest.raises(ValueError, match=r"CORS_ORIGINS='\*' is not allowed"):
            importlib.reload(config)
    finally:
        _restore_test_config(monkeypatch)


def test_cors_origins_can_be_overridden_from_environment(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("API_KEY", "test-api-key")
    monkeypatch.setenv("OWNER_SESSION_SECRET", "test-owner-session-secret")
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com, https://admin.example.com")

    import config

    reloaded = importlib.reload(config)
    try:
        assert reloaded.CORS_ORIGINS == ["https://app.example.com", "https://admin.example.com"]
    finally:
        _restore_test_config(monkeypatch)


def test_production_logs_warning_when_api_key_requirement_is_disabled(monkeypatch, caplog):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("API_KEY", "test-api-key")
    monkeypatch.setenv("OWNER_SESSION_SECRET", "test-owner-session-secret")
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com")
    monkeypatch.setenv("REQUIRE_API_KEY_FOR_RATE_LIMIT", "false")

    import config

    with caplog.at_level(logging.WARNING, logger="config"):
        reloaded = importlib.reload(config)
    try:
        assert reloaded.REQUIRE_API_KEY_FOR_RATE_LIMIT is False
        assert "APP_ENV=production but REQUIRE_API_KEY_FOR_RATE_LIMIT is disabled" in caplog.text
    finally:
        _restore_test_config(monkeypatch)


def test_global_market_is_rejected():
    with pytest.raises(BadRequestError) as exc_info:
        normalize_and_validate_analysis_request(
            AnalysisRequest(ticker="700.HK", market="GLOBAL", trade_date="2026-05-14", max_debate_rounds=1)
        )

    assert exc_info.value.status_code == 400
    assert "market" in exc_info.value.details["fields"]


def test_non_id_exchange_suffix_is_rejected():
    with pytest.raises(BadRequestError) as exc_info:
        normalize_and_validate_analysis_request(
            AnalysisRequest(ticker="SAP.DE", market="US", trade_date="2026-05-14", max_debate_rounds=1)
        )

    assert exc_info.value.status_code == 400
    assert "ticker" in exc_info.value.details["fields"]


def test_hk_suffix_ticker_is_rejected():
    with pytest.raises(BadRequestError) as exc_info:
        normalize_and_validate_analysis_request(
            AnalysisRequest(ticker="700.HK", market="US", trade_date="2026-05-14", max_debate_rounds=1)
        )

    assert exc_info.value.status_code == 400
    assert "ticker" in exc_info.value.details["fields"]
