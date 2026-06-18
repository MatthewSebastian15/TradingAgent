from __future__ import annotations

import pytest
from tradingagents.data_quality import build_source_confidence
from tradingagents.risk import (
    build_market_risk,
    build_risk_adjusted_return,
    build_risk_data_quality,
)
from tradingagents.risk.thesis_monitor import build_thesis_monitor


def _price_rows() -> list[dict]:
    closes = [100, 104, 102, 108, 95, 98, 101, 106, 103, 110, 107, 111, 109, 115, 113]
    rows = []
    for index, close in enumerate(closes, start=1):
        rows.append(
            {
                "date": f"2026-05-{index:02d}",
                "open": close - 1,
                "high": close + 2,
                "low": close - 3,
                "close": close,
                "volume": 1_000_000,
            }
        )
    return rows


def test_market_risk_calculates_volatility_drawdown_atr_and_bucket():
    risk = build_market_risk(
        {"available": True, "data": _price_rows()},
        {},
        {"atr": None},
    )

    assert risk["volatility_percent"] > 0
    assert risk["max_drawdown_percent"] < 0
    assert risk["atr"] > 0
    assert risk["price_range_percent"] > 0
    assert risk["risk_bucket"] in {"low", "medium", "high"}


def test_risk_adjusted_return_uses_action_plan_and_labels_attractive():
    payload = build_risk_adjusted_return(
        {
            "current_price": 100,
            "take_profit": 130,
            "stop_loss": 90,
            "scenario_analysis": {"base": {"fair_value": 120}, "bear": {"fair_value": 80}},
        }
    )

    assert payload["upside_percent"] == pytest.approx(30)
    assert payload["downside_percent"] == pytest.approx(-10)
    assert payload["risk_reward_ratio"] == "3.0x"
    assert payload["expected_return_label"] == "attractive"


def test_thesis_monitor_marks_stop_loss_break_as_invalidated():
    monitor = build_thesis_monitor(
        {
            "current_price": 80,
            "stop_loss": 90,
            "financial_trends": {
                "metrics": {"revenue_growth_percent": [10], "net_profit_margin_percent": [20]}
            },
            "balance_sheet_risk": {"der": 0.5},
            "quality_of_earnings": {"cfo_to_net_income": 1.1},
            "fair_value_range": {"bull": 120},
            "catalyst_tracker": {"negative_catalysts": []},
        },
        data_quality_score=90,
    )

    assert monitor["overall_thesis_status"] == "invalidated"
    assert any(
        item["category"] == "Price" and item["status"] == "invalidated"
        for item in monitor["checklist"]
    )


def test_source_confidence_score_drops_when_missing_fields_increase():
    base = {
        "trade_date": "2026-05-18",
        "current_price_as_of": "2026-05-18",
        "data_quality": {"price_data": "ok", "fundamentals": "ok", "news": "ok"},
        "financial_highlights": {
            "unit_note": "Currency: USD",
            "periods": [{"key": "FY25"}],
            "sections": [{"key": "market_scale", "rows": []}],
            "rows": [
                {
                    "key": "ebitda",
                    "values": {"FY25": {"value": 10, "display": "10", "status": "reported"}},
                },
                {
                    "key": "payout_ratio",
                    "values": {"FY25": {"value": 20, "display": "20%", "status": "reported"}},
                },
            ],
        },
        "fair_value_range": {"data_quality": {"status": "complete", "missing_fields": []}},
        "vendor_attempts": {
            "quote": ["yfinance:success"],
            "news": ["marketaux:success", "newsdata:success"],
        },
    }
    degraded = {
        **base,
        "data_quality": {"price_data": "missing", "fundamentals": "partial", "news": "unavailable"},
        "financial_highlights": {
            **base["financial_highlights"],
            "unit_note": None,
            "sections": [],
            "rows": [
                {
                    "key": "ebitda",
                    "values": {"FY25": {"value": None, "display": "N/A", "status": "unavailable"}},
                }
            ],
        },
        "vendor_attempts": {"quote": ["yfinance:unavailable"], "news": ["newsdata:rate_limited"]},
    }

    base_score = build_source_confidence(base)["data_quality"]["score"]
    degraded_payload = build_source_confidence(degraded)

    assert degraded_payload["data_quality"]["score"] < base_score
    assert degraded_payload["vendor_status"]["newsdata"]["status"] == "rate_limited"
    assert degraded_payload["vendor_status"]["yfinance"]["status"] == "unavailable"
    assert any(item["field"] == "ebitda" for item in degraded_payload["missing_fields"])


def test_risk_data_quality_combined_contract_contains_final_sections():
    payload = build_risk_data_quality(
        {
            "trade_date": "2026-05-18",
            "current_price": 100,
            "current_price_as_of": "2026-05-18",
            "take_profit": 130,
            "stop_loss": 90,
            "data_quality": {"price_data": "ok", "fundamentals": "ok", "news": "ok"},
            "price_chart": {"available": True, "data": _price_rows()},
            "price_performance": {},
            "technical_entry": {"entry_quality": "neutral", "atr": 5},
            "balance_sheet_risk": {
                "risk_level": "low",
                "metric_details": {"der": {"display": "0.5x"}},
            },
            "quality_of_earnings": {"rating": "healthy"},
            "fair_value_range": {"base": 110, "bull": 130, "bear": 80},
            "scenario_analysis": {"base": {"fair_value": 110}, "bear": {"fair_value": 80}},
            "catalyst_tracker": {"negative_catalysts": [], "upcoming_events": []},
            "financial_highlights": {
                "unit_note": "Currency: USD",
                "periods": [{"key": "FY25"}],
                "rows": [],
            },
        },
        {"vendor_attempts": {"quote": ["yfinance:success"]}},
    )

    assert set(payload).issuperset(
        {
            "risk_summary",
            "balance_sheet_risk_summary",
            "market_risk",
            "risk_adjusted_return",
            "thesis_monitor",
            "catalyst_risk",
            "data_quality",
            "vendor_status",
            "missing_fields",
            "fallback_used",
            "stale_data_warning",
            "calculation_notes",
        }
    )
