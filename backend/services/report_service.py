from __future__ import annotations

import asyncio
import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape
from tradingagents.utils.normalization import as_dict as _as_dict
from tradingagents.utils.normalization import clean_text as _clean_text

from errors import ApiError, sanitize_message
from routes import jobs
from services.analysis_repository import get_analysis_repository
from services.report.financials import (
    _analyst_consensus_rows,
    _catalyst_items,
    _financial_highlights,
    _financial_trend_rows,
    _metric_detail_rows,
    _peer_comparison_rows,
    _price_chart_rows,
    _scenario_rows,
    _technical_entry_rows,
)
from services.report.formatters import (
    _as_text_list,
    _coalesce,
    _display,
    _format_datetime,
    _format_price,
    _normalize_inline_text,
    _reason_items,
    _row,
    _truncate_words,
)
from services.report.news import (
    _full_news_items,
    _high_impact_news_items,
    _news_articles,
    _news_context,
    _news_impact_rows,
    _news_provider_rows,
    _related_news_items,
    _report_news_sections,
)
from services.report.ownership import (
    _company_profile_executives,
    _company_profile_rows,
    _ownership_segments,
    _shares_ownership_rows,
)
from services.report.rows import (
    _catalyst_risk_rows,
    _decision_rows,
    _executive_rows,
    _list_payload_rows,
    _risk_rows,
    _risk_summary_rows,
    _simple_payload_rows,
    _source_quality_rows,
    _thesis_monitor_rows,
    _trade_plan_rows,
    _validation_rows,
    _vendor_status_rows,
)
from services.report_disclaimer import REPORT_DISCLAIMER

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = BACKEND_DIR / "templates"
# Trusted project asset: rendered into the report's <style> block unescaped (CSS
# context). Must stay read-only — never mount user-writable over backend/static.
REPORT_CSS_PATH = BACKEND_DIR / "static" / "reports" / "analysis_report.css"

SUPPORTED_REPORT_MARKETS = {"US", "ID"}
ACTIONABLE_DECISIONS = {"Buy", "Sell", "Overweight", "Underweight"}
NON_ID_EXCHANGE_SUFFIX_RE = re.compile(r"\.(?!JK$)[A-Z0-9]{1,5}$")
SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9_.-]+")
LEGACY_REPORT_FIELD_RE = re.compile(
    r"\b(price target|risk per share|reward per share)\b", re.IGNORECASE
)
REPORT_PDF_MAX_HTML_CHARS = 1_000_000

_REPORT_ENV = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    autoescape=select_autoescape(("html", "xml")),
    trim_blocks=True,
    lstrip_blocks=True,
)


class ReportNotFoundError(ApiError):
    def __init__(self, resource_id: str) -> None:
        super().__init__(
            404,
            "report_not_found",
            "Analysis result was not found or has expired.",
            details={"resource_id": resource_id},
        )


class UnsupportedReportMarketError(ApiError):
    def __init__(self, *, market: str | None = None, ticker: str | None = None) -> None:
        details = {"supported_markets": sorted(SUPPORTED_REPORT_MARKETS)}
        if market:
            details["market"] = market
        if ticker:
            details["ticker"] = ticker
        super().__init__(
            400,
            "unsupported_report_market",
            "Report export only supports US and Indonesia analysis results.",
            details=details,
        )


class ReportGenerationError(ApiError):
    def __init__(self, message: str | None = None, internal_message: str | None = None) -> None:
        super().__init__(
            500,
            "report_generation_failed",
            message or "Failed to generate PDF report.",
            internal_message=internal_message,
        )


async def get_analysis_result_for_report(
    job_id: str, *, owner_id: str, job_store: Any | None = None
) -> dict[str, Any]:
    """Return a completed analysis payload by canonical job_id."""

    store = job_store or jobs.get_analysis_runtime().job_store
    job = await store.get(job_id, owner_id=owner_id)
    if job is not None and isinstance(job.result, dict):
        return dict(job.result)
    if await store.get(job_id) is not None:
        raise ReportNotFoundError(job_id)

    repository = get_analysis_repository()
    result = await asyncio.to_thread(
        repository.get_analysis_by_job_id,
        job_id,
    )
    if isinstance(result, dict):
        return result
    raise ReportNotFoundError(job_id)


