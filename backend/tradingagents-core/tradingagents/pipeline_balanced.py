"""Balanced 9-call analysis pipeline.

This pipeline keeps the public API response compatible with the classic
TradingAgents graph, but removes expensive LLM tool-calling loops. Data is
collected deterministically through yfinance-backed tools first. Gemini is then
called in nine larger, role-based steps:

1. Market Analyst
2. News + Social Sentiment Analyst
3. Fundamentals Analyst
4. Bull Researcher
5. Bear Researcher
6. Research Manager
7. Trader
8. Risk Committee
9. Portfolio Manager

The goal is predictable cost and speed. A failed structured call returns a safe
local fallback instead of making another LLM call, so one logical step remains
one LLM request. Because apparently software can be cheaper when it does not
hold a committee meeting for every sentence.
"""

from __future__ import annotations

import csv
import json
import logging
import queue
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta
from io import StringIO
from typing import Any, Callable, Optional, TypeVar

from pydantic import BaseModel, Field

from tradingagents.agents.schemas import (
    DebateArgument,
    PortfolioDecision,
    PortfolioRating,
    TraderAction,
    TraderProposal,
    VolatilityLevel,
    render_debate_argument,
    render_trader_proposal,
)
from tradingagents.agents.utils.structured import bind_structured
from tradingagents.dataflows.config import get_config, set_config, use_config
from tradingagents.dataflows.data_quality import DataField, DataQualityReport, extract_price_dates, looks_missing
from tradingagents.dataflows.interface import route_to_vendor
from tradingagents.dataflows.y_finance import normalize_ticker
from tradingagents.llm_clients import create_llm_client
from tradingagents.agents.utils.agent_utils import get_language_instruction
from tradingagents.utils_resilience import call_with_timeout

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class AnalystReport(BaseModel):
    title: str = Field(description="Short title for the report.")
    summary: str = Field(description="Plain-English summary of the evidence and conclusion.")
    key_points: list[str] = Field(default_factory=list, max_length=8)
    risks: list[str] = Field(default_factory=list, max_length=6)
    confidence: float = Field(ge=0.0, le=1.0)


class ResearchPlanLite(BaseModel):
    recommendation: PortfolioRating
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str
    strategic_actions: str


class RiskCommitteeReport(BaseModel):
    overall_risk_level: str = Field(description="Low, Medium, High, or Very High.")
    aggressive_view: str
    neutral_view: str
    conservative_view: str
    key_risks: list[str] = Field(default_factory=list, max_length=8)
    mitigation_plan: str
    confidence: float = Field(ge=0.0, le=1.0)


@dataclass
class CollectedData:
    ticker: str
    trade_date: str
    price_data: str
    technical_indicators: str
    fundamentals: str
    balance_sheet: str
    cashflow: str
    income_statement: str
    company_news: str
    global_news: str
    insider_transactions: str
    data_quality: DataQualityReport
    last_close_price: float | None


class AnalysisCancelledError(RuntimeError):
    """Raised when an API client cancels an in-progress analysis."""


class LLMBudget:
    """Thread-safe logical LLM call budget for the whole pipeline."""

    def __init__(self, limit: int) -> None:
        self.limit = max(0, int(limit))
        self.used = 0
        self.exhausted = False
        self.agents_skipped: list[str] = []
        self._lock = threading.Lock()

    def consume(self, agent_name: str) -> bool:
        with self._lock:
            if self.used >= self.limit:
                self.exhausted = True
                self.agents_skipped.append(agent_name)
                logger.warning(
                    "LLM budget exhausted before %s. Used %d/%d calls.",
                    agent_name,
                    self.used,
                    self.limit,
                )
                return False
            self.used += 1
            return True

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "used": self.used,
                "limit": self.limit,
                "budget_exhausted": self.exhausted,
                "agents_skipped": list(dict.fromkeys(self.agents_skipped)),
            }


def _check_cancel(cancel_check: Optional[Callable[[], bool]]) -> None:
    if cancel_check is not None and cancel_check():
        raise AnalysisCancelledError("Analysis was cancelled by the client.")


def _truncate(value: Any, limit: int = 12_000) -> str:
    """Convert *value* to a string and truncate it to *limit* characters.

    Truncation always happens on a newline boundary so the LLM never receives
    a line that is split mid-number, mid-word, or mid-JSON value. If no newline
    exists before the limit the hard character boundary is used as a fallback.
    """
    text = str(value or "")
    if len(text) <= limit:
        return text

    # Walk back from the hard limit to find the last complete line.
    boundary = text.rfind("\n", 0, limit)
    cut = boundary if boundary > 0 else limit
    return text[:cut] + "\n\n[TRUNCATED FOR TOKEN CONTROL]"


def _call_yfinance_with_resilience(func: Callable[[], Any]) -> Any:
    # route_to_vendor is the single app-level retry/circuit/timeout layer for
    # market-data calls. yfinance-specific helpers keep their narrow transient
    # retry, so the balanced pipeline must not wrap the same field again.
    return func()


def _run_with_config(config: dict[str, Any], func: Callable[[], T]) -> T:
    with use_config(config):
        return func()


