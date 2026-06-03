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
        "risk_data_quality": {
            "risk_summary": {
                "overall_risk": "moderate",
                "risk_score": 58,
                "main_risks": ["Moderate volatility"],
                "risk_flags": ["Use disciplined entry levels"],
                "risk_explanation": "Risk is manageable but should be monitored.",
            },
            "balance_sheet_risk_summary": {
                "der": "0.5x",
                "net_debt": "USD 1,000 Mn",
                "debt_to_ebitda": "1.2x",
                "cash_ratio": "0.4x",
                "risk_level": "low",
                "interpretation": "Leverage appears manageable.",
            },
            "market_risk": {
                "volatility_percent": 24.5,
                "max_drawdown_percent": -12.8,
                "atr": 12.5,
                "price_range_percent": 14.6,
                "risk_bucket": "medium",
                "notes": ["Volatility is moderate for the selected window."],
            },
            "risk_adjusted_return": {
                "upside_percent": 13.04,
                "downside_percent": -4.35,
                "risk_reward_ratio": "3.0x",
                "expected_return_label": "attractive",
                "notes": ["Upside is around three times the downside anchor."],
            },
            "thesis_monitor": {
                "overall_thesis_status": "valid",
                "checklist": [
                    {
                        "category": "Price",
                        "condition": "Price breaks stop loss",
                        "status": "valid",
                        "reason": "Current price remains above stop loss.",
                    }
                ],
            },
            "catalyst_risk": [
                {
                    "type": "earnings",
                    "label": "Upcoming earnings risk",
                    "impact": "medium",
                    "date": "2026-06-20",
                    "source": "Finnhub",
                    "reason": "Upcoming event may increase short-term volatility.",
                }
            ],
            "data_quality": {
                "score": 86,
                "confidence": "high",
                "summary": "Most critical financial, price, and news data were available.",
                "score_breakdown": {
                    "price_data": 95,
                    "financial_data": 85,
                    "valuation_data": 80,
                    "news_data": 75,
                    "vendor_success": 90,
                    "freshness": 88,
                },
            },
            "vendor_status": {
                "yfinance": {"status": "success", "used_for": ["price"], "missing_fields": []},
                "newsdata": {"status": "rate_limited", "used_for": [], "missing_fields": ["news"]},
            },
            "missing_fields": [
                {
                    "module": "financial_highlights",
                    "field": "payout_ratio",
                    "impact": "low",
                    "fallback_available": False,
                }
            ],
            "fallback_used": [
                {"field": "market_cap", "method": "price_times_shares_outstanding", "confidence": "high"}
            ],
            "stale_data_warning": [],
            "calculation_notes": ["Risk/reward ratio = expected upside / expected downside"],
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
            "currency": "USD",
            "window": "1M",
            "window_label": "1 Month Analysis / 60D Price Window",
            "lookback_days": 60,
            "points": [{"date": "2026-05-26", "close": 920.15, "adjusted_close": 920.15, "volume": 1000}],
            "data": [{"date": "2026-05-26", "close": 920.15, "adjusted_close": 920.15, "volume": 1000}],
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
            "summary": {
                "period_return_percent": 2.24,
                "period_high": 930.0,
                "period_low": 880.0,
                "max_drawdown_percent": -4.1,
                "average_volume": 1000,
                "latest_volume": 1100,
                "latest_close": 920.15,
                "volume_trend": "above_average",
                "performance_label": "positive",
            },
            "data_quality": {"status": "complete", "missing_fields": []},
        },
        "price_performance": {
            "period_return_percent": 2.24,
            "period_high": 930.0,
            "period_low": 880.0,
            "max_drawdown_percent": -4.1,
            "average_volume": 1000,
            "latest_volume": 1100,
            "latest_close": 920.15,
            "volume_trend": "above_average",
            "performance_label": "positive",
        },
        "technical_entry": {
            "available": True,
            "entry_quality": "neutral",
            "trend": "uptrend",
            "rsi": 58.2,
            "rsi_signal": "neutral",
            "macd": 4.5,
            "macd_signal_value": 3.8,
            "macd_signal": "bullish",
            "atr": 12.5,
            "sma_20": 910.0,
            "sma_50": 890.0,
            "sma_200": None,
            "support": 880.0,
            "resistance": 940.0,
            "volume_trend": "above_average",
            "reasons": ["Price is above the 20-day moving average."],
            "data_quality": {"status": "partial", "missing_fields": ["sma_200"]},
        },
        "news_impact": {
            "available": True,
            "overall_sentiment": "positive",
            "sentiment_score": 68,
            "high_impact_news": [
                {
                    "title": "NVIDIA earnings remain resilient",
                    "source": "MarketAux",
                    "published_at": "2026-05-25",
                    "sentiment": "positive",
                    "impact": "high",
                    "impact_score": 84,
                    "summary": "Selected vendor article.",
                    "url": "https://example.com/nvda",
                }
            ],
            "full_news_list": [],
            "news_count": 2,
            "deduplicated_count": 1,
            "data_quality": {"status": "complete", "sources_used": ["MarketAux"]},
        },
        "catalyst_tracker": {
            "positive_catalysts": [
                {
                    "type": "earnings",
                    "label": "Positive earnings catalyst",
                    "impact": "high",
                    "source": "MarketAux",
                    "date": "2026-05-25",
                    "related_news_title": "NVIDIA earnings remain resilient",
                }
            ],
            "negative_catalysts": [],
            "upcoming_events": [
                {
                    "type": "earnings",
                    "label": "Upcoming quarterly earnings",
                    "date": "2026-06-20",
                    "source": "Finnhub",
                }
            ],
            "summary": {
                "overall_catalyst_bias": "positive",
                "main_message": "Positive catalysts outweigh current negative catalysts.",
            },
        },
        "analyst_consensus": {
            "available": True,
            "period": "2026-05",
            "strong_buy": 4,
            "buy": 8,
            "hold": 5,
            "sell": 1,
            "strong_sell": 0,
            "total": 18,
            "consensus_label": "positive",
            "trend": "improving",
            "data_quality": {"status": "complete", "source": "Finnhub"},
        },
        "financial_highlights": {
            "title": "Key Financial Highlights",
            "unit_note": "Currency: USD (US Dollar) | Amount figures: in millions (USD Mn) | Percent metrics: shown with %",
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
            "point_in_time": [
                {
                    "key": "market_cap",
                    "label": "Market Cap",
                    "display": "2,300,000.0",
                    "unit": "USD Mn",
                    "status": "reported",
                }
            ],
            "sections": [
                {
                    "key": "market_scale",
                    "title": "Market & Scale",
                    "rows": [
                        {
                            "key": "revenue",
                            "label": "Revenue",
                            "unit": "USD Mn",
                            "values": {
                                "FY25": {"display": "100.0", "status": "reported"},
                                "FY26Q1": {"display": "N/A", "status": "unavailable"},
                            },
                        }
                    ],
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
    assert not any(
        row["label"] in {"Price Target", "Risk Per Share", "Reward Per Share"} for row in report["trade_plan_rows"]
    )


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
    assert "Currency: USD (US Dollar)" in html
    assert "Latest Market Snapshot" in html
    assert "Market &amp; Scale" in html


def test_html_report_succeeds_without_financial_highlights():
    html = render_analysis_report_html(build_report_context(_base_result(financial_highlights=None)))

    assert "TradingAgent Analysis Report" in html
    assert "Key Financial Highlights" not in html


def test_html_report_renders_phase_2_fundamental_sections_and_optional_peers():
    metric = {"value": 10, "display": "10.00x", "status": "calculated", "formula": "Mock formula"}
    quality = {"status": "complete", "missing_fields": [], "fallback_used": [], "warnings": []}
    report = build_report_context(
        _base_result(
            financial_trends={
                "periods": [{"key": "FY25", "label": "FY25"}],
                "metric_details": {"revenue": [{"display": "100.0", "status": "reported"}]},
                "data_quality": quality,
            },
            valuation_multiples={
                "metric_details": {"pe": metric},
                "interpretation": {"valuation_label": "fair", "main_reason": "Policy comparison."},
                "data_quality": quality,
            },
            fair_value_range={
                "primary_method": "P/E",
                "metric_details": {"base": {"value": 100, "display": "USD 100.00", "status": "calculated"}},
                "data_quality": quality,
            },
            scenario_analysis={
                "bear": {
                    "fair_value_display": "USD 80.00",
                    "upside_downside_display": "-20.00%",
                    "valuation_multiple": "10.0x P/E",
                    "assumption": "Lower growth",
                }
            },
            quality_of_earnings={"metric_details": {"cfo_to_net_income": metric}, "data_quality": quality},
            balance_sheet_risk={"metric_details": {"der": metric}, "data_quality": quality},
            dividend_quality={"metric_details": {"dividend_yield_percent": metric}, "data_quality": quality},
            peer_comparison={
                "metrics": [{"ticker": "NVDA", "company_name": "NVIDIA Corporation", "pe": "10.00x"}],
                "data_quality": quality,
            },
        )
    )
    html = render_analysis_report_html(report)

    for heading in (
        "Financial Trend Analysis",
        "Valuation Multiples",
        "Fair Value Range",
        "Bull / Base / Bear Scenario",
        "Quality of Earnings",
        "Balance Sheet Risk",
        "Dividend Quality",
        "Peer Comparison",
    ):
        assert heading in html
    assert report["peer_comparison_rows"][0]["ticker"] == "NVDA"


def test_html_report_hides_peer_comparison_without_payload():
    html = render_analysis_report_html(build_report_context(_base_result(peer_comparison=None)))

    assert "Peer Comparison" not in html


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


def test_html_report_formats_canonical_company_profile_metrics():
    company_profile = {
        "available": True,
        "ticker": "BBCA.JK",
        "company_name": "PT Bank Central Asia Tbk",
        "currency": "IDR",
        "market_cap": 1_205_000_000_000_000,
        "shares_outstanding": 123_275_050_000,
        "current_price": 9_800,
    }

    report = build_report_context(_base_result(ticker="BBCA.JK", market="ID", company_profile=company_profile))

    assert {"label": "Market Cap", "value": "1,205,000.0 IDR Bn"} in report["company_profile_rows"]
    assert {"label": "Shares Outstanding", "value": "123,275,050,000"} in report["company_profile_rows"]
    assert {"label": "Current Price", "value": "Rp 9,800"} in report["company_profile_rows"]


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


def test_html_report_renders_phase_3_chart_and_news_summaries():
    report = build_report_context(_base_result())
    html = render_analysis_report_html(report)

    assert report["technical_entry_rows"]
    assert report["news_impact_rows"]
    assert report["high_impact_news_items"][0]["title"] == "NVIDIA earnings remain resilient"
    assert report["positive_catalysts"][0]["label"] == "Positive earnings catalyst"
    assert report["analyst_consensus_rows"]
    assert "Technical Entry Quality" in html
    assert "News Impact Summary" in html
    assert "Catalyst Tracker" in html
    assert "Analyst Recommendation Trend" in html


def test_html_report_renders_phase_4_risk_data_quality_sections():
    report = build_report_context(_base_result())
    html = render_analysis_report_html(report)

    assert report["risk_summary_rows"]
    assert report["market_risk_rows"]
    assert report["risk_adjusted_return_rows"]
    assert report["thesis_monitor_rows"]
    assert report["vendor_status_rows"]
    assert "Risk Summary" in html
    assert "Market Risk" in html
    assert "Risk-Adjusted Return" in html
    assert "Thesis Monitor" in html
    assert "Source Confidence &amp; Data Quality" in html
    assert "Vendor Status" in html
    assert "Calculation Notes" in html


def test_html_report_hides_unavailable_price_chart_summary():
    html = render_analysis_report_html(
        build_report_context(_base_result(price_chart={"available": False, "ticker": "NVDA"}))
    )

    assert "Chart &amp; Price Summary" not in html


def test_html_report_renders_related_news_with_safe_original_vendor_links_only():
    related_news = {
        "available": True,
        "summary": "Top related news.",
        "items": [
            {
                "title": "NVIDIA earnings remain resilient",
                "publisher": "Reuters",
                "published_at": "2026-05-25T09:30:00Z",
                "source": "marketaux",
                "event_type": "earnings",
                "summary": "Selected vendor article.",
                "relevance_reason": "Related to earnings assumptions.",
                "url": "https://example.com/nvda",
            },
            {
                "title": "Missing original source",
                "url": None,
            },
            {
                "title": "Unsafe original source",
                "url": "javascript:alert(1)",
            },
        ],
    }

    report = build_report_context(_base_result(related_news=related_news))
    html = render_analysis_report_html(report)

    assert len(report["related_news_items"]) == 3
    assert "Related News" in html
    assert "NVIDIA earnings remain resilient" in html
    assert "Open original source" in html
    assert "Missing original source" in html
    assert "Unsafe original source" in html
    assert "javascript:" not in html


@pytest.mark.parametrize(
    "unsafe_url",
    [
        "javascript:alert(document.domain)",
        "data:text/html,<script>alert(1)</script>",
        "https:///missing-host",
    ],
)
def test_html_report_renders_normalized_news_text_without_unsafe_link(unsafe_url):
    news = {
        "articles": [
            {
                "provider": "marketaux",
                "title": "Unsafe vendor article",
                "url": unsafe_url,
            }
        ],
    }

    report = build_report_context(_base_result(news=news))
    html = render_analysis_report_html(report)

    assert report["news_articles"][0]["url"] is None
    assert "Unsafe vendor article" in html
    assert unsafe_url not in html


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
