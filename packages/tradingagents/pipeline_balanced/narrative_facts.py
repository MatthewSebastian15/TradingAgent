from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from tradingagents.agents.schemas import PortfolioDecision
from tradingagents.dataflows.fundamentals.normalizers import unwrap_normalized_value
from tradingagents.prompt_context import build_market_context


@dataclass
class NarrativeText:
    executive_summary: str
    investment_thesis: str
    key_reasons_paragraph: str


def _enum(value: Any) -> Any:
    return getattr(value, "value", value)


def _latest_derived(derived: list[dict[str, Any]] | None) -> dict[str, float]:
    latest = ((derived or [{}])[-1] or {}).get("derived_metrics") or {}
    return {
        name: metric["value"]
        for name, metric in latest.items()
        if isinstance(metric, dict) and isinstance(metric.get("value"), (int, float))
    }


def build_verified_facts(
    decision: PortfolioDecision, data: Any, time_horizon_text: str
) -> dict[str, Any]:
    technical = data.technical_entry or {}
    fundamentals = data.fundamental_analysis or {}
    consensus = data.analyst_consensus or {}
    events = (data.catalyst_tracker or {}).get("upcoming_events") or []
    market = build_market_context(data)
    returns = market.get("returns_percent") or {}
    latest_row = (data.normalized_period_rows or [{}])[-1] or {}
    facts: dict[str, Any] = {
        "decision": decision.final_decision or decision.decision or _enum(decision.rating),
        "time_horizon": time_horizon_text,
        "confidence_percent": round(float(decision.confidence_score) * 100),
        "current_price": decision.current_price
        if decision.current_price is not None
        else data.last_close_price,
        "price_timestamp": data.last_close_price_as_of,
        "entry_price": decision.entry_price,
        "stop_loss": decision.stop_loss,
        "take_profit": decision.take_profit,
        "price_target": decision.price_target,
        "risk_reward": decision.risk_reward_display,
        "suggested_allocation_percent": decision.suggested_allocation_percent,
        "max_drawdown_min_pct": decision.max_drawdown_min_pct,
        "max_drawdown_max_pct": decision.max_drawdown_max_pct,
        "entry_zone_low": decision.entry_zone_low,
        "entry_zone_high": decision.entry_zone_high,
        "volatility_level": _enum(decision.volatility_level),
        "volatility_score": decision.volatility_score,
        "trend": technical.get("trend"),
        "rsi": technical.get("rsi"),
        "sma_20": technical.get("sma_20"),
        "sma_50": technical.get("sma_50"),
        "sma_200": technical.get("sma_200"),
        "support": technical.get("support"),
        "resistance": technical.get("resistance"),
        "atr": technical.get("atr"),
        "entry_quality_score": technical.get("entry_quality_score"),
        "return_5d_percent": returns.get("5d"),
        "return_20d_percent": returns.get("20d"),
        "return_60d_percent": returns.get("60d"),
        "window_high": market.get("window_high"),
        "window_low": market.get("window_low"),
        "fundamental_score": fundamentals.get("fundamental_score"),
        "fundamental_signal": fundamentals.get("fundamental_signal"),
        "latest_revenue": unwrap_normalized_value(latest_row.get("revenue")),
        "latest_net_profit": unwrap_normalized_value(latest_row.get("net_profit")),
        "financial_currency": latest_row.get("currency"),
        "analyst_buy": (consensus.get("strong_buy", 0) + consensus.get("buy", 0))
        if consensus.get("available")
        else None,
        "analyst_hold": consensus.get("hold") if consensus.get("available") else None,
        "analyst_sell": (consensus.get("sell", 0) + consensus.get("strong_sell", 0))
        if consensus.get("available")
        else None,
        "next_earnings_date": next(
            (event.get("date") for event in events if event.get("type") == "earnings"), None
        ),
    }
    facts.update(_latest_derived(data.derived_fundamentals))
    return {key: value for key, value in facts.items() if value is not None}


def _g(value: Any) -> str:
    return f"{value:g}" if isinstance(value, (int, float)) else str(value)


def build_template_narrative(decision: PortfolioDecision, facts: dict[str, Any]) -> NarrativeText:
    action = facts.get("decision", "Hold")
    sentences = [
        f"The final signal is {action} for the {facts.get('time_horizon', 'selected')} horizon "
        f"with {_g(facts['confidence_percent'])}% confidence."
    ]
    if "current_price" in facts:
        sentences.append(
            f"The latest price used for this analysis is {_g(facts['current_price'])}."
        )
    if "trend" in facts and "rsi" in facts:
        sentences.append(f"The technical trend is {facts['trend']} with RSI at {_g(facts['rsi'])}.")
    if "fundamental_score" in facts:
        sentences.append(
            f"The deterministic fundamental score is {_g(facts['fundamental_score'])} "
            f"({facts.get('fundamental_signal', 'unrated')})."
        )
    if "max_drawdown_min_pct" in facts and "max_drawdown_max_pct" in facts:
        sentences.append(
            f"Planned risk is {_g(facts['max_drawdown_min_pct'])}% to the stop, with a historical "
            f"drawdown reference of {_g(facts['max_drawdown_max_pct'])}%."
        )
    if decision.trade_plan_valid and {"entry_price", "stop_loss", "take_profit"} <= facts.keys():
        sentences.append(
            f"The validated plan is entry {_g(facts['entry_price'])}, "
            f"stop {_g(facts['stop_loss'])}, "
            f"and take profit {_g(facts['take_profit'])} at {facts.get('risk_reward', '1:3')}."
        )
    elif {"entry_zone_low", "entry_zone_high"} <= facts.keys():
        sentences.append(
            f"No entry now; wait for price between {_g(facts['entry_zone_low'])} and "
            f"{_g(facts['entry_zone_high'])}."
        )
    else:
        sentences.append("No new position is suggested until the setup and data quality improve.")
    summary = " ".join(sentences)
    reasons = " ".join(decision.key_reasons) or summary
    invalidation = " ".join(decision.invalidation_conditions)
    thesis = " ".join(part for part in (summary, reasons, invalidation) if part)
    return NarrativeText(
        executive_summary=summary, investment_thesis=thesis, key_reasons_paragraph=reasons
    )
