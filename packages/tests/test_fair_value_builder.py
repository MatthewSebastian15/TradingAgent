from tradingagents.fundamentals.fair_value_builder import build_fair_value_range

SNAPSHOT = {
    "currency": "USD",
    "sector": "Technology",
    "industry": "Software",
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


def test_ev_ebitda_fair_value_range():
    result = build_fair_value_range(SNAPSHOT)
    assert result["primary_method"] == "EV/EBITDA"
    # equity value = ebitda * multiple - debt + cash, per share over 100 shares
    assert result["bear"] == 8.0
    assert result["base"] == 11.0
    assert result["bull"] == 14.0
    assert round(result["base_upside_percent"], 2) == 10.0
    assert result["data_quality"]["status"] == "complete"


def test_zero_shares_yields_no_fair_value():
    snapshot = {**SNAPSHOT, "shares_outstanding": 0.0, "eps": None, "bvps": None}
    result = build_fair_value_range(snapshot)
    assert result["base"] is None
    assert result["base_upside_percent"] is None


def test_empty_snapshot_no_method():
    result = build_fair_value_range({"currency": "USD"})
    assert result["primary_method"] is None
    assert result["method"] == "N/A"
    assert result["base"] is None
    assert result["data_quality"]["status"] in {"partial", "unavailable"}


def test_financial_sector_uses_pbv():
    snapshot = {**SNAPSHOT, "sector": "Banks", "industry": "Regional bank"}
    result = build_fair_value_range(snapshot)
    assert result["primary_method"] == "P/BV"
    assert result["base"] == 5.0 * 1.5
