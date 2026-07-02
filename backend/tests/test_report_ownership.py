"""Unit tests for services/report/ownership.py — ownership section builders."""

from __future__ import annotations

from services.report.ownership import (
    _company_profile_rows,
    _format_ownership_percent,
    _ownership_data,
    _ownership_ratio,
    _ownership_segments,
    _shares_ownership_rows,
)


def _profile(**extra) -> dict:
    return {
        "company_profile": {
            "available": True,
            "company_name": "ACME Corp",
            "ticker": "ACME",
            "currency": "USD",
            "market_cap": 2_000_000_000,
            "insider_pct": 10,
            "institution_pct": 60,
            "shares_out": 1_000_000_000,
            **extra,
        }
    }


def test_ownership_ratio_accepts_percent_or_fraction():
    assert _ownership_ratio(25) == 0.25
    assert _ownership_ratio(0.25) == 0.25
    assert _ownership_ratio(150) == 1.0  # clamped
    assert _ownership_ratio(None) is None
    assert _ownership_ratio("abc") is None


def test_ownership_data_derives_public_remainder():
    data = _ownership_data(_profile()["company_profile"])
    assert data["insider"] == 0.10
    assert data["institution"] == 0.60
    assert abs(data["public"] - 0.30) < 1e-9


def test_ownership_segments_sum_to_full_circle():
    segments = _ownership_segments(_profile())
    assert [segment["key"] for segment in segments] == ["insider", "institution", "public"]
    assert segments[0]["display"] == "10.00%"
    assert all(segment["path"] for segment in segments)


def test_missing_data_returns_empty_sections_no_crash():
    assert _ownership_segments({}) == []
    assert _ownership_segments({"company_profile": {"available": False}}) == []
    # insider known but institution missing → cannot derive → empty
    assert _ownership_segments(_profile(institution_pct=None)) == []
    assert _shares_ownership_rows({}) == []
    assert _company_profile_rows({}) == []


def test_company_profile_rows_formats_values():
    rows = _company_profile_rows(_profile())
    by_label = {row["label"]: row["value"] for row in rows}
    assert by_label["Company Name"] == "ACME Corp"
    assert by_label["Market Cap"] == "2,000.0 USD Mn"
    assert by_label["Country"] == "-"  # missing → dash, no crash


def test_shares_ownership_rows():
    rows = _shares_ownership_rows(_profile())
    assert rows == [{"label": "Shares Outstanding", "value": "1,000,000,000"}]


def test_format_ownership_percent():
    assert _format_ownership_percent(12.5) == "12.50%"
    assert _format_ownership_percent(None) == "-"
