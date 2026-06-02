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

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = BACKEND_DIR / "templates"
REPORT_CSS_PATH = BACKEND_DIR / "static" / "reports" / "analysis_report.css"

SUPPORTED_REPORT_MARKETS = {"US", "ID"}
ACTIONABLE_DECISIONS = {"Buy", "Sell", "Overweight", "Underweight"}
NON_ID_EXCHANGE_SUFFIX_RE = re.compile(r"\.(?!JK$)[A-Z0-9]{1,5}$")
SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9_.-]+")
LEGACY_REPORT_FIELD_RE = re.compile(r"\b(price target|risk per share|reward per share)\b", re.IGNORECASE)

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


async def get_analysis_result_for_report(job_id: str, *, owner_id: str) -> dict[str, Any]:
    """Return a completed analysis payload by canonical job_id."""

    job = await jobs.JOB_STORE.get(job_id, owner_id=owner_id)
    if job is not None and isinstance(job.result, dict):
        return dict(job.result)
    if await jobs.JOB_STORE.get(job_id) is not None:
        raise ReportNotFoundError(job_id)

    repository = get_analysis_repository()
    result = await asyncio.to_thread(repository.get_analysis_by_job_id, job_id)
    if isinstance(result, dict):
        return result
    raise ReportNotFoundError(job_id)


async def get_analysis_result_for_report_by_request_id(request_id: str, *, owner_id: str) -> dict[str, Any]:
    """Return a completed analysis payload through the migration alias."""

    job = await jobs.JOB_STORE.get_by_request_id(request_id, owner_id=owner_id)
    if job is not None and isinstance(job.result, dict):
        return dict(job.result)
    if await jobs.JOB_STORE.get_by_request_id(request_id) is not None:
        raise ReportNotFoundError(request_id)

    repository = get_analysis_repository()
    result = await asyncio.to_thread(repository.get_analysis, request_id)
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


def build_report_context(result: dict[str, Any]) -> dict[str, Any]:
    """Normalize backend analysis payload into a template-friendly report dict."""

    validate_report_scope(result)

    market = str(result.get("market") or "").upper()
    ticker = str(result.get("ticker") or "N/A").upper()
    final_decision = _clean_text(result.get("final_decision") or result.get("decision") or "Hold")
    llm_decision = _clean_text(result.get("llm_decision"))
    trade_plan_valid = bool(result.get("trade_plan_valid"))
    is_actionable_trade_plan = final_decision in ACTIONABLE_DECISIONS and trade_plan_valid
    current_price = _coalesce(result.get("current_price"), result.get("last_close_price"))
    validation_warnings = _as_text_list(result.get("validation_warnings"))
    data_quality = _as_dict(result.get("data_quality"))

    if current_price is None and "CURRENT_PRICE_MISSING" not in validation_warnings:
        validation_warnings = [*validation_warnings, "CURRENT_PRICE_MISSING"]

    report: dict[str, Any] = {
        "request_id": _clean_text(result.get("request_id")),
        "ticker": ticker,
        "market": market,
        "market_label": "US Stocks" if market == "US" else "Indonesia Stocks",
        "trade_date": _clean_text(result.get("trade_date")),
        "generated_at": _format_datetime(datetime.now(UTC).isoformat()),
        "analysis_created_at": _format_datetime(result.get("analysis_created_at")),
        "disclaimer": REPORT_DISCLAIMER,
        "current_price": current_price,
        "current_price_display": _format_price(current_price, ticker, market),
        "current_price_as_of": _display(result.get("current_price_as_of") or result.get("last_close_price_as_of")),
        "current_price_source": _display(result.get("current_price_source")),
        "llm_decision": _display(llm_decision),
        "final_decision": final_decision,
        "decision": final_decision,
        "executive_summary": _display(result.get("executive_summary")),
        "decision_adjusted": bool(result.get("decision_adjusted")),
        "decision_adjusted_reason": _display(result.get("decision_adjusted_reason")),
        "trade_plan_valid": trade_plan_valid,
        "has_existing_position": bool(result.get("has_existing_position")),
        "is_actionable_trade_plan": is_actionable_trade_plan,
        "validation_warnings": validation_warnings,
        "data_quality": data_quality,
        "data_quality_rows": _data_quality_rows(data_quality),
        "data_quality_warnings": _as_text_list(data_quality.get("warnings")) if data_quality else [],
        "analyst_sections": _analyst_sections(result),
        "financial_highlights": _financial_highlights(result.get("financial_highlights")),
        "company_profile": _as_dict(result.get("company_profile")),
        "company_profile_rows": _company_profile_rows(result),
        "company_profile_executives": _company_profile_executives(result),
        "price_chart_rows": _price_chart_rows(result, ticker, market),
        "related_news": _as_dict(result.get("related_news")),
        "related_news_items": _related_news_items(result),
        "news": _news_context(result),
        "news_articles": _news_articles(result),
        "news_provider_rows": _news_provider_rows(result),
        "show_trade_plan": is_actionable_trade_plan,
    }

    report["executive_rows"] = _executive_rows(result, report)
    report["decision_rows"] = _decision_rows(result, report)
    report["trade_plan_rows"] = _trade_plan_rows(result, ticker, market) if is_actionable_trade_plan else []
    report["risk_rows"] = _risk_rows(result, include_max_drawdown=is_actionable_trade_plan)
    report["validation_rows"] = _validation_rows(result, report)
    return report


