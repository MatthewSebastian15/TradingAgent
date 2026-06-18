from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any

import requests

from .config import get_config

TICKER_URL = "https://www.sec.gov/files/company_tickers.json"
FACTS_URL_PREFIX = "https://data.sec.gov/api/xbrl/companyfacts/CIK"

FIELD_CONCEPTS = {
    "income_statement": {
        "revenue": (
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "Revenues",
            "SalesRevenueNet",
        ),
        "gross_profit": ("GrossProfit",),
        "operating_income": ("OperatingIncomeLoss",),
        "net_profit": ("NetIncomeLoss", "ProfitLoss"),
        "eps": ("EarningsPerShareDiluted", "EarningsPerShareBasic"),
    },
    "balance_sheet": {
        "assets": ("Assets",),
        "total_liabilities": ("Liabilities",),
        "equity": (
            "StockholdersEquity",
            "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
        ),
        "cash": (
            "CashAndCashEquivalentsAtCarryingValue",
            "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
        ),
        "debt": (
            "DebtCurrent",
            "LongTermDebtCurrent",
            "LongTermDebtNoncurrent",
            "LongTermDebtAndFinanceLeaseObligations",
        ),
        "current_liabilities": ("LiabilitiesCurrent",),
    },
    "cashflow": {
        "operating_cash_flow": ("NetCashProvidedByUsedInOperatingActivities",),
        "capex": (
            "PaymentsToAcquirePropertyPlantAndEquipment",
            "PaymentsToAcquireProductiveAssets",
        ),
        "dividend_paid": ("PaymentsOfDividends", "PaymentsOfDividendsCommonStock"),
    },
}


def _headers() -> dict[str, str]:
    user_agent = (
        os.getenv("SEC_USER_AGENT", "").strip() or "TradingAgents/1.0 tradingagents@example.com"
    )
    return {
        "User-Agent": user_agent,
        "Accept-Encoding": "gzip, deflate",
        "Accept": "application/json",
    }


def _timeout() -> tuple[int, int]:
    try:
        seconds = max(1, min(int(get_config().get("tool_timeout_seconds", 30)), 30))
    except (TypeError, ValueError):
        seconds = 30
    return (5, seconds)


def _request_json(url: str) -> dict[str, Any]:
    response = requests.get(url, headers=_headers(), timeout=_timeout())
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


@lru_cache(maxsize=1)
def _ticker_map() -> dict[str, str]:
    payload = _request_json(TICKER_URL)
    mapping: dict[str, str] = {}
    for item in payload.values():
        if not isinstance(item, dict):
            continue
        ticker = str(item.get("ticker") or "").upper().strip()
        cik = item.get("cik_str")
        if ticker and cik is not None:
            mapping[ticker] = str(cik).zfill(10)
    return mapping


@lru_cache(maxsize=512)
def _company_facts(cik: str) -> dict[str, Any]:
    return _request_json(f"{FACTS_URL_PREFIX}{str(cik).zfill(10)}.json")


def _base_ticker(ticker: str) -> str:
    return str(ticker or "").upper().split(".", 1)[0].strip()


def _is_blank(value: Any) -> bool:
    return value in (None, "", [], {})


def _units_for(
    concept_payload: dict[str, Any], field_name: str
) -> tuple[str, list[dict[str, Any]]] | None:
    units = concept_payload.get("units") if isinstance(concept_payload.get("units"), dict) else {}
    candidates = ("USD", "shares", "USD/shares", "pure")
    if field_name == "eps":
        candidates = ("USD/shares",)
    if field_name == "shares_outstanding":
        candidates = ("shares",)
    for unit in candidates:
        values = units.get(unit)
        if isinstance(values, list):
            return unit, [item for item in values if isinstance(item, dict)]
    for unit, values in units.items():
        if isinstance(values, list):
            return str(unit), [item for item in values if isinstance(item, dict)]
    return None


