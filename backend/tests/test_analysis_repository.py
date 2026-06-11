from __future__ import annotations

import pytest

from services.analysis_repository import AnalysisRepository

_TEST_OWNER = "owner:test"


def _result(request_id: str = "req-1", ticker: str = "AAPL", **overrides):
    result = {
        "request_id": request_id,
        "ticker": ticker,
        "market": "US",
        "trade_date": "2026-05-28",
        "analysis_created_at": "2026-05-28T08:00:00+00:00",
        "analysis_depth": "balanced",
        "response_detail": "full",
        "time_horizon_months": 1,
        "final_decision": "Buy",
        "decision": "Buy",
        "current_price": 185.25,
        "entry_price": 184.5,
        "stop_loss": 178.9,
        "take_profit": 201.3,
        "risk_reward_display": "1:3",
    }
    result.update(overrides)
    return result


def test_repository_save_get_list_and_job_lookup(tmp_path):
    repository = AnalysisRepository(str(tmp_path / "analysis.sqlite3"), max_rows=10)
    result = _result()

    assert repository.save_analysis(result=result, request_payload={"ticker": "AAPL"}, job_id="job-1", owner_id=_TEST_OWNER) is True
    assert repository.get_analysis("req-1", owner_id=_TEST_OWNER) == result
    assert repository.get_analysis_by_job_id("job-1", owner_id=_TEST_OWNER) == result

    record = repository.get_analysis_record_by_job_id("job-1", owner_id=_TEST_OWNER)
    assert record is not None
    assert record["request_id"] == "req-1"
    assert record["request_payload"] == {"ticker": "AAPL"}
    assert record["result"] == result

    items = repository.list_analyses(limit=5, owner_id=_TEST_OWNER)
    assert items[0]["request_id"] == "req-1"
    assert items[0]["job_id"] == "job-1"
    assert items[0]["ticker"] == "AAPL"
    assert items[0]["analysis_created_at"] == result["analysis_created_at"]
    assert "result_json" not in items[0]


def test_repository_filters_deletes_and_clears(tmp_path):
    repository = AnalysisRepository(str(tmp_path / "analysis.sqlite3"), max_rows=10)
    repository.save_analysis(result=_result("req-aapl", "AAPL"), owner_id=_TEST_OWNER)
    repository.save_analysis(result=_result("req-msft", "MSFT"), owner_id=_TEST_OWNER)

    assert [item["request_id"] for item in repository.list_analyses(ticker="aapl", owner_id=_TEST_OWNER)] == ["req-aapl"]
    assert repository.delete_analysis("req-aapl", owner_id=_TEST_OWNER) is True
    assert repository.delete_analysis("req-aapl", owner_id=_TEST_OWNER) is False
    assert repository.delete_all_analyses(owner_id=_TEST_OWNER) == 1
    assert repository.list_analyses(owner_id=_TEST_OWNER) == []


def test_repository_evicts_old_rows(tmp_path):
    repository = AnalysisRepository(str(tmp_path / "analysis.sqlite3"), max_rows=2)
    repository.save_analysis(result=_result("req-1", analysis_created_at="2026-05-26T08:00:00+00:00"), owner_id=_TEST_OWNER)
    repository.save_analysis(result=_result("req-2", analysis_created_at="2026-05-27T08:00:00+00:00"), owner_id=_TEST_OWNER)
    repository.save_analysis(result=_result("req-3", analysis_created_at="2026-05-28T08:00:00+00:00"), owner_id=_TEST_OWNER)

    assert [item["request_id"] for item in repository.list_analyses(owner_id=_TEST_OWNER)] == ["req-3", "req-2"]
    assert repository.get_analysis("req-1", owner_id=_TEST_OWNER) is None


def test_repository_rejects_invalid_result(tmp_path):
    repository = AnalysisRepository(str(tmp_path / "analysis.sqlite3"), max_rows=10)

    assert repository.save_analysis(result={"ticker": "AAPL"}, owner_id=_TEST_OWNER) is False
    assert repository.save_analysis(result={"request_id": "req-1"}, owner_id=_TEST_OWNER) is False
    assert repository.save_analysis(result={"request_id": "req-2", "ticker": "AAPL", "error": "failed"}, owner_id=_TEST_OWNER) is False
    assert repository.list_analyses(owner_id=_TEST_OWNER) == []


def test_repository_marks_exports(tmp_path):
    repository = AnalysisRepository(str(tmp_path / "analysis.sqlite3"), max_rows=10)
    repository.save_analysis(result=_result(), owner_id=_TEST_OWNER)

    assert repository.mark_exported("req-1", "html", owner_id=_TEST_OWNER) is True
    assert repository.mark_exported("req-1", "pdf", owner_id=_TEST_OWNER) is True
    assert repository.mark_exported("req-1", "csv", owner_id=_TEST_OWNER) is False

    item = repository.list_analyses(owner_id=_TEST_OWNER)[0]
    assert item["exported_html_at"]
    assert item["exported_pdf_at"]


def test_repository_requires_owner_scope(tmp_path):
    repository = AnalysisRepository(str(tmp_path / "analysis.sqlite3"), max_rows=10)

    with pytest.raises(ValueError):
        repository.save_analysis(result=_result(), owner_id="")
    with pytest.raises(ValueError):
        repository.list_analyses(owner_id="")


def test_repository_schema_owner_id_is_not_nullable(tmp_path):
    repository = AnalysisRepository(str(tmp_path / "analysis.sqlite3"), max_rows=10)

    with repository._connect() as conn:
        owner_column = next(row for row in conn.execute("PRAGMA table_info(analyses)") if row["name"] == "owner_id")
        indexes = {row["name"] for row in conn.execute("PRAGMA index_list(analyses)")}

    assert int(owner_column["notnull"]) == 1
    assert "idx_analyses_owner_created_at" in indexes
    assert "idx_analyses_owner_request_id" in indexes
