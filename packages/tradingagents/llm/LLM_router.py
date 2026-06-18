from __future__ import annotations

from typing import Any

from tradingagents.graph.prompt_context_builder import PromptContext
from tradingagents.llm_clients import create_llm_client

ACTIONABLE_ACTIONS = {"BUY", "SELL", "Buy", "Sell"}


def provider_kwargs(config: dict[str, Any]) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    if config.get("timeout"):
        kwargs["timeout"] = config.get("timeout")
    if config.get("provider_sdk_max_retries") is not None:
        kwargs["max_retries"] = config.get("provider_sdk_max_retries")
    if config.get("llm_api_key"):
        kwargs["api_key"] = config.get("llm_api_key")

    provider = str(config.get("llm_provider", "")).lower()
    if provider == "google" and config.get("google_thinking_level"):
        kwargs["thinking_level"] = config.get("google_thinking_level")
    if provider == "openai" and config.get("openai_reasoning_effort"):
        kwargs["reasoning_effort"] = config.get("openai_reasoning_effort")
    if provider == "anthropic" and config.get("anthropic_effort"):
        kwargs["effort"] = config.get("anthropic_effort")
    return kwargs


def create_llms(config: dict[str, Any]) -> tuple[Any, Any]:
    kwargs = provider_kwargs(config)
    quick_client = create_llm_client(
        provider=config["llm_provider"],
        model=config["quick_think_llm"],
        base_url=config.get("backend_url"),
        **kwargs,
    )
    deep_client = create_llm_client(
        provider=config["llm_provider"],
        model=config["deep_think_llm"],
        base_url=config.get("backend_url"),
        **kwargs,
    )
    return quick_client.get_llm(), deep_client.get_llm()


def llm_metadata(config: dict[str, Any]) -> dict[str, Any]:
    return {
        "provider": str(config.get("llm_provider") or ""),
        "models": {
            "quick_think": str(config.get("quick_think_llm") or ""),
            "deep_think": str(config.get("deep_think_llm") or ""),
        },
        "config_source": "env",
    }


def apply_guardrail(
    context: PromptContext,
    proposed_action: str,
) -> tuple[str, list[str]]:
    warnings = []

    action = _normalize_action(proposed_action)

    if context.data_quality.get("quote_missing"):
        if action in {"BUY", "SELL"}:
            action = "WAIT"
            warnings.append("Action downgraded to WAIT: price data unavailable")

    if context.data_quality.get("historical_missing"):
        warnings.append("Technical confidence downgraded: historical data unavailable")

    if context.data_quality.get("financials_missing"):
        warnings.append("Fundamental confidence downgraded: financial data unavailable")

    if context.data_quality.get("news_missing"):
        warnings.append("Sentiment confidence downgraded: news data unavailable")

    if _numeric_score(context.data_quality.get("source_confidence_score", 100), default=100) < 50:
        if action in {"BUY", "SELL"}:
            action = "WAIT"
            warnings.append("Action downgraded to WAIT: data quality too low")

    if context.data_quality.get("blocking_fields_missing"):
        if action in {"BUY", "SELL"}:
            action = "WAIT"
            warnings.append("Action downgraded to WAIT: blocking data unavailable")

    return action, warnings


def _normalize_action(value: str) -> str:
    normalized = str(value or "").strip().upper()
    if normalized in {"BUY", "SELL", "WAIT", "HOLD"}:
        return normalized
    if normalized == "OVERWEIGHT":
        return "BUY"
    if normalized == "UNDERWEIGHT":
        return "SELL"
    return "WAIT"


def _numeric_score(value: Any, *, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