def _period_label(entry: dict[str, Any], freq: str) -> str | None:
    fy = entry.get("fy")
    fp = str(entry.get("fp") or "").upper()
    form = str(entry.get("form") or "").upper()
    if not fy:
        return None
    if freq == "annual":
        if fp == "FY" or form.startswith("10-K"):
            return f"FY{fy}"
        return None
    if fp in {"Q1", "Q2", "Q3", "Q4"} and form.startswith("10-Q"):
        return f"{fp} {fy}"
    return None


def _entry_allowed(entry: dict[str, Any], freq: str, curr_date: str | None) -> bool:
    if _is_blank(entry.get("val")):
        return False
    if curr_date and str(entry.get("end") or "")[:10] > str(curr_date)[:10]:
        return False
    return _period_label(entry, freq) is not None


def _field_value(value: Any, field_name: str) -> float | int | None:
    if _is_blank(value):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if field_name == "capex":
        number = abs(number)
    return int(number) if number.is_integer() else number


def _select_latest(
    entries: list[dict[str, Any]], freq: str, curr_date: str | None
) -> dict[str, dict[str, Any]]:
    selected: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if not _entry_allowed(entry, freq, curr_date):
            continue
        label = _period_label(entry, freq)
        if not label:
            continue
        current = selected.get(label)
        filed = str(entry.get("filed") or "")
        if current is None or filed >= str(current.get("filed") or ""):
            selected[label] = entry
    return selected


def _period_end(values: dict[str, Any]) -> str:
    dates = [
        str(item.get("period_end") or "")
        for item in values.values()
        if isinstance(item, dict) and item.get("period_end")
    ]
    return max(dates) if dates else ""


def _limit_periods(
    periods: dict[str, dict[str, Any]], max_periods: int = 8
) -> dict[str, dict[str, Any]]:
    ordered = sorted(periods.items(), key=lambda item: (_period_end(item[1]), item[0]))
    return dict(ordered[-max_periods:])


def _statement_payload(ticker: str, statement: str, freq: str, curr_date: str | None) -> str:
    symbol = _base_ticker(ticker)
    cik = _ticker_map().get(symbol)
    if not cik:
        return f"No SEC CIK mapping found for symbol '{ticker}'"

    facts = (_company_facts(cik).get("facts") or {}).get("us-gaap") or {}
    periods: dict[str, dict[str, Any]] = {}
    normalized_freq = "annual" if str(freq or "").lower().startswith("a") else "quarterly"

    for field_name, concepts in FIELD_CONCEPTS[statement].items():
        for concept in concepts:
            concept_payload = facts.get(concept)
            if not isinstance(concept_payload, dict):
                continue
            unit_rows = _units_for(concept_payload, field_name)
            if unit_rows is None:
                continue
            unit, rows = unit_rows
            selected = _select_latest(rows, normalized_freq, curr_date)
            for label, entry in selected.items():
                value = _field_value(entry.get("val"), field_name)
                if value is None:
                    continue
                periods.setdefault(label, {})[field_name] = {
                    "value": value,
                    "source_unit": "raw",
                    "currency": "USD" if "USD" in unit else unit,
                    "source_concept": concept,
                    "period_end": entry.get("end"),
                    "filed": entry.get("filed"),
                }
            if selected:
                break

    if not periods:
        return f"No SEC company facts data found for symbol '{ticker}'"

    periods = _limit_periods(periods)

    return json.dumps(
        {
            "available": True,
            "source": "sec_companyfacts",
            "ticker": symbol,
            "cik": cik,
            "statement": statement,
            "frequency": normalized_freq,
            "periods": periods,
        },
        separators=(",", ":"),
        ensure_ascii=False,
    )


def get_income_statement(ticker: str, freq: str = "quarterly", curr_date: str | None = None) -> str:
    return _statement_payload(ticker, "income_statement", freq, curr_date)


def get_balance_sheet(ticker: str, freq: str = "quarterly", curr_date: str | None = None) -> str:
    return _statement_payload(ticker, "balance_sheet", freq, curr_date)


def get_cashflow(ticker: str, freq: str = "quarterly", curr_date: str | None = None) -> str:
    return _statement_payload(ticker, "cashflow", freq, curr_date)
