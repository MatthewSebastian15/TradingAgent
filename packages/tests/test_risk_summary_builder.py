from tradingagents.risk.risk_summary_builder import (
    build_balance_sheet_risk_summary,
    build_catalyst_risk,
    build_risk_data_quality,
    build_risk_summary,
)


def test_balance_sheet_summary_missing_payload():
    summary = build_balance_sheet_risk_summary(None)
    assert summary["der"] == "N/A"
    assert summary["risk_level"] == "N/A"
    assert "unavailable" in summary["interpretation"]


def test_balance_sheet_summary_uses_metric_display():
    summary = build_balance_sheet_risk_summary(
        {
            "risk_level": "high",
            "metric_details": {
                "der": {"display": "2.50x", "status": "calculated"},
                "net_debt": {"display": "1.0 B", "status": "estimated"},
            },
        }
    )
    assert summary["der"] == "2.50x"
    assert summary["net_debt"] == "1.0 B EST"
    assert summary["risk_level"] == "high"


def test_catalyst_risk_collects_and_dedupes():
    result = {
        "catalyst_tracker": {
            "negative_catalysts": [{"label": "Downgrade", "related_news_title": "Bad news"}],
            "upcoming_events": [{"label": "Earnings", "date": "2026-07-10"}],
        },
        "news_impact": {
            "high_impact_news": [
                {"sentiment": "negative", "title": "Bad news"},  # dup of catalyst reason
                {"sentiment": "negative", "title": "Fresh negative"},
                {"sentiment": "positive", "title": "Good news"},
            ]
        },
    }
    items = build_catalyst_risk(result)
    reasons = [item["reason"] for item in items]
    assert "Bad news" in reasons
    assert "Fresh negative" in reasons
    assert reasons.count("Bad news") == 1
    assert all("Good news" not in reason for reason in reasons)


def test_risk_summary_scores_and_bounds():
    low = build_risk_summary(
        {},
        market_risk={},
        source_confidence={"data_quality": {"score": 90}},
        catalyst_risk=[],
    )
    assert low["overall_risk"] == "low"
    assert low["risk_score"] == 0
    assert low["main_risks"]  # non-empty default message

    high = build_risk_summary(
        {
            "balance_sheet_risk": {"risk_level": "high"},
            "quality_of_earnings": {"rating": "weak"},
            "technical_entry": {"entry_quality": "risky"},
            "fair_value_range": {"base": 10.0},
            "current_price": 20.0,
        },
        market_risk={"risk_bucket": "high"},
        source_confidence={"data_quality": {"score": 40}},
        catalyst_risk=[{"impact": "high"}],
    )
    assert high["overall_risk"] == "high"
    assert 0 <= high["risk_score"] <= 100
    assert "High leverage" in high["main_risks"]


def test_build_risk_data_quality_smoke_on_empty_result():
    payload = build_risk_data_quality({})
    assert set(payload) >= {
        "risk_summary",
        "balance_sheet_risk_summary",
        "market_risk",
        "catalyst_risk",
    }
    assert payload["risk_summary"]["overall_risk"] in {"low", "moderate", "high"}
