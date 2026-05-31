from datetime import datetime, timedelta
from io import StringIO
from typing import Any

import pandas as pd

from tradingagents.utils_resilience import TTLCache, call_with_retry, call_with_timeout

from .alpha_vantage import (
    get_balance_sheet as get_alpha_vantage_balance_sheet,
)
from .alpha_vantage import (
    get_cashflow as get_alpha_vantage_cashflow,
)
from .alpha_vantage import (
    get_fundamentals as get_alpha_vantage_fundamentals,
)
from .alpha_vantage import (
    get_global_news as get_alpha_vantage_global_news,
)
from .alpha_vantage import (
    get_income_statement as get_alpha_vantage_income_statement,
)
from .alpha_vantage import (
    get_indicator as get_alpha_vantage_indicator,
)
from .alpha_vantage import (
    get_insider_transactions as get_alpha_vantage_insider_transactions,
)
from .alpha_vantage import (
    get_news as get_alpha_vantage_news,
)
from .alpha_vantage import (
    get_news_sentiment as get_alpha_vantage_news_sentiment,
)
from .alpha_vantage import (
    get_stock as get_alpha_vantage_stock,
)
from .alpha_vantage_common import AlphaVantagePermanentError, AlphaVantageRateLimitError
from .finnhub_common import (
    FinnhubRateLimitError,
    feature_for_method,
    is_finnhub_feature_enabled,
)
from .finnhub_events import (
    get_earnings_calendar as get_finnhub_earnings_calendar,
)
from .finnhub_events import (
    get_recommendation_trends as get_finnhub_recommendation_trends,
)
from .finnhub_fundamentals import (
    get_balance_sheet as get_finnhub_balance_sheet,
)
from .finnhub_fundamentals import (
    get_cashflow as get_finnhub_cashflow,
)
from .finnhub_fundamentals import (
    get_fundamentals as get_finnhub_fundamentals,
)
from .finnhub_fundamentals import (
    get_income_statement as get_finnhub_income_statement,
)
from .finnhub_insider import (
    get_insider_sentiment as get_finnhub_insider_sentiment,
)
from .finnhub_insider import (
    get_insider_transactions as get_finnhub_insider_transactions,
)
from .finnhub_news import (
    get_global_news as get_finnhub_global_news,
)
from .finnhub_news import (
    get_news as get_finnhub_news,
)
from .finnhub_sentiment import (
    get_news_sentiment as get_finnhub_news_sentiment,
)
from .finnhub_sentiment import (
    get_social_sentiment as get_finnhub_social_sentiment,
)
from .finnhub_stock import (
    get_indicator as get_finnhub_indicator,
)
from .finnhub_stock import (
    get_quote as get_finnhub_quote,
)
from .finnhub_stock import (
    get_stock as get_finnhub_stock,
)

# Configuration and routing logic
from .config import get_config
from .data_quality import looks_missing, validate_fundamentals, validate_news, validate_ohlcv, validate_quote, validate_sentiment
from .y_finance import (
    get_balance_sheet as get_yfinance_balance_sheet,
)
from .y_finance import (
    get_cashflow as get_yfinance_cashflow,
)
from .y_finance import (
    get_company_profile as get_yfinance_company_profile,
)
from .y_finance import (
    get_fundamentals as get_yfinance_fundamentals,
)
from .y_finance import (
    get_income_statement as get_yfinance_income_statement,
)
from .y_finance import (
    get_insider_transactions as get_yfinance_insider_transactions,
)

# Import from vendor-specific modules
from .y_finance import (
    get_stock_stats_indicators_window,
    get_YFin_data_online,
)
from .vendor_budget import get_budget
from .vendor_router import get_attempt_recorder, sanitize_error
from .yfinance_news import get_global_news_yfinance, get_news_yfinance

try:
    from persistent_cache import SQLiteTTLCache
except Exception:  # pragma: no cover - backend wrapper may not be available in CLI mode
    SQLiteTTLCache = None  # type: ignore[assignment]