async def get_analysis_result_for_report_by_request_id(
    request_id: str,
    *,
    owner_id: str,
    job_store: Any | None = None,
) -> dict[str, Any]:
    """Return a completed analysis payload through the migration alias."""

    store = job_store or jobs.get_analysis_runtime().job_store
    job = await store.get_by_request_id(request_id, owner_id=owner_id)
    if job is not None and isinstance(job.result, dict):
        return dict(job.result)
    if await store.get_by_request_id(request_id) is not None:
        raise ReportNotFoundError(request_id)

    repository = get_analysis_repository()
    result = await asyncio.to_thread(
        repository.get_analysis,
        request_id,
    )
    if isinstance(result, dict):
        return result
    raise ReportNotFoundError(request_id)


def validate_report_scope(result: dict[str, Any]) -> None:
    """Reject legacy/global analysis results before rendering HTML or PDF."""

    ticker = str(result.get("ticker") or "").strip().upper()
    market = str(result.get("market") or "").strip().upper() or None

    if market not in SUPPORTED_REPORT_MARKETS:
        raise UnsupportedReportMarketError(market=market, ticker=ticker)
    if ticker and NON_ID_EXCHANGE_SUFFIX_RE.search(ticker):
        raise UnsupportedReportMarketError(market=market, ticker=ticker)


def _prepare_report_inputs(result: dict[str, Any]) -> dict[str, Any]:
    market = str(result.get("market") or "").upper()
    ticker = str(result.get("ticker") or "N/A").upper()
    final_decision = _clean_text(result.get("final_decision") or result.get("decision") or "Hold")
    trade_plan_valid = bool(result.get("trade_plan_valid"))
    validation_warnings = _as_text_list(result.get("validation_warnings"))
    current_price = _coalesce(result.get("current_price"), result.get("last_close_price"))
    if current_price is None and "CURRENT_PRICE_MISSING" not in validation_warnings:
        validation_warnings = [*validation_warnings, "CURRENT_PRICE_MISSING"]
    return {
        "market": market,
        "ticker": ticker,
        "final_decision": final_decision,
        "llm_decision": _clean_text(result.get("llm_decision")),
        "trade_plan_valid": trade_plan_valid,
        "is_actionable_trade_plan": final_decision in ACTIONABLE_DECISIONS and trade_plan_valid,
        "current_price": current_price,
        "validation_warnings": validation_warnings,
        "data_quality": _as_dict(result.get("data_quality")),
    }


def _build_base_report_context(result: dict[str, Any], inputs: dict[str, Any]) -> dict[str, Any]:
    ticker = inputs["ticker"]
    market = inputs["market"]
    data_quality = inputs["data_quality"]
    executive_summary_paragraphs = _text_paragraphs(result.get("executive_summary"))
    executive_summary = (
        "\n\n".join(executive_summary_paragraphs) if executive_summary_paragraphs else "N/A"
    )
    return {
        "request_id": _clean_text(result.get("request_id")),
        "ticker": ticker,
        "market": market,
        "market_label": "US Stocks" if market == "US" else "Indonesia Stocks",
        "trade_date": _clean_text(result.get("trade_date")),
        "generated_at": _format_datetime(datetime.now(UTC).isoformat()),
        "analysis_created_at": _format_datetime(result.get("analysis_created_at")),
        "disclaimer": REPORT_DISCLAIMER,
        "current_price": inputs["current_price"],
        "current_price_display": _format_price(inputs["current_price"], ticker, market),
        "current_price_as_of": _display(
            result.get("current_price_as_of") or result.get("last_close_price_as_of")
        ),
        "current_price_source": _display(result.get("current_price_source")),
        "llm_decision": _display(inputs["llm_decision"]),
        "final_decision": inputs["final_decision"],
        "decision": inputs["final_decision"],
        "executive_summary": executive_summary,
        "executive_summary_paragraphs": executive_summary_paragraphs or ["N/A"],
        "key_reasons_paragraph": _key_reasons_paragraph(result),
        "decision_adjusted": bool(result.get("decision_adjusted")),
        "decision_adjusted_reason": _display(result.get("decision_adjusted_reason")),
        "trade_plan_valid": inputs["trade_plan_valid"],
        "has_existing_position": bool(result.get("has_existing_position")),
        "is_actionable_trade_plan": inputs["is_actionable_trade_plan"],
        "validation_warnings": inputs["validation_warnings"],
        "data_quality": data_quality,
        "risk_data_quality": _as_dict(result.get("risk_data_quality")),
        "data_quality_rows": _data_quality_rows(data_quality),
        "data_quality_warnings": _as_text_list(data_quality.get("warnings"))
        if data_quality
        else [],
        "analyst_sections": _analyst_sections(result),
        "show_trade_plan": inputs["is_actionable_trade_plan"],
    }


