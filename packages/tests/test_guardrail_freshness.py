from __future__ import annotations

from types import SimpleNamespace

import tradingagents.pipeline_balanced.orchestrator as orch
from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating
from tradingagents.graph.prompt_context_builder import PromptContext
from tradingagents.llm_clients.router import apply_guardrail


def _context(**quality) -> PromptContext:
    return PromptContext(
        symbol="AAPL",
        market="US",
        field_sources={},
        data_quality=dict(quality),
        limitations=[],
        sector=None,
        normalized_financials=[],
        top_news=[],
        budget_remaining={},
    )


def test_stale_price_downgrades_buy_to_wait():
    action, warnings = apply_guardrail(_context(price_stale=True), "BUY")
    assert action == "WAIT"
    assert any("stale" in warning.lower() for warning in warnings)


def test_price_conflict_downgrades_sell_to_wait():
    action, warnings = apply_guardrail(_context(price_conflict=True), "SELL")
    assert action == "WAIT"
    assert any("conflict" in warning.lower() for warning in warnings)


def test_aggregate_decision_applies_max_confidence_cap(monkeypatch):
    decision = PortfolioDecision(
        confidence_score=0.85,
        rating=PortfolioRating.HOLD,
        executive_summary="word " * 200,
        investment_thesis="reason " * 300,
    )
    safety = _context(news_missing=True)
    data = SimpleNamespace(
        last_close_price=100.0,
        last_close_price_as_of="2026-09-14",
        last_close_price_source="yfinance:live_quote",
        price_data="",
        data_quality=SimpleNamespace(model_dump=lambda: {}, warnings=[]),
        safety_prompt_context=safety,
        warnings=[],
    )
    monkeypatch.setattr(orch, "normalize_trade_levels", lambda decision, **kwargs: decision)
    context = SimpleNamespace(
        ticker="AAPL",
        has_existing_position=False,
        position_quantity=None,
        average_entry_price=None,
        config={},
    )

    result = orch.aggregate_decision(
        context, SimpleNamespace(data=data), SimpleNamespace(portfolio_decision=decision)
    )

    assert result.confidence_score == 0.60
