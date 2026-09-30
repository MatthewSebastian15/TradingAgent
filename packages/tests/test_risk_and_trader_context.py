from __future__ import annotations

from types import SimpleNamespace

from tradingagents.pipeline_balanced.debate import (
    _enforce_risk_floor,
    _risk_metrics,
    _run_risk_phase,
)
from tradingagents.pipeline_balanced.prompts import risk_committee_prompt, trader_prompt
from tradingagents.pipeline_balanced.types import AnalystReport, LLMBudget, RiskCommitteeReport


def _report(level: str) -> RiskCommitteeReport:
    return RiskCommitteeReport(
        overall_risk_level=level,
        aggressive_view="a",
        neutral_view="n",
        conservative_view="c",
        key_risks=["k"],
        mitigation_plan="m",
        confidence=0.5,
    )


def test_prompts_include_new_deterministic_sections():
    trader = trader_prompt(
        "AAPL",
        "2026-09-14",
        "1 month",
        "M",
        "PLAN",
        "{}",
        catalysts_json='{"earnings_within_days": 3}',
    )
    assert "[DYNAMIC CATALYSTS JSON]" in trader and "earnings_within_days" in trader
    risk = risk_committee_prompt(
        "AAPL",
        "2026-09-14",
        "1 month",
        "M",
        "N",
        "F",
        "D",
        "P",
        "T",
        "{}",
        risk_metrics_json='{"risk_bucket": "high"}',
    )
    assert "[DYNAMIC DETERMINISTIC RISK METRICS JSON]" in risk


def test_risk_floor_raises_understated_level():
    raised = _enforce_risk_floor(_report("Low"), "high")
    assert raised.overall_risk_level == "High"
    assert any("deterministic" in item for item in raised.key_risks)
    assert _enforce_risk_floor(_report("High"), "medium").overall_risk_level == "High"
    assert _enforce_risk_floor(_report("Very High"), "high").overall_risk_level == "Very High"


def test_fast_mode_uses_deterministic_bucket():
    data = SimpleNamespace(
        price_chart={},
        price_performance={"max_drawdown_percent": -30.0},
        technical_entry={},
        price_quote_check={},
        data_quality=SimpleNamespace(price_data="ok", warnings=[]),
    )
    assert _risk_metrics(data)["risk_bucket"] == "high"
    context = SimpleNamespace(
        ticker="AAPL",
        trade_date="2026-09-14",
        analysis_depth="fast",
        time_horizon_text="1 month",
        llm_budget=LLMBudget(limit=5),
        pipeline_timings={},
        progress_callback=None,
        cancel_check=None,
        llm_for=lambda name: None,
    )
    empty = AnalystReport(title="t", summary="s", key_points=[], risks=[], confidence=0.5)
    report = _run_risk_phase(
        context,
        data=data,
        market_report=empty,
        news_social_report=empty,
        fundamentals_report=empty,
        market_md="",
        news_social_md="",
        fundamentals_md="",
        debate_md="",
        investment_plan="",
        trader_plan="",
        data_quality_json="{}",
    )
    assert report.overall_risk_level == "High"


def test_fast_mode_never_reports_low_risk_without_committee_review():
    data = SimpleNamespace(
        price_chart={},
        price_performance={"max_drawdown_percent": -5.0},
        technical_entry={},
        price_quote_check={},
        data_quality=SimpleNamespace(price_data="ok", warnings=[]),
    )
    assert _risk_metrics(data)["risk_bucket"] == "low"
    context = SimpleNamespace(
        ticker="AAPL",
        trade_date="2026-09-14",
        analysis_depth="fast",
        time_horizon_text="1 month",
        llm_budget=LLMBudget(limit=5),
        pipeline_timings={},
        progress_callback=None,
        cancel_check=None,
        llm_for=lambda name: None,
    )
    empty = AnalystReport(title="t", summary="s", key_points=[], risks=[], confidence=0.5)
    report = _run_risk_phase(
        context,
        data=data,
        market_report=empty,
        news_social_report=empty,
        fundamentals_report=empty,
        market_md="",
        news_social_md="",
        fundamentals_md="",
        debate_md="",
        investment_plan="",
        trader_plan="",
        data_quality_json="{}",
    )
    assert report.overall_risk_level == "Medium"
