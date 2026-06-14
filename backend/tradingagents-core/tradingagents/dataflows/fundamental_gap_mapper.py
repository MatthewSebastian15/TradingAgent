"""Map fundamental gaps to reasoned fallback plans."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from dataclasses import field as dataclass_field
from typing import Any

from .financial_rows import FINANCIAL_ROW_FIELDS, FinancialRow


@dataclass
class DataGapReport:
    symbol: str
    period: str
    missing_fields: list[str]
    fallback_fields: list[str]
    estimated_fields: list[str]
    estimation_methods: dict[str, str]
    unresolvable_fields: list[str]
    warnings: list[str] = dataclass_field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


FALLBACK_CALCULATION_MAP = {
    "net_profit": {"method": "eps * shares_outstanding", "confidence": "low"},
    "equity": {"method": "total_assets - total_liabilities", "confidence": "low"},
    "free_cash_flow": {"method": "operating_cash_flow - capex", "confidence": "medium"},
    "der": {"method": "total_liabilities / equity", "confidence": "medium-low"},
    "revenue": {"method": "gross_profit / gross_margin", "confidence": "low"},
}

GAP_RULES: dict[str, dict[str, str]] = {
    "dividend_yield": {"impact": "medium", "fallback": "dividend_source"},
    "payout_ratio": {"impact": "low", "fallback": "dividend_source + net_profit"},
    "fcf_coverage": {"impact": "medium", "fallback": "cashflow + dividends"},
    "cfo_to_net_income": {"impact": "medium", "fallback": "cashflow + income_statement"},
    "free_cash_flow": {"impact": "medium", "fallback": "operating_cash_flow - capex"},
    "revenue_growth_percent": {"impact": "high", "fallback": "annual revenue FY current and previous"},
    "net_profit_growth_percent": {"impact": "high", "fallback": "annual net profit FY current and previous"},
    "ebitda_margin": {"impact": "medium", "fallback": "ebitda / revenue"},
    "net_profit_margin": {"impact": "medium", "fallback": "net_profit / revenue"},
    "sma_50": {"impact": "medium", "fallback": "historical_price"},
    "sma_200": {"impact": "medium", "fallback": "historical_price"},
}

_MISSING_STRINGS = {"", "n/a", "na", "none", "null", "unavailable", "source_unavailable", "missing"}
_AVAILABLE_STATUSES = {
    "available",
    "calculated",
    "reported",
    "estimated",
    "partial",
    "no_dividend_history",
    "not_applicable",
    "not_applicable_negative_earnings",
    "no_history",
}
_MISSING_STATUSES = {"source_unavailable", "unavailable", "missing", "failed", "empty"}


def _copy_row(row: FinancialRow) -> FinancialRow:
    return FinancialRow(**row.to_dict())


def _missing_financial_fields(row: FinancialRow) -> list[str]:
    return [field for field in sorted(FINANCIAL_ROW_FIELDS) if getattr(row, field) is None]


def _estimate_field(row: FinancialRow, field_name: str, gross_margin: float | None = None) -> float | None:
    if field_name == "net_profit" and row.eps is not None and row.shares_outstanding is not None:
        return row.eps * row.shares_outstanding
    if field_name == "equity" and row.total_assets is not None and row.total_liabilities is not None:
        return row.total_assets - row.total_liabilities
    if field_name == "free_cash_flow" and row.operating_cash_flow is not None and row.capex is not None:
        return row.operating_cash_flow - row.capex
    if field_name == "revenue" and row.gross_profit is not None and gross_margin not in (None, 0):
        return row.gross_profit / gross_margin
    return None


def estimate_financial_row_fields(
    row: FinancialRow,
    *,
    fallback_fields: list[str] | None = None,
    gross_margin: float | None = None,
) -> tuple[FinancialRow, DataGapReport]:
    """Return row with safe estimates plus explicit gap report."""
    estimated = _copy_row(row)
    missing_before = _missing_financial_fields(row)
    estimated_fields: list[str] = []
    estimation_methods: dict[str, str] = {}
    warnings: list[str] = []

    for field_name in ("net_profit", "equity", "free_cash_flow", "revenue"):
        if getattr(estimated, field_name) is not None:
            continue
        value = _estimate_field(estimated, field_name, gross_margin=gross_margin)
        if value is None:
            continue
        setattr(estimated, field_name, value)
        estimated_fields.append(field_name)
        estimation_methods[field_name] = FALLBACK_CALCULATION_MAP[field_name]["method"]

    if estimated.total_debt is None and estimated.total_liabilities is not None and estimated.equity not in (None, 0):
        estimated_fields.append("der")
        estimation_methods["der"] = FALLBACK_CALCULATION_MAP["der"]["method"]

    if estimated_fields:
        estimated.estimated_fields = list(dict.fromkeys([*estimated.estimated_fields, *estimated_fields]))
        warnings.append("Estimated fields use low or medium-low confidence and are not reported data.")

    unresolvable = _missing_financial_fields(estimated)
    return estimated, DataGapReport(
        symbol=estimated.symbol,
        period=estimated.period,
        missing_fields=missing_before,
        fallback_fields=sorted(set(fallback_fields or [])),
        estimated_fields=sorted(set(estimated_fields)),
        estimation_methods=estimation_methods,
        unresolvable_fields=unresolvable,
        warnings=warnings,
    )


def build_data_gap_report(
    row: FinancialRow | None,
    *,
    fallback_fields: list[str] | None = None,
    estimated_fields: list[str] | None = None,
    estimation_methods: dict[str, str] | None = None,
    unavailable_fields: list[str] | None = None,
    warnings: list[str] | None = None,
) -> DataGapReport:
    if row is None:
        missing = sorted(FINANCIAL_ROW_FIELDS)
        return DataGapReport(
            symbol="",
            period="unknown",
            missing_fields=missing,
            fallback_fields=sorted(set(fallback_fields or [])),
            estimated_fields=sorted(set(estimated_fields or [])),
            estimation_methods=dict(estimation_methods or {}),
            unresolvable_fields=sorted(set([*missing, *(unavailable_fields or [])])),
            warnings=list(warnings or ["No normalized financial row available."]),
        )
    missing = _missing_financial_fields(row)
    return DataGapReport(
        symbol=row.symbol,
        period=row.period,
        missing_fields=missing,
        fallback_fields=sorted(set(fallback_fields or [])),
        estimated_fields=sorted(set([*(estimated_fields or []), *row.estimated_fields])),
        estimation_methods=dict(estimation_methods or {}),
        unresolvable_fields=sorted(set([*missing, *(unavailable_fields or [])])),
        warnings=list(warnings or row.warnings or []),
    )


def _lookup(payload: dict[str, Any], dotted_key: str) -> Any:
    current: Any = payload
    for part in dotted_key.split("."):
        if isinstance(current, dict):
            current = current.get(part)
            continue
        return None
    return current


def _first_present(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def _latest_derived(payload: dict[str, Any], field: str) -> Any:
    derived = payload.get("derived_fundamentals") or _lookup(payload, "financial_highlights.derived_fundamentals")
    if isinstance(derived, list) and derived:
        for row in reversed(derived):
            if not isinstance(row, dict):
                continue
            metrics = row.get("derived_metrics") if isinstance(row.get("derived_metrics"), dict) else row
            if field in metrics:
                return metrics.get(field)
    if isinstance(derived, dict):
        metrics = derived.get("derived_metrics") if isinstance(derived.get("derived_metrics"), dict) else derived
        return metrics.get(field)
    return None


def _dividend_value(payload: dict[str, Any], field: str) -> Any:
    dividend = payload.get("dividend_quality") or {}
    aliases = {
        "dividend_yield": ("dividend_yield", "dividend_yield_percent"),
        "payout_ratio": ("payout_ratio", "payout_ratio_percent"),
        "fcf_coverage": ("fcf_coverage",),
    }
    if not isinstance(dividend, dict):
        return None
    return _first_present(*(dividend.get(alias) for alias in aliases.get(field, (field,))))


def _technical_value(payload: dict[str, Any], field: str) -> Any:
    return _first_present(payload.get(field), _lookup(payload, f"technical_entry.{field}"))


def _statement_value(payload: dict[str, Any], field: str) -> Any:
    aliases = {
        "free_cash_flow": ("cashflow.free_cash_flow", "annual_cashflow.free_cash_flow"),
        "cfo_to_net_income": ("cashflow.operating_cash_flow", "cashflow.cash_from_operations"),
    }
    for key in aliases.get(field, (field,)):
        value = _lookup(payload, key) if "." in key else payload.get(key)
        if value is not None:
            return value
    return None


def _candidate_value(payload: dict[str, Any], field: str) -> Any:
    return _first_present(
        payload.get(field),
        _latest_derived(payload, field),
        _dividend_value(payload, field),
        _technical_value(payload, field),
        _statement_value(payload, field),
    )


def _available(value: Any, *, field: str | None = None) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return True
    if isinstance(value, (int, float)):
        return value == value
    if isinstance(value, str):
        return value.strip().lower() not in _MISSING_STRINGS
    if isinstance(value, (list, tuple, set)):
        return bool(value)
    if isinstance(value, dict):
        status = str(value.get("status") or value.get("dividend_status") or "").strip().lower()
        if field in {"dividend_yield", "payout_ratio", "fcf_coverage"} and status in {
            "no_dividend_history",
            "not_applicable_negative_earnings",
            "not_applicable",
        }:
            return True
        if status in _AVAILABLE_STATUSES:
            if "value" in value:
                return _available(value.get("value"), field=field) or status in {"calculated", "not_applicable", "no_dividend_history", "not_applicable_negative_earnings"}
            return True
        if status in _MISSING_STATUSES or value.get("available") is False:
            return False
        if "value" in value:
            return _available(value.get("value"), field=field)
        if "normalized_value" in value:
            return _available(value.get("normalized_value"), field=field)
        return any(_available(item, field=field) for item in value.values())
    return True


def _missing_reason(field: str, payload: dict[str, Any]) -> str:
    if field in {"sma_50", "sma_200"}:
        indicator = _lookup(payload, f"technical_entry.{field}")
        if isinstance(indicator, dict) and indicator.get("reason"):
            return str(indicator["reason"])
        return "vendor technical indicator and historical-price fallback are unavailable"
    if field in {"dividend_yield", "payout_ratio", "fcf_coverage"}:
        dividend = payload.get("dividend_quality") or {}
        if isinstance(dividend, dict) and dividend.get("reason"):
            return str(dividend["reason"])
        return "dividend source, net profit, or cashflow data unavailable"
    if field in {"revenue_growth_percent", "net_profit_growth_percent"}:
        return "current and previous annual normalized financial rows are required"
    if field in {"ebitda_margin", "net_profit_margin"}:
        return "revenue and profit metric are required"
    if field == "free_cash_flow":
        return "cashflow or capex unavailable"
    if field == "cfo_to_net_income":
        return "operating cashflow or net income unavailable"
    return "required fundamental input unavailable"


def map_fundamental_gaps(fundamental_payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = fundamental_payload or {}
    gaps: list[dict[str, Any]] = []
    available_fields: list[str] = []
    missing_fields: list[str] = []

    for field, meta in GAP_RULES.items():
        value = _candidate_value(payload, field)
        if _available(value, field=field):
            available_fields.append(field)
            continue
        missing_fields.append(field)
        gaps.append(
            {
                "field": field,
                "status": "missing",
                "impact": meta["impact"],
                "reason": _missing_reason(field, payload),
                "recommended_fallback": meta["fallback"],
            }
        )

    critical_missing_count = sum(1 for gap in gaps if gap.get("impact") == "high")
    recommended_actions = [
        f"{gap['field']}: use {gap['recommended_fallback']}" for gap in gaps
    ]
    return {
        "status": "complete" if not gaps else "partial" if available_fields else "source_unavailable",
        "missing_count": len(gaps),
        "available_count": len(available_fields),
        "critical_missing_count": critical_missing_count,
        "missing_fields": missing_fields,
        "available_fields": available_fields,
        "recommended_actions": recommended_actions,
        "gaps": gaps,
    }
