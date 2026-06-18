from __future__ import annotations

from dataclasses import dataclass
from math import floor
from typing import Any


@dataclass
class PositionSizing:
    market: str
    quantity: float | None
    shares: int | None
    lot_size: int | None
    estimated_value: float | None
    risk_amount: float | None
    risk_per_unit: float | None
    portfolio_value_used: float | None
    risk_pct_used: float
    note: str | None = None
    unavailable_reason: str | None = None


def calculate_position_sizing(
    market: str,
    entry_price: float | None,
    stop_loss: float | None,
    portfolio_value: float | None,
    risk_per_trade_pct: float = 2.0,
    allow_fractional: bool = True,
) -> PositionSizing:
    """
    Calculate position size for IDX, US, ETF, CRYPTO, or return unavailable.
    """
    market_key = _normalize_market(market)
    risk_pct = _safe_float(risk_per_trade_pct, default=2.0) or 2.0

    if market_key == "UNKNOWN":
        return _unavailable(
            market_key, risk_pct, "Position sizing is unavailable for unknown market."
        )

    if market_key not in {"IDX", "US", "GLOBAL", "ETF", "FUND", "CRYPTO"}:
        return _unavailable(
            market_key, risk_pct, "Position sizing is unavailable for unsupported market."
        )

    entry = _safe_float(entry_price)
    stop = _safe_float(stop_loss)
    portfolio = _safe_float(portfolio_value)
    if entry is None or entry <= 0:
        return _unavailable(market_key, risk_pct, "Entry price is required for position sizing.")
    if stop is None or stop <= 0:
        return _unavailable(market_key, risk_pct, "Stop loss is required for position sizing.")
    if portfolio is None or portfolio <= 0:
        return _unavailable(
            market_key, risk_pct, "Portfolio value is required for position sizing."
        )
    if risk_pct <= 0:
        return _unavailable(market_key, risk_pct, "Risk percent must be greater than zero.")

    risk_per_unit = abs(entry - stop)
    if risk_per_unit <= 0:
        return _unavailable(
            market_key, risk_pct, "Risk per unit is zero because entry price equals stop loss."
        )

    risk_amount = portfolio * risk_pct / 100
    raw_quantity = risk_amount / risk_per_unit

    if market_key == "IDX":
        lot_size = floor(raw_quantity / 100)
        shares = lot_size * 100
        quantity = float(shares)
        return PositionSizing(
            market=market_key,
            quantity=quantity,
            shares=shares,
            lot_size=lot_size,
            estimated_value=quantity * entry,
            risk_amount=risk_amount,
            risk_per_unit=risk_per_unit,
            portfolio_value_used=portfolio,
            risk_pct_used=risk_pct,
        )

    if market_key == "CRYPTO":
        return PositionSizing(
            market=market_key,
            quantity=raw_quantity,
            shares=None,
            lot_size=None,
            estimated_value=raw_quantity * entry,
            risk_amount=risk_amount,
            risk_per_unit=risk_per_unit,
            portfolio_value_used=portfolio,
            risk_pct_used=risk_pct,
            note="Crypto quantity supports decimal sizing.",
        )

    quantity = raw_quantity if allow_fractional else float(floor(raw_quantity))
    shares = None if allow_fractional else int(quantity)
    return PositionSizing(
        market=market_key,
        quantity=quantity,
        shares=shares,
        lot_size=None,
        estimated_value=quantity * entry,
        risk_amount=risk_amount,
        risk_per_unit=risk_per_unit,
        portfolio_value_used=portfolio,
        risk_pct_used=risk_pct,
        note="Generic equity sizing used." if market_key == "GLOBAL" else None,
    )


def _normalize_market(market: str) -> str:
    value = str(market or "UNKNOWN").strip().upper()
    aliases = {"ID": "IDX", "INDONESIA": "IDX", "USA": "US", "UNITED_STATES": "US"}
    return aliases.get(value, value or "UNKNOWN")


def _safe_float(value: Any, default: float | None = None) -> float | None:
    try:
        if value is None or value == "":
            return default
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if number == number and number not in {float("inf"), float("-inf")} else default


def _unavailable(market: str, risk_pct: float, reason: str) -> PositionSizing:
    return PositionSizing(
        market=market,
        quantity=None,
        shares=None,
        lot_size=None,
        estimated_value=None,
        risk_amount=None,
        risk_per_unit=None,
        portfolio_value_used=None,
        risk_pct_used=risk_pct,
        unavailable_reason=reason,
    )
