from tradingagents.fundamentals.balance_sheet_risk_builder import build_balance_sheet_risk


def _snapshot(**overrides):
    base = {
        "currency": "USD",
        "sector": "Technology",
        "industry": "Software",
        "total_debt": 200.0,
        "cash": 100.0,
        "total_equity": 500.0,
        "total_assets": 1000.0,
        "current_liabilities": 150.0,
        "ebitda": 150.0,
    }
    base.update(overrides)
    return base


def test_low_risk_metrics():
    result = build_balance_sheet_risk(_snapshot())
    assert result["der"] == 0.4
    assert result["net_debt"] == 100.0
    assert round(result["debt_to_ebitda"], 2) == 1.33
    assert round(result["cash_ratio"], 2) == 0.67
    assert result["equity_ratio"] == 0.5
    assert result["risk_level"] == "low"


def test_high_leverage():
    result = build_balance_sheet_risk(_snapshot(total_debt=1500.0))
    assert result["risk_level"] == "high"


def test_financial_sector_not_classified():
    result = build_balance_sheet_risk(_snapshot(sector="Banks"))
    assert result["risk_level"] == "N/A"
    assert result["data_quality"]["warnings"]


def test_missing_lines_safe():
    result = build_balance_sheet_risk({"currency": "USD"})
    assert result["der"] is None
    assert result["risk_level"] == "N/A"


def test_cash_ratio_fallback_to_total_liabilities():
    result = build_balance_sheet_risk(_snapshot(current_liabilities=None, total_liabilities=400.0))
    assert result["cash_ratio"] == 0.25
    assert any("total liabilities" in note for note in result["data_quality"]["fallback_used"])
