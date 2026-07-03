from tradingagents.fundamentals.quality_of_earnings_builder import build_quality_of_earnings


def _snapshot(**overrides):
    base = {
        "currency": "USD",
        "operating_cash_flow": 120.0,
        "net_profit": 100.0,
        "capex": 20.0,
        "revenue": 800.0,
    }
    base.update(overrides)
    return base


def test_healthy_cash_conversion():
    result = build_quality_of_earnings(_snapshot())
    assert result["cfo_to_net_income"] == 1.2
    assert result["free_cash_flow"] == 100.0
    assert result["capex_intensity_percent"] == 2.5
    assert result["rating"] == "healthy"
    assert result["accrual_risk"] == "low"


def test_weak_when_cfo_lags_income():
    result = build_quality_of_earnings(_snapshot(operating_cash_flow=50.0))
    assert result["rating"] == "weak"
    assert result["accrual_risk"] == "high"


def test_negative_fcf_is_weak():
    result = build_quality_of_earnings(_snapshot(operating_cash_flow=110.0, capex=150.0))
    assert result["free_cash_flow"] == -40.0
    assert result["rating"] == "weak"


def test_watch_band():
    result = build_quality_of_earnings(_snapshot(operating_cash_flow=90.0))
    assert result["rating"] == "watch"
    assert result["accrual_risk"] == "moderate"


def test_missing_inputs_na():
    result = build_quality_of_earnings({"currency": "USD"})
    assert result["rating"] == "N/A"
    assert result["accrual_risk"] == "N/A"
    assert result["data_quality"]["status"] == "unavailable"
