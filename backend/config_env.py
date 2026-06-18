"""Environment loading and parsing helpers for backend configuration."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

_TRUE_VALUES = {"1", "true", "yes", "on"}
_FALSE_VALUES = {"0", "false", "no", "off"}


def env_bool_raw(value: str | None, default: bool = False, *, name: str = "value") -> bool:
    if value is None or not value.strip():
        return default

    normalized = value.strip().lower()
    if normalized in _TRUE_VALUES:
        return True
    if normalized in _FALSE_VALUES:
        return False
    raise ValueError(f"Invalid boolean value for {name}={value!r}.")


def should_load_dotenv() -> bool:
    """Load local .env for app runtime, but keep tests hermetic."""
    if env_bool_raw(
        os.getenv("TRADINGAGENTS_SKIP_DOTENV"), False, name="TRADINGAGENTS_SKIP_DOTENV"
    ):
        return False
    return not os.getenv("PYTEST_CURRENT_TEST")


if should_load_dotenv():
    load_dotenv(BASE_DIR / ".env")


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def env_bool(name: str, default: bool) -> bool:
    return env_bool_raw(os.getenv(name), default, name=name)


def env_int(name: str, default: int, *, min_value: int | None = None) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default

    try:
        value = int(raw.strip())
    except ValueError as exc:
        raise ValueError(f"Invalid integer value for {name}={raw!r}.") from exc

    if min_value is not None and value < min_value:
        raise ValueError(f"{name}={raw!r} must be greater than or equal to {min_value}.")

    return value


def env_float(
    name: str,
    default: float,
    *,
    min_value: float | None = None,
    max_value: float | None = None,
) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default

    try:
        value = float(raw.strip())
    except ValueError as exc:
        raise ValueError(f"Invalid float value for {name}={raw!r}.") from exc

    if min_value is not None and value < min_value:
        raise ValueError(f"{name}={raw!r} must be greater than or equal to {min_value}.")
    if max_value is not None and value > max_value:
        raise ValueError(f"{name}={raw!r} must be less than or equal to {max_value}.")

    return value


def env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if raw is None:
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]
