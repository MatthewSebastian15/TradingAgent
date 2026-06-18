"""IDX official source adapter.

The financial statement function is wired to the IDX parser contract. It can use
configured report metadata from ``IDX_FINANCIAL_REPORT_INDEX_PATH`` or
``IDX_FINANCIAL_REPORT_INDEX_URL`` and falls back cleanly when no official report
metadata is available.
"""

from __future__ import annotations

from typing import Any

from .idx_financials_parser import (
    build_idx_financial_statement_from_report,
    find_idx_financial_reports,
)


def _ticker_key(ticker: str | None) -> str:
    return str(ticker or "").strip().upper()


def _is_idx_ticker(ticker: str | None) -> bool:
    return _ticker_key(ticker).endswith(".JK")


def _unavailable(
    ticker: str, endpoint: str, reason: str = "IDX official live adapter is not implemented yet"
) -> dict[str, Any]:
    return {
        "available": False,
        "ticker": ticker,
        "source": "idx_official",
        "endpoint": endpoint,
        "status": "source_unavailable",
        "reason": reason,
        "metadata": {
            "vendor_attempts": [
                {
                    "vendor": "idx_official",
                    "status": "empty",
                    "reason": reason,
                }
            ]
        },
    }


def get_idx_company_profile(ticker: str, *_args: Any, **_kwargs: Any) -> dict[str, Any]:
    """Return IDX company profile data when available.

    The vendor router passes ``curr_date`` as a second positional argument for
    profile calls so all vendors share one call contract. Accept and ignore
    extra arguments here because the current IDX profile fallback only needs the
    ticker. Without this shim the whole IDX profile attempt fails with a Python
    signature error before normal vendor fallback can continue.
    """
    return _unavailable(_ticker_key(ticker), "company_profile")


def get_idx_shareholders(ticker: str) -> dict[str, Any]:
    return {**_unavailable(_ticker_key(ticker), "shareholders"), "shareholders": []}


def _target_year(period: str | int | None) -> int | None:
    if period in (None, "", "annual", "quarterly", "ttm"):
        return None
    import re

    match = re.search(r"(20\d{2}|19\d{2})", str(period))
    return int(match.group(1)) if match else None


def get_idx_financial_statements(ticker: str, period: str = "annual") -> dict[str, Any]:
    ticker_key = _ticker_key(ticker)
    if not _is_idx_ticker(ticker_key):
        return {
            **_unavailable(
                ticker_key, "financial_statements", "IDX official is only used for .JK tickers"
            ),
            "period": period,
        }

    reports = find_idx_financial_reports(ticker_key, year=_target_year(period), period=period)
    if not reports:
        return {
            **_unavailable(
                ticker_key,
                "financial_statements",
                (
                    "No IDX official financial report metadata found; configure "
                    + "IDX_REPORT_INDEX_PATH or IDX_REPORT_INDEX_URL"
                ),
            ),
            "period": period,
            "report_candidates": [],
        }

    errors: list[str] = []
    for report in reports:
        result = build_idx_financial_statement_from_report(report)
        if result.get("available"):
            return {
                **result,
                "ticker": ticker_key,
                "endpoint": "financial_statements",
                "period_requested": period,
                "report_candidates": reports,
                "metadata": {
                    **(result.get("metadata") or {}),
                    "vendor_attempts": [
                        {
                            "vendor": "idx_official",
                            "status": "success",
                            "reason": None,
                        }
                    ],
                },
            }
        errors.append(str(result.get("reason") or "IDX report could not be parsed"))

    reason = (
        " | ".join(errors) if errors else "IDX official reports were found but none were usable"
    )
    return {
        **_unavailable(ticker_key, "financial_statements", reason),
        "period": period,
        "report_candidates": reports,
    }


def get_idx_corporate_actions(
    ticker: str, start_date: str | None = None, end_date: str | None = None
) -> dict[str, Any]:
    return {
        **_unavailable(_ticker_key(ticker), "corporate_actions"),
        "start_date": start_date,
        "end_date": end_date,
        "corporate_actions": [],
    }
