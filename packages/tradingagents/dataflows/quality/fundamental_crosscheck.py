from __future__ import annotations

from typing import Any

from tradingagents.dataflows.fundamentals.normalizers import unwrap_normalized_value

SCALE_FACTORS = (1e3, 1e6, 1e9)


def _period_key(row: dict[str, Any]) -> tuple[str, str]:
    period = row.get("period") if isinstance(row.get("period"), dict) else {}
    return str(period.get("period_label") or ""), str(period.get("period_type") or "annual")


def _is_scale_mismatch(primary: float, secondary: float) -> bool:
    ratio = abs(primary / secondary)
    return any(
        abs(ratio / factor - 1) < 0.05 or abs(ratio * factor - 1) < 0.05 for factor in SCALE_FACTORS
    )


def crosscheck_latest_fundamentals(
    primary_rows: list[dict[str, Any]] | None,
    secondary_rows: list[dict[str, Any]] | None,
    *,
    secondary_source: str,
    fields: tuple[str, ...] = ("revenue", "net_profit"),
    tolerance_pct: float = 5.0,
) -> dict[str, Any]:
    secondary_by_period = {
        _period_key(row): row for row in secondary_rows or [] if isinstance(row, dict)
    }
    for row in reversed(primary_rows or []):
        if not isinstance(row, dict) or not _period_key(row)[0]:
            continue
        other = secondary_by_period.get(_period_key(row))
        if other is None:
            continue
        warnings: list[str] = []
        if row.get("currency") and other.get("currency") and row["currency"] != other["currency"]:
            warnings.append(f"CURRENCY_MISMATCH: {row['currency']} vs {other['currency']}")
        checks: list[dict[str, Any]] = []
        for field in fields:
            primary = unwrap_normalized_value(row.get(field))
            secondary = unwrap_normalized_value(other.get(field))
            if primary is None or not secondary:
                continue
            deviation = abs(primary - secondary) / abs(secondary) * 100
            status = "ok"
            if _is_scale_mismatch(primary, secondary):
                status = "unit_scale_mismatch"
                warnings.append(f"UNIT_SCALE_MISMATCH: {field}")
            elif deviation > tolerance_pct:
                status = "value_mismatch"
                warnings.append(f"VALUE_MISMATCH: {field} differs {deviation:.1f}%")
            checks.append(
                {
                    "field": field,
                    "primary": primary,
                    "secondary": secondary,
                    "deviation_pct": round(deviation, 2),
                    "status": status,
                }
            )
        if checks or warnings:
            return {
                "status": "conflict" if warnings else "ok",
                "period_label": _period_key(row)[0],
                "secondary_source": secondary_source,
                "checks": checks,
                "warnings": warnings,
            }
    return {
        "status": "skipped",
        "reason": "no_matching_period",
        "secondary_source": secondary_source,
        "checks": [],
        "warnings": [],
    }
