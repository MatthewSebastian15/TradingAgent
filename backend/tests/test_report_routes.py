from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor

from analysis_cache import AnalysisCacheKey, AnalysisJobStore
from owner_session import issue_owner_session, owner_identifier

_TEST_OWNER_IDENTIFIER = owner_identifier("0" * 32)


def _cache_key(ticker: str = "NVDA") -> AnalysisCacheKey:
    return AnalysisCacheKey(
        ticker=ticker,
        trade_date="2026-05-26",
        provider="google",
        quick_model="test-quick",
        deep_model="test-deep",
        analysis_mode="balanced",
        analysis_depth="balanced",
        time_horizon_months=1,
        max_debate_rounds=1,
        response_detail="full",
    )


def _result(**overrides):
    result = {
        "request_id": "rid-report-1",
        "ticker": "NVDA",
        "market": "US",
        "trade_date": "2026-05-26",
        "analysis_created_at": "2026-05-26T12:00:00Z",
        "current_price": 920,
        "current_price_as_of": "2026-05-26",
        "current_price_source": "yfinance:last_close",
        "llm_decision": "Buy",
        "final_decision": "Buy",
        "decision": "Buy",
        "decision_adjusted": False,
        "decision_adjusted_reason": None,
        "trade_plan_valid": True,
        "has_existing_position": False,
        "price_target": 1060,
        "entry_price": 920,
        "stop_loss": 880,
        "take_profit": 1040,
        "risk_per_share": 40,
        "reward_per_share": 120,
        "risk_reward_display": "1:3",
        "max_drawdown_estimate": "8-12%",
        "volatility_level": "High",
        "volatility_score": 78,
        "rebalancing_action": "Buy with tight risk control",
        "position_size_hint": "Use smaller size due to High volatility.",
        "data_quality": {
            "price_data": "ok",
            "trade_levels": "recomputed",
            "llm_output": "repaired",
            "volatility_data": "ok",
        },
        "validation_warnings": ["TAKE_PROFIT_RECOMPUTED"],
        "executive_summary": "A concise test summary.",
        "company_profile": {
            "available": True,
            "ticker": "NVDA",
            "company_name": "NVIDIA Corporation",
            "currency": "USD",
            "market_cap": 2_300_000_000_000,
            "shares_outstanding": 24_400_000_000,
            "current_price": 920,
        },
        "financial_highlights": {
            "title": "Key Financial Highlights",
            "unit_note": "Currency: USD (US Dollar) | Amount figures: in millions (USD Mn)",
            "periods": [{"key": "FY26Q1", "label": "FY26Q1"}],
            "rows": [{"key": "revenue", "label": "Revenue", "values": {"FY26Q1": {"display": "N/A"}}}],
            "point_in_time": [{"key": "market_cap", "label": "Market Cap", "display": "2,300,000.0", "unit": "USD Mn"}],
            "sections": [
                {
                    "key": "market_scale",
                    "title": "Market & Scale",
                    "rows": [{"key": "revenue", "label": "Revenue", "values": {"FY26Q1": {"display": "N/A"}}}],
                }
            ],
        },
    }
    result.update(overrides)
    return result


def _store_with_result(result: dict) -> tuple[AnalysisJobStore, str]:
    async def main():
        store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
        job = await store.create(
            owner_id=_TEST_OWNER_IDENTIFIER,
            request_id=result["request_id"],
            cache_key=_cache_key(result.get("ticker", "NVDA")),
            payload={"ticker": result.get("ticker", "NVDA"), "trade_date": result.get("trade_date", "2026-05-26")},
        )
        await job.complete(result)
        return store, job.id

    return asyncio.run(main())


def test_html_report_endpoint_returns_existing_analysis_result(client, monkeypatch):
    store, job_id = _store_with_result(_result())
    monkeypatch.setattr("services.report_service.jobs.JOB_STORE", store)

    response = client.get(f"/api/analysis/jobs/{job_id}/report.html")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "TradingAgent Analysis Report" in response.text
    assert "Final Decision" in response.text
    assert "TAKE_PROFIT_RECOMPUTED" in response.text
    assert "Entry" in response.text
    assert "automated AI-assisted analysis engine" in response.text
    assert "may contain errors" in response.text
    assert "Key Financial Highlights" in response.text
    assert "FY26Q1" in response.text
    assert "Price Target" not in response.text
    assert "Risk Per Share" not in response.text
    assert "Reward Per Share" not in response.text


