from __future__ import annotations

import csv
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from io import StringIO
from typing import Any, Callable, Optional, TypeVar

from tradingagents.dataflows.config import set_config, use_config
from tradingagents.dataflows.data_quality import DataField, DataQualityReport, extract_price_dates, looks_missing
from tradingagents.dataflows.interface import route_to_vendor
from tradingagents.dataflows.y_finance import normalize_ticker
from tradingagents.pipeline_balanced_types import AnalysisCancelledError, CollectedData

logger = logging.getLogger(__name__)

T = TypeVar("T")


def _check_cancel(cancel_check: Optional[Callable[[], bool]]) -> None:
    if cancel_check is not None and cancel_check():
        raise AnalysisCancelledError("Analysis was cancelled by the client.")


def _truncate(value: Any, limit: int = 12_000) -> str:
    """Convert *value* to a string and truncate it to *limit* characters."""
    text = str(value or "")
    if len(text) <= limit:
        return text

    boundary = text.rfind("\n", 0, limit)
    cut = boundary if boundary > 0 else limit
    return text[:cut] + "\n\n[TRUNCATED FOR TOKEN CONTROL]"


def _call_yfinance_with_resilience(func: Callable[[], Any]) -> Any:
    # route_to_vendor is the single app-level retry/circuit/timeout layer for
    # market-data calls. yfinance-specific helpers keep their narrow transient
    # retry, so the balanced pipeline must not wrap the same field again.
    return func()


def _run_with_config(config: dict[str, Any], func: Callable[[], T]) -> T:
    with use_config(config):
        return func()


def _safe_data_field(label: str, func: Callable[[], Any], limit: int = 12_000) -> DataField:
    try:
        value = _truncate(_call_yfinance_with_resilience(func), limit)
        status = "missing" if looks_missing(value) else "ok"
        warning = value.splitlines()[0] if status == "missing" and value else None
        return DataField(value=value, status=status, warning=warning)
    except Exception as exc:
        logger.warning("Balanced pipeline data call failed for %s: %s", label, exc)
        return DataField(value=f"{label} unavailable: {exc}", status="missing", warning=f"{label} unavailable: {exc}")


