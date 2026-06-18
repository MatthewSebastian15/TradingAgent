from __future__ import annotations

import pytest
from tradingagents.financial_highlights.builder import build_financial_highlights
from tradingagents.financial_highlights.calculator import (
    calculate_payout_ratio,
    safe_divide,
    safe_growth_percent,
    safe_percent,
)
from tradingagents.financial_highlights.models import to_dict
from tradingagents.financial_highlights.period_resolver import resolve_financial_highlight_periods
from tradingagents.financial_highlights.statement_parser import parse_vendor_financials
from tradingagents.fundamentals.builder import build_fundamental_analysis


def _vendor_payloads(*, include_ebitda: bool = True) -> dict:
    income_statement = {
        "FY24": {"revenue": 800, "net_profit": 80},
        "FY25": {"revenue": 1000, "operating_income": 220, "net_profit": 100},
    }
    if include_ebitda:
        income_statement["FY25"]["ebitda"] = 250
    return {
        "yfinance": {
            "income_statement": income_statement,
            "balance_sheet": {
                "FY24": {"total_equity": 450},
                "FY25": {
                    "total_equity": 500,
                    "total_debt": 200,
                    "cash": 80,
                    "current_liabilities": 100,
                    "total_liabilities": 400,
                    "total_assets": 1000,
                    "shares_outstanding": 100,
                },
            },
            "cashflow": {
                "FY25": {
                    "operating_cash_flow": 160,
                    "capex": -40,
                    "dividend_paid": -30,
                }
            },
            "dividends": {"FY25": {"dividend_per_share": 0.3, "reference_price": 10}},
        }
    }


def _bundle(
    *, sector: str = "Technology", include_ebitda: bool = True, peer_payload: dict | None = None
) -> dict:
    vendor_payloads = _vendor_payloads(include_ebitda=include_ebitda)
    highlights = to_dict(
        build_financial_highlights(
            ticker="TEST",
            analysis_date="2026-01-15",
            vendor_payloads=vendor_payloads,
        )
    )
    return build_fundamental_analysis(
        ticker="TEST",
        analysis_date="2026-01-15",
        financial_highlights=highlights,
        vendor_payloads=vendor_payloads,
        company_profile={"sector": sector},
        current_price=10,
        peer_payload=peer_payload,
    )


def test_safe_helpers_preserve_zero_and_reject_zero_denominator():
    assert safe_divide(0, 10) == 0
    assert safe_percent(0, 10) == 0
    assert safe_percent(10, 0) is None
    assert safe_growth_percent(0, 10) == -100
    assert safe_growth_percent(10, 0) is None
    assert calculate_payout_ratio(0, 2) == 0


def test_statement_parser_normalizes_cashflow_outflows_and_new_aliases():
    statements = (
        "# Financial statement frequency: annual\n"
        + ",2025-12-31\n"
        + "Cash And Cash Equivalents,80\n"
        + "Current Liabilities,100\n"
        + "Total Liabilities,400\n"
        + "Total Assets,1000\n"
        + "Operating Income,220\n"
        + "Operating Cash Flow,160\n"
        + "Capital Expenditure,-40\n"
        + "Cash Dividends Paid,-30"
    )

    normalized = parse_vendor_financials(
        ticker="TEST",
        periods=resolve_financial_highlight_periods("2026-01-15"),
        cashflow=statements,
    )
    period = normalized["periods"]["FY25"]

    assert period["cash"]["value"] == 80
    assert period["current_liabilities"]["value"] == 100
    assert period["total_liabilities"]["value"] == 400
    assert period["total_assets"]["value"] == 1000
    assert period["operating_income"]["value"] == 220
    assert period["operating_cash_flow"]["value"] == 160
    assert period["capex"]["value"] == 40
    assert period["dividend_paid"]["value"] == 30


def test_fundamental_bundle_calculates_core_valuation_scenario_quality_and_risk():
    bundle = _bundle()

    valuation = bundle["valuation_multiples"]
    assert valuation["market_cap"] == 1000
    assert valuation["enterprise_value"] == 1120
    assert valuation["pe"] == 10
    assert valuation["pbv"] == 2
    assert valuation["ps"] == 1
    assert valuation["ev_ebitda"] == 4.48
    assert valuation["interpretation"]["primary_method"] == "EV/EBITDA"
    assert valuation["interpretation"]["valuation_label"] == "cheap"

    fair_value = bundle["fair_value_range"]
    assert fair_value["primary_method"] == "EV/EBITDA"
    assert fair_value["bear"] == 13.8
    assert fair_value["base"] == 18.8
    assert fair_value["bull"] == 23.8
    assert bundle["scenario_analysis"]["base"]["upside_downside_percent"] == pytest.approx(88)

    quality = bundle["quality_of_earnings"]
    assert quality["cfo_to_net_income"] == 1.6
    assert quality["free_cash_flow"] == 120
    assert quality["capex_intensity_percent"] == 4
    assert quality["accrual_risk"] == "low"

    risk = bundle["balance_sheet_risk"]
    assert risk["der"] == 0.4
    assert risk["net_debt"] == 120
    assert risk["debt_to_ebitda"] == 0.8
    assert risk["cash_ratio"] == 0.8
    assert risk["equity_ratio"] == 0.5

    dividend = bundle["dividend_quality"]
    assert dividend["dividend_yield_percent"] == 3
    assert dividend["payout_ratio_percent"] == 30
    assert dividend["fcf_coverage"] == 4
    assert dividend["sustainability"] == "sustainable"


