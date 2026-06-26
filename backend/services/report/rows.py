"""Decision/risk/validation table-row builders for report assembly.

Extracted from report_service.py. Depends only on formatters + normalization
helpers.
"""

from __future__ import annotations

from typing import Any

from tradingagents.utils.normalization import as_dict as _as_dict
from tradingagents.utils.normalization import as_list as _as_list

from services.report.formatters import (
    _as_text_list,
    _display,
    _format_price,
    _risk_reward_display,
    _row,
)


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
        {
            "label": "Current Price",
            "value": _format_price(result.get("current_price"), ticker, market),
        },
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
    return [
        _row(label, _value_with_percent(payload.get(key), key in percent_fields))
        for key, label in definitions
    ]


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