def _parse_last_quote_from_csv(raw: str, symbol: str, source: str) -> dict[str, Any]:
    """Build a quote object from CSV OHLCV fallback data."""
    lines = [line for line in str(raw or "").splitlines() if line.strip() and not line.lstrip().startswith("#")]
    if not lines:
        return {"symbol": symbol, "source": source, "available": False, "reason": "empty quote source"}
    try:
        df = pd.read_csv(StringIO("\n".join(lines)))
    except Exception as exc:
        return {"symbol": symbol, "source": source, "available": False, "reason": f"quote CSV parse failed: {exc}"}
    if df.empty:
        return {"symbol": symbol, "source": source, "available": False, "reason": "empty quote dataframe"}
    if "Date" not in df.columns and df.columns[0] not in {"Open", "High", "Low", "Close"}:
        df = df.rename(columns={df.columns[0]: "Date"})
    if "Close" not in df.columns:
        return {"symbol": symbol, "source": source, "available": False, "reason": "quote close column missing"}
    df = df.dropna(subset=["Close"])
    if df.empty:
        return {"symbol": symbol, "source": source, "available": False, "reason": "quote close value missing"}
    last = df.iloc[-1]
    previous = df.iloc[-2] if len(df) >= 2 else None

    def as_float(value: Any) -> float | None:
        try:
            number = float(str(value).replace(",", ""))
        except (TypeError, ValueError):
            return None
        return number if number == number else None

    current = as_float(last.get("Close"))
    previous_close = as_float(previous.get("Close")) if previous is not None else None
    return {
        "symbol": symbol,
        "asset_type": "stock",
        "source": source,
        "current_price": current,
        "previous_close": previous_close,
        "open": as_float(last.get("Open")),
        "high": as_float(last.get("High")),
        "low": as_float(last.get("Low")),
        "timestamp": str(last.get("Date")) if "Date" in last else None,
        "metadata": {"source": source, "quality": validate_quote({"current_price": current, "previous_close": previous_close, "source": source, "timestamp": str(last.get("Date")) if "Date" in last else None})},
    }


def get_yfinance_quote(symbol: str, curr_date: str | None = None) -> dict[str, Any]:
    end_dt = datetime.strptime(curr_date, "%Y-%m-%d") if curr_date else datetime.now()
    start_dt = end_dt - timedelta(days=10)
    raw = get_YFin_data_online(symbol, start_dt.strftime("%Y-%m-%d"), (end_dt + timedelta(days=1)).strftime("%Y-%m-%d"))
    return _parse_last_quote_from_csv(raw, symbol, "yfinance")


def get_alpha_vantage_quote(symbol: str, curr_date: str | None = None) -> dict[str, Any]:
    end_dt = datetime.strptime(curr_date, "%Y-%m-%d") if curr_date else datetime.now()
    start_dt = end_dt - timedelta(days=10)
    raw = get_alpha_vantage_stock(symbol, start_dt.strftime("%Y-%m-%d"), (end_dt + timedelta(days=1)).strftime("%Y-%m-%d"))
    return _parse_last_quote_from_csv(raw, symbol, "alpha_vantage")

# Tools organized by category
TOOLS_CATEGORIES = {
    "core_stock_apis": {"description": "OHLCV stock price data", "tools": ["get_stock_data"]},
    "quote_data": {"description": "Current quote data", "tools": ["get_quote"]},
    "technical_indicators": {"description": "Technical analysis indicators", "tools": ["get_indicators"]},
    "fundamental_data": {
        "description": "Company fundamentals and profile data",
        "tools": ["get_fundamentals", "get_company_profile"],
    },
    "financial_statements": {
        "description": "Company financial statements",
        "tools": ["get_balance_sheet", "get_cashflow", "get_income_statement"],
    },
    "news_data": {
        "description": "Company news",
        "tools": [
            "get_news",
        ],
    },
    "insider_data": {
        "description": "Insider transactions and insider sentiment",
        "tools": [
            "get_insider_transactions",
            "get_insider_sentiment",
        ],
    },
    "global_news_data": {
        "description": "Global market and macro news",
        "tools": ["get_global_news"],
    },
    "sentiment_data": {
        "description": "Structured news sentiment",
        "tools": ["get_news_sentiment"],
    },
    "social_sentiment": {
        "description": "Direct social sentiment",
        "tools": ["get_social_sentiment"],
    },
    "event_data": {
        "description": "Earnings and event-risk context",
        "tools": ["get_earnings_calendar"],
    },
    "analyst_rating": {
        "description": "External analyst recommendation trends",
        "tools": ["get_recommendation_trends"],
    },
}

_TOOL_CACHE = TTLCache(maxsize=512, ttl_seconds=900)
_PERSISTENT_TOOL_CACHE = None
_PERSISTENT_TOOL_CACHE_CONFIG = None

