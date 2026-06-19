from __future__ import annotations

# ruff: noqa: F401, F821
import logging
import re
from dataclasses import asdict, is_dataclass
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import ValidationError

from analysis_cache import AnalysisCacheKey
from config import ANALYSIS_MODE, DEFAULT_ANALYSIS_DEPTH, llm
from routes.event_contract import PipelineAgent
from routes.validation import AnalysisRequest
from services.report_disclaimer import REPORT_DISCLAIMER

logger = logging.getLogger(__name__)

ACTIONABLE_DECISIONS = {"Buy", "Sell"}
FIXED_RR = 3.0
RISK_REWARD_DISPLAY = "1:3"


def _empty_trade_contract(
    final_state: dict[str, Any], pd_obj: object | None = None
) -> dict[str, Any]:
    current_price_fields = _get_current_price_fields(final_state, pd_obj)
    has_pos = bool(getattr(pd_obj, "has_existing_position", False)) if pd_obj is not None else False
    position_action = getattr(pd_obj, "position_action", None) if pd_obj is not None else None
    if not has_pos:
        position_action = None
    new_entry_action = getattr(pd_obj, "new_entry_action", None) if pd_obj is not None else None
    if not new_entry_action:
        new_entry_action = (
            "No new entry; maintain existing position" if has_pos else "Wait for valid entry setup"
        )
    position_size_hint = getattr(pd_obj, "position_size_hint", None) if pd_obj is not None else None
    if not position_size_hint:
        position_size_hint = (
            "Maintain current position size; no additional exposure suggested."
            if has_pos
            else "0% allocation until setup improves."
        )
    return {
        "llm_decision": None,
        "final_decision": "Hold",
        "decision_adjusted": False,
        "decision_adjusted_reason": None,
        "trade_plan_valid": False,
        "has_existing_position": has_pos,
        "position_quantity": getattr(pd_obj, "position_quantity", None)
        if pd_obj is not None
        else None,
        "average_entry_price": getattr(pd_obj, "average_entry_price", None)
        if pd_obj is not None
        else None,
        "position_action": position_action,
        "new_entry_action": new_entry_action,
        **current_price_fields,
        "risk_per_share": None,
        "reward_per_share": None,
        "risk_reward_display": None,
        "max_drawdown_min_pct": None,
        "max_drawdown_max_pct": None,
        "volatility_score": None,
        "position_size_hint": position_size_hint,
        "validation_warnings": [],
        "validation_warning_details": [],
    }


def _coerce_portfolio_decision(
    full_decision: str, pd_obj: object | None
) -> tuple[str, object | None, list[str]]:
    if pd_obj is None:
        return full_decision, None, []
    try:
        from tradingagents.agents.schemas import PortfolioDecision

        if isinstance(pd_obj, dict):
            pd_obj = PortfolioDecision.model_validate(pd_obj)
        return full_decision, pd_obj, []
    except (ImportError, AttributeError, TypeError, ValueError, ValidationError):
        logger.warning(
            "Portfolio decision payload could not be parsed; using fallback response", exc_info=True
        )
        return (
            full_decision or "",
            None,
            ["Portfolio decision payload could not be parsed; fallback response was used."],
        )


def _portfolio_trade_fields(pd_obj: object, final_decision: Any) -> dict[str, Any]:
    trade_plan_valid = bool(getattr(pd_obj, "trade_plan_valid", False))
    has_valid_actionable_trade = trade_plan_valid and final_decision in ACTIONABLE_DECISIONS
    has_existing_position = bool(getattr(pd_obj, "has_existing_position", False))
    position_action = getattr(pd_obj, "position_action", None) if has_existing_position else None
    return {
        "trade_plan_valid": trade_plan_valid,
        "has_existing_position": has_existing_position,
        "position_quantity": getattr(pd_obj, "position_quantity", None),
        "average_entry_price": getattr(pd_obj, "average_entry_price", None),
        "position_action": position_action,
        "new_entry_action": _new_entry_action(pd_obj, has_existing_position),
        "risk_reward_ratio": FIXED_RR
        if has_valid_actionable_trade
        else getattr(pd_obj, "risk_reward_ratio", None),
        "risk_reward_display": RISK_REWARD_DISPLAY
        if has_valid_actionable_trade
        else getattr(pd_obj, "risk_reward_display", None),
        "rebalancing_action": _rebalancing_action(pd_obj, has_existing_position),
        "position_size_hint": _position_size_hint(pd_obj, has_existing_position),
    }


