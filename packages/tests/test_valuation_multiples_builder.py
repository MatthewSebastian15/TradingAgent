from tradingagents.fundamentals.valuation_multiples_builder import build_valuation_multiples

SNAPSHOT = {
    "currency": "USD",
    "sector": "Technology",
    "industry": "Software",
    "market_cap": 1000.0,
    "market_cap_status": "reported",
    "market_cap_formula": "Reported period market cap",
    "total_debt": 200.0,
    "cash": 100.0,
    "ebitda": 150.0,
    "net_profit": 100.0,
    "total_equity": 500.0,
    "revenue": 800.0,
    "shares_outstanding": 100.0,
    "eps": 1.0,
    "bvps": 5.0,
    "current_price": 10.0,
}


def test_multiples_from_full_snapshot():
    result = build_valuation_multiples(SNAPSHOT)
    assert result["market_cap"] == 1000.0
    assert result["enterprise_value"] == 1100.0
    assert result["pe"] == 10.0
    assert result["pbv"] == 2.0
    assert result["ps"] == 1.25
    assert round(result["ev_ebitda"], 2) == 7.33
    assert result["interpretation"]["primary_method"] == "EV/EBITDA"
    # 7.33 within 15% band of the 8.0 base policy multiple
    assert result["interpretation"]["valuation_label"] == "fair"
    assert result["data_quality"]["status"] == "complete"


def test_missing_fields_omitted_no_divide_by_zero():
    result = build_valuation_multiples({"currency": "USD"})
    for key in ("market_cap", "enterprise_value", "pe", "pbv", "ps", "ev_ebitda"):
        assert result[key] is None
    assert result["interpretation"]["valuation_label"] == "N/A"
    assert result["interpretation"]["primary_method"] is None
    assert result["data_quality"]["status"] == "unavailable"


def test_zero_denominator_safe():
    snapshot = {**SNAPSHOT, "net_profit": 0.0, "total_equity": 0.0}
    result = build_valuation_multiples(snapshot)
    assert result["pe"] is None
    assert result["pbv"] is None


def test_estimated_ebitda_flagged_as_fallback():
    snapshot = {**SNAPSHOT, "ebitda": None, "operating_income": 120.0}
    result = build_valuation_multiples(snapshot)
    assert result["metric_details"]["ev_ebitda"]["status"] == "estimated"
    assert any("EBITDA" in note for note in result["data_quality"]["fallback_used"])
