from __future__ import annotations

import pytest

from errors import ApiError
from services.report_service import (
    build_report_context,
    render_analysis_report_html,
    validate_report_scope,
)


def _count_words(text: str) -> int:
    return len([word for word in text.split() if word])


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
        "has_existing_position": False,
        "position_quantity": None,
        "average_entry_price": None,
        "rebalancing_action": "Open new position",
        "position_action": None,
        "new_entry_action": "Allowed with validated entry",
        "position_size_hint": "Use smaller starter size due to high volatility.",
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
                {
                    "field": "market_cap",
                    "method": "price_times_shares_outstanding",
                    "confidence": "high",
                }
            ],
            "stale_data_warning": [],
            "calculation_notes": ["Risk/reward ratio = expected upside / expected downside"],
        },
        "validation_warnings": ["TAKE_PROFIT_RECOMPUTED"],
        "key_reasons_paragraph": (
            (
                "The recommendation is supported by improving earnings visibility, resilient "
                + "margin structure, disciplined balance sheet quality, and a more balanced risk "
                + "reward setup. "
            )
            + (
                "Price momentum remains constructive, but the model still requires confirmation "
                + "from fresh market data and reliable vendor inputs before increasing conviction. "
            )
            + (
                "News flow and catalyst quality should be monitored because valuation "
                + "sensitivity can reduce upside if earnings delivery weakens. "
            )
            + (
                "Position sizing should remain controlled until volatility, liquidity, thesis "
                + "confirmation, entry discipline, and source reliability improve together."
            )
        ),
        "key_reasons": [
            "Improving earnings visibility supports the final recommendation.",
            (
                "Risk reward is more balanced when current price data and technical confirmation "
                + "are available."
            ),
            (
                "Position sizing should remain controlled because volatility and data quality "
                + "still affect conviction."
            ),
        ],
        "key_catalysts": ["News flow and catalyst quality should be monitored for confirmation."],
        "executive_summary": "Summary text.",
        "company_profile": {
            "available": True,
            "ticker": "NVDA",
            "name": "NVIDIA Corporation",
            "currency": "USD",
            "country": "United States",
            "sector": "Technology",
            "industry": "Semiconductors",
            "market_cap": 2_300_000_000_000,
            "employee_count": 36_000,
            "website": "https://www.nvidia.com",
            "shares_outstanding": 24_400_000_000,
            "insider_pct": 0.0425,
            "institution_pct": 0.671,
            "public_pct": 0.2865,
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
            "points": [
                {"date": "2026-05-26", "close": 920.15, "adjusted_close": 920.15, "volume": 1000}
            ],
            "data": [
                {"date": "2026-05-26", "close": 920.15, "adjusted_close": 920.15, "volume": 1000}
            ],
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
            ("unit_note"): (
                "Currency: USD (US Dollar) | Amount figures: in millions (USD Mn) | Percent "
                + "metrics: shown with %"
            ),
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


def _make_news_item(
    prefix: str, index: int, *, high: bool = False, scope: str = "company"
) -> dict[str, object]:
    return {
        "title": f"{prefix} News {index}",
        "source": "Reuters" if high else "MarketAux",
        "publisher": "Reuters" if high else "MarketAux",
        "published_at": f"2026-06-{index:02d}",
        "sentiment": "neutral",
        "impact": "high" if high else "medium",
        "impact_score": 90 + index if high else 50 + index,
        "relevance_score": 90 if high else 70,
        "materiality_category": "corporate_action" if high else "sector",
        "source_confidence_label": "HIGH" if high else "MEDIUM",
        "news_scope": scope,
        "scope_label": scope.replace("_", " ").upper(),
        "impact_reason": f"{prefix} news {index} is included for report testing.",
        "summary": f"{prefix} news summary {index}.",
        "url": f"https://example.com/{prefix.lower().replace(' ', '-')}-{index}",
        "normalized_url": f"example.com/{prefix.lower().replace(' ', '-')}-{index}",
        "normalized_title": f"{prefix.lower()} news {index}",
        "dedupe_key": f"{prefix.lower().replace(' ', '-')}-{index}",
        "is_high_impact": high,
    }


def make_result_with_news(high_count: int = 0, full_count: int = 0) -> dict[str, object]:
    high_items = [
        _make_news_item("High Impact", index + 1, high=True) for index in range(high_count)
    ]
    full_items = [_make_news_item("Full", index + 1, high=False) for index in range(full_count)]
    return _base_result(
        news_impact={
            "available": True,
            "overall_sentiment": "neutral",
            "sentiment_score": 52,
            "high_impact_count": high_count,
            "full_news_count": full_count,
            "news_count": high_count + full_count,
            "deduplicated_count": high_count + full_count,
            "duplicate_excluded_count": 0,
            "high_impact_news": high_items,
            "full_news_list": full_items,
            "data_quality": {
                "status": "available",
                "sources_used": ["Reuters", "MarketAux"],
                "rules": {
                    "high_impact_limited": False,
                    "full_news_limited": False,
                    "high_impact_removed_from_full_list": True,
                },
            },
        },
        related_news={"available": True, "items": []},
    )


def test_report_context_uses_final_decision_and_trade_plan_for_valid_buy():
    report = build_report_context(
        _base_result(llm_decision="Hold", final_decision="Buy", decision="Buy")
    )

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
    assert any(
        row["label"] == "R/R Ratio" and row["value"] == "1:3" for row in report["trade_plan_rows"]
    )
    assert not any(
        row["label"] in {"Price Target", "Risk Per Share", "Reward Per Share"}
        for row in report["trade_plan_rows"]
    )


def test_report_context_contains_disclaimer():
    report = build_report_context(_base_result())

    assert "disclaimer" in report
    assert "automated AI-assisted analysis system" in report["disclaimer"]
    assert "may contain errors, inaccuracies, omissions" in report["disclaimer"]


def test_html_report_renders_disclaimer():
    html = render_analysis_report_html(build_report_context(_base_result()))

    assert "Disclaimer" in html
    assert "automated AI-assisted analysis system" in html
    assert "may contain errors, inaccuracies, omissions" in html
    assert html.rfind("Disclaimer") > html.find("Executive Summary")


def test_report_context_contains_key_reasons_paragraph():
    report = build_report_context(_base_result())

    assert "key_reasons_paragraph" in report
    assert report["key_reasons_paragraph"]
    assert _count_words(report["key_reasons_paragraph"]) >= 75
    assert _count_words(report["key_reasons_paragraph"]) <= 125


def test_html_report_renders_key_reasons_as_paragraph():
    html = render_analysis_report_html(build_report_context(_base_result()))

    assert "Key Reasons" in html
    assert "<h2>Key Reasons</h2>" in html
    key_reason_section = html.split("Key Reasons", 1)[1].split("</section>", 1)[0]
    assert "<ul" not in key_reason_section
    assert '<p class="justified-text">' in key_reason_section


def test_html_report_renders_investment_thesis_as_justified_paragraphs():
    html = render_analysis_report_html(
        build_report_context(
            _base_result(investment_thesis="First thesis paragraph.\nSecond thesis paragraph.")
        )
    )

    assert "investment-thesis" in html
    assert '<p class="justified-text thesis-paragraph">First thesis paragraph.</p>' in html
    assert '<p class="justified-text thesis-paragraph">Second thesis paragraph.</p>' in html


def test_html_report_renders_executive_summary_as_justified_paragraphs():
    html = render_analysis_report_html(
        build_report_context(
            _base_result(executive_summary="First summary paragraph.\n\nSecond summary paragraph.")
        )
    )

    assert '<p class="justified-text summary-paragraph">First summary paragraph.</p>' in html
    assert '<p class="justified-text summary-paragraph">Second summary paragraph.</p>' in html


def test_html_report_renders_dynamic_financial_highlights():
    html = render_analysis_report_html(build_report_context(_base_result()))

    assert "Key Financial Highlights" in html
    assert html.count("Key Financial Highlights") == 1
    assert "FY26Q1" in html
    assert "Revenue" in html
    assert "N/A" in html
    assert "<th>Unit</th>" not in html
    assert "100.0 Mn" in html
    assert "Currency: USD (US Dollar)" in html
    assert "Latest Market Snapshot" in html
    assert "Market &amp; Scale" in html


def test_html_report_succeeds_without_financial_highlights():
    html = render_analysis_report_html(
        build_report_context(_base_result(financial_highlights=None))
    )

    assert "TradingAgent Analysis Report" in html
    assert "Key Financial Highlights" not in html


def test_html_report_renders_trimmed_fundamental_sections_and_optional_peers():
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
                "metric_details": {
                    "base": {"value": 100, "display": "USD 100.00", "status": "calculated"}
                },
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
            quality_of_earnings={
                "metric_details": {"cfo_to_net_income": metric},
                "data_quality": quality,
            },
            balance_sheet_risk={"metric_details": {"der": metric}, "data_quality": quality},
            dividend_quality={
                "metric_details": {"dividend_yield_percent": metric},
                "data_quality": quality,
            },
            peer_comparison={
                "metrics": [
                    {"ticker": "NVDA", "company_name": "NVIDIA Corporation", "pe": "10.00x"}
                ],
                "data_quality": quality,
            },
        )
    )
    html = render_analysis_report_html(report)

    for hidden_heading in (
        "Financial Trend Analysis",
        "Fair Value Range",
        "Bull / Base / Bear Scenario",
    ):
        assert hidden_heading not in html

    for heading in (
        "Valuation Multiples",
        "Quality of Earnings",
        "Balance Sheet Risk",
        "Dividend Quality",
        "Peer Comparison",
    ):
        assert heading in html
    assert 'class="metric-table report-metric-table"' in html
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
    assert [row["label"] for row in report["company_profile_rows"]] == [
        "Company Name",
        "Ticker",
        "Currency",
        "Country",
        "Sector",
        "Industry",
        "Market Cap",
        "Employees",
        "Website",
    ]
    assert "Company Profile" in html
    assert "Accelerated computing platform company." in html
    assert "Executive One" in html
    assert "SHARES &amp; OWNERSHIP" in html
    assert "ownership-pie" in html
    assert "Short Ratio" not in html


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

    report = build_report_context(
        _base_result(ticker="BBCA.JK", market="ID", company_profile=company_profile)
    )

    assert {"label": "Market Cap", "value": "1,205,000.0 IDR Bn"} in report["company_profile_rows"]
    assert {"label": "Shares Outstanding", "value": "123,275,050,000"} in report[
        "shares_ownership_rows"
    ]
    assert all(
        row["label"]
        not in {"Insider Ownership", "Institutional Ownership", "Public/Other Ownership"}
        for row in report["shares_ownership_rows"]
    )
    assert not any(row["label"] == "Current Price" for row in report["company_profile_rows"])


