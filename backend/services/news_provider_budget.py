from __future__ import annotations

import os
import time
from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class ProviderState:
    cooldown_until: float = 0
    last_error: str | None = None
    last_success_at: str | None = None
    last_failure_at: str | None = None


_PROVIDER_STATE: dict[str, ProviderState] = {}
DEFAULT_429_COOLDOWN_SECONDS = 1800


def _utc_now_text() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _cooldown_seconds(default: int = DEFAULT_429_COOLDOWN_SECONDS) -> int:
    try:
        return max(1, int(os.environ.get("NEWS_PROVIDER_429_COOLDOWN_SECONDS", default)))
    except (TypeError, ValueError):
        return default


def is_provider_available(provider: str) -> bool:
    state = _PROVIDER_STATE.get(provider)
    if state is None:
        return True
    return time.time() >= state.cooldown_until


def provider_cooldown_remaining(provider: str) -> int:
    state = _PROVIDER_STATE.get(provider)
    if state is None:
        return 0
    return max(0, int(state.cooldown_until - time.time()))


def mark_provider_429(provider: str, *, cooldown_seconds: int | None = None) -> None:
    state = _PROVIDER_STATE.setdefault(provider, ProviderState())
    state.cooldown_until = time.time() + int(cooldown_seconds or _cooldown_seconds())
    state.last_error = "429"
    state.last_failure_at = _utc_now_text()


def mark_provider_failure(provider: str, error: str) -> None:
    state = _PROVIDER_STATE.setdefault(provider, ProviderState())
    state.last_error = str(error or "error")[:120]
    state.last_failure_at = _utc_now_text()


def mark_provider_success(provider: str) -> None:
    state = _PROVIDER_STATE.setdefault(provider, ProviderState())
    state.cooldown_until = 0
    state.last_error = None
    state.last_success_at = _utc_now_text()


def provider_status(provider: str) -> str:
    state = _PROVIDER_STATE.get(provider)
    if state is not None and time.time() < state.cooldown_until:
        return "cooldown"
    if state is not None and state.last_error == "429":
        return "rate_limited"
    if state is not None and state.last_error:
        return "error"
    if state is not None and state.last_success_at:
        return "success"
    return "skipped"


def provider_status_snapshot(providers: list[str] | tuple[str, ...]) -> dict[str, str]:
    return {provider: provider_status(provider) for provider in providers}


def provider_state_snapshot() -> dict[str, dict[str, Any]]:
    return {provider: asdict(state) for provider, state in _PROVIDER_STATE.items()}


def result_has_429(result: Any) -> bool:
    attempts = getattr(result, "attempts", None) or []
    for attempt in attempts:
        if not isinstance(attempt, dict):
            continue
        if int(attempt.get("status_code") or 0) == 429:
            return True
        status = str(attempt.get("status") or "").lower()
        if status in {"429", "rate_limited", "vendor_quota_error"}:
            return True
    return str(getattr(result, "status", "") or "").lower() in {"429", "rate_limited"}


def clear_provider_budget_for_tests() -> None:
    _PROVIDER_STATE.clear()