def test_fundamental_bundle_uses_estimated_ebitda_fallback():
    bundle = _bundle(include_ebitda=False)

    valuation = bundle["valuation_multiples"]
    assert valuation["ev_ebitda"] == 1120 / 220
    assert valuation["metric_details"]["ev_ebitda"]["status"] == "estimated"
    assert "EBITDA estimated from operating income" in valuation["data_quality"]["fallback_used"]
    assert bundle["fair_value_range"]["metric_details"]["base"]["status"] == "estimated"
    assert bundle["scenario_analysis"]["base"]["fair_value_display"].endswith(" EST")


def test_financial_sector_uses_pbv_and_requires_sector_specific_risk_review():
    bundle = _bundle(sector="Financial Services")

    assert bundle["fair_value_range"]["primary_method"] == "P/BV"
    assert bundle["fair_value_range"]["base"] == 7.5
    assert bundle["balance_sheet_risk"]["risk_level"] == "N/A"
    assert "sector-specific review" in bundle["balance_sheet_risk"]["data_quality"]["warnings"][0]


def test_fair_value_falls_back_to_pe_then_ps():
    pe_payloads = {
        "yfinance": {
            "income_statement": {"FY25": {"revenue": 1000, "net_profit": 100}},
            "balance_sheet": {"FY25": {"total_equity": 500, "shares_outstanding": 100}},
        }
    }
    ps_payloads = {
        "yfinance": {
            "income_statement": {"FY25": {"revenue": 1000}},
            "balance_sheet": {"FY25": {"shares_outstanding": 100}},
        }
    }

    pe_bundle = build_fundamental_analysis(
        ticker="TEST",
        analysis_date="2026-01-15",
        financial_highlights=None,
        vendor_payloads=pe_payloads,
        current_price=10,
    )
    ps_bundle = build_fundamental_analysis(
        ticker="TEST",
        analysis_date="2026-01-15",
        financial_highlights=None,
        vendor_payloads=ps_payloads,
        current_price=10,
    )

    assert pe_bundle["fair_value_range"]["primary_method"] == "P/E"
    assert pe_bundle["fair_value_range"]["base"] == 15
    assert ps_bundle["fair_value_range"]["primary_method"] == "P/S"
    assert ps_bundle["fair_value_range"]["base"] == 20


def test_valuation_marks_profile_market_cap_fallback_as_estimated():
    bundle = build_fundamental_analysis(
        ticker="TEST",
        analysis_date="2026-01-15",
        financial_highlights=None,
        vendor_payloads={
            "yfinance": {"income_statement": {"FY25": {"revenue": 1000, "net_profit": 100}}}
        },
        company_profile={"market_cap": 2000},
        current_price=10,
    )

    valuation = bundle["valuation_multiples"]
    assert valuation["market_cap"] == 2000
    assert valuation["metric_details"]["market_cap"]["status"] == "estimated"
    assert "Market cap uses company profile fallback" in valuation["data_quality"]["fallback_used"]


def test_missing_fundamental_data_returns_na_without_crash():
    highlights = to_dict(build_financial_highlights(ticker="TEST", analysis_date="2026-01-15"))
    bundle = build_fundamental_analysis(
        ticker="TEST",
        analysis_date="2026-01-15",
        financial_highlights=highlights,
    )

    assert bundle["valuation_multiples"]["metric_details"]["pe"]["display"] == "-"
    assert bundle["fair_value_range"]["metric_details"]["base"]["display"] == "-"
    assert bundle["quality_of_earnings"]["metric_details"]["free_cash_flow"]["display"] == "-"
    assert bundle["balance_sheet_risk"]["metric_details"]["net_debt"]["display"] == "-"
    assert bundle["dividend_quality"]["metric_details"]["fcf_coverage"]["display"] == "-"
    assert bundle["peer_comparison"] is None


def test_peer_comparison_is_only_returned_for_optional_payload():
    peer_payload = {
        "primary_ticker": "TEST",
        "peers": ["PEER"],
        "metrics": [{"ticker": "TEST", "pe": 10}, {"ticker": "PEER", "pe": 12}],
    }

    assert _bundle()["peer_comparison"] is None
    peer_comparison = _bundle(peer_payload=peer_payload)["peer_comparison"]
    assert peer_comparison["metrics"] == peer_payload["metrics"]
    assert peer_comparison["data_quality"] == {
        "status": "complete",
        "missing_fields": [],
        "fallback_used": [],
        "warnings": [],
    }


def test_financial_trends_keep_period_alignment_and_metric_detail_formula():
    trends = _bundle()["financial_trends"]

    assert [period["key"] for period in trends["periods"]] == ["FY23", "FY24", "FY25"]
    assert len(trends["metric_details"]["revenue"]) == 3
    assert (
        trends["metric_details"]["revenue"][-1]["formula"] == "Reported financial statement value"
    )
