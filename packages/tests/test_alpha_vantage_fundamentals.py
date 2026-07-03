import json

from tradingagents.dataflows.providers import alpha_vantage_fundamentals as av


def _patch_api(monkeypatch, payload):
    monkeypatch.setattr(av, "_make_api_request", lambda *args, **kwargs: payload)


def test_fundamentals_dumps_overview_payload(monkeypatch):
    _patch_api(monkeypatch, {"Symbol": "AAPL", "PERatio": "28.5"})
    result = json.loads(av.get_fundamentals("AAPL"))
    assert result == {"Symbol": "AAPL", "PERatio": "28.5"}


def test_fundamentals_json_string_payload_parsed(monkeypatch):
    _patch_api(monkeypatch, '{"Symbol": "AAPL"}')
    assert json.loads(av.get_fundamentals("AAPL")) == {"Symbol": "AAPL"}


def test_fundamentals_blank_payload_reports_missing(monkeypatch):
    _patch_api(monkeypatch, {"Symbol": "", "PERatio": "None", "EPS": None})
    assert av.get_fundamentals("AAPL") == "No fundamentals data found for symbol 'AAPL'"


def test_fundamentals_malformed_payload_reports_missing(monkeypatch):
    _patch_api(monkeypatch, "not-json {")
    assert "No fundamentals data found" in av.get_fundamentals("AAPL")
    _patch_api(monkeypatch, None)
    assert "No fundamentals data found" in av.get_fundamentals("AAPL")


def test_balance_sheet_filters_lookahead_periods(monkeypatch):
    _patch_api(
        monkeypatch,
        {
            "annualReports": [
                {"fiscalDateEnding": "2025-12-31"},
                {"fiscalDateEnding": "2026-12-31"},  # after curr_date -> dropped
            ]
        },
    )
    result = json.loads(av.get_balance_sheet("AAPL", curr_date="2026-07-03"))
    assert result["annualReports"] == [{"fiscalDateEnding": "2025-12-31"}]


def test_balance_sheet_empty_after_filter_reports_missing(monkeypatch):
    _patch_api(monkeypatch, {"annualReports": [{"fiscalDateEnding": "2026-12-31"}]})
    result = av.get_balance_sheet("AAPL", curr_date="2026-01-01")
    assert result == "No balance sheet data found for symbol 'AAPL'"


def test_cashflow_and_income_statement_error_fallback(monkeypatch):
    _patch_api(monkeypatch, {})
    assert "No cash flow data found" in av.get_cashflow("AAPL")
    assert "No income statement data found" in av.get_income_statement("AAPL")


def test_income_statement_keeps_quarterly_reports(monkeypatch):
    _patch_api(monkeypatch, {"quarterlyReports": [{"fiscalDateEnding": "2026-03-31"}]})
    result = json.loads(av.get_income_statement("AAPL", curr_date="2026-07-03"))
    assert result["quarterlyReports"]


def test_company_profile_aliases_fundamentals(monkeypatch):
    _patch_api(monkeypatch, {"Symbol": "AAPL"})
    assert av.get_company_profile("AAPL") == av.get_fundamentals("AAPL")
