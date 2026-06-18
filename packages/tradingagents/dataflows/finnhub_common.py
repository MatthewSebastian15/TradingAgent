from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

import requests

from .config import get_config

logger = logging.getLogger(__name__)


class FinnhubError(Exception):
    """Base error for Finnhub dataflow failures."""


class FinnhubConfigError(FinnhubError):
    """Raised when Finnhub is disabled or not configured."""


class FinnhubRateLimitError(FinnhubError):
    """Raised when Finnhub returns HTTP 429."""


class FinnhubUnavailableError(FinnhubError):
    """Raised when Finnhub cannot return usable data."""


FEATURE_BY_METHOD = {
    "get_quote": "enable_stock_data",
    "get_stock_data": "enable_stock_data",
    "get_indicators": "enable_stock_data",
    "get_fundamentals": "enable_fundamentals",
    "get_company_profile": "enable_fundamentals",
    "get_basic_financials": "enable_fundamentals",
    "get_financials": "enable_fundamentals",
    "get_balance_sheet": "enable_fundamentals",
    "get_cashflow": "enable_fundamentals",
    "get_income_statement": "enable_fundamentals",
    "get_news": "enable_news",
    "get_global_news": "enable_news",
    "get_news_sentiment": "enable_sentiment",
    "get_social_sentiment": "enable_sentiment",
    "get_earnings_calendar": "enable_events",
    "get_stock_earnings": "enable_events",
    "get_recommendation_trends": "enable_events",
    "get_insider_transactions": "enable_insider",
    "get_insider_sentiment": "enable_insider",
    "get_forex_candles": "enable_forex",
    "get_crypto_candles": "enable_crypto",
    "search_symbol": "enable_symbol_resolver",
    "get_stock_symbols": "enable_symbol_resolver",
}


def get_finnhub_config() -> dict[str, Any]:
    return dict(get_config().get("finnhub", {}) or {})


def is_finnhub_enabled() -> bool:
    config = get_finnhub_config()
    return bool(config.get("enabled")) and bool(str(config.get("api_key") or "").strip())


def is_finnhub_feature_enabled(feature_key: str | None = None) -> bool:
    config = get_finnhub_config()
    if not bool(config.get("enabled")):
        return False
    if not str(config.get("api_key") or "").strip():
        return False
    return not feature_key or bool(config.get(feature_key, True))


def feature_for_method(method_name: str) -> str | None:
    return FEATURE_BY_METHOD.get(method_name)


def require_finnhub_enabled(feature_key: str | None = None) -> None:
    config = get_finnhub_config()

    if not config.get("enabled"):
        raise FinnhubConfigError("Finnhub disabled: FINNHUB_ENABLED is false.")

    if not str(config.get("api_key") or "").strip():
        raise FinnhubConfigError("Finnhub disabled: FINNHUB_API_KEY is not configured.")

    if feature_key and not config.get(feature_key, True):
        raise FinnhubConfigError(f"Finnhub feature disabled: {feature_key} is false.")


def to_unix_timestamp(date_str: str) -> int:
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def unix_to_iso_date(ts: int | float | str | None) -> str | None:
    if ts in (None, ""):
        return None
    try:
        return datetime.fromtimestamp(int(float(ts)), tz=timezone.utc).strftime("%Y-%m-%d")
    except (TypeError, ValueError, OSError):
        return None


def unix_to_iso_datetime(ts: int | float | str | None) -> str | None:
    if ts in (None, ""):
        return None
    try:
        return datetime.fromtimestamp(int(float(ts)), tz=timezone.utc).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError, OSError):
        return None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def cache_key(method: str, *parts: Any, **params: Any) -> str:
    raw = json.dumps({"method": method, "parts": parts, "params": params}, sort_keys=True, default=str)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    safe_parts = ":".join(str(part).replace(":", "_") for part in parts if part not in (None, ""))
    return f"finnhub:{method}:{safe_parts}:{digest}" if safe_parts else f"finnhub:{method}:{digest}"


def _safe_error_message(exc: Exception) -> str:
    text = str(exc) or exc.__class__.__name__
    token = str(get_finnhub_config().get("api_key") or "").strip()
    if token:
        text = text.replace(token, "[REDACTED]")
    return text[:500]


