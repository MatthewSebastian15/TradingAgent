"""Startup validation for backend configuration."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from config_defaults import (
    ALPHA_VANTAGE_API_KEY,
    ANALYSIS_DB_PATH,
    ANALYSIS_DEPTHS,
    ANALYSIS_JOB_CACHE_DB_PATH,
    ANALYSIS_JOB_ROUTING_MODE,
    ANALYSIS_MODE,
    API_KEY,
    DATA_CACHE_DB_PATH,
    DEBUG_ENDPOINTS_ENABLED,
    DEFAULT_ANALYSIS_DEPTH,
    FINNHUB_API_KEY,
    IS_PRODUCTION,
    MARKETAUX_API_KEY,
    NEWSDATA_API_KEY,
    OWNER_SESSION_SECRET,
    RATE_LIMIT_DB_PATH,
    RATE_LIMIT_STORAGE_BACKEND,
    REQUIRE_API_KEY_FOR_RATE_LIMIT,
)
from config_llm import (
    PROVIDER_API_KEY_ENV,
    SUPPORTED_PROVIDERS,
    build_tradingagents_config,
    llm,
)

logger = logging.getLogger(__name__)


def _has_any_env(*names: str) -> bool:
    return any(bool(os.getenv(n)) for n in names)


def _validate_writable_dir(path: str, key: str, errors: list[str]) -> None:
    try:
        directory = Path(path).expanduser()
        directory.mkdir(parents=True, exist_ok=True)
        test_file = directory / ".write_test"
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink(missing_ok=True)
    except Exception:
        errors.append(f"Directory for {key} is not writable.")


def _validate_writable_parent(path: str, key: str, errors: list[str]) -> None:
    _validate_writable_dir(str(Path(path).expanduser().parent), key, errors)


# Derived from the single source in config_llm so the two never drift.
PROVIDER_KEY_REQUIREMENTS: dict[str, tuple[tuple[str, ...], str]] = {
    provider: (
        keys,
        f"{' or '.join(keys)} is required when LLM_PROVIDER={provider}.",
    )
    for provider, keys in PROVIDER_API_KEY_ENV.items()
}


def _warn_finnhub_runtime_mismatch() -> None:
    api_key = bool(str(os.getenv("FINNHUB_API_KEY") or "").strip())
    enabled = str(os.getenv("FINNHUB_ENABLED") or "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if api_key and not enabled:
        logger.warning(
            "FINNHUB_API_KEY is set but FINNHUB_ENABLED=false; Finnhub calls will be skipped"
        )
    if enabled and not api_key:
        logger.warning(
            "FINNHUB_ENABLED=true but FINNHUB_API_KEY is empty; Finnhub calls will be skipped"
        )


def validate_startup_config() -> list[str]:
    errors: list[str] = []
    _warn_finnhub_runtime_mismatch()

    provider = llm.provider
    if not provider:
        errors.append("CRITICAL: LLM_PROVIDER is not set. LLM routing will fail.")
    elif provider not in SUPPORTED_PROVIDERS:
        errors.append(
            f"CRITICAL: LLM_PROVIDER must be one of: {', '.join(sorted(SUPPORTED_PROVIDERS))}."
        )

    if not llm.llm_api_key:
        _keys, message = PROVIDER_KEY_REQUIREMENTS.get(
            provider, ((), "An LLM API key is required.")
        )
        errors.append(f"CRITICAL: {message} LLM calls will fail.")

    if not llm.deep_think_llm:
        errors.append("CRITICAL: DEEP_THINK_LLM is not set. Deep thinking calls will fail.")
    if not llm.quick_think_llm:
        errors.append("CRITICAL: QUICK_THINK_LLM is not set. Quick thinking calls will fail.")
    if not MARKETAUX_API_KEY:
        errors.append("WARNING: MARKETAUX_API_KEY is empty. Marketaux news will be unavailable.")
    if not NEWSDATA_API_KEY:
        errors.append("WARNING: NEWSDATA_API_KEY is empty. NewsData will be unavailable.")
    if not FINNHUB_API_KEY:
        errors.append("WARNING: FINNHUB_API_KEY is empty. Finnhub fallback will be unavailable.")
    if not ALPHA_VANTAGE_API_KEY:
        errors.append("WARNING: ALPHA_VANTAGE_API_KEY is empty. Alpha Vantage will be skipped.")
    if DEBUG_ENDPOINTS_ENABLED:
        errors.append("WARNING: DEBUG_ENDPOINTS_ENABLED=true. Debug endpoints are active.")
    if REQUIRE_API_KEY_FOR_RATE_LIMIT and not API_KEY:
        errors.append("API_KEY is required when REQUIRE_API_KEY_FOR_RATE_LIMIT=true.")
    if IS_PRODUCTION and not OWNER_SESSION_SECRET:
        errors.append("OWNER_SESSION_SECRET is required when APP_ENV=production.")
    if IS_PRODUCTION and RATE_LIMIT_STORAGE_BACKEND == "memory":
        errors.append("RATE_LIMIT_STORAGE_BACKEND=memory is not allowed in production.")
    if ANALYSIS_JOB_ROUTING_MODE == "single_instance" and IS_PRODUCTION:
        logger.warning(
            "ANALYSIS_JOB_ROUTING_MODE=single_instance requires exactly one backend instance."
        )

    _validate_writable_parent(ANALYSIS_DB_PATH, "ANALYSIS_DB_PATH", errors)
    _validate_writable_parent(ANALYSIS_JOB_CACHE_DB_PATH, "ANALYSIS_JOB_CACHE_DB_PATH", errors)
    _validate_writable_parent(DATA_CACHE_DB_PATH, "DATA_CACHE_DB_PATH", errors)
    if RATE_LIMIT_STORAGE_BACKEND == "sqlite":
        _validate_writable_parent(RATE_LIMIT_DB_PATH, "RATE_LIMIT_DB_PATH", errors)

    if ANALYSIS_MODE != "balanced":
        errors.append(
            "ANALYSIS_MODE must be balanced. The API server only supports the balanced pipeline."
        )
    if DEFAULT_ANALYSIS_DEPTH not in ANALYSIS_DEPTHS:
        errors.append("DEFAULT_ANALYSIS_DEPTH must be one of: fast, balanced, deep.")

    try:
        config = build_tradingagents_config()
        _validate_writable_dir(config.get("results_dir", ""), "results_dir", errors)
        _validate_writable_dir(config.get("data_cache_dir", ""), "data_cache_dir", errors)
    except Exception as exc:
        errors.append(f"TradingAgents config could not be loaded: {exc}")

    return errors
