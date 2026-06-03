from __future__ import annotations

from typing import Any

from tradingagents.data_quality import build_source_confidence

from .market_risk_builder import build_market_risk
from .risk_adjusted_return import build_risk_adjusted_return
from .thesis_monitor import build_thesis_monitor


def _as_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _metric_display(payload: dict[str, Any], key: str) -> str:
    detail = _as_dict(_as_dict(payload.get("metric_details")).get(key))
    display = detail.get("display")
    if display:
        return f"{display} EST" if detail.get("status") == "estimated" and display != "N/A" else str(display)
    value = payload.get(key)
    return "N/A" if value is None or value == "" else str(value)


def build_balance_sheet_risk_summary(balance_sheet_risk: dict[str, Any] | None) -> dict[str, Any]:
    payload = _as_dict(balance_sheet_risk)
    if not payload:
        return {
            "der": "N/A",
            "net_debt": "N/A",
            "debt_to_ebitda": "N/A",
            "cash_ratio": "N/A",
            "risk_level": "N/A",
            "interpretation": "Balance sheet risk data is unavailable.",
        }
    risk_level = str(payload.get("risk_level") or "N/A")
    if risk_level == "high":
        interpretation = "Leverage risk is elevated and needs close monitoring."
    elif risk_level == "moderate":
        interpretation = "Leverage appears manageable, but debt trend should still be monitored."
    elif risk_level == "low":
        interpretation = "Balance sheet risk appears low based on available leverage metrics."
    else:
        interpretation = "Balance sheet risk cannot be classified with the available data."
    return {
        "der": _metric_display(payload, "der"),
        "net_debt": _metric_display(payload, "net_debt"),
        "debt_to_ebitda": _metric_display(payload, "debt_to_ebitda"),
        "cash_ratio": _metric_display(payload, "cash_ratio"),
        "risk_level": risk_level,
        "interpretation": interpretation,
    }


def build_catalyst_risk(result: dict[str, Any]) -> list[dict[str, Any]]:
    tracker = _as_dict(result.get("catalyst_tracker"))
    news_impact = _as_dict(result.get("news_impact"))
    items: list[dict[str, Any]] = []
    for item in _as_list(tracker.get("negative_catalysts")):
        if not isinstance(item, dict):
            continue
        items.append(
            {
                "type": item.get("type") or "sentiment",
                "label": item.get("label") or "Negative catalyst",
                "impact": item.get("impact") or "medium",
                "date": item.get("date"),
                "source": item.get("source") or "N/A",
                "reason": item.get("related_news_title") or "Negative catalyst detected in news flow.",
            }
        )
    for item in _as_list(tracker.get("upcoming_events")):
        if not isinstance(item, dict):
            continue
        items.append(
            {
                "type": item.get("type") or "event",
                "label": item.get("label") or "Upcoming event risk",
                "impact": item.get("impact") or item.get("risk_level") or "medium",
                "date": item.get("date"),
                "source": item.get("source") or "N/A",
                "reason": "Upcoming event may increase short-term volatility.",
            }
        )
    existing_titles = {str(item.get("reason") or "") for item in items}
    for item in _as_list(news_impact.get("high_impact_news")):
        if not isinstance(item, dict) or str(item.get("sentiment") or "").lower() != "negative":
            continue
        title = str(item.get("title") or "")
        if title in existing_titles:
            continue
        items.append(
            {
                "type": item.get("materiality_category") or "sentiment",
                "label": "High-impact negative news",
                "impact": item.get("impact") or "high",
                "date": item.get("published_at"),
                "source": item.get("source") or "N/A",
                "reason": title or "High-impact negative article detected.",
            }
        )
    return items[:12]


def _add_risk(flags: list[str], risks: list[str], risk: str, flag: str) -> None:
    if risk not in risks:
        risks.append(risk)
    if flag not in flags:
        flags.append(flag)


