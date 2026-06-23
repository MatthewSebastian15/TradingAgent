from __future__ import annotations

import logging
import re
from typing import Any

from config import RAG_CHATBOT_MAX_CONTEXT_ANALYSES, RAG_CHATBOT_MAX_CONTEXT_ARTICLES
from services.rag_pool import (
    get_analysis_detail,
    get_analysis_pool,
    get_market_pool,
    get_news_pool,
)

logger = logging.getLogger(__name__)

# ─── Scope guardrail ──────────────────────────────────────────────────────────

_IN_SCOPE = [
    re.compile(
        r"\b(news|berita|headline|artikel|breaking|latest|sentiment|impact|provider)\b", re.I
    ),
    re.compile(
        r"\b(market|harga|price|volume|change|gainer|loser|mover|index|crypto|etf|forex|saham)\b",
        re.I,
    ),
    re.compile(
        r"\b(analisis|analysis|ai.agent|recommendation|rekomendasi|confidence|risk|entry|thesis|hold|buy|sell|wait|history|analisa)\b",
        re.I,
    ),
    re.compile(r"\b(stop.loss|take.profit|allocation|ticker|stock|aset|asset|watchlist)\b", re.I),
]

_OUT_OF_SCOPE = [
    re.compile(r"\b(resep|recipe|masak|makanan|kuliner)\b", re.I),
    re.compile(r"\b(cuaca|weather|hujan|forecast)\b", re.I),
    re.compile(r"\b(wisata|travel|liburan|tourism|hotel)\b", re.I),
    re.compile(r"\b(puisi|poem|cerpen|fiksi|fiction|dongeng)\b", re.I),
    re.compile(r"\b(hukum|legal|pengacara|lawyer)\b", re.I),
    re.compile(r"\b(medis|dokter|obat|penyakit|medical|doctor)\b", re.I),
    re.compile(r"\b(agama|religion|ibadah|spiritual)\b", re.I),
    re.compile(r"\b(tutorial coding|(?:mem)?buat website|programming tutorial)\b", re.I),
]


def check_scope(message: str) -> bool:
    """True if message is within allowed scope (News/Market/Analysis/Watchlist)."""
    text = str(message or "").strip()
    has_in = any(p.search(text) for p in _IN_SCOPE)
    has_out = any(p.search(text) for p in _OUT_OF_SCOPE)
    if has_out and not has_in:
        return False
    return True


# ─── Intent detection ─────────────────────────────────────────────────────────

_NEWS_RE = re.compile(
    r"\b(news|berita|headline|artikel|breaking|latest|sentiment|impact|provider|published|kategori)\b",
    re.I,
)
_MARKET_RE = re.compile(
    r"\b(market|harga|price|volume|change|percent|gainer|loser|mover|index|crypto|etf|forex|quote|ohlcv|saham|naik|turun)\b",
    re.I,
)
_ANALYSIS_RE = re.compile(
    r"\b(analisis|analysis|ai.agent|recommendation|rekomendasi|confidence|risk|entry|thesis|hold|buy|sell|wait|history|analisa|stop.loss|take.profit|allocation|fundamental|profile|chart|technical)\b",
    re.I,
)
_WATCHLIST_RE = re.compile(
    r"\b(watchlist|watch.?list|daftar pantau|porto|portofolio|grup.?saham)\b",
    re.I,
)

_FILTER_MAP: dict[str, list[str]] = {
    "news": ["news"],
    "market": ["market"],
    "analysis": ["analysis"],
    "watchlist": ["watchlist"],
}


def detect_intent(message: str, context_filter: str) -> list[str]:
    """Return list of pool names to query."""
    if context_filter in _FILTER_MAP:
        return _FILTER_MAP[context_filter]

    text = str(message or "")
    pools: list[str] = []
    if _NEWS_RE.search(text):
        pools.append("news")
    if _MARKET_RE.search(text):
        pools.append("market")
    if _ANALYSIS_RE.search(text):
        pools.append("analysis")
    if _WATCHLIST_RE.search(text):
        pools.append("watchlist")
    return pools or ["news", "market", "analysis"]


