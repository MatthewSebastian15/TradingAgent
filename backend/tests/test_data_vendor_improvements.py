from __future__ import annotations

from tradingagents.dataflows.data_completeness import calculate_completeness
from tradingagents.dataflows.fundamental_calculator import calculate_derived_fundamentals
from tradingagents.dataflows.fundamental_gap_mapper import map_fundamental_gaps
from tradingagents.dataflows.news_impact import classify_news_impact
from tradingagents.dataflows.news_relevance import score_news_relevance
from tradingagents.dataflows.normalizers import normalize_financial_value
from tradingagents.dataflows.source_priority import get_field_vendor_order
from tradingagents.dataflows.technical_calculator import calculate_technical_fallback
from tradingagents.dataflows.validators import validate_price_consistency


def test_idx_insider_uses_yfinance_first():
    assert get_field_vendor_order("insider_transactions", "BBCA.JK")[:3] == [
        "yfinance",
        "alpha_vantage",
        "finnhub",
    ]


def test_normalize_financial_value_multiplies_units():
    normalized = normalize_financial_value(106_000_000, "million", "idr")
    assert normalized["normalized_value"] == 106_000_000_000_000
    assert normalized["normalized_currency"] == "IDR"


def test_cross_vendor_price_warning():
    warnings = validate_price_consistency({"yfinance": 100, "finnhub": 108})
    assert warnings and "Price mismatch" in warnings[0]


def test_derived_fundamentals_calculates_growth_and_fcf():
    rows = calculate_derived_fundamentals(
        [
            {"period_end": "2023-12-31", "revenue": 100, "net_profit": 10},
            {
                "period_end": "2024-12-31",
                "revenue": 125,
                "net_profit": 15,
                "operating_cash_flow": 30,
                "capex": 5,
            },
        ]
    )
    assert rows[-1]["revenue_growth_percent"] == 25
    assert rows[-1]["free_cash_flow"] == 25


def test_technical_fallback_calculates_sma():
    history = [{"close": index} for index in range(1, 211)]
    result = calculate_technical_fallback(history)
    assert result["sma_50"] == sum(range(161, 211)) / 50
    assert result["sma_200"] == sum(range(11, 211)) / 200


def test_news_relevance_and_impact_rules_for_goto():
    article = {
        "title": "GoTo announces rights issue plan",
        "summary": "GoTo Gojek Tokopedia raises funding after earnings release.",
        "event_type": "rights_issue",
    }
    relevance = score_news_relevance(article, "GOTO.JK", "GoTo Gojek Tokopedia")
    impact = classify_news_impact({**article, **relevance})
    assert relevance["category"] == "company_specific"
    assert impact["impact_rule"] == "HIGH"


def test_gap_mapper_and_completeness_report():
    gaps = map_fundamental_gaps({"sma_50": 100, "sma_200": 90})
    assert any(item["field"] == "dividend_yield" for item in gaps["gaps"])
    report = calculate_completeness({"quote": 1, "historical_price": "rows", "company_news": "news"})
    assert report["price_data"]["available_fields"] >= 2