def _attach_market_report_sections(report: dict[str, Any], result: dict[str, Any]) -> None:
    ticker = report["ticker"]
    market = report["market"]
    report.update(
        {
            "company_profile": _as_dict(result.get("company_profile")),
            "company_profile_rows": _company_profile_rows(result),
            "company_profile_executives": _company_profile_executives(result),
            "shares_ownership_rows": _shares_ownership_rows(result),
            "ownership_segments": _ownership_segments(result),
            "price_chart_rows": _price_chart_rows(result, ticker, market),
            "technical_entry_rows": _technical_entry_rows(result, ticker, market),
            "news_impact": _as_dict(result.get("news_impact")),
            "news_impact_rows": _news_impact_rows(result),
            "high_impact_news_items": _high_impact_news_items(result),
            "full_news_items": _full_news_items(result),
            "catalyst_tracker": _as_dict(result.get("catalyst_tracker")),
            "positive_catalysts": _catalyst_items(result, "positive_catalysts"),
            "negative_catalysts": _catalyst_items(result, "negative_catalysts"),
            "upcoming_events": _catalyst_items(result, "upcoming_events"),
            "analyst_consensus_rows": _analyst_consensus_rows(result),
            "related_news": _as_dict(result.get("related_news")),
            "related_news_items": []
            if isinstance(_as_dict(result.get("news_impact")).get("full_news_list"), list)
            else _related_news_items(result),
            "news": _news_context(result),
            "news_articles": _news_articles(result),
            "report_news_sections": _report_news_sections(result),
            "news_provider_rows": _news_provider_rows(result),
        }
    )


def _attach_core_report_rows(report: dict[str, Any], result: dict[str, Any]) -> None:
    ticker = report["ticker"]
    market = report["market"]
    is_actionable = report["is_actionable_trade_plan"]
    report["executive_rows"] = _executive_rows(result, report)
    report["decision_rows"] = _decision_rows(result, report)
    report["trade_plan_rows"] = _trade_plan_rows(result, ticker, market) if is_actionable else []
    report["risk_rows"] = _risk_rows(result, include_max_drawdown=is_actionable)
    report["validation_rows"] = _validation_rows(result, report)


