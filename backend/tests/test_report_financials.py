"""Unit tests for services/report/financials.py — financial section builders."""

from __future__ import annotations

from services.report.financials import (
    _analyst_consensus_rows,
    _financial_highlights,
    _financial_trend_rows,
    _peer_comparison_rows,
    _price_chart_rows,
    _scenario_rows,
)

_HIGHLIGHTS_SNAPSHOT = {
    "title": "Highlights",
    "unit_note": "in Bn",
    "periods": [{"key": "FY24", "label": "FY24"}, {"key": "FY25", "label": "FY25"}],
    "rows": [
        {
            "key": "revenue",
            "label": "Revenue",
            "unit": "Bn",
            "values": {
                "FY24": {"value": "120.0"},
                "FY25": {"value": "150.0", "status": "estimated"},
            },
        }
    ],
    "point_in_time": [{"key": "pe", "label": "P/E", "unit": "x", "value": "21.4"}],
}


def test_financial_highlights_builds_display_values():
    highlights = _financial_highlights(_HIGHLIGHTS_SNAPSHOT)
    assert highlights["title"] == "Highlights"
    row = highlights["rows"][0]
    assert row["display_values"]["FY24"] == "120.0 Bn"
    assert row["display_values"]["FY25"] == "150.0 Bn EST"
    assert highlights["point_in_time"][0]["display"] == "21.4x"
    # no explicit sections → legacy section wraps the rows
    assert highlights["sections"][0]["key"] == "legacy"
    assert highlights["sections"][0]["rows"] == highlights["rows"]


def test_financial_highlights_missing_statements_return_none():
    assert _financial_highlights(None) is None
    assert _financial_highlights({}) is None
    assert _financial_highlights({"periods": [], "rows": []}) is None
    assert _financial_highlights({"periods": [{"key": "FY24"}], "rows": []}) is None


def test_financial_trend_rows_align_values_to_periods():
    payload = {
        "currency": "USD",
        "scale_label": "Bn",
        "periods": [{"key": "FY24"}, {"key": "FY25"}],
        "metric_details": {
            "revenue": [{"display": "120"}, {"display": "150"}],
            "roe_percent": [{"display": "15"}, None],
            "not_in_definitions": [{"display": "x"}],
        },
    }
    rows = _financial_trend_rows(payload)
    by_label = {row["label"]: row["values"] for row in rows}
    assert by_label["Revenue"] == ["120 Bn", "150 Bn"]
    assert by_label["ROE"] == ["15 %", "-"]
    assert "not_in_definitions" not in by_label
    assert _financial_trend_rows({}) == []


def test_price_chart_rows_requires_available_flag():
    assert _price_chart_rows({}, "AAPL", "US") == []
    assert _price_chart_rows({"price_chart": {"available": False}}, "AAPL", "US") == []

    result = {
        "price_chart": {
            "available": True,
            "window_label": "1Y",
            "source": "yfinance",
            "stats": {"start_price": 100, "end_price": 150, "change_percent": 50},
        }
    }
    rows = _price_chart_rows(result, "AAPL", "US")
    by_label = {row["label"]: row["value"] for row in rows}
    assert by_label["Start Price"] == "$100"
    assert by_label["End Price"] == "$150"
    assert by_label["Period Return"] == "50%"


def test_scenario_rows_orders_bear_base_bull():
    payload = {
        "bull": {"fair_value": 200},
        "bear": {"fair_value": 100},
        "base": {"fair_value": 150},
    }
    rows = _scenario_rows(payload)
    assert [row["scenario"] for row in rows] == ["Bear", "Base", "Bull"]
    assert rows[0]["fair_value"] == "100"
    assert _scenario_rows({}) == []


def test_peer_comparison_and_consensus_rows():
    peers = _peer_comparison_rows(
        {"metrics": [{"ticker": "MSFT", "pe": 30, "roe_percent": 40}, "bad-item"]}
    )
    assert peers == [
        {
            "ticker": "MSFT",
            "company_name": "N/A",
            "pe": "30",
            "pbv": "N/A",
            "roe": "40%",
            "margin": "N/A",
            "der": "N/A",
            "dividend_yield": "N/A",
        }
    ]
    assert _analyst_consensus_rows({}) == []
    rows = _analyst_consensus_rows(
        {"analyst_consensus": {"available": True, "buy": 12, "consensus_label": "Buy"}}
    )
    by_label = {row["label"]: row["value"] for row in rows}
    assert by_label["Buy"] == "12"
    assert by_label["Consensus Label"] == "Buy"
