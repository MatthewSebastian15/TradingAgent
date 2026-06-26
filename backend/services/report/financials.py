"""Financial-highlights, valuation, trend and market-table row builders.

Extracted from report_service.py. Depends only on formatters + normalization
helpers.
"""

from __future__ import annotations

from typing import Any

from tradingagents.utils.normalization import as_dict as _as_dict
from tradingagents.utils.normalization import clean_text as _clean_text

from services.report.formatters import (
    _append_financial_unit,
    _display,
    _financial_cell_display,
    _format_percent,
    _format_price,
    _row,
)


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
            "value": _format_percent(
                summary.get("period_return_percent") or stats.get("change_percent")
            ),
        },
        {
            "label": "Period High",
            "value": _format_price(summary.get("period_high") or stats.get("high"), ticker, market),
        },
        {
            "label": "Period Low",
            "value": _format_price(summary.get("period_low") or stats.get("low"), ticker, market),
        },
        {"label": "Max Drawdown", "value": _format_percent(summary.get("max_drawdown_percent"))},
        {
            "label": "Average Close",
            "value": _format_price(stats.get("average_close"), ticker, market),
        },
        {
            "label": "Average Volume",
            "value": _display(summary.get("average_volume") or stats.get("average_volume")),
        },
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
        {
            "label": "Resistance",
            "value": _format_price(technical.get("resistance"), ticker, market),
        },
        _row("Volume Trend", technical.get("volume_trend")),
    ]


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


def _normalize_financial_highlight_row(row: dict[str, Any]) -> dict[str, Any]:
    unit = _clean_text(row.get("unit")) or ""
    values = row.get("values") if isinstance(row.get("values"), dict) else {}
    return {
        **row,
        "label": _clean_text(row.get("label")) or _clean_text(row.get("key")) or "Metric",
        "unit": unit or "-",
        "values": values,
        "display_values": {
            str(key): _financial_cell_display(cell, unit) for key, cell in values.items()
        },
    }


def _normalize_financial_highlight_snapshot(item: dict[str, Any]) -> dict[str, Any]:
    unit = _clean_text(item.get("unit")) or ""
    return {**item, "unit": unit or "-", "display": _financial_cell_display(item, unit)}


def _financial_highlights(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    periods = [
        period
        for period in value.get("periods", [])
        if isinstance(period, dict) and period.get("key")
    ]
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
    return (
        f"{displayed} EST"
        if detail.get("status") == "estimated" and displayed != "-"
        else displayed
    )


def _financial_trend_rows(value: Any) -> list[dict[str, Any]]:
    payload = _as_dict(value)
    details = _as_dict(payload.get("metric_details"))
    periods = [
        period
        for period in payload.get("periods", [])
        if isinstance(period, dict) and period.get("key")
    ]
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
                    "fair_value": _display(
                        item.get("fair_value_display") or item.get("fair_value")
                    ),
                    "upside": _display(
                        item.get("upside_downside_display") or item.get("upside_downside_percent")
                    ),
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
