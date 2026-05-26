"""Environment loading and parsing helpers for backend configuration."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

# Keep the legacy logger name so existing log assertions and operations filters
# continue to work after splitting config.py into smaller modules.
logger = logging.getLogger("config")


def env_bool_raw(value: str | None, default: bool = False) -> bool:
    if value is None or not value.strip():
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def should_load_dotenv() -> bool:
    """Load local .env for app runtime, but keep tests hermetic."""
    if env_bool_raw(os.getenv("TRADINGAGENTS_SKIP_DOTENV"), False):
        return False
    return not os.getenv("PYTEST_CURRENT_TEST")


if should_load_dotenv():
    load_dotenv(BASE_DIR / ".env")


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default

    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False

    logger.warning("Invalid boolean value for %s=%r; using default %s.", name, raw, default)
    return default


def env_int(name: str, default: int, *, min_value: int | None = None) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default

    try:
        value = int(raw.strip())
    except ValueError:
        logger.warning("Invalid integer value for %s=%r; using default %s.", name, raw, default)
        return default

    if min_value is not None and value < min_value:
        logger.warning("%s=%r is below minimum %s; using default %s.", name, raw, min_value, default)
        return default

    return value


def env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if raw is None:
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]
