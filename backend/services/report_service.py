from __future__ import annotations

import asyncio
import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from jinja2 import Environment, FileSystemLoader, select_autoescape

from errors import ApiError, sanitize_message
from routes import jobs
from services.analysis_repository import get_analysis_repository
from services.report_disclaimer import REPORT_DISCLAIMER
from tradingagents.utils.normalization import as_dict as _as_dict, as_list as _as_list, clean_text as _clean_text

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = BACKEND_DIR / "templates"
REPORT_CSS_PATH = BACKEND_DIR / "static" / "reports" / "analysis_report.css"

SUPPORTED_REPORT_MARKETS = {"US", "ID"}
ACTIONABLE_DECISIONS = {"Buy", "Sell", "Overweight", "Underweight"}
NON_ID_EXCHANGE_SUFFIX_RE = re.compile(r"\.(?!JK$)[A-Z0-9]{1,5}$")
SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9_.-]+")
LEGACY_REPORT_FIELD_RE = re.compile(r"\b(price target|risk per share|reward per share)\b", re.IGNORECASE)
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


async def get_analysis_result_for_report(job_id: str, *, owner_id: str, job_store: Any | None = None) -> dict[str, Any]:
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
        owner_id=owner_id,
        bind_legacy_owner=True,
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
        owner_id=owner_id,
        bind_legacy_owner=True,
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
        "current_price_as_of": _display(result.get("current_price_as_of") or result.get("last_close_price_as_of")),
        "current_price_source": _display(result.get("current_price_source")),
        "llm_decision": _display(inputs["llm_decision"]),
        "final_decision": inputs["final_decision"],
        "decision": inputs["final_decision"],
        "executive_summary": _display(result.get("executive_summary")),
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
        "data_quality_warnings": _as_text_list(data_quality.get("warnings")) if data_quality else [],
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
    report["market_risk_notes"] = _as_text_list(_as_dict(risk_data_quality.get("market_risk")).get("notes"))
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
    report["source_quality_rows"] = _source_quality_rows(risk_data_quality, report["validation_rows"])
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


def build_report_context(result: dict[str, Any]) -> dict[str, Any]:
    """Normalize backend analysis payload into a template-friendly report dict."""
    validate_report_scope(result)
    inputs = _prepare_report_inputs(result)
    report = _build_base_report_context(result, inputs)
    _attach_financial_report_sections(report, result)
    _attach_market_report_sections(report, result)
    _attach_core_report_rows(report, result)
    _attach_risk_report_sections(report)
    return report


def render_analysis_report_html(report: dict[str, Any]) -> str:
    template = _REPORT_ENV.get_template("reports/analysis_report.html")
    return template.render(report=report, css=_read_report_css())


