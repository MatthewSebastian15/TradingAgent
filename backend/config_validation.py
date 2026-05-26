"""Startup validation for backend configuration."""

from __future__ import annotations

import os
from pathlib import Path

from config_defaults import ANALYSIS_DEPTHS, ANALYSIS_MODE, DEFAULT_ANALYSIS_DEPTH, REQUIRE_API_KEY_FOR_RATE_LIMIT
from config_llm import SUPPORTED_PROVIDERS, build_tradingagents_config, llm


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


def validate_startup_config() -> list[str]:
    errors: list[str] = []

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

    if ANALYSIS_MODE not in {"balanced", "classic"}:
        errors.append("ANALYSIS_MODE must be either balanced or classic.")
    if DEFAULT_ANALYSIS_DEPTH not in ANALYSIS_DEPTHS:
        errors.append("DEFAULT_ANALYSIS_DEPTH must be one of: fast, balanced, deep.")

    try:
        config = build_tradingagents_config()
        _validate_writable_dir(config.get("results_dir", ""), "results_dir", errors)
        _validate_writable_dir(config.get("data_cache_dir", ""), "data_cache_dir", errors)
    except Exception as exc:
        errors.append(f"TradingAgents config could not be loaded: {exc}")

    return errors
