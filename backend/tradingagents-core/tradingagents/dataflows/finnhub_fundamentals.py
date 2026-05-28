from __future__ import annotations

import json
from typing import Any

from .finnhub_common import FinnhubUnavailableError, build_metadata, handle_finnhub_error, make_api_request


def _dump(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False, default=str)


def _blank(value: Any) -> bool:
    return value in (None, "", "None", [], {})


def _first_metric(metric: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in metric and not _blank(metric.get(key)):
            return metric.get(key)
    return None


def _sourced(value: Any, period: str = "ttm") -> dict[str, Any] | None:
    if _blank(value):
        return None
    return {"value": value, "source": "finnhub", "period": period}


def get_company_profile(ticker: str) -> str:
    try:
        payload = make_api_request("/stock/profile2", {"symbol": ticker}, feature_key="enable_fundamentals")
        if not isinstance(payload, dict) or not payload:
            raise FinnhubUnavailableError("Company profile response is empty.")
        company = {
            "name": payload.get("name"),
            "country": payload.get("country"),
            "currency": payload.get("currency"),
            "exchange": payload.get("exchange"),
            "industry": payload.get("finnhubIndustry"),
            "ipo": payload.get("ipo"),
            "market_cap": payload.get("marketCapitalization"),
            "share_outstanding": payload.get("shareOutstanding"),
            "website": payload.get("weburl"),
        }
        missing = [key for key in ("name", "industry", "market_cap") if _blank(company.get(key))]
        if _blank(company.get("name")) and _blank(company.get("market_cap")):
            raise FinnhubUnavailableError("Company profile lacks name and market cap.")
        return _dump(
            {
                "symbol": ticker,
                "source": "finnhub",
                "company": company,
                "metadata": build_metadata(
                    "/stock/profile2",
                    is_enrichment=True,
                    confidence="medium" if missing else "high",
                    missing_fields=missing,
                ),
            }
        )
    except Exception as exc:
        return handle_finnhub_error(f"company profile for {ticker}", exc, fallback_next="alpha_vantage")


def get_basic_financials(ticker: str) -> str:
    try:
        payload = make_api_request(
            "/stock/metric",
            {"symbol": ticker, "metric": "all"},
            feature_key="enable_fundamentals",
        )
        if not isinstance(payload, dict):
            raise FinnhubUnavailableError("Basic financials response is not an object.")
        metric = payload.get("metric") if isinstance(payload.get("metric"), dict) else {}
        if not metric:
            raise FinnhubUnavailableError("Basic financials metric object is empty.")

        mappings = {
            "pe_ratio": (_first_metric(metric, "peBasicExclExtraTTM", "peTTM"), "ttm"),
            "pb_ratio": (_first_metric(metric, "pbQuarterly"), "quarterly"),
            "ps_ratio": (_first_metric(metric, "psTTM"), "ttm"),
            "eps_ttm": (_first_metric(metric, "epsBasicExclExtraItemsTTM", "epsTTM"), "ttm"),
            "roe_ttm": (_first_metric(metric, "roeTTM"), "ttm"),
            "roa_ttm": (_first_metric(metric, "roaTTM"), "ttm"),
            "gross_margin_ttm": (_first_metric(metric, "grossMarginTTM"), "ttm"),
            "operating_margin_ttm": (_first_metric(metric, "operatingMarginTTM"), "ttm"),
            "net_margin_ttm": (_first_metric(metric, "netProfitMarginTTM"), "ttm"),
            "debt_to_equity": (_first_metric(metric, "totalDebt/totalEquityQuarterly"), "quarterly"),
            "current_ratio": (_first_metric(metric, "currentRatioQuarterly"), "quarterly"),
            "quick_ratio": (_first_metric(metric, "quickRatioQuarterly"), "quarterly"),
            "revenue_growth_ttm_yoy": (_first_metric(metric, "revenueGrowthTTMYoy"), "ttm"),
            "eps_growth_ttm_yoy": (_first_metric(metric, "epsGrowthTTMYoy"), "ttm"),
            "beta": (_first_metric(metric, "beta"), "latest"),
            "52_week_high": (_first_metric(metric, "52WeekHigh"), "latest"),
            "52_week_low": (_first_metric(metric, "52WeekLow"), "latest"),
        }
        normalized = {key: _sourced(value, period) for key, (value, period) in mappings.items() if _sourced(value, period)}
        if not normalized:
            raise FinnhubUnavailableError("No selected basic financial metrics were available.")
        return _dump(
            {
                "symbol": ticker,
                "source": "finnhub",
                "metrics": normalized,
                "metadata": build_metadata(
                    "/stock/metric",
                    is_enrichment=True,
                    confidence="high" if len(normalized) >= 6 else "medium",
                    missing_fields=[key for key in mappings if key not in normalized],
                ),
            }
        )
    except Exception as exc:
        return handle_finnhub_error(f"basic financials for {ticker}", exc, fallback_next="alpha_vantage")


def get_fundamentals(ticker: str, curr_date: str | None = None) -> str:
    """Return profile and metric enrichment in one normalized JSON document."""
    profile_text = get_company_profile(ticker)
    metrics_text = get_basic_financials(ticker)
    profile_payload: dict[str, Any] = {}
    metrics_payload: dict[str, Any] = {}

    for label, text in (("profile", profile_text), ("metrics", metrics_text)):
        if text.lower().startswith("finnhub unavailable"):
            continue
        try:
            parsed = json.loads(text)
            if label == "profile":
                profile_payload = parsed
            else:
                metrics_payload = parsed
        except json.JSONDecodeError:
            continue

    if not profile_payload and not metrics_payload:
        return f"No fundamentals data found for symbol '{ticker}' from Finnhub. {profile_text} {metrics_text}"

    payload = {
        "symbol": ticker,
        "source": "finnhub",
        "as_of_date": curr_date,
        "company": profile_payload.get("company", {}),
        "metrics": metrics_payload.get("metrics", {}),
        "field_source_rule": "Every metric field carries its own source/period object.",
        "metadata": build_metadata(
            "/stock/profile2+/stock/metric",
            is_enrichment=True,
            confidence="high" if profile_payload and metrics_payload else "medium",
            missing_fields=[] if profile_payload and metrics_payload else ["profile" if not profile_payload else "metrics"],
        ),
    }
    return _dump(payload)


def get_financials_reported(ticker: str, freq: str = "quarterly", curr_date: str | None = None) -> str:
    try:
        payload = make_api_request(
            "/stock/financials-reported",
            {"symbol": ticker, "freq": "annual" if str(freq).lower().startswith("a") else "quarterly"},
            feature_key="enable_fundamentals",
        )
        if not isinstance(payload, dict) or not payload.get("data"):
            raise FinnhubUnavailableError("Financials reported response is empty.")
        data = payload.get("data") if isinstance(payload.get("data"), list) else []
        if curr_date:
            data = [item for item in data if str(item.get("endDate") or item.get("startDate") or "") <= curr_date]
        if not data:
            raise FinnhubUnavailableError("No financial reports remain after date filtering.")
        return _dump(
            {
                "symbol": ticker,
                "source": "finnhub",
                "reports": data[:8],
                "metadata": build_metadata("/stock/financials-reported", is_fallback=True, confidence="medium"),
            }
        )
    except Exception as exc:
        return handle_finnhub_error(f"reported financials for {ticker}", exc, fallback_next=None)


def _filter_statement(text: str, statement_hint: str, ticker: str) -> str:
    if text.lower().startswith("finnhub unavailable"):
        return text
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return text
    reports = payload.get("reports") if isinstance(payload, dict) else []
    filtered: list[dict[str, Any]] = []
    for report in reports if isinstance(reports, list) else []:
        report_data = report.get("report") if isinstance(report, dict) else None
        if isinstance(report_data, dict):
            relevant = {
                key: value
                for key, value in report_data.items()
                if statement_hint.lower() in str(key).lower() or statement_hint.lower() in json.dumps(value).lower()
            }
            if relevant:
                item = dict(report)
                item["report"] = relevant
                filtered.append(item)
        else:
            filtered.append(report)
    payload["reports"] = filtered or reports
    payload["statement_filter"] = statement_hint
    payload["symbol"] = ticker
    return _dump(payload)



def get_financials(ticker: str, freq: str = "annual") -> str:
    """Return Finnhub /stock/financials as an optional fallback statement payload."""
    normalized_freq = "annual" if str(freq or "annual").lower().startswith("a") else "quarterly"
    try:
        payload = make_api_request(
            "/stock/financials",
            {"symbol": ticker, "statement": "bs", "freq": normalized_freq},
            feature_key="enable_fundamentals",
        )
        if not isinstance(payload, dict):
            raise FinnhubUnavailableError("Financials response is not an object.")
        metric = payload.get("financials") if isinstance(payload.get("financials"), list) else []
        if not metric:
            raise FinnhubUnavailableError("Financials response contains no rows.")
        return _dump(
            {
                "symbol": ticker,
                "source": "finnhub",
                "freq": normalized_freq,
                "financials": metric[:8],
                "metadata": build_metadata("/stock/financials", is_fallback=True, confidence="medium"),
            }
        )
    except Exception as exc:
        return handle_finnhub_error(f"financials for {ticker}", exc, fallback_next=None)

def get_balance_sheet(ticker: str, freq: str = "quarterly", curr_date: str | None = None) -> str:
    return _filter_statement(get_financials_reported(ticker, freq, curr_date), "balance", ticker)


def get_cashflow(ticker: str, freq: str = "quarterly", curr_date: str | None = None) -> str:
    return _filter_statement(get_financials_reported(ticker, freq, curr_date), "cash", ticker)


def get_income_statement(ticker: str, freq: str = "quarterly", curr_date: str | None = None) -> str:
    return _filter_statement(get_financials_reported(ticker, freq, curr_date), "income", ticker)