VENDOR_LIST = [
    "yfinance",
    "finnhub",
    "alpha_vantage",
]

# Mapping of methods to their vendor-specific implementations
VENDOR_METHODS = {
    # core_stock_apis
    "get_stock_data": {
        "yfinance": get_YFin_data_online,
        "finnhub": get_finnhub_stock,
        "alpha_vantage": get_alpha_vantage_stock,
    },
    "get_quote": {
        "yfinance": get_yfinance_quote,
        "finnhub": get_finnhub_quote,
        "alpha_vantage": get_alpha_vantage_quote,
    },
    # technical_indicators
    "get_indicators": {
        "yfinance": get_stock_stats_indicators_window,
        "finnhub": get_finnhub_indicator,
        "alpha_vantage": get_alpha_vantage_indicator,
    },
    # fundamental_data
    "get_fundamentals": {
        "yfinance": get_yfinance_fundamentals,
        "finnhub": get_finnhub_fundamentals,
        "alpha_vantage": get_alpha_vantage_fundamentals,
    },
    "get_company_profile": {
        "yfinance": get_yfinance_company_profile,
    },
    "get_balance_sheet": {
        "yfinance": get_yfinance_balance_sheet,
        "alpha_vantage": get_alpha_vantage_balance_sheet,
        "finnhub": get_finnhub_balance_sheet,
    },
    "get_cashflow": {
        "yfinance": get_yfinance_cashflow,
        "alpha_vantage": get_alpha_vantage_cashflow,
        "finnhub": get_finnhub_cashflow,
    },
    "get_income_statement": {
        "yfinance": get_yfinance_income_statement,
        "alpha_vantage": get_alpha_vantage_income_statement,
        "finnhub": get_finnhub_income_statement,
    },
    # news_data
    "get_news": {
        "yfinance": get_news_yfinance,
        "finnhub": get_finnhub_news,
        "alpha_vantage": get_alpha_vantage_news,
    },
    "get_global_news": {
        "finnhub": get_finnhub_global_news,
        "alpha_vantage": get_alpha_vantage_global_news,
        "yfinance": get_global_news_yfinance,
    },
    "get_news_sentiment": {
        "finnhub": get_finnhub_news_sentiment,
        "alpha_vantage": get_alpha_vantage_news_sentiment,
    },
    "get_social_sentiment": {
        "finnhub": get_finnhub_social_sentiment,
    },
    "get_earnings_calendar": {
        "finnhub": get_finnhub_earnings_calendar,
    },
    "get_recommendation_trends": {
        "finnhub": get_finnhub_recommendation_trends,
    },
    "get_insider_transactions": {
        "finnhub": get_finnhub_insider_transactions,
        "alpha_vantage": get_alpha_vantage_insider_transactions,
        "yfinance": get_yfinance_insider_transactions,
    },
    "get_insider_sentiment": {
        "finnhub": get_finnhub_insider_sentiment,
    },
}


TICKER_FIRST_ARG_METHODS = {
    "get_stock_data",
    "get_quote",
    "get_indicators",
    "get_fundamentals",
    "get_company_profile",
    "get_basic_financials",
    "get_financials",
    "get_balance_sheet",
    "get_cashflow",
    "get_income_statement",
    "get_news",
    "get_news_sentiment",
    "get_social_sentiment",
    "get_earnings_calendar",
    "get_recommendation_trends",
    "get_insider_transactions",
    "get_insider_sentiment",
}


def _normalize_args_for_vendor(method: str, vendor: str, args: tuple) -> tuple:
    if method not in TICKER_FIRST_ARG_METHODS or not args:
        return args

    from tradingagents.dataflows.vendor_symbol import normalize_symbol_for_vendor

    normalized = normalize_symbol_for_vendor(args[0], vendor)
    return (normalized, *args[1:])


def get_category_for_method(method: str) -> str:
    """Get the category that contains the specified method."""
    for category, info in TOOLS_CATEGORIES.items():
        if method in info["tools"]:
            return category
    raise ValueError(f"Method '{method}' not found in any category")


def get_vendor(category: str, method: str = None) -> str:
    """Get the configured vendor for a data category or specific tool method.
    Tool-level configuration takes precedence over category-level.
    """
    config = get_config()

    # Check tool-level configuration first (if method provided)
    if method:
        tool_vendors = config.get("tool_vendors", {})
        if method in tool_vendors:
            return tool_vendors[method]

    # Fall back to category-level configuration
    return config.get("data_vendors", {}).get(category, "default")


