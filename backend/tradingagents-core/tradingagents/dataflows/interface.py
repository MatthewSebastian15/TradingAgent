from typing import Any

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
from .alpha_vantage_common import AlphaVantageRateLimitError
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
from .data_quality import looks_missing
from .y_finance import (
    get_balance_sheet as get_yfinance_balance_sheet,
)
from .y_finance import (
    get_cashflow as get_yfinance_cashflow,
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
from .yfinance_news import get_global_news_yfinance, get_news_yfinance

try:
    from persistent_cache import SQLiteTTLCache
except Exception:  # pragma: no cover - backend wrapper may not be available in CLI mode
    SQLiteTTLCache = None  # type: ignore[assignment]

# Tools organized by category
TOOLS_CATEGORIES = {
    "core_stock_apis": {"description": "OHLCV stock price data", "tools": ["get_stock_data"]},
    "quote_data": {"description": "Current quote data", "tools": ["get_quote"]},
    "technical_indicators": {"description": "Technical analysis indicators", "tools": ["get_indicators"]},
    "fundamental_data": {
        "description": "Company fundamentals",
        "tools": ["get_fundamentals"],
    },
    "financial_statements": {
        "description": "Company financial statements",
        "tools": ["get_balance_sheet", "get_cashflow", "get_income_statement"],
    },
    "news_data": {
        "description": "Company news and insider data",
        "tools": [
            "get_news",
            "get_insider_transactions",
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
        "finnhub": get_finnhub_quote,
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
        "alpha_vantage": get_alpha_vantage_insider_transactions,
        "yfinance": get_yfinance_insider_transactions,
    },
}


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


def _is_vendor_enabled(method: str, vendor: str, config: dict) -> tuple[bool, str | None]:
    if vendor != "finnhub":
        return True, None
    fallback_methods = {"get_stock_data", "get_quote", "get_indicators"}
    if method in fallback_methods and not bool(config.get("data_vendor_enable_finnhub_fallback", True)):
        return False, "Finnhub fallback disabled by DATA_VENDOR_ENABLE_FINNHUB_FALLBACK"
    if method not in fallback_methods and not bool(config.get("data_vendor_enable_finnhub_enrichment", True)):
        return False, "Finnhub enrichment disabled by DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT"
    feature_key = feature_for_method(method)
    if not is_finnhub_feature_enabled(feature_key):
        return False, f"Finnhub disabled or feature flag off ({feature_key or 'global'})"
    return True, None


def _call_vendor(method: str, vendor: str, args: tuple, kwargs: dict, config: dict) -> Any:
    """Call one concrete vendor with the shared timeout/retry/cache layer."""
    cache = _active_cache(config)
    cache_key = _cache_key(method, vendor, args, kwargs)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

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
            lambda: impl_func(*args, **kwargs),
            timeout_seconds=int(config.get("tool_timeout_seconds", 45)),
            service_name=service_name,
        ),
        service_name=service_name,
        max_attempts=max_attempts,
        base_delay=1.0,
        max_delay=10.0,
        circuit_failure_threshold=int(config.get("circuit_breaker_failure_threshold", 5)),
        circuit_recovery_seconds=int(config.get("circuit_breaker_recovery_seconds", 60)),
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


def route_to_vendor(method: str, *args, **kwargs):
    """Route method calls to vendors with fallback, timeout, retry, circuit breaker, and TTL cache."""
    config = get_config()

    if method not in VENDOR_METHODS:
        raise ValueError(f"Method '{method}' not supported")

    errors = []
    first_unusable_result = None
    for vendor in _vendor_sequence(method):
        enabled, disabled_reason = _is_vendor_enabled(method, vendor, config)
        if not enabled:
            errors.append(f"{vendor}: {disabled_reason}")
            continue
        try:
            result = _call_vendor(method, vendor, args, kwargs, config)
            if _is_unusable_result(result):
                if first_unusable_result is None:
                    first_unusable_result = result
                errors.append(f"{vendor}: empty or unusable response")
                continue
            return result
        except (AlphaVantageRateLimitError, FinnhubRateLimitError) as exc:
            errors.append(f"{vendor}: rate limited: {exc}")
            continue
        except Exception as exc:
            errors.append(f"{vendor}: {exc}")
            continue

    if first_unusable_result is not None:
        return first_unusable_result
    if method in {"get_news_sentiment", "get_social_sentiment", "get_earnings_calendar", "get_recommendation_trends"}:
        return f"Optional data unavailable: {method} - {' | '.join(errors) or 'no configured vendor'}"

    raise RuntimeError(f"No available vendor for '{method}'. Errors: {' | '.join(errors)}")


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
            continue
        try:
            result = _call_vendor(method, vendor, args, kwargs, config)
            if _is_unusable_result(result):
                if first_unusable is None:
                    first_unusable = (vendor, result)
                errors.append(f"{vendor}: empty or unusable response")
                continue
            results[vendor] = result
        except (AlphaVantageRateLimitError, FinnhubRateLimitError) as exc:
            errors.append(f"{vendor}: rate limited: {exc}")
        except Exception as exc:
            errors.append(f"{vendor}: {exc}")

    if results:
        return results
    if first_unusable is not None:
        vendor, result = first_unusable
        return {vendor: result}
    if method in {"get_news_sentiment", "get_social_sentiment", "get_earnings_calendar", "get_recommendation_trends"}:
        return {"optional": f"Optional data unavailable: {method} - {' | '.join(errors) or 'no configured vendor'}"}
    raise RuntimeError(f"No available vendor for '{method}'. Errors: {' | '.join(errors)}")
