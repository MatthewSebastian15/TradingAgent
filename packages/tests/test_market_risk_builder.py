from tradingagents.risk.market_risk_builder import build_market_risk


def _rows(closes, spread=0.0):
    return [
        {
            "date": f"2026-01-{index + 1:02d}",
            "close": close,
            "high": close + spread,
            "low": close - spread,
        }
        for index, close in enumerate(closes)
    ]


def test_flat_prices_low_risk():
    result = build_market_risk({"data": _rows([100.0] * 20)})
    assert result["volatility_percent"] == 0.0
    assert result["max_drawdown_percent"] == 0.0
    assert result["atr"] == 0.0
    assert result["price_range_percent"] == 0.0
    assert result["risk_bucket"] == "low"


def test_empty_chart_graceful():
    result = build_market_risk(None)
    # empty history: no volatility/ATR; drawdown degrades to 0.0, bucket stays low
    assert result["volatility_percent"] is None
    assert result["atr"] is None
    assert result["max_drawdown_percent"] == 0.0
    assert result["risk_bucket"] == "low"
    assert result["notes"]


def test_drawdown_from_peak():
    result = build_market_risk({"data": _rows([100.0, 120.0, 90.0, 95.0])})
    assert result["max_drawdown_percent"] == -25.0
    assert result["risk_bucket"] == "high"


def test_summary_and_technical_inputs_take_precedence():
    result = build_market_risk(
        {"data": _rows([100.0] * 20)},
        price_performance={
            "max_drawdown_percent": -30.0,
            "period_high": 150.0,
            "period_low": 100.0,
        },
        technical_entry={"atr": 2.5},
    )
    assert result["max_drawdown_percent"] == -30.0
    assert result["atr"] == 2.5
    assert result["price_range_percent"] == 50.0
    assert result["risk_bucket"] == "high"
