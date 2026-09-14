"""Facade for the balanced TradingAgents pipeline.

The implementation is split by concern:
- pipeline/orchestrator.py: deterministic market-data collection orchestration
- prompts.py: long prompt templates
- llm.py: LLM invocation, local fallbacks, and render helpers
- progress.py: SSE/progress event helpers
- orchestrator.py: the pipeline control flow
- debate.py: debate and risk-committee phases
- fallbacks.py: deterministic fallback texts (no LLM)

Only the public pipeline surface is exported here. Tests that need to stub
LLM calls or data collection patch the orchestrator module directly
(e.g. pipeline_balanced.orchestrator._invoke_once), which is read at call time.
"""

from __future__ import annotations

from tradingagents.pipeline.orchestrator import collect_market_data
from tradingagents.pipeline_balanced.orchestrator import run_balanced_pipeline
from tradingagents.pipeline_balanced.types import (
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
