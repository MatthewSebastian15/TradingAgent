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

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Callable, Optional, TypeVar

from pydantic import BaseModel, Field

from tradingagents.agents.schemas import (
    DebateArgument,
    PortfolioDecision,
    PortfolioRating,
    TraderAction,
    TraderProposal,
    render_debate_argument,
    render_pm_decision,
    render_trader_proposal,
)
from tradingagents.agents.utils.structured import bind_structured
from tradingagents.dataflows.config import set_config
from tradingagents.dataflows.interface import route_to_vendor
from tradingagents.llm_clients import create_llm_client

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


def _truncate(value: Any, limit: int = 12_000) -> str:
    text = str(value or "")
    if len(text) <= limit:
        return text
    return text[:limit] + "\n\n[TRUNCATED FOR TOKEN CONTROL]"


def _safe_data_call(label: str, func: Callable[[], Any], limit: int = 12_000) -> str:
    try:
        return _truncate(func(), limit)
    except Exception as exc:
        logger.warning("Balanced pipeline data call failed for %s: %s", label, exc)
        return f"{label} unavailable: {exc}"


def _date_window(trade_date: str) -> tuple[str, str, str]:
    current = datetime.strptime(trade_date, "%Y-%m-%d")
    start_90 = (current - timedelta(days=90)).strftime("%Y-%m-%d")
    start_30 = (current - timedelta(days=30)).strftime("%Y-%m-%d")
    end = (current + timedelta(days=1)).strftime("%Y-%m-%d")
    return start_90, start_30, end


def collect_market_data(ticker: str, trade_date: str, config: dict[str, Any]) -> CollectedData:
    """Collect all external data before any LLM call.

    These are yfinance/tool requests, not Gemini requests. Keeping them outside
    the LLM is the main reason the balanced mode can stay near 9 Gemini calls.
    """
    set_config(config)
    start_90, start_30, end = _date_window(trade_date)

    indicator_names = ["close_50_sma", "close_200_sma", "macd", "rsi", "atr"]
    indicator_parts = []
    for indicator in indicator_names:
        indicator_parts.append(
            _safe_data_call(
                f"indicator:{indicator}",
                lambda indicator=indicator: route_to_vendor("get_indicators", ticker, indicator, trade_date, 30),
                limit=4_000,
            )
        )

    return CollectedData(
        ticker=ticker,
        trade_date=trade_date,
        price_data=_safe_data_call(
            "price_data",
            lambda: route_to_vendor("get_stock_data", ticker, start_90, end),
            limit=14_000,
        ),
        technical_indicators="\n\n".join(indicator_parts),
        fundamentals=_safe_data_call(
            "fundamentals",
            lambda: route_to_vendor("get_fundamentals", ticker, trade_date),
            limit=12_000,
        ),
        balance_sheet=_safe_data_call(
            "balance_sheet",
            lambda: route_to_vendor("get_balance_sheet", ticker, "quarterly", trade_date),
            limit=10_000,
        ),
        cashflow=_safe_data_call(
            "cashflow",
            lambda: route_to_vendor("get_cashflow", ticker, "quarterly", trade_date),
            limit=10_000,
        ),
        income_statement=_safe_data_call(
            "income_statement",
            lambda: route_to_vendor("get_income_statement", ticker, "quarterly", trade_date),
            limit=10_000,
        ),
        company_news=_safe_data_call(
            "company_news",
            lambda: route_to_vendor("get_news", ticker, start_30, end),
            limit=12_000,
        ),
        global_news=_safe_data_call(
            "global_news",
            lambda: route_to_vendor("get_global_news", trade_date, 7, 10),
            limit=8_000,
        ),
        insider_transactions=_safe_data_call(
            "insider_transactions",
            lambda: route_to_vendor("get_insider_transactions", ticker),
            limit=6_000,
        ),
    )


def _provider_kwargs(config: dict[str, Any]) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    if config.get("timeout"):
        kwargs["timeout"] = config.get("timeout")
    if config.get("llm_max_retries") is not None:
        kwargs["max_retries"] = config.get("llm_max_retries")

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


