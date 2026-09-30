from __future__ import annotations

import threading
from types import SimpleNamespace

from tradingagents.agents.schemas import DebateArgument
from tradingagents.dataflows.providers.config import set_config
from tradingagents.pipeline_balanced.debate import _run_debate_phase
from tradingagents.pipeline_balanced.types import AnalystReport, LLMBudget


class _RecordingLLM:
    provider = "google"
    model_name = "gemini-test"

    def __init__(self, barrier: threading.Barrier):
        self.barrier = barrier
        self.prompts: list[str] = []
        self.lock = threading.Lock()

    def with_structured_output(self, schema):
        return self

    def invoke(self, prompt):
        with self.lock:
            self.prompts.append(prompt)
        self.barrier.wait(timeout=5)  # fails if the pair runs sequentially
        stance = "bear" if "You are the Bear Researcher" in prompt else "bull"
        return DebateArgument(
            stance=stance,
            thesis=f"The {stance} case for this ticker is supported by the reports provided.",
            evidence=["Evidence one from the reports.", "Evidence two from the reports."],
            counterargument="The opposing side understates the evidence in the reports.",
            risk_flags=["Execution risk."],
            confidence=0.6,
            consensus_signal=False,
        )


def _ctx(depth: str, extra_rounds: int, llm) -> SimpleNamespace:
    return SimpleNamespace(
        ticker=f"PAR{depth.upper()}",
        trade_date="2026-09-14",
        analysis_depth=depth,
        extra_debate_rounds=extra_rounds,
        time_horizon_text="1 month",
        llm_budget=LLMBudget(limit=20),
        pipeline_timings={},
        progress_callback=None,
        cancel_check=None,
        config={"llm_exact_cache_enabled": False},
        llm_for=lambda name: llm,
    )


def _run(ctx):
    report = AnalystReport(title="t", summary="s", key_points=["p"], risks=["r"], confidence=0.5)
    return _run_debate_phase(
        ctx,
        market_report=report,
        news_social_report=report,
        fundamentals_report=report,
        market_md="M",
        news_social_md="N",
        fundamentals_md="F",
        data_quality_json="{}",
    )


def test_balanced_openings_run_concurrently_and_independently():
    set_config({"llm_exact_cache_enabled": False})
    llm = _RecordingLLM(threading.Barrier(2))
    bull, bear, history = _run(_ctx("balanced", 0, llm))
    assert len(history) == 2
    assert bull.confidence == bear.confidence == 0.6  # no fallback: barrier was passed
    bear_prompt = next(p for p in llm.prompts if "You are the Bear Researcher" in p)
    assert "BULL CASE TO CHALLENGE" not in bear_prompt


def test_deep_rebuttals_are_symmetric_and_parallel():
    set_config({"llm_exact_cache_enabled": False})
    llm = _RecordingLLM(threading.Barrier(2))
    bull, bear, history = _run(_ctx("deep", 1, llm))
    assert len(history) == 4
    assert bull.confidence == bear.confidence == 0.6  # no fallback: barrier was passed
    rebuttals = [p for p in llm.prompts if "Prior debate to refine" in p]
    assert len(rebuttals) == 2
    assert any(
        "You are the Bear Researcher" in p and "BULL CASE TO CHALLENGE" in p for p in rebuttals
    )


def test_run_pair_raises_without_waiting_for_the_other_side():
    import time

    import pytest

    from tradingagents.pipeline_balanced.debate import _run_pair

    release = threading.Event()

    def boom():
        raise RuntimeError("cancelled")

    def slow():
        release.wait(5)
        return 1

    started = time.monotonic()
    with pytest.raises(RuntimeError):
        _run_pair({"llm_exact_cache_enabled": False}, boom, slow)
    elapsed = time.monotonic() - started
    release.set()
    assert elapsed < 2
