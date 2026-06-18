from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from tradingagents.dataflows.vendor_capabilities import SPRINT_1_VENDORS, supports_vendor
from tradingagents.dataflows.source_priority import market_from_symbol, normalize_market


@dataclass(frozen=True)
class SymbolResolution:
    raw: str
    normalized_input: str
    canonical: str
    market: str
    exchange: str | None
    base_ticker: str
    vendor_symbols: dict[str, str]
    company_name: str | None = None
    search_verified: bool = False
    quote_type: str | None = None
    aliases: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def is_idx_symbol(symbol: str) -> bool:
    """Return True for Indonesian Exchange symbols in yfinance .JK format."""
    return str(symbol or "").strip().upper().endswith(".JK")


def _metadata_value(search_metadata: dict[str, Any] | None, *keys: str) -> str | None:
    if not isinstance(search_metadata, dict):
        return None
    for key in keys:
        value = search_metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _clean_alias(value: Any) -> str | None:
    text = str(value or "").strip()
    return text if len(text) >= 2 else None


def _base_ticker(canonical: str, market: str, quote_type: str | None = None) -> str:
    base = canonical.split(".", 1)[0]
    if market == "CRYPTO" or str(quote_type or "").upper() == "CRYPTOCURRENCY":
        return base.split("-", 1)[0]
    return base


def _aliases(
    canonical: str,
    base_ticker: str,
    company_name: str | None,
    search_metadata: dict[str, Any] | None,
) -> list[str]:
    values: list[str] = [canonical, base_ticker]
    if company_name:
        values.append(company_name)
        simplified = re.sub(r"\b(PT|TBK|Tbk|Inc|Corp|Corporation|Ltd|PLC|LLC)\b\.?", "", company_name).strip()
        simplified = " ".join(simplified.split())
        if simplified and simplified.lower() != company_name.lower():
            values.append(simplified)
    if isinstance(search_metadata, dict):
        for key in ("short_name", "shortname", "long_name", "longname", "name", "displayName", "exchange_local_name"):
            alias = _clean_alias(search_metadata.get(key))
            if alias:
                values.append(alias)
        raw_aliases = search_metadata.get("aliases")
        if isinstance(raw_aliases, list):
            values.extend(str(item).strip() for item in raw_aliases if str(item).strip())
    return list(dict.fromkeys(values))


def _vendor_symbols(canonical: str, market: str) -> dict[str, str]:
    symbols: dict[str, str] = {"yfinance": canonical}
    for vendor in ("finnhub", "alpha_vantage"):
        if supports_vendor(vendor, market, "quote"):
            symbols[vendor] = canonical
    for vendor in ("google_news_light", "newsdata", "marketaux"):
        if supports_vendor(vendor, market, "news"):
            symbols[vendor] = canonical
    return {vendor: symbol for vendor, symbol in symbols.items() if vendor in SPRINT_1_VENDORS}


def resolve_symbol(
    symbol: str,
    market: str | None = None,
    search_metadata: dict | None = None,
) -> SymbolResolution:
    """
    Resolve input symbol into canonical symbol and vendor-specific symbols.
    Prefer canonical symbol from yfinance search metadata when available.
    Do not perform aggressive ticker mapping.
    """
    raw = str(symbol or "")
    normalized_input = raw.strip().upper()
    metadata_canonical = _metadata_value(search_metadata, "canonical", "symbol", "ticker")
    canonical = (metadata_canonical or normalized_input).upper()
    quote_type = _metadata_value(search_metadata, "quote_type", "quoteType", "type")
    company_name = _metadata_value(search_metadata, "company_name", "longname", "long_name", "shortname", "short_name", "name")
    exchange = _metadata_value(search_metadata, "exchange", "exchDisp", "fullExchangeName")
    market_key = normalize_market(market) if market else market_from_symbol(canonical)
    base_ticker = _base_ticker(canonical, market_key, quote_type)
    aliases = _aliases(canonical, base_ticker, company_name, search_metadata)
    search_verified = bool(metadata_canonical and metadata_canonical.strip().upper() == canonical)
    warnings: list[str] = []
    if market_key == "UNKNOWN":
        warnings.append("market_unknown")
    if not search_verified:
        warnings.append("symbol_not_search_verified")

    return SymbolResolution(
        raw=raw,
        normalized_input=normalized_input,
        canonical=canonical,
        market=market_key,
        exchange=exchange,
        base_ticker=base_ticker,
        vendor_symbols=_vendor_symbols(canonical, market_key),
        company_name=company_name,
        search_verified=search_verified,
        quote_type=quote_type.upper() if quote_type else None,
        aliases=aliases,
        warnings=warnings,
    )


def normalize_symbol_for_vendor(symbol: str, vendor: str) -> str:
    """Normalize ticker symbols for a specific data vendor without auto-mapping."""
    value = str(symbol or "").strip().upper()
    return value if str(vendor or "").strip().lower() in SPRINT_1_VENDORS else value
