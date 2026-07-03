from tradingagents.fundamentals.financial_trends_builder import build_financial_trends


def _cell(value):
    return {"value": value, "display": str(value), "status": "reported"}


def _highlights(period_values: dict[str, dict[str, float]]) -> dict:
    periods = [{"key": key} for key in period_values]
    row_keys = {row_key for values in period_values.values() for row_key in values}
    rows = [
        {
            "key": row_key,
            "values": {
                period: _cell(values[row_key])
                for period, values in period_values.items()
                if row_key in values
            },
        }
        for row_key in row_keys
    ]
    return {
        "currency": "USD",
        "periods": periods,
        "rows": rows,
        "data_quality": {"status": "complete"},
    }


def test_multi_period_trends():
    highlights = _highlights(
        {
            "2022": {"revenue_growth": 5.0, "net_profit_margin": 10.0, "roe": 12.0, "der": 2.0},
            "2023": {"revenue_growth": 9.0, "net_profit_margin": 8.0, "roe": 12.2, "der": 1.0},
        }
    )
    result = build_financial_trends(highlights)
    summary = result["summary"]
    assert summary["growth_trend"] == "improving"
    assert summary["margin_trend"] == "weakening"
    assert summary["profitability_trend"] == "stable"  # |0.2| <= 0.5
    assert summary["leverage_trend"] == "improving"  # der down = better


def test_single_period_no_trend_no_crash():
    result = build_financial_trends(_highlights({"2023": {"revenue_growth": 5.0}}))
    assert result["summary"]["growth_trend"] == "N/A"
    assert result["summary"]["leverage_trend"] == "N/A"


def test_none_input_safe():
    result = build_financial_trends(None)
    assert result["periods"] == []
    assert all(trend == "N/A" for trend in result["summary"].values())


def test_missing_cells_tracked():
    result = build_financial_trends(_highlights({"2023": {"revenue": 100.0}}))
    assert any("eps" in field for field in result["data_quality"]["missing_fields"])
