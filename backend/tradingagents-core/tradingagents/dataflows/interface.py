from typing import Annotated

# Import from vendor-specific modules
from .y_finance import (
    get_YFin_data_online,
    get_stock_stats_indicators_window,
    get_fundamentals as get_yfinance_fundamentals,
    get_balance_sheet as get_yfinance_balance_sheet,
    get_cashflow as get_yfinance_cashflow,
    get_income_statement as get_yfinance_income_statement,
    get_insider_transactions as get_yfinance_insider_transactions,
)
from .yfinance_news import get_news_yfinance, get_global_news_yfinance
from .alpha_vantage import (
    get_stock as get_alpha_vantage_stock,
    get_indicator as get_alpha_vantage_indicator,
    get_fundamentals as get_alpha_vantage_fundamentals,
    get_balance_sheet as get_alpha_vantage_balance_sheet,
    get_cashflow as get_alpha_vantage_cashflow,
    get_income_statement as get_alpha_vantage_income_statement,
    get_insider_transactions as get_alpha_vantage_insider_transactions,
    get_news as get_alpha_vantage_news,
    get_global_news as get_alpha_vantage_global_news,
)
from .alpha_vantage_common import AlphaVantageRateLimitError

# Configuration and routing logic
from .config import get_config
from tradingagents.utils_resilience import TTLCache, call_with_retry, call_with_timeout

# Tools organized by category
TOOLS_CATEGORIES = {
    "core_stock_apis": {
        "description": "OHLCV stock price data",
        "tools": [
            "get_stock_data"
        ]
    },
    "technical_indicators": {
        "description": "Technical analysis indicators",
        "tools": [
            "get_indicators"
        ]
    },
    "fundamental_data": {
        "description": "Company fundamentals",
        "tools": [
            "get_fundamentals",
            "get_balance_sheet",
            "get_cashflow",
            "get_income_statement"
        ]
    },
    "news_data": {
        "description": "News and insider data",
        "tools": [
            "get_news",
            "get_global_news",
            "get_insider_transactions",
        ]
    }
}

_TOOL_CACHE = TTLCache(maxsize=512, ttl_seconds=900)

VENDOR_LIST = [
    "yfinance",
    "alpha_vantage",
]

# Mapping of methods to their vendor-specific implementations
VENDOR_METHODS = {
    # core_stock_apis
    "get_stock_data": {
        "alpha_vantage": get_alpha_vantage_stock,
        "yfinance": get_YFin_data_online,
    },
    # technical_indicators
    "get_indicators": {
        "alpha_vantage": get_alpha_vantage_indicator,
        "yfinance": get_stock_stats_indicators_window,
    },
    # fundamental_data
    "get_fundamentals": {
        "alpha_vantage": get_alpha_vantage_fundamentals,
        "yfinance": get_yfinance_fundamentals,
    },
    "get_balance_sheet": {
        "alpha_vantage": get_alpha_vantage_balance_sheet,
        "yfinance": get_yfinance_balance_sheet,
    },
    "get_cashflow": {
        "alpha_vantage": get_alpha_vantage_cashflow,
        "yfinance": get_yfinance_cashflow,
    },
    "get_income_statement": {
        "alpha_vantage": get_alpha_vantage_income_statement,
        "yfinance": get_yfinance_income_statement,
    },
    # news_data
    "get_news": {
        "alpha_vantage": get_alpha_vantage_news,
        "yfinance": get_news_yfinance,
    },
    "get_global_news": {
        "yfinance": get_global_news_yfinance,
        "alpha_vantage": get_alpha_vantage_global_news,
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


def route_to_vendor(method: str, *args, **kwargs):
    """Route method calls to vendors with fallback, timeout, retry, circuit breaker, and TTL cache."""
    category = get_category_for_method(method)
    vendor_config = get_vendor(category, method)
    primary_vendors = [v.strip() for v in vendor_config.split(',')]
    config = get_config()

    if method not in VENDOR_METHODS:
        raise ValueError(f"Method '{method}' not supported")

    all_available_vendors = list(VENDOR_METHODS[method].keys())
    fallback_vendors = primary_vendors.copy()
    for vendor in all_available_vendors:
        if vendor not in fallback_vendors:
            fallback_vendors.append(vendor)

    errors = []
    for vendor in fallback_vendors:
        if vendor not in VENDOR_METHODS[method]:
            continue

        cache_key = _cache_key(method, vendor, args, kwargs)
        cached = _TOOL_CACHE.get(cache_key)
        if cached is not None:
            return cached

        vendor_impl = VENDOR_METHODS[method][vendor]
        impl_func = vendor_impl[0] if isinstance(vendor_impl, list) else vendor_impl
        service_name = f"tool:{vendor}:{method}"

        try:
            result = call_with_retry(
                lambda: call_with_timeout(
                    lambda: impl_func(*args, **kwargs),
                    timeout_seconds=int(config.get("tool_timeout_seconds", 45)),
                    service_name=service_name,
                ),
                service_name=service_name,
                max_attempts=int(config.get("tool_max_retries", 3)),
                base_delay=1.0,
                max_delay=10.0,
                circuit_failure_threshold=int(config.get("circuit_breaker_failure_threshold", 5)),
                circuit_recovery_seconds=int(config.get("circuit_breaker_recovery_seconds", 60)),
            )
            _TOOL_CACHE.maxsize = int(config.get("cache_max_entries", 512))
            _TOOL_CACHE.ttl_seconds = int(config.get("cache_ttl_seconds", 900))
            _TOOL_CACHE.set(cache_key, result)
            return result
        except AlphaVantageRateLimitError as exc:
            errors.append(f"{vendor}: rate limited: {exc}")
            continue
        except Exception as exc:
            errors.append(f"{vendor}: {exc}")
            continue

    raise RuntimeError(f"No available vendor for '{method}'. Errors: {' | '.join(errors)}")
