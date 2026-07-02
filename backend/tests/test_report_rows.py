"""Unit tests for services/report/rows.py — row normalization."""

from __future__ import annotations

from services.report.rows import (
    _risk_summary_rows,
    _simple_payload_rows,
    _thesis_monitor_rows,
    _trade_plan_rows,
    _validation_rows,
    _vendor_status_rows,
)


def test_trade_plan_rows_full_plan():
    result = {
        "current_price": 100.0,
        "entry_price": 98.5,
        "stop_loss": 95.0,
        "take_profit": 109.0,
        "max_drawdown_estimate": "5-8%",
        "volatility_level": "medium",
        "volatility_score": 42,
        "rebalancing_action": "Maintain position",
        "position_action": None,
        "new_entry_action": "Enter at support",
        "position_size_hint": "5% allocation",
        "risk_reward_display": "1:3",
    }
    rows = _trade_plan_rows(result, "AAPL", "US")
    by_label = {row["label"]: row["value"] for row in rows}
    assert by_label["Current Price"] == "$100"
    assert by_label["Entry"] == "$98.5"
    assert by_label["Stop Loss"] == "$95"
    assert by_label["Take Profit"] == "$109"
    assert by_label["Position Action"] == "N/A"  # null → safe display, no KeyError
    assert by_label["R/R Ratio"] == "1:3"


def test_trade_plan_rows_empty_result_no_keyerror():
    rows = _trade_plan_rows({}, "AAPL", "US")
    assert len(rows) == 12
    assert all(row["value"] == "N/A" for row in rows)


def test_validation_rows_reads_data_quality():
    report = {
        "current_price_source": "yfinance",
        "current_price_as_of": "2026-07-01",
        "data_quality": {"price_data": "ok", "news": "partial"},
    }
    rows = _validation_rows({"analysis_depth": "balanced"}, report)
    by_label = {row["label"]: row["value"] for row in rows}
    assert by_label["Price Data"] == "ok"
    assert by_label["News Status"] == "partial"
    assert by_label["Trade Levels Status"] == "N/A"
    assert by_label["Analysis Depth"] == "balanced"


def test_simple_payload_rows_with_percent_coercion():
    rows = _simple_payload_rows(
        {"roe": 15.5, "name": "ACME"},
        [("roe", "ROE"), ("name", "Name"), ("missing", "Missing")],
        percent_keys={"roe"},
    )
    assert rows == [
        {"label": "ROE", "value": "15.5%"},
        {"label": "Name", "value": "ACME"},
        {"label": "Missing", "value": "N/A"},
    ]
    assert _simple_payload_rows({}, [("a", "A")]) == []


def test_risk_summary_rows_empty_and_populated():
    assert _risk_summary_rows({}) == []
    rows = _risk_summary_rows(
        {
            "risk_summary": {
                "overall_risk": "medium",
                "risk_score": 55,
                "main_risks": ["liquidity"],
                "risk_flags": [],
                "risk_explanation": "explained",
            }
        }
    )
    by_label = {row["label"]: row["value"] for row in rows}
    assert by_label["Overall Risk"] == "medium"
    assert by_label["Main Risks"] == "liquidity"
    assert by_label["Risk Flags"] == "N/A"


def test_thesis_monitor_rows_skips_non_dict_items():
    rows = _thesis_monitor_rows(
        {
            "thesis_monitor": {
                "overall_thesis_status": "intact",
                "checklist": [
                    {"category": "Growth", "condition": "Rev > 5%", "status": "ok", "reason": "r"},
                    "not-a-dict",
                ],
            }
        }
    )
    assert rows[0]["category"] == "Overall"
    assert rows[1]["category"] == "Growth"
    assert len(rows) == 2


def test_vendor_status_rows():
    rows = _vendor_status_rows(
        {"vendor_status": {"yfinance": {"status": "ok", "used_for": ["price"]}}}
    )
    assert rows == [
        {"vendor": "yfinance", "status": "ok", "used_for": "price", "missing_fields": "N/A"}
    ]
    assert _vendor_status_rows({}) == []