def render_analysis_report_pdf(report: dict[str, Any]) -> bytes:
    html = render_analysis_report_html(report)
    if len(html) > REPORT_PDF_MAX_HTML_CHARS:
        raise ReportGenerationError(
            "PDF export is too large to render safely. Use HTML export or retry with a smaller report.",
            internal_message="report_pdf_html_too_large",
        )
    try:
        from weasyprint import HTML  # noqa: PLC0415
    except Exception as exc:  # pragma: no cover - depends on optional OS libraries
        logger.exception("WeasyPrint is unavailable for analysis report PDF export")
        raise ReportGenerationError(
            "PDF export is unavailable because WeasyPrint or its system dependencies are missing. "
            "Use HTML export or install the required OS libraries.",
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
    ticker = SAFE_FILENAME_RE.sub("_", str(report.get("ticker") or "UNKNOWN")).strip("_") or "UNKNOWN"
    trade_date = SAFE_FILENAME_RE.sub("_", str(report.get("trade_date") or "report")).strip("_") or "report"
    ext = extension.lstrip(".") or "pdf"
    return f"TradingAgent_{ticker}_{trade_date}.{ext}"


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


def _coalesce(*values: Any) -> Any:
    for value in values:
        if value is not None and value != "":
            return value
    return None



def _as_text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for item in value:
        if isinstance(item, dict):
            code = str(item.get("code") or "").strip()
            message = str(item.get("message") or "").strip()
            severity = str(item.get("severity") or "").strip()
            blocking = item.get("blocking")
            text = " - ".join(part for part in (code, message) if part)
            meta = ", ".join(
                part
                for part in (
                    severity if severity else None,
                    "blocking" if blocking is True else "non-blocking" if blocking is False else None,
                )
                if part
            )
            if meta:
                text = f"{text} ({meta})" if text else meta
            if text:
                items.append(text)
            continue
        text = str(item).strip()
        if text:
            items.append(text)
    return items


def _normalize_inline_text(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def _truncate_words(text: str, max_words: int = 125) -> str:
    words = [word for word in _normalize_inline_text(text).split(" ") if word]
    if len(words) <= max_words:
        return " ".join(words)
    return f"{' '.join(words[:max_words])}.".replace("..", ".")


def _reason_items(value: Any) -> list[str]:
    if isinstance(value, list):
        return [_normalize_inline_text(item) for item in value if _normalize_inline_text(item)]
    text = _normalize_inline_text(value)
    return [text] if text else []


def _key_reasons_paragraph(result: dict[str, Any]) -> str:
    overview = _as_dict(result.get("analysis_overview"))
    direct = _normalize_inline_text(overview.get("key_reasons_paragraph") or result.get("key_reasons_paragraph"))
    if direct:
        return _truncate_words(direct, 125)

    items: list[str] = []
    for source in (overview.get("key_reasons"), result.get("key_reasons"), result.get("key_catalysts")):
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


def _display(value: Any) -> str:
    if value is None or value == "":
        return "N/A"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, float):
        return _format_number(value)
    return str(value)


def _format_datetime(value: Any) -> str:
    if not value:
        return "N/A"
    text = str(value)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed.strftime("%Y-%m-%d %H:%M UTC")
    except ValueError:
        return text


def _format_number(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return _display(value) if value is not None else "N/A"
    if number != number or number in {float("inf"), float("-inf")}:
        return "N/A"
    if number.is_integer():
        return f"{number:,.0f}"
    return f"{number:,.2f}".rstrip("0").rstrip(".")


def _format_price(value: Any, ticker: str, market: str) -> str:
    if value is None or value == "":
        return "N/A"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if number != number or number in {float("inf"), float("-inf")}:
        return "N/A"
    if market == "ID" or ticker.endswith(".JK"):
        return f"Rp {number:,.0f}"
    return f"${number:,.2f}".rstrip("0").rstrip(".")


def _format_market_cap(value: Any, currency: Any) -> str:
    if value is None or value == "":
        return "N/A"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if number != number or number in {float("inf"), float("-inf")}:
        return "N/A"

    currency_code = str(currency or "").upper()
    if not currency_code:
        return _format_number(number)

    is_idr = currency_code == "IDR"
    divisor = 1_000_000_000 if is_idr else 1_000_000
    scale = "Bn" if is_idr else "Mn"
    return f"{number / divisor:,.1f} {currency_code} {scale}"


def _format_percent(value: Any) -> str:
    if value is None or value == "":
        return "N/A"
    if isinstance(value, (int, float)):
        return f"{value:g}%"
    return str(value)


def _unit_suffix(unit: Any) -> str:
    text = str(unit or "")
    if re.search(r"\bBn\b", text, re.IGNORECASE):
        return "Bn"
    if re.search(r"\bMn\b", text, re.IGNORECASE):
        return "Mn"
    if "%" in text:
        return "%"
    if "/share" in text.lower():
        return text
    if re.search(r"\bx\b", text, re.IGNORECASE) or "ratio" in text.lower():
        return "x"
    return ""


def _append_financial_unit(value: Any, unit: Any) -> str:
    if value is None or value == "":
        return "-"
    text = str(value).strip()
    if text in {"-", "N/A"} or text.lower() in {"source unavailable", "none", "null", "nan"}:
        return "-"
    suffix = _unit_suffix(unit)
    if not suffix:
        return re.sub(r"\s*%", " %", text)
    if suffix == "%":
        base = re.sub(r"\s*%$", "", text)
        return f"{base} %"
    if suffix == "x":
        return text if re.search(r"\s*x$", text, re.IGNORECASE) else f"{text}x"
    if text.lower().endswith(suffix.lower()):
        return text
    return f"{text} {suffix}"


def _financial_cell_display(cell: Any, unit: Any = "") -> str:
    if isinstance(cell, dict):
        if cell.get("status") in {"unavailable", "source_unavailable"}:
            return "-"
        value = cell.get("display") if cell.get("display") is not None else cell.get("value")
        displayed = _append_financial_unit(value, unit)
        return f"{displayed} EST" if cell.get("status") == "estimated" and displayed != "-" else displayed
    return _append_financial_unit(cell, unit)


def _risk_reward_display(result: dict[str, Any]) -> str:
    if result.get("risk_reward_display"):
        return str(result["risk_reward_display"])
    if result.get("risk_reward_ratio") is None or result.get("risk_reward_ratio") == "":
        return "N/A"
    return "1:3"


def _row(label: str, value: Any) -> dict[str, str]:
    return {"label": label, "value": _display(value)}


def _executive_rows(result: dict[str, Any], report: dict[str, Any]) -> list[dict[str, str]]:
    rows = [
        _row("Final Decision", report["final_decision"]),
        _row("Current Price", report["current_price_display"]),
        _row("Trade Plan Valid", report["trade_plan_valid"]),
        _row("Volatility Level", result.get("volatility_level")),
        _row("Rebalancing Action", result.get("rebalancing_action")),
    ]
    if report["show_trade_plan"]:
        rows.insert(2, _row("Risk/Reward", _risk_reward_display(result)))
    return rows


def _decision_rows(result: dict[str, Any], report: dict[str, Any]) -> list[dict[str, str]]:
    return [
        _row("Final Decision", report["final_decision"]),
        _row("LLM Decision", report["llm_decision"]),
        _row("Decision Adjusted", report["decision_adjusted"]),
        _row("Decision Adjusted Reason", report["decision_adjusted_reason"]),
        _row("Has Existing Position", report["has_existing_position"]),
        _row("Position Size Hint", result.get("position_size_hint")),
    ]


def _trade_plan_rows(result: dict[str, Any], ticker: str, market: str) -> list[dict[str, str]]:
    return [
        {"label": "Current Price", "value": _format_price(result.get("current_price"), ticker, market)},
        {"label": "Entry", "value": _format_price(result.get("entry_price"), ticker, market)},
        {"label": "Stop Loss", "value": _format_price(result.get("stop_loss"), ticker, market)},
        {"label": "Take Profit", "value": _format_price(result.get("take_profit"), ticker, market)},
        _row("Max Drawdown", result.get("max_drawdown_estimate")),
        _row("Volatility", result.get("volatility_level")),
        _row("Volatility Score", result.get("volatility_score")),
        _row("Rebalancing", result.get("rebalancing_action")),
        _row("Position Action", result.get("position_action")),
        _row("New Entry Action", result.get("new_entry_action")),
        _row("Position Size Hint", result.get("position_size_hint")),
        _row("R/R Ratio", _risk_reward_display(result)),
    ]


def _risk_rows(result: dict[str, Any], *, include_max_drawdown: bool) -> list[dict[str, str]]:
    rows = [
        _row("Volatility Level", result.get("volatility_level")),
        _row("Volatility Score", result.get("volatility_score")),
    ]
    if include_max_drawdown:
        rows.append(_row("Max Drawdown Estimate", result.get("max_drawdown_estimate")))
    rows.extend(
        [
            _row("Position Size Hint", result.get("position_size_hint")),
            _row("Rebalancing Action", result.get("rebalancing_action")),
            _row("Position Action", result.get("position_action")),
            _row("New Entry Action", result.get("new_entry_action")),
        ]
    )
    return rows


def _validation_rows(result: dict[str, Any], report: dict[str, Any]) -> list[dict[str, str]]:
    dq = report["data_quality"]
    return [
        _row("Current Price Source", report["current_price_source"]),
        _row("Current Price As Of", report["current_price_as_of"]),
        _row("Price Data", dq.get("price_data")),
        _row("Trade Levels Status", dq.get("trade_levels")),
        _row("LLM Output Status", dq.get("llm_output")),
        _row("Volatility Data Status", dq.get("volatility_data")),
        _row("Fundamentals Status", dq.get("fundamentals")),
        _row("News Status", dq.get("news")),
        _row("Analysis Depth", result.get("analysis_depth")),
        _row("LLM Calls Used", result.get("llm_calls_used")),
        _row("LLM Call Budget", result.get("llm_call_budget")),
    ]


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
    return [_row(key.replace("_", " ").title(), data_quality.get(key)) for key in keys if key in data_quality]


def _value_with_percent(value: Any, is_percent: bool) -> Any:
    if not is_percent:
        return value
    if value is None or value == "":
        return value
    text = str(value)
    return text if text.endswith("%") else f"{text}%"


def _simple_payload_rows(
    payload: dict[str, Any],
    definitions: list[tuple[str, str]],
    *,
    percent_keys: set[str] | None = None,
) -> list[dict[str, str]]:
    if not payload:
        return []
    percent_fields = percent_keys or set()
    return [_row(label, _value_with_percent(payload.get(key), key in percent_fields)) for key, label in definitions]


def _risk_summary_rows(risk_data_quality: dict[str, Any]) -> list[dict[str, str]]:
    summary = _as_dict(risk_data_quality.get("risk_summary"))
    if not summary:
        return []
    return [
        _row("Overall Risk", summary.get("overall_risk")),
        _row("Risk Score", summary.get("risk_score")),
        _row("Main Risks", ", ".join(_as_text_list(summary.get("main_risks"))) or "N/A"),
        _row("Risk Flags", ", ".join(_as_text_list(summary.get("risk_flags"))) or "N/A"),
        _row("Explanation", summary.get("risk_explanation")),
    ]


def _thesis_monitor_rows(risk_data_quality: dict[str, Any]) -> list[dict[str, str]]:
    monitor = _as_dict(risk_data_quality.get("thesis_monitor"))
    rows: list[dict[str, str]] = []
    if monitor.get("overall_thesis_status"):
        rows.append(
            {
                "category": "Overall",
                "condition": "Thesis status",
                "status": _display(monitor.get("overall_thesis_status")),
                "reason": "Aggregated from invalidation checklist.",
            }
        )
    for item in _as_list(monitor.get("checklist")):
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "category": _display(item.get("category")),
                "condition": _display(item.get("condition")),
                "status": _display(item.get("status")),
                "reason": _display(item.get("reason")),
            }
        )
    return rows


