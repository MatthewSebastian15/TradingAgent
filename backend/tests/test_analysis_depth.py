from __future__ import annotations

import threading
from collections import Counter

import pytest
import tradingagents.pipeline_balanced as pipeline
from tradingagents.dataflows.data_quality import DataQualityReport

from config import build_tradingagents_config


def _collected_data(trade_date: str = "2026-05-18") -> pipeline.CollectedData:
    return pipeline.CollectedData(
        ticker="BBCA.JK",
        trade_date=trade_date,
        time_horizon_months=1,
        price_data="\n".join(
            [
                "Date,Open,High,Low,Close,Volume",
                f"{trade_date},100,110,95,105,1000000",
            ]
        ),
        technical_indicators="RSI: 55",
        fundamentals="Revenue and earnings are stable.",
        balance_sheet="Balance sheet is stable.",
        cashflow="Cash flow is stable.",
        income_statement="Income statement is stable.",
        company_news="No material negative news.",
        global_news="Macro backdrop is neutral.",
        insider_transactions="No notable insider transactions.",
        data_quality=DataQualityReport(price_data="ok", fundamentals="ok", news="ok", warnings=[]),
        last_close_price=105.0,
    )


@pytest.mark.parametrize(
    ("depth", "expected_budget", "expected_agents"),
    [
        (
            "fast",
            6,
            [
                "Market Analyst",
                "News + Social Analyst",
                "Fundamentals Analyst",
                "Research Manager",
                "Trader",
                "Portfolio Manager",
            ],
        ),
        (
            "balanced",
            9,
            [
                "Market Analyst",
                "News + Social Analyst",
                "Fundamentals Analyst",
                "Bull Researcher",
                "Bear Researcher",
                "Research Manager",
                "Trader",
                "Risk Committee",
                "Portfolio Manager",
            ],
        ),
        (
            "deep",
            12,
            [
                "Market Analyst",
                "News + Social Analyst",
                "Fundamentals Analyst",
                "Bull Researcher",
                "Bear Researcher",
                "Bull Researcher R2",
                "Bear Researcher R2",
                "Research Manager",
                "Trader",
                "Risk Committee",
                "Risk Committee R2",
                "Portfolio Manager",
            ],
        ),
    ],
)
def test_analysis_depth_controls_llm_agent_calls(
    depth, expected_budget, expected_agents, monkeypatch
):
    called_agents: list[str] = []
    lock = threading.Lock()

    def fake_create_llms(config):
        return object(), object()

    def fake_collect_market_data(ticker, trade_date, config, cancel_check=None):
        return _collected_data(trade_date)

    def fake_invoke_once(llm, schema, prompt, fallback, agent_name, budget=None, cancel_check=None):
        if budget is not None and not budget.consume(agent_name):
            return fallback
        with lock:
            called_agents.append(agent_name)
        return fallback

    monkeypatch.setattr(pipeline, "_create_llms", fake_create_llms)
    monkeypatch.setattr(pipeline, "collect_market_data", fake_collect_market_data)
    monkeypatch.setattr(pipeline, "_invoke_once", fake_invoke_once)

    config = build_tradingagents_config(
        max_debate_rounds=1, analysis_depth=depth, response_detail="summary"
    )

    result = pipeline.run_balanced_pipeline("BBCA.JK", "2026-05-18", config)

    assert Counter(called_agents) == Counter(expected_agents)
    assert result["analysis_depth"] == depth
    assert result["balanced_gemini_request_budget"] == expected_budget
    assert result["balanced_gemini_calls_used"] == expected_budget
    assert result["analysis_depth_config"]["llm_budget"] == expected_budget
    assert result["agents_skipped"] == []
