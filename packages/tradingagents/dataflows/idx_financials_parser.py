"""IDX financial statement discovery, download and parser helpers.

The module is intentionally dependency-light. Live IDX integrations can feed it a
JSON index or direct report metadata, while CI can exercise the same contract with
local fixture files. PDF is treated as a last-resort source and returns an explicit
unavailable payload unless a structured sidecar is supplied, because pretending to
parse arbitrary financial-report PDFs reliably is how software becomes a haunted
house.
"""

from __future__ import annotations

import csv
import hashlib
import ipaddress
import json
import os
import re
import socket
import tempfile
import urllib.request
import zipfile
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET

from tradingagents.utils.normalization import as_dict as _as_dict

from .normalizers import normalize_financial_value
from .period_metadata import build_annual_period_metadata, infer_period_metadata

IDX_SOURCE_PRIORITY = [
    "idx_official_xbrl_or_excel",
    "idx_official_pdf",
    "yfinance",
    "alpha_vantage",
    "finnhub",
]

_REPORT_FORMAT_PRIORITY = {"xbrl": 0, "xml": 0, "xlsx": 1, "xls": 1, "csv": 2, "json": 2, "pdf": 9}
_FINANCIAL_FIELDS = {
    "revenue",
    "gross_profit",
    "ebitda",
    "net_profit",
    "cash",
    "debt",
    "equity",
    "assets",
    "operating_cash_flow",
    "capex",
    "free_cash_flow",
}
_FIELD_ALIASES = {
    "sales": "revenue",
    "pendapatan": "revenue",
    "pendapatan_usaha": "revenue",
    "laba_bruto": "gross_profit",
    "laba_bersih": "net_profit",
    "net_income": "net_profit",
    "profit_attributable_to_parent": "net_profit",
    "kas": "cash",
    "cash_and_equivalents": "cash",
    "total_debt": "debt",
    "liabilities_with_interest": "debt",
    "total_equity": "equity",
    "ekuitas": "equity",
    "total_assets": "assets",
    "aset": "assets",
    "cash_from_operations": "operating_cash_flow",
    "operating_cf": "operating_cash_flow",
    "capital_expenditure": "capex",
    "capex": "capex",
    "free_cash_flow": "free_cash_flow",
}

_IDX_ALLOWED_HOST = "idx.co.id"
_IDX_USER_AGENT = "TradingAgent-IDX-Parser/1.0"
_IDX_JSON_MAX_BYTES = 5 * 1024 * 1024
_IDX_REPORT_MAX_BYTES = 25 * 1024 * 1024
_IDX_DOWNLOAD_CHUNK_SIZE = 1024 * 1024


def _env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _ticker_key(ticker: str | None) -> str:
    return str(ticker or "").strip().upper()


def _ticker_variants(ticker: str | None) -> set[str]:
    key = _ticker_key(ticker)
    bare = key.removesuffix(".JK")
    return {key, bare, f"{bare}.JK"} if bare else {key}


def _safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("._") or "idx_report"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _unavailable(reason: str, **extra: Any) -> dict[str, Any]:
    return {
        "available": False,
        "status": "source_unavailable",
        "source": "idx_official",
        "reason": reason,
        **{key: value for key, value in extra.items() if value is not None},
    }


