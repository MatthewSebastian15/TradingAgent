import pytest

from tradingagents.dataflows.providers.finnhub_symbol_resolver import (
    clear_symbol_cache,
    get_finnhub_symbol_candidates,
    resolve_stock_symbol,
)


@pytest.fixture(autouse=True)
def _fresh_cache():
    clear_symbol_cache()
    yield
    clear_symbol_cache()


def test_jk_suffix_keeps_yfinance_and_adds_base_candidate():
    resolved = resolve_stock_symbol("bbca.jk")
    assert resolved.yfinance == "BBCA.JK"
    assert resolved.finnhub_candidates == ("BBCA.JK", "BBCA")
    assert resolved.market == "ID"


def test_four_letter_bare_symbol_treated_as_idx():
    resolved = resolve_stock_symbol("TLKM")
    assert resolved.yfinance == "TLKM.JK"
    assert resolved.finnhub_candidates == ("TLKM.JK", "TLKM")
    assert resolved.market == "ID"


def test_us_symbol_passthrough():
    # only 4-letter bare symbols are IDX-shaped; others pass through as US
    resolved = resolve_stock_symbol("IBM")
    assert resolved.yfinance == "IBM"
    assert resolved.finnhub_candidates == ("IBM",)
    assert resolved.market == "US"
    assert resolve_stock_symbol("GOOGL").market == "US"


def test_forex_crypto_unsupported():
    resolved = resolve_stock_symbol("EUR/USD")
    assert resolved.market == "unsupported_non_stock"
    assert resolve_stock_symbol("BINANCE:BTCUSDT").market == "unsupported_non_stock"


def test_empty_symbol_unknown():
    resolved = resolve_stock_symbol("")
    assert resolved.yfinance == ""
    assert resolved.finnhub_candidates == ()
    assert resolved.market == "unknown"


def test_candidates_helper_returns_list():
    assert get_finnhub_symbol_candidates("IBM") == ["IBM"]
    assert get_finnhub_symbol_candidates("MSFT") == ["MSFT.JK", "MSFT"]