def _catalyst_risk_rows(risk_data_quality: dict[str, Any]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for item in _as_list(risk_data_quality.get("catalyst_risk")):
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "type": _display(item.get("type")),
                "label": _display(item.get("label")),
                "impact": _display(item.get("impact")),
                "date": _display(item.get("date")),
                "source": _display(item.get("source")),
                "reason": _display(item.get("reason")),
            }
        )
    return rows


def _source_quality_rows(
    risk_data_quality: dict[str, Any], fallback_rows: list[dict[str, str]]
) -> list[dict[str, str]]:
    quality = _as_dict(risk_data_quality.get("data_quality"))
    if not quality:
        return fallback_rows
    rows = [
        _row("Score", quality.get("score")),
        _row("Confidence", quality.get("confidence")),
        _row("Summary", quality.get("summary")),
    ]
    breakdown = _as_dict(quality.get("score_breakdown"))
    rows.extend(_row(key.replace("_", " ").title(), value) for key, value in breakdown.items())
    return rows


def _vendor_status_rows(risk_data_quality: dict[str, Any]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for vendor, payload in _as_dict(risk_data_quality.get("vendor_status")).items():
        item = _as_dict(payload)
        rows.append(
            {
                "vendor": _display(vendor),
                "status": _display(item.get("status")),
                "used_for": ", ".join(_as_text_list(item.get("used_for"))) or "N/A",
                "missing_fields": ", ".join(_as_text_list(item.get("missing_fields"))) or "N/A",
            }
        )
    return rows


def _list_payload_rows(risk_data_quality: dict[str, Any], key: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for item in _as_list(risk_data_quality.get(key)):
        if isinstance(item, dict):
            rows.append({str(field): _display(value) for field, value in item.items()})
        elif item:
            rows.append({"value": _display(item)})
    return rows


def _company_profile_rows(result: dict[str, Any]) -> list[dict[str, str]]:
    profile = _as_dict(result.get("company_profile"))
    if not profile or not profile.get("available"):
        return []

    ticker = str(profile.get("ticker") or result.get("ticker") or "")
    market = str(result.get("market") or "")
    currency = profile.get("currency")
    return [
        {"label": "Company Name", "value": _display(profile.get("company_name") or profile.get("name"))},
        {"label": "Ticker", "value": _display(profile.get("ticker"))},
        {"label": "Exchange", "value": _display(profile.get("exchange"))},
        {"label": "Currency", "value": _display(profile.get("currency"))},
        {"label": "Country", "value": _display(profile.get("country"))},
        {"label": "Sector", "value": _display(profile.get("sector"))},
        {"label": "Industry", "value": _display(profile.get("industry"))},
        {"label": "Website", "value": _display(profile.get("website"))},
        {"label": "Market Cap", "value": _format_market_cap(profile.get("market_cap"), currency)},
        {"label": "Shares Outstanding", "value": _format_number(profile.get("shares_outstanding"))},
        {"label": "Current Price", "value": _format_price(profile.get("current_price"), ticker, market)},
        {"label": "Fiscal Year End", "value": _display(profile.get("fiscal_year_end"))},
        {
            "label": "Employee Count",
            "value": _display(profile.get("employee_count") or profile.get("full_time_employees")),
        },
        {"label": "Profile Data Quality", "value": _display(_as_dict(profile.get("data_quality")).get("status"))},
    ]


def _company_profile_executives(result: dict[str, Any]) -> list[dict[str, str]]:
    profile = _as_dict(result.get("company_profile"))
    executives = profile.get("officers") or profile.get("executives") if profile else []
    if not isinstance(executives, list):
        return []

    rows = []
    for item in executives[:10]:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "name": _display(item.get("name")),
                "title": _display(item.get("title")),
            }
        )
    return rows


