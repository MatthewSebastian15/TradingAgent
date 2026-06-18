from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class ResolvedStockSymbol:
    original: str
    yfinance: str
    finnhub_candidates: tuple[str, ...]
    market: str
    asset_type: str = "stock"


def _clean(symbol: str) -> str:
    return str(symbol or "").strip().upper()


@lru_cache(maxsize=2048)
def resolve_stock_symbol(symbol: str) -> ResolvedStockSymbol:
    cleaned = _clean(symbol)
    if not cleaned:
        return ResolvedStockSymbol(original=symbol, yfinance="", finnhub_candidates=(), market="unknown")

    if any(token in cleaned for token in ("/", ":")):
        # Forex/crypto intentionally stay out of scope for this phase.
        return ResolvedStockSymbol(
            original=symbol, yfinance=cleaned, finnhub_candidates=(cleaned,), market="unsupported_non_stock"
        )

    if cleaned.endswith(".JK"):
        base = cleaned[:-3]
        return ResolvedStockSymbol(original=symbol, yfinance=cleaned, finnhub_candidates=(cleaned, base), market="ID")

    if "." not in cleaned and len(cleaned) == 4:
        return ResolvedStockSymbol(
            original=symbol, yfinance=f"{cleaned}.JK", finnhub_candidates=(f"{cleaned}.JK", cleaned), market="ID"
        )

    return ResolvedStockSymbol(original=symbol, yfinance=cleaned, finnhub_candidates=(cleaned,), market="US")


def get_finnhub_symbol_candidates(symbol: str) -> list[str]:
    return list(resolve_stock_symbol(symbol).finnhub_candidates)


def clear_symbol_cache() -> None:
    resolve_stock_symbol.cache_clear()
