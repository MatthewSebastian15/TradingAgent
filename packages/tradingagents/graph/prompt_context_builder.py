from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class PromptContext:
    symbol: str
    market: str
    field_sources: dict[str, str]
    data_quality: dict[str, Any]
    limitations: list[str]
    sector: str | None
    normalized_financials: list[dict]
    top_news: list[dict]
    budget_remaining: dict[str, int]
    warnings: list[str] = field(default_factory=list)


def build_prompt_context(analysis_state: dict) -> PromptContext:
    """
    Build compact, auditable context for the active LLM provider.
    Includes field quality, data limitations, normalized fundamentals,
    news context, and budget summary.
    """
    state = _as_dict(analysis_state)
    news_context = _as_dict(_get(state, "news_context", {}))
    data_quality = _compact_data_quality(state)
    limitations = _unique_strings(
        [
            *_as_list(_get(state, "limitations", [])),
            *_as_list(_get(state, "data_limitations", [])),
            *_as_list(news_context.get("limitations", [])),
        ],
        limit=12,
    )
    warnings = _unique_strings(
        [*_as_list(_get(state, "warnings", [])), *_as_list(data_quality.get("warnings", []))],
        limit=12,
    )
    return PromptContext(
        symbol=str(
            _get(state, "symbol", _get(state, "ticker", _get(state, "company_of_interest", "")))
            or ""
        ),
        market=str(_get(state, "market", "") or _infer_market(state)),
        field_sources=_compact_field_sources(_get(state, "field_sources", {})),
        data_quality=data_quality,
        limitations=limitations,
        sector=_sector(state),
        normalized_financials=_compact_financials(
            _get(state, "normalized_financials", _get(state, "normalized_period_rows", []))
        ),
        top_news=_compact_news(
            news_context.get("top_articles", news_context.get("prompt_articles", []))
        ),
        budget_remaining=_budget_remaining(
            _get(state, "vendor_budget", _get(state, "request_budget", {}))
        ),
        warnings=warnings,
    )


def _as_dict(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return dict(value)
    if hasattr(value, "model_dump"):
        try:
            dumped = value.model_dump()
            return dict(dumped) if isinstance(dumped, dict) else {}
        except Exception:
            return {}
    return {
        key: getattr(value, key)
        for key in dir(value)
        if not key.startswith("_") and not callable(getattr(value, key, None))
    }


def _get(state: dict[str, Any], key: str, default: Any = None) -> Any:
    if key in state:
        return state[key]
    return default


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def _unique_strings(items: list[Any], *, limit: int) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for item in items:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        output.append(text[:300])
        if len(output) >= limit:
            break
    return output


def _compact_field_sources(value: Any) -> dict[str, str]:
    sources: dict[str, str] = {}
    for key, item in _as_dict(value).items():
        if isinstance(item, dict):
            source = item.get("selected_source") or item.get("source") or item.get("provider")
        else:
            source = item
        if source is not None:
            sources[str(key)] = str(source)
    return sources


def _compact_data_quality(state: dict[str, Any]) -> dict[str, Any]:
    raw = _as_dict(_get(state, "data_quality", {}))
    field_quality = _as_dict(_get(state, "field_quality", raw.get("field_quality", {})))
    quality = {key: value for key, value in raw.items() if key != "field_quality"}
    quality.setdefault("quote_missing", _status_missing(raw.get("price_data") or raw.get("quote")))
    quality.setdefault(
        "historical_missing",
        _status_missing(
            raw.get("historical") or raw.get("historical_price") or raw.get("price_data")
        ),
    )
    quality.setdefault(
        "financials_missing", _status_missing(raw.get("fundamentals") or raw.get("financials"))
    )
    quality.setdefault("news_missing", _status_missing(raw.get("news")))
    quality.setdefault("blocking_fields_missing", _blocking_fields(field_quality))
    if field_quality:
        quality["field_quality"] = {
            str(key): _compact_quality_entry(value)
            for key, value in list(field_quality.items())[:60]
            if isinstance(value, dict)
        }
    return quality


def _status_missing(value: Any) -> bool:
    return str(value or "").strip().lower() in {
        "missing",
        "unavailable",
        "source_unavailable",
        "invalid_ticker",
    }


def _blocking_fields(field_quality: dict[str, Any]) -> list[str]:
    fields: list[str] = []
    for key, value in field_quality.items():
        if not isinstance(value, dict) or not value.get("blocking"):
            continue
        status = str(value.get("status") or "").lower()
        confidence = str(value.get("confidence") or "").lower()
        if (
            status in {"source_unavailable", "unavailable", "missing", "failed"}
            or confidence == "unavailable"
        ):
            fields.append(str(key))
    return fields


def _compact_quality_entry(value: dict[str, Any]) -> dict[str, Any]:
    keep = ("status", "confidence", "source", "as_of_date", "warnings", "blocking", "reason")
    compact = {
        key: value.get(key) for key in keep if key in value and value.get(key) not in (None, "", [])
    }
    if isinstance(compact.get("warnings"), list):
        compact["warnings"] = [str(item)[:200] for item in compact["warnings"][:3]]
    return compact


def _sector(state: dict[str, Any]) -> str | None:
    sector = _get(state, "sector")
    if sector:
        return str(sector)
    profile = _as_dict(_get(state, "company_profile", {}))
    return str(profile.get("sector") or profile.get("industry") or "") or None


def _compact_financials(value: Any) -> list[dict]:
    rows: list[dict] = []
    for item in _as_list(value)[:8]:
        if not isinstance(item, dict):
            continue
        rows.append({str(key): item[key] for key in list(item.keys())[:16]})
    return rows


def _compact_news(value: Any) -> list[dict]:
    articles: list[dict] = []
    for item in _as_list(value)[:8]:
        if not isinstance(item, dict):
            continue
        articles.append(
            {
                key: item.get(key)
                for key in (
                    "title",
                    "source",
                    "provider",
                    "published_at",
                    "summary",
                    "url",
                    "relevance_score",
                )
                if item.get(key) not in (None, "", [])
            }
        )
    return articles


def _budget_remaining(value: Any) -> dict[str, int]:
    budget = _as_dict(value)
    llm_calls = _as_dict(budget.get("llm_calls"))
    data_calls = _as_dict(budget.get("data_calls"))
    return {
        "llm_calls_left": _remaining(llm_calls),
        "data_calls_left": _remaining(data_calls),
    }


def _remaining(value: dict[str, Any]) -> int:
    try:
        maximum = int(value.get("max", value.get("limit", 0)) or 0)
        used = int(value.get("used", 0) or 0)
    except (TypeError, ValueError):
        return 0
    return max(0, maximum - used)


def _infer_market(state: dict[str, Any]) -> str:
    symbol = str(_get(state, "symbol", _get(state, "ticker", "")) or "").upper()
    if symbol.endswith(".JK"):
        return "ID"
    return "US" if symbol else ""
