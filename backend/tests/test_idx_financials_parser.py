from __future__ import annotations

import json
from pathlib import Path

from tradingagents.dataflows.fundamentals.idx_financials_parser import (
    build_idx_financial_statement_from_report,
    download_idx_report,
    find_idx_financial_reports,
    parse_idx_financial_statement,
)
from tradingagents.dataflows.fundamentals.idx_official import get_idx_financial_statements


def _write_report(tmp_path: Path) -> Path:
    report = {
        "ticker": "BBCA.JK",
        "period": "FY2024",
        "period_end": "2024-12-31",
        "reported_date": "2025-03-31",
        "currency": "IDR",
        "unit": "million",
        "income_statement": {
            "revenue": 106_000_000,
            "ebitda": 65_000_000,
            "net_profit": 48_000_000,
        },
        "balance_sheet": {
            "cash": 120_000_000,
            "debt": 0,
            "equity": 250_000_000,
        },
        "cashflow": {
            "operating_cash_flow": 52_000_000,
            "capex": 5_000_000,
        },
    }
    path = tmp_path / "BBCA_FY2024.json"
    path.write_text(json.dumps(report), encoding="utf-8")
    return path


def test_parse_idx_financial_statement_normalizes_values_and_period():
    payload = parse_idx_financial_statement(
        {
            "ticker": "BBCA.JK",
            "period": "FY2024",
            "currency": "idr",
            "unit": "million",
            "income_statement": {"revenue": 106_000_000, "net_profit": 48_000_000},
            "balance_sheet": {"equity": 250_000_000},
            "cashflow": {"operating_cash_flow": 52_000_000},
        }
    )

    assert payload["status"] == "available"
    assert payload["income_statement"]["revenue"] == 106_000_000_000_000
    assert payload["period"]["period_label"] == "FY2024"
    assert payload["period"]["period_type"] == "annual"


def test_find_download_and_build_idx_report_from_local_index(tmp_path, monkeypatch):
    report_path = _write_report(tmp_path)
    index_path = tmp_path / "index.json"
    index_path.write_text(
        json.dumps(
            {
                "reports": [
                    {
                        "ticker": "BBCA.JK",
                        "period": "FY2024",
                        "period_end": "2024-12-31",
                        "reported_date": "2025-03-31",
                        "document_type": "annual_financial_statement",
                        "format": "json",
                        "local_path": str(report_path),
                        "url": report_path.as_uri(),
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("IDX_FINANCIAL_REPORT_INDEX_PATH", str(index_path))

    reports = find_idx_financial_reports("BBCA.JK", year=2024)
    assert reports and reports[0]["source"] == "idx_official"

    downloaded = download_idx_report(reports[0])
    assert downloaded["available"] is True
    assert downloaded["checksum"]

    parsed = build_idx_financial_statement_from_report(reports[0])
    assert parsed["available"] is True
    assert parsed["source_url"].startswith("file://")
    assert parsed["metadata"]["checksum"]

    routed = get_idx_financial_statements("BBCA.JK", period="FY2024")
    assert routed["status"] == "available"
    assert routed["income_statement"]["net_profit"] == 48_000_000_000_000
