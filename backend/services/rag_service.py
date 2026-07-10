from __future__ import annotations

import logging
import re
from typing import Any

from config import RAG_CHATBOT_MAX_CONTEXT_ANALYSES, RAG_CHATBOT_MAX_CONTEXT_ARTICLES
from services.rag_pool import (
    get_analysis_detail,
    get_analysis_pool,
    get_econ_pool,
    get_market_pool,
    get_news_pool,
    get_ticker_news_pool,
    get_ticker_quotes,
    utc_iso,
)

logger = logging.getLogger(__name__)

# ─── Ticker extraction ────────────────────────────────────────────────────────

_TICKER_RE = re.compile(r"\b[A-Z]{2,6}(?:[.\-][A-Z]{1,3})?\b")

# Uppercase words that look like tickers but are finance/chat acronyms, not
# symbols the user is asking about.
_TICKER_STOP = frozenset(
    {
        "AI", "API", "ATH", "BUY", "CEO", "CFO", "CPI", "DXY", "EPS", "ETF",
        "FED", "GDP", "HOLD", "IDR", "IPO", "LLM", "NEWS", "OK", "PDF", "PNL",
        "RAG", "RR", "SELL", "SL", "TP", "USA", "USD", "VIX", "WAIT", "YTD",
    }
)  # fmt: skip


def extract_tickers(message: str) -> list[str]:
    """Uppercase ticker-shaped words in the message, validated later by quote fetch.

    ponytail: pure regex + stoplist, no network. An ALL-CAPS sentence (>3 words)
    is treated as shouting, not tickers. Invalid symbols are dropped downstream
    because their quote fetch returns status != ok.
    """
    text = str(message or "")
    words = text.split()
    if len(words) > 3 and all(w.isupper() for w in words if w.isalpha()):
        return []
    tickers: list[str] = []
    for match in _TICKER_RE.findall(text):
        if match not in _TICKER_STOP and match not in tickers:
            tickers.append(match)
    return tickers[:3]


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
    re.compile(
        r"\b(quant|sharpe|sortino|beta|alpha|volatility|volatilitas|drawdown|risk.?adjusted|risk.?reward|upside|downside)\b",
        re.I,
    ),
    re.compile(
        r"\b(portfolio|portofolio|holding|posisi|position|p.?n.?l|profit.?loss|cost.?basis|shares|lembar|gain|loss|untung|rugi)\b",
        re.I,
    ),
    re.compile(
        r"\b(economic|ekonomi|macro|makro|inflation|inflasi|gdp|fed|interest.?rate|suku.?bunga|yield|treasury|recession|resesi|dxy|vix)\b",
        re.I,
    ),
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
    """True if message is within allowed scope (News/Market/Analysis/Watchlist).

    Requires a positive in-scope signal. Unrecognized queries (no in-scope and no
    out-of-scope keyword) are treated as out-of-scope, so the LLM is not the only
    guardrail for the gap case.
    """
    text = str(message or "").strip()
    has_in = any(p.search(text) for p in _IN_SCOPE) or bool(extract_tickers(text))
    has_out = any(p.search(text) for p in _OUT_OF_SCOPE)
    if has_out and not has_in:
        return False
    return has_in


# ─── Intent detection ─────────────────────────────────────────────────────────

_NEWS_RE = re.compile(
    r"\b(news|berita|headline|artikel|breaking|latest|sentiment|impact|provider|published|kategori)\b",
    re.I,
)
_MARKET_RE = re.compile(
    r"\b(market|harga|price|volume|change|percent|gainer|loser|mover|index|crypto|etf|forex|quote|ohlcv|saham|naik|turun)\b",
    re.I,
)
# Quant questions (sharpe/beta/drawdown/risk-reward) are answered from the
# risk-adjusted fields already inside each stored analysis, so they route to the
# analysis pool — no separate quant pool.
_ANALYSIS_RE = re.compile(
    r"\b(analisis|analysis|ai.agent|recommendation|rekomendasi|confidence|risk|entry|thesis|hold|buy|sell|wait|history|analisa|stop.loss|take.profit|allocation|fundamental|profile|chart|technical|quant|sharpe|sortino|beta|alpha|volatility|volatilitas|drawdown|risk.?adjusted|risk.?reward|upside|downside)\b",
    re.I,
)
_WATCHLIST_RE = re.compile(
    r"\b(watchlist|watch.?list|daftar pantau|grup.?saham)\b",
    re.I,
)
_PORTFOLIO_RE = re.compile(
    r"\b(portfolio|portofolio|holding|posisi|position|p.?n.?l|profit.?loss|cost.?basis|shares|lembar|gain|loss|untung|rugi)\b",
    re.I,
)
_ECON_RE = re.compile(
    r"\b(economic|ekonomi|macro|makro|inflation|inflasi|gdp|fed|interest.?rate|suku.?bunga|yield|treasury|recession|resesi|dxy|vix)\b",
    re.I,
)

