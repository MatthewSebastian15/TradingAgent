from __future__ import annotations

import pytest
from pydantic import ValidationError

from tradingagents.agents.schemas import (
    PortfolioDecision,
    PortfolioNarrative,
    PortfolioRating,
    render_pm_decision,
)
from tradingagents.pipeline_balanced.prompts import (
    portfolio_manager_prompt,
    portfolio_narrative_prompt,
)


def test_decision_no_longer_requires_prose():
    decision = PortfolioDecision(confidence_score=0.5, rating=PortfolioRating.HOLD)
    assert decision.executive_summary == ""
    assert "Executive Summary" not in render_pm_decision(decision)


def test_narrative_enforces_word_ranges():
    with pytest.raises(ValidationError):
        PortfolioNarrative(
            executive_summary="short", investment_thesis="short", key_reasons_paragraph="short"
        )
    ok = PortfolioNarrative(
        executive_summary="word " * 200,
        investment_thesis="reason " * 300,
        key_reasons_paragraph="because " * 80,
    )
    assert ok.key_reasons_paragraph


def test_pm_prompt_asks_for_no_prose_and_narrative_prompt_restricts_numbers():
    pm = portfolio_manager_prompt(
        "AAPL", "2026-09-14", "1 month", "100.00", "M", "N", "F", "D", "P", "T", "R", "{}"
    )
    assert "Leave executive_summary and investment_thesis empty" in pm
    assert "250-300 words" not in pm
    narrative = portfolio_narrative_prompt(
        "AAPL",
        "2026-09-14",
        "1 month",
        "DECISION",
        '{"entry_price": 100}',
        "M",
        "N",
        "F",
        "R",
        "{}",
    )
    assert "VERIFIED FACTS" in narrative
    assert "Every price, percentage, ratio, or amount you write must appear" in narrative