def _safe_data_field(label: str, func: Callable[[], Any], limit: int = 12_000) -> DataField:
    try:
        value = _truncate(_call_yfinance_with_resilience(func), limit)
        status = "missing" if looks_missing(value) else "ok"
        warning = value.splitlines()[0] if status == "missing" and value else None
        return DataField(value=value, status=status, warning=warning)
    except Exception as exc:
        logger.warning("Balanced pipeline data call failed for %s: %s", label, exc)
        return DataField(value=f"{label} unavailable: {exc}", status="missing", warning=f"{label} unavailable: {exc}")


def _extract_last_close_price(price_data: str, trade_date: str) -> float | None:
    """Parse the last Close value at or before trade_date from yfinance CSV."""
    lines = [
        line
        for line in (price_data or "").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not lines:
        return None

    try:
        cutoff = datetime.strptime(trade_date, "%Y-%m-%d")
    except ValueError:
        cutoff = None

    last_date: datetime | None = None
    last_close: float | None = None
    reader = csv.DictReader(StringIO("\n".join(lines)))
    for row in reader:
        if not row:
            continue
        date_raw = (row.get("Date") or row.get("") or next(iter(row.values()), "") or "").strip()
        close_raw = (row.get("Close") or row.get("Adj Close") or "").strip()
        if not date_raw or not close_raw:
            continue
        try:
            row_date = datetime.strptime(date_raw[:10], "%Y-%m-%d")
            close = float(close_raw.replace(",", ""))
        except (TypeError, ValueError):
            continue
        if cutoff is not None and row_date > cutoff:
            continue
        if last_date is None or row_date >= last_date:
            last_date = row_date
            last_close = close
    return last_close


def _date_window(trade_date: str) -> tuple[str, str, str]:
    current = datetime.strptime(trade_date, "%Y-%m-%d")
    start_90 = (current - timedelta(days=90)).strftime("%Y-%m-%d")
    start_30 = (current - timedelta(days=30)).strftime("%Y-%m-%d")
    end = (current + timedelta(days=1)).strftime("%Y-%m-%d")
    return start_90, start_30, end


def collect_market_data(
    ticker: str,
    trade_date: str,
    config: dict[str, Any],
    cancel_check: Optional[Callable[[], bool]] = None,
) -> CollectedData:
    """Collect external data in parallel and classify yfinance data quality.

    Price, fundamentals, financial statements, news, insider activity, and
    indicators are independent calls. Running them concurrently keeps the
    balanced pipeline from behaving like a government queue with better logs.
    """
    _check_cancel(cancel_check)
    set_config(config)
    # Normalize ticker early so all downstream calls (yfinance, cache filenames,
    # display output) use the canonical symbol with the correct exchange suffix.
    ticker = normalize_ticker(ticker)
    start_90, start_30, end = _date_window(trade_date)

    # Default indicator set covers trend, momentum, volatility (Bollinger bands),
    # and money flow. boll_ub / boll_lb give the agent overbought/oversold context
    # that the plain boll middle-band alone cannot provide. mfi adds volume-weighted
    # momentum confirmation alongside RSI.
    indicator_names = [
        "close_50_sma",
        "close_200_sma",
        "macd",
        "rsi",
        "atr",
        "boll_ub",
        "boll_lb",
        "mfi",
    ]
    tasks: dict[str, Callable[[], DataField]] = {
        "price_data": lambda: _safe_data_field(
            "price_data",
            lambda: route_to_vendor("get_stock_data", ticker, start_90, end),
            limit=14_000,
        ),
        "fundamentals": lambda: _safe_data_field(
            "fundamentals",
            lambda: route_to_vendor("get_fundamentals", ticker, trade_date),
            limit=12_000,
        ),
        "balance_sheet": lambda: _safe_data_field(
            "balance_sheet",
            lambda: route_to_vendor("get_balance_sheet", ticker, "quarterly", trade_date),
            limit=10_000,
        ),
        "cashflow": lambda: _safe_data_field(
            "cashflow",
            lambda: route_to_vendor("get_cashflow", ticker, "quarterly", trade_date),
            limit=10_000,
        ),
        "income_statement": lambda: _safe_data_field(
            "income_statement",
            lambda: route_to_vendor("get_income_statement", ticker, "quarterly", trade_date),
            limit=10_000,
        ),
        "company_news": lambda: _safe_data_field(
            "company_news",
            lambda: route_to_vendor("get_news", ticker, start_30, end),
            limit=12_000,
        ),
        "global_news": lambda: _safe_data_field(
            "global_news",
            lambda: route_to_vendor("get_global_news", trade_date, 7, 10),
            limit=8_000,
        ),
        "insider_transactions": lambda: _safe_data_field(
            "insider_transactions",
            lambda: route_to_vendor("get_insider_transactions", ticker),
            limit=6_000,
        ),
    }
    for indicator in indicator_names:
        tasks[f"indicator:{indicator}"] = lambda indicator=indicator: _safe_data_field(
            f"indicator:{indicator}",
            lambda indicator=indicator: route_to_vendor("get_indicators", ticker, indicator, trade_date, 30),
            limit=4_000,
        )

    results: dict[str, DataField] = {}
    with ThreadPoolExecutor(max_workers=min(12, len(tasks)), thread_name_prefix="balanced-data") as pool:
        futures = {pool.submit(_run_with_config, config, func): name for name, func in tasks.items()}
        for future in as_completed(futures):
            _check_cancel(cancel_check)
            name = futures[future]
            try:
                results[name] = future.result()
            except Exception as exc:
                logger.warning("Balanced pipeline data future failed for %s: %s", name, exc)
                results[name] = DataField(value=f"{name} unavailable: {exc}", status="missing", warning=f"{name} unavailable: {exc}")

    price = results["price_data"]
    fundamentals = results["fundamentals"]
    balance_sheet = results["balance_sheet"]
    cashflow = results["cashflow"]
    income_statement = results["income_statement"]
    company_news = results["company_news"]
    global_news = results["global_news"]
    insider_transactions = results["insider_transactions"]
    indicator_parts = [results[f"indicator:{indicator}"] for indicator in indicator_names]

    warnings: list[str] = []
    for item in [price, fundamentals, balance_sheet, cashflow, income_statement, company_news, global_news, insider_transactions, *indicator_parts]:
        if item.warning:
            warnings.append(item.warning)

    price_dates = extract_price_dates(price.value)
    if price.status == "missing":
        price_status = "invalid_ticker" if fundamentals.status == "missing" else "missing"
    elif trade_date not in price_dates:
        price_status = "market_closed"
        warnings.append(f"No yfinance OHLCV row found exactly on {trade_date}; market may have been closed or ticker may not trade that day.")
    elif len(price_dates) < 10:
        price_status = "partial"
        warnings.append(f"Only {len(price_dates)} price rows found in the 90-day yfinance window.")
    else:
        price_status = "ok"

    financial_statuses = [fundamentals.status, balance_sheet.status, cashflow.status, income_statement.status]
    if all(status == "missing" for status in financial_statuses):
        fundamentals_status = "missing"
    elif any(status == "missing" for status in financial_statuses):
        fundamentals_status = "partial"
        missing_parts = [
            name for name, item in [
                ("fundamentals", fundamentals),
                ("balance_sheet", balance_sheet),
                ("cashflow", cashflow),
                ("income_statement", income_statement),
            ] if item.status == "missing"
        ]
        warnings.append(f"Partial fundamentals from yfinance; missing: {', '.join(missing_parts)}.")
    else:
        fundamentals_status = "ok"

    if company_news.status == "missing" and global_news.status == "missing":
        news_status = "missing"
    elif company_news.status == "missing" or global_news.status == "missing":
        news_status = "partial"
        warnings.append("Partial news coverage from yfinance; company-specific or global news is missing.")
    else:
        news_status = "ok"

    data_quality = DataQualityReport(
        price_data=price_status,
        fundamentals=fundamentals_status,
        news=news_status,
        warnings=list(dict.fromkeys(warnings))[:20],
    )

    _check_cancel(cancel_check)
    return CollectedData(
        ticker=ticker,
        trade_date=trade_date,
        price_data=price.value,
        technical_indicators="\n\n".join(part.value for part in indicator_parts),
        fundamentals=fundamentals.value,
        balance_sheet=balance_sheet.value,
        cashflow=cashflow.value,
        income_statement=income_statement.value,
        company_news=company_news.value,
        global_news=global_news.value,
        insider_transactions=insider_transactions.value,
        data_quality=data_quality,
        last_close_price=_extract_last_close_price(price.value, trade_date),
    )

def _provider_kwargs(config: dict[str, Any]) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    if config.get("timeout"):
        kwargs["timeout"] = config.get("timeout")
    if config.get("provider_sdk_max_retries") is not None:
        kwargs["max_retries"] = config.get("provider_sdk_max_retries")

    provider = str(config.get("llm_provider", "")).lower()
    if provider == "google" and config.get("google_thinking_level"):
        kwargs["thinking_level"] = config.get("google_thinking_level")
    if provider == "openai" and config.get("openai_reasoning_effort"):
        kwargs["reasoning_effort"] = config.get("openai_reasoning_effort")
    if provider == "anthropic" and config.get("anthropic_effort"):
        kwargs["effort"] = config.get("anthropic_effort")
    return kwargs


def _create_llms(config: dict[str, Any]) -> tuple[Any, Any]:
    kwargs = _provider_kwargs(config)
    quick_client = create_llm_client(
        provider=config["llm_provider"],
        model=config["quick_think_llm"],
        base_url=config.get("backend_url"),
        **kwargs,
    )
    deep_client = create_llm_client(
        provider=config["llm_provider"],
        model=config["deep_think_llm"],
        base_url=config.get("backend_url"),
        **kwargs,
    )
    return quick_client.get_llm(), deep_client.get_llm()


def _coerce_structured(raw: Any, schema: type[T]) -> Optional[T]:
    if raw is None:
        return None
    if isinstance(raw, schema):
        return raw
    try:
        if isinstance(raw, dict):
            return schema.model_validate(raw)
        if hasattr(raw, "model_dump"):
            return schema.model_validate(raw.model_dump())
        content = getattr(raw, "content", raw)
        if isinstance(content, str):
            cleaned = content.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.strip("`")
                cleaned = cleaned.removeprefix("json").strip()
            return schema.model_validate_json(cleaned)
    except Exception:
        return None
    return None


def _invoke_once(
    llm: Any,
    schema: type[T],
    prompt: str,
    fallback: T,
    agent_name: str,
    budget: LLMBudget | None = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> T:
    """Call the LLM once for a structured result while enforcing budget.

    No second LLM fallback is used. This keeps the balanced pipeline's request
    budget predictable. If the provider cannot produce structured output, one
    plain JSON-style invoke is attempted and parsed locally.
    """
    _check_cancel(cancel_check)
    if budget is not None and not budget.consume(agent_name):
        return fallback

    structured = bind_structured(llm, schema, agent_name)
    try:
        def invoke_model() -> Any:
            if structured is not None:
                return structured.invoke(prompt)
            return llm.invoke(prompt + "\n\nReturn only valid JSON matching this schema: " + json.dumps(schema.model_json_schema()))

        timeout_seconds = max(1, int(get_config().get("timeout", 60)))
        result = call_with_timeout(
            invoke_model,
            timeout_seconds=timeout_seconds,
            service_name=f"llm:{agent_name}",
        )
        _check_cancel(cancel_check)
        parsed = _coerce_structured(result, schema)
        if parsed is not None:
            return parsed
        logger.warning("%s returned unparseable structured output. Using local fallback.", agent_name)
    except AnalysisCancelledError:
        raise
    except Exception as exc:
        logger.warning("%s LLM call failed in balanced pipeline: %s", agent_name, exc)
    return fallback

def _fallback_report(title: str, summary: str) -> AnalystReport:
    return AnalystReport(title=title, summary=summary, key_points=[summary], risks=["Data quality should be verified before trading."], confidence=0.35)


def _report_to_markdown(report: AnalystReport) -> str:
    key_points = "\n".join(f"- {item}" for item in report.key_points) or "- No key points returned."
    risks = "\n".join(f"- {item}" for item in report.risks) or "- No major risks returned."
    return "\n".join([
        f"## {report.title}",
        "",
        report.summary,
        "",
        "### Key Points",
        key_points,
        "",
        "### Risks",
        risks,
        "",
        f"Confidence: {report.confidence:.2f}",
    ])


def _research_plan_to_markdown(plan: ResearchPlanLite) -> str:
    return "\n".join([
        f"**Recommendation**: {plan.recommendation.value}",
        f"**Confidence**: {plan.confidence:.2f}",
        "",
        f"**Rationale**: {plan.rationale}",
        "",
        f"**Strategic Actions**: {plan.strategic_actions}",
    ])


def _risk_to_markdown(report: RiskCommitteeReport) -> str:
    risks = "\n".join(f"- {item}" for item in report.key_risks) or "- No major risks returned."
    return "\n".join([
        f"**Overall Risk Level**: {report.overall_risk_level}",
        f"**Confidence**: {report.confidence:.2f}",
        "",
        f"**Aggressive View**: {report.aggressive_view}",
        "",
        f"**Neutral View**: {report.neutral_view}",
        "",
        f"**Conservative View**: {report.conservative_view}",
        "",
        "**Key Risks**:",
        risks,
        "",
        f"**Mitigation Plan**: {report.mitigation_plan}",
    ])



ProgressCallback = Callable[[dict[str, Any]], None]


_AGENT_LABELS = {
    "data_collection": "Data Collection",
    "data_quality": "Data Quality",
    "market_analyst": "Market Analyst",
    "news_analyst": "News + Social Analyst",
    "fundamentals": "Fundamentals Analyst",
    "bull_researcher": "Bull Researcher",
    "bear_researcher": "Bear Researcher",
    "research_manager": "Research Manager",
    "trader": "Trader",
    "risk_analysts": "Risk Analysts",
    "portfolio_manager": "Portfolio Manager",
}


def _emit_progress(callback: Optional[ProgressCallback], agent_id: str, status: str, message: str) -> None:
    if callback is None:
        return
    try:
        callback(
            {
                "agent_id": agent_id,
                "agent_name": _AGENT_LABELS.get(agent_id, agent_id.replace("_", " ").title()),
                "status": status,
                "status_message": message,
                "timestamp": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            }
        )
    except Exception as exc:
        logger.debug("Progress callback failed for %s: %s", agent_id, exc)


def _emit_data_quality(callback: Optional[ProgressCallback], report: DataQualityReport) -> None:
    if callback is None:
        return
    message = (
        f"Data quality: price={report.price_data}, "
        f"fundamentals={report.fundamentals}, news={report.news}."
    )
    if report.warnings:
        message = f"{message} Warning: {report.warnings[0]}"
    try:
        callback(
            {
                "agent_id": "data_quality",
                "agent_name": _AGENT_LABELS["data_quality"],
                "status": "completed",
                "status_message": message,
                "data_quality": report.model_dump(),
                "timestamp": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            }
        )
    except Exception as exc:
        logger.debug("Progress callback failed for data_quality: %s", exc)


def _run_tracked(
    callback: Optional[ProgressCallback],
    agent_id: str,
    message: str,
    func: Callable[[], T],
    cancel_check: Optional[Callable[[], bool]] = None,
) -> T:
    _check_cancel(cancel_check)
    _emit_progress(callback, agent_id, "started", message)
    try:
        result = func()
    except AnalysisCancelledError:
        _emit_progress(callback, agent_id, "failed", f"{_AGENT_LABELS.get(agent_id, agent_id)} cancelled.")
        raise
    except Exception:
        _emit_progress(callback, agent_id, "failed", f"{_AGENT_LABELS.get(agent_id, agent_id)} failed.")
        raise
    _check_cancel(cancel_check)
    _emit_progress(callback, agent_id, "completed", f"{_AGENT_LABELS.get(agent_id, agent_id)} completed.")
    return result


def run_balanced_pipeline(
    ticker: str,
    trade_date: str,
    config: dict[str, Any],
    progress_callback: Optional[ProgressCallback] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> dict[str, Any]:
    """Run the balanced 9-call pipeline and return classic-compatible state.

    The first three analyst calls run in parallel after deterministic data
    collection. The optional progress callback emits real agent start/completed
    events for the SSE endpoint instead of pretending a stopwatch is an agent.
    """
    set_config(config)
    quick_llm, deep_llm = _create_llms(config)
    analysis_depth = str(config.get("analysis_depth", "balanced")).lower()
    llm_budget = LLMBudget(int(config.get("max_gemini_calls", 9)))
    data = _run_tracked(
        progress_callback,
        "data_collection",
        "Collecting yfinance prices, indicators, fundamentals, news, and insider data...",
        lambda: collect_market_data(ticker, trade_date, config, cancel_check=cancel_check),
        cancel_check=cancel_check,
    )
    data_fetched_at = datetime.utcnow().isoformat()
    data_quality_json = json.dumps(data.data_quality.model_dump(), indent=2)
    last_close_text = f"{data.last_close_price:.2f}" if data.last_close_price is not None else "Unavailable"
    _emit_data_quality(progress_callback, data.data_quality)

    # Analyst threads enqueue progress immediately; a lightweight forwarder
    # serializes delivery without making worker threads wait on the SSE path.
    analyst_event_queue: queue.Queue[dict[str, Any] | None] = queue.Queue()
    analyst_forwarder: threading.Thread | None = None

    def _forward_analyst_events() -> None:
        while True:
            event = analyst_event_queue.get()
            try:
                if event is None:
                    return
                if progress_callback is not None:
                    progress_callback(event)
            except Exception as exc:
                logger.debug("Analyst progress forwarding failed: %s", exc)
            finally:
                analyst_event_queue.task_done()

    if progress_callback is not None:
        analyst_forwarder = threading.Thread(
            target=_forward_analyst_events,
            name="balanced-analyst-progress",
            daemon=True,
        )
        analyst_forwarder.start()

    def _queued_callback(event: dict) -> None:
        if progress_callback is None:
            return
        analyst_event_queue.put_nowait(event)

    def build_market_report_parallel() -> AnalystReport:
        return _run_tracked(
            _queued_callback,
            "market_analyst",
            "Market Analyst is reading price action and technical indicators...",
            lambda: _invoke_once(
                quick_llm,
                AnalystReport,
                f"""
You are the Market Analyst for {ticker} on {trade_date}.
Use only the supplied price and technical data. Produce a practical technical/market report.
Focus on trend, momentum, volatility, volume, support/resistance, and what the setup implies.

DATA QUALITY INSTRUCTION:
Review the DATA QUALITY block below before writing your report.
If any field shows status "partial" or "missing", explicitly state that limitation
in your report and lower your confidence score accordingly. Do not present conclusions
as certain when the underlying data is incomplete.

PRICE DATA:
{data.price_data}

TECHNICAL INDICATORS:
{data.technical_indicators}

DATA QUALITY:
{data_quality_json}
{get_language_instruction()}""",
                _fallback_report("Market Analyst Report", f"Market data for {ticker} was collected, but the model did not return a complete market view."),
                "Market Analyst",
                llm_budget,
                cancel_check,
            ),
        )

    def build_news_social_report_parallel() -> AnalystReport:
        return _run_tracked(
            _queued_callback,
            "news_analyst",
            "News + Social Analyst is scanning company news, macro news, and insider activity...",
            lambda: _invoke_once(
                quick_llm,
                AnalystReport,
                f"""
You are the combined News and Social Sentiment Analyst for {ticker} on {trade_date}.
Use the company news, macro news, and insider activity. Produce a sentiment and catalyst report.
Separate company-specific catalysts from broad market/macroeconomic pressure.

DATA QUALITY INSTRUCTION:
Review the DATA QUALITY block below before writing your report.
If news shows status "partial" or "missing", explicitly state that the sentiment assessment
is limited. Do not assert market sentiment with confidence when news data is incomplete.
Lower your confidence score when news data coverage is partial or missing.

COMPANY NEWS:
{data.company_news}

GLOBAL/MACRO NEWS:
{data.global_news}

INSIDER TRANSACTIONS:
{data.insider_transactions}

DATA QUALITY:
{data_quality_json}
{get_language_instruction()}""",
                _fallback_report("News and Social Sentiment Report", f"News and sentiment data for {ticker} was collected, but the model did not return a complete sentiment view."),
                "News + Social Analyst",
                llm_budget,
                cancel_check,
            ),
        )

    def build_fundamentals_report_parallel() -> AnalystReport:
        return _run_tracked(
            _queued_callback,
            "fundamentals",
            "Fundamentals Analyst is reviewing financial statements and ratios...",
            lambda: _invoke_once(
                quick_llm,
                AnalystReport,
                f"""
You are the Fundamentals Analyst for {ticker} on {trade_date}.
Use only the supplied company fundamentals and financial statements.
Focus on revenue quality, profitability, balance sheet strength, cash flow, valuation signals, and financial risk.
Quote specific metrics when available.

DATA QUALITY INSTRUCTION:
Review the DATA QUALITY block below before writing your report.
If fundamentals show status "partial" or "missing", explicitly name which statements
are unavailable, state that your analysis is limited to what is present, and lower
your confidence score to reflect the gap. Do not extrapolate from absent data.

FUNDAMENTALS:
{data.fundamentals}

BALANCE SHEET:
{data.balance_sheet}

CASH FLOW:
{data.cashflow}

INCOME STATEMENT:
{data.income_statement}

DATA QUALITY:
{data_quality_json}
{get_language_instruction()}""",
                _fallback_report("Fundamentals Analyst Report", f"Fundamental data for {ticker} was collected, but the model did not return a complete fundamental view."),
                "Fundamentals Analyst",
                llm_budget,
                cancel_check,
            ),
        )

    try:
        with ThreadPoolExecutor(max_workers=3, thread_name_prefix="balanced-analyst") as pool:
            market_future = pool.submit(_run_with_config, config, build_market_report_parallel)
            news_future = pool.submit(_run_with_config, config, build_news_social_report_parallel)
            fundamentals_future = pool.submit(_run_with_config, config, build_fundamentals_report_parallel)
            market_report = market_future.result()
            news_social_report = news_future.result()
            fundamentals_report = fundamentals_future.result()
    finally:
        if analyst_forwarder is not None:
            analyst_event_queue.put(None)
            analyst_event_queue.join()
            analyst_forwarder.join(timeout=1)

    market_md = _report_to_markdown(market_report)
    news_social_md = _report_to_markdown(news_social_report)
    fundamentals_md = _report_to_markdown(fundamentals_report)

    if analysis_depth == "fast":
        _emit_progress(progress_callback, "bull_researcher", "completed", "Bull debate skipped in fast mode.")
        _emit_progress(progress_callback, "bear_researcher", "completed", "Bear debate skipped in fast mode.")
        bull = DebateArgument(
            stance="bull",
            thesis=f"Fast mode uses the analyst reports directly for {ticker} instead of a separate bull debate.",
            evidence=["Market report completed.", "News/social report completed.", "Fundamentals report completed."],
            counterargument="Fast mode has less debate depth than balanced/deep mode.",
            risk_flags=["Debate skipped to reduce LLM calls."],
            confidence=max(0.25, min(0.75, (market_report.confidence + news_social_report.confidence + fundamentals_report.confidence) / 3)),
            consensus_signal=False,
        )
        bear = DebateArgument(
            stance="bear",
            thesis=f"Fast mode keeps downside assumptions conservative for {ticker} because no separate bear debate was run.",
            evidence=["Risk is inferred from analyst report risk sections.", "Data quality warnings are preserved."],
            counterargument="Balanced/deep mode should be used before high-conviction trades.",
            risk_flags=list(dict.fromkeys(market_report.risks + news_social_report.risks + fundamentals_report.risks))[:6],
            confidence=0.45,
            consensus_signal=False,
        )
    else:
        bull = _run_tracked(progress_callback, "bull_researcher", "Bull Researcher is building the upside case...", lambda: _invoke_once(
            quick_llm,
            DebateArgument,
            f"""
    You are the Bull Researcher for {ticker} on {trade_date}.
    Build the strongest bullish case from the analyst reports. Do not ignore risks, but argue why upside outweighs downside.
    If DATA QUALITY shows any field as "partial" or "missing", acknowledge this as a risk_flag
    and lower your confidence score accordingly. Do not present bullish claims as certain when data is incomplete.

    DATA QUALITY:
    {data_quality_json}

    MARKET REPORT:
    {market_md}

    NEWS/SOCIAL REPORT:
    {news_social_md}

    FUNDAMENTALS REPORT:
    {fundamentals_md}
    {get_language_instruction()}""",
            DebateArgument(
                stance="bull",
                thesis=f"The bullish case for {ticker} is not strong enough to rate confidently because model output failed.",
                evidence=["Market, news, and fundamental reports were collected.", "A complete bullish argument was not generated."],
                counterargument="The absence of a reliable bullish argument weakens any aggressive buy decision.",
                risk_flags=["Model output fallback used."],
                confidence=0.35,
                consensus_signal=False,
            ),
            "Bull Researcher",
            llm_budget,
            cancel_check,
        ))

        bear = _run_tracked(progress_callback, "bear_researcher", "Bear Researcher is challenging the thesis...", lambda: _invoke_once(
            quick_llm,
            DebateArgument,
            f"""
    You are the Bear Researcher for {ticker} on {trade_date}.
    Build the strongest bearish case from the analyst reports. Be specific about downside, missing data, valuation risk, execution risk, and market risk.
    If DATA QUALITY shows any field as "partial" or "missing", treat this as a direct risk factor
    and include it as a risk_flag. Incomplete data weakens any high-conviction bull case.

    DATA QUALITY:
    {data_quality_json}

    MARKET REPORT:
    {market_md}

    NEWS/SOCIAL REPORT:
    {news_social_md}

    FUNDAMENTALS REPORT:
    {fundamentals_md}

    BULL CASE TO CHALLENGE:
    {render_debate_argument(bull, 'Bull Researcher')}
    {get_language_instruction()}""",
            DebateArgument(
                stance="bear",
                thesis=f"The bearish case for {ticker} is incomplete because model output failed, so risk should be treated cautiously.",
                evidence=["Market, news, and fundamental reports were collected.", "A complete bearish argument was not generated."],
                counterargument="Without a reliable bear case, the final decision should avoid overconfidence.",
                risk_flags=["Model output fallback used."],
                confidence=0.35,
                consensus_signal=False,
            ),
            "Bear Researcher",
            llm_budget,
            cancel_check,
        ))

    debate_md = "\n\n".join([
        render_debate_argument(bull, "Bull Researcher"),
        render_debate_argument(bear, "Bear Researcher"),
    ])

    research_plan = _run_tracked(progress_callback, "research_manager", "Research Manager is weighing bull and bear arguments...", lambda: _invoke_once(
        deep_llm,
        ResearchPlanLite,
        f"""
You are the Research Manager for {ticker} on {trade_date}.
Weigh the analyst reports and the bull/bear debate. Produce one investment plan.
Commit to Buy, Overweight, Hold, Underweight, or Sell based on evidence quality.

MARKET REPORT:
{market_md}

NEWS/SOCIAL REPORT:
{news_social_md}

FUNDAMENTALS REPORT:
{fundamentals_md}

BULL/BEAR DEBATE:
{debate_md}

DATA QUALITY:
{data_quality_json}
""",
        ResearchPlanLite(
            recommendation=PortfolioRating.HOLD,
            confidence=0.35,
            rationale="The evidence is incomplete or the research manager call failed, so the safest recommendation is Hold until the analysis is verified.",
            strategic_actions="Avoid new exposure until data quality, model output, and key risk/reward assumptions are reviewed.",
        ),
        "Research Manager",
        llm_budget,
        cancel_check,
    ))
    investment_plan = _research_plan_to_markdown(research_plan)

    trader_proposal = _run_tracked(progress_callback, "trader", "Trader is turning the plan into trade execution guidance...", lambda: _invoke_once(
        quick_llm,
        TraderProposal,
        f"""
You are the Trader for {ticker} on {trade_date}.
Translate the research manager plan into a trade proposal.
Use the market report for entry/stop context. Provide practical sizing guidance. Return suggested_allocation_percent, entry_price, stop_loss, take_profit, risk_reward_ratio, max_drawdown_estimate, volatility_level, position_sizing_reason, rebalancing_action, key_catalysts, and invalidation_conditions when data supports them.

MARKET REPORT:
{market_md}

RESEARCH PLAN:
{investment_plan}

DATA QUALITY:
{data_quality_json}
""",
        TraderProposal(
            confidence=0.35,
            action=TraderAction.HOLD,
            reasoning="The balanced pipeline could not generate a reliable trader proposal, so no new trade should be opened.",
            entry_price=None,
            stop_loss=None,
            suggested_allocation_percent=0.0,
            position_sizing="0% new allocation until reviewed.",
            position_sizing_reason="Fallback output used; no reliable trade sizing available.",
            rebalancing_action="Hold existing exposure and avoid adding until reviewed.",
            key_catalysts=[],
            invalidation_conditions=["Data quality or model output cannot be verified."],
        ),
        "Trader",
        llm_budget,
        cancel_check,
    ))
    trader_plan = render_trader_proposal(trader_proposal)

    if analysis_depth == "fast":
        _emit_progress(progress_callback, "risk_analysts", "completed", "Risk committee skipped in fast mode; conservative risk fallback applied.")
        risk_report = RiskCommitteeReport(
            overall_risk_level="Medium" if data.data_quality.price_data == "ok" else "High",
            aggressive_view="Fast mode skips a separate aggressive risk debate to save LLM calls.",
            neutral_view="Use the trader proposal with conservative sizing and verify manually before increasing exposure.",
            conservative_view="Prefer Hold or small allocation until balanced/deep analysis confirms the setup.",
            key_risks=list(dict.fromkeys((data.data_quality.warnings or []) + market_report.risks + news_social_report.risks + fundamentals_report.risks))[:8],
            mitigation_plan="Keep sizing small, require a clear stop-loss, and rerun balanced/deep mode before a high-conviction trade.",
            confidence=0.45,
        )
    else:
        risk_report = _run_tracked(progress_callback, "risk_analysts", "Risk Analysts are checking sizing, downside, and invalidation triggers...", lambda: _invoke_once(
            quick_llm,
            RiskCommitteeReport,
            f"""
    You are a combined Risk Committee for {ticker} on {trade_date}.
    Simulate three perspectives in one call: aggressive, neutral, and conservative.
    Evaluate the trader proposal, downside risk, invalidation triggers, position sizing, stop-loss logic, liquidity, volatility, and headline risk.

    ANALYST REPORTS:
    {market_md}

    {news_social_md}

    {fundamentals_md}

    DEBATE:
    {debate_md}

    RESEARCH PLAN:
    {investment_plan}

    TRADER PROPOSAL:
    {trader_plan}

    DATA QUALITY:
    {data_quality_json}
    """,
            RiskCommitteeReport(
                overall_risk_level="High",
                aggressive_view="The opportunity cannot be assessed aggressively because the risk model call failed.",
                neutral_view="Hold is preferred until the analysis is verified.",
                conservative_view="Avoid new exposure until reliable downside controls are available.",
                key_risks=["Risk committee model output fallback used.", "Data and model output should be reviewed before trading."],
                mitigation_plan="Use no new allocation or a very small test position only after manual review.",
                confidence=0.35,
            ),
            "Risk Committee",
            llm_budget,
            cancel_check,
        ))
    risk_md = _risk_to_markdown(risk_report)

    portfolio_decision = _run_tracked(progress_callback, "portfolio_manager", "Portfolio Manager is preparing the final dashboard decision...", lambda: _invoke_once(
        deep_llm,
        PortfolioDecision,
        f"""
You are the Portfolio Manager for {ticker} on {trade_date}.
Make the final decision using every prior report. The final answer must be usable by a frontend investment dashboard.
Keep language simple and practical. Include an action plan, risk controls, price target when data supports it, and time horizon. Return all actionable dashboard fields: suggested_allocation_percent, entry_price, stop_loss, take_profit, risk_reward_ratio, max_drawdown_estimate, volatility_level, position_sizing_reason, rebalancing_action, key_catalysts, and invalidation_conditions. Reduce confidence and allocation when data_quality has partial or missing inputs.
Use LAST CLOSE PRICE as the current market price anchor for entry_price, stop_loss, take_profit, and price_target. If LAST CLOSE PRICE is unavailable or data quality is not usable, leave unsupported price fields null instead of inventing numbers.

LAST CLOSE PRICE:
{last_close_text}

MARKET REPORT:
{market_md}

NEWS/SOCIAL REPORT:
{news_social_md}

FUNDAMENTALS REPORT:
{fundamentals_md}

BULL/BEAR DEBATE:
{debate_md}

RESEARCH PLAN:
{investment_plan}

TRADER PROPOSAL:
{trader_plan}

RISK COMMITTEE REPORT:
{risk_md}

DATA QUALITY:
{data_quality_json}
""",
        PortfolioDecision(
            confidence_score=0.35,
            rating=PortfolioRating.HOLD,
            executive_summary=(
                f"The final rating for {ticker} is Hold because the balanced pipeline could not generate a fully reliable final model decision. "
                "The available market, news, and fundamental data were collected, but the final structured output needs manual review. "
                "The biggest risk is acting on incomplete or fallback analysis, and that risk overrides any aggressive trade idea. "
                "The recommended action is to avoid new exposure, keep position size at zero for new trades, and wait for a verified analysis before setting a stop-loss. "
                "The time horizon is review-only until a clean model run confirms or invalidates the thesis."
            ),
            investment_thesis=(
                f"{ticker} should stay on hold until the analysis can be verified. "
                "The system collected price, technical, news, and fundamental data, but the final model output used a fallback. "
                "That means the dashboard can still display a safe result, but it should not be treated as a high-confidence investment call. "
                "The bull case and bear case require confirmation from a clean model response. "
                "The safest action is to avoid adding exposure. "
                "A new decision should be generated once the model and data calls complete normally."
            ),
            suggested_allocation_percent=0.0,
            entry_price=None,
            stop_loss=None,
            take_profit=None,
            risk_reward_ratio=None,
            max_drawdown_estimate="Not estimated because final output used fallback.",
            volatility_level=VolatilityLevel.HIGH,
            position_sizing_reason="Fallback output and/or incomplete data quality require zero new allocation.",
            rebalancing_action="Hold or move to watchlist until verified.",
            key_catalysts=[],
            invalidation_conditions=["Clean data and clean model output are not available."],
            price_target=None,
            time_horizon="Review required",
        ),
        "Portfolio Manager",
        llm_budget,
        cancel_check,
    ))

    budget_snapshot = llm_budget.snapshot()

    return {
        "company_of_interest": ticker,
        "trade_date": trade_date,
        "market_report": market_md,
        "sentiment_report": news_social_md,
        "news_report": news_social_md,
        "fundamentals_report": fundamentals_md,
        "investment_debate_state": {
            "bull_history": render_debate_argument(bull, "Bull Researcher"),
            "bear_history": render_debate_argument(bear, "Bear Researcher"),
            "history": debate_md,
            "judge_decision": investment_plan,
            "count": 2,
        },
        "investment_plan": investment_plan,
        "trader_investment_plan": trader_plan,
        "risk_debate_state": {
            "aggressive_history": risk_report.aggressive_view,
            "neutral_history": risk_report.neutral_view,
            "conservative_history": risk_report.conservative_view,
            "history": risk_md,
            "judge_decision": risk_md,
            "count": 3,
        },
        "portfolio_decision": portfolio_decision,
        "data_quality": data.data_quality.model_dump(),
        "data_fetched_at": data_fetched_at,
        "last_close_price": data.last_close_price,
        "analysis_depth": analysis_depth,
        "balanced_gemini_request_budget": llm_budget.limit,
        "balanced_gemini_calls_used": budget_snapshot["used"],
        "budget_exhausted": budget_snapshot["budget_exhausted"],
        "agents_skipped": budget_snapshot["agents_skipped"],
    }
