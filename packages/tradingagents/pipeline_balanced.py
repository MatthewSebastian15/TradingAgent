"""Facade for the balanced TradingAgents pipeline.

The implementation is split by concern:
- pipeline/orchestrator.py: deterministic market-data collection orchestration
- pipeline_balanced_prompts.py: long prompt templates
- pipeline_balanced_llm.py: LLM invocation, local fallbacks, and render helpers
- pipeline_balanced_progress.py: SSE/progress event helpers
- pipeline_balanced_orchestrator.py: the pipeline control flow
"""

from __future__ import annotations

from tradingagents import pipeline_balanced_orchestrator as _orchestrator
from tradingagents.pipeline.orchestrator import (
    _call_yfinance_with_resilience,
    _check_cancel,
    _date_window,
    _extract_last_close_price,
    _extract_last_close_price_and_date,
    _horizon_days,
    _normalize_time_horizon_months,
    _price_lookback_days,
    _run_with_config,
    _safe_data_field,
    _time_horizon_label,
    _truncate,
    collect_market_data,
)
from tradingagents.pipeline_balanced_llm import (
    _coerce_structured,
    _create_llms,
    _fallback_report,
    _invoke_once,
    _provider_kwargs,
    _report_to_markdown,
    _research_plan_to_markdown,
    _risk_to_markdown,
)
from tradingagents.pipeline_balanced_progress import AGENT_LABELS as _AGENT_LABELS
from tradingagents.pipeline_balanced_progress import (
    _emit_data_quality,
    _emit_progress,
    _run_tracked,
)
from tradingagents.pipeline_balanced_types import (
    AnalysisCancelledError,
    AnalystReport,
    CollectedData,
    LLMBudget,
    ProgressCallback,
    ResearchPlanLite,
    RiskCommitteeReport,
)


def run_balanced_pipeline(*args, **kwargs):
    """Run the balanced pipeline while preserving patchable facade symbols."""
    _orchestrator._create_llms = _create_llms
    _orchestrator._collect_raw_market_data = collect_market_data
    _orchestrator._invoke_once = _invoke_once
    return _orchestrator.run_balanced_pipeline(*args, **kwargs)


__all__ = [
    "AnalysisCancelledError",
    "AnalystReport",
    "CollectedData",
    "LLMBudget",
    "ProgressCallback",
    "ResearchPlanLite",
    "RiskCommitteeReport",
    "_AGENT_LABELS",
    "_call_yfinance_with_resilience",
    "_check_cancel",
    "_coerce_structured",
    "_create_llms",
    "_date_window",
    "_emit_data_quality",
    "_emit_progress",
    "_extract_last_close_price",
    "_extract_last_close_price_and_date",
    "_horizon_days",
    "_normalize_time_horizon_months",
    "_price_lookback_days",
    "_fallback_report",
    "_invoke_once",
    "_provider_kwargs",
    "_report_to_markdown",
    "_research_plan_to_markdown",
    "_risk_to_markdown",
    "_run_tracked",
    "_run_with_config",
    "_safe_data_field",
    "_time_horizon_label",
    "_truncate",
    "collect_market_data",
    "run_balanced_pipeline",
]