def test_html_report_hides_unavailable_company_profile():
    html = render_analysis_report_html(
        build_report_context(_base_result(company_profile={"available": False, "ticker": "NVDA"}))
    )

    assert "Company Profile" not in html


def test_html_report_renders_ownership_fallback_when_unavailable():
    html = render_analysis_report_html(
        build_report_context(
            _base_result(
                company_profile={
                    "available": True,
                    "ticker": "NVDA",
                    "company_name": "NVIDIA Corporation",
                }
            )
        )
    )

    assert "SHARES &amp; OWNERSHIP" in html
    assert "Ownership chart is not available." in html
    assert '<svg class="ownership-pie"' not in html


def test_html_report_omits_price_chart_summary():
    report = build_report_context(_base_result())
    html = render_analysis_report_html(report)

    assert report["price_chart_rows"][0] == {
        "label": "Window",
        "value": "1 Month Analysis / 60D Price Window",
    }
    assert "Chart &amp; Price Summary" not in html
    assert "Average Volume" not in html


def test_html_report_renders_phase_3_chart_and_news_summaries():
    report = build_report_context(_base_result())
    html = render_analysis_report_html(report)

    assert report["technical_entry_rows"]
    assert report["news_impact_rows"]
    assert report["high_impact_news_items"][0]["title"] == "NVIDIA earnings remain resilient"
    assert report["positive_catalysts"][0]["label"] == "Positive earnings catalyst"
    assert report["analyst_consensus_rows"]
    assert "Technical Entry Quality" not in html
    assert "News Impact Summary" not in html
    assert "Catalyst Tracker" in html
    assert "Analyst Recommendation Trend" in html


