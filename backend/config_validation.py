"""Startup validation for backend configuration."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from config_defaults import (
    ANALYSIS_DB_PATH,
    ANALYSIS_DEPTHS,
    ANALYSIS_JOB_CACHE_DB_PATH,
    ANALYSIS_JOB_ROUTING_MODE,
    ANALYSIS_MODE,
    DATA_CACHE_DB_PATH,
    DEFAULT_ANALYSIS_DEPTH,
    IS_PRODUCTION,
    OWNER_SESSION_SECRET,
    RATE_LIMIT_DB_PATH,
    RATE_LIMIT_STORAGE_BACKEND,
    REQUIRE_API_KEY_FOR_RATE_LIMIT,
)
from config_llm import SUPPORTED_PROVIDERS, build_tradingagents_config, llm

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


PROVIDER_KEY_REQUIREMENTS: dict[str, tuple[tuple[str, ...], str]] = {
    "google": (
        ("GOOGLE_API_KEY", "GEMINI_API_KEY"),
        "GOOGLE_API_KEY or GEMINI_API_KEY is required when LLM_PROVIDER=google.",
    ),
    "openai": (("OPENAI_API_KEY",), "OPENAI_API_KEY is required when LLM_PROVIDER=openai."),
    "anthropic": (("ANTHROPIC_API_KEY",), "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic."),
    "deepseek": (("DEEPSEEK_API_KEY",), "DEEPSEEK_API_KEY is required when LLM_PROVIDER=deepseek."),
    "openrouter": (("OPENROUTER_API_KEY",), "OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter."),
}



def _warn_finnhub_runtime_mismatch() -> None:
    api_key = bool(str(os.getenv("FINNHUB_API_KEY") or "").strip())
    enabled = str(os.getenv("FINNHUB_ENABLED") or "false").strip().lower() in {"1", "true", "yes", "on"}
    if api_key and not enabled:
        logger.warning("FINNHUB_API_KEY is set but FINNHUB_ENABLED=false; Finnhub calls will be skipped")
    if enabled and not api_key:
        logger.warning("FINNHUB_ENABLED=true but FINNHUB_API_KEY is empty; Finnhub calls will be skipped")

def validate_startup_config() -> list[str]:
    errors: list[str] = []
    _warn_finnhub_runtime_mismatch()

    provider = llm.provider
    if not provider:
        errors.append("LLM_PROVIDER must not be empty.")
    elif provider not in SUPPORTED_PROVIDERS:
        errors.append(f"LLM_PROVIDER must be one of: {', '.join(sorted(SUPPORTED_PROVIDERS))}.")

    if provider in PROVIDER_KEY_REQUIREMENTS:
        env_names, message = PROVIDER_KEY_REQUIREMENTS[provider]
        if not _has_any_env(*env_names):
            errors.append(message)

    if not llm.deep_think_llm:
        errors.append("DEEP_THINK_LLM must not be empty.")
    if not llm.quick_think_llm:
        errors.append("QUICK_THINK_LLM must not be empty.")
    if REQUIRE_API_KEY_FOR_RATE_LIMIT and not llm.api_key:
        errors.append("API_KEY is required when REQUIRE_API_KEY_FOR_RATE_LIMIT=true.")
    if IS_PRODUCTION and not OWNER_SESSION_SECRET:
        errors.append("OWNER_SESSION_SECRET is required when APP_ENV=production.")
    if IS_PRODUCTION and RATE_LIMIT_STORAGE_BACKEND == "memory":
        errors.append("RATE_LIMIT_STORAGE_BACKEND=memory is not allowed in production.")
    if ANALYSIS_JOB_ROUTING_MODE == "single_instance" and IS_PRODUCTION:
        logger.warning("ANALYSIS_JOB_ROUTING_MODE=single_instance requires exactly one backend instance.")

    _validate_writable_parent(ANALYSIS_DB_PATH, "ANALYSIS_DB_PATH", errors)
    _validate_writable_parent(ANALYSIS_JOB_CACHE_DB_PATH, "ANALYSIS_JOB_CACHE_DB_PATH", errors)
    _validate_writable_parent(DATA_CACHE_DB_PATH, "DATA_CACHE_DB_PATH", errors)
    if RATE_LIMIT_STORAGE_BACKEND == "sqlite":
        _validate_writable_parent(RATE_LIMIT_DB_PATH, "RATE_LIMIT_DB_PATH", errors)

    if ANALYSIS_MODE != "balanced":
        errors.append("ANALYSIS_MODE must be balanced. The API server only supports the balanced pipeline.")
    if DEFAULT_ANALYSIS_DEPTH not in ANALYSIS_DEPTHS:
        errors.append("DEFAULT_ANALYSIS_DEPTH must be one of: fast, balanced, deep.")

    try:
        config = build_tradingagents_config()
        _validate_writable_dir(config.get("results_dir", ""), "results_dir", errors)
        _validate_writable_dir(config.get("data_cache_dir", ""), "data_cache_dir", errors)
    except Exception as exc:
        errors.append(f"TradingAgents config could not be loaded: {exc}")

    return errors
