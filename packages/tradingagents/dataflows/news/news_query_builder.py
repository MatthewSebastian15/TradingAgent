from __future__ import annotations

from typing import Any

ID_SUFFIXES = [
    "saham",
    "laba",
    "pendapatan",
    "dividen",
    "akuisisi",
    "merger",
    "rights issue",
    "kinerja keuangan",
    "laporan keuangan",
    "ekspansi",
]

US_SUFFIXES = [
    "stock",
    "earnings",
    "revenue",
    "guidance",
    "dividend",
    "acquisition",
    "merger",
    "financial results",
    "analyst rating",
    "SEC filing",
]


def _clean_values(values: list[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        key = text.casefold()
        if not text or key in seen:
            continue
        seen.add(key)
        result.append(text)
    return result


def build_ticker_news_queries(profile: dict[str, Any], *, max_queries: int = 12) -> list[str]:
    ticker = str(profile.get("ticker") or "").strip().upper()
    short_ticker = str(profile.get("short_ticker") or ticker.split(".", 1)[0]).strip().upper()
    country = str(profile.get("country") or "").lower()
    company_name = str(profile.get("company_name") or "").strip()
    aliases = [str(value).strip() for value in profile.get("aliases", []) if str(value).strip()]
    subsidiaries = [
        str(value).strip() for value in profile.get("subsidiaries", []) if str(value).strip()
    ]

    base_terms = _clean_values(
        [
            short_ticker,
            company_name,
            *aliases,
            *subsidiaries,
            ticker,
        ]
    )
    # ponytail: only id has a localized corpus; every other market uses English (US)
    # terms — English financial coverage is global. Add a per-market corpus when a
    # non-en market is actually onboarded (F7 tail).
    suffixes = ID_SUFFIXES if country == "id" or ticker.endswith(".JK") else US_SUFFIXES

    queries: list[str] = []
    for term in base_terms[:10]:
        quoted = f'"{term}"' if " " in term else term
        queries.append(f"{quoted} {suffixes[0]}")

    for suffix in suffixes:
        for term in base_terms[:8]:
            quoted = f'"{term}"' if " " in term else term
            queries.append(f"{quoted} {suffix}")

    return _clean_values(queries)[: max(1, int(max_queries))]
