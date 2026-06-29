"""Economic tab data — Phase 1 (Federal Reserve only).

Backend fetches public Fed/Treasury sources directly over stdlib HTTP (no API
keys, no subprocess CLI). Results are cached 10 minutes and throttled to ~2
req/sec so we don't hammer the free endpoints.

ponytail: stdlib urllib + csv, run in a thread; swap to a real client only if a
source needs auth/retries the engine adapters already provide.
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import urllib.request
from datetime import datetime, timezone
from time import monotonic

from config import ECONOMIC_WTO_API_KEY
from errors import BadRequestError, PipelineExecutionError
from services.market_cache import market_cache
from services.market_ohlcv_service import fetch_ohlcv_range

_CACHE_TTL_SECONDS = 600.0  # 10 minutes
_MIN_INTERVAL_SECONDS = 0.5  # ~2 requests/sec
_HTTP_TIMEOUT_SECONDS = 20.0
_USER_AGENT = "TradingAgents-Economic/1.0"

_NYFED = "https://markets.newyorkfed.org/api/rates"
_TREASURY_CSV = (
    "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
    "daily-treasury-rates.csv/{year}/all"
    "?type=daily_treasury_yield_curve&field_tdr_date_value={year}&page&_format=csv"
)
_WORLDBANK = "https://api.worldbank.org/v2"
_IMF = "https://www.imf.org/external/datamapper/api/v1"
_ECB = "https://data-api.ecb.europa.eu/service/data"
_FISCALDATA = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service"
_UNESCO = "https://api.uis.unesco.org/api/public"

_MAX_COUNTRIES = 6

_throttle_lock = asyncio.Lock()
_last_call_at = 0.0


def _http_get(url: str, extra_headers: dict | None = None) -> bytes:
    # IMF DataMapper 403s without an Accept header; the others ignore it.
    headers = {"User-Agent": _USER_AGENT, "Accept": "*/*"}
    if extra_headers:
        headers.update(extra_headers)
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=_HTTP_TIMEOUT_SECONDS) as response:
        return response.read()


async def _throttled_get(url: str, extra_headers: dict | None = None) -> bytes:
    global _last_call_at
    async with _throttle_lock:
        wait = _MIN_INTERVAL_SECONDS - (monotonic() - _last_call_at)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call_at = monotonic()
    return await asyncio.to_thread(_http_get, url, extra_headers)


def _nyfed_series(payload: bytes) -> list[dict]:
    """NY Fed reference-rate JSON → ascending [{date, value}] points."""
    rows = json.loads(payload).get("refRates", [])
    points = [
        {"date": row["effectiveDate"], "value": float(row["percentRate"])}
        for row in rows
        if row.get("effectiveDate") and row.get("percentRate") is not None
    ]
    points.sort(key=lambda point: point["date"])
    return points


def _treasury_yield_curve(payload: bytes) -> list[dict]:
    """Latest row of the Treasury daily par-yield CSV → maturity points.

    Points use the maturity label as `date` (e.g. "3 Mo", "10 Yr") so the
    existing line chart plots the curve left-to-right by tenor.
    """
    reader = csv.DictReader(io.StringIO(payload.decode("utf-8")))
    rows = list(reader)
    if not rows:
        return []
    latest = rows[0]  # CSV is newest-first
    points = []
    for label, raw in latest.items():
        if label == "Date" or raw in (None, ""):
            continue
        try:
            points.append({"date": label, "value": float(raw)})
        except ValueError:
            continue
    return points


async def _yield_curve() -> list[dict]:
    year = datetime.now(timezone.utc).year
    points = _treasury_yield_curve(await _throttled_get(_TREASURY_CSV.format(year=year)))
    if not points:  # early January: this year's file may be empty
        points = _treasury_yield_curve(await _throttled_get(_TREASURY_CSV.format(year=year - 1)))
    return points


async def _fed_rate(kind: str, days: int) -> list[dict]:
    days = max(1, min(days, 250))
    url = f"{_NYFED}/{kind}/last/{days}.json"
    return _nyfed_series(await _throttled_get(url))


async def _fed_funds(days: int) -> list[dict]:
    return await _fed_rate("unsecured/effr", days)


async def _sofr(days: int) -> list[dict]:
    return await _fed_rate("secured/sofr", days)


# --- Phase 2: GROWTH (World Bank + IMF WEO; multi-country) -----------------


def _worldbank_series(payload: bytes) -> dict[str, list[dict]]:
    """World Bank `[meta, rows]` JSON → {ISO3: ascending [{date, value}]}."""
    parsed = json.loads(payload)
    rows = parsed[1] if isinstance(parsed, list) and len(parsed) > 1 else None
    series: dict[str, list[dict]] = {}
    for row in rows or []:
        code = row.get("countryiso3code")
        if not code or row.get("value") is None:
            continue
        series.setdefault(code, []).append({"date": str(row["date"]), "value": float(row["value"])})
    for points in series.values():
        points.sort(key=lambda point: point["date"])
    return series


def _imf_weo_series(payload: bytes, indicator: str, min_year: int) -> dict[str, list[dict]]:
    """IMF DataMapper `{values:{IND:{ISO3:{year:val}}}}` → {ISO3: [{date, value}]}.

    Keeps the forecast tail (years past today) but trims history to min_year so
    the chart stays readable.
    """
    by_country = json.loads(payload).get("values", {}).get(indicator, {})
    series: dict[str, list[dict]] = {}
    for code, year_values in by_country.items():
        points = [
            {"date": str(year), "value": float(value)}
            for year, value in year_values.items()
            if value is not None and int(year) >= min_year
        ]
        points.sort(key=lambda point: point["date"])
        if points:
            series[code] = points
    return series


async def _wb_indicator(indicator: str, countries: list[str], years: int) -> dict[str, list[dict]]:
    end = datetime.now(timezone.utc).year
    codes = ";".join(countries)
    url = (
        f"{_WORLDBANK}/country/{codes}/indicator/{indicator}"
        f"?format=json&date={end - years}:{end}&per_page=500"
    )
    return _worldbank_series(await _throttled_get(url))


async def _imf_weo(indicator: str, countries: list[str], years: int) -> dict[str, list[dict]]:
    min_year = datetime.now(timezone.utc).year - years
    url = f"{_IMF}/{indicator}/" + "/".join(countries)
    series = _imf_weo_series(await _throttled_get(url), indicator, min_year)
    # IMF ignores the country path and returns every country — keep only ours.
    return {code: series[code] for code in countries if code in series}


# --- Phase 3: INFLATION (World Bank CPI + ECB HICP; ECB is EUR-only) --------


def _ecb_sdmx_series(payload: bytes) -> list[dict]:
    """ECB SDMX-JSON (single series) → ascending [{date, value}].

    Observations are keyed by position; the TIME_PERIOD dimension supplies the
    label for each position.
    """
    parsed = json.loads(payload)
    datasets = parsed.get("dataSets") or []
    series = next(iter(datasets[0].get("series", {}).values()), None) if datasets else None
    if not series:
        return []
    observations = series.get("observations", {})
    time_dim = next(
        dim
        for dim in parsed["structure"]["dimensions"]["observation"]
        if dim["id"] == "TIME_PERIOD"
    )
    labels = [value["id"] for value in time_dim["values"]]
    points = [
        {"date": labels[int(index)], "value": float(obs[0])}
        for index, obs in observations.items()
        if obs and obs[0] is not None
    ]
    points.sort(key=lambda point: point["date"])
    return points


async def _ecb_hicp(years: int) -> list[dict]:
    # Headline HICP, annual rate of change, Eurozone (U2) — ECB is EUR-only.
    count = max(12, min(years * 12, 600))
    url = f"{_ECB}/ICP/M.U2.N.000000.4.ANR?format=jsondata&lastNObservations={count}"
    return _ecb_sdmx_series(await _throttled_get(url))


# --- Phase 4: FISCAL (Treasury Fiscal Data + IMF Fiscal Monitor) ------------


def _fiscaldata_points(payload: bytes, field: str) -> list[dict]:
    """Treasury Fiscal Data `{data:[...]}` → ascending [{date, value}] for one field."""
    rows = json.loads(payload).get("data", [])
    points = [
        {"date": row["record_date"], "value": float(row[field])}
        for row in rows
        if row.get(field) not in (None, "")
    ]
    points.sort(key=lambda point: point["date"])
    return points


def _fiscaldata_interest_expense(payload: bytes) -> list[dict]:
    """Sum `month_expense_amt` across instrument rows per record_date → monthly total."""
    rows = json.loads(payload).get("data", [])
    totals: dict[str, float] = {}
    for row in rows:
        amount = row.get("month_expense_amt")
        if amount in (None, ""):
            continue
        totals[row["record_date"]] = totals.get(row["record_date"], 0.0) + float(amount)
    return sorted(
        ({"date": date, "value": value} for date, value in totals.items()),
        key=lambda point: point["date"],
    )


async def _debt_to_penny(years: int) -> list[dict]:
    size = max(30, min(years * 252, 2000))  # ~business days
    url = (
        f"{_FISCALDATA}/v2/accounting/od/debt_to_penny"
        f"?fields=record_date,tot_pub_debt_out_amt&sort=-record_date&page%5Bsize%5D={size}"
    )
    return _fiscaldata_points(await _throttled_get(url), "tot_pub_debt_out_amt")


async def _interest_expense(years: int) -> list[dict]:
    size = max(180, min(years * 180, 3000))  # several instrument rows per month
    url = (
        f"{_FISCALDATA}/v2/accounting/od/interest_expense"
        f"?fields=record_date,month_expense_amt&sort=-record_date&page%5Bsize%5D={size}"
    )
    return _fiscaldata_interest_expense(await _throttled_get(url))


# --- Phase 5: TRADE (ECB exchange rates + WTO; WTO needs an optional key) ----


async def _ecb_exchange_rates(currencies: list[str], years: int) -> dict[str, list[dict]]:
    """EUR reference rates per currency → {CUR: [{date, value}]}. ECB is EUR-only."""
    count = max(30, min(years * 252, 2000))
    series: dict[str, list[dict]] = {}
    for currency in currencies:
        url = f"{_ECB}/EXR/D.{currency}.EUR.SP00.A?format=jsondata&lastNObservations={count}"
        points = _ecb_sdmx_series(await _throttled_get(url))
        if points:
            series[currency] = points
    return series


# WTO reporters use M49 numeric codes, not ISO-3. Map the country presets.
_WTO_M49 = {"USA": "840", "CHN": "156", "IND": "356", "JPN": "392", "DEU": "276", "GBR": "826"}


def _wto_points(rows: list[dict]) -> list[dict]:
    """WTO `Dataset` rows → ascending [{date, value}]. Value is in millions USD."""
    points = [
        {"date": str(row["Year"]), "value": float(row["Value"]) * 1_000_000}
        for row in rows
        if row.get("Year") and row.get("Value") is not None
    ]
    points.sort(key=lambda point: point["date"])
    return points


async def _wto_result(command: str, norm: dict) -> dict:
    """WTO merchandise trade. Needs a (free) API key; empty key => panel-hiding signal."""
    if command != "merch_trade":
        raise BadRequestError(f"Unknown economic source/command: wto/{command}")

    base = {"success": True, "source": "wto", "command": command, "valueType": "currency"}
    if not ECONOMIC_WTO_API_KEY:
        return {**base, "configured": False, "data": []}

    # Total merchandise exports (pc=TO total product, p=000 world partner).
    reporter = _WTO_M49.get((norm["countries"] or ["USA"])[0], "840")
    url = (
        "https://api.wto.org/timeseries/v1/data"
        f"?i=ITS_MTV_AX&r={reporter}&pc=TO&p=000&max={max(norm['years'], 5)}"
    )
    raw = await _throttled_get(
        url,
        {"Ocp-Apim-Subscription-Key": ECONOMIC_WTO_API_KEY, "Accept-Encoding": "identity"},
    )
    # WTO emits cp1252 bytes in metadata fields; decode leniently before JSON.
    rows = json.loads(raw.decode("utf-8", "replace")).get("Dataset", [])
    return {**base, "configured": True, "data": _wto_points(rows)}


# --- Phase 6: DEVELOPMENT (World Bank Health + UNESCO) -----------------------


def _unesco_series(payload: bytes) -> list[dict]:
    """UNESCO UIS `{records:[{geoUnit, year, value}]}` → ascending [{date, value}]."""
    records = json.loads(payload).get("records", [])
    points = [
        {"date": str(row["year"]), "value": float(row["value"])}
        for row in records
        if row.get("year") and row.get("value") is not None
    ]
    points.sort(key=lambda point: point["date"])
    return points


async def _unesco_indicator(
    indicator: str, countries: list[str], years: int
) -> dict[str, list[dict]]:
    end = datetime.now(timezone.utc).year
    series: dict[str, list[dict]] = {}
    for country in countries:
        url = (
            f"{_UNESCO}/data/indicators?indicator={indicator}"
            f"&geoUnit={country}&start={end - years}&end={end}"
        )
        points = _unesco_series(await _throttled_get(url))
        if points:
            series[country] = points
    return series


# --- Market gauges via yfinance (already a project dependency) ---------------
# Only macro gauges no official source above provides: trade-weighted USD index,
# volatility, and live commodities. Yields/rates/FX stay on the authoritative
# sources (Treasury/NY Fed/ECB), not yfinance.
_YF_GAUGES = {
    "DXY": "DX-Y.NYB",
    "VIX": "^VIX",
    "WTI": "CL=F",
    "Brent": "BZ=F",
    "Gold": "GC=F",
}


def _ohlcv_points(payload: dict) -> list[dict]:
    """yfinance OHLCV payload → ascending [{date, value}] from close prices."""
    return [
        {"date": str(row["date"])[:10], "value": float(row["close"])}
        for row in payload.get("points", [])
        if row.get("close") is not None
    ]


async def _yfinance_gauges() -> dict[str, list[dict]]:
    series: dict[str, list[dict]] = {}
    for label, symbol in _YF_GAUGES.items():
        payload = await asyncio.to_thread(fetch_ohlcv_range, symbol, "1Y", None)
        points = _ohlcv_points(payload)
        if points:
            series[label] = points
    return series


# (source, command) -> (valueType, builder(params)). Builder returns a list
# (single series -> response `data`) or a dict (per-country -> response `series`).
_COMMANDS = {
    ("federal_reserve", "federal_funds_rate"): ("percent", lambda p: _fed_funds(p["days"])),
    ("federal_reserve", "sofr_rate"): ("percent", lambda p: _sofr(p["days"])),
    ("federal_reserve", "yield_curve"): ("percent", lambda p: _yield_curve()),
    ("world_bank", "gdp"): (
        "currency",
        lambda p: _wb_indicator("NY.GDP.MKTP.CD", p["countries"], p["years"]),
    ),
    ("world_bank", "gdp_growth"): (
        "percent",
        lambda p: _wb_indicator("NY.GDP.MKTP.KD.ZG", p["countries"], p["years"]),
    ),
    ("imf", "gdp_forecast"): (
        "percent",
        lambda p: _imf_weo("NGDP_RPCH", p["countries"], p["years"]),
    ),
    ("world_bank", "cpi"): (
        "percent",
        lambda p: _wb_indicator("FP.CPI.TOTL.ZG", p["countries"], p["years"]),
    ),
    ("ecb", "hicp"): ("percent", lambda p: _ecb_hicp(p["years"])),
    ("fiscal_data", "debt_to_penny"): ("currency", lambda p: _debt_to_penny(p["years"])),
    ("fiscal_data", "interest_expense"): ("currency", lambda p: _interest_expense(p["years"])),
    ("imf", "fiscal_balance"): (
        "percent",
        lambda p: _imf_weo("GGXCNL_NGDP", p["countries"], p["years"]),
    ),
    ("ecb", "exchange_rates"): (
        "number",
        lambda p: _ecb_exchange_rates(p["currencies"], p["years"]),
    ),
    ("world_bank", "life_expectancy"): (
        "number",
        lambda p: _wb_indicator("SP.DYN.LE00.IN", p["countries"], p["years"]),
    ),
    ("world_bank", "gini"): (
        "number",
        lambda p: _wb_indicator("SI.POV.GINI", p["countries"], p["years"]),
    ),
    ("world_bank", "literacy"): (
        "percent",
        lambda p: _wb_indicator("SE.ADT.LITR.ZS", p["countries"], p["years"]),
    ),
    ("unesco", "rnd"): (
        "percent",
        lambda p: _unesco_indicator("EXPGDP.TOT", p["countries"], p["years"]),
    ),
    ("yfinance", "gauges"): ("number", lambda p: _yfinance_gauges()),
}


async def get_economic_data(source: str, command: str, params: dict) -> dict:
    """Generic Economic-tab fetch.

    Single-series commands return `data: [{date, value}]`; per-country commands
    return `series: {ISO3: [{date, value}]}` plus the resolved `countries` list.
    """
    entry = _COMMANDS.get((source, command))
    if entry is None and source != "wto":
        raise BadRequestError(f"Unknown economic source/command: {source}/{command}")

    norm = {
        "days": _coerce_days(params.get("days")),
        "countries": _parse_countries(params.get("countries")),
        "currencies": _parse_currencies(params.get("currencies")),
        "years": _coerce_years(params.get("years")),
    }
    cache_key = (
        f"econ:{source}:{command}:{norm['days']}:{','.join(norm['countries'])}:"
        f"{','.join(norm['currencies'])}:{norm['years']}"
    )
    cached = market_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        if source == "wto":
            result = await _wto_result(command, norm)
        else:
            value_type, builder = entry
            built = await builder(norm)
            result = {
                "success": True,
                "source": source,
                "command": command,
                "valueType": value_type,
            }
            if isinstance(built, dict):
                result["series"] = built
                result["countries"] = norm["countries"]
            else:
                result["data"] = built
    except BadRequestError:
        raise
    except Exception as exc:  # network / parse failures → typed 500
        raise PipelineExecutionError(f"Economic source '{source}' failed") from exc

    return market_cache.set(cache_key, result, _CACHE_TTL_SECONDS)


def _coerce_days(raw) -> int:
    try:
        return max(1, min(int(raw), 250))
    except (TypeError, ValueError):
        return 90


def _coerce_years(raw) -> int:
    try:
        return max(1, min(int(raw), 60))
    except (TypeError, ValueError):
        return 15


def _parse_countries(raw) -> list[str]:
    """Comma-separated ISO-3 codes → up to _MAX_COUNTRIES upper-cased, default USA."""
    if not raw:
        return ["USA"]
    codes = [code.strip().upper() for code in str(raw).split(",") if code.strip().isalpha()]
    return codes[:_MAX_COUNTRIES] or ["USA"]


def _parse_currencies(raw) -> list[str]:
    """Comma-separated ISO currency codes → up to _MAX_COUNTRIES, default USD,GBP,JPY."""
    if not raw:
        return ["USD", "GBP", "JPY"]
    codes = [code.strip().upper() for code in str(raw).split(",") if code.strip().isalpha()]
    return codes[:_MAX_COUNTRIES] or ["USD", "GBP", "JPY"]


def _demo() -> None:
    """ponytail self-check: parsers handle the real payload shapes. No network."""
    sofr = _nyfed_series(
        b'{"refRates":[{"effectiveDate":"2026-06-25","percentRate":3.64},'
        b'{"effectiveDate":"2026-06-24","percentRate":3.62}]}'
    )
    assert sofr == [
        {"date": "2026-06-24", "value": 3.62},
        {"date": "2026-06-25", "value": 3.64},
    ], sofr  # sorted ascending

    curve = _treasury_yield_curve(
        b'Date,"1 Mo","3 Mo","10 Yr"\n06/26/2026,3.70,3.83,4.38\n06/25/2026,3.70,3.84,4.40\n'
    )
    assert curve == [
        {"date": "1 Mo", "value": 3.70},
        {"date": "3 Mo", "value": 3.83},
        {"date": "10 Yr", "value": 4.38},
    ], curve  # newest row, Date column dropped

    assert _treasury_yield_curve(b'Date,"1 Mo"\n') == []
    assert _coerce_days("30") == 30 and _coerce_days(None) == 90 and _coerce_days("x") == 90

    wb = _worldbank_series(
        b'[{"page":1},[{"countryiso3code":"USA","date":"2024","value":2.5},'
        b'{"countryiso3code":"USA","date":"2023","value":2.9},'
        b'{"countryiso3code":"CHN","date":"2024","value":5.0},'
        b'{"countryiso3code":"USA","date":"2022","value":null}]]'
    )
    assert wb == {
        "USA": [{"date": "2023", "value": 2.9}, {"date": "2024", "value": 2.5}],
        "CHN": [{"date": "2024", "value": 5.0}],
    }, wb  # grouped per country, ascending, nulls dropped

    imf = _imf_weo_series(
        b'{"values":{"NGDP_RPCH":{"USA":{"2018":2.9,"2024":2.8,"2026":2.0}}}}',
        "NGDP_RPCH",
        2020,
    )
    assert imf == {"USA": [{"date": "2024", "value": 2.8}, {"date": "2026", "value": 2.0}]}, imf

    assert _parse_countries("usa, chn ,IND") == ["USA", "CHN", "IND"]
    assert _parse_countries(None) == ["USA"]
    assert _coerce_years(None) == 15 and _coerce_years("5") == 5

    ecb = _ecb_sdmx_series(
        b'{"dataSets":[{"series":{"0:0":{"observations":'
        b'{"1":[2.1],"0":[2.2],"2":[null]}}}}],'
        b'"structure":{"dimensions":{"observation":[{"id":"TIME_PERIOD","values":'
        b'[{"id":"2025-10"},{"id":"2025-11"},{"id":"2025-12"}]}]}}}'
    )
    assert ecb == [
        {"date": "2025-10", "value": 2.2},
        {"date": "2025-11", "value": 2.1},
    ], ecb  # positional obs mapped to time labels, null dropped, ascending
    assert _ecb_sdmx_series(b'{"dataSets":[]}') == []

    debt = _fiscaldata_points(
        b'{"data":[{"record_date":"2026-06-25","tot_pub_debt_out_amt":"39311022730162.44"},'
        b'{"record_date":"2026-06-24","tot_pub_debt_out_amt":"39320508743100.40"}]}',
        "tot_pub_debt_out_amt",
    )
    assert debt == [
        {"date": "2026-06-24", "value": 39320508743100.40},
        {"date": "2026-06-25", "value": 39311022730162.44},
    ], debt

    interest = _fiscaldata_interest_expense(
        b'{"data":[{"record_date":"2026-05-31","month_expense_amt":"40"},'
        b'{"record_date":"2026-05-31","month_expense_amt":"15"},'
        b'{"record_date":"2026-04-30","month_expense_amt":"30"},'
        b'{"record_date":"2026-04-30","month_expense_amt":""}]}'
    )
    assert interest == [
        {"date": "2026-04-30", "value": 30.0},
        {"date": "2026-05-31", "value": 55.0},
    ], interest  # summed per date, blank dropped, ascending

    assert _parse_currencies(None) == ["USD", "GBP", "JPY"]
    assert _parse_currencies("usd,gbp") == ["USD", "GBP"]

    # Unknown WTO command rejects before any network call.
    try:
        asyncio.run(_wto_result("bogus", {"countries": ["USA"], "years": 10}))
        raise AssertionError("expected BadRequestError")
    except BadRequestError:
        pass
    # WTO merch_trade parse logic (no network): row → {date, value}.
    assert _wto_points([{"Year": 2022, "Value": 1.5}, {"Year": None, "Value": 2}]) == [
        {"date": "2022", "value": 1_500_000.0}
    ]  # millions USD → raw USD, null year dropped

    unesco = _unesco_series(
        b'{"records":[{"geoUnit":"USA","year":2022,"value":3.48736},'
        b'{"geoUnit":"USA","year":2010,"value":2.71443},'
        b'{"geoUnit":"USA","year":2021,"value":null}]}'
    )
    assert unesco == [
        {"date": "2010", "value": 2.71443},
        {"date": "2022", "value": 3.48736},
    ], unesco  # ascending, null dropped

    gauges = _ohlcv_points(
        {
            "points": [
                {"date": "2026-06-25T00:00:00", "close": 105.3},
                {"date": "2026-06-26T00:00:00", "close": 105.8},
                {"date": "2026-06-27T00:00:00", "close": None},
            ]
        }
    )
    assert gauges == [
        {"date": "2026-06-25", "value": 105.3},
        {"date": "2026-06-26", "value": 105.8},
    ], gauges  # close prices, date trimmed, null dropped
    print("economic_service demo OK")


if __name__ == "__main__":
    _demo()
