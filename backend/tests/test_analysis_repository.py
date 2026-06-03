from __future__ import annotations

from services.analysis_repository import AnalysisRepository


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

    assert repository.save_analysis(result=result, request_payload={"ticker": "AAPL"}, job_id="job-1") is True
    assert repository.get_analysis("req-1") == result
    assert repository.get_analysis_by_job_id("job-1") == result

    record = repository.get_analysis_record_by_job_id("job-1")
    assert record is not None
    assert record["request_id"] == "req-1"
    assert record["request_payload"] == {"ticker": "AAPL"}
    assert record["result"] == result

    items = repository.list_analyses(limit=5)
    assert items[0]["request_id"] == "req-1"
    assert items[0]["job_id"] == "job-1"
    assert items[0]["ticker"] == "AAPL"
    assert items[0]["analysis_created_at"] == result["analysis_created_at"]
    assert "result_json" not in items[0]


def test_repository_filters_deletes_and_clears(tmp_path):
    repository = AnalysisRepository(str(tmp_path / "analysis.sqlite3"), max_rows=10)
    repository.save_analysis(result=_result("req-aapl", "AAPL"))
    repository.save_analysis(result=_result("req-msft", "MSFT"))

    assert [item["request_id"] for item in repository.list_analyses(ticker="aapl")] == ["req-aapl"]
    assert repository.delete_analysis("req-aapl") is True
    assert repository.delete_analysis("req-aapl") is False
    assert repository.delete_all_analyses() == 1
    assert repository.list_analyses() == []


def test_repository_evicts_old_rows(tmp_path):
    repository = AnalysisRepository(str(tmp_path / "analysis.sqlite3"), max_rows=2)
    repository.save_analysis(result=_result("req-1", analysis_created_at="2026-05-26T08:00:00+00:00"))
    repository.save_analysis(result=_result("req-2", analysis_created_at="2026-05-27T08:00:00+00:00"))
    repository.save_analysis(result=_result("req-3", analysis_created_at="2026-05-28T08:00:00+00:00"))

    assert [item["request_id"] for item in repository.list_analyses()] == ["req-3", "req-2"]
    assert repository.get_analysis("req-1") is None


def test_repository_rejects_invalid_result(tmp_path):
    repository = AnalysisRepository(str(tmp_path / "analysis.sqlite3"), max_rows=10)

    assert repository.save_analysis(result={"ticker": "AAPL"}) is False
    assert repository.save_analysis(result={"request_id": "req-1"}) is False
    assert repository.save_analysis(result={"request_id": "req-2", "ticker": "AAPL", "error": "failed"}) is False
    assert repository.list_analyses() == []


def test_repository_marks_exports(tmp_path):
    repository = AnalysisRepository(str(tmp_path / "analysis.sqlite3"), max_rows=10)
    repository.save_analysis(result=_result())

    assert repository.mark_exported("req-1", "html") is True
    assert repository.mark_exported("req-1", "pdf") is True
    assert repository.mark_exported("req-1", "csv") is False

    item = repository.list_analyses()[0]
    assert item["exported_html_at"]
    assert item["exported_pdf_at"]