def _new_entry_action(pd_obj: object, has_existing_position: bool) -> str:
    value = getattr(pd_obj, "new_entry_action", None)
    if value:
        return value
    return (
        "No new entry; maintain existing position"
        if has_existing_position
        else "Wait for valid entry setup"
    )


def _rebalancing_action(pd_obj: object, has_existing_position: bool) -> str:
    value = _enum_value(getattr(pd_obj, "rebalancing_action", None))
    if value:
        return value
    return "Maintain position" if has_existing_position else "No position to rebalance"


def _position_size_hint(pd_obj: object, has_existing_position: bool) -> str:
    value = getattr(pd_obj, "position_size_hint", None)
    if value:
        return value
    return (
        "Maintain current position size; no additional exposure suggested."
        if has_existing_position
        else "0% allocation until setup improves."
    )


def _portfolio_data_quality(
    pd_obj: object,
    common: dict[str, Any],
    current_price_fields: dict[str, Any],
) -> dict[str, Any]:
    return _complete_risk_engine_data_quality(
        getattr(pd_obj, "data_quality", None) or common["data_quality"],
        current_price=current_price_fields["current_price"],
        trade_plan_valid=bool(getattr(pd_obj, "trade_plan_valid", False)),
        decision_adjusted=bool(getattr(pd_obj, "decision_adjusted", False)),
        volatility_score=getattr(pd_obj, "volatility_score", None),
        llm_output_fallback="ok",
    )


def _portfolio_payload(
    *,
    full_decision: str,
    pd_obj: object,
    final_state: dict[str, Any],
    common: dict[str, Any],
) -> dict[str, Any]:
    rating = getattr(pd_obj, "rating", None)
    fallback_rating = _enum_value(rating)
    final_decision = (
        getattr(pd_obj, "final_decision", None)
        or getattr(pd_obj, "decision", None)
        or fallback_rating
    )
    current_price_fields = _get_current_price_fields(final_state, pd_obj)
    return {
        "decision": final_decision,
        "llm_decision": getattr(pd_obj, "llm_decision", None) or fallback_rating,
        "final_decision": final_decision,
        "decision_adjusted": bool(getattr(pd_obj, "decision_adjusted", False)),
        "decision_adjusted_reason": getattr(pd_obj, "decision_adjusted_reason", None),
        **_portfolio_trade_fields(pd_obj, final_decision),
        **current_price_fields,
        **_portfolio_summary_fields(full_decision, pd_obj, final_state),
        "data_quality": _portfolio_data_quality(pd_obj, common, current_price_fields),
        "validation_warnings": getattr(pd_obj, "validation_warnings", []) or [],
        "validation_warning_details": _validation_warning_details(
            getattr(pd_obj, "validation_warnings", []) or []
        ),
        **{key: value for key, value in common.items() if key != "data_quality"},
    }


def _portfolio_summary_fields(
    full_decision: str, pd_obj: object, final_state: dict[str, Any]
) -> dict[str, Any]:
    return {
        "full_decision": full_decision,
        "executive_summary": getattr(pd_obj, "executive_summary", None),
        "investment_thesis": getattr(pd_obj, "investment_thesis", None),
        "price_target": getattr(pd_obj, "price_target", None),
        "time_horizon": final_state.get("time_horizon") or getattr(pd_obj, "time_horizon", None),
        "confidence_score": getattr(pd_obj, "confidence_score", None),
        "confidence_breakdown": _model_to_dict(getattr(pd_obj, "confidence_breakdown", None))
        or None,
        "suggested_allocation_percent": getattr(pd_obj, "suggested_allocation_percent", None),
        "entry_price": getattr(pd_obj, "entry_price", None),
        "stop_loss": getattr(pd_obj, "stop_loss", None),
        "take_profit": getattr(pd_obj, "take_profit", None),
        "risk_per_share": getattr(pd_obj, "risk_per_share", None),
        "reward_per_share": getattr(pd_obj, "reward_per_share", None),
        "max_drawdown_estimate": getattr(pd_obj, "max_drawdown_estimate", None),
        "max_drawdown_min_pct": getattr(pd_obj, "max_drawdown_min_pct", None),
        "max_drawdown_max_pct": getattr(pd_obj, "max_drawdown_max_pct", None),
        "volatility_level": _enum_value(getattr(pd_obj, "volatility_level", None)),
        "volatility_score": getattr(pd_obj, "volatility_score", None),
        "position_sizing_reason": getattr(pd_obj, "position_sizing_reason", None),
        "key_reasons": getattr(pd_obj, "key_reasons", []) or [],
        "key_reasons_paragraph": getattr(pd_obj, "key_reasons_paragraph", None),
        "key_catalysts": getattr(pd_obj, "key_catalysts", []) or [],
        "invalidation_conditions": getattr(pd_obj, "invalidation_conditions", []) or [],
    }