def test_report_high_impact_news_is_not_limited():
    result = make_result_with_news(high_count=7, full_count=0)
    report = build_report_context(result)

    assert len(report["high_impact_news_items"]) == 7
    assert report["high_impact_news_items"][6]["title"] == "High Impact News 7"


def test_report_full_news_list_is_not_limited():
    result = make_result_with_news(high_count=0, full_count=11)
    report = build_report_context(result)

    assert len(report["full_news_items"]) == 11
    assert report["full_news_items"][10]["title"] == "Full News 11"


def test_report_excludes_high_impact_from_full_news_items():
    result = make_result_with_news(high_count=1, full_count=2)
    duplicate = dict(result["news_impact"]["high_impact_news"][0])
    duplicate["is_high_impact"] = False
    result["news_impact"]["full_news_list"].append(duplicate)

    report = build_report_context(result)

    high_keys = {item["dedupe_key"] for item in report["high_impact_news_items"]}
    full_keys = {item["dedupe_key"] for item in report["full_news_items"]}
    assert high_keys.isdisjoint(full_keys)


def test_report_does_not_fallback_to_related_when_full_news_list_is_empty():
    result = make_result_with_news(high_count=1, full_count=0)
    result["related_news"] = {
        "items": [{"title": "Legacy duplicate", "url": "https://example.com/legacy"}]
    }
    result["news_impact"]["full_news_list"] = []

    report = build_report_context(result)
    html = render_analysis_report_html(report)

    assert report["full_news_items"] == []
    assert report["related_news_items"] == []
    assert "Legacy duplicate" not in html


