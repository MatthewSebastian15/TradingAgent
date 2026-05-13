"""Input validation helpers for analysis API entry points."""

from __future__ import annotations

from datetime import datetime
import re

from fastapi import HTTPException
from pydantic import BaseModel

_TICKER_RE = re.compile(r"^[A-Z]{1,5}$")


class AnalysisRequest(BaseModel):
    """Payload accepted by /api/analyze and /api/analyze/stream."""

    ticker: str
    trade_date: str
    max_debate_rounds: int = 3


def normalize_and_validate_analysis_request(req: AnalysisRequest) -> AnalysisRequest:
    """Validate user input before the expensive agent pipeline starts."""

    ticker = req.ticker.strip() if isinstance(req.ticker, str) else req.ticker
    trade_date = req.trade_date.strip() if isinstance(req.trade_date, str) else req.trade_date

    errors: dict[str, str] = {}

    if not isinstance(ticker, str) or not _TICKER_RE.fullmatch(ticker):
        errors["ticker"] = "Ticker must contain only uppercase A-Z letters and be 1 to 5 characters long."

    if not isinstance(trade_date, str):
        errors["trade_date"] = "Trade date must use YYYY-MM-DD format."
    else:
        try:
            parsed = datetime.strptime(trade_date, "%Y-%m-%d")
            if parsed.strftime("%Y-%m-%d") != trade_date:
                errors["trade_date"] = "Trade date must be a valid date in YYYY-MM-DD format."
        except ValueError:
            errors["trade_date"] = "Trade date must be a valid date in YYYY-MM-DD format."

    if not isinstance(req.max_debate_rounds, int) or not 1 <= req.max_debate_rounds <= 5:
        errors["max_debate_rounds"] = "max_debate_rounds must be between 1 and 5."

    if errors:
        raise HTTPException(status_code=422, detail={"message": "Invalid analysis request.", "fields": errors})

    return AnalysisRequest(
        ticker=ticker,
        trade_date=trade_date,
        max_debate_rounds=req.max_debate_rounds,
    )