def _sprint5_unavailable_entry_quality(reason: str) -> dict[str, Any]:
    return {
        "score": None,
        "label": None,
        "action": None,
        "drivers": [],
        "unavailable_reason": reason,
    }


def _entry_quality_payload(payload: dict[str, Any]) -> dict[str, Any]:
    existing = payload.get("entry_quality")
    if isinstance(existing, dict):
        return existing
    try:
        from tradingagents.technical.entry_quality import calculate_entry_quality

        technical_entry = (
            payload.get("technical_entry")
            if isinstance(payload.get("technical_entry"), dict)
            else {}
        )
        return calculate_entry_quality(
            {
                "current_price": payload.get("current_price"),
                "last_price": payload.get("last_price"),
                **(
                    payload.get("price_performance")
                    if isinstance(payload.get("price_performance"), dict)
                    else {}
                ),
            },
            {
                "entry_price": payload.get("entry_price"),
                "stop_loss": payload.get("stop_loss"),
                "take_profit": payload.get("take_profit"),
                "decision": payload.get("final_decision") or payload.get("decision"),
            },
            technical_entry,
        )
    except Exception:
        logger.exception("Failed to build entry_quality response contract")
        return _sprint5_unavailable_entry_quality("Entry quality could not be calculated.")


def _portfolio_value_from_payload(payload: dict[str, Any]) -> float | None:
    analysis_params = (
        payload.get("analysis_params") if isinstance(payload.get("analysis_params"), dict) else {}
    )
    for value in (
        payload.get("portfolio_value"),
        payload.get("portfolio_value_used"),
        payload.get("account_value"),
        analysis_params.get("portfolio_value"),
    ):
        try:
            if value is None or value == "":
                continue
            number = float(value)
        except (TypeError, ValueError):
            continue
        if number > 0:
            return number
    return None


def _position_sizing_payload(payload: dict[str, Any], req: AnalysisRequest) -> dict[str, Any]:
    existing = payload.get("position_sizing")
    if isinstance(existing, dict):
        return existing
    try:
        from tradingagents.dataflows.market.position_sizing import calculate_position_sizing

        market = req.market or payload.get("exchange") or "UNKNOWN"
        sizing = calculate_position_sizing(
            str(market),
            payload.get("entry_price"),
            payload.get("stop_loss"),
            _portfolio_value_from_payload(payload),
        )
        return asdict(sizing)
    except Exception:
        logger.exception("Failed to build position_sizing response contract")
        return {
            "market": req.market or payload.get("exchange") or "UNKNOWN",
            "quantity": None,
            "shares": None,
            "lot_size": None,
            "estimated_value": None,
            "risk_amount": None,
            "risk_per_unit": None,
            "portfolio_value_used": None,
            "risk_pct_used": 2.0,
            "note": None,
            "unavailable_reason": "Position sizing could not be calculated.",
        }


def _attach_sprint5_fields(payload: dict[str, Any], req: AnalysisRequest) -> dict[str, Any]:
    enriched = dict(payload)
    enriched["entry_quality"] = _entry_quality_payload(enriched)
    enriched["position_sizing"] = _position_sizing_payload(enriched, req)
    enriched["data_lineage"] = _data_lineage_payload(enriched)
    enriched["observability"] = {
        **(
            enriched.get("observability") if isinstance(enriched.get("observability"), dict) else {}
        ),
        "metrics_recorded": _record_observability_metrics(enriched),
    }
    return enriched
