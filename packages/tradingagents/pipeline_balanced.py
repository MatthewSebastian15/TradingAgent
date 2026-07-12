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
