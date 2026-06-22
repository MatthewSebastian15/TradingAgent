from __future__ import annotations

import re
from typing import Any

from services.market_symbol_universe import MARKET_SEARCH_UNIVERSE, POPULAR_SEARCH_SYMBOLS

MAX_PREFIX_LENGTH = 18
_QUOTE_SYMBOL_RE = re.compile(r"^[A-Z0-9^]{1,15}(?:[.=:-][A-Z0-9]{1,12}){0,3}$")
_POPULAR_ORDER = [
    "AAPL",
    "MSFT",
    "NVDA",
    "TSLA",
    "BBCA.JK",
    "BBRI.JK",
    "SPY",
    "QQQ",
    "BTC-USD",
    "ETH-USD",
]


def normalize_search_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().upper())


def compact_search_text(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", normalize_search_text(value))


def _normalize_item(item: dict[str, Any], source: str = "local_universe") -> dict[str, Any]:
    symbol = normalize_search_text(item.get("symbol"))
    asset_type = normalize_search_text(
        item.get("type") or item.get("quoteType") or item.get("typeDisp")
    )
    return {
        **item,
        "symbol": symbol,
        "name": str(
            item.get("name") or item.get("shortName") or item.get("longName") or symbol
        ).strip(),
        "exchange": normalize_search_text(item.get("exchange") or item.get("exchDisp")),
        "type": asset_type,
        "market": normalize_search_text(item.get("market") or _infer_market(symbol, asset_type)),
        "source": item.get("source") or source,
    }


def _infer_market(symbol: str, asset_type: str) -> str:
    if symbol.endswith(".JK"):
        return "ID"
    if asset_type == "CRYPTO" or symbol.endswith("-USD"):
        return "CRYPTO"
    if asset_type == "FX" or symbol.endswith("=X"):
        return "FX"
    return "US"


def _tokens_for_item(item: dict[str, Any]) -> list[str]:
    symbol = normalize_search_text(item.get("symbol"))
    compact_symbol = compact_search_text(symbol)
    parts = " ".join(
        normalize_search_text(item.get(key))
        for key in ("symbol", "name", "exchange", "type", "market")
    )
    raw_tokens = re.split(r"[^A-Z0-9^._=-]+", f"{symbol} {compact_symbol} {parts}")
    tokens: list[str] = []
    seen: set[str] = set()
    for token in raw_tokens:
        compact_token = compact_search_text(token)
        if compact_token and compact_token not in seen:
            seen.add(compact_token)
            tokens.append(compact_token)
    return tokens


def build_search_index(items: list[dict[str, Any]]) -> dict[str, set[int]]:
    prefix_index: dict[str, set[int]] = {}
    for index, item in enumerate(items):
        for token in _tokens_for_item(item):
            for length in range(1, min(MAX_PREFIX_LENGTH, len(token)) + 1):
                prefix_index.setdefault(token[:length], set()).add(index)
    return prefix_index


_INDEXED_ITEMS = [_normalize_item(item) for item in MARKET_SEARCH_UNIVERSE]
_PREFIX_INDEX = build_search_index(_INDEXED_ITEMS)


def _entry_context(item: dict[str, Any]) -> dict[str, Any]:
    symbol = normalize_search_text(item.get("symbol"))
    haystack = " ".join(
        normalize_search_text(item.get(key))
        for key in ("symbol", "name", "exchange", "type", "market")
    )
    return {
        "symbol": symbol,
        "compact_symbol": compact_search_text(symbol),
        "haystack": haystack,
        "compact_haystack": compact_search_text(haystack),
        "tokens": _tokens_for_item(item),
    }


def _score_item(item: dict[str, Any], query: str, compact_query: str) -> tuple[int, str] | None:
    context = _entry_context(item)
    symbol = context["symbol"]
    compact_symbol = context["compact_symbol"]
    haystack = context["haystack"]
    compact_haystack = context["compact_haystack"]
    tokens = context["tokens"]

    if symbol == query:
        return 0, "exact_symbol"
    if compact_symbol == compact_query:
        return 1, "compact_exact_symbol"
    if symbol.startswith(query):
        return 2, "symbol_prefix"
    if compact_symbol.startswith(compact_query):
        return 3, "compact_symbol_prefix"
    if any(token.startswith(compact_query) for token in tokens if token):
        return 4, "token_prefix"
    if haystack.startswith(query):
        return 5, "haystack_prefix"
    if query in haystack:
        return 8, "haystack_contains"
    if compact_query == "BB" and item.get("market") == "ID" and "BANK" in tokens:
        return 4, "idx_bank_hint"
    if compact_query in compact_haystack:
        return 9, "compact_haystack_contains"
    return None


def _passes_filters(item: dict[str, Any], market: str | None, asset_type: str | None) -> bool:
    normalized_market = normalize_search_text(market or "ALL")
    normalized_type = normalize_search_text(asset_type or "ALL")
    return (
        normalized_market == "ALL" or normalize_search_text(item.get("market")) == normalized_market
    ) and (normalized_type == "ALL" or normalize_search_text(item.get("type")) == normalized_type)


def _candidate_indexes(compact_query: str) -> set[int]:
    if compact_query == "BB":
        return set(range(len(_INDEXED_ITEMS)))
    indexes: set[int] = set()
    prefix = compact_query[:MAX_PREFIX_LENGTH]
    indexes.update(_PREFIX_INDEX.get(prefix, set()))
    return indexes


def _sorting_bonus(item: dict[str, Any], compact_query: str) -> float:
    symbol = normalize_search_text(item.get("symbol"))
    market = normalize_search_text(item.get("market"))
    bonus = 0.0
    if symbol in POPULAR_SEARCH_SYMBOLS:
        bonus -= 1.0
    if market == "ID" and compact_query and len(compact_query) <= 4:
        bonus -= 0.5
    if compact_query in {"BB", "BANK"} and symbol.endswith(".JK"):
        bonus -= 0.5
    return bonus


def search_local_tickers(
    query: str,
    limit: int,
    *,
    market: str | None = None,
    asset_type: str | None = None,
) -> list[dict[str, Any]]:
    normalized_query = normalize_search_text(query)
    compact_query = compact_search_text(normalized_query)
    safe_limit = max(1, int(limit or 10))
    if not compact_query:
        return []

    candidate_indexes = _candidate_indexes(compact_query)
    indexed_candidates = (
        [(index, _INDEXED_ITEMS[index]) for index in candidate_indexes]
        if candidate_indexes
        else list(enumerate(_INDEXED_ITEMS))
    )
    scored: list[tuple[float, int, dict[str, Any], str]] = []
    for original_index, item in indexed_candidates:
        if not _passes_filters(item, market, asset_type):
            continue
        score = _score_item(item, normalized_query, compact_query)
        if score is None:
            continue
        base_score, matched_by = score
        scored.append(
            (base_score + _sorting_bonus(item, compact_query), original_index, item, matched_by)
        )

    results = [
        {**item, "source": "local_universe", "rank": int(score), "matched_by": matched_by}
        for score, _index, item, matched_by in sorted(
            scored, key=lambda value: (value[0], value[1])
        )[:safe_limit]
    ]
    if results or len(compact_query) < 2 or not _QUOTE_SYMBOL_RE.fullmatch(normalized_query):
        return results

    return [
        {
            "symbol": normalized_query,
            "name": normalized_query,
            "exchange": "",
            "type": "SYMBOL",
            "market": "ID" if normalized_query.endswith(".JK") else "US",
            "source": "manual_symbol",
            "rank": 99,
            "matched_by": "manual_symbol",
        }
    ]


def get_popular_tickers(limit: int = 20) -> list[dict[str, Any]]:
    by_symbol = {normalize_search_text(item.get("symbol")): item for item in _INDEXED_ITEMS}
    popular = []
    for symbol in _POPULAR_ORDER:
        item = by_symbol.get(symbol)
        if item:
            popular.append({**item, "source": "popular"})
    if len(popular) < limit:
        for item in _INDEXED_ITEMS:
            if normalize_search_text(item.get("symbol")) in {
                current["symbol"] for current in popular
            }:
                continue
            if normalize_search_text(item.get("symbol")) in POPULAR_SEARCH_SYMBOLS:
                popular.append({**item, "source": "popular"})
            if len(popular) >= limit:
                break
    return popular[:limit]
