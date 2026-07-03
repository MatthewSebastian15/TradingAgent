from tradingagents.fundamentals.fair_value_builder import build_fair_value_range
from tradingagents.fundamentals.scenario_builder import build_scenario_analysis

SNAPSHOT = {
    "currency": "USD",
    "sector": "Technology",
    "industry": "Software",
    "total_debt": 200.0,
    "cash": 100.0,
    "ebitda": 150.0,
    "net_profit": 100.0,
    "revenue": 800.0,
    "shares_outstanding": 100.0,
    "eps": 1.0,
    "current_price": 10.0,
}

TRENDS = {
    "metrics": {
        "revenue_growth_percent": [5.0, 8.0],
        "net_profit_margin_percent": [10.0, 12.0],
    }
}


def test_scenarios_from_fair_value_and_trends():
    fair_value = build_fair_value_range(SNAPSHOT)
    result = build_scenario_analysis(SNAPSHOT, TRENDS, fair_value)
    assert set(result["metric_details"]) == {"bear", "base", "bull"}
    assert result["base"]["fair_value"] == fair_value["base"]
    # deltas apply to the latest trend values
    assert result["bear"]["revenue_growth_assumption_percent"] == 5.0
    assert result["base"]["revenue_growth_assumption_percent"] == 8.0
    assert result["bull"]["revenue_growth_assumption_percent"] == 11.0
    assert result["bull"]["margin_assumption_percent"] == 14.0
    assert result["base"]["valuation_multiple"] == "8.0x EV/EBITDA"


def test_boundary_missing_trends_and_method():
    fair_value = build_fair_value_range({"currency": "USD"})
    result = build_scenario_analysis({"currency": "USD"}, {}, fair_value)
    assert result["base"]["fair_value"] is None
    assert result["base"]["revenue_growth_assumption_percent"] is None
    assert result["base"]["valuation_multiple"] == "N/A"
    assert result["data_quality"]["missing_fields"]
    assert result["data_quality"]["status"] in {"partial", "unavailable"}