def _load_json_from_path(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _is_allowed_idx_host(hostname: str | None) -> bool:
    host = str(hostname or "").strip().lower().rstrip(".")
    return host == _IDX_ALLOWED_HOST or host.endswith(f".{_IDX_ALLOWED_HOST}")


def _is_public_ip(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _validate_https_idx_url(url: str) -> str:
    parsed = urlsplit(str(url))
    if parsed.scheme.lower() != "https":
        raise ValueError("IDX URL must use HTTPS")
    if not _is_allowed_idx_host(parsed.hostname):
        raise ValueError("IDX URL host is not allowed")

    host = parsed.hostname or ""
    port = parsed.port or 443
    resolved = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    addresses = {item[4][0] for item in resolved}
    if not addresses or any(not _is_public_ip(address) for address in addresses):
        raise ValueError("IDX URL resolved to a non-public address")
    return url


def _content_type(response: Any) -> str:
    return str(response.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()


def _content_length(response: Any) -> int | None:
    value = response.headers.get("Content-Length")
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _validate_content_length(response: Any, max_bytes: int) -> None:
    length = _content_length(response)
    if length is not None and length > max_bytes:
        raise ValueError("IDX response exceeds the allowed size")


def _read_limited(response: Any, max_bytes: int) -> bytes:
    payload = response.read(max_bytes + 1)
    if len(payload) > max_bytes:
        raise ValueError("IDX response exceeds the allowed size")
    return payload


def _copy_limited_response(response: Any, destination) -> None:
    total = 0
    while True:
        chunk = response.read(_IDX_DOWNLOAD_CHUNK_SIZE)
        if not chunk:
            return
        total += len(chunk)
        if total > _IDX_REPORT_MAX_BYTES:
            raise ValueError("IDX report exceeds the allowed size")
        destination.write(chunk)


def _validate_json_response(response: Any) -> None:
    _validate_content_length(response, _IDX_JSON_MAX_BYTES)
    content_type = _content_type(response)
    if content_type and "json" not in content_type and content_type not in {"text/plain"}:
        raise ValueError("IDX index response content type is not JSON")


def _validate_report_response(response: Any, source_url: str) -> None:
    _validate_content_length(response, _IDX_REPORT_MAX_BYTES)
    content_type = _content_type(response)
    if not content_type:
        return
    fmt = _report_format({"url": source_url})
    allowed_by_format = {
        "csv": ("csv", "text/plain"),
        "json": ("json", "text/plain"),
        "pdf": ("pdf",),
        "xbrl": ("xml", "text/plain"),
        "xml": ("xml", "text/plain"),
        "xls": ("excel", "spreadsheet", "octet-stream"),
        "xlsx": ("excel", "spreadsheet", "zip", "octet-stream"),
    }
    allowed = allowed_by_format.get(fmt, ("octet-stream",))
    if not any(part in content_type for part in allowed):
        raise ValueError("IDX report response content type is not allowed")


def _load_json_from_url(url: str, timeout: int = 20) -> Any:
    safe_url = _validate_https_idx_url(url)
    request = urllib.request.Request(safe_url, headers={"User-Agent": _IDX_USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - validated IDX HTTPS URL
        _validate_json_response(response)
        return json.loads(_read_limited(response, _IDX_JSON_MAX_BYTES).decode("utf-8"))


def _load_report_index(
    index_path: str | None = None, index_url: str | None = None
) -> list[dict[str, Any]]:
    """Load IDX report metadata from a local JSON file or configured URL.

    Expected shape is either a list of report objects or ``{"reports": [...]}``.
    This keeps live IDX discovery pluggable without forcing every test run to poke
    the network like a bored intern.
    """
    payload: Any = None
    path_value = (
        index_path or _env("IDX_REPORT_INDEX_PATH") or _env("IDX_FINANCIAL_REPORT_INDEX_PATH")
    )
    url_value = index_url or _env("IDX_REPORT_INDEX_URL") or _env("IDX_FINANCIAL_REPORT_INDEX_URL")

    if path_value:
        path = Path(path_value).expanduser()
        if path.exists():
            payload = _load_json_from_path(path)
    elif url_value:
        payload = _load_json_from_url(url_value)

    reports = (
        payload.get("reports") or payload.get("data") or []
        if isinstance(payload, dict)
        else payload or []
    )
    return [dict(item) for item in reports if isinstance(item, dict)]


def _period_year(report: dict[str, Any]) -> int | None:
    candidates = [
        report.get("year"),
        report.get("fiscal_year"),
        report.get("period"),
        report.get("period_label"),
        report.get("period_end"),
    ]
    for value in candidates:
        match = re.search(r"(20\d{2}|19\d{2})", str(value or ""))
        if match:
            return int(match.group(1))
    return None


def _report_format(report: dict[str, Any]) -> str:
    explicit = str(report.get("format") or report.get("file_format") or "").lower().strip(".")
    if explicit:
        return explicit
    url = str(
        report.get("url") or report.get("source_url") or report.get("local_path") or ""
    ).lower()
    suffix = Path(url.split("?", 1)[0]).suffix.lower().strip(".")
    return suffix or "json"


def find_idx_financial_reports(
    ticker: str,
    year: int | None = None,
    period: str = "annual",
    *,
    index_path: str | None = None,
    index_url: str | None = None,
) -> list[dict[str, Any]]:
    """Find official IDX financial report metadata for a ticker.

    The function consumes an index supplied by ``IDX_REPORT_INDEX_PATH``
    or ``IDX_REPORT_INDEX_URL``. A future IDX website scraper can simply
    emit the same metadata shape and reuse the parser/download code.
    """
    variants = _ticker_variants(ticker)
    reports = []
    for report in _load_report_index(index_path=index_path, index_url=index_url):
        report_ticker = str(
            report.get("ticker") or report.get("code") or report.get("symbol") or ""
        ).upper()
        if report_ticker and report_ticker not in variants:
            continue
        if year is not None and _period_year(report) != int(year):
            continue
        requested_period = str(period or "annual").lower()
        report_period = str(
            report.get("statement_type")
            or report.get("period_type")
            or report.get("period_kind")
            or ""
        ).lower()
        if (
            requested_period in {"annual", "quarterly"}
            and report_period
            and requested_period.rstrip("ly") not in report_period
        ):
            continue
        document_type = str(
            report.get("document_type") or report.get("type") or "financial_statement"
        ).lower()
        if (
            "financial" not in document_type
            and "laporan" not in document_type
            and "annual" not in document_type
        ):
            continue
        fmt = _report_format(report)
        enriched = {
            "ticker": _ticker_key(ticker),
            "source": "idx_official",
            "format": fmt,
            "document_type": document_type,
            **report,
        }
        reports.append(enriched)

    def sort_key(item: dict[str, Any]) -> tuple[int, str, str]:
        fmt = _report_format(item)
        return (
            _REPORT_FORMAT_PRIORITY.get(fmt, 5),
            str(item.get("period_end") or item.get("period") or item.get("period_label") or ""),
            str(item.get("reported_date") or item.get("published_at") or ""),
        )

    return sorted(reports, key=sort_key, reverse=False)


def download_idx_report(
    report_meta: dict[str, Any], cache_dir: str | None = None
) -> dict[str, Any]:
    """Download or materialize an IDX report and return local path metadata."""
    meta = dict(report_meta or {})
    local_path = meta.get("local_path") or meta.get("path")
    source_url = meta.get("url") or meta.get("source_url")

    if local_path:
        path = Path(str(local_path)).expanduser()
        if not path.exists():
            return _unavailable(
                "IDX report local_path does not exist", source_url=source_url, local_path=str(path)
            )
        return {
            "available": True,
            "status": "available",
            "source": "idx_official",
            "source_url": source_url or path.as_uri(),
            "local_path": str(path),
            "checksum": _sha256(path),
            "downloaded_at": _now_iso(),
            "format": _report_format({**meta, "local_path": str(path)}),
        }

    if not source_url:
        return _unavailable("IDX report metadata has no url or local_path")

    if str(source_url).startswith("file://"):
        path = Path(str(source_url).removeprefix("file://"))
        if not path.exists():
            return _unavailable("IDX report file URL does not exist", source_url=source_url)
        return {
            "available": True,
            "status": "available",
            "source": "idx_official",
            "source_url": source_url,
            "local_path": str(path),
            "checksum": _sha256(path),
            "downloaded_at": _now_iso(),
            "format": _report_format({**meta, "local_path": str(path)}),
        }

    cache_root = Path(
        cache_dir
        or _env("IDX_REPORT_CACHE_DIR")
        or _env("IDX_FINANCIAL_REPORT_CACHE_DIR")
        or ".cache/idx_reports"
    )
    cache_root.mkdir(parents=True, exist_ok=True)
    filename = _safe_filename(
        Path(str(source_url).split("?", 1)[0]).name
        or hashlib.sha1(str(source_url).encode()).hexdigest()
    )
    destination = cache_root / filename
    tmp_path: Path | None = None
    try:
        safe_url = _validate_https_idx_url(str(source_url))
        request = urllib.request.Request(safe_url, headers={"User-Agent": _IDX_USER_AGENT})
        with (
            urllib.request.urlopen(request, timeout=30) as response,  # noqa: S310 - validated IDX HTTPS URL
            tempfile.NamedTemporaryFile(delete=False, dir=cache_root) as tmp,
        ):
            _validate_report_response(response, safe_url)
            _copy_limited_response(response, tmp)
            tmp_path = Path(tmp.name)
        tmp_path.replace(destination)
    except Exception as exc:  # pragma: no cover - network disabled in CI; contract remains explicit
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)
        return _unavailable(f"IDX report download failed: {exc}", source_url=source_url)

    return {
        "available": True,
        "status": "available",
        "source": "idx_official",
        "source_url": source_url,
        "local_path": str(destination),
        "checksum": _sha256(destination),
        "downloaded_at": _now_iso(),
        "format": _report_format({**meta, "local_path": str(destination)}),
    }


def normalize_idx_statement_row(
    row: dict[str, Any], *, currency: str = "IDR", unit: str = "raw"
) -> dict[str, Any]:
    normalized = dict(row or {})
    for field in list(normalized.keys()):
        canonical = _FIELD_ALIASES.get(str(field).lower(), field)
        if canonical != field:
            normalized[canonical] = normalized.pop(field)
    for field in _FINANCIAL_FIELDS:
        if field in normalized:
            normalized[field] = normalize_financial_value(normalized[field], unit, currency)[
                "normalized_value"
            ]
    normalized.setdefault("currency", currency.upper())
    normalized.setdefault("unit", "raw")
    normalized.setdefault("source", "idx_official")
    if "period" not in normalized and (
        normalized.get("period_label") or normalized.get("period_end")
    ):
        with suppress(ValueError):
            normalized["period"] = infer_period_metadata(
                str(normalized.get("period_label") or normalized.get("period_end")),
                period_type_hint=normalized.get("period_type"),
                period_end=normalized.get("period_end"),
                reported_date=normalized.get("reported_date"),
                currency=currency,
                unit="raw",
                is_restated=bool(normalized.get("is_restated")),
            )
    return normalized


def _period_from_payload(
    payload: dict[str, Any], currency: str, unit: str
) -> dict[str, Any] | None:
    existing = payload.get("period")
    if isinstance(existing, dict):
        return existing
    label = str(
        payload.get("period") or payload.get("period_label") or payload.get("period_end") or ""
    )
    try:
        return infer_period_metadata(
            label,
            period_type_hint=payload.get("period_type"),
            period_end=payload.get("period_end"),
            reported_date=payload.get("reported_date"),
            currency=currency,
            unit="raw",
            is_restated=bool(payload.get("is_restated")),
        )
    except ValueError:
        year = _period_year(payload)
        if year is None:
            return None
        return build_annual_period_metadata(
            year, reported_date=payload.get("reported_date"), currency=currency, unit=unit
        )


def parse_idx_financial_statement(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalize an already-structured IDX statement payload."""
    if not payload:
        return _unavailable("No IDX financial statement payload was provided.")
    currency = str(payload.get("currency") or "IDR").upper()
    unit = str(payload.get("unit") or "raw")
    period = _period_from_payload(payload, currency, unit)
    result = {
        **payload,
        "available": True,
        "status": "available",
        "source": "idx_official",
        "income_statement": normalize_idx_statement_row(
            payload.get("income_statement") or {}, currency=currency, unit=unit
        ),
        "balance_sheet": normalize_idx_statement_row(
            payload.get("balance_sheet") or {}, currency=currency, unit=unit
        ),
        "cashflow": normalize_idx_statement_row(
            payload.get("cashflow") or {}, currency=currency, unit=unit
        ),
    }
    if period is not None:
        result["period"] = period
        result["period_label"] = period.get("period_label")
        result["period_end"] = result.get("period_end") or period.get("period_end")
    return result


def _parse_json_report(path: Path) -> dict[str, Any]:
    payload = _load_json_from_path(path)
    if (
        isinstance(payload, dict)
        and "statement" in payload
        and isinstance(payload["statement"], dict)
    ):
        payload = payload["statement"]
    if not isinstance(payload, dict):
        return _unavailable(
            "IDX JSON report did not contain an object payload", local_path=str(path)
        )
    return parse_idx_financial_statement(payload)


def _canonical_field(value: str) -> str | None:
    key = re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")
    return _FIELD_ALIASES.get(key, key if key in _FINANCIAL_FIELDS else None)


def _section_for_field(field: str) -> str:
    if field in {"revenue", "gross_profit", "ebitda", "net_profit"}:
        return "income_statement"
    if field in {"cash", "debt", "equity", "assets"}:
        return "balance_sheet"
    return "cashflow"


def _parse_csv_report(path: Path, report_meta: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ticker": report_meta.get("ticker"),
        "period": report_meta.get("period"),
        "period_label": report_meta.get("period_label") or report_meta.get("period"),
        "period_end": report_meta.get("period_end"),
        "reported_date": report_meta.get("reported_date"),
        "currency": report_meta.get("currency") or "IDR",
        "unit": report_meta.get("unit") or "raw",
        "income_statement": {},
        "balance_sheet": {},
        "cashflow": {},
    }
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            field = _canonical_field(
                row.get("field") or row.get("metric") or row.get("account") or ""
            )
            if not field:
                continue
            section = (
                str(row.get("statement") or row.get("section") or _section_for_field(field))
                .strip()
                .lower()
            )
            if section not in {"income_statement", "balance_sheet", "cashflow"}:
                section = _section_for_field(field)
            payload[section][field] = row.get("value") or row.get("amount")
            if row.get("currency"):
                payload["currency"] = row["currency"]
            if row.get("unit"):
                payload["unit"] = row["unit"]
    return parse_idx_financial_statement(payload)


def _xlsx_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        xml = zf.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(xml)
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    values: list[str] = []
    for item in root.findall("x:si", ns):
        text_parts = [node.text or "" for node in item.findall(".//x:t", ns)]
        values.append("".join(text_parts))
    return values


def _xlsx_rows(path: Path) -> list[list[str]]:
    rows: list[list[str]] = []
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as zf:
        shared = _xlsx_shared_strings(zf)
        sheets = sorted(
            name for name in zf.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml", name)
        )
        for sheet in sheets:
            root = ET.fromstring(zf.read(sheet))
            for row_node in root.findall(".//x:row", ns):
                cells: list[str] = []
                for cell in row_node.findall("x:c", ns):
                    value_node = cell.find("x:v", ns)
                    value = value_node.text if value_node is not None else ""
                    if cell.attrib.get("t") == "s":
                        try:
                            value = shared[int(value)]
                        except (ValueError, IndexError):
                            value = ""
                    cells.append(value or "")
                if any(str(cell).strip() for cell in cells):
                    rows.append(cells)
    return rows


def _parse_xlsx_report(path: Path, report_meta: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ticker": report_meta.get("ticker"),
        "period": report_meta.get("period"),
        "period_label": report_meta.get("period_label") or report_meta.get("period"),
        "period_end": report_meta.get("period_end"),
        "reported_date": report_meta.get("reported_date"),
        "currency": report_meta.get("currency") or "IDR",
        "unit": report_meta.get("unit") or "raw",
        "income_statement": {},
        "balance_sheet": {},
        "cashflow": {},
    }
    for row in _xlsx_rows(path):
        if len(row) < 2:
            continue
        field = _canonical_field(row[0])
        if not field:
            continue
        value = row[1]
        payload[_section_for_field(field)][field] = value
    return parse_idx_financial_statement(payload)


def _parse_xbrl_report(path: Path, report_meta: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ticker": report_meta.get("ticker"),
        "period": report_meta.get("period"),
        "period_label": report_meta.get("period_label") or report_meta.get("period"),
        "period_end": report_meta.get("period_end"),
        "reported_date": report_meta.get("reported_date"),
        "currency": report_meta.get("currency") or "IDR",
        "unit": report_meta.get("unit") or "raw",
        "income_statement": {},
        "balance_sheet": {},
        "cashflow": {},
    }
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as exc:
        return _unavailable(
            f"IDX XBRL/XML parser failed: {exc}",
            local_path=str(path),
            format=_report_format(report_meta),
        )
    for node in root.iter():
        tag = node.tag.rsplit("}", 1)[-1] if "}" in node.tag else node.tag
        field = _canonical_field(tag)
        if not field or node.text is None:
            continue
        payload[_section_for_field(field)][field] = node.text
    if not any(payload[section] for section in ("income_statement", "balance_sheet", "cashflow")):
        return _unavailable(
            "IDX XBRL/XML report did not contain mapped financial fields",
            local_path=str(path),
            format=_report_format(report_meta),
        )
    return parse_idx_financial_statement(payload)


def parse_idx_report_file(
    path: str | Path, report_meta: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Parse JSON/CSV/basic-XLSX IDX financial report files into normalized payloads."""
    report_meta = dict(report_meta or {})
    path_obj = Path(path)
    if not path_obj.exists():
        return _unavailable("IDX report file does not exist", local_path=str(path_obj))
    fmt = _report_format({**report_meta, "local_path": str(path_obj)})
    if fmt in {"xbrl", "xml"}:
        result = _parse_xbrl_report(path_obj, report_meta)
    elif fmt == "json":
        result = _parse_json_report(path_obj)
    elif fmt == "csv":
        result = _parse_csv_report(path_obj, report_meta)
    elif fmt in {"xlsx", "xls"}:
        result = _parse_xlsx_report(path_obj, report_meta)
    elif fmt in {"pdf"}:
        return _unavailable(
            "IDX PDF parser is not enabled; use XBRL/Excel/JSON/CSV or fallback vendors",
            local_path=str(path_obj),
            format=fmt,
        )
    else:
        return _unavailable(
            f"Unsupported IDX report format: {fmt}", local_path=str(path_obj), format=fmt
        )
    if result.get("available"):
        result.update(
            {
                "source_url": report_meta.get("url") or report_meta.get("source_url"),
                "checksum": report_meta.get("checksum") or _sha256(path_obj),
                "local_path": str(path_obj),
                "format": fmt,
            }
        )
    return result


def build_idx_financial_statement_from_report(
    report_meta: dict[str, Any], cache_dir: str | None = None
) -> dict[str, Any]:
    """Download and parse a single IDX financial report metadata item."""
    downloaded = download_idx_report(report_meta, cache_dir=cache_dir)
    if not downloaded.get("available"):
        return downloaded
    parse_meta = {**report_meta, **downloaded}
    parsed = parse_idx_report_file(downloaded["local_path"], parse_meta)
    if not parsed.get("available"):
        return parsed
    return {
        **parsed,
        "status": "available",
        "source": "idx_official",
        "source_url": downloaded.get("source_url") or parsed.get("source_url"),
        "checksum": downloaded.get("checksum") or parsed.get("checksum"),
        "downloaded_at": downloaded.get("downloaded_at"),
        "metadata": {
            **_as_dict(parsed.get("metadata")),
            "source_url": downloaded.get("source_url"),
            "checksum": downloaded.get("checksum"),
            "downloaded_at": downloaded.get("downloaded_at"),
            "report_format": downloaded.get("format"),
        },
    }


# Backward/contract alias used by implementation docs and tests.
parse_idx_financial_report = parse_idx_report_file
