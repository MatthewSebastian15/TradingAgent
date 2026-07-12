"""Facade for the balanced TradingAgents pipeline.

The implementation is split by concern:
- pipeline/orchestrator.py: deterministic market-data collection orchestration
- pipeline_balanced_prompts.py: long prompt templates
- pipeline_balanced_llm.py: LLM invocation, local fallbacks, and render helpers
- pipeline_balanced_progress.py: SSE/progress event helpers
- pipeline_balanced_orchestrator.py: the pipeline control flow
- pipeline_balanced_debate.py: debate and risk-committee phases
- pipeline_balanced_fallbacks.py: deterministic fallback texts (no LLM)

Only the public pipeline surface is exported here. Tests that need to stub
LLM calls or data collection patch the orchestrator module directly
(e.g. pipeline_balanced_orchestrator._invoke_once), which is read at call time.
"""

from __future__ import annotations

from tradingagents.pipeline.orchestrator import collect_market_data
from tradingagents.pipeline_balanced_orchestrator import run_balanced_pipeline
from tradingagents.pipeline_balanced_types import (
    AnalysisCancelledError,
    AnalystReport,
    CollectedData,
    LLMBudget,
    ProgressCallback,
    ResearchPlanLite,
    RiskCommitteeReport,
)

_REMOVED_PRIVATE_EXPORTS = {
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
    "_fallback_report",
    "_horizon_days",
    "_invoke_once",
    "_normalize_time_horizon_months",
    "_price_lookback_days",
    "_provider_kwargs",
    "_report_to_markdown",
    "_research_plan_to_markdown",
    "_risk_to_markdown",
    "_run_tracked",
    "_run_with_config",
    "_safe_data_field",
    "_time_horizon_label",
    "_truncate",
}


def __getattr__(name: str):  # pragma: no cover - temporary migration shim
    if name in _REMOVED_PRIVATE_EXPORTS:
        raise RuntimeError(
            f"tradingagents.pipeline_balanced.{name} was removed; import it from "
            "its home module and patch pipeline_balanced_orchestrator for stubs."
        )
    raise AttributeError(name)


__all__ = [
    "AnalysisCancelledError",
    "AnalystReport",
    "CollectedData",
    "LLMBudget",
    "ProgressCallback",
    "ResearchPlanLite",
    "RiskCommitteeReport",
    "collect_market_data",
    "run_balanced_pipeline",
]