def _attach_risk_report_sections(report: dict[str, Any]) -> None:
    risk_data_quality = report["risk_data_quality"]
    report["risk_summary_rows"] = _risk_summary_rows(risk_data_quality)
    report["balance_sheet_risk_summary_rows"] = _simple_payload_rows(
        _as_dict(risk_data_quality.get("balance_sheet_risk_summary")),
        [
            ("der", "DER"),
            ("net_debt", "Net Debt"),
            ("debt_to_ebitda", "Debt / EBITDA"),
            ("cash_ratio", "Cash Ratio"),
            ("risk_level", "Risk Level"),
            ("interpretation", "Interpretation"),
        ],
    )
    report["market_risk_rows"] = _simple_payload_rows(
        _as_dict(risk_data_quality.get("market_risk")),
        [
            ("volatility_percent", "Volatility"),
            ("max_drawdown_percent", "Max Drawdown"),
            ("atr", "ATR"),
            ("price_range_percent", "Price Range"),
            ("risk_bucket", "Risk Bucket"),
        ],
        percent_keys={"volatility_percent", "max_drawdown_percent", "price_range_percent"},
    )
    report["market_risk_notes"] = _as_text_list(
        _as_dict(risk_data_quality.get("market_risk")).get("notes")
    )
    report["risk_adjusted_return_rows"] = _simple_payload_rows(
        _as_dict(risk_data_quality.get("risk_adjusted_return")),
        [
            ("upside_percent", "Upside"),
            ("downside_percent", "Downside"),
            ("risk_reward_ratio", "Risk/Reward"),
            ("expected_return_label", "Expected Return"),
        ],
        percent_keys={"upside_percent", "downside_percent"},
    )
    report["risk_adjusted_return_notes"] = _as_text_list(
        _as_dict(risk_data_quality.get("risk_adjusted_return")).get("notes")
    )
    report["thesis_monitor_rows"] = _thesis_monitor_rows(risk_data_quality)
    report["catalyst_risk_rows"] = _catalyst_risk_rows(risk_data_quality)
    report["source_quality_rows"] = _source_quality_rows(
        risk_data_quality, report["validation_rows"]
    )
    report["vendor_status_rows"] = _vendor_status_rows(risk_data_quality)
    report["missing_fields_rows"] = _list_payload_rows(risk_data_quality, "missing_fields")
    report["fallback_used_rows"] = _list_payload_rows(risk_data_quality, "fallback_used")
    report["stale_warning_rows"] = _list_payload_rows(risk_data_quality, "stale_data_warning")
    report["calculation_notes"] = _as_text_list(risk_data_quality.get("calculation_notes"))


def _attach_financial_report_sections(report: dict[str, Any], result: dict[str, Any]) -> None:
    report.update(
        {
            "financial_highlights": _financial_highlights(result.get("financial_highlights")),
            "financial_trends": _as_dict(result.get("financial_trends")),
            "valuation_multiples": _as_dict(result.get("valuation_multiples")),
            "fair_value_range": _as_dict(result.get("fair_value_range")),
            "scenario_analysis": _as_dict(result.get("scenario_analysis")),
            "quality_of_earnings": _as_dict(result.get("quality_of_earnings")),
            "balance_sheet_risk": _as_dict(result.get("balance_sheet_risk")),
            "dividend_quality": _as_dict(result.get("dividend_quality")),
            "peer_comparison": _as_dict(result.get("peer_comparison")),
        }
    )
    report["financial_trend_rows"] = _financial_trend_rows(report["financial_trends"])
    report["valuation_rows"] = _metric_detail_rows(
        report["valuation_multiples"],
        [
            ("market_cap", "Market Cap"),
            ("enterprise_value", "Enterprise Value"),
            ("pe", "P/E"),
            ("pbv", "P/BV"),
            ("ps", "P/S"),
            ("ev_ebitda", "EV/EBITDA"),
        ],
    )
    report["fair_value_rows"] = _metric_detail_rows(
        report["fair_value_range"],
        [
            ("current_price", "Current Price"),
            ("bear", "Bear Fair Value"),
            ("base", "Base Fair Value"),
            ("bull", "Bull Fair Value"),
            ("bear_upside_percent", "Bear Upside / Downside"),
            ("base_upside_percent", "Base Upside / Downside"),
            ("bull_upside_percent", "Bull Upside / Downside"),
        ],
    )
    report["scenario_rows"] = _scenario_rows(report["scenario_analysis"])
    _attach_quality_of_earnings_rows(report)
    _attach_balance_sheet_rows(report)
    _attach_dividend_and_peer_rows(report)


def _attach_quality_of_earnings_rows(report: dict[str, Any]) -> None:
    report["quality_of_earnings_rows"] = [
        *_metric_detail_rows(
            report["quality_of_earnings"],
            [
                ("cfo_to_net_income", "CFO / Net Income"),
                ("free_cash_flow", "Free Cash Flow"),
                ("capex_intensity_percent", "Capex Intensity"),
            ],
        ),
        _row("Accrual Risk", report["quality_of_earnings"].get("accrual_risk")),
        _row("Rating", report["quality_of_earnings"].get("rating")),
    ]