def render_analysis_report_html(report: dict[str, Any]) -> str:
    template = _REPORT_ENV.get_template("reports/analysis_report.html")
    return template.render(report=report, css=_read_report_css())


def render_analysis_report_pdf(report: dict[str, Any]) -> bytes:
    html = render_analysis_report_html(report)
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
        return ""


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


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


def _as_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


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
    return [
        {"label": "Window", "value": _display(chart.get("window_label"))},
        {"label": "Source", "value": _display(chart.get("source"))},
        {"label": "Lookback Days", "value": _display(chart.get("lookback_days"))},
        {"label": "Start Price", "value": _format_price(stats.get("start_price"), ticker, market)},
        {"label": "End Price", "value": _format_price(stats.get("end_price"), ticker, market)},
        {"label": "Change %", "value": _display(stats.get("change_percent"))},
        {"label": "High", "value": _format_price(stats.get("high"), ticker, market)},
        {"label": "Low", "value": _format_price(stats.get("low"), ticker, market)},
        {"label": "Average Close", "value": _format_price(stats.get("average_close"), ticker, market)},
        {"label": "Average Volume", "value": _display(stats.get("average_volume"))},
        {"label": "Point Count", "value": _display(stats.get("point_count"))},
    ]


def _related_news_items(result: dict[str, Any]) -> list[dict[str, Any]]:
    related_news = _as_dict(result.get("related_news"))
    raw_items = related_news.get("items") if related_news else []
    if not isinstance(raw_items, list):
        return []

    items: list[dict[str, Any]] = []
    for item in raw_items[:8]:
        if not isinstance(item, dict):
            continue

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


def _financial_highlights(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    periods = [period for period in value.get("periods", []) if isinstance(period, dict) and period.get("key")]
    rows = [row for row in value.get("rows", []) if isinstance(row, dict) and isinstance(row.get("values"), dict)]
    if not periods or not rows:
        return None
    sections = []
    for section in value.get("sections", []):
        if not isinstance(section, dict):
            continue
        section_rows = [
            row for row in section.get("rows", []) if isinstance(row, dict) and isinstance(row.get("values"), dict)
        ]
        if section_rows:
            sections.append({**section, "rows": section_rows})
    if not sections:
        sections = [{"key": "legacy", "title": None, "rows": rows}]
    return {
        "title": _clean_text(value.get("title")) or "Key Financial Highlights",
        "unit_note": _clean_text(value.get("unit_note")),
        "periods": periods,
        "point_in_time": [item for item in value.get("point_in_time", []) if isinstance(item, dict)],
        "sections": sections,
        "rows": rows,
    }


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
