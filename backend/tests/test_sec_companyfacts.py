from __future__ import annotations

import json
from types import SimpleNamespace

from tradingagents.dataflows import sec_companyfacts


def _response(payload):
    return SimpleNamespace(raise_for_status=lambda: None, json=lambda: payload)


def test_sec_income_statement_builds_period_payload(monkeypatch):
    sec_companyfacts._ticker_map.cache_clear()
    sec_companyfacts._company_facts.cache_clear()

    ticker_payload = {"0": {"ticker": "NVDA", "cik_str": 1045810}}
    facts_payload = {
        "facts": {
            "us-gaap": {
                "Revenues": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2026-03-01",
                                "end": "2025-12-31",
                                "val": 1000,
                            },
                            {
                                "fy": 2026,
                                "fp": "Q1",
                                "form": "10-Q",
                                "filed": "2026-05-01",
                                "end": "2026-03-31",
                                "val": 300,
                            },
                        ]
                    }
                },
                "NetIncomeLoss": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2026-03-01",
                                "end": "2025-12-31",
                                "val": 200,
                            }
                        ]
                    }
                },
            }
        }
    }

    def fake_get(url, headers, timeout):
        if "company_tickers" in url:
            return _response(ticker_payload)
        return _response(facts_payload)

    monkeypatch.setattr(sec_companyfacts.requests, "get", fake_get)

    annual = json.loads(sec_companyfacts.get_income_statement("NVDA", "annual", "2026-06-13"))
    quarterly = json.loads(sec_companyfacts.get_income_statement("NVDA", "quarterly", "2026-06-13"))

    assert annual["source"] == "sec_companyfacts"
    assert annual["periods"]["FY2025"]["revenue"]["value"] == 1000
    assert annual["periods"]["FY2025"]["net_profit"]["value"] == 200
    assert quarterly["periods"]["Q1 2026"]["revenue"]["value"] == 300


def test_sec_returns_clear_message_when_ticker_missing(monkeypatch):
    sec_companyfacts._ticker_map.cache_clear()
    sec_companyfacts._company_facts.cache_clear()
    monkeypatch.setattr(sec_companyfacts.requests, "get", lambda *a, **k: _response({}))

    assert "No SEC CIK mapping found" in sec_companyfacts.get_balance_sheet("UNKNOWN", "annual", "2026-06-13")
