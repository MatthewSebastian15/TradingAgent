"""Company-profile and share-ownership row/segment builders for report assembly.

Extracted from report_service.py. Depends only on formatters + normalization
helpers and the standard library.
"""

from __future__ import annotations

import math
from typing import Any

from tradingagents.utils.normalization import as_dict as _as_dict

from services.report.formatters import (
    _display,
    _display_dash,
    _format_market_cap,
    _format_number,
)


def _profile_row(label: str, value: Any) -> dict[str, str]:
    return {"label": label, "value": _display_dash(value)}


def _number_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in {float("inf"), float("-inf")}:
        return None
    return number


def _ownership_source_objects(profile: dict[str, Any]) -> list[dict[str, Any]]:
    sources = [
        profile,
        _as_dict(profile.get("shares_ownership")),
        _as_dict(profile.get("ownership")),
    ]
    return [source for source in sources if source]


def _first_profile_value(profile: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for source in _ownership_source_objects(profile):
        for key in keys:
            value = source.get(key)
            if value is not None and value != "":
                return value
    return None


def _ownership_ratio(value: Any) -> float | None:
    number = _number_or_none(value)
    if number is None:
        return None
    ratio = number / 100 if abs(number) > 1 else number
    return max(0.0, min(ratio, 1.0))


def _profile_shares_out(profile: dict[str, Any]) -> Any:
    return _first_profile_value(profile, ("shares_out", "shares_outstanding", "sharesOutstanding"))


def _profile_insider_pct(profile: dict[str, Any]) -> Any:
    return _first_profile_value(profile, ("insider_pct", "insider_percent", "heldPercentInsiders"))


def _profile_institution_pct(profile: dict[str, Any]) -> Any:
    return _first_profile_value(
        profile, ("institution_pct", "institution_percent", "heldPercentInstitutions")
    )


def _profile_public_pct(profile: dict[str, Any]) -> Any:
    return _first_profile_value(profile, ("public_pct", "public_percent", "publicOwnership"))


def _ownership_data(profile: dict[str, Any]) -> dict[str, float | None]:
    insider = _ownership_ratio(_profile_insider_pct(profile))
    institution = _ownership_ratio(_profile_institution_pct(profile))
    explicit_public = _ownership_ratio(_profile_public_pct(profile))
    public = explicit_public
    if public is None and insider is not None and institution is not None:
        public = max(0.0, 1.0 - insider - institution)
    return {"insider": insider, "institution": institution, "public": public}


def _format_ownership_percent(value: Any) -> str:
    ratio = _ownership_ratio(value)
    return "-" if ratio is None else f"{ratio * 100:,.2f}%"


def _shares_ownership_rows(result: dict[str, Any]) -> list[dict[str, str]]:
    profile = _as_dict(result.get("company_profile"))
    if not profile or not profile.get("available"):
        return []

    definitions = [
        ("Shares Outstanding", _profile_shares_out(profile), _format_number),
    ]
    return [_profile_row(label, formatter(value)) for label, value, formatter in definitions]


OWNERSHIP_SEGMENTS = (
    {"key": "insider", "label": "Insider Ownership", "color": "#f97316"},
    {"key": "institution", "label": "Institutional Ownership", "color": "#2563eb"},
    {"key": "public", "label": "Public/Other Ownership", "color": "#16a34a"},
)


def _svg_point(cx: float, cy: float, radius: float, degrees: float) -> tuple[float, float]:
    radians = math.radians(degrees)
    return cx + radius * math.cos(radians), cy + radius * math.sin(radians)


def _svg_number(value: float) -> str:
    return f"{value:.3f}".rstrip("0").rstrip(".")


def _ownership_slice_path(start_degrees: float, end_degrees: float) -> str:
    cx = 100.0
    cy = 100.0
    outer_radius = 88.0
    inner_radius = 48.0
    span = end_degrees - start_degrees

    if span >= 359.999:
        return " ".join(
            [
                "M 100 12",
                "A 88 88 0 1 1 100 188",
                "A 88 88 0 1 1 100 12",
                "M 100 52",
                "A 48 48 0 1 0 100 148",
                "A 48 48 0 1 0 100 52",
                "Z",
            ]
        )

    outer_start = _svg_point(cx, cy, outer_radius, start_degrees)
    outer_end = _svg_point(cx, cy, outer_radius, end_degrees)
    inner_end = _svg_point(cx, cy, inner_radius, end_degrees)
    inner_start = _svg_point(cx, cy, inner_radius, start_degrees)
    large_arc = 1 if span > 180 else 0

    return " ".join(
        [
            f"M {_svg_number(outer_start[0])} {_svg_number(outer_start[1])}",
            f"A 88 88 0 {large_arc} 1 {_svg_number(outer_end[0])} {_svg_number(outer_end[1])}",
            f"L {_svg_number(inner_end[0])} {_svg_number(inner_end[1])}",
            f"A 48 48 0 {large_arc} 0 {_svg_number(inner_start[0])} {_svg_number(inner_start[1])}",
            "Z",
        ]
    )


def _ownership_segments(result: dict[str, Any]) -> list[dict[str, Any]]:
    profile = _as_dict(result.get("company_profile"))
    if not profile or not profile.get("available"):
        return []

    ownership = _ownership_data(profile)
    raw_segments = [
        {**segment, "value": ownership.get(segment["key"])} for segment in OWNERSHIP_SEGMENTS
    ]
    if any(segment["value"] is None for segment in raw_segments):
        return []

    total = sum(float(segment["value"]) for segment in raw_segments)
    if not total:
        return []

    start_degrees = -90.0
    segments = []
    for segment in raw_segments:
        span = float(segment["value"]) / total * 360
        end_degrees = start_degrees + span
        segments.append(
            {
                **segment,
                "display": _format_ownership_percent(segment["value"]),
                "path": _ownership_slice_path(start_degrees, end_degrees) if span > 0 else "",
            }
        )
        start_degrees = end_degrees
    return segments


def _company_profile_rows(result: dict[str, Any]) -> list[dict[str, str]]:
    profile = _as_dict(result.get("company_profile"))
    if not profile or not profile.get("available"):
        return []

    currency = profile.get("currency")
    return [
        _profile_row("Company Name", profile.get("company_name") or profile.get("name")),
        _profile_row("Ticker", profile.get("ticker")),
        _profile_row("Currency", profile.get("currency")),
        _profile_row("Country", profile.get("country")),
        _profile_row("Sector", profile.get("sector")),
        _profile_row("Industry", profile.get("industry")),
        _profile_row("Market Cap", _format_market_cap(profile.get("market_cap"), currency)),
        _profile_row(
            "Employees",
            _format_number(profile.get("employee_count") or profile.get("full_time_employees")),
        ),
        _profile_row("Website", profile.get("website")),
    ]


def _company_profile_executives(result: dict[str, Any]) -> list[dict[str, str]]:
    profile = _as_dict(result.get("company_profile"))
    executives = profile.get("officers") or profile.get("executives") if profile else []
    if not isinstance(executives, list):
        return []

    rows = []
    for item in executives[:10]:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "name": _display(item.get("name")),
                "title": _display(item.get("title")),
            }
        )
    return rows
