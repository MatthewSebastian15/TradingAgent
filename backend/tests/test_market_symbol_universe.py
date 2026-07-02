"""Unit tests for services/market_symbol_universe.py — pure data lookups."""

from __future__ import annotations

from services.market_symbol_universe import (
    MARKET_SYMBOL_UNIVERSE,
    get_exchange_preset,
    get_symbol_universe,
    normalize_country,
    universe_key,
)


def test_lookup_hit_returns_universe():
    symbols = get_symbol_universe("US", "NASDAQ")
    assert "AAPL" in symbols
    assert symbols == MARKET_SYMBOL_UNIVERSE["US:NASDAQ"]


def test_lookup_returns_copy_not_reference():
    symbols = get_symbol_universe("ID", "IDX")
    symbols.append("HACK.JK")
    assert "HACK.JK" not in MARKET_SYMBOL_UNIVERSE["ID:IDX"]


def test_lookup_miss_falls_back_to_us_nasdaq():
    assert get_symbol_universe("ZZ", "NOWHERE") == MARKET_SYMBOL_UNIVERSE["US:NASDAQ"]


def test_country_aliases_normalize():
    assert normalize_country("usa") == "US"
    assert normalize_country(" United Kingdom ") == "GB"
    assert normalize_country("indonesia") == "ID"
    assert normalize_country("") == ""
    assert normalize_country("MARS") == "MARS"  # unknown passes through upper-cased


def test_universe_key_normalizes_case_and_whitespace():
    assert universe_key("indonesia", " idx ") == "ID:IDX"


def test_exchange_preset_hit_and_miss():
    preset = get_exchange_preset("Indonesia", "idx")
    assert preset["suffix"] == ".JK"
    assert get_exchange_preset("US", "IDX") is None


def test_exchange_preset_returns_copy():
    preset = get_exchange_preset("Japan", "TSE")
    preset["suffix"] = ".HACK"
    assert get_exchange_preset("Japan", "TSE")["suffix"] == ".T"


def test_us_presets_have_no_suffix():
    # ADR-013: no auto symbol suffix — US symbols stay bare.
    assert get_exchange_preset("US", "NASDAQ")["suffix"] == ""
    assert get_exchange_preset("US", "NYSE")["suffix"] == ""
