"""Input validation helpers for analysis API entry points."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Literal
import re

from pydantic import BaseModel, Field

from config import DEFAULT_ANALYSIS_DEPTH, DEFAULT_MAX_DEBATE_ROUNDS
from errors import BadRequestError
from tradingagents.dataflows.y_finance import normalize_ticker

# Accepts plain tickers (AAPL, NVDA, 0700) and exchange-suffixed tickers
# (BBCA.JK, BRK-B, 0700.HK). Backend and frontend intentionally share the
# same rule so the UI no longer smiles politely before the API rejects you.
_TICKER_RE = re.compile(r"^[A-Z0-9]{2,10}(?:[.-][A-Z0-9]{1,5})?$")

AnalysisDepth = Literal["fast", "balanced", "deep"]
ResponseDetail = Literal["summary", "full", "debug"]


class AnalysisRequest(BaseModel):
    """Payload accepted by /api/analyze and /api/analyze/stream."""

    ticker: str = Field(..., min_length=1, max_length=12)
    trade_date: str
    max_debate_rounds: int = Field(default=DEFAULT_MAX_DEBATE_ROUNDS)
    analysis_depth: AnalysisDepth = Field(default=DEFAULT_ANALYSIS_DEPTH)
    response_detail: ResponseDetail = Field(default="full")


class AnalysisJobRequest(AnalysisRequest):
    """Payload accepted by the job-based analysis API."""


class TickerValidationResponse(BaseModel):
    ticker: str
    trade_date: str
    valid: bool
    message: str


def normalize_and_validate_analysis_request(req: AnalysisRequest) -> AnalysisRequest:
    """Validate user input before the expensive agent pipeline starts."""

    ticker = normalize_ticker(req.ticker) if isinstance(req.ticker, str) else req.ticker
    trade_date = req.trade_date.strip() if isinstance(req.trade_date, str) else req.trade_date
    analysis_depth = str(req.analysis_depth or DEFAULT_ANALYSIS_DEPTH).strip().lower()
    response_detail = str(req.response_detail or "full").strip().lower()

    errors: dict[str, str] = {}

    if not isinstance(ticker, str) or not _TICKER_RE.fullmatch(ticker):
        errors["ticker"] = "Ticker must be a Yahoo Finance compatible symbol, for example AAPL, BBCA.JK, BBRI.JK, TLKM.JK, BRK-B, or 0700.HK."

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

    if analysis_depth not in {"fast", "balanced", "deep"}:
        errors["analysis_depth"] = "analysis_depth must be one of: fast, balanced, deep."

    if response_detail not in {"summary", "full", "debug"}:
        errors["response_detail"] = "response_detail must be one of: summary, full, debug."

    if errors:
        raise BadRequestError("Invalid analysis request.", details={"fields": errors})

    return AnalysisRequest(
        ticker=ticker,
        trade_date=trade_date,
        max_debate_rounds=req.max_debate_rounds,
        analysis_depth=analysis_depth,  # type: ignore[arg-type]
        response_detail=response_detail,  # type: ignore[arg-type]
    )
