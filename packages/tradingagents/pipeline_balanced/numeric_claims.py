from __future__ import annotations

import re
from typing import Any

_DATE_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}(?:[T ][\d:.+\-Z]*)?\b")
_TIME_RE = re.compile(r"\b\d{1,2}:\d{2}(?::\d{2})?\b")
_RATIO_RE = re.compile(r"\b\d+\s?:\s?\d+\b")
_SCALES = {
    "k": 1e3,
    "thousand": 1e3,
    "ribu": 1e3,
    "m": 1e6,
    "mn": 1e6,
    "million": 1e6,
    "juta": 1e6,
    "b": 1e9,
    "bn": 1e9,
    "billion": 1e9,
    "miliar": 1e9,
    "milyar": 1e9,
    "t": 1e12,
    "trillion": 1e12,
    "triliun": 1e12,
}
_TOKEN_RE = re.compile(
    r"(?<![\w/])([-+]?\d[\d.,]*)(\s?%|\s(?:"
    + "|".join(sorted(_SCALES, key=len, reverse=True))
    + r")\b)?",
    re.IGNORECASE,
)


def _readings(body: str) -> list[tuple[float, int]]:
    readings: list[tuple[float, int]] = []
    for thousands, decimal in ((",", "."), (".", ",")):
        text = body.replace(thousands, "")
        if text.count(decimal) > 1:
            continue
        decimals = len(text.split(decimal)[1]) if decimal in text else 0
        try:
            readings.append((float(text.replace(decimal, ".")), decimals))
        except ValueError:
            continue
    return readings


def unverified_numbers(text: str, facts: dict[str, Any]) -> list[str]:
    values = [
        float(value)
        for value in facts.values()
        if isinstance(value, (int, float)) and not isinstance(value, bool)
    ]
    cleaned = _RATIO_RE.sub(" ", _TIME_RE.sub(" ", _DATE_RE.sub(" ", text or "")))
    unmatched: list[str] = []
    for match in _TOKEN_RE.finditer(cleaned):
        raw, suffix = match.group(1).rstrip(".,"), (match.group(2) or "").strip().lower()
        if not raw or not raw[-1].isdigit():
            continue
        body = raw.lstrip("+-")
        plain_int = suffix == "" and body.isdigit()
        if plain_int and (int(body) <= 31 or (len(body) == 4 and 1990 <= int(body) <= 2100)):
            continue
        scale = _SCALES.get(suffix, 1.0)
        sign = -1.0 if raw.startswith("-") else 1.0
        matched = any(
            abs(sign * value * scale - fact) <= max(0.5 * 10**-decimals * scale, abs(fact) * 0.001)
            for value, decimals in _readings(body)
            for fact in values
        )
        if not matched:
            unmatched.append(f"{raw}{'%' if suffix == '%' else (' ' + suffix if suffix else '')}")
    return list(dict.fromkeys(unmatched))
