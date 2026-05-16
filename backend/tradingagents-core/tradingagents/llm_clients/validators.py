"""Model name validators for each provider.

Imports KNOWN_MODELS from backend config so model_catalog.py is no longer needed.
Falls back to an empty dict if imported outside the backend context (e.g. in CLI).
"""

from __future__ import annotations

import sys

try:
    # When running inside the backend process, config is on sys.path
    from config import KNOWN_MODELS, OPEN_MODEL_PROVIDERS
except ImportError:
    # CLI or standalone usage: accept any model without validation
    KNOWN_MODELS: dict[str, list[str]] = {}
    OPEN_MODEL_PROVIDERS: frozenset[str] = frozenset({"ollama", "openrouter", "azure"})


def validate_model(provider: str, model: str) -> bool:
    """Check if model name is valid for the given provider.

    For ollama, openrouter, and azure any model string is accepted.
    For providers with a known catalog, the model must be in the list.
    Unknown providers (not in catalog) are also accepted to stay forward-compatible.
    """
    provider_lower = provider.lower()

    if provider_lower in OPEN_MODEL_PROVIDERS:
        return True

    if provider_lower not in KNOWN_MODELS:
        return True

    return model in KNOWN_MODELS[provider_lower]
