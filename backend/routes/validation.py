"""Input validation helpers for analysis API entry points."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from config import (
    ANALYSIS_DEPTHS,
    DEFAULT_ANALYSIS_DEPTH,
    DEFAULT_MAX_DEBATE_ROUNDS,
    RESPONSE_DETAILS,
)
from errors import BadRequestError

# Accept canonical Yahoo/yfinance symbols selected by the frontend search bar:
# BBCA.JK, AAPL, BTC-USD, 0700.HK, 9984.T, SPY, mutual funds, and ETFs.
_SYMBOL_RE = re.compile(r"^[A-Z0-9]{1,15}(?:[.-][A-Z0-9]{1,10}){0,2}$")
_SUPPORTED_MARKETS = {"IDX", "ID", "US", "GLOBAL", "CRYPTO", "ETF", "FUND", "UNKNOWN"}

AnalysisDepth = Literal["fast", "balanced", "deep"]
ResponseDetail = Literal["summary", "full", "debug"]


class AnalysisRequest(BaseModel):
    """Payload accepted by analysis API entry points."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    ticker: str = Field(
        validation_alias=AliasChoices("ticker", "symbol"),
        serialization_alias="ticker",
        min_length=1,
        max_length=64,
    )
    input_ticker: str | None = None
    trade_date: str
    time_horizon_months: int = Field(default=1)
    max_debate_rounds: int = Field(default=DEFAULT_MAX_DEBATE_ROUNDS)
    analysis_depth: AnalysisDepth = Field(default=DEFAULT_ANALYSIS_DEPTH)
    response_detail: ResponseDetail = Field(default="full")
    market: str | None = Field(default=None, max_length=16)
    search_metadata: dict[str, Any] | None = None
    has_existing_position: bool | None = Field(default=False)
    position_quantity: float | None = Field(default=None, ge=0)
    average_entry_price: float | None = Field(default=None, ge=0)


def _canonical_from_search_metadata(search_metadata: dict[str, Any] | None) -> str | None:
    if not isinstance(search_metadata, dict):
        return None
    for key in ("canonical", "symbol", "ticker"):
        value = search_metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().upper()
    return None


def normalize_ticker(ticker: str) -> str:
    """Normalize one canonical yfinance symbol without adding exchange suffixes."""
    return ticker.strip().upper()


def normalize_market(market: str | None) -> str | None:
    """Normalize optional UI market context."""
    if market is None:
        return None
    if not isinstance(market, str):
        return None
    normalized = market.strip().upper()
    aliases = {
        "INDONESIA": "ID",
        "IDN": "ID",
        "UNITED_STATES": "US",
        "USA": "US",
        "US_MARKET": "US",
        "NYSE": "US",
        "NASDAQ": "US",
    }
    return aliases.get(normalized, normalized) or None


def normalize_ticker_for_market(ticker: str, market: str | None) -> str:
    """Normalize ticker using explicit market context without auto-mapping."""
    _ = market
    return normalize_ticker(ticker)


def normalize_ticker_symbol(ticker: str) -> str:
    """Normalize and validate one canonical ticker symbol."""
    normalized = normalize_ticker(ticker) if isinstance(ticker, str) else ticker
    if not isinstance(normalized, str) or not _SYMBOL_RE.fullmatch(normalized):
        raise BadRequestError(
            "Invalid ticker symbol.",
            details={
                "fields": {
                    ("ticker"): (
                        "Ticker must be a canonical yfinance symbol, for example BBCA.JK, AAPL, "
                        + "BTC-USD, 0700.HK, 9984.T, or SPY."
                    )
                }
            },
        )
    return normalized


def normalize_and_validate_analysis_request(req: AnalysisRequest) -> AnalysisRequest:
    """Validate user input before the expensive agent pipeline starts."""

    search_metadata = req.search_metadata if isinstance(req.search_metadata, dict) else None
    canonical_from_search = _canonical_from_search_metadata(search_metadata)
    raw_ticker = canonical_from_search or req.ticker
    input_ticker = req.input_ticker or (req.ticker if isinstance(req.ticker, str) else None)
    market = normalize_market(req.market)
    ticker = (
        normalize_ticker_for_market(raw_ticker, market)
        if isinstance(raw_ticker, str)
        else raw_ticker
    )
    trade_date = req.trade_date.strip() if isinstance(req.trade_date, str) else req.trade_date
    analysis_depth = str(req.analysis_depth or DEFAULT_ANALYSIS_DEPTH).strip().lower()
    response_detail = str(req.response_detail or "full").strip().lower()
    time_horizon_months = req.time_horizon_months
    has_existing_position = (
        bool(req.has_existing_position) if req.has_existing_position is not None else False
    )
    position_quantity = req.position_quantity
    average_entry_price = req.average_entry_price

    errors: dict[str, str] = {}

    if market is not None and market not in _SUPPORTED_MARKETS:
        errors["market"] = "market must be one of: IDX, ID, US, GLOBAL, CRYPTO, ETF, FUND, UNKNOWN."

    if not isinstance(ticker, str) or not _SYMBOL_RE.fullmatch(ticker):
        errors["ticker"] = (
            "Ticker must be a canonical yfinance symbol, for example BBCA.JK, AAPL, BTC-USD, "
            + "0700.HK, 9984.T, or SPY."
        )

    if not isinstance(trade_date, str):
        errors["trade_date"] = "Trade date must use YYYY-MM-DD format."
    else:
        try:
            parsed = datetime.strptime(trade_date, "%Y-%m-%d")
            if parsed.strftime("%Y-%m-%d") != trade_date:
                errors["trade_date"] = "Trade date must be a valid date in YYYY-MM-DD format."
            elif parsed.date() > date.today() + timedelta(days=1):
                errors["trade_date"] = "Trade date cannot be more than 1 day in the future."
        except ValueError:
            errors["trade_date"] = "Trade date must be a valid date in YYYY-MM-DD format."

    if not isinstance(req.max_debate_rounds, int) or not 1 <= req.max_debate_rounds <= 5:
        errors["max_debate_rounds"] = "max_debate_rounds must be between 1 and 5."

    if (
        isinstance(time_horizon_months, bool)
        or not isinstance(time_horizon_months, int)
        or time_horizon_months not in {1, 2, 3}
    ):
        errors["time_horizon_months"] = "time_horizon_months must be one of: 1, 2, 3."

    if analysis_depth not in ANALYSIS_DEPTHS:
        errors["analysis_depth"] = "analysis_depth must be one of: fast, balanced, deep."

    if response_detail not in RESPONSE_DETAILS:
        errors["response_detail"] = "response_detail must be one of: summary, full, debug."

    if position_quantity is not None and (
        isinstance(position_quantity, bool) or position_quantity < 0
    ):
        errors["position_quantity"] = "position_quantity must be a non-negative number or null."

    if average_entry_price is not None and (
        isinstance(average_entry_price, bool) or average_entry_price < 0
    ):
        errors["average_entry_price"] = "average_entry_price must be a non-negative number or null."

    if errors:
        raise BadRequestError("Invalid analysis request.", details={"fields": errors})

    return AnalysisRequest(
        ticker=ticker,
        input_ticker=input_ticker,
        trade_date=trade_date,
        time_horizon_months=time_horizon_months,
        max_debate_rounds=req.max_debate_rounds,
        analysis_depth=analysis_depth,  # type: ignore[arg-type]
        response_detail=response_detail,  # type: ignore[arg-type]
        market=market,
        search_metadata=search_metadata,
        has_existing_position=has_existing_position,
        position_quantity=position_quantity,
        average_entry_price=average_entry_price,
    )
