"""Input validation helpers for analysis API entry points."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, Field
from config import ANALYSIS_DEPTHS, DEFAULT_ANALYSIS_DEPTH, DEFAULT_MAX_DEBATE_ROUNDS, RESPONSE_DETAILS
from errors import BadRequestError

# Accepts plain tickers (AAPL, NVDA, 0700) and exchange-suffixed tickers
# (BBCA.JK, BRK-B). Only US tickers and Indonesian IDX tickers are supported.
_TICKER_RE = re.compile(r"^[A-Z0-9]{1,10}(?:[.-][A-Z0-9]{1,5})?$")
_IDX_TICKER_RE = re.compile(r"^[A-Z0-9]{1,10}\.JK$")
_NON_ID_EXCHANGE_SUFFIX_RE = re.compile(r"\.(?!JK$)[A-Z0-9]{1,5}$")
_SUPPORTED_MARKETS = {"US", "ID"}


_IDX_AUTO_SUFFIX = {
    "AALI",
    "ACES",
    "ADRO",
    "AKRA",
    "AMMN",
    "ANTM",
    "ARTO",
    "ASII",
    "BBCA",
    "BBNI",
    "BBRI",
    "BBTN",
    "BMRI",
    "BRIS",
    "BRPT",
    "CPIN",
    "ESSA",
    "EXCL",
    "GOTO",
    "ICBP",
    "INCO",
    "INDF",
    "INKP",
    "INTP",
    "ISAT",
    "ITMG",
    "KLBF",
    "MDKA",
    "MEDC",
    "PGAS",
    "PTBA",
    "SMGR",
    "TLKM",
    "UNTR",
    "UNVR",
}


def normalize_ticker(ticker: str) -> str:
    """Normalize one supported ticker without importing yfinance runtime dependencies."""

    cleaned = ticker.strip().upper()
    if "." in cleaned:
        return cleaned
    if cleaned in _IDX_AUTO_SUFFIX:
        return f"{cleaned}.JK"
    return cleaned

AnalysisDepth = Literal["fast", "balanced", "deep"]
ResponseDetail = Literal["summary", "full", "debug"]


class AnalysisRequest(BaseModel):
    """Payload accepted by analysis API entry points."""

    ticker: str = Field(..., min_length=1, max_length=12)
    trade_date: str
    time_horizon_months: int = Field(default=1)
    max_debate_rounds: int = Field(default=DEFAULT_MAX_DEBATE_ROUNDS)
    analysis_depth: AnalysisDepth = Field(default=DEFAULT_ANALYSIS_DEPTH)
    response_detail: ResponseDetail = Field(default="full")
    market: str | None = Field(default=None, max_length=16)
    has_existing_position: bool | None = Field(default=False)
    position_quantity: float | None = Field(default=None, ge=0)
    average_entry_price: float | None = Field(default=None, ge=0)


def is_non_id_exchange_ticker(ticker: str) -> bool:
    """Return True if ticker has a non-IDX exchange suffix like .HK, .T, .DE."""
    return bool(_NON_ID_EXCHANGE_SUFFIX_RE.search(ticker.upper()))


def normalize_market(market: str | None) -> str | None:
    """Normalize optional UI market context."""
    if market is None:
        return None
    if not isinstance(market, str):
        return None
    normalized = market.strip().upper()
    return normalized or None


def normalize_ticker_for_market(ticker: str, market: str | None) -> str:
    """Normalize ticker using explicit market context when supplied."""
    cleaned = ticker.strip().upper()
    if market == "ID":
        base = cleaned.removesuffix(".JK")
        return f"{base}.JK"
    if market == "US":
        return cleaned
    return normalize_ticker(ticker)


def normalize_ticker_symbol(ticker: str) -> str:
    """Normalize and validate one user-supplied ticker symbol."""
    normalized = normalize_ticker(ticker) if isinstance(ticker, str) else ticker
    if not isinstance(normalized, str) or not _TICKER_RE.fullmatch(normalized):
        raise BadRequestError(
            "Invalid ticker symbol.",
            details={
                "fields": {
                    "ticker": "Ticker must be a supported US or Indonesian symbol, for example AAPL, NVDA, BBCA, BBRI, TLKM, or BBCA.JK."
                }
            },
        )
    return normalized


def normalize_and_validate_analysis_request(req: AnalysisRequest) -> AnalysisRequest:
    """Validate user input before the expensive agent pipeline starts."""

    market = normalize_market(req.market)
    ticker = normalize_ticker_for_market(req.ticker, market) if isinstance(req.ticker, str) else req.ticker
    trade_date = req.trade_date.strip() if isinstance(req.trade_date, str) else req.trade_date
    analysis_depth = str(req.analysis_depth or DEFAULT_ANALYSIS_DEPTH).strip().lower()
    response_detail = str(req.response_detail or "full").strip().lower()
    time_horizon_months = req.time_horizon_months
    has_existing_position = bool(req.has_existing_position) if req.has_existing_position is not None else False
    position_quantity = req.position_quantity
    average_entry_price = req.average_entry_price

    errors: dict[str, str] = {}

    if market is not None and market not in _SUPPORTED_MARKETS:
        errors["market"] = "market must be one of: US, ID."

    if not isinstance(ticker, str) or not _TICKER_RE.fullmatch(ticker):
        errors["ticker"] = (
            "Ticker must be a supported US or Indonesian symbol, for example AAPL, NVDA, BBCA, BBRI, TLKM, or BBCA.JK."
        )
    elif market == "ID" and not _IDX_TICKER_RE.fullmatch(ticker):
        errors["ticker"] = "IDX ticker must be submitted as a plain stock code, for example BBCA or UNVR."
    elif is_non_id_exchange_ticker(ticker):
        errors["ticker"] = "Only US tickers and Indonesian IDX tickers are supported. Global exchange suffixes are no longer supported."

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

    if position_quantity is not None and (isinstance(position_quantity, bool) or position_quantity < 0):
        errors["position_quantity"] = "position_quantity must be a non-negative number or null."

    if average_entry_price is not None and (isinstance(average_entry_price, bool) or average_entry_price < 0):
        errors["average_entry_price"] = "average_entry_price must be a non-negative number or null."

    if errors:
        raise BadRequestError("Invalid analysis request.", details={"fields": errors})

    return AnalysisRequest(
        ticker=ticker,
        trade_date=trade_date,
        time_horizon_months=time_horizon_months,
        max_debate_rounds=req.max_debate_rounds,
        analysis_depth=analysis_depth,  # type: ignore[arg-type]
        response_detail=response_detail,  # type: ignore[arg-type]
        market=market,
        has_existing_position=has_existing_position,
        position_quantity=position_quantity,
        average_entry_price=average_entry_price,
    )