def test_html_report_renders_phase_4_risk_data_quality_sections():
    report = build_report_context(_base_result())
    html = render_analysis_report_html(report)

    assert report["risk_summary_rows"]
    assert report["market_risk_rows"]
    assert report["risk_adjusted_return_rows"]
    assert report["thesis_monitor_rows"]
    assert report["vendor_status_rows"]
    assert "Market Risk" in html
    assert "Risk-Adjusted Return" in html
    assert "Risk Summary" not in html
    assert "Thesis Monitor" not in html
    assert "Source Confidence &amp; Data Quality" not in html
    assert "Vendor Status" not in html
    assert "Missing Fields" not in html
    assert "Stale Data Warning" not in html
    assert "Calculation Notes" not in html
    assert "Validation Warnings" not in html
    assert "Data Quality Notes" not in html
    assert "Data quality: partial" not in html
    assert "Data quality: complete" not in html
    assert (
        "Label: expensive. EV/EBITDA is compared with the documented base policy multiple."
        not in html
    )


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

    report = build_report_context(
        _base_result(
            related_news=related_news,
            news_impact={
                "available": True,
                "overall_sentiment": "neutral",
                "sentiment_score": 50,
                "high_impact_news": [],
                "data_quality": {"status": "legacy", "sources_used": ["marketaux"]},
            },
        )
    )
    html = render_analysis_report_html(report)

    assert len(report["full_news_items"]) == 3
    assert "Full News List" not in html
    assert "Related News" not in html
    assert "NVIDIA earnings remain resilient" in html
    assert "https://example.com/nvda" in html
    assert "Open original source" not in html
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

    assert "Market News Context" not in html
    assert "News" in html
    assert "NVIDIA earnings remain resilient" in html
    assert "Selected normalized article. - Impact: N/A - Sentiment: N/A" in html
    assert "newsdata" not in html
    assert "rate_limited" not in html


def test_html_report_renders_strict_news_sections_from_news_context():
    news_context = {
        "decision_company_news": [
            {
                "provider": "marketaux",
                "title": "NVIDIA revenue guidance rises",
                "summary": "NVIDIA raised revenue guidance.",
                "url": "https://example.com/nvda-guidance",
                "source": "MarketAux",
                "published_at": "2026-05-25T09:30:00Z",
                "impact_rule": "high",
                "sentiment_label": "positive",
            }
        ],
        "market_context_news": [
            {
                "provider": "rss_context",
                "title": "Semiconductor shares rally",
                "description": "Sector context improved.",
                "url": "https://example.com/chips",
                "source": "CNBC",
                "published_at": "2026-05-25T10:00:00Z",
                "risk_level": "medium",
                "sentiment": "neutral",
            }
        ],
    }

    report = build_report_context(_base_result(news_context=news_context, news={}))
    html = render_analysis_report_html(report)

    assert [section["title"] for section in report["report_news_sections"]] == [
        "Company News Used for Decision",
        "Market Context News",
    ]
    assert "NVIDIA revenue guidance rises" in html
    assert "NVIDIA raised revenue guidance. - Impact: high - Sentiment: positive" in html
    assert "Semiconductor shares rally" in html
    assert "Sector context improved. - Impact: medium - Sentiment: neutral" in html


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
    assert any(
        row["label"] == "R/R Ratio" and row["value"] == "1:3" for row in report["trade_plan_rows"]
    )
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


def test_pdf_render_blocks_all_external_resources(monkeypatch):
    """WeasyPrint must run with the deny-all url_fetcher, never the default one."""
    import sys
    import types

    from services import report_service

    captured = {}

    class FakeHTML:
        def __init__(self, *, string, url_fetcher=None, **kwargs):
            captured["url_fetcher"] = url_fetcher
            captured["kwargs"] = kwargs

        def write_pdf(self):
            return b"%PDF-1.4\nfake"

    monkeypatch.setitem(sys.modules, "weasyprint", types.SimpleNamespace(HTML=FakeHTML))

    pdf = report_service.render_analysis_report_pdf(build_report_context(_base_result()))

    assert pdf.startswith(b"%PDF")
    fetcher = captured["url_fetcher"]
    assert fetcher is not None, "PDF render must pass a restrictive url_fetcher"
    for url in (
        "https://attacker.example/x.png",
        "file:///etc/passwd",
        "relative/asset.png",
    ):
        with pytest.raises(ValueError):
            fetcher(url)