# ─── Context formatters ───────────────────────────────────────────────────────


def _extract_keywords(message: str) -> list[str]:
    stopwords = {"the", "and", "for", "apa", "yang", "dari", "ini", "itu", "ada", "dengan", "atau"}
    return [w for w in re.findall(r"\b[a-zA-Z]{3,}\b", message.lower()) if w not in stopwords]


def _score_article(article: dict[str, Any], keywords: list[str]) -> int:
    text = " ".join(
        str(article.get(f, "") or "")
        for f in ("title", "description", "summary", "category", "source")
    ).lower()
    score = sum(kw in text for kw in keywords)
    if article.get("impact") == "high":
        score += 2
    if float(article.get("relevance_score") or 0) >= 70:
        score += 1
    return score


def _format_news_context(articles: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    lines, sources = [], []
    for a in articles:
        title = a.get("title", "")
        desc = a.get("description") or a.get("summary", "")
        lines.append(
            f"[NEWS] {title} | {a.get('source', '')} | {a.get('category', '')} | {a.get('published_at', '')} | {desc}"  # noqa: E501
        )
        sources.append(
            {
                "type": "news",
                "id": a.get("id", ""),
                "title": title,
                "source": a.get("source", ""),
                "category": a.get("category", ""),
                "published_at": a.get("published_at", ""),
                "url": a.get("url", ""),
            }
        )
    return "\n".join(lines), sources


def _format_market_context(market: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    lines, sources = [], []
    for item in (market.get("overview") or {}).get("items") or []:
        sym = item.get("symbol", "")
        lines.append(
            f"[MARKET:OVERVIEW] {sym} | {item.get('label', '')} | last={item.get('last', '')} | "
            f"change={item.get('change', '')} | change_percent={item.get('change_percent', '')}% | "
            f"currency={item.get('currency', '')} | status={item.get('status', '')} | updated_at={item.get('updated_at', '')}"  # noqa: E501
        )
        sources.append(
            {
                "type": "market",
                "symbol": sym,
                "label": item.get("label", ""),
                "updated_at": item.get("updated_at", ""),
            }
        )

    movers = market.get("movers") or {}
    updated_at = movers.get("updated_at", "")
    for side in ("gainers", "losers"):
        for m in movers.get(side) or []:
            sym = m.get("symbol", "")
            lines.append(
                f"[MARKET:{side.upper()}] {sym} | {m.get('name', '')} | last={m.get('last', '')} | "
                f"change_percent={m.get('change_percent', '')}% | volume={m.get('volume', '')} | updated_at={updated_at}"  # noqa: E501
            )
            sources.append(
                {
                    "type": "market",
                    "symbol": sym,
                    "label": m.get("name", ""),
                    "updated_at": updated_at,
                }
            )

    return "\n".join(lines), sources


def _format_analysis_context(analyses: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    lines, sources = [], []
    for a in analyses:
        ticker = a.get("ticker", "")
        decision = a.get("display_signal") or a.get("decision") or a.get("recommendation", "")
        overview = a.get("analysis_overview") or {}
        reasons = overview.get("key_reasons") or a.get("key_reasons") or []
        reasons_str = "; ".join(
            str(r) for r in (reasons[:3] if isinstance(reasons, list) else [reasons])
        )
        risk = (overview.get("risk_summary") or {}).get("short_reason") or a.get(
            "mini_risk_summary", ""
        )
        line = (
            f"[ANALYSIS] {ticker} | {a.get('trade_date', '')} | decision={decision} | "
            f"confidence={a.get('confidence_score', '')} | allocation={a.get('suggested_allocation_percent', '')}% | "  # noqa: E501
            f"entry={a.get('entry_price', '')} | stop_loss={a.get('stop_loss', '')} | take_profit={a.get('take_profit', '')} | "  # noqa: E501
            f"created={a.get('analysis_created_at') or a.get('created_at', '')}\n"
            f"  summary: {overview.get('executive_summary') or a.get('executive_summary', '')}\n"
            f"  thesis: {overview.get('investment_thesis') or a.get('investment_thesis', '')}\n"
            f"  reasons: {reasons_str}\n"
            f"  risk: {risk}"
        )
        lines.append(line)
        sources.append(
            {
                "type": "analysis",
                "ticker": ticker,
                "trade_date": a.get("trade_date", ""),
                "decision": decision,
                "request_id": a.get("request_id", ""),
                "created_at": a.get("analysis_created_at") or a.get("created_at", ""),
            }
        )
    return "\n".join(lines), sources


def _format_watchlist_context(
    watchlist_context: dict[str, Any],
) -> tuple[str, list[dict[str, Any]]]:
    """Format frontend-supplied watchlist data (groups + quotes) into context string."""
    lines, sources = [], []
    groups = watchlist_context.get("groups") or []
    quotes_map: dict[str, dict] = {
        q["sym"]: q for q in (watchlist_context.get("quotes") or []) if q.get("sym")
    }
    fetched_at = watchlist_context.get("fetched_at", "")

    for group in groups:
        group_name = group.get("name", "")
        items = group.get("items") or []
        for item in items:
            sym = item.get("symbol", "")
            name = item.get("name", sym)
            exchange = item.get("exchange", "")
            market = item.get("market", "")
            q = quotes_map.get(sym, {})
            price = q.get("price", "N/A")
            chg = q.get("chg", "N/A")
            direction = "UP" if q.get("pos") else "DOWN" if q.get("pos") is False else "N/A"
            error = q.get("error", "")
            line = (
                f"[WATCHLIST] group={group_name} | {sym} | {name} | exchange={exchange} | market={market} | "  # noqa: E501
                f"price={price} | change={chg} | direction={direction}"
            )
            if error:
                line += f" | error={error}"
            lines.append(line)
            sources.append(
                {
                    "type": "watchlist",
                    "symbol": sym,
                    "name": name,
                    "group": group_name,
                    "price": price,
                    "fetched_at": fetched_at,
                }
            )

    return "\n".join(lines), sources


# ─── Main entry point ─────────────────────────────────────────────────────────


async def build_context(
    message: str,
    intent: list[str],
    watchlist_context: dict[str, Any] | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Retrieve and format context from the relevant pools."""
    keywords = _extract_keywords(message)
    context_parts: list[str] = []
    all_sources: list[dict[str, Any]] = []

    if "news" in intent:
        articles = await get_news_pool()
        if articles:
            top = sorted(articles, key=lambda a: _score_article(a, keywords), reverse=True)[
                :RAG_CHATBOT_MAX_CONTEXT_ARTICLES
            ]
            ctx, srcs = _format_news_context(top)
            if ctx:
                context_parts.append(f"=== NEWS DATA ===\n{ctx}")
                all_sources.extend(srcs)

    if "market" in intent:
        market = await get_market_pool()
        if market:
            ctx, srcs = _format_market_context(market)
            if ctx:
                context_parts.append(f"=== MARKET DATA ===\n{ctx}")
                all_sources.extend(srcs)

    if "analysis" in intent:
        history = await get_analysis_pool(limit=20)
        if history:
            sorted_history = sorted(
                history,
                key=lambda x: x.get("analysis_created_at") or x.get("created_at") or "",
                reverse=True,
            )
            detailed: list[dict[str, Any]] = []
            for item in sorted_history[:RAG_CHATBOT_MAX_CONTEXT_ANALYSES]:
                req_id = item.get("request_id")
                full = await get_analysis_detail(req_id) if req_id else None
                detailed.append(full if full else item)
            ctx, srcs = _format_analysis_context(detailed)
            if ctx:
                context_parts.append(f"=== AI AGENT ANALYSIS DATA ===\n{ctx}")
                all_sources.extend(srcs)

    if "watchlist" in intent and watchlist_context:
        ctx, srcs = _format_watchlist_context(watchlist_context)
        if ctx:
            context_parts.append(f"=== WATCHLIST DATA ===\n{ctx}")
            all_sources.extend(srcs)

    return "\n\n".join(context_parts), all_sources
