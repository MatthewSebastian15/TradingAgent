"""Shared test helpers for replacing backend runtime state."""

from __future__ import annotations

from analysis_cache import AnalysisJobStore, AnalysisResultCache, InFlightRegistry


def install_analysis_runtime(monkeypatch, job_store: AnalysisJobStore | None = None):
    """Install a fresh analysis runtime on app.state for one test.

    This is the one supported way for tests to replace analysis runtime state.
    Returns the installed AnalysisRuntimeState so tests can reach the job store
    and result cache.
    """
    from main import app
    from routes import jobs

    runtime = jobs.AnalysisRuntimeState(
        result_cache=AnalysisResultCache(ttl_seconds=60, max_entries=16),
        in_flight=InFlightRegistry(),
        job_store=job_store or AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10),
    )
    monkeypatch.setattr(app.state, "analysis_runtime", runtime, raising=False)
    return runtime