def _attach_balance_sheet_rows(report: dict[str, Any]) -> None:
    report["balance_sheet_risk_rows"] = [
        *_metric_detail_rows(
            report["balance_sheet_risk"],
            [
                ("der", "DER"),
                ("net_debt", "Net Debt"),
                ("debt_to_ebitda", "Debt / EBITDA"),
                ("cash_ratio", "Cash Ratio"),
                ("equity_ratio", "Equity Ratio"),
            ],
        ),
        _row("Risk Level", report["balance_sheet_risk"].get("risk_level")),
    ]


def _attach_dividend_and_peer_rows(report: dict[str, Any]) -> None:
    report["dividend_quality_rows"] = [
        *_metric_detail_rows(
            report["dividend_quality"],
            [
                ("dividend_yield_percent", "Dividend Yield"),
                ("payout_ratio_percent", "Payout Ratio"),
                ("fcf_coverage", "FCF Coverage"),
            ],
        ),
        _row("Sustainability", report["dividend_quality"].get("sustainability")),
    ]
    report["peer_comparison_rows"] = _peer_comparison_rows(report["peer_comparison"])


_SNAPSHOT_BLANK = {"-", "N/A", "", None}


def _snapshot_rows(report: dict[str, Any]) -> list[dict[str, str]]:
    """Right-rail key-stats: price + valuation multiples + dividend yield.

    Only *selects* already-rendered display strings; invents nothing and drops
    blank values so the snapshot never shows a `-` row.
    """
    rows: list[dict[str, str]] = []
    price = report.get("current_price_display")
    if price not in _SNAPSHOT_BLANK:
        rows.append({"label": "Price", "value": price})
    rows.extend(
        row for row in report.get("valuation_rows", []) if row.get("value") not in _SNAPSHOT_BLANK
    )
    dividend_yield = next(
        (
            row
            for row in report.get("dividend_quality_rows", [])
            if row.get("label") == "Dividend Yield"
        ),
        None,
    )
    if dividend_yield and dividend_yield.get("value") not in _SNAPSHOT_BLANK:
        rows.append(dividend_yield)
    return rows


def build_report_context(result: dict[str, Any]) -> dict[str, Any]:
    """Normalize backend analysis payload into a template-friendly report dict."""
    validate_report_scope(result)
    inputs = _prepare_report_inputs(result)
    report = _build_base_report_context(result, inputs)
    _attach_financial_report_sections(report, result)
    _attach_market_report_sections(report, result)
    _attach_core_report_rows(report, result)
    _attach_risk_report_sections(report)
    report["snapshot_rows"] = _snapshot_rows(report)
    return report


def render_analysis_report_html(report: dict[str, Any]) -> str:
    template = _REPORT_ENV.get_template("reports/analysis_report.html")
    return template.render(report=report, css=_read_report_css())


def render_analysis_report_pdf(report: dict[str, Any]) -> bytes:
    html = render_analysis_report_html(report)
    if len(html) > REPORT_PDF_MAX_HTML_CHARS:
        raise ReportGenerationError(
            (
                "PDF export is too large to render safely. Use HTML export or retry with a "
                + "smaller report."
            ),
            internal_message="report_pdf_html_too_large",
        )
    try:
        from weasyprint import HTML  # noqa: PLC0415
    except Exception as exc:  # pragma: no cover - depends on optional OS libraries
        logger.exception("WeasyPrint is unavailable for analysis report PDF export")
        raise ReportGenerationError(
            "PDF export is unavailable because WeasyPrint or its system dependencies are missing. "
            + "Use HTML export or install the required OS libraries.",
            internal_message=sanitize_message(str(exc)),
        ) from exc

    try:
        return HTML(string=html, base_url=str(BACKEND_DIR)).write_pdf()
    except Exception as exc:  # pragma: no cover - exact WeasyPrint failures depend on OS libraries
        logger.exception("Failed to generate analysis report PDF")
        raise ReportGenerationError(
            "PDF export failed while rendering the report. Use HTML export and check backend logs.",
            internal_message=sanitize_message(str(exc)),
        ) from exc


def analysis_report_filename(report: dict[str, Any], extension: str) -> str:
    ticker = (
        SAFE_FILENAME_RE.sub("_", str(report.get("ticker") or "UNKNOWN")).strip("_") or "UNKNOWN"
    )
    trade_date = (
        SAFE_FILENAME_RE.sub("_", str(report.get("trade_date") or "report")).strip("_") or "report"
    )
    ext = extension.lstrip(".") or "pdf"
    return f"{ticker}_{trade_date}.{ext}"


