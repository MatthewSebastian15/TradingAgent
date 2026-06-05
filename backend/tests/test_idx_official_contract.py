from __future__ import annotations

from tradingagents.dataflows.idx_official import (
    get_idx_company_profile,
    get_idx_corporate_actions,
    get_idx_financial_statements,
    get_idx_shareholders,
)


def test_idx_official_contract_returns_structured_unavailable():
    profile = get_idx_company_profile("BBCA.JK")
    financials = get_idx_financial_statements("BBCA.JK")
    shareholders = get_idx_shareholders("BBCA.JK")
    actions = get_idx_corporate_actions("BBCA.JK")

    assert profile["status"] == "source_unavailable"
    assert financials["source"] == "idx_official"
    assert shareholders["shareholders"] == []
    assert actions["corporate_actions"] == []
