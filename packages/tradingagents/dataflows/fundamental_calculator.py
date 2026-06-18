"""Derived fundamental metric calculator."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from dataclasses import field as dataclass_field
from typing import Any

from .financial_rows import (
    FINANCIAL_ROW_FIELDS,
    GENERAL_METRICS,
    FinancialRow,
    metrics_profile_for_sector,
)


@dataclass
class FundamentalMetrics:
    symbol: str
    period: str
    period_type: str
    market: str
    asset_type: str | None = None

    roe: float | None = None
    roa: float | None = None
    npm: float | None = None
    gross_margin: float | None = None
    der: float | None = None
    interest_coverage: float | None = None
    current_ratio: float | None = None
    free_cash_flow: float | None = None
    revenue_growth_yoy: float | None = None
    net_profit_growth_yoy: float | None = None

    estimated_fields: list[str] = dataclass_field(default_factory=list)
    unavailable_fields: list[str] = dataclass_field(default_factory=list)
    warnings: list[str] = dataclass_field(default_factory=list)
    source_confidence: str = "medium"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


OPERATING_FINANCIAL_METRICS = [
    "roe",
    "roa",
    "npm",
    "gross_margin",
    "der",
    "interest_coverage",
    "current_ratio",
    "free_cash_flow",
    "revenue_growth_yoy",
    "net_profit_growth_yoy",
]


def safe_divide(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None or denominator == 0:
        return None
    return numerator / denominator


def safe_div(numerator: float | int | None, denominator: float | int | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    try:
        return safe_divide(float(numerator), float(denominator))
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def calculate_growth(current: float | int | None, previous: float | int | None) -> float | None:
    if current is None or previous in (None, 0):
        return None
    try:
        return (float(current) - float(previous)) / abs(float(previous)) * 100
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def get_normalized_value(row: dict[str, Any], field: str) -> float | None:
    value = row.get(field)
    if isinstance(value, dict):
        normalized = value.get("normalized_value")
        if isinstance(normalized, (int, float)) and not isinstance(normalized, bool):
            return float(normalized)
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def _first_normalized_value(row: dict[str, Any], *fields: str) -> float | None:
    for field in fields:
        value = get_normalized_value(row, field)
        if value is not None:
            return value
    return None


def calculate_margin(numerator: float | int | None, revenue: float | int | None) -> float | None:
    return safe_div(numerator, revenue)


def calculate_fcf(
    operating_cash_flow: float | int | None, capex: float | int | None
) -> float | None:
    if operating_cash_flow is None or capex is None:
        return None
    return float(operating_cash_flow) - float(capex)


def calculate_cfo_to_net_income(
    operating_cash_flow: float | int | None, net_profit: float | int | None
) -> float | None:
    return safe_div(operating_cash_flow, net_profit)


def calculate_net_debt(total_debt: float | int | None, cash: float | int | None) -> float | None:
    if total_debt is None or cash is None:
        return None
    return float(total_debt) - float(cash)


def _market_key(market: str | None, asset_type: str | None = None) -> str:
    asset = str(asset_type or "").strip().upper()
    if asset in {"ETF", "FUND", "CRYPTO"}:
        return asset
    value = str(market or "UNKNOWN").strip().upper()
    if value in {"IDX", "ID"}:
        return "IDX"
    if value in {"US", "USA"}:
        return "US"
    if value in {"ETF", "FUND", "CRYPTO", "GLOBAL"}:
        return value
    return "UNKNOWN"


def _row_sort_key(row: FinancialRow) -> tuple[str, str]:
    return (str(row.period_type or ""), str(row.as_of_date or row.period or ""))


def _latest_row(rows: list[FinancialRow]) -> FinancialRow | None:
    return sorted(rows, key=_row_sort_key)[-1] if rows else None


def _previous_comparable(rows: list[FinancialRow], current: FinancialRow) -> FinancialRow | None:
    comparable = [
        row for row in rows if row is not current and row.period_type == current.period_type
    ]
    if not comparable:
        return None
    comparable = [
        row
        for row in comparable
        if str(row.as_of_date or row.period) < str(current.as_of_date or current.period)
    ]
    return sorted(comparable, key=_row_sort_key)[-1] if comparable else None


def _percent(value: float | None) -> float | None:
    return None if value is None else value * 100


def _append_unavailable(metrics: FundamentalMetrics, field_name: str) -> None:
    if field_name not in metrics.unavailable_fields:
        metrics.unavailable_fields.append(field_name)


def _set_metric_or_unavailable(
    metrics: FundamentalMetrics, field_name: str, value: float | None
) -> None:
    setattr(metrics, field_name, value)
    if value is None:
        _append_unavailable(metrics, field_name)


def calculate_fundamental_metrics(
    rows: list[FinancialRow] | None,
    *,
    market: str,
    asset_type: str | None = None,
    sector_classification: dict[str, Any] | None = None,
) -> FundamentalMetrics:
    """Calculate market-aware metrics from normalized FinancialRow values."""
    row_list = [row for row in rows or [] if isinstance(row, FinancialRow)]
    current = _latest_row(row_list)
    market_rule = _market_key(market, asset_type)
    sector = str((sector_classification or {}).get("sector") or "").lower()
    if current is None:
        symbol = ""
        period = "unknown"
        period_type = "unknown"
        confidence = "unavailable"
    else:
        symbol = current.symbol
        period = current.period
        period_type = current.period_type
        confidence = current.source_confidence
    metrics = FundamentalMetrics(
        symbol=symbol,
        period=period,
        period_type=period_type,
        market=market_rule,
        asset_type=asset_type,
        source_confidence=confidence,
    )

    if market_rule in {"ETF", "FUND", "CRYPTO"}:
        metrics.unavailable_fields.extend(OPERATING_FINANCIAL_METRICS)
        metrics.warnings.append(
            f"{market_rule} does not use operating financial statement metrics."
        )
        return metrics
    if current is None:
        metrics.unavailable_fields.extend(OPERATING_FINANCIAL_METRICS)
        metrics.warnings.append("No normalized financial rows available.")
        return metrics

    _set_metric_or_unavailable(
        metrics, "roe", _percent(safe_divide(current.net_profit, current.equity))
    )
    _set_metric_or_unavailable(
        metrics, "roa", _percent(safe_divide(current.net_profit, current.total_assets))
    )
    _set_metric_or_unavailable(
        metrics, "npm", _percent(safe_divide(current.net_profit, current.revenue))
    )
    _set_metric_or_unavailable(
        metrics, "gross_margin", _percent(safe_divide(current.gross_profit, current.revenue))
    )

    der = safe_divide(current.total_debt, current.equity)
    if der is None and current.total_liabilities is not None and current.equity not in (None, 0):
        der = safe_divide(current.total_liabilities, current.equity)
        if der is not None:
            metrics.estimated_fields.append("der")
            metrics.warnings.append(
                "DER uses total_liabilities / equity because total_debt is unavailable."
            )
    _set_metric_or_unavailable(metrics, "der", der)

    _set_metric_or_unavailable(
        metrics, "current_ratio", safe_divide(current.current_assets, current.current_liabilities)
    )

    if sector == "bank":
        metrics.der = None
        metrics.interest_coverage = None
        _append_unavailable(metrics, "interest_coverage")
        _append_unavailable(metrics, "der")
        metrics.warnings.append("Bank sector excludes EBITDA, interest coverage, and DER.")
    else:
        _set_metric_or_unavailable(
            metrics,
            "interest_coverage",
            safe_divide(current.ebitda, current.interest_expense),
        )

    free_cash_flow = current.free_cash_flow
    if (
        free_cash_flow is None
        and current.operating_cash_flow is not None
        and current.capex is not None
    ):
        free_cash_flow = calculate_fcf(current.operating_cash_flow, current.capex)
        metrics.estimated_fields.append("free_cash_flow")
    _set_metric_or_unavailable(metrics, "free_cash_flow", free_cash_flow)

    previous = _previous_comparable(row_list, current)
    if previous is not None:
        _set_metric_or_unavailable(
            metrics, "revenue_growth_yoy", calculate_growth(current.revenue, previous.revenue)
        )
        _set_metric_or_unavailable(
            metrics,
            "net_profit_growth_yoy",
            calculate_growth(current.net_profit, previous.net_profit),
        )
    else:
        _append_unavailable(metrics, "revenue_growth_yoy")
        _append_unavailable(metrics, "net_profit_growth_yoy")
        metrics.warnings.append("Previous comparable period unavailable for YoY growth.")

    if market_rule == "UNKNOWN":
        profile = metrics_profile_for_sector("unknown")
        for metric_name in set(GENERAL_METRICS) - set(profile["included_metrics"]):
            if hasattr(metrics, metric_name):
                setattr(metrics, metric_name, None)
                _append_unavailable(metrics, metric_name)
    return metrics


def calculate_market_aware_metrics(
    rows: list[FinancialRow] | None,
    *,
    market: str,
    asset_type: str | None = None,
    sector_classification: dict[str, Any] | None = None,
) -> FundamentalMetrics:
    return calculate_fundamental_metrics(
        rows,
        market=market,
        asset_type=asset_type,
        sector_classification=sector_classification,
    )


def build_fundamental_field_quality(
    row: FinancialRow | None,
    metrics: FundamentalMetrics | None = None,
    *,
    fallback_fields: list[str] | None = None,
    estimation_methods: dict[str, str] | None = None,
    unavailable_reasons: dict[str, str] | None = None,
) -> dict[str, dict[str, Any]]:
    quality: dict[str, dict[str, Any]] = {}
    fallback_set = set(fallback_fields or [])
    estimated_set = set(getattr(row, "estimated_fields", []) if row else [])
    if metrics:
        estimated_set.update(metrics.estimated_fields)
    methods = dict(estimation_methods or {})
    reasons = dict(unavailable_reasons or {})
    as_of_date = row.as_of_date if row else None
    source = row.source if row else None
    confidence = row.source_confidence if row else "unavailable"

    for field_name in FINANCIAL_ROW_FIELDS:
        value = getattr(row, field_name, None) if row else None
        estimated = field_name in estimated_set
        fallback = bool((row and row.fallback and value is not None) or field_name in fallback_set)
        if value is None:
            quality[field_name] = {
                "source": None,
                "confidence": "unavailable",
                "estimated": False,
                "fallback": False,
                "as_of_date": as_of_date,
                "unavailable_reason": reasons.get(field_name, "field_not_available"),
            }
            continue
        quality[field_name] = {
            "source": "estimated" if estimated else "finnhub" if fallback else source,
            "confidence": "low" if estimated else "medium" if fallback else confidence,
            "estimated": estimated,
            "fallback": fallback,
            "as_of_date": as_of_date,
        }
        if fallback:
            quality[field_name]["fallback_source"] = "finnhub"
        if estimated:
            quality[field_name]["estimation_method"] = methods.get(field_name)

    if metrics:
        for metric_name in OPERATING_FINANCIAL_METRICS:
            value = getattr(metrics, metric_name)
            estimated = metric_name in estimated_set
            if value is None:
                quality[metric_name] = {
                    "source": None,
                    "confidence": "unavailable",
                    "estimated": False,
                    "fallback": False,
                    "unavailable_reason": reasons.get(metric_name, "metric_not_available"),
                }
                continue
            quality[metric_name] = {
                "source": "estimated"
                if estimated
                else "local_calculation_from_normalized_financials",
                "confidence": "low" if estimated else metrics.source_confidence,
                "estimated": estimated,
                "fallback": False,
                "as_of_date": as_of_date,
            }
            if estimated:
                quality[metric_name]["estimation_method"] = methods.get(metric_name)
    return quality


def _calculated(
    value: float | None, formula: str, warnings: list[str] | None = None
) -> dict[str, Any]:
    return {
        "value": value,
        "status": "calculated" if value is not None else "source_unavailable",
        "source": "local_calculation_from_normalized_financials",
        "formula": formula,
        "warnings": warnings or [],
    }


def calculate_derived_fundamentals(period_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Calculate derived metrics from normalized annual/quarter rows.

    Legacy numeric keys are preserved for existing consumers. Detailed metadata
    is added under ``derived_metrics`` so API/UI callers can show calculation
    source and status without breaking old text builders. Humanity survives one
    more backwards-compatible schema change.
    """
    rows = [dict(row) for row in (period_rows or [])]
    rows.sort(
        key=lambda row: str(
            (row.get("period") or {}).get("period_end")
            if isinstance(row.get("period"), dict)
            else row.get("period_end") or row.get("period") or ""
        )
    )

    for index, row in enumerate(rows):
        prev = rows[index - 1] if index > 0 else None
        revenue = get_normalized_value(row, "revenue")
        ebitda = get_normalized_value(row, "ebitda")
        net_profit = get_normalized_value(row, "net_profit")
        operating_cash_flow = _first_normalized_value(
            row, "operating_cash_flow", "cash_from_operations"
        )
        capex = _first_normalized_value(row, "capex", "capital_expenditure")
        total_debt = _first_normalized_value(row, "total_debt", "debt")
        cash = _first_normalized_value(row, "cash", "cash_and_equivalents")
        current_liabilities = get_normalized_value(row, "current_liabilities")

        ebitda_margin = calculate_margin(ebitda, revenue)
        net_profit_margin = calculate_margin(net_profit, revenue)
        free_cash_flow = calculate_fcf(operating_cash_flow, capex)
        cfo_to_net_income = calculate_cfo_to_net_income(operating_cash_flow, net_profit)
        net_debt = calculate_net_debt(total_debt, cash)
        cash_ratio = safe_div(cash, current_liabilities)

        row["ebitda_margin"] = ebitda_margin
        row["net_profit_margin"] = net_profit_margin
        row["free_cash_flow"] = free_cash_flow
        row["cfo_to_net_income"] = cfo_to_net_income
        row["net_debt"] = net_debt
        row["cash_ratio"] = cash_ratio

        derived_metrics = {
            "ebitda_margin": _calculated(ebitda_margin, "ebitda / revenue"),
            "net_profit_margin": _calculated(net_profit_margin, "net_profit / revenue"),
            "free_cash_flow": _calculated(free_cash_flow, "operating_cash_flow - capex"),
            "cfo_to_net_income": _calculated(cfo_to_net_income, "operating_cash_flow / net_profit"),
            "net_debt": _calculated(net_debt, "total_debt - cash"),
            "cash_ratio": _calculated(cash_ratio, "cash / current_liabilities"),
        }

        if prev:
            revenue_growth = calculate_growth(revenue, get_normalized_value(prev, "revenue"))
            net_profit_growth = calculate_growth(
                net_profit, get_normalized_value(prev, "net_profit")
            )
            row["revenue_growth_percent"] = revenue_growth
            row["net_profit_growth_percent"] = net_profit_growth
            derived_metrics["revenue_growth_percent"] = _calculated(
                revenue_growth,
                "(current_revenue - previous_revenue) / abs(previous_revenue) * 100",
                [] if revenue_growth is not None else ["previous revenue is missing or zero"],
            )
            derived_metrics["net_profit_growth_percent"] = _calculated(
                net_profit_growth,
                "(current_net_profit - previous_net_profit) / abs(previous_net_profit) * 100",
                [] if net_profit_growth is not None else ["previous net profit is missing or zero"],
            )
        else:
            row.setdefault("revenue_growth_percent", None)
            row.setdefault("net_profit_growth_percent", None)
            derived_metrics["revenue_growth_percent"] = _calculated(
                None, "requires previous revenue", ["previous period unavailable"]
            )
            derived_metrics["net_profit_growth_percent"] = _calculated(
                None, "requires previous net profit", ["previous period unavailable"]
            )

        row["derived_metrics"] = derived_metrics

    return rows