def _read_report_css() -> str:
    try:
        return REPORT_CSS_PATH.read_text(encoding="utf-8")
    except OSError:
        logger.warning("Report CSS could not be read", exc_info=True)
        return ""


def report_asset_health() -> dict[str, Any]:
    return {
        "css": "ok" if REPORT_CSS_PATH.is_file() else "missing",
        "css_path": str(REPORT_CSS_PATH),
    }


def _strip_legacy_report_fields(value: Any) -> str | None:
    text = _clean_text(value)
    if not text:
        return None
    lines = [line for line in text.splitlines() if not LEGACY_REPORT_FIELD_RE.search(line)]
    cleaned = "\n".join(lines).strip()
    return cleaned or None


def _key_reasons_paragraph(result: dict[str, Any]) -> str:
    overview = _as_dict(result.get("analysis_overview"))
    direct = _normalize_inline_text(
        overview.get("key_reasons_paragraph") or result.get("key_reasons_paragraph")
    )
    if direct:
        return _truncate_words(direct, 125)

    items: list[str] = []
    for source in (
        overview.get("key_reasons"),
        result.get("key_reasons"),
        result.get("key_catalysts"),
    ):
        items.extend(_reason_items(source))

    mini_risk_summary = _normalize_inline_text(result.get("mini_risk_summary"))
    if mini_risk_summary:
        items.append(mini_risk_summary)

    decision_reason = _normalize_inline_text(result.get("decision_adjusted_reason"))
    if decision_reason:
        items.append(decision_reason)

    unique_items = list(dict.fromkeys(item for item in items if item))
    if not unique_items:
        return "N/A"

    paragraph = ". ".join(unique_items).strip()
    if paragraph and not paragraph.endswith("."):
        paragraph = f"{paragraph}."
    return _truncate_words(paragraph, 125)


def _data_quality_rows(data_quality: dict[str, Any]) -> list[dict[str, str]]:
    if not data_quality:
        return []
    keys = [
        "price_data",
        "trade_levels",
        "llm_output",
        "volatility_data",
        "fundamentals",
        "news",
    ]
    return [
        _row(key.replace("_", " ").title(), data_quality.get(key))
        for key in keys
        if key in data_quality
    ]


def _text_paragraphs(value: Any) -> list[str]:
    if isinstance(value, list):
        return [
            re.sub(r"\n+", " ", paragraph).strip()
            for item in value
            if (
                paragraph := (_strip_legacy_report_fields(item) or "").replace("\r\n", "\n").strip()
            )
        ]

    normalized = (_strip_legacy_report_fields(value) or "").replace("\r\n", "\n").strip()
    if not normalized:
        return []
    paragraphs = [
        re.sub(r"\n+", " ", paragraph).strip()
        for paragraph in re.split(r"\n\s*\n", normalized)
        if paragraph.strip()
    ]
    if len(paragraphs) <= 1 and "\n" in normalized:
        paragraphs = [
            paragraph.strip() for paragraph in re.split(r"\n+", normalized) if paragraph.strip()
        ]
    return paragraphs


def _analyst_sections(result: dict[str, Any]) -> list[dict[str, Any]]:
    fields = [
        ("Executive Summary", "executive_summary"),
        ("Market Analyst", "market_report"),
        ("News Analyst", "news_report"),
        ("Fundamentals Analyst", "fundamentals_report"),
        ("Risk Manager", "risk_report"),
        ("Portfolio Manager", "portfolio_report"),
        ("Investment Thesis", "investment_thesis"),
        ("Debate / Reasoning Summary", "debate_summary"),
        ("Final Decision Notes", "full_decision"),
    ]
    sections: list[dict[str, Any]] = []
    for title, field in fields:
        body = _strip_legacy_report_fields(result.get(field))
        if body:
            sections.append(
                {
                    "title": title,
                    "body": body,
                    "paragraphs": _text_paragraphs(body),
                    "is_investment_thesis": title == "Investment Thesis",
                }
            )
    return sections
