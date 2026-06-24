from __future__ import annotations

import os

import psycopg
import pytest

from config import ANALYSIS_DATABASE_URL
from services.analysis_repository_postgres import PostgresAnalysisRepository

pytestmark = [
    pytest.mark.postgres,
    pytest.mark.skipif(
        not os.environ.get("ANALYSIS_DATABASE_URL"),
        reason="ANALYSIS_DATABASE_URL not set; Postgres tests are opt-in.",
    ),
]

_TEST_OWNER = "owner:test"
_OTHER_OWNER = "owner:other"


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


@pytest.fixture
def repository():
    with psycopg.connect(ANALYSIS_DATABASE_URL) as conn:
        conn.execute("TRUNCATE analyses")
        conn.commit()
    return PostgresAnalysisRepository(max_rows=10)


def test_repository_save_get_list_and_job_lookup(repository):
    result = _result()

    assert (
        repository.save_analysis(
            result=result, request_payload={"ticker": "AAPL"}, job_id="job-1", owner_id=_TEST_OWNER
        )
        is True
    )
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


def test_repository_owner_isolation(repository):
    repository.save_analysis(result=_result("req-a"), owner_id=_TEST_OWNER)
    repository.save_analysis(result=_result("req-b"), owner_id=_OTHER_OWNER)

    assert repository.get_analysis("req-a", owner_id=_OTHER_OWNER) is None
    assert [i["request_id"] for i in repository.list_analyses(owner_id=_TEST_OWNER)] == ["req-a"]
    assert [i["request_id"] for i in repository.list_analyses(owner_id=_OTHER_OWNER)] == ["req-b"]


def test_repository_filters_deletes_and_clears(repository):
    repository.save_analysis(result=_result("req-aapl", "AAPL"), owner_id=_TEST_OWNER)
    repository.save_analysis(result=_result("req-msft", "MSFT"), owner_id=_TEST_OWNER)

    assert [
        item["request_id"] for item in repository.list_analyses(ticker="aapl", owner_id=_TEST_OWNER)
    ] == ["req-aapl"]
    assert repository.delete_analysis("req-aapl", owner_id=_TEST_OWNER) is True
    assert repository.delete_analysis("req-aapl", owner_id=_TEST_OWNER) is False
    assert repository.delete_all_analyses(owner_id=_TEST_OWNER) == 1
    assert repository.list_analyses(owner_id=_TEST_OWNER) == []


def test_repository_list_clamps_limit(repository):
    for i in range(3):
        repository.save_analysis(
            result=_result(f"req-{i}", analysis_created_at=f"2026-05-2{i}T08:00:00+00:00"),
            owner_id=_TEST_OWNER,
        )
    # Limit clamps to >=1; an oversized limit still returns at most 100.
    assert len(repository.list_analyses(limit=999, owner_id=_TEST_OWNER)) == 3
    assert len(repository.list_analyses(limit=1, owner_id=_TEST_OWNER)) == 1


def test_repository_evicts_old_rows():
    with psycopg.connect(ANALYSIS_DATABASE_URL) as conn:
        conn.execute("TRUNCATE analyses")
        conn.commit()
    repository = PostgresAnalysisRepository(max_rows=2)
    repository.save_analysis(
        result=_result("req-1", analysis_created_at="2026-05-26T08:00:00+00:00"),
        owner_id=_TEST_OWNER,
    )
    repository.save_analysis(
        result=_result("req-2", analysis_created_at="2026-05-27T08:00:00+00:00"),
        owner_id=_TEST_OWNER,
    )
    repository.save_analysis(
        result=_result("req-3", analysis_created_at="2026-05-28T08:00:00+00:00"),
        owner_id=_TEST_OWNER,
    )

    assert [item["request_id"] for item in repository.list_analyses(owner_id=_TEST_OWNER)] == [
        "req-3",
        "req-2",
    ]
    assert repository.get_analysis("req-1", owner_id=_TEST_OWNER) is None


def test_repository_rejects_invalid_result(repository):
    assert repository.save_analysis(result={"ticker": "AAPL"}, owner_id=_TEST_OWNER) is False
    assert repository.save_analysis(result={"request_id": "req-1"}, owner_id=_TEST_OWNER) is False
    assert (
        repository.save_analysis(
            result={"request_id": "req-2", "ticker": "AAPL", "error": "failed"},
            owner_id=_TEST_OWNER,
        )
        is False
    )
    assert repository.list_analyses(owner_id=_TEST_OWNER) == []


def test_repository_marks_exports(repository):
    repository.save_analysis(result=_result(), owner_id=_TEST_OWNER)

    assert repository.mark_exported("req-1", "html", owner_id=_TEST_OWNER) is True
    assert repository.mark_exported("req-1", "pdf", owner_id=_TEST_OWNER) is True
    assert repository.mark_exported("req-1", "csv", owner_id=_TEST_OWNER) is False

    item = repository.list_analyses(owner_id=_TEST_OWNER)[0]
    assert item["exported_html_at"]
    assert item["exported_pdf_at"]


def test_repository_requires_owner_scope(repository):
    with pytest.raises(ValueError):
        repository.save_analysis(result=_result(), owner_id="")
    with pytest.raises(ValueError):
        repository.list_analyses(owner_id="")
