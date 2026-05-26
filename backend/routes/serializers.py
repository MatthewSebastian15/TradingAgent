from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from analysis_cache import AnalysisCacheKey
from config import DEFAULT_ANALYSIS_DEPTH, llm
from routes.validation import AnalysisRequest

logger = logging.getLogger(__name__)

SUMMARY_FIELDS = {
    "decision",
    "executive_summary",
    "investment_thesis",
    "price_target",
    "time_horizon",
    "data_fetched_at",
    "confidence_score",
    "suggested_allocation_percent",
    "entry_price",
    "stop_loss",
    "take_profit",
    "risk_reward_ratio",
    "max_drawdown_estimate",
    "volatility_level",
    "rebalancing_action",
    "key_catalysts",
    "invalidation_conditions",
    "data_quality",
    "analysis_created_at",
    "analysis_depth",
    "time_horizon_months",
    "llm_call_budget",
    "llm_calls_used",
    "budget_exhausted",
    "agents_skipped",
}

AGENT_SEQUENCE = [
    ("data_collection", "Data Collection", "Fetching market data..."),
    ("market_analyst", "Market Analyst", "Reading price data and technical indicators..."),
    ("news_analyst", "News + Social Analyst", "Scanning headlines, macro events, and sentiment signals..."),
    ("fundamentals", "Fundamentals Analyst", "Reviewing financial statements and ratios..."),
    ("bull_researcher", "Bull Researcher", "Building or skipping the bullish investment case..."),
    ("bear_researcher", "Bear Researcher", "Building or skipping the bearish counterarguments..."),
    ("research_manager", "Research Manager", "Evaluating the debate and forming an investment plan..."),
    ("trader", "Trader", "Translating the plan into a transaction proposal..."),
    ("risk_analysts", "Risk Analysts", "Running or skipping risk debate..."),
    ("portfolio_manager", "Portfolio Manager", "Synthesizing all inputs into the final decision..."),
]


def parse_final_result(
    full_decision: str,
    pd_obj: object | None,
    portfolio_rating: object | None = None,
    final_state: dict | None = None,
) -> dict:
    """Convert the final agent state into API response fields."""
    final_state = final_state or {}
    if pd_obj is not None:
        try:
            from tradingagents.agents.schemas import PortfolioDecision

            if isinstance(pd_obj, dict):
                pd_obj = PortfolioDecision.model_validate(pd_obj)
        except Exception:
            full_decision = full_decision or ""
            pd_obj = None
    data_quality = final_state.get("data_quality")
    configured_time_horizon = final_state.get("time_horizon")
    common = {
        "analysis_depth": final_state.get("analysis_depth", DEFAULT_ANALYSIS_DEPTH),
        "time_horizon_months": final_state.get("time_horizon_months"),
        "data_fetched_at": final_state.get("data_fetched_at") or datetime.utcnow().isoformat(),
        "llm_call_budget": final_state.get("balanced_gemini_request_budget"),
        "llm_calls_used": final_state.get("balanced_gemini_calls_used"),
        "budget_exhausted": bool(final_state.get("budget_exhausted", False)),
        "agents_skipped": final_state.get("agents_skipped", []) or [],
        "data_quality": data_quality
        or {
            "price_data": "missing",
            "fundamentals": "missing",
            "news": "missing",
            "warnings": ["Pipeline did not return data quality metadata."],
        },
    }

    if pd_obj is None:
        return {
            "decision": None,
            "full_decision": full_decision,
            "executive_summary": None,
            "investment_thesis": None,
            "price_target": None,
            "time_horizon": configured_time_horizon,
            "confidence_score": None,
            "suggested_allocation_percent": None,
            "entry_price": None,
            "stop_loss": None,
            "take_profit": None,
            "risk_reward_ratio": None,
            "max_drawdown_estimate": None,
            "volatility_level": None,
            "position_sizing_reason": None,
            "rebalancing_action": None,
            "key_catalysts": [],
            "invalidation_conditions": [],
            **common,
        }

    rating_map = {}
    if portfolio_rating is not None:
        rating_map = {
            portfolio_rating.BUY: "Buy",
            portfolio_rating.OVERWEIGHT: "Buy",
            portfolio_rating.HOLD: "Hold",
            portfolio_rating.UNDERWEIGHT: "Sell",
            portfolio_rating.SELL: "Sell",
        }

    rating = getattr(pd_obj, "rating", None)
    fallback_rating = getattr(rating, "value", rating)

    return {
        "decision": rating_map.get(rating, fallback_rating),
        "full_decision": full_decision,
        "executive_summary": getattr(pd_obj, "executive_summary", None),
        "investment_thesis": getattr(pd_obj, "investment_thesis", None),
        "price_target": getattr(pd_obj, "price_target", None),
        "time_horizon": configured_time_horizon or getattr(pd_obj, "time_horizon", None),
        "confidence_score": getattr(pd_obj, "confidence_score", None),
        "suggested_allocation_percent": getattr(pd_obj, "suggested_allocation_percent", None),
        "entry_price": getattr(pd_obj, "entry_price", None),
        "stop_loss": getattr(pd_obj, "stop_loss", None),
        "take_profit": getattr(pd_obj, "take_profit", None),
        "risk_reward_ratio": getattr(pd_obj, "risk_reward_ratio", None),
        "max_drawdown_estimate": getattr(pd_obj, "max_drawdown_estimate", None),
        "volatility_level": getattr(
            getattr(pd_obj, "volatility_level", None), "value", getattr(pd_obj, "volatility_level", None)
        ),
        "position_sizing_reason": getattr(pd_obj, "position_sizing_reason", None),
        "rebalancing_action": getattr(pd_obj, "rebalancing_action", None),
        "key_catalysts": getattr(pd_obj, "key_catalysts", []) or [],
        "invalidation_conditions": getattr(pd_obj, "invalidation_conditions", []) or [],
        **common,
    }