def _price_chart_rows(result: dict[str, Any], ticker: str, market: str) -> list[dict[str, str]]:
    chart = _as_dict(result.get("price_chart"))
    if not chart or not chart.get("available"):
        return []

    stats = _as_dict(chart.get("stats"))
    summary = _as_dict(result.get("price_performance")) or _as_dict(chart.get("summary"))
    return [
        {"label": "Window", "value": _display(chart.get("window_label"))},
        {"label": "Source", "value": _display(chart.get("source"))},
        {"label": "Lookback Days", "value": _display(chart.get("lookback_days"))},
        {"label": "Start Price", "value": _format_price(stats.get("start_price"), ticker, market)},
        {"label": "End Price", "value": _format_price(stats.get("end_price"), ticker, market)},
        {
            "label": "Period Return",
            "value": _format_percent(summary.get("period_return_percent") or stats.get("change_percent")),
        },
        {
            "label": "Period High",
            "value": _format_price(summary.get("period_high") or stats.get("high"), ticker, market),
        },
        {"label": "Period Low", "value": _format_price(summary.get("period_low") or stats.get("low"), ticker, market)},
        {"label": "Max Drawdown", "value": _format_percent(summary.get("max_drawdown_percent"))},
        {"label": "Average Close", "value": _format_price(stats.get("average_close"), ticker, market)},
        {"label": "Average Volume", "value": _display(summary.get("average_volume") or stats.get("average_volume"))},
        {"label": "Latest Volume", "value": _display(summary.get("latest_volume"))},
        {"label": "Volume Trend", "value": _display(summary.get("volume_trend"))},
        {"label": "Point Count", "value": _display(stats.get("point_count"))},
    ]


