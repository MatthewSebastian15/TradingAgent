"""Unit tests for services/economic_service.py — no network, vendor mocked."""

from __future__ import annotations

import asyncio

import pytest

import services.economic_service as econ
from errors import BadRequestError, PipelineExecutionError
from services.market_cache import market_cache


@pytest.fixture(autouse=True)
def clear_market_cache():
    market_cache.clear()
    yield
    market_cache.clear()


def test_unknown_source_raises_bad_request():
    with pytest.raises(BadRequestError):
        asyncio.run(econ.get_economic_data("nope", "nothing", {}))


def test_fed_funds_happy_path(monkeypatch):
    async def fake_get(url, extra_headers=None):
        assert "/unsecured/effr/last/30.json" in url
        return (
            b'{"refRates":[{"effectiveDate":"2026-06-25","percentRate":3.64},'
            b'{"effectiveDate":"2026-06-24","percentRate":3.62}]}'
        )

    monkeypatch.setattr(econ, "_throttled_get", fake_get)
    result = asyncio.run(
        econ.get_economic_data("federal_reserve", "federal_funds_rate", {"days": "30"})
    )

    assert result["success"] is True
    assert result["source"] == "federal_reserve"
    assert result["valueType"] == "percent"
    assert result["data"] == [
        {"date": "2026-06-24", "value": 3.62},
        {"date": "2026-06-25", "value": 3.64},
    ]


def test_empty_series_returns_empty_data_no_exception(monkeypatch):
    async def fake_get(url, extra_headers=None):
        return b'{"refRates":[]}'

    monkeypatch.setattr(econ, "_throttled_get", fake_get)
    result = asyncio.run(econ.get_economic_data("federal_reserve", "sofr_rate", {"days": "7"}))
    assert result["data"] == []


def test_per_country_command_returns_series_and_countries(monkeypatch):
    async def fake_get(url, extra_headers=None):
        return (
            b'[{"page":1},[{"countryiso3code":"USA","date":"2024","value":2.5},'
            b'{"countryiso3code":"CHN","date":"2024","value":5.0}]]'
        )

    monkeypatch.setattr(econ, "_throttled_get", fake_get)
    result = asyncio.run(
        econ.get_economic_data("world_bank", "gdp_growth", {"countries": "usa,chn", "years": "5"})
    )
    assert result["countries"] == ["USA", "CHN"]
    assert result["series"]["USA"] == [{"date": "2024", "value": 2.5}]
    assert result["series"]["CHN"] == [{"date": "2024", "value": 5.0}]


def test_vendor_failure_raises_typed_pipeline_error(monkeypatch):
    async def fake_get(url, extra_headers=None):
        raise OSError("connection refused")

    monkeypatch.setattr(econ, "_throttled_get", fake_get)
    with pytest.raises(PipelineExecutionError):
        asyncio.run(econ.get_economic_data("federal_reserve", "sofr_rate", {"days": "9"}))


def test_second_call_served_from_cache(monkeypatch):
    calls = []

    async def fake_get(url, extra_headers=None):
        calls.append(url)
        return b'{"refRates":[{"effectiveDate":"2026-06-25","percentRate":3.6}]}'

    monkeypatch.setattr(econ, "_throttled_get", fake_get)
    first = asyncio.run(econ.get_economic_data("federal_reserve", "sofr_rate", {"days": "11"}))
    second = asyncio.run(econ.get_economic_data("federal_reserve", "sofr_rate", {"days": "11"}))
    assert first == second
    assert len(calls) == 1


def test_wto_without_key_signals_unconfigured(monkeypatch):
    monkeypatch.setattr(econ, "ECONOMIC_WTO_API_KEY", "")
    result = asyncio.run(econ.get_economic_data("wto", "merch_trade", {}))
    assert result == {
        "success": True,
        "source": "wto",
        "command": "merch_trade",
        "valueType": "currency",
        "configured": False,
        "data": [],
    }


def test_param_coercion_defaults():
    assert econ._coerce_days(None) == 90
    assert econ._coerce_days("bogus") == 90
    assert econ._coerce_days(9999) == 250
    assert econ._coerce_years(None) == 15
    assert econ._parse_countries(None) == ["USA"]
    assert econ._parse_countries("usa, chn ,IND") == ["USA", "CHN", "IND"]
    assert econ._parse_countries("1;drop") == ["USA"]  # non-alpha rejected → default
    assert econ._parse_currencies(None) == ["USD", "GBP", "JPY"]