def _invoke_once(llm: Any, schema: type[T], prompt: str, fallback: T, agent_name: str) -> T:
    """Call the LLM once for a structured result.

    No second LLM fallback is used. This keeps the balanced pipeline's request
    budget predictable. If the provider cannot produce structured output, one
    plain JSON-style invoke is attempted and parsed locally.
    """
    structured = bind_structured(llm, schema, agent_name)
    try:
        if structured is not None:
            result = structured.invoke(prompt)
        else:
            result = llm.invoke(prompt + "\n\nReturn only valid JSON matching this schema: " + json.dumps(schema.model_json_schema()))
        parsed = _coerce_structured(result, schema)
        if parsed is not None:
            return parsed
        logger.warning("%s returned unparseable structured output. Using local fallback.", agent_name)
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


def _run_tracked(callback: Optional[ProgressCallback], agent_id: str, message: str, func: Callable[[], T]) -> T:
    _emit_progress(callback, agent_id, "started", message)
    try:
        result = func()
    except Exception:
        _emit_progress(callback, agent_id, "failed", f"{_AGENT_LABELS.get(agent_id, agent_id)} failed.")
        raise
    _emit_progress(callback, agent_id, "completed", f"{_AGENT_LABELS.get(agent_id, agent_id)} completed.")
    return result


