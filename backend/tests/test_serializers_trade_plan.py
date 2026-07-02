"""Unit tests for routes/serializers_trade_plan.py.

The serializer submodules are linked by importing routes.serializers_analysis
(it injects shared helpers into each module's namespace), so import that first.
"""

from __future__ import annotations

from types import SimpleNamespace

import routes.serializers_analysis  # noqa: F401  (links serializer modules)
from routes.serializers_trade_plan import (
    _empty_trade_contract,
    _new_entry_action,
    _portfolio_trade_fields,
    _portfolio_value_from_payload,
    _position_size_hint,
    _rebalancing_action,
)


def test_empty_trade_contract_defaults_to_hold_without_position():
    contract = _empty_trade_contract({}, None)
    assert contract["final_decision"] == "Hold"
    assert contract["trade_plan_valid"] is False
    assert contract["has_existing_position"] is False
    assert contract["new_entry_action"] == "Wait for valid entry setup"
    assert contract["position_size_hint"] == "0% allocation until setup improves."
    assert contract["validation_warnings"] == []


def test_empty_trade_contract_keeps_existing_position_fields():
    pd_obj = SimpleNamespace(
        has_existing_position=True,
        position_action="Hold position",
        new_entry_action=None,
        position_size_hint=None,
        position_quantity=100.0,
        average_entry_price=50.0,
    )
    contract = _empty_trade_contract({}, pd_obj)
    assert contract["has_existing_position"] is True
    assert contract["position_action"] == "Hold position"
    assert contract["position_quantity"] == 100.0
    assert contract["new_entry_action"] == "No new entry; maintain existing position"


def test_actionable_valid_plan_gets_fixed_risk_reward():
    pd_obj = SimpleNamespace(
        trade_plan_valid=True,
        has_existing_position=False,
        position_quantity=None,
        average_entry_price=None,
        new_entry_action="Enter at support",
        rebalancing_action=None,
        position_size_hint="5% allocation",
        risk_reward_ratio=None,
        risk_reward_display=None,
    )
    fields = _portfolio_trade_fields(pd_obj, "Buy")
    assert fields["risk_reward_ratio"] == 3.0
    assert fields["risk_reward_display"] == "1:3"
    assert fields["trade_plan_valid"] is True


def test_hold_decision_keeps_raw_risk_reward():
    pd_obj = SimpleNamespace(
        trade_plan_valid=True,
        has_existing_position=False,
        position_quantity=None,
        average_entry_price=None,
        new_entry_action=None,
        rebalancing_action=None,
        position_size_hint=None,
        risk_reward_ratio=None,
        risk_reward_display=None,
    )
    fields = _portfolio_trade_fields(pd_obj, "Hold")
    assert fields["risk_reward_ratio"] is None
    assert fields["risk_reward_display"] is None


def test_missing_partial_fields_get_safe_default_texts():
    empty = SimpleNamespace(new_entry_action=None, rebalancing_action=None, position_size_hint=None)
    assert _new_entry_action(empty, False) == "Wait for valid entry setup"
    assert _new_entry_action(empty, True) == "No new entry; maintain existing position"
    assert _rebalancing_action(empty, False) == "No position to rebalance"
    assert _rebalancing_action(empty, True) == "Maintain position"
    assert _position_size_hint(empty, False) == "0% allocation until setup improves."


def test_portfolio_value_from_payload_money_coercion():
    assert _portfolio_value_from_payload({"portfolio_value": "10000.50"}) == 10000.50
    assert _portfolio_value_from_payload({"portfolio_value": None, "account_value": 500}) == 500
    assert _portfolio_value_from_payload({"portfolio_value": -1}) is None
    assert _portfolio_value_from_payload({"portfolio_value": "not-money"}) is None
    assert _portfolio_value_from_payload({}) is None
    assert _portfolio_value_from_payload({"analysis_params": {"portfolio_value": "250.0"}}) == 250.0
