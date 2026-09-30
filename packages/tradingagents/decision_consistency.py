from __future__ import annotations

from typing import Any

from tradingagents.agents.schemas import PortfolioDecision

EARNINGS_BLOCK_DAYS = 2


def earnings_block_reason(
    decision_action: str, *, earnings_within_days: float | None, has_existing_position: bool
) -> str | None:
    if (
        decision_action in {"BUY", "SELL"}
        and not has_existing_position
        and earnings_within_days is not None
        and earnings_within_days <= EARNINGS_BLOCK_DAYS
    ):
        return f"Earnings in {int(earnings_within_days)} day(s); no new position before the report"
    return None


def contradiction_reason(
    decision_action: str,
    *,
    technical_entry: dict[str, Any] | None,
    fundamental_signal: str | None,
    analyst_consensus: dict[str, Any] | None,
) -> str | None:
    trend = str((technical_entry or {}).get("trend") or "").lower()
    signal = str(fundamental_signal or "").lower()
    consensus = str((analyst_consensus or {}).get("consensus_label") or "").lower()
    signals = (trend, signal, consensus)
    if decision_action == "BUY" and signals == ("downtrend", "bearish", "negative"):
        return "Buy contradicts downtrend, bearish fundamentals, and negative analyst consensus"
    if decision_action == "SELL" and signals == ("uptrend", "bullish", "positive"):
        return "Sell contradicts uptrend, bullish fundamentals, and positive analyst consensus"
    return None


def trade_plan_violations(decision: PortfolioDecision) -> list[str]:
    action = str(decision.final_decision or decision.decision or "").lower()
    if decision.trade_plan_valid:
        entry, stop, target = decision.entry_price, decision.stop_loss, decision.take_profit
        if entry is None or stop is None or target is None:
            return ["CONSISTENCY_LEVELS_MISSING"]
        if action == "buy" and not stop < entry < target:
            return ["CONSISTENCY_LONG_LEVEL_ORDER"]
        if action == "sell" and not target < entry < stop:
            return ["CONSISTENCY_SHORT_LEVEL_ORDER"]
        return []
    if (decision.suggested_allocation_percent or 0) > 0 and not decision.has_existing_position:
        return ["CONSISTENCY_ALLOCATION_WITHOUT_PLAN"]
    return []