def run_balanced_pipeline(
    ticker: str,
    trade_date: str,
    config: dict[str, Any],
    progress_callback: Optional[ProgressCallback] = None,
) -> dict[str, Any]:
    """Run the balanced 9-call pipeline and return classic-compatible state.

    The first three analyst calls run in parallel after deterministic data
    collection. The optional progress callback emits real agent start/completed
    events for the SSE endpoint instead of pretending a stopwatch is an agent.
    """
    set_config(config)
    quick_llm, deep_llm = _create_llms(config)
    data = _run_tracked(
        progress_callback,
        "data_collection",
        "Collecting yfinance prices, indicators, fundamentals, news, and insider data...",
        lambda: collect_market_data(ticker, trade_date, config),
    )

    def build_market_report() -> AnalystReport:
        return _run_tracked(
            progress_callback,
            "market_analyst",
            "Market Analyst is reading price action and technical indicators...",
            lambda: _invoke_once(
                quick_llm,
                AnalystReport,
                f"""
You are the Market Analyst for {ticker} on {trade_date}.
Use only the supplied price and technical data. Produce a practical technical/market report.
Focus on trend, momentum, volatility, volume, support/resistance, and what the setup implies.

PRICE DATA:
{data.price_data}

TECHNICAL INDICATORS:
{data.technical_indicators}
""",
                _fallback_report("Market Analyst Report", f"Market data for {ticker} was collected, but the model did not return a complete market view."),
                "Market Analyst",
            ),
        )

    def build_news_social_report() -> AnalystReport:
        return _run_tracked(
            progress_callback,
            "news_analyst",
            "News + Social Analyst is scanning company news, macro news, and insider activity...",
            lambda: _invoke_once(
                quick_llm,
                AnalystReport,
                f"""
You are the combined News and Social Sentiment Analyst for {ticker} on {trade_date}.
Use the company news, macro news, and insider activity. Produce a sentiment and catalyst report.
Separate company-specific catalysts from broad market/macroeconomic pressure.

COMPANY NEWS:
{data.company_news}

GLOBAL/MACRO NEWS:
{data.global_news}

INSIDER TRANSACTIONS:
{data.insider_transactions}
""",
                _fallback_report("News and Social Sentiment Report", f"News and sentiment data for {ticker} was collected, but the model did not return a complete sentiment view."),
                "News + Social Analyst",
            ),
        )

    def build_fundamentals_report() -> AnalystReport:
        return _run_tracked(
            progress_callback,
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

FUNDAMENTALS:
{data.fundamentals}

BALANCE SHEET:
{data.balance_sheet}

CASH FLOW:
{data.cashflow}

INCOME STATEMENT:
{data.income_statement}
""",
                _fallback_report("Fundamentals Analyst Report", f"Fundamental data for {ticker} was collected, but the model did not return a complete fundamental view."),
                "Fundamentals Analyst",
            ),
        )

    with ThreadPoolExecutor(max_workers=3, thread_name_prefix="balanced-analyst") as pool:
        market_future = pool.submit(build_market_report)
        news_future = pool.submit(build_news_social_report)
        fundamentals_future = pool.submit(build_fundamentals_report)
        market_report = market_future.result()
        news_social_report = news_future.result()
        fundamentals_report = fundamentals_future.result()

    market_md = _report_to_markdown(market_report)
    news_social_md = _report_to_markdown(news_social_report)
    fundamentals_md = _report_to_markdown(fundamentals_report)

    bull = _run_tracked(progress_callback, "bull_researcher", "Bull Researcher is building the upside case...", lambda: _invoke_once(
        quick_llm,
        DebateArgument,
        f"""
You are the Bull Researcher for {ticker} on {trade_date}.
Build the strongest bullish case from the analyst reports. Do not ignore risks, but argue why upside outweighs downside.

MARKET REPORT:
{market_md}

NEWS/SOCIAL REPORT:
{news_social_md}

FUNDAMENTALS REPORT:
{fundamentals_md}
""",
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
    ))

    bear = _run_tracked(progress_callback, "bear_researcher", "Bear Researcher is challenging the thesis...", lambda: _invoke_once(
        quick_llm,
        DebateArgument,
        f"""
You are the Bear Researcher for {ticker} on {trade_date}.
Build the strongest bearish case from the analyst reports. Be specific about downside, missing data, valuation risk, execution risk, and market risk.

MARKET REPORT:
{market_md}

NEWS/SOCIAL REPORT:
{news_social_md}

FUNDAMENTALS REPORT:
{fundamentals_md}

BULL CASE TO CHALLENGE:
{render_debate_argument(bull, 'Bull Researcher')}
""",
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
""",
        ResearchPlanLite(
            recommendation=PortfolioRating.HOLD,
            confidence=0.35,
            rationale="The evidence is incomplete or the research manager call failed, so the safest recommendation is Hold until the analysis is verified.",
            strategic_actions="Avoid new exposure until data quality, model output, and key risk/reward assumptions are reviewed.",
        ),
        "Research Manager",
    ))
    investment_plan = _research_plan_to_markdown(research_plan)

    trader_proposal = _run_tracked(progress_callback, "trader", "Trader is turning the plan into trade execution guidance...", lambda: _invoke_once(
        quick_llm,
        TraderProposal,
        f"""
You are the Trader for {ticker} on {trade_date}.
Translate the research manager plan into a trade proposal.
Use the market report for entry/stop context. Provide practical sizing guidance.

MARKET REPORT:
{market_md}

RESEARCH PLAN:
{investment_plan}
""",
        TraderProposal(
            confidence=0.35,
            action=TraderAction.HOLD,
            reasoning="The balanced pipeline could not generate a reliable trader proposal, so no new trade should be opened.",
            entry_price=None,
            stop_loss=None,
            position_sizing="0% new allocation until reviewed.",
        ),
        "Trader",
    ))
    trader_plan = render_trader_proposal(trader_proposal)

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
    ))
    risk_md = _risk_to_markdown(risk_report)

    portfolio_decision = _run_tracked(progress_callback, "portfolio_manager", "Portfolio Manager is preparing the final dashboard decision...", lambda: _invoke_once(
        deep_llm,
        PortfolioDecision,
        f"""
You are the Portfolio Manager for {ticker} on {trade_date}.
Make the final decision using every prior report. The final answer must be usable by a frontend investment dashboard.
Keep language simple and practical. Include an action plan, risk controls, price target when data supports it, and time horizon.

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
            price_target=None,
            time_horizon="Review required",
        ),
        "Portfolio Manager",
    ))

    final_decision = render_pm_decision(portfolio_decision)

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
        "final_trade_decision": final_decision,
        "portfolio_decision": portfolio_decision,
        "balanced_gemini_request_budget": 9,
    }