def make_api_request(
    endpoint: str,
    params: dict[str, Any] | None = None,
    *,
    feature_key: str | None = None,
) -> Any:
    config = get_finnhub_config()
    require_finnhub_enabled(feature_key)

    base_url = str(config.get("base_url") or "https://finnhub.io/api/v1").rstrip("/")
    timeout = max(1, int(config.get("timeout_seconds") or 15))
    max_retries = max(0, int(config.get("max_retries") or 0))
    backoff = max(0.0, float(config.get("retry_backoff_seconds") or 1))
    api_key = str(config.get("api_key") or "").strip()

    request_params = dict(params or {})
    request_params["token"] = api_key
    url = f"{base_url}/{endpoint.lstrip('/')}"
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            response = requests.get(url, params=request_params, timeout=timeout)

            if response.status_code in (401, 403):
                raise FinnhubConfigError(
                    "Finnhub auth/plan error: invalid API key or endpoint not allowed by current plan."
                )
            if response.status_code == 429:
                raise FinnhubRateLimitError("Finnhub rate limit exceeded.")

            response.raise_for_status()
            data = response.json()
            if data is None or data == {} or data == []:
                raise FinnhubUnavailableError("Finnhub returned empty response.")
            return data
        except (FinnhubConfigError, FinnhubRateLimitError):
            raise
        except Exception as exc:
            last_error = exc
            if attempt < max_retries:
                time.sleep(backoff * (attempt + 1))
                continue

    raise FinnhubUnavailableError(f"Finnhub request failed: {_safe_error_message(last_error or FinnhubError())}")


def build_quality(
    *,
    available: bool = True,
    confidence: str = "medium",
    is_empty: bool = False,
    is_stale: bool = False,
    missing_fields: list[str] | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    missing = missing_fields or []
    return {
        "available": available,
        "confidence": confidence if available else "unavailable",
        "is_empty": is_empty,
        "is_stale": is_stale,
        "has_required_fields": len(missing) == 0,
        "missing_fields": missing,
        "warnings": warnings or [],
    }


def build_metadata(
    endpoint: str,
    *,
    is_fallback: bool = False,
    is_enrichment: bool = False,
    confidence: str = "medium",
    missing_fields: list[str] | None = None,
    warnings: list[str] | None = None,
    as_of_date: str | None = None,
) -> dict[str, Any]:
    metadata = {
        "source": "finnhub",
        "endpoint": endpoint,
        "retrieved_at": utc_now_iso(),
        "as_of_date": as_of_date,
        "is_fallback": is_fallback,
        "is_enrichment": is_enrichment,
        "quality": build_quality(
            available=confidence != "unavailable",
            confidence=confidence,
            is_empty=confidence == "unavailable",
            missing_fields=missing_fields,
            warnings=warnings,
        ),
    }
    return metadata


def unavailable_response(
    reason: str,
    *,
    endpoint: str | None = None,
    fallback_next: str | None = None,
    symbol: str | None = None,
) -> dict[str, Any]:
    return {
        "symbol": symbol,
        "source": "finnhub",
        "endpoint": endpoint,
        "available": False,
        "reason": reason,
        "fallback_next": fallback_next,
        "retrieved_at": utc_now_iso(),
        "quality": build_quality(available=False, is_empty=True),
    }


def unavailable_text(label: str, reason: str, *, fallback_next: str | None = None) -> str:
    suffix = f" Fallback next: {fallback_next}." if fallback_next else ""
    return f"Finnhub unavailable: {label} - {reason}.{suffix}"


def handle_finnhub_error(label: str, exc: Exception, *, fallback_next: str | None = None) -> str:
    if isinstance(exc, FinnhubRateLimitError):
        return unavailable_text(label, "rate limited", fallback_next=fallback_next)
    if isinstance(exc, FinnhubConfigError):
        return unavailable_text(label, _safe_error_message(exc), fallback_next=fallback_next)
    return unavailable_text(label, _safe_error_message(exc), fallback_next=fallback_next)