def test_pdf_report_endpoint_returns_attachment_without_rerunning_pipeline(client, monkeypatch):
    store, job_id = _store_with_result(_result(ticker="BBCA.JK", market="ID", request_id="rid-report-pdf"))
    rendered_report = {}
    monkeypatch.setattr("services.report_service.jobs.JOB_STORE", store)
    monkeypatch.setattr(
        "routes.reports.render_analysis_report_pdf",
        lambda report: rendered_report.update(report) or b"%PDF-1.4\nmock",
    )

    response = client.get(f"/api/analysis/jobs/{job_id}/report.pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment" in response.headers["content-disposition"]
    assert "TradingAgent_BBCA.JK_2026-05-26.pdf" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")
    assert "automated AI-assisted analysis engine" in rendered_report["disclaimer"]
    assert rendered_report["company_profile_rows"][0]["value"] == "NVIDIA Corporation"
    assert rendered_report["financial_highlights"]["sections"][0]["title"] == "Market & Scale"


def test_post_html_report_renders_from_payload(client):
    response = client.post("/api/analysis/report.html", json=_result())

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "TradingAgent Analysis Report" in response.text
    assert "NVDA" in response.text


def test_post_pdf_report_renders_from_payload(client, monkeypatch):
    monkeypatch.setattr("routes.reports.render_analysis_report_pdf", lambda report: b"%PDF-1.4\nmock")

    response = client.post("/api/analysis/report.pdf", json=_result())

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


def test_post_pdf_report_succeeds_without_profile_or_financial_highlights(client, monkeypatch):
    monkeypatch.setattr("routes.reports.render_analysis_report_pdf", lambda report: b"%PDF-1.4\nmock")

    response = client.post(
        "/api/analysis/report.pdf",
        json=_result(company_profile=None, financial_highlights=None),
    )

    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")


def test_html_report_falls_back_to_sqlite_and_marks_export(client, monkeypatch, analysis_repository):
    result = _result(request_id="rid-history-html")
    analysis_repository.save_analysis(result=result, job_id="job-history-html")
    monkeypatch.setattr(
        "services.report_service.jobs.JOB_STORE",
        AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10),
    )

    response = client.get("/api/analysis/jobs/job-history-html/report.html")

    assert response.status_code == 200
    assert "TradingAgent Analysis Report" in response.text
    assert analysis_repository.list_analyses()[0]["exported_html_at"]


def test_pdf_report_falls_back_to_sqlite_and_marks_export(client, monkeypatch, analysis_repository):
    result = _result(request_id="rid-history-pdf")
    analysis_repository.save_analysis(result=result, job_id="job-history-pdf")
    monkeypatch.setattr(
        "services.report_service.jobs.JOB_STORE",
        AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10),
    )
    monkeypatch.setattr("routes.reports.render_analysis_report_pdf", lambda report: b"%PDF-1.4\nmock")

    response = client.get("/api/analysis/jobs/job-history-pdf/report.pdf")

    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")
    assert analysis_repository.list_analyses()[0]["exported_pdf_at"]


def test_request_id_report_alias_falls_back_to_sqlite(client, monkeypatch, analysis_repository):
    result = _result(request_id="rid-history-alias")
    analysis_repository.save_analysis(result=result)
    monkeypatch.setattr(
        "services.report_service.jobs.JOB_STORE",
        AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10),
    )

    response = client.get("/api/analysis/rid-history-alias/report.html")

    assert response.status_code == 200
    assert "TradingAgent Analysis Report" in response.text


def test_report_endpoint_returns_404_for_missing_request_id(client):
    response = client.get("/api/analysis/jobs/missing-request/report.html")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "report_not_found"


def test_report_endpoints_are_bound_to_owner(client, monkeypatch):
    store, job_id = _store_with_result(_result(request_id="rid-owner-report"))
    monkeypatch.setattr("services.report_service.jobs.JOB_STORE", store)
    other_token = issue_owner_session()["owner_token"]
    other_headers = {"x-owner-token": other_token}

    canonical = client.get(f"/api/analysis/jobs/{job_id}/report.html")
    wrong_canonical = client.get(f"/api/analysis/jobs/{job_id}/report.html", headers=other_headers)
    wrong_alias = client.get("/api/analysis/rid-owner-report/report.html", headers=other_headers)

    assert canonical.status_code == 200
    assert wrong_canonical.status_code == 404
    assert wrong_alias.status_code == 404


