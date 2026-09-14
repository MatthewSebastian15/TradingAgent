"""Single env-read surface for the engine (audit CONFIG-001).

Engine modules must not call os.getenv/os.environ directly — route reads
through these getters so a renamed variable is one grep away and tests have
one seam to patch. Values are read at call time, so monkeypatch.setenv works.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def raw(name: str, default: str | None = None) -> str | None:
    return os.getenv(name, default)


def stripped(name: str, default: str = "") -> str:
    return (os.getenv(name) or "").strip() or default


def stripped_or_none(name: str) -> str | None:
    value = (os.getenv(name) or "").strip()
    return value or None


def integer(name: str, default: int, *, min_value: int = 1) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return max(min_value, int(value))
    except ValueError:
        logger.warning("Invalid integer for %s=%r; using default %s", name, value, default)
        return default


def floating(name: str, default: float, *, min_value: float = 0.0) -> float:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return max(min_value, float(value))
    except ValueError:
        logger.warning("Invalid float for %s=%r; using default %s", name, value, default)
        return default


def first_set(*names: str) -> str | None:
    return next((os.environ.get(name) for name in names if os.environ.get(name)), None)


def alpha_vantage_key() -> str:
    return stripped("ALPHA_VANTAGE_API_KEY")