def build_risk_summary(
    result: dict[str, Any],
    *,
    market_risk: dict[str, Any],
    source_confidence: dict[str, Any],
    catalyst_risk: list[dict[str, Any]],
) -> dict[str, Any]:
    score = 0
    main_risks: list[str] = []
    flags: list[str] = []
    balance_sheet = _as_dict(result.get("balance_sheet_risk"))
    balance_level = str(balance_sheet.get("risk_level") or "").lower()
    if balance_level == "high":
        score += 20
        _add_risk(flags, main_risks, "High leverage", "Monitor debt level")
    elif balance_level == "moderate":
        score += 10
        _add_risk(flags, main_risks, "Moderate leverage", "Watch leverage trend")

    qoe = _as_dict(result.get("quality_of_earnings"))
    if str(qoe.get("rating") or "").lower() == "weak":
        score += 15
        _add_risk(flags, main_risks, "Weak free cash flow", "Track cash conversion")
    elif str(qoe.get("rating") or "").lower() == "watch":
        score += 8
        _add_risk(flags, main_risks, "Cash flow quality watch item", "Track CFO versus net income")

    market_bucket = str(market_risk.get("risk_bucket") or "").lower()
    if market_bucket == "high":
        score += 20
        _add_risk(flags, main_risks, "High volatility", "Avoid aggressive sizing during volatility spikes")
    elif market_bucket == "medium":
        score += 10
        _add_risk(flags, main_risks, "Moderate volatility", "Use disciplined entry levels")

    technical = _as_dict(result.get("technical_entry"))
    entry_quality = str(technical.get("entry_quality") or "").lower()
    if entry_quality == "risky":
        score += 15
        _add_risk(flags, main_risks, "Risky technical entry", "Avoid aggressive entry near resistance")
    elif entry_quality == "neutral":
        score += 6
        _add_risk(flags, main_risks, "Mixed technical entry", "Wait for clearer entry confirmation")

    fair_value = _as_dict(result.get("fair_value_range"))
    current_price = _number(result.get("current_price") or result.get("last_close_price"))
    base_value = _number(fair_value.get("base"))
    if current_price and base_value and current_price > base_value * 1.1:
        score += 15
        _add_risk(flags, main_risks, "Valuation premium", "Watch valuation versus base fair value")

    if catalyst_risk:
        highest = any(str(item.get("impact") or "").lower() == "high" for item in catalyst_risk)
        score += 15 if highest else 8
        _add_risk(flags, main_risks, "Negative catalyst risk", "Monitor material news and upcoming events")

    data_quality = _as_dict(source_confidence.get("data_quality"))
    data_score = _number(data_quality.get("score"))
    if data_score is None or data_score < 60:
        score += 15
        _add_risk(flags, main_risks, "Data confidence risk", "Check missing fields and vendor status")
    elif data_score < 80:
        score += 8
        _add_risk(flags, main_risks, "Partial data quality", "Review fallback and stale data notes")

    score = int(max(0, min(100, score)))
    overall = "low" if score <= 30 else "moderate" if score <= 65 else "high"
    explanation = (
        "The stock has low aggregate risk based on available balance sheet, market, news, and data quality signals."
        if overall == "low"
        else "The stock has manageable risk, but selected market, financial, news, or data quality items should be monitored."
        if overall == "moderate"
        else "The stock has elevated aggregate risk across one or more financial, market, news, or data quality signals."
    )
    return {
        "overall_risk": overall,
        "risk_score": score,
        "main_risks": main_risks[:6] or ["No major risk flag detected from available data."],
        "risk_flags": flags[:8] or ["Continue monitoring price, fundamentals, news, and data quality."],
        "risk_explanation": explanation,
    }


def build_risk_data_quality(result: dict[str, Any], metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    merged = {**_as_dict(metadata), **_as_dict(result)}
    market_risk = build_market_risk(
        _as_dict(merged.get("price_chart")),
        _as_dict(merged.get("price_performance")),
        _as_dict(merged.get("technical_entry")),
    )
    risk_adjusted_return = build_risk_adjusted_return(merged)
    source_confidence = build_source_confidence(merged)
    catalyst_risk = build_catalyst_risk(merged)
    thesis_monitor = build_thesis_monitor(
        merged,
        _number(_as_dict(source_confidence.get("data_quality")).get("score")),
    )
    risk_summary = build_risk_summary(
        merged,
        market_risk=market_risk,
        source_confidence=source_confidence,
        catalyst_risk=catalyst_risk,
    )
    return {
        "risk_summary": risk_summary,
        "balance_sheet_risk_summary": build_balance_sheet_risk_summary(_as_dict(merged.get("balance_sheet_risk"))),
        "market_risk": market_risk,
        "risk_adjusted_return": risk_adjusted_return,
        "thesis_monitor": thesis_monitor,
        "catalyst_risk": catalyst_risk,
        **source_confidence,
    }
