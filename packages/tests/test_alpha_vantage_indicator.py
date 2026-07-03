import pytest

from tradingagents.dataflows.providers import alpha_vantage_indicator as av_indicator

CSV = "time,SMA\n2026-06-30,101.5\n2026-06-29,100.0\n2020-01-01,50.0\n"


def _patch_api(monkeypatch, payload):
    captured = {}

    def fake_request(function_name, params):
        captured["function"] = function_name
        captured["params"] = params
        return payload

    monkeypatch.setattr(av_indicator, "_make_api_request", fake_request)
    return captured


def test_sma_values_parsed_sorted_and_windowed(monkeypatch):
    captured = _patch_api(monkeypatch, CSV)
    result = av_indicator.get_indicator("AAPL", "close_50_sma", "2026-07-01", 30)
    assert captured["function"] == "SMA"
    assert captured["params"]["time_period"] == "50"
    assert captured["params"]["series_type"] == "close"
    assert "2026-06-29: 100.0" in result
    assert "2026-06-30: 101.5" in result
    assert "2020-01-01" not in result  # outside 1-year window
    assert "50 SMA" in result  # description appended


def test_unsupported_indicator_raises():
    with pytest.raises(ValueError, match="not supported"):
        av_indicator.get_indicator("AAPL", "bogus", "2026-07-01", 30)


def test_vwma_static_message_without_api_call(monkeypatch):
    def explode(*args, **kwargs):
        raise AssertionError("must not call API")

    monkeypatch.setattr(av_indicator, "_make_api_request", explode)
    result = av_indicator.get_indicator("AAPL", "vwma", "2026-07-01", 30)
    assert "VWMA" in result


def test_missing_time_column_is_error(monkeypatch):
    _patch_api(monkeypatch, "date,SMA\n2026-06-30,101.5\n")
    result = av_indicator.get_indicator("AAPL", "close_50_sma", "2026-07-01", 30)
    assert result.startswith("Error:")
    assert "'time' column not found" in result


def test_missing_value_column_is_error(monkeypatch):
    _patch_api(monkeypatch, "time,WRONG\n2026-06-30,101.5\n")
    result = av_indicator.get_indicator("AAPL", "close_50_sma", "2026-07-01", 30)
    assert "Column 'SMA' not found" in result


def test_empty_payload_is_error(monkeypatch):
    _patch_api(monkeypatch, "")
    result = av_indicator.get_indicator("AAPL", "rsi", "2026-07-01", 30)
    assert result == "Error: No data returned for rsi"


def test_malformed_rows_skipped_gracefully(monkeypatch):
    _patch_api(monkeypatch, "time,RSI\nnot-a-date,55\n2026-06-30,\n")
    result = av_indicator.get_indicator("AAPL", "rsi", "2026-07-01", 14)
    assert "No data available for the specified date range." in result


def test_request_exception_mapped_to_error_string(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("rate limit")

    monkeypatch.setattr(av_indicator, "_make_api_request", boom)
    result = av_indicator.get_indicator("AAPL", "rsi", "2026-07-01", 14)
    assert result.startswith("Error retrieving rsi data:")
