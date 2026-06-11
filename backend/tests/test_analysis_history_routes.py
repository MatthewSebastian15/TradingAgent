from __future__ import annotations

from owner_session import issue_owner_session, owner_identifier

_TEST_OWNER_IDENTIFIER = owner_identifier("0" * 32)


def _result(request_id: str, ticker: str = "AAPL"):
    return {
        "request_id": request_id,
        "ticker": ticker,
        "market": "US",
        "trade_date": "2026-05-28",
        "analysis_created_at": "2026-05-28T08:00:00+00:00",
        "decision": "Buy",
        "current_price": 185.25,
    }


def test_history_list_detail_filter_and_limit(client, analysis_repository):
    analysis_repository.save_analysis(result=_result("req-aapl", "AAPL"), job_id="job-aapl", owner_id=_TEST_OWNER_IDENTIFIER)
    analysis_repository.save_analysis(result=_result("req-msft", "MSFT"), job_id="job-msft", owner_id=_TEST_OWNER_IDENTIFIER)

    response = client.get("/api/analysis/history", params={"ticker": "aapl", "limit": 1})

    assert response.status_code == 200
    assert response.json()["items"] == [
        {
            "request_id": "req-aapl",
            "job_id": "job-aapl",
            "ticker": "AAPL",
            "market": "US",
            "trade_date": "2026-05-28",
            "time_horizon_months": None,
            "analysis_depth": None,
            "response_detail": None,
            "decision": "Buy",
            "display_signal": "Buy",
            "confidence_score": None,
            "confidence_tier": None,
            "recommendation": "Buy",
            "current_price": 185.25,
            "entry_price": None,
            "stop_loss": None,
            "take_profit": None,
            "rr_ratio": None,
            "source_summary": None,
            "status": "completed",
            "created_at": "2026-05-28T08:00:00+00:00",
            "analysis_created_at": "2026-05-28T08:00:00+00:00",
            "updated_at": response.json()["items"][0]["updated_at"],
            "exported_html_at": None,
            "exported_pdf_at": None,
        }
    ]

    detail = client.get("/api/analysis/history/req-aapl")
    assert detail.status_code == 200
    assert detail.json() == _result("req-aapl", "AAPL")


def test_history_is_isolated_across_valid_owner_sessions(client, analysis_repository):
    analysis_repository.save_analysis(result=_result("req-owner"), owner_id=_TEST_OWNER_IDENTIFIER)
    other_headers = {"x-owner-token": issue_owner_session()["owner_token"]}

    response = client.get("/api/analysis/history/req-owner", headers=other_headers)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_history_delete_is_isolated_across_valid_owner_sessions(client, analysis_repository):
    analysis_repository.save_analysis(result=_result("req-delete-owner"), owner_id=_TEST_OWNER_IDENTIFIER)
    other_headers = {"x-owner-token": issue_owner_session()["owner_token"]}

    response = client.delete("/api/analysis/history/req-delete-owner", headers=other_headers)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
    assert analysis_repository.get_analysis("req-delete-owner", owner_id=_TEST_OWNER_IDENTIFIER) == _result(
        "req-delete-owner"
    )


def test_legacy_ownerless_history_is_bound_on_first_valid_detail_access(client, analysis_repository):
    analysis_repository.save_analysis(result=_result("req-legacy"))

    assert analysis_repository.get_analysis("req-legacy", owner_id=_TEST_OWNER_IDENTIFIER) is None

    response = client.get("/api/analysis/history/req-legacy")
    other_headers = {"x-owner-token": issue_owner_session()["owner_token"]}
    other_response = client.get("/api/analysis/history/req-legacy", headers=other_headers)

    assert response.status_code == 200
    assert response.json() == _result("req-legacy")
    assert analysis_repository.get_analysis("req-legacy", owner_id=_TEST_OWNER_IDENTIFIER) == _result("req-legacy")
    assert other_response.status_code == 404
    assert other_response.json()["error"]["code"] == "NOT_FOUND"


def test_history_delete_one_and_clear_all(client, analysis_repository):
    analysis_repository.save_analysis(result=_result("req-1"), owner_id=_TEST_OWNER_IDENTIFIER)
    analysis_repository.save_analysis(result=_result("req-2"), owner_id=_TEST_OWNER_IDENTIFIER)

    deleted = client.delete("/api/analysis/history/req-1")
    cleared = client.delete("/api/analysis/history")

    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True, "request_id": "req-1"}
    assert cleared.status_code == 200
    assert cleared.json() == {"deleted": True, "deleted_count": 1}
    assert analysis_repository.list_analyses() == []


def test_history_detail_and_delete_return_404_for_unknown_result(client):
    detail = client.get("/api/analysis/history/missing")
    deleted = client.delete("/api/analysis/history/missing")

    assert detail.status_code == 404
    assert detail.json()["error"]["code"] == "NOT_FOUND"
    assert deleted.status_code == 404
    assert deleted.json()["error"]["code"] == "NOT_FOUND"