def _technical_entry_rows(result: dict[str, Any], ticker: str, market: str) -> list[dict[str, str]]:
    technical = _as_dict(result.get("technical_entry"))
    if not technical:
        return []
    return [
        _row("Entry Quality", technical.get("entry_quality")),
        _row("Trend", technical.get("trend")),
        _row("RSI", technical.get("rsi")),
        _row("RSI Signal", technical.get("rsi_signal")),
        _row("MACD", technical.get("macd")),
        _row("MACD Signal Value", technical.get("macd_signal_value")),
        _row("MACD Signal", technical.get("macd_signal")),
        {"label": "ATR", "value": _format_price(technical.get("atr"), ticker, market)},
        {"label": "SMA 20", "value": _format_price(technical.get("sma_20"), ticker, market)},
        {"label": "SMA 50", "value": _format_price(technical.get("sma_50"), ticker, market)},
        {"label": "SMA 200", "value": _format_price(technical.get("sma_200"), ticker, market)},
        {"label": "Support", "value": _format_price(technical.get("support"), ticker, market)},
        {"label": "Resistance", "value": _format_price(technical.get("resistance"), ticker, market)},
        _row("Volume Trend", technical.get("volume_trend")),
    ]


def _news_impact_rows(result: dict[str, Any]) -> list[dict[str, str]]:
    impact = _as_dict(result.get("news_impact"))
    if not impact:
        return []
    quality = _as_dict(impact.get("data_quality"))
    rules = _as_dict(quality.get("rules"))
    return [
        _row("Overall Sentiment", impact.get("overall_sentiment")),
        _row("Sentiment Score", impact.get("sentiment_score")),
        _row("High Impact Count", impact.get("high_impact_count") or len(impact.get("high_impact_news") or [])),
        _row("Full News Count", impact.get("full_news_count") or len(impact.get("full_news_list") or [])),
        _row("News Count", impact.get("news_count")),
        _row("Deduplicated Count", impact.get("deduplicated_count")),
        _row("Duplicate Removed", impact.get("duplicate_excluded_count")),
        _row("High Impact Limited", rules.get("high_impact_limited")),
        _row("Full News Limited", rules.get("full_news_limited")),
        _row("Sources Used", ", ".join(str(item) for item in quality.get("sources_used", []))),
    ]


