import pytest

from tradingagents.agents.prompts import (
    ReportBundle,
    build_investment_debate_prompt,
    build_risk_debate_prompt,
)

BUNDLE = ReportBundle(
    instrument_context="The instrument to analyze is `BBCA.JK`.",
    market_report="MARKET-REPORT",
    sentiment_report="SENTIMENT-REPORT",
    news_report="NEWS-REPORT",
    fundamentals_report="FUNDAMENTALS-REPORT",
    debate_history="DEBATE-HISTORY",
    last_opponent_argument="OPPONENT-ARGUMENT",
    trader_plan="TRADER-PLAN",
    data_quality_summary="price_data: partial",
)


@pytest.mark.parametrize(
    ("side", "role", "opponent_label"),
    [
        ("bull", "Bull Analyst", "Last bear argument"),
        ("bear", "Bear Analyst", "Last bull argument"),
    ],
)
def test_investment_prompt_fills_all_sections(side, role, opponent_label):
    prompt = build_investment_debate_prompt(side, BUNDLE)
    assert f"You are the {role}." in prompt
    assert opponent_label in prompt
    for placeholder in (
        "MARKET-REPORT",
        "SENTIMENT-REPORT",
        "NEWS-REPORT",
        "FUNDAMENTALS-REPORT",
        "DEBATE-HISTORY",
        "OPPONENT-ARGUMENT",
        "BBCA.JK",
        "price_data: partial",
    ):
        assert placeholder in prompt


def test_investment_prompt_default_data_quality_note():
    bundle = ReportBundle(
        instrument_context="ctx",
        market_report="m",
        sentiment_report="s",
        news_report="n",
        fundamentals_report="f",
    )
    prompt = build_investment_debate_prompt("bull", bundle)
    assert "No data quality report available." in prompt


@pytest.mark.parametrize(
    ("side", "role"),
    [
        ("aggressive", "Aggressive Risk Analyst"),
        ("conservative", "Conservative Risk Analyst"),
        ("neutral", "Neutral Risk Analyst"),
    ],
)
def test_risk_prompt_fills_all_sections(side, role):
    latest = {"aggressive": "AGG-ARG", "conservative": "CON-ARG", "neutral": "NEU-ARG"}
    prompt = build_risk_debate_prompt(side, BUNDLE, latest)
    assert f"You are the {role}." in prompt
    for placeholder in ("TRADER-PLAN", "AGG-ARG", "CON-ARG", "NEU-ARG", "MARKET-REPORT"):
        assert placeholder in prompt


def test_risk_prompt_missing_arguments_render_empty():
    prompt = build_risk_debate_prompt("neutral", BUNDLE, {})
    assert "Latest aggressive argument:" in prompt
    assert "{" not in prompt  # no unfilled template keys
