from __future__ import annotations

import json
import logging
from typing import Any, Optional, TypeVar

from pydantic import BaseModel

from tradingagents.agents.utils.structured import bind_structured
from tradingagents.dataflows.config import get_config
from tradingagents.llm_clients import create_llm_client
from tradingagents.pipeline_balanced_data import _check_cancel
from tradingagents.pipeline_balanced_types import (
    AnalysisCancelledError,
    AnalystReport,
    LLMBudget,
    ResearchPlanLite,
    RiskCommitteeReport,
)
from tradingagents.utils_resilience import call_with_timeout

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def _provider_kwargs(config: dict[str, Any]) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    if config.get("timeout"):
        kwargs["timeout"] = config.get("timeout")
    if config.get("provider_sdk_max_retries") is not None:
        kwargs["max_retries"] = config.get("provider_sdk_max_retries")

    provider = str(config.get("llm_provider", "")).lower()
    if provider == "google" and config.get("google_thinking_level"):
        kwargs["thinking_level"] = config.get("google_thinking_level")
    if provider == "openai" and config.get("openai_reasoning_effort"):
        kwargs["reasoning_effort"] = config.get("openai_reasoning_effort")
    if provider == "anthropic" and config.get("anthropic_effort"):
        kwargs["effort"] = config.get("anthropic_effort")
    return kwargs


def _create_llms(config: dict[str, Any]) -> tuple[Any, Any]:
    kwargs = _provider_kwargs(config)
    quick_client = create_llm_client(
        provider=config["llm_provider"],
        model=config["quick_think_llm"],
        base_url=config.get("backend_url"),
        **kwargs,
    )
    deep_client = create_llm_client(
        provider=config["llm_provider"],
        model=config["deep_think_llm"],
        base_url=config.get("backend_url"),
        **kwargs,
    )
    return quick_client.get_llm(), deep_client.get_llm()


def _coerce_structured(raw: Any, schema: type[T]) -> Optional[T]:
    if raw is None:
        return None
    if isinstance(raw, schema):
        return raw
    try:
        if isinstance(raw, dict):
            return schema.model_validate(raw)
        if hasattr(raw, "model_dump"):
            return schema.model_validate(raw.model_dump())
        content = getattr(raw, "content", raw)
        if isinstance(content, str):
            cleaned = content.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.strip("`")
                cleaned = cleaned.removeprefix("json").strip()
            return schema.model_validate_json(cleaned)
    except Exception:
        return None
    return None


def _invoke_once(
    llm: Any,
    schema: type[T],
    prompt: str,
    fallback: T,
    agent_name: str,
    budget: LLMBudget | None = None,
    cancel_check=None,
) -> T:
    """Call the LLM once for a structured result while enforcing budget."""
    _check_cancel(cancel_check)
    if budget is not None and not budget.consume(agent_name):
        return fallback

    structured = bind_structured(llm, schema, agent_name)
    try:
        def invoke_model() -> Any:
            if structured is not None:
                return structured.invoke(prompt)
            return llm.invoke(prompt + "\n\nReturn only valid JSON matching this schema: " + json.dumps(schema.model_json_schema()))

        timeout_seconds = max(1, int(get_config().get("timeout", 60)))
        result = call_with_timeout(
            invoke_model,
            timeout_seconds=timeout_seconds,
            service_name=f"llm:{agent_name}",
        )
        _check_cancel(cancel_check)
        parsed = _coerce_structured(result, schema)
        if parsed is not None:
            return parsed
        logger.warning("%s returned unparseable structured output. Using local fallback.", agent_name)
    except AnalysisCancelledError:
        raise
    except Exception as exc:
        logger.warning("%s LLM call failed in balanced pipeline: %s", agent_name, exc)
    return fallback


def _fallback_report(title: str, summary: str) -> AnalystReport:
    return AnalystReport(
        title=title,
        summary=summary,
        key_points=[summary],
        risks=["Data quality should be verified before trading."],
        confidence=0.35,
    )


def _report_to_markdown(report: AnalystReport) -> str:
    key_points = "\n".join(f"- {item}" for item in report.key_points) or "- No key points returned."
    risks = "\n".join(f"- {item}" for item in report.risks) or "- No major risks returned."
    return "\n".join(
        [
            f"## {report.title}",
            "",
            report.summary,
            "",
            "### Key Points",
            key_points,
            "",
            "### Risks",
            risks,
            "",
            f"Confidence: {report.confidence:.2f}",
        ]
    )


def _research_plan_to_markdown(plan: ResearchPlanLite) -> str:
    return "\n".join(
        [
            f"**Recommendation**: {plan.recommendation.value}",
            f"**Confidence**: {plan.confidence:.2f}",
            "",
            f"**Rationale**: {plan.rationale}",
            "",
            f"**Strategic Actions**: {plan.strategic_actions}",
        ]
    )


def _risk_to_markdown(report: RiskCommitteeReport) -> str:
    risks = "\n".join(f"- {item}" for item in report.key_risks) or "- No major risks returned."
    return "\n".join(
        [
            f"**Overall Risk Level**: {report.overall_risk_level}",
            f"**Confidence**: {report.confidence:.2f}",
            "",
            f"**Aggressive View**: {report.aggressive_view}",
            "",
            f"**Neutral View**: {report.neutral_view}",
            "",
            f"**Conservative View**: {report.conservative_view}",
            "",
            "**Key Risks**:",
            risks,
            "",
            f"**Mitigation Plan**: {report.mitigation_plan}",
        ]
    )