def _cache_key(method: str, vendor: str, args: tuple, kwargs: dict) -> tuple:
    return (method, vendor, args, tuple(sorted(kwargs.items())))


def _vendor_sequence(method: str, preferred: str | None = None) -> list[str]:
    """Return configured vendors followed by any supported fallback vendors."""
    vendor_config = preferred if preferred is not None else get_vendor(get_category_for_method(method), method)
    primary_vendors = [v.strip() for v in str(vendor_config or "").split(",") if v.strip()]
    all_available_vendors = list(VENDOR_METHODS[method].keys())

    sequence: list[str] = []
    for vendor in [*primary_vendors, *all_available_vendors]:
        if vendor in VENDOR_METHODS[method] and vendor not in sequence:
            sequence.append(vendor)
    return sequence


def _is_unusable_result(result: Any) -> bool:
    """Return True when a vendor completed but returned an empty/error payload."""
    if isinstance(result, str):
        return looks_missing(result)
    if result is None:
        return True
    if isinstance(result, dict):
        if not result:
            return True
        if result.get("available") is False:
            return True
        quality = result.get("quality")
        if isinstance(quality, dict) and quality.get("available") is False:
            return True
        error_keys = {"Error Message", "Information", "Note"}
        if any(key in result for key in error_keys):
            return True
        feed = result.get("feed")
        if isinstance(feed, list) and not feed:
            return True
    return False



def _quality_for_result(method: str, result: Any) -> dict[str, Any] | None:
    validators = {
        "get_quote": validate_quote,
        "get_stock_data": validate_ohlcv,
        "get_fundamentals": validate_fundamentals,
        "get_news": validate_news,
        "get_global_news": validate_news,
        "get_news_sentiment": validate_sentiment,
        "get_social_sentiment": validate_sentiment,
    }
    validator = validators.get(method)
    if not validator:
        return None
    try:
        return validator(result)
    except Exception as exc:
        return {"available": False, "confidence": "unavailable", "warnings": [sanitize_error(exc)]}


def _record_attempt(config: dict, method: str, vendor: str, status: str, detail: str | None = None) -> None:
    recorder = get_attempt_recorder(config.get("_vendor_attempt_recorder_id"))
    if recorder is not None:
        recorder.record(method, vendor, status, detail)


def _consume_budget(config: dict, method: str, vendor: str) -> tuple[bool, str | None]:
    budget = get_budget(config.get("_vendor_budget_id"))
    if budget is None:
        return True, None
    if not budget.can_call(vendor):
        reason = "request budget exceeded"
        budget.record_blocked(vendor, method, reason)
        return False, reason
    budget.record_call(vendor, method)
    return True, None

def _is_vendor_enabled(method: str, vendor: str, config: dict) -> tuple[bool, str | None]:
    if vendor != "finnhub":
        return True, None
    fallback_methods = {"get_stock_data", "get_quote", "get_indicators"}
    if method in fallback_methods and not bool(config.get("data_vendor_enable_finnhub_fallback", True)):
        return False, "Finnhub fallback disabled by DATA_VENDOR_ENABLE_FINNHUB_FALLBACK"
    if method not in fallback_methods and not bool(config.get("data_vendor_enable_finnhub_enrichment", False)):
        return False, "Finnhub enrichment disabled by DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT"
    feature_key = feature_for_method(method)
    if not is_finnhub_feature_enabled(feature_key):
        return False, f"Finnhub disabled or feature flag off ({feature_key or 'global'})"
    return True, None


