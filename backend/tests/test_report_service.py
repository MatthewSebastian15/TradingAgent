from __future__ import annotations

import pytest

from errors import ApiError
from services.report_service import build_report_context, render_analysis_report_html, validate_report_scope


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
        "company_profile": {
            "available": True,
            "ticker": "NVDA",
            "name": "NVIDIA Corporation",
            "sector": "Technology",
            "industry": "Semiconductors",
            "description": "Accelerated computing platform company.",
            "executives": [{"name": "Executive One", "title": "CEO"}],
        },
        "price_chart": {
            "available": True,
            "source": "yfinance",
            "ticker": "NVDA",
            "trade_date": "2026-05-26",
            "window_label": "1 Month Analysis / 60D Price Window",
            "lookback_days": 60,
            "points": [{"date": "2026-05-26", "close": 920.15, "volume": 1000}],
            "stats": {
                "start_price": 900.0,
                "end_price": 920.15,
                "change_percent": 2.24,
                "high": 930.0,
                "low": 880.0,
                "average_close": 910.25,
                "average_volume": 1000,
                "point_count": 2,
            },
        },
        "financial_highlights": {
            "title": "Key Financial Highlights",
            "periods": [
                {"key": "FY25", "label": "FY25", "type": "annual", "year": 2025, "quarter": None},
                {"key": "FY26Q1", "label": "FY26Q1", "type": "quarter", "year": 2026, "quarter": 1},
            ],
            "rows": [
                {
                    "key": "revenue",
                    "label": "Revenue",
                    "unit": "USD Bn",
                    "values": {
                        "FY25": {"display": "100.0", "status": "reported"},
                        "FY26Q1": {"display": "N/A", "status": "unavailable"},
                    },
                }
            ],
        },
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


def test_report_context_contains_disclaimer():
    report = build_report_context(_base_result())

    assert "disclaimer" in report
    assert "automated AI-assisted analysis engine" in report["disclaimer"]
    assert "may contain errors" in report["disclaimer"]


def test_html_report_renders_disclaimer():
    html = render_analysis_report_html(build_report_context(_base_result()))

    assert "Disclaimer" in html
    assert "automated AI-assisted analysis engine" in html
    assert "may contain errors" in html


def test_html_report_renders_dynamic_financial_highlights():
    html = render_analysis_report_html(build_report_context(_base_result()))

    assert "Key Financial Highlights" in html
    assert html.count("Key Financial Highlights") == 1
    assert "FY26Q1" in html
    assert "Revenue" in html
    assert "N/A" in html


def test_html_report_succeeds_without_financial_highlights():
    html = render_analysis_report_html(build_report_context(_base_result(financial_highlights=None)))

    assert "TradingAgent Analysis Report" in html
    assert "Key Financial Highlights" not in html


def test_html_report_renders_company_profile():
    report = build_report_context(_base_result())
    html = render_analysis_report_html(report)

    assert report["company_profile_rows"][0] == {
        "label": "Company Name",
        "value": "NVIDIA Corporation",
    }
    assert report["company_profile_executives"] == [{"name": "Executive One", "title": "CEO"}]
    assert "Company Profile" in html
    assert "Accelerated computing platform company." in html
    assert "Executive One" in html


def test_html_report_hides_unavailable_company_profile():
    html = render_analysis_report_html(
        build_report_context(_base_result(company_profile={"available": False, "ticker": "NVDA"}))
    )

    assert "Company Profile" not in html


def test_html_report_renders_price_chart_summary():
    report = build_report_context(_base_result())
    html = render_analysis_report_html(report)

    assert report["price_chart_rows"][0] == {
        "label": "Window",
        "value": "1 Month Analysis / 60D Price Window",
    }
    assert "Chart &amp; Price Summary" in html
    assert "Average Volume" in html


def test_html_report_hides_unavailable_price_chart_summary():
    html = render_analysis_report_html(
        build_report_context(_base_result(price_chart={"available": False, "ticker": "NVDA"}))
    )

    assert "Chart &amp; Price Summary" not in html


def test_html_report_renders_same_normalized_news_payload():
    news = {
        "ticker": "NVDA",
        "provider_status": {"marketaux": "success", "newsdata": "rate_limited"},
        "articles": [
            {
                "provider": "marketaux",
                "title": "NVIDIA earnings remain resilient",
                "summary": "Selected normalized article.",
                "url": "https://example.com/nvda",
                "source": "example.com",
                "published_at": "2026-05-25T09:30:00Z",
                "relevance_score": 92,
            }
        ],
    }

    html = render_analysis_report_html(build_report_context(_base_result(news=news)))

    assert "Market News Context" in html
    assert "NVIDIA earnings remain resilient" in html
    assert "newsdata" in html
    assert "rate_limited" in html


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