def cache_key(req: AnalysisRequest) -> AnalysisCacheKey:
    return AnalysisCacheKey(
        ticker=req.ticker,
        trade_date=req.trade_date,
        provider=llm.provider,
        quick_model=llm.quick_think_llm,
        deep_model=llm.deep_think_llm,
        analysis_mode="balanced",
        analysis_depth=req.analysis_depth,
        time_horizon_months=req.time_horizon_months,
        max_debate_rounds=req.max_debate_rounds,
        response_detail=req.response_detail,
    )


def shape_result(result_fields: dict[str, Any], response_detail: str) -> dict[str, Any]:
    """Trim response payload for summary mode; keep debug metadata only in debug."""
    if response_detail == "summary":
        return {key: value for key, value in result_fields.items() if key in SUMMARY_FIELDS or key == "cache"}
    if response_detail == "debug":
        return result_fields
    return {key: value for key, value in result_fields.items() if key not in {"raw_agent_state"}}


def with_data_fetched_at(result_fields: dict[str, Any]) -> dict[str, Any]:
    stamped = dict(result_fields)
    stamped.setdefault("data_fetched_at", datetime.utcnow().isoformat())
    return stamped


def request_warnings(req: AnalysisRequest) -> list[str]:
    if req.analysis_depth == "fast" and req.max_debate_rounds > 1:
        return [
            "analysis_depth=fast skips the bull/bear and risk debate stages, so max_debate_rounds greater than 1 is ignored.",
        ]
    return []


def response_payload(request_id: str, req: AnalysisRequest, result_fields: dict) -> dict:
    payload = {
        "request_id": request_id,
        "ticker": req.ticker,
        "trade_date": req.trade_date,
        "analysis_created_at": datetime.utcnow().isoformat(),
        "analysis_depth": req.analysis_depth,
        "response_detail": req.response_detail,
        "agents_used": [agent[1] for agent in AGENT_SEQUENCE],
        **result_fields,
        "time_horizon_months": req.time_horizon_months,
    }
    warnings = request_warnings(req)
    if warnings:
        payload["warnings"] = warnings
    return payload


def log_request_accepted(mode: str, request_id: str, req: AnalysisRequest) -> None:
    logger.info(
        "Analysis %s accepted",
        mode,
        extra={
            "event": f"analysis_{mode}_accepted",
            "request_id": request_id,
            "ticker": req.ticker,
            "trade_date": req.trade_date,
            "time_horizon_months": req.time_horizon_months,
            "max_debate_rounds": req.max_debate_rounds,
            "analysis_depth": req.analysis_depth,
            "response_detail": req.response_detail,
        },
    )