def _call_vendor(method: str, vendor: str, args: tuple, kwargs: dict, config: dict) -> Any:
    """Call one concrete vendor with timeout, retry, cache, and budget control."""
    vendor_args = _normalize_args_for_vendor(method, vendor, args)

    cache = _active_cache(config)
    cache_key = _cache_key(method, vendor, vendor_args, kwargs)
    cached = cache.get(cache_key)
    if cached is not None:
        _record_attempt(config, method, vendor, "cache_hit")
        return cached

    allowed, blocked_reason = _consume_budget(config, method, vendor)
    if not allowed:
        raise RuntimeError(blocked_reason or "request budget exceeded")

    vendor_impl = VENDOR_METHODS[method][vendor]
    impl_func = vendor_impl[0] if isinstance(vendor_impl, list) else vendor_impl
    service_name = f"tool:{vendor}:{method}"

    max_attempts = int(config.get("tool_max_retries", 2))
    if vendor == "yfinance":
        # yfinance implementations already retry their own transient
        # YF/network errors. Keep the router as timeout/circuit/cache
        # layer only to avoid multiplicative retries per data field.
        max_attempts = 1

    result = call_with_retry(
        lambda: call_with_timeout(
            lambda: impl_func(*vendor_args, **kwargs),
            timeout_seconds=int(config.get("tool_timeout_seconds", 45)),
            service_name=service_name,
        ),
        service_name=service_name,
        max_attempts=max_attempts,
        base_delay=1.0,
        max_delay=10.0,
        circuit_failure_threshold=int(config.get("circuit_breaker_failure_threshold", 5)),
        circuit_recovery_seconds=int(config.get("circuit_breaker_recovery_seconds", 60)),
        should_retry=lambda exc: not isinstance(exc, AlphaVantagePermanentError),
    )
    cache.set(cache_key, result)
    return result

def _active_cache(config: dict):
    """Return the configured tool cache, preferring persistent SQLite when enabled."""
    global _PERSISTENT_TOOL_CACHE, _PERSISTENT_TOOL_CACHE_CONFIG

    backend = str(config.get("data_cache_backend", "memory")).lower()
    if backend != "sqlite" or SQLiteTTLCache is None:
        _TOOL_CACHE.maxsize = int(config.get("cache_max_entries", 512))
        _TOOL_CACHE.ttl_seconds = int(config.get("cache_ttl_seconds", 900))
        return _TOOL_CACHE

    cache_config = (
        config.get("data_cache_db_path", ".cache/market_data.sqlite3"),
        int(config.get("data_cache_ttl_seconds", config.get("cache_ttl_seconds", 900))),
        int(config.get("data_cache_max_entries", config.get("cache_max_entries", 512))),
    )
    if _PERSISTENT_TOOL_CACHE is None or cache_config != _PERSISTENT_TOOL_CACHE_CONFIG:
        _PERSISTENT_TOOL_CACHE = SQLiteTTLCache(
            db_path=str(cache_config[0]),
            ttl_seconds=int(cache_config[1]),
            max_entries=int(cache_config[2]),
        )
        _PERSISTENT_TOOL_CACHE_CONFIG = cache_config
    return _PERSISTENT_TOOL_CACHE


def get_tool_cache_stats() -> dict:
    """Return cache stats for status/debug endpoints."""
    config = get_config()
    cache = _active_cache(config)
    if hasattr(cache, "stats"):
        return cache.stats()
    return {
        "backend": "memory",
        "entries": len(getattr(cache, "_data", {})),
        "ttl_seconds": int(getattr(cache, "ttl_seconds", 0)),
        "max_entries": int(getattr(cache, "maxsize", 0)),
    }


