from tradingagents.data_quality.source_confidence_builder import build_source_confidence

EXPECTED_KEYS = {
    "data_quality",
    "vendor_status",
    "missing_fields",
    "fallback_used",
    "stale_data_warning",
    "calculation_notes",
}


def test_empty_result_shape_and_bounds():
    payload = build_source_confidence({})
    assert EXPECTED_KEYS <= set(payload)
    quality = payload["data_quality"]
    assert 0 <= quality["score"] <= 100
    assert quality["confidence"] in {"high", "medium", "low", "very_low"}
    assert set(quality["score_breakdown"]) == {
        "price_data",
        "financial_data",
        "valuation_data",
        "news_data",
        "vendor_success",
        "freshness",
    }


def test_complete_data_scores_higher_than_empty():
    complete = build_source_confidence(
        {
            "data_quality": {"price_data": "ok", "fundamentals": "ok", "news": "ok"},
            "fair_value_range": {"data_quality": {"status": "complete"}},
        }
    )
    empty = build_source_confidence({})
    assert complete["data_quality"]["score"] > empty["data_quality"]["score"]
    breakdown = complete["data_quality"]["score_breakdown"]
    assert breakdown["price_data"] == 95
    assert breakdown["valuation_data"] == 95
    # freshness and financial_data are reduced by inferred stale/missing entries
    assert 0 < breakdown["freshness"] <= 100
    assert 0 < breakdown["financial_data"] <= 95


def test_missing_and_fallback_reported_from_section_quality():
    payload = build_source_confidence(
        {
            "fair_value_range": {
                "data_quality": {
                    "status": "partial",
                    "missing_fields": ["base"],
                    "fallback_used": ["EBITDA estimated from operating income"],
                }
            }
        }
    )
    assert payload["missing_fields"]
    assert payload["fallback_used"]
    partial_score = payload["data_quality"]["score_breakdown"]["valuation_data"]
    assert partial_score < 95
