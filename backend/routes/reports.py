from __future__ import annotations

import asyncio
import logging
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, ConfigDict, model_validator

from rate_limiter import limit_request, request_policy
from services.analysis_repository import get_analysis_repository
from services.report_disclaimer import REPORT_DISCLAIMER
from services.report_service import (
    ReportGenerationError,
    analysis_report_filename,
    build_report_context,
    get_analysis_result_for_report,
    get_analysis_result_for_report_by_request_id,
    render_analysis_report_html,
    render_analysis_report_pdf,
)

router = APIRouter(tags=["reports"])
logger = logging.getLogger(__name__)

REPORT_EXPORT_MAX_DEPTH = 12
REPORT_EXPORT_MAX_LIST_ITEMS = 750
REPORT_EXPORT_MAX_DICT_KEYS = 300
REPORT_EXPORT_MAX_STRING_LENGTH = 20_000
REPORT_EXPORT_MAX_TOTAL_NODES = 20_000
REPORT_PDF_RENDER_TIMEOUT_SECONDS = 30
REPORT_PDF_RENDER_CONCURRENCY = 2

_pdf_render_semaphore = asyncio.Semaphore(REPORT_PDF_RENDER_CONCURRENCY)


class AnalysisReportExportPayload(BaseModel):
    """Bounded direct report payload accepted by legacy POST export endpoints."""

    model_config = ConfigDict(extra="allow")

    @model_validator(mode="before")
    @classmethod
    def validate_bounded_payload(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            raise ValueError("Report export payload must be an object.")
        _validate_report_export_value(value, depth=0, node_count=[0])
        return value

    def to_result_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="python")


def _validate_report_export_value(value: Any, *, depth: int, node_count: list[int]) -> None:
    node_count[0] += 1
    if node_count[0] > REPORT_EXPORT_MAX_TOTAL_NODES:
        raise ValueError("Report export payload is too large.")
    if depth > REPORT_EXPORT_MAX_DEPTH:
        raise ValueError("Report export payload is too deeply nested.")

    if isinstance(value, str):
        if len(value) > REPORT_EXPORT_MAX_STRING_LENGTH:
            raise ValueError("Report export payload contains a string that is too long.")
        return
    if isinstance(value, list):
        if len(value) > REPORT_EXPORT_MAX_LIST_ITEMS:
            raise ValueError("Report export payload contains too many list items.")
        for item in value:
            _validate_report_export_value(item, depth=depth + 1, node_count=node_count)
        return
    if isinstance(value, dict):
        if len(value) > REPORT_EXPORT_MAX_DICT_KEYS:
            raise ValueError("Report export payload contains too many object keys.")
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError("Report export payload object keys must be strings.")
            if len(key) > 200:
                raise ValueError("Report export payload contains an object key that is too long.")
            _validate_report_export_value(item, depth=depth + 1, node_count=node_count)


async def _pdf_response_from_result_async(result: dict[str, Any]) -> Response:
    async with _pdf_render_semaphore:
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(_pdf_response_from_result, result),
                timeout=REPORT_PDF_RENDER_TIMEOUT_SECONDS,
            )
        except TimeoutError as exc:
            raise ReportGenerationError(
                "PDF export timed out while rendering the report. Use HTML export or retry with a smaller report.",
                internal_message="report_pdf_render_timeout",
            ) from exc


@router.get("/reports/disclaimer")
async def get_analysis_disclaimer() -> dict[str, str]:
    """Return the canonical analysis report disclaimer."""

    return {"disclaimer": REPORT_DISCLAIMER}


async def _mark_exported_best_effort(result: dict[str, Any], export_type: str, *, owner_id: str | None = None) -> None:
    request_id = str(result.get("request_id") or "").strip()
    if not request_id:
        return
    try:
        repository = get_analysis_repository()
        await asyncio.to_thread(repository.mark_exported, request_id, export_type, owner_id=owner_id)
    except Exception:
        logger.error(
            "Failed to record analysis report export",
            extra={"event": "analysis_report_audit_failed", "request_id": request_id, "export_type": export_type},
            exc_info=True,
        )


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
        response = _html_response_from_result(result)
        await _mark_exported_best_effort(result, "html", owner_id=lease.identifier)
        return response


@router.get("/analysis/jobs/{job_id}/report.pdf")
async def get_analysis_report_pdf(job_id: str, request: Request) -> Response:
    """Download an existing completed analysis result as a PDF report."""

    async with limit_request(request, request_policy()) as lease:
        result = await get_analysis_result_for_report(job_id, owner_id=lease.identifier)
        response = await _pdf_response_from_result_async(result)
        await _mark_exported_best_effort(result, "pdf", owner_id=lease.identifier)
        return response


@router.get("/analysis/{request_id}/report.html", response_class=HTMLResponse, deprecated=True, include_in_schema=False)
async def get_analysis_report_html_alias(request_id: str, request: Request) -> HTMLResponse:
    """Preview a report through the owner-checked request_id migration alias."""

    async with limit_request(request, request_policy()) as lease:
        result = await get_analysis_result_for_report_by_request_id(request_id, owner_id=lease.identifier)
        response = _html_response_from_result(result)
        await _mark_exported_best_effort(result, "html", owner_id=lease.identifier)
        return response


@router.get("/analysis/{request_id}/report.pdf", deprecated=True, include_in_schema=False)
async def get_analysis_report_pdf_alias(request_id: str, request: Request) -> Response:
    """Download a report through the owner-checked request_id migration alias."""

    async with limit_request(request, request_policy()) as lease:
        result = await get_analysis_result_for_report_by_request_id(request_id, owner_id=lease.identifier)
        response = await _pdf_response_from_result_async(result)
        await _mark_exported_best_effort(result, "pdf", owner_id=lease.identifier)
        return response


@router.post("/analysis/report.html", response_class=HTMLResponse)
async def post_analysis_report_html(result: AnalysisReportExportPayload, request: Request) -> HTMLResponse:
    """Preview a report from an analysis payload supplied by the client.

    This fallback is used when the result is visible in browser storage but the
    backend job store no longer has the completed request_id.
    """

    async with limit_request(request, request_policy()) as lease:
        result_payload = result.to_result_dict()
        response = _html_response_from_result(result_payload)
        await _mark_exported_best_effort(result_payload, "html", owner_id=lease.identifier)
        return response


@router.post("/analysis/report.pdf")
async def post_analysis_report_pdf(result: AnalysisReportExportPayload, request: Request) -> Response:
    """Download a PDF report from an analysis payload supplied by the client."""

    async with limit_request(request, request_policy()) as lease:
        result_payload = result.to_result_dict()
        response = await _pdf_response_from_result_async(result_payload)
        await _mark_exported_best_effort(result_payload, "pdf", owner_id=lease.identifier)
        return response
