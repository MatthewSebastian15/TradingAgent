import pandas as pd

from tradingagents.dataflows.market.local_indicators import calculate_local_indicators


def _constant_df(rows: int, price: float = 100.0) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Close": [price] * rows,
            "High": [price] * rows,
            "Low": [price] * rows,
            "Volume": [1000] * rows,
        }
    )


def test_empty_and_none_input():
    assert calculate_local_indicators(None)["available"] is False
    assert calculate_local_indicators(pd.DataFrame())["available"] is False


def test_missing_close_column():
    result = calculate_local_indicators(pd.DataFrame({"open": [1.0]}))
    assert result["available"] is False
    assert "Close" in result["reason"]


def test_constant_series_hand_computed():
    result = calculate_local_indicators(_constant_df(60))
    assert result["available"] is True
    assert result["close_50_sma"] == 100.0
    assert result["close_200_sma"] is None  # needs 200 rows
    assert result["macd"] == 0.0
    assert result["macd_signal"] == 0.0
    assert result["boll_ub"] == 100.0
    assert result["boll_lb"] == 100.0
    assert result["atr"] == 0.0
    # zero gain/loss makes RSI and MFI undefined -> None, not NaN
    assert result["rsi"] is None
    assert result["mfi"] is None


def test_short_series_smas_none():
    result = calculate_local_indicators(_constant_df(10))
    assert result["close_50_sma"] is None
    assert result["close_200_sma"] is None


def test_no_high_low_columns_skips_atr_and_mfi():
    result = calculate_local_indicators(pd.DataFrame({"Close": [100.0] * 30}))
    assert result["atr"] is None
    assert result["mfi"] is None