_FILTER_MAP: dict[str, list[str]] = {
    "news": ["news"],
    "market": ["market"],
    "analysis": ["analysis"],
    "watchlist": ["watchlist"],
    "portfolio": ["portfolio"],
    "economic": ["economic"],
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
    if _PORTFOLIO_RE.search(text):
        pools.append("portfolio")
    if _ECON_RE.search(text):
        pools.append("economic")
    if extract_tickers(text):
        for pool in ("news", "market", "analysis"):
            if pool not in pools:
                pools.append(pool)
    return pools or ["news", "market", "analysis"]


# ─── Context formatters ───────────────────────────────────────────────────────


# Indonesian finance terms mapped to the English vocabulary of the stored
# article corpus, so an Indonesian question can still rank English news.
# ponytail: a ~30-word dictionary, not a translator — extend the map when a
# term users actually ask about is missing.
_ID_EN_KEYWORDS = {
    "akuisisi": "acquisition",
    "berita": "news",
    "bunga": "rate",
    "dividen": "dividend",
    "dolar": "dollar",
    "ekonomi": "economy",
    "emas": "gold",
    "energi": "energy",
    "harga": "price",
    "imbal": "yield",
    "inflasi": "inflation",
    "kripto": "crypto",
    "kuartal": "quarter",
    "laba": "profit",
    "minyak": "oil",
    "naik": "rise",
    "obligasi": "bond",
    "pasar": "market",
    "pendapatan": "revenue",
    "penjualan": "sales",
    "pertumbuhan": "growth",
    "perusahaan": "company",
    "prediksi": "forecast",
    "resesi": "recession",
    "rugi": "loss",
    "saham": "stock",
    "suku": "interest",
    "teknologi": "technology",
    "turun": "fall",
    "untung": "profit",
}


def _extract_keywords(message: str) -> list[str]:
    stopwords = {"the", "and", "for", "apa", "yang", "dari", "ini", "itu", "ada", "dengan", "atau"}
    words = [w for w in re.findall(r"\b[a-zA-Z]{3,}\b", message.lower()) if w not in stopwords]
    # Keep the original word and add its English mapping; dedupe preserves order.
    words += [_ID_EN_KEYWORDS[w] for w in words if w in _ID_EN_KEYWORDS]
    return list(dict.fromkeys(words))


def _score_article(article: dict[str, Any], keywords: list[str]) -> int:
    text = " ".join(
        str(article.get(f, "") or "")
        for f in ("title", "description", "summary", "category", "source")
    ).lower()
    # Whole-word match so "art" doesn't score against "quarter".
    score = sum(1 for kw in keywords if re.search(rf"\b{re.escape(kw)}\b", text))
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
        rar_raw = a.get("risk_adjusted_return")
        rar = rar_raw if isinstance(rar_raw, dict) else {}
        quant = (
            f"  quant: risk_reward={a.get('risk_reward_display') or a.get('risk_reward_ratio') or rar.get('risk_reward_ratio', 'N/A')} | "  # noqa: E501
            f"expected_return={rar.get('expected_return_label', 'N/A')} | upside={rar.get('upside_percent', 'N/A')}% | "  # noqa: E501
            f"downside={rar.get('downside_percent', 'N/A')}% | max_drawdown={a.get('max_drawdown_estimate', 'N/A')} | "  # noqa: E501
            f"volatility={a.get('volatility_level', 'N/A')}"
        )
        line = (
            f"[ANALYSIS] {ticker} | {a.get('trade_date', '')} | decision={decision} | "
            f"confidence={a.get('confidence_score', '')} | allocation={a.get('suggested_allocation_percent', '')}% | "  # noqa: E501
            f"entry={a.get('entry_price', '')} | stop_loss={a.get('stop_loss', '')} | take_profit={a.get('take_profit', '')} | "  # noqa: E501
            f"created={a.get('analysis_created_at') or a.get('created_at', '')}\n"
            f"  summary: {overview.get('executive_summary') or a.get('executive_summary', '')}\n"
            f"  thesis: {overview.get('investment_thesis') or a.get('investment_thesis', '')}\n"
            f"  reasons: {reasons_str}\n"
            f"  risk: {risk}\n"
            f"{quant}"
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


def _latest_point(points: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Last point of an ascending [{date, value}] series; yield-curve is by tenor."""
    return points[-1] if points else None


def _format_econ_context(econ: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    """Format the macro snapshot (fed funds, yield curve, gauges) into context."""
    lines, sources = [], []
    for key, result in econ.items():
        if key == "fetched_at" or not isinstance(result, dict):
            continue
        unit = result.get("valueType", "")
        if isinstance(result.get("data"), list):
            if key.endswith("yield_curve"):
                pts = ", ".join(f"{p.get('date', '')}={p.get('value', '')}" for p in result["data"])
                lines.append(f"[ECON:{key}] yield curve ({unit}): {pts}")
            else:
                latest = _latest_point(result["data"])
                if latest:
                    lines.append(
                        f"[ECON:{key}] {latest.get('date', '')} = {latest.get('value', '')} {unit}"
                    )
            sources.append({"type": "economic", "indicator": key})
        elif isinstance(result.get("series"), dict):
            for label, pts in result["series"].items():
                latest = _latest_point(pts if isinstance(pts, list) else [])
                if latest:
                    lines.append(
                        f"[ECON:{key}] {label} {latest.get('date', '')} = {latest.get('value', '')} {unit}"  # noqa: E501
                    )
            sources.append({"type": "economic", "indicator": key})
    return "\n".join(lines), sources


def _format_portfolio_context(
    portfolio_context: dict[str, Any],
) -> tuple[str, list[dict[str, Any]]]:
    """Format frontend-supplied holdings (localStorage) + live quotes into context."""
    lines, sources = [], []
    holdings = portfolio_context.get("holdings") or []
    quotes_map: dict[str, dict] = {
        q["sym"]: q for q in (portfolio_context.get("quotes") or []) if q.get("sym")
    }
    fetched_at = portfolio_context.get("fetched_at", "")

    for h in holdings:
        ticker = str(h.get("ticker", "")).upper()
        shares = h.get("shares")
        cost = h.get("cost_basis")
        q = quotes_map.get(ticker, {})
        price = q.get("price")
        cost_value = (
            (shares * cost)
            if isinstance(shares, (int, float)) and isinstance(cost, (int, float))
            else None
        )  # noqa: E501
        market_value = (
            (shares * price)
            if isinstance(shares, (int, float)) and isinstance(price, (int, float))
            else None
        )  # noqa: E501
        pnl = (
            (market_value - cost_value)
            if market_value is not None and cost_value is not None
            else None
        )  # noqa: E501
        pnl_pct = (pnl / cost_value * 100) if pnl is not None and cost_value else None
        line = (
            f"[PORTFOLIO] {ticker} | shares={shares} | cost_basis={cost} | price={price if price is not None else 'N/A'} | "  # noqa: E501
            f"market_value={round(market_value, 2) if market_value is not None else 'N/A'} | "
            f"pnl={round(pnl, 2) if pnl is not None else 'N/A'} | pnl_percent={round(pnl_pct, 2) if pnl_pct is not None else 'N/A'}%"  # noqa: E501
        )
        lines.append(line)
        sources.append(
            {
                "type": "portfolio",
                "ticker": ticker,
                "shares": shares,
                "price": price,
                "fetched_at": fetched_at,
            }
        )
    return "\n".join(lines), sources


# ─── Main entry point ─────────────────────────────────────────────────────────


def _recent_history_text(chat_history: list[dict[str, Any]] | None) -> str:
    """Last 3 history turns joined, for follow-up ticker/keyword extraction."""
    return " ".join(str(h.get("content", "") or "") for h in (chat_history or [])[-3:])


# ponytail: three coarse buckets (7/14/30 days), not a date parser. Extend the
# regexes if users ask for explicit ranges ("dari 3 Juni sampai...").
def _detect_window_days(message: str) -> int:
    text = str(message or "").lower()
    if re.search(r"\b(bulan (ini|lalu|kemarin)|(this|last|past) month|30 (hari|days))\b", text):
        return 30
    if re.search(
        r"\b(minggu (lalu|kemarin)|(last|past) week|2 minggu|two weeks|14 (hari|days))\b", text
    ):  # noqa: E501
        return 14
    return 7


def _as_of(fetched_at: Any) -> str:
    """' (as of <iso>)' suffix for a context header; empty when unknown."""
    if isinstance(fetched_at, (int, float)) and fetched_at > 0:
        return f" (as of {utc_iso(float(fetched_at))})"
    if isinstance(fetched_at, str) and fetched_at:
        return f" (as of {fetched_at})"
    return ""


async def build_context(
    message: str,
    intent: list[str],
    watchlist_context: dict[str, Any] | None = None,
    portfolio_context: dict[str, Any] | None = None,
    chat_history: list[dict[str, Any]] | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Retrieve and format context from the relevant pools."""
    history_text = _recent_history_text(chat_history)
    # The current message wins; history only fills the gap on follow-ups
    # ("berapa stop loss-nya?") that don't repeat the ticker/keywords.
    keywords = _extract_keywords(message) or _extract_keywords(history_text)
    tickers = extract_tickers(message) or extract_tickers(history_text)
    context_parts: list[str] = []
    all_sources: list[dict[str, Any]] = []

    if "news" in intent:
        articles = await get_news_pool(window_days=_detect_window_days(message))
        if articles:
            top = sorted(articles, key=lambda a: _score_article(a, keywords), reverse=True)[
                :RAG_CHATBOT_MAX_CONTEXT_ARTICLES
            ]
            ctx, srcs = _format_news_context(top)
            if ctx:
                context_parts.append(f"=== NEWS DATA ===\n{ctx}")
                all_sources.extend(srcs)
        for t in tickers:
            ticker_articles = await get_ticker_news_pool(t)
            if ticker_articles:
                ctx, srcs = _format_news_context(ticker_articles[:RAG_CHATBOT_MAX_CONTEXT_ARTICLES])
                if ctx:
                    context_parts.append(f"=== TICKER NEWS DATA ({t}) ===\n{ctx}")
                    all_sources.extend(srcs)

    if "market" in intent:
        market = await get_market_pool()
        if market:
            ctx, srcs = _format_market_context(market)
            if ctx:
                context_parts.append(
                    f"=== MARKET DATA{_as_of(market.get('fetched_at'))} ===\n{ctx}"
                )
                all_sources.extend(srcs)
        if tickers:
            quotes = await get_ticker_quotes(tickers)
            if quotes:
                ctx, srcs = _format_market_context({"overview": {"items": quotes}})
                if ctx:
                    context_parts.append(f"=== TICKER QUOTE DATA ===\n{ctx}")
                    all_sources.extend(srcs)

    if "analysis" in intent:

        def _created(x: dict[str, Any]) -> str:
            return x.get("analysis_created_at") or x.get("created_at") or ""

        # Ticker-mentioned analyses first, then the latest of everything else.
        ticker_history: list[dict[str, Any]] = []
        for t in tickers:
            ticker_history.extend(
                await get_analysis_pool(limit=RAG_CHATBOT_MAX_CONTEXT_ANALYSES, ticker=t)
            )
        general_history = await get_analysis_pool(limit=20)
        seen_ids = {h.get("request_id") for h in ticker_history}
        history = sorted(ticker_history, key=_created, reverse=True) + sorted(
            (g for g in general_history if g.get("request_id") not in seen_ids),
            key=_created,
            reverse=True,
        )
        if history:
            detailed: list[dict[str, Any]] = []
            for item in history[:RAG_CHATBOT_MAX_CONTEXT_ANALYSES]:
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
            context_parts.append(
                f"=== WATCHLIST DATA{_as_of(watchlist_context.get('fetched_at'))} ===\n{ctx}"
            )
            all_sources.extend(srcs)

    if "portfolio" in intent and portfolio_context:
        ctx, srcs = _format_portfolio_context(portfolio_context)
        if ctx:
            context_parts.append(
                f"=== PORTFOLIO DATA{_as_of(portfolio_context.get('fetched_at'))} ===\n{ctx}"
            )
            all_sources.extend(srcs)

    if "economic" in intent:
        econ = await get_econ_pool()
        if econ:
            ctx, srcs = _format_econ_context(econ)
            if ctx:
                context_parts.append(
                    f"=== ECONOMIC DATA{_as_of(econ.get('fetched_at'))} ===\n{ctx}"
                )
                all_sources.extend(srcs)

    return "\n\n".join(context_parts), all_sources
