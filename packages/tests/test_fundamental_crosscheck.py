from __future__ import annotations

from tradingagents.dataflows.quality.fundamental_crosscheck import crosscheck_latest_fundamentals
from tradingagents.graph.prompt_context_builder import PromptContext
from tradingagents.llm_clients.router import apply_guardrail


def _row(label, revenue, net_profit, currency="USD", period_type="annual"):
    return {
        "period": {"period_label": label, "period_type": period_type},
        "currency": currency,
        "revenue": {"normalized_value": revenue},
        "net_profit": {"normalized_value": net_profit},
    }


def test_matching_values_are_ok():
    result = crosscheck_latest_fundamentals(
        [_row("FY2025", 391_000, 94_000)],
        [_row("FY2025", 390_000, 93_800)],
        secondary_source="sec_companyfacts",
    )
    assert result["status"] == "ok"
    assert result["period_label"] == "FY2025"


def test_unit_scale_and_value_mismatch_are_flagged():
    result = crosscheck_latest_fundamentals(
        [_row("FY2025", 391_000_000_000, 80_000)],
        [_row("FY2025", 391_000_000, 94_000)],
        secondary_source="sec_companyfacts",
    )
    assert result["status"] == "conflict"
    assert "UNIT_SCALE_MISMATCH: revenue" in result["warnings"]
    assert any(w.startswith("VALUE_MISMATCH: net_profit") for w in result["warnings"])


def test_different_periods_are_never_compared():
    result = crosscheck_latest_fundamentals(
        [_row("TTM", 1, 1, period_type="ttm")],
        [_row("FY2025", 2, 2)],
        secondary_source="sec_companyfacts",
    )
    assert result["status"] == "skipped"


def test_fundamentals_conflict_caps_confidence():
    context = PromptContext(
        symbol="AAPL",
        market="US",
        field_sources={},
        data_quality={"fundamentals_conflict": True},
        limitations=[],
        sector=None,
        normalized_financials=[],
        top_news=[],
        budget_remaining={},
    )
    action, warnings = apply_guardrail(context, "BUY")
    assert action == "BUY"
    assert context.data_quality["max_confidence"] == 0.55
    assert any("fundamental sources disagree" in w for w in warnings)


def test_unknown_period_labels_are_never_compared():
    result = crosscheck_latest_fundamentals(
        [_row("unknown", 1, 1)],
        [_row("unknown", 1_000_000, 1_000_000)],
        secondary_source="sec_companyfacts",
    )
    assert result["status"] == "skipped"
