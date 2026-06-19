from __future__ import annotations

from tradingagents.dataflows.market.position_sizing import PositionSizing, calculate_position_sizing


def test_position_sizing_dataclass_and_function_are_available():
    assert PositionSizing
    assert calculate_position_sizing


def test_idx_uses_100_share_lots():
    sizing = calculate_position_sizing(
        "IDX", entry_price=9500, stop_loss=9000, portfolio_value=7_500_000
    )

    assert sizing.market == "IDX"
    assert sizing.quantity == 300
    assert sizing.shares == 300
    assert sizing.lot_size == 3
    assert sizing.estimated_value == 2_850_000
    assert sizing.risk_amount == 150_000
    assert sizing.risk_per_unit == 500
    assert sizing.unavailable_reason is None


def test_us_global_etf_and_fund_do_not_use_lots():
    for market in ("US", "GLOBAL", "ETF", "FUND"):
        sizing = calculate_position_sizing(
            market, entry_price=100, stop_loss=90, portfolio_value=10_000
        )

        assert sizing.market == market
        assert sizing.quantity == 20
        assert sizing.shares is None
        assert sizing.lot_size is None
        assert sizing.estimated_value == 2000
        assert sizing.unavailable_reason is None


def test_crypto_supports_decimal_quantity():
    sizing = calculate_position_sizing(
        "CRYPTO", entry_price=100_000, stop_loss=96_000, portfolio_value=5000
    )

    assert sizing.market == "CRYPTO"
    assert sizing.quantity == 0.025
    assert sizing.shares is None
    assert sizing.lot_size is None
    assert sizing.estimated_value == 2500
    assert sizing.note == "Crypto quantity supports decimal sizing."


def test_unknown_market_returns_unavailable_reason():
    sizing = calculate_position_sizing(
        "UNKNOWN", entry_price=100, stop_loss=95, portfolio_value=10_000
    )

    assert sizing.quantity is None
    assert sizing.unavailable_reason


def test_missing_entry_stop_or_portfolio_returns_unavailable_reason():
    assert (
        calculate_position_sizing("US", None, 95, 10_000).unavailable_reason
        == "Entry price is required for position sizing."
    )
    assert (
        calculate_position_sizing("US", 100, None, 10_000).unavailable_reason
        == "Stop loss is required for position sizing."
    )
    assert (
        calculate_position_sizing("US", 100, 95, None).unavailable_reason
        == "Portfolio value is required for position sizing."
    )


def test_risk_per_unit_zero_does_not_crash():
    sizing = calculate_position_sizing("US", entry_price=100, stop_loss=100, portfolio_value=10_000)

    assert sizing.risk_per_unit is None
    assert (
        sizing.unavailable_reason == "Risk per unit is zero because entry price equals stop loss."
    )


def test_allow_fractional_false_rounds_us_and_etf_to_integer_shares():
    for market in ("US", "ETF"):
        sizing = calculate_position_sizing(
            market,
            entry_price=100,
            stop_loss=94,
            portfolio_value=10_000,
            allow_fractional=False,
        )

        assert sizing.quantity == 33
        assert sizing.shares == 33
        assert sizing.lot_size is None


def test_global_invalid_input_returns_clear_unavailable_reason():
    sizing = calculate_position_sizing(
        "GLOBAL", entry_price=100, stop_loss=100, portfolio_value=10_000
    )

    assert sizing.market == "GLOBAL"
    assert sizing.quantity is None
    assert sizing.unavailable_reason
