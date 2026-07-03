from tradingagents.fundamentals.dividend_quality_builder import build_dividend_quality

SNAPSHOT = {
    "currency": "USD",
    "dividend_per_share": 0.5,
    "dividend_paid": 40.0,
    "eps": 1.0,
    "net_profit": 100.0,
    "current_price": 10.0,
}


def test_sustainable_payer():
    result = build_dividend_quality(SNAPSHOT, {"free_cash_flow": 50.0})
    assert result["dividend_yield_percent"] == 5.0
    assert result["payout_ratio_percent"] == 50.0
    assert result["fcf_coverage"] == 1.25
    assert result["sustainability"] == "sustainable"


def test_non_payer_flagged():
    snapshot = {**SNAPSHOT, "dividend_per_share": 0.0, "dividend_paid": 0.0}
    result = build_dividend_quality(snapshot, {"free_cash_flow": 50.0})
    assert result["sustainability"] == "not_dividend_focused"


def test_high_payout_is_risky():
    snapshot = {**SNAPSHOT, "dividend_per_share": 1.0}
    result = build_dividend_quality(snapshot, {"free_cash_flow": 50.0})
    assert result["payout_ratio_percent"] == 100.0
    assert result["sustainability"] == "risky"


def test_payout_fallback_to_dividend_paid():
    snapshot = {**SNAPSHOT, "dividend_per_share": None, "eps": None}
    result = build_dividend_quality(snapshot, {"free_cash_flow": None})
    assert result["payout_ratio_percent"] == 40.0
    assert result["data_quality"]["fallback_used"]


def test_no_data_is_na():
    result = build_dividend_quality({"currency": "USD"}, {})
    assert result["sustainability"] == "N/A"
