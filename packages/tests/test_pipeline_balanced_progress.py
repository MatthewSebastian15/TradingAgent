import pytest

from tradingagents.pipeline_balanced_progress import AGENT_LABELS, _emit_progress, _run_tracked
from tradingagents.pipeline_balanced_types import AnalysisCancelledError


def test_emit_progress_event_shape():
    events = []
    _emit_progress(events.append, "market_analyst", "started", "working")
    event = events[0]
    assert event["agent_id"] == "market_analyst"
    assert event["agent_name"] == AGENT_LABELS["market_analyst"]
    assert event["status"] == "started"
    assert event["status_message"] == "working"
    assert event["timestamp"].endswith("Z")


def test_emit_progress_unknown_agent_and_none_callback():
    _emit_progress(None, "market_analyst", "started", "no-op")  # must not raise
    events = []
    _emit_progress(events.append, "custom_stage", "started", "msg")
    assert events[0]["agent_name"] == "Custom Stage"


def test_emit_progress_swallows_callback_errors():
    def broken(_event):
        raise RuntimeError("boom")

    _emit_progress(broken, "trader", "started", "msg")  # must not raise


def test_run_tracked_success_records_timing():
    events = []
    timings = {}
    result = _run_tracked(events.append, "trader", "start", lambda: 42, timings=timings)
    assert result == 42
    assert [event["status"] for event in events] == ["started", "completed"]
    assert timings["trader"]["status"] == "ok"
    assert timings["trader"]["warning"] is None


def test_run_tracked_failure_records_error_and_reraises():
    events = []
    timings = {}

    def boom():
        raise ValueError("bad")

    with pytest.raises(ValueError):
        _run_tracked(events.append, "trader", "start", boom, timings=timings)
    assert events[-1]["status"] == "failed"
    assert timings["trader"]["status"] == "error"


def test_run_tracked_cancellation_marked():
    timings = {}

    def cancelled():
        raise AnalysisCancelledError("stop")

    with pytest.raises(AnalysisCancelledError):
        _run_tracked(None, "trader", "start", cancelled, timings=timings)
    assert timings["trader"]["warning"] == "Agent was cancelled before completion."
