"""Dataflow package compatibility imports."""

from __future__ import annotations

import importlib
import sys
import types
from typing import Any

_LEGACY_MODULES = {
    "alpha_vantage": "providers.alpha_vantage",
    "alpha_vantage_common": "providers.alpha_vantage_common",
    "alpha_vantage_fundamentals": "providers.alpha_vantage_fundamentals",
    "alpha_vantage_indicator": "providers.alpha_vantage_indicator",
    "alpha_vantage_news": "providers.alpha_vantage_news",
    "alpha_vantage_stock": "providers.alpha_vantage_stock",
    "config": "providers.config",
    "errors": "providers.errors",
    "finnhub_common": "providers.finnhub_common",
    "finnhub_events": "providers.finnhub_events",
    "finnhub_fundamentals": "providers.finnhub_fundamentals",
    "finnhub_insider": "providers.finnhub_insider",
    "finnhub_news": "providers.finnhub_news",
    "finnhub_sentiment": "providers.finnhub_sentiment",
    "finnhub_stock": "providers.finnhub_stock",
    "finnhub_symbol_resolver": "providers.finnhub_symbol_resolver",
    "google_news_light": "providers.google_news_light",
    "interface": "providers.interface",
    "marketaux_news": "providers.marketaux_news",
    "newsdata_news": "providers.newsdata_news",
    "rss_news": "providers.rss_news",
    "rss_news_config": "providers.rss_news_config",
    "source_priority": "providers.source_priority",
    "vendor_budget": "providers.vendor_budget",
    "vendor_capabilities": "providers.vendor_capabilities",
    "vendor_router": "providers.vendor_router",
    "vendor_symbol": "providers.vendor_symbol",
    "y_finance": "providers.y_finance",
    "yfinance_news": "providers.yfinance_news",
    "general_news_cache": "news.general_news_cache",
    "general_news_categories": "news.general_news_categories",
    "general_news_service": "news.general_news_service",
    "general_news_stream": "news.general_news_stream",
    "news_aggregator": "news.news_aggregator",
    "news_context_builder": "news.news_context_builder",
    "news_decision_filter": "news.news_decision_filter",
    "news_dedup": "news.news_dedup_dict",
    "news_deduplication": "news.news_dedup_normalized",
    "news_entity_resolver": "news.news_entity_resolver",
    "news_impact": "news.news_impact",
    "news_intelligence": "news.news_intelligence",
    "news_models": "news.news_models",
    "news_noise_filter": "news.news_noise_filter",
    "news_provider_base": "news.news_provider_base",
    "news_relevance": "news.news_relevance",
    "news_scoring": "news.news_scoring",
    "news_service": "news.news_service",
    "news_ticker_aliases": "news.news_ticker_aliases",
    "corporate_actions": "market.corporate_actions",
    "local_indicators": "market.local_indicators",
    "position_sizing": "market.position_sizing",
    "stockstats_utils": "market.stockstats_utils",
    "technical_calculator": "market.technical_calculator",
    "utils": "market.utils",
    "dividend_data": "fundamentals.dividend_data",
    "financial_rows": "fundamentals.financial_rows",
    "fundamental_calculator": "fundamentals.fundamental_calculator",
    "fundamental_gap_mapper": "fundamentals.fundamental_gap_mapper",
    "idx_financials_parser": "fundamentals.idx_financials_parser",
    "idx_official": "fundamentals.idx_official",
    "normalizers": "fundamentals.normalizers",
    "period_metadata": "fundamentals.period_metadata",
    "sec_companyfacts": "fundamentals.sec_companyfacts",
    "data_completeness": "quality.data_completeness",
    "data_quality": "quality.data_quality",
    "freshness_policy": "quality.freshness_policy",
    "lineage_builder": "quality.lineage_builder",
    "validators": "quality.validators",
}


def _load_legacy_module(name: str) -> types.ModuleType:
    alias = f"{__name__}.{name}"
    target = f"{__name__}.{_LEGACY_MODULES[name]}"
    try:
        module = importlib.import_module(target)
    except ModuleNotFoundError as exc:
        if exc.name != target:
            raise
        sys.modules.pop(alias, None)
        module = importlib.import_module(alias)
    sys.modules[alias] = module
    globals()[name] = module
    return module


class _LegacyModule(types.ModuleType):
    def __init__(self, name: str) -> None:
        super().__init__(f"{__name__}.{name}")
        self.__dict__["_legacy_name"] = name

    def __getattr__(self, attr: str) -> Any:
        return getattr(_load_legacy_module(self.__dict__["_legacy_name"]), attr)


def __getattr__(name: str) -> Any:
    if name in _LEGACY_MODULES:
        return _load_legacy_module(name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


for _legacy_name in _LEGACY_MODULES:
    _alias = f"{__name__}.{_legacy_name}"
    if _alias not in sys.modules:
        sys.modules[_alias] = _LegacyModule(_legacy_name)
