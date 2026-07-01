from __future__ import annotations

import json
import logging
from typing import Any, TypeVar

from pydantic import BaseModel

from tradingagents.agents.utils.structured import bind_structured
from tradingagents.dataflows.providers.config import get_config
from tradingagents.dataflows.providers.errors import ErrorCode
from tradingagents.llm.llm_router import create_llms as _router_create_llms
from tradingagents.llm.llm_router import provider_kwargs as _router_provider_kwargs
from tradingagents.llm_cache.exact_cache import get_exact_llm_cache
from tradingagents.llm_cache.keys import build_exact_cache_key
from tradingagents.llm_optimization.usage import (
    LLMUsageRecord,
    Timer,
    estimate_tokens_from_text,
    extract_usage_metadata,
    get_llm_identity,
    normalize_usage_numbers,
    record_usage,
)
from tradingagents.pipeline.orchestrator import _check_cancel
from tradingagents.pipeline_balanced_types import (
    AnalysisCancelledError,
    AnalystReport,
    LLMBudget,
    ResearchPlanLite,
    RiskCommitteeReport,
)

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def _provider_kwargs(config: dict[str, Any]) -> dict[str, Any]:
    return _router_provider_kwargs(config)


def _create_llms(config: dict[str, Any]) -> tuple[Any, Any]:
    return _router_create_llms(config)


def _coerce_with_error(raw: Any, schema: type[T]) -> tuple[T | None, str | None]:
    """Coerce a raw model response into the schema, returning any validation error."""
    if raw is None:
        return None, "empty response"
    if isinstance(raw, schema):
        return raw, None
    try:
        if isinstance(raw, dict):
            return schema.model_validate(raw), None
        if hasattr(raw, "model_dump"):
            return schema.model_validate(raw.model_dump()), None
        content = getattr(raw, "content", raw)
        if isinstance(content, str):
            cleaned = content.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.strip("`")
                cleaned = cleaned.removeprefix("json").strip()
            return schema.model_validate_json(cleaned), None
    except Exception as exc:
        return None, str(exc)[:300]
    return None, "unsupported response type"


def _coerce_structured(raw: Any, schema: type[T]) -> T | None:
    return _coerce_with_error(raw, schema)[0]


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

    provider, model = get_llm_identity(llm)
    timer = Timer()
    usage_record = LLMUsageRecord(
        agent_name=agent_name,
        provider=provider,
        model=model,
        schema_name=schema.__name__,
        prompt_chars=len(prompt or ""),
        estimated_input_tokens=estimate_tokens_from_text(prompt or ""),
    )

    config = get_config()
    exact_cache = get_exact_llm_cache(config)
    exact_cache_key = build_exact_cache_key(
        provider=provider,
        model=model,
        agent_name=agent_name,
        schema_name=schema.__name__,
        prompt=prompt,
    )
    if exact_cache is not None:
        cached = exact_cache.get(exact_cache_key, schema)
        if cached is not None:
            usage_record.cache_layer = "exact"
            usage_record.cache_hit = True
            usage_record.parse_success = True
            usage_record.latency_ms = timer.elapsed_ms()
            record_usage(usage_record)
            return cached

    # One parse-repair retry loop: on unparseable structured output, re-invoke
    # with the validation error appended before giving up to the local fallback.
    # Bounded by llm_max_retries; every attempt is counted against the budget.
    max_attempts = 1 + max(0, int(config.get("llm_max_retries", 1)))
    structured = bind_structured(llm, schema, agent_name)
    repair_hint = ""

    for attempt in range(max_attempts):
        if budget is not None and not budget.consume(agent_name):
            usage_record.fallback_used = True
            usage_record.error = ErrorCode.LLM_BUDGET_EXCEEDED
            usage_record.latency_ms = timer.elapsed_ms()
            record_usage(usage_record)
            return fallback

        try:
            if structured is not None:
                result = structured.invoke(prompt + repair_hint)
            else:
                result = llm.invoke(
                    prompt
                    + repair_hint
                    + "\n\nReturn only valid JSON matching this schema: "
                    + json.dumps(schema.model_json_schema())
                )
            _check_cancel(cancel_check)
            metadata = extract_usage_metadata(result)
            output_tokens, cached_input_tokens = normalize_usage_numbers(metadata)
            usage_record.output_tokens = output_tokens
            usage_record.cached_input_tokens = cached_input_tokens

            parsed, parse_error = _coerce_with_error(result, schema)
            if parsed is not None:
                if exact_cache is not None:
                    exact_cache.set(exact_cache_key, parsed)
                usage_record.parse_success = True
                if attempt > 0:
                    usage_record.extra["repaired_on_attempt"] = attempt + 1
                usage_record.latency_ms = timer.elapsed_ms()
                record_usage(usage_record)
                return parsed

            logger.warning(
                "%s returned unparseable structured output (attempt %d/%d): %s",
                agent_name,
                attempt + 1,
                max_attempts,
                parse_error,
            )
            repair_hint = (
                f"\n\nYour previous output failed validation: {parse_error}. "
                "Return only valid JSON for this schema, with no prose or code fences."
            )
        except AnalysisCancelledError:
            raise
        except Exception as exc:
            logger.warning("%s LLM call failed in balanced pipeline: %s", agent_name, exc)
            usage_record.fallback_used = True
            usage_record.error = str(exc)
            usage_record.latency_ms = timer.elapsed_ms()
            record_usage(usage_record)
            return fallback

    usage_record.fallback_used = True
    usage_record.error = "unparseable_structured_output"
    if budget is not None:
        budget.record_warning(
            ErrorCode.LLM_SCHEMA_INVALID,
            f"{agent_name} returned invalid structured output after "
            f"{max_attempts} attempt(s); fallback used.",
        )
    usage_record.latency_ms = timer.elapsed_ms()
    record_usage(usage_record)
    return fallback


def _fallback_report(title: str, summary: str) -> AnalystReport:
    return AnalystReport(
        title=title,
        summary=summary,
        key_points=[summary],
        risks=["Data quality should be verified before trading."],
        confidence=0.0,
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
