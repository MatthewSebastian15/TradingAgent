from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, Response

from rate_limiter import limit_request, request_policy
from services.report_service import (
    analysis_report_filename,
    build_report_context,
    get_analysis_result_for_report,
    get_analysis_result_for_report_by_request_id,
    render_analysis_report_html,
    render_analysis_report_pdf,
)

router = APIRouter(tags=["reports"])


def _html_response_from_result(result: dict[str, Any]) -> HTMLResponse:
    report = build_report_context(result)
    html = render_analysis_report_html(report)
    return HTMLResponse(content=html, media_type="text/html; charset=utf-8")


def _pdf_response_from_result(result: dict[str, Any]) -> Response:
    report = build_report_context(result)
    pdf = render_analysis_report_pdf(report)
    filename = analysis_report_filename(report, "pdf")
    quoted_filename = quote(filename)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quoted_filename}",
            "Cache-Control": "no-store",
        },
    )


@router.get("/analysis/jobs/{job_id}/report.html", response_class=HTMLResponse)
async def get_analysis_report_html(job_id: str, request: Request) -> HTMLResponse:
    """Preview an existing completed analysis result as a professional HTML report."""

    async with limit_request(request, request_policy()) as lease:
        result = await get_analysis_result_for_report(job_id, owner_id=lease.identifier)
        return _html_response_from_result(result)


@router.get("/analysis/jobs/{job_id}/report.pdf")
async def get_analysis_report_pdf(job_id: str, request: Request) -> Response:
    """Download an existing completed analysis result as a PDF report."""

    async with limit_request(request, request_policy()) as lease:
        result = await get_analysis_result_for_report(job_id, owner_id=lease.identifier)
        return _pdf_response_from_result(result)


@router.get("/analysis/{request_id}/report.html", response_class=HTMLResponse, deprecated=True, include_in_schema=False)
async def get_analysis_report_html_alias(request_id: str, request: Request) -> HTMLResponse:
    """Preview a report through the owner-checked request_id migration alias."""

    async with limit_request(request, request_policy()) as lease:
        result = await get_analysis_result_for_report_by_request_id(request_id, owner_id=lease.identifier)
        return _html_response_from_result(result)


@router.get("/analysis/{request_id}/report.pdf", deprecated=True, include_in_schema=False)
async def get_analysis_report_pdf_alias(request_id: str, request: Request) -> Response:
    """Download a report through the owner-checked request_id migration alias."""

    async with limit_request(request, request_policy()) as lease:
        result = await get_analysis_result_for_report_by_request_id(request_id, owner_id=lease.identifier)
        return _pdf_response_from_result(result)


@router.post("/analysis/report.html", response_class=HTMLResponse)
async def post_analysis_report_html(result: dict[str, Any], request: Request) -> HTMLResponse:
    """Preview a report from an analysis payload supplied by the client.

    This fallback is used when the result is visible in browser storage but the
    backend job store no longer has the completed request_id.
    """

    async with limit_request(request, request_policy()):
        return _html_response_from_result(dict(result))


@router.post("/analysis/report.pdf")
async def post_analysis_report_pdf(result: dict[str, Any], request: Request) -> Response:
    """Download a PDF report from an analysis payload supplied by the client."""

    async with limit_request(request, request_policy()):
        return _pdf_response_from_result(dict(result))
