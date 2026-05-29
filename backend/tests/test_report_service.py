from __future__ import annotations

import pytest

from errors import ApiError
from services.report_service import build_report_context, validate_report_scope


def _base_result(**overrides):
    result = {
        "request_id": "report-test-1",
        "ticker": "NVDA",
        "market": "US",
        "trade_date": "2026-05-26",
        "analysis_created_at": "2026-05-26T12:00:00Z",
        "current_price": 920.15,
        "current_price_as_of": "2026-05-26",
        "current_price_source": "yfinance:last_close",
        "llm_decision": "Buy",
        "final_decision": "Buy",
        "decision": "Buy",
        "decision_adjusted": False,
        "trade_plan_valid": True,
        "price_target": 1060.15,
        "entry_price": 920.15,
        "stop_loss": 880.15,
        "take_profit": 1040.15,
        "risk_per_share": 40,
        "reward_per_share": 120,
        "risk_reward_display": "1:3",
        "volatility_level": "High",
        "volatility_score": 78,
        "rebalancing_action": "Buy with tight risk control",
        "position_size_hint": "Use smaller size due to High volatility.",
        "data_quality": {
            "price_data": "ok",
            "trade_levels": "recomputed",
            "llm_output": "repaired",
            "volatility_data": "ok",
        },
        "validation_warnings": ["TAKE_PROFIT_RECOMPUTED"],
        "executive_summary": "Summary text.",
    }
    result.update(overrides)
    return result


def test_report_context_uses_final_decision_and_trade_plan_for_valid_buy():
    report = build_report_context(_base_result(llm_decision="Hold", final_decision="Buy", decision="Buy"))

    assert report["decision"] == "Buy"
    assert report["final_decision"] == "Buy"
    assert report["llm_decision"] == "Hold"
    assert report["show_trade_plan"] is True
    assert [row["label"] for row in report["trade_plan_rows"]] == [
        "Current Price",
        "Entry",
        "Stop Loss",
        "Take Profit",
        "Max Drawdown",
        "Volatility",
        "Volatility Score",
        "Rebalancing",
        "Position Action",
        "New Entry Action",
        "Position Size Hint",
        "R/R Ratio",
    ]
    assert any(row["label"] == "R/R Ratio" and row["value"] == "1:3" for row in report["trade_plan_rows"])
    assert not any(row["label"] in {"Price Target", "Risk Per Share", "Reward Per Share"} for row in report["trade_plan_rows"])


def test_report_context_hides_trade_plan_for_hold_even_if_levels_exist():
    report = build_report_context(
        _base_result(
            llm_decision="Buy",
            final_decision="Hold",
            decision="Hold",
            decision_adjusted=True,
            decision_adjusted_reason="Invalid risk reward structure",
            trade_plan_valid=False,
        )
    )

    assert report["show_trade_plan"] is False
    assert report["trade_plan_rows"] == []
    assert report["decision_adjusted"] is True
    assert report["decision_adjusted_reason"] == "Invalid risk reward structure"


def test_report_context_forces_legacy_ratio_to_one_to_three_for_valid_trade_plan():
    report = build_report_context(_base_result(risk_reward_display=None, risk_reward_ratio=5.0))

    assert report["show_trade_plan"] is True
    assert any(row["label"] == "R/R Ratio" and row["value"] == "1:3" for row in report["trade_plan_rows"])
    assert not any(row["value"] in {"1:" + "4", "1:" + "5"} for row in report["trade_plan_rows"])


@pytest.mark.parametrize(
    "payload",
    [
        {"market": "GLOBAL", "ticker": "NVDA"},
        {"market": "US", "ticker": "700.HK"},
        {"market": None, "ticker": "NVDA"},
    ],
)
def test_report_scope_rejects_unsupported_market_or_global_suffix(payload):
    with pytest.raises(ApiError) as exc_info:
        validate_report_scope(payload)

    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "unsupported_report_market"


def test_missing_current_price_adds_warning_without_inventing_price():
    report = build_report_context(
        _base_result(
            current_price=None,
            current_price_as_of=None,
            current_price_source=None,
            final_decision="Hold",
            decision="Hold",
            trade_plan_valid=False,
            data_quality={"price_data": "missing"},
            validation_warnings=[],
        )
    )

    assert report["current_price_display"] == "N/A"
    assert "CURRENT_PRICE_MISSING" in report["validation_warnings"]
    assert report["show_trade_plan"] is False