def _extract_last_close_price(price_data: str, trade_date: str) -> float | None:
    """Parse the last Close value at or before trade_date from yfinance CSV."""
    lines = [
        line
        for line in (price_data or "").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not lines:
        return None

    try:
        cutoff = datetime.strptime(trade_date, "%Y-%m-%d")
    except ValueError:
        cutoff = None

    last_date: datetime | None = None
    last_close: float | None = None
    reader = csv.DictReader(StringIO("\n".join(lines)))
    for row in reader:
        if not row:
            continue
        date_raw = (row.get("Date") or row.get("") or next(iter(row.values()), "") or "").strip()
        close_raw = (row.get("Close") or row.get("Adj Close") or "").strip()
        if not date_raw or not close_raw:
            continue
        try:
            row_date = datetime.strptime(date_raw[:10], "%Y-%m-%d")
            close = float(close_raw.replace(",", ""))
        except (TypeError, ValueError):
            continue
        if cutoff is not None and row_date > cutoff:
            continue
        if last_date is None or row_date >= last_date:
            last_date = row_date
            last_close = close
    return last_close


def _date_window(trade_date: str) -> tuple[str, str, str]:
    current = datetime.strptime(trade_date, "%Y-%m-%d")
    start_90 = (current - timedelta(days=90)).strftime("%Y-%m-%d")
    start_30 = (current - timedelta(days=30)).strftime("%Y-%m-%d")
    end = (current + timedelta(days=1)).strftime("%Y-%m-%d")
    return start_90, start_30, end


def collect_market_data(
    ticker: str,
    trade_date: str,
    config: dict[str, Any],
    cancel_check: Optional[Callable[[], bool]] = None,
) -> CollectedData:
    """Collect external data in parallel and classify yfinance data quality."""
    _check_cancel(cancel_check)
    set_config(config)
    ticker = normalize_ticker(ticker)
    start_90, start_30, end = _date_window(trade_date)

    indicator_names = [
        "close_50_sma",
        "close_200_sma",
        "macd",
        "rsi",
        "atr",
        "boll_ub",
        "boll_lb",
        "mfi",
    ]
    tasks: dict[str, Callable[[], DataField]] = {
        "price_data": lambda: _safe_data_field(
            "price_data",
            lambda: route_to_vendor("get_stock_data", ticker, start_90, end),
            limit=14_000,
        ),
        "fundamentals": lambda: _safe_data_field(
            "fundamentals",
            lambda: route_to_vendor("get_fundamentals", ticker, trade_date),
            limit=12_000,
        ),
        "balance_sheet": lambda: _safe_data_field(
            "balance_sheet",
            lambda: route_to_vendor("get_balance_sheet", ticker, "quarterly", trade_date),
            limit=10_000,
        ),
        "cashflow": lambda: _safe_data_field(
            "cashflow",
            lambda: route_to_vendor("get_cashflow", ticker, "quarterly", trade_date),
            limit=10_000,
        ),
        "income_statement": lambda: _safe_data_field(
            "income_statement",
            lambda: route_to_vendor("get_income_statement", ticker, "quarterly", trade_date),
            limit=10_000,
        ),
        "company_news": lambda: _safe_data_field(
            "company_news",
            lambda: route_to_vendor("get_news", ticker, start_30, end),
            limit=12_000,
        ),
        "global_news": lambda: _safe_data_field(
            "global_news",
            lambda: route_to_vendor("get_global_news", trade_date, 7, 10),
            limit=8_000,
        ),
        "insider_transactions": lambda: _safe_data_field(
            "insider_transactions",
            lambda: route_to_vendor("get_insider_transactions", ticker),
            limit=6_000,
        ),
    }
    for indicator in indicator_names:
        tasks[f"indicator:{indicator}"] = lambda indicator=indicator: _safe_data_field(
            f"indicator:{indicator}",
            lambda indicator=indicator: route_to_vendor("get_indicators", ticker, indicator, trade_date, 30),
            limit=4_000,
        )

    results: dict[str, DataField] = {}
    max_workers = min(max(1, int(config.get("data_collection_workers", 6))), len(tasks))
    with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="balanced-data") as pool:
        futures = {pool.submit(_run_with_config, config, func): name for name, func in tasks.items()}
        for future in as_completed(futures):
            _check_cancel(cancel_check)
            name = futures[future]
            try:
                results[name] = future.result()
            except Exception as exc:
                logger.warning("Balanced pipeline data future failed for %s: %s", name, exc)
                results[name] = DataField(value=f"{name} unavailable: {exc}", status="missing", warning=f"{name} unavailable: {exc}")

    price = results["price_data"]
    fundamentals = results["fundamentals"]
    balance_sheet = results["balance_sheet"]
    cashflow = results["cashflow"]
    income_statement = results["income_statement"]
    company_news = results["company_news"]
    global_news = results["global_news"]
    insider_transactions = results["insider_transactions"]
    indicator_parts = [results[f"indicator:{indicator}"] for indicator in indicator_names]

    warnings: list[str] = []
    for item in [price, fundamentals, balance_sheet, cashflow, income_statement, company_news, global_news, insider_transactions, *indicator_parts]:
        if item.warning:
            warnings.append(item.warning)

    price_dates = extract_price_dates(price.value)
    if price.status == "missing":
        price_status = "invalid_ticker" if fundamentals.status == "missing" else "missing"
    elif trade_date not in price_dates:
        price_status = "market_closed"
        warnings.append(f"No yfinance OHLCV row found exactly on {trade_date}; market may have been closed or ticker may not trade that day.")
    elif len(price_dates) < 10:
        price_status = "partial"
        warnings.append(f"Only {len(price_dates)} price rows found in the 90-day yfinance window.")
    else:
        price_status = "ok"

    financial_statuses = [fundamentals.status, balance_sheet.status, cashflow.status, income_statement.status]
    if all(status == "missing" for status in financial_statuses):
        fundamentals_status = "missing"
    elif any(status == "missing" for status in financial_statuses):
        fundamentals_status = "partial"
        missing_parts = [
            name
            for name, item in [
                ("fundamentals", fundamentals),
                ("balance_sheet", balance_sheet),
                ("cashflow", cashflow),
                ("income_statement", income_statement),
            ]
            if item.status == "missing"
        ]
        warnings.append(f"Partial fundamentals from yfinance; missing: {', '.join(missing_parts)}.")
    else:
        fundamentals_status = "ok"

    if company_news.status == "missing" and global_news.status == "missing":
        news_status = "missing"
    elif company_news.status == "missing" or global_news.status == "missing":
        news_status = "partial"
        warnings.append("Partial news coverage from yfinance; company-specific or global news is missing.")
    else:
        news_status = "ok"

    data_quality = DataQualityReport(
        price_data=price_status,
        fundamentals=fundamentals_status,
        news=news_status,
        warnings=list(dict.fromkeys(warnings))[:20],
    )

    _check_cancel(cancel_check)
    return CollectedData(
        ticker=ticker,
        trade_date=trade_date,
        price_data=price.value,
        technical_indicators="\n\n".join(part.value for part in indicator_parts),
        fundamentals=fundamentals.value,
        balance_sheet=balance_sheet.value,
        cashflow=cashflow.value,
        income_statement=income_statement.value,
        company_news=company_news.value,
        global_news=global_news.value,
        insider_transactions=insider_transactions.value,
        data_quality=data_quality,
        last_close_price=_extract_last_close_price(price.value, trade_date),
    )
