from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, Response

from rate_limiter import limit_request, request_policy
from services.report_service import (
    analysis_report_filename,
    build_report_context,
    get_analysis_result_for_report,
    render_analysis_report_html,
    render_analysis_report_pdf,
)

router = APIRouter(tags=["reports"])


@router.get("/analysis/jobs/{request_id}/report.html", response_class=HTMLResponse)
async def get_analysis_report_html(request_id: str, request: Request) -> HTMLResponse:
    """Preview an existing completed analysis result as a professional HTML report."""

    async with limit_request(request, request_policy()):
        result = await get_analysis_result_for_report(request_id)
        report = build_report_context(result)
        html = render_analysis_report_html(report)
        return HTMLResponse(content=html, media_type="text/html; charset=utf-8")


@router.get("/analysis/jobs/{request_id}/report.pdf")
async def get_analysis_report_pdf(request_id: str, request: Request) -> Response:
    """Download an existing completed analysis result as a PDF report."""

    async with limit_request(request, request_policy()):
        result = await get_analysis_result_for_report(request_id)
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