def route_to_vendor(method: str, *args, vendor_order: list[str] | None = None, **kwargs):
    """Route method calls to vendors with fallback, budget, attempts, timeout, retry and cache."""
    config = get_config()

    if method not in VENDOR_METHODS:
        raise ValueError(f"Method '{method}' not supported")

    errors = []
    first_unusable_result = None
    for vendor in (vendor_order or _vendor_sequence(method)):
        if vendor not in VENDOR_METHODS[method]:
            _record_attempt(config, method, vendor, "unsupported")
            continue
        enabled, disabled_reason = _is_vendor_enabled(method, vendor, config)
        if not enabled:
            errors.append(f"{vendor}: {disabled_reason}")
            _record_attempt(config, method, vendor, "disabled", disabled_reason)
            continue
        try:
            result = _call_vendor(method, vendor, args, kwargs, config)
            quality = _quality_for_result(method, result)
            if quality is not None and quality.get("available") is False:
                if first_unusable_result is None:
                    first_unusable_result = result
                detail = "; ".join(quality.get("warnings") or quality.get("missing_fields") or ["quality unavailable"])
                errors.append(f"{vendor}: invalid quality: {detail}")
                _record_attempt(config, method, vendor, "unavailable", detail)
                continue
            if _is_unusable_result(result):
                if first_unusable_result is None:
                    first_unusable_result = result
                errors.append(f"{vendor}: empty or unusable response")
                _record_attempt(config, method, vendor, "unavailable", "empty or unusable response")
                continue
            status = "partial" if quality and quality.get("confidence") in {"low", "medium"} else "success"
            _record_attempt(config, method, vendor, status)
            return result
        except AlphaVantagePermanentError as exc:
            errors.append(f"{vendor}: {sanitize_error(exc)}")
            _record_attempt(config, method, vendor, "unavailable", sanitize_error(exc))
            continue
        except (AlphaVantageRateLimitError, FinnhubRateLimitError) as exc:
            errors.append(f"{vendor}: rate limited: {sanitize_error(exc)}")
            _record_attempt(config, method, vendor, "rate_limited", sanitize_error(exc))
            continue
        except Exception as exc:
            errors.append(f"{vendor}: {sanitize_error(exc)}")
            status = "budget_exceeded" if "budget" in str(exc).lower() else "failure"
            _record_attempt(config, method, vendor, status, sanitize_error(exc))
            continue

    if first_unusable_result is not None:
        return first_unusable_result
    if method in {"get_news_sentiment", "get_social_sentiment", "get_earnings_calendar", "get_recommendation_trends"}:
        return f"Optional data unavailable: {method} - {' | '.join(errors) or 'no configured vendor'}"
    if method == "get_quote":
        return {"available": False, "source": "unavailable", "reason": " | ".join(errors) or "no configured vendor"}

    raise RuntimeError(f"No available vendor for '{method}'. Errors: {' | '.join(errors)}")


def get_quote(ticker: str, curr_date: str | None = None) -> dict[str, Any]:
    return route_to_vendor(
        "get_quote",
        ticker,
        curr_date,
        vendor_order=["yfinance", "finnhub", "alpha_vantage"],
    )


def route_to_all_vendors(method: str, *args, **kwargs) -> dict[str, Any]:
    """Return usable payloads from every configured/supported vendor.

    This is intentionally used only for fields where multi-source context is
    worth the extra calls, such as news. Single-source fields should keep using
    route_to_vendor to avoid consuming provider quotas unnecessarily.
    """
    config = get_config()
    if method not in VENDOR_METHODS:
        raise ValueError(f"Method '{method}' not supported")

    results: dict[str, Any] = {}
    errors: list[str] = []
    first_unusable: tuple[str, Any] | None = None
    for vendor in _vendor_sequence(method):
        enabled, disabled_reason = _is_vendor_enabled(method, vendor, config)
        if not enabled:
            errors.append(f"{vendor}: {disabled_reason}")
            _record_attempt(config, method, vendor, "disabled", disabled_reason)
            continue
        try:
            result = _call_vendor(method, vendor, args, kwargs, config)
            quality = _quality_for_result(method, result)
            if (quality is not None and quality.get("available") is False) or _is_unusable_result(result):
                if first_unusable is None:
                    first_unusable = (vendor, result)
                detail = "empty or unusable response"
                if quality is not None:
                    detail = "; ".join(quality.get("warnings") or quality.get("missing_fields") or [detail])
                errors.append(f"{vendor}: {detail}")
                _record_attempt(config, method, vendor, "unavailable", detail)
                continue
            _record_attempt(config, method, vendor, "success")
            results[vendor] = result
        except AlphaVantagePermanentError as exc:
            errors.append(f"{vendor}: {sanitize_error(exc)}")
            _record_attempt(config, method, vendor, "unavailable", sanitize_error(exc))
        except (AlphaVantageRateLimitError, FinnhubRateLimitError) as exc:
            errors.append(f"{vendor}: rate limited: {sanitize_error(exc)}")
            _record_attempt(config, method, vendor, "rate_limited", sanitize_error(exc))
        except Exception as exc:
            errors.append(f"{vendor}: {sanitize_error(exc)}")
            status = "budget_exceeded" if "budget" in str(exc).lower() else "failure"
            _record_attempt(config, method, vendor, status, sanitize_error(exc))

    if results:
        return results
    if first_unusable is not None:
        vendor, result = first_unusable
        return {vendor: result}
    if method in {"get_news_sentiment", "get_social_sentiment", "get_earnings_calendar", "get_recommendation_trends"}:
        return {"optional": f"Optional data unavailable: {method} - {' | '.join(errors) or 'no configured vendor'}"}
    raise RuntimeError(f"No available vendor for '{method}'. Errors: {' | '.join(errors)}")