def _high_impact_news_items(result: dict[str, Any]) -> list[dict[str, Any]]:
    impact = _as_dict(result.get("news_impact"))
    raw_items = impact.get("high_impact_news") if impact else []
    if not isinstance(raw_items, list):
        return []
    items: list[dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict) or not item.get("title"):
            continue
        items.append(
            {
                "title": _display(item.get("title")),
                "source": _display(item.get("source")),
                "publisher": _display(item.get("publisher")),
                "published_at": _display(item.get("published_at")),
                "sentiment": _display(item.get("sentiment")),
                "impact": _display(item.get("impact")),
                "impact_score": _display(item.get("impact_score")),
                "relevance_score": _display(item.get("relevance_score")),
                "materiality_category": _display(item.get("materiality_category")),
                "source_confidence_label": _display(item.get("source_confidence_label")),
                "news_scope": _display(item.get("scope_label") or item.get("news_scope")),
                "impact_reason": _display(item.get("impact_reason") or item.get("relevance_reason")),
                "summary": _display(item.get("summary")),
                "url": _safe_external_http_url(item.get("url")),
                "dedupe_key": _display(item.get("dedupe_key")),
            }
        )
    return items


def _catalyst_items(result: dict[str, Any], key: str) -> list[dict[str, str]]:
    tracker = _as_dict(result.get("catalyst_tracker"))
    raw_items = tracker.get(key) if tracker else []
    if not isinstance(raw_items, list):
        return []
    items: list[dict[str, str]] = []
    for item in raw_items[:5]:
        if not isinstance(item, dict):
            continue
        items.append(
            {
                "type": _display(item.get("type")),
                "label": _display(item.get("label")),
                "impact": _display(item.get("impact") or item.get("risk_level")),
                "source": _display(item.get("source")),
                "date": _display(item.get("date")),
                "related_news_title": _display(item.get("related_news_title")),
            }
        )
    return items


def _analyst_consensus_rows(result: dict[str, Any]) -> list[dict[str, str]]:
    consensus = _as_dict(result.get("analyst_consensus"))
    if not consensus or not consensus.get("available"):
        return []
    return [
        _row("Period", consensus.get("period")),
        _row("Strong Buy", consensus.get("strong_buy")),
        _row("Buy", consensus.get("buy")),
        _row("Hold", consensus.get("hold")),
        _row("Sell", consensus.get("sell")),
        _row("Strong Sell", consensus.get("strong_sell")),
        _row("Total", consensus.get("total")),
        _row("Consensus Label", consensus.get("consensus_label")),
        _row("Trend", consensus.get("trend")),
    ]


def _related_news_items(result: dict[str, Any]) -> list[dict[str, Any]]:
    related_news = _as_dict(result.get("related_news"))
    raw_items = related_news.get("items") if related_news else []
    if not isinstance(raw_items, list):
        return []

    items: list[dict[str, Any]] = []
    for item in _dedupe_report_news_items(raw_items):
        title = _clean_text(item.get("title"))
        if not title:
            continue

        items.append(
            {
                "title": title,
                "publisher": _display(item.get("publisher")),
                "published_at": _display(item.get("published_at")),
                "source": _display(item.get("source")),
                "event_type": _display(item.get("event_type")),
                "summary": _display(item.get("summary")),
                "relevance_reason": _display(item.get("relevance_reason")),
                "url": _safe_external_http_url(item.get("url")),
            }
        )
    return items


def _news_dedupe_key(item: dict[str, Any]) -> str:
    return _clean_text(
        item.get("dedupe_key")
        or item.get("normalized_url")
        or item.get("url")
        or item.get("normalized_title")
        or item.get("title")
    ).lower()