def test_report_endpoint_rejects_global_legacy_result(client, monkeypatch):
    store, job_id = _store_with_result(_result(request_id="rid-global", market="GLOBAL", ticker="700.HK"))
    monkeypatch.setattr("services.report_service.jobs.JOB_STORE", store)

    response = client.get(f"/api/analysis/jobs/{job_id}/report.html")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "unsupported_report_market"


def test_hold_report_does_not_render_actionable_trade_levels(client, monkeypatch):
    store, job_id = _store_with_result(
        _result(
            request_id="rid-hold",
            final_decision="Hold",
            decision="Hold",
            trade_plan_valid=False,
            decision_adjusted=True,
            decision_adjusted_reason="Invalid risk reward structure",
        )
    )
    monkeypatch.setattr("services.report_service.jobs.JOB_STORE", store)

    response = client.get(f"/api/analysis/jobs/{job_id}/report.html")

    assert response.status_code == 200
    assert "No actionable trade plan is available" in response.text
    assert ">Entry</div>" not in response.text
    assert ">Stop Loss</div>" not in response.text
    assert ">Take Profit</div>" not in response.text


def test_html_report_supports_indonesian_utf8_content(client, monkeypatch):
    store, job_id = _store_with_result(
        _result(
            request_id="rid-id-utf8",
            ticker="BBCA.JK",
            market="ID",
            executive_summary="Saham Indonesia tetap kuat untuk skenario uji.",
        )
    )
    monkeypatch.setattr("services.report_service.jobs.JOB_STORE", store)

    response = client.get(f"/api/analysis/jobs/{job_id}/report.html")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "charset=utf-8" in response.headers["content-type"].lower()
    assert "BBCA.JK" in response.text
    assert "Indonesia Stocks" in response.text
    assert "Saham Indonesia tetap kuat" in response.text


def test_pdf_report_returns_clear_error_when_weasyprint_unavailable(monkeypatch):
    import builtins

    from services.report_service import ReportGenerationError, build_report_context, render_analysis_report_pdf

    report = build_report_context(_result())
    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "weasyprint":
            raise OSError("libpango missing")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    try:
        render_analysis_report_pdf(report)
    except ReportGenerationError as exc:
        assert exc.status_code == 500
        assert exc.code == "report_generation_failed"
        assert "PDF export is unavailable" in exc.user_message
    else:  # pragma: no cover - pytest assertion clarity
        raise AssertionError("Expected ReportGenerationError")


def test_concurrent_html_report_export_for_same_request_id(client, monkeypatch):
    store, job_id = _store_with_result(_result(request_id="rid-concurrent"))
    monkeypatch.setattr("services.report_service.jobs.JOB_STORE", store)

    def fetch_report():
        return client.get(f"/api/analysis/jobs/{job_id}/report.html")

    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(lambda _: fetch_report(), range(8)))

    assert all(response.status_code == 200 for response in responses)
    assert all("TradingAgent Analysis Report" in response.text for response in responses)


def test_report_html_escapes_user_supplied_fields(client, monkeypatch):
    store, job_id = _store_with_result(
        _result(
            request_id="rid-xss",
            ticker="<script>alert(1)</script>",
            executive_summary="<script>alert(2)</script>",
        )
    )
    monkeypatch.setattr("services.report_service.jobs.JOB_STORE", store)

    response = client.get(f"/api/analysis/jobs/{job_id}/report.html")

    assert response.status_code == 200
    assert "<script>" not in response.text.lower()
    assert "&lt;script&gt;" in response.text.lower()


def test_report_endpoint_returns_404_for_expired_or_unfinished_result(client, monkeypatch):
    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("services.report_service.jobs.JOB_STORE", store)

    async def create_unfinished_job():
        job = await store.create(
            owner_id=_TEST_OWNER_IDENTIFIER,
            request_id="rid-unfinished",
            cache_key=_cache_key("MSFT"),
            payload={"ticker": "MSFT", "trade_date": "2026-05-26"},
        )
        return job.id

    job_id = asyncio.run(create_unfinished_job())

    response = client.get(f"/api/analysis/jobs/{job_id}/report.html")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "report_not_found"
