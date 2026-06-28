"""Model name validators for each provider."""

from __future__ import annotations

from .model_catalog import KNOWN_MODELS


def validate_model(provider: str, model: str) -> bool:
    """Check if model name is valid for the given provider.

    For providers with a known catalog, the model must be in the list.
    Unknown providers are accepted to stay forward-compatible.
    """
    provider_lower = provider.lower()

    if provider_lower not in KNOWN_MODELS:
        return True

    normalized_model = model.strip().lower()
    return normalized_model in {known_model.lower() for known_model in KNOWN_MODELS[provider_lower]}
