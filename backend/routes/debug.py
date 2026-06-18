from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from tradingagents.dataflows.source_priority import get_source_priority
from tradingagents.dataflows.vendor_budget import DEFAULT_VENDOR_BUDGET
from tradingagents.dataflows.vendor_capabilities import VENDOR_CAPABILITIES, vendor_requires_api_key
from tradingagents.dataflows.vendor_symbol import resolve_symbol
from tradingagents.observability.health_aggregator import (
    get_observability_summary,
    get_vendor_stats,
)

import config as app_config
from routes.validation import normalize_ticker_symbol

router = APIRouter(tags=["debug"])


def _guard_debug_enabled() -> None:
    if not bool(getattr(app_config, "DEBUG_ENDPOINTS_ENABLED", False)):
        raise HTTPException(status_code=404, detail="Not found")


def _api_key_present(vendor_name: str) -> bool:
    vendor = vendor_name.strip().lower()
    if vendor == "finnhub":
        return bool(app_config.FINNHUB_API_KEY)
    if vendor == "marketaux":
        return bool(app_config.MARKETAUX_API_KEY)
    if vendor == "newsdata":
        return bool(app_config.NEWSDATA_API_KEY)
    if vendor == "alpha_vantage":
        return bool(app_config.ALPHA_VANTAGE_API_KEY)
    return False


def _vendor_health(vendor_name: str) -> dict[str, Any]:
    vendor = vendor_name.strip().lower()
    requires_key = vendor_requires_api_key(vendor)
    key_present = _api_key_present(vendor)
    status = "ok" if (vendor == "yfinance" or not requires_key or key_present) else "degraded"
    payload: dict[str, Any] = {
        "status": status,
        "latency_ms": 0,
        "api_key_present": key_present,
    }
    budget = DEFAULT_VENDOR_BUDGET["per_vendor"].get(vendor)
    if budget is not None:
        payload["budget_limit"] = budget
    return payload


def _llm_debug_payload() -> dict[str, Any]:
    return {
        "provider": app_config.llm.provider,
        "api_key_present": bool(app_config.llm.llm_api_key),
        "models": {
            "quick_think": {
                "model": app_config.llm.quick_think_llm,
                "status": "ok" if app_config.llm.quick_think_llm else "degraded",
            },
            "deep_think": {
                "model": app_config.llm.deep_think_llm,
                "status": "ok" if app_config.llm.deep_think_llm else "degraded",
            },
        },
        "budget_by_depth": {
            depth: cfg["max_total_llm_calls"]
            for depth, cfg in app_config.LLM_BUDGET_BY_ANALYSIS_DEPTH.items()
        },
    }


@router.get("/debug/health")
async def debug_health() -> dict[str, Any]:
    _guard_debug_enabled()
    vendors = {
        vendor: _vendor_health(vendor)
        for vendor in (
            "yfinance",
            "finnhub",
            "marketaux",
            "newsdata",
            "alpha_vantage",
            "google_news_light",
        )
    }
    llm_payload = _llm_debug_payload()
    status = "ok"
    if not llm_payload["api_key_present"] or any(
        item["status"] != "ok" for item in vendors.values()
    ):
        status = "degraded"
    return {
        "status": status,
        "timestamp": datetime.now().astimezone().isoformat(),
        "vendors": vendors,
        "llm": llm_payload,
        "feature_flags": {
            "DEBUG_ENDPOINTS_ENABLED": bool(getattr(app_config, "DEBUG_ENDPOINTS_ENABLED", False)),
        },
    }


@router.get("/debug/vendor/{vendor_name}")
async def debug_vendor(vendor_name: str) -> dict[str, Any]:
    _guard_debug_enabled()
    vendor = vendor_name.strip().lower()
    if vendor not in VENDOR_CAPABILITIES:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return {
        "vendor": vendor,
        **_vendor_health(vendor),
        "requires_api_key": vendor_requires_api_key(vendor),
        "capabilities": VENDOR_CAPABILITIES[vendor],
    }


@router.get("/debug/symbol/{ticker}")
async def debug_symbol(ticker: str) -> dict[str, Any]:
    _guard_debug_enabled()
    canonical = normalize_ticker_symbol(ticker)
    resolution = resolve_symbol(
        canonical, search_metadata={"canonical": canonical, "symbol": canonical}
    )
    return {
        "ticker": canonical,
        "resolution": {
            "canonical": resolution.canonical,
            "market": resolution.market,
            "search_verified": resolution.search_verified,
            "company_name": resolution.company_name or resolution.canonical,
            "vendor_symbols": resolution.vendor_symbols,
        },
        "source_priority": {
            "financials": get_source_priority(resolution.market, "financials"),
            "news": get_source_priority(resolution.market, "news"),
        },
    }


@router.get("/debug/metrics")
async def debug_metrics() -> dict[str, Any]:
    _guard_debug_enabled()
    return get_observability_summary()


@router.get("/debug/vendor-stats")
async def debug_vendor_stats() -> dict[str, Any]:
    _guard_debug_enabled()
    return get_vendor_stats()
