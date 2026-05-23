"""Model name validators for each provider."""

from __future__ import annotations

from .model_catalog import KNOWN_MODELS, OPEN_MODEL_PROVIDERS


def validate_model(provider: str, model: str) -> bool:
    """Check if model name is valid for the given provider.

    For ollama, openrouter, and azure any model string is accepted.
    For providers with a known catalog, the model must be in the list.
    Unknown providers are also accepted to stay forward-compatible.
    """
    provider_lower = provider.lower()

    if provider_lower in OPEN_MODEL_PROVIDERS:
        return True

    if provider_lower not in KNOWN_MODELS:
        return True

    return model in KNOWN_MODELS[provider_lower]