def _dedupe_report_news_items(items: list[Any]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    output: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        title = _clean_text(item.get("title"))
        if not title:
            continue
        key = _news_dedupe_key(item) or title.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output


def _full_news_items(result: dict[str, Any]) -> list[dict[str, Any]]:
    impact = _as_dict(result.get("news_impact"))
    related_news = _as_dict(result.get("related_news"))

    has_full_news_list = isinstance(impact.get("full_news_list"), list) if impact else False
    raw_items = impact.get("full_news_list") if has_full_news_list else related_news.get("items", [])
    high_items = impact.get("high_impact_news", []) if impact else []

    if not isinstance(raw_items, list):
        raw_items = []
    if not isinstance(high_items, list):
        high_items = []

    high_keys = {
        _news_dedupe_key(item)
        for item in high_items
        if isinstance(item, dict) and _news_dedupe_key(item)
    }

    items: list[dict[str, Any]] = []
    for item in _dedupe_report_news_items(raw_items):
        key = _news_dedupe_key(item)
        if key and key in high_keys:
            continue
        items.append(
            {
                "title": _display(item.get("title")),
                "publisher": _display(item.get("publisher")),
                "published_at": _display(item.get("published_at")),
                "source": _display(item.get("source")),
                "event_type": _display(item.get("event_type") or item.get("materiality_category")),
                "materiality_category": _display(item.get("materiality_category")),
                "news_scope": _display(item.get("scope_label") or item.get("news_scope")),
                "source_confidence_label": _display(item.get("source_confidence_label")),
                "impact": _display(item.get("impact")),
                "impact_score": _display(item.get("impact_score")),
                "relevance_score": _display(item.get("relevance_score")),
                "summary": _display(item.get("summary")),
                "impact_reason": _display(item.get("impact_reason") or item.get("relevance_reason")),
                "url": _safe_external_http_url(item.get("url")),
                "dedupe_key": _display(item.get("dedupe_key")),
            }
        )
    return items


def _safe_external_http_url(value: Any) -> str | None:
    text = _clean_text(value)
    if not text:
        return None
    try:
        parts = urlsplit(text)
        hostname = parts.hostname
        _ = parts.port
    except ValueError:
        return None
    return text if parts.scheme.lower() in {"http", "https"} and hostname else None


def _normalize_financial_highlight_row(row: dict[str, Any]) -> dict[str, Any]:
    unit = _clean_text(row.get("unit")) or ""
    values = row.get("values") if isinstance(row.get("values"), dict) else {}
    return {
        **row,
        "label": _clean_text(row.get("label")) or _clean_text(row.get("key")) or "Metric",
        "unit": unit or "-",
        "values": values,
        "display_values": {str(key): _financial_cell_display(cell, unit) for key, cell in values.items()},
    }


def _normalize_financial_highlight_snapshot(item: dict[str, Any]) -> dict[str, Any]:
    unit = _clean_text(item.get("unit")) or ""
    return {**item, "unit": unit or "-", "display": _financial_cell_display(item, unit)}


def _financial_highlights(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    periods = [period for period in value.get("periods", []) if isinstance(period, dict) and period.get("key")]
    rows = [
        _normalize_financial_highlight_row(row)
        for row in value.get("rows", [])
        if isinstance(row, dict) and isinstance(row.get("values"), dict)
    ]
    if not periods or not rows:
        return None
    sections = []
    for section in value.get("sections", []):
        if not isinstance(section, dict):
            continue
        section_rows = [
            _normalize_financial_highlight_row(row)
            for row in section.get("rows", [])
            if isinstance(row, dict) and isinstance(row.get("values"), dict)
        ]
        if section_rows:
            sections.append({**section, "rows": section_rows})
    if not sections:
        sections = [{"key": "legacy", "title": None, "rows": rows}]
    return {
        "title": _clean_text(value.get("title")) or "Key Financial Highlights",
        "unit_note": _clean_text(value.get("unit_note")),
        "periods": periods,
        "point_in_time": [
            _normalize_financial_highlight_snapshot(item)
            for item in value.get("point_in_time", [])
            if isinstance(item, dict)
        ],
        "sections": sections,
        "rows": rows,
    }


def _metric_detail_rows(value: Any, definitions: list[tuple[str, str]]) -> list[dict[str, str]]:
    payload = _as_dict(value)
    details = _as_dict(payload.get("metric_details"))
    if not payload:
        return []
    return [
        {"label": label, "value": _metric_detail_display(details.get(key), payload.get(key))}
        for key, label in definitions
    ]


def _metric_detail_display(value: Any, fallback: Any = None, unit: Any = "") -> str:
    detail = _as_dict(value)
    displayed = _display(detail.get("display") or fallback)
    if unit:
        displayed = _append_financial_unit(displayed, unit)
    if displayed == "N/A":
        displayed = "-"
    return f"{displayed} EST" if detail.get("status") == "estimated" and displayed != "-" else displayed


def _financial_trend_rows(value: Any) -> list[dict[str, Any]]:
    payload = _as_dict(value)
    details = _as_dict(payload.get("metric_details"))
    periods = [period for period in payload.get("periods", []) if isinstance(period, dict) and period.get("key")]
    definitions = [
        ("revenue", "Revenue", payload.get("scale_label") or ""),
        ("revenue_growth_percent", "Revenue Growth", "%"),
        ("ebitda", "EBITDA", payload.get("scale_label") or ""),
        ("ebitda_margin_percent", "EBITDA Margin", "%"),
        ("net_profit", "Net Profit", payload.get("scale_label") or ""),
        ("net_profit_growth_percent", "Net Profit Growth", "%"),
        ("net_profit_margin_percent", "Net Profit Margin", "%"),
        ("roe_percent", "ROE", "%"),
        ("eps", "EPS", f"{payload.get('currency') or ''}/share"),
        ("bvps", "BVPS", f"{payload.get('currency') or ''}/share"),
        ("der", "DER", "x"),
    ]
    rows = []
    for key, label, unit in definitions:
        cells = details.get(key)
        if not isinstance(cells, list):
            continue
        values = [
            _metric_detail_display(cells[index] if index < len(cells) else None, unit=unit)
            for index, _period in enumerate(periods or cells)
        ]
        rows.append({"label": label, "values": values})
    return rows


def _scenario_rows(value: Any) -> list[dict[str, str]]:
    payload = _as_dict(value)
    rows = []
    for case in ("bear", "base", "bull"):
        item = _as_dict(payload.get(case))
        if item:
            rows.append(
                {
                    "scenario": case.title(),
                    "fair_value": _display(item.get("fair_value_display") or item.get("fair_value")),
                    "upside": _display(item.get("upside_downside_display") or item.get("upside_downside_percent")),
                    "growth": _format_percent(item.get("revenue_growth_assumption_percent")),
                    "margin": _format_percent(item.get("margin_assumption_percent")),
                    "multiple": _display(item.get("valuation_multiple")),
                    "assumption": _display(item.get("assumption")),
                }
            )
    return rows


def _peer_comparison_rows(value: Any) -> list[dict[str, str]]:
    payload = _as_dict(value)
    rows = []
    for item in payload.get("metrics") or []:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "ticker": _display(item.get("ticker")),
                "company_name": _display(item.get("company_name")),
                "pe": _display(item.get("pe")),
                "pbv": _display(item.get("pbv")),
                "roe": _format_percent(item.get("roe_percent")),
                "margin": _format_percent(item.get("net_profit_margin_percent")),
                "der": _display(item.get("der")),
                "dividend_yield": _format_percent(item.get("dividend_yield_percent")),
            }
        )
    return rows


def _news_context(result: dict[str, Any]) -> dict[str, Any]:
    return _as_dict(result.get("news") or result.get("news_context"))


def _news_articles(result: dict[str, Any]) -> list[dict[str, Any]]:
    articles = _news_context(result).get("articles")
    if not isinstance(articles, list):
        return []
    items = []
    for article in articles:
        if not isinstance(article, dict) or not article.get("title"):
            continue
        item = dict(article)
        item["url"] = _safe_external_http_url(article.get("url"))
        items.append(item)
    return items


def _news_provider_rows(result: dict[str, Any]) -> list[dict[str, str]]:
    statuses = _news_context(result).get("provider_status")
    if not isinstance(statuses, dict):
        return []
    return [{"label": str(provider), "value": _display(status)} for provider, status in statuses.items()]


def _analyst_sections(result: dict[str, Any]) -> list[dict[str, str]]:
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
    sections: list[dict[str, str]] = []
    for title, field in fields:
        body = _strip_legacy_report_fields(result.get(field))
        if body:
            sections.append({"title": title, "body": body})
    return sections
