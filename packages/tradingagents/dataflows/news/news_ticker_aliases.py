from __future__ import annotations

import re
import threading
from typing import Any

# Process-local yfinance identity, seeded once per analysis by the data-collection
# stage before any news resolution runs. Lets every independent resolve_news_ticker
# caller (providers, relevance, entity resolver) share the real company name for
# tickers that are not in the curated table.
# ponytail: in-worker dict, reset per run; keyed by ticker so cross-ticker staleness
# is harmless. No cross-process sharing needed — news resolves in the same worker. (deliberate)
_METADATA_LOCK = threading.Lock()
_TICKER_METADATA: dict[str, dict[str, str]] = {}

_LEGAL_SUFFIX_RE = re.compile(
    r"\b(PT|TBK|Tbk|Inc|Corp|Corporation|Ltd|PLC|LLC|Co)\b\.?", re.IGNORECASE
)
_ALIAS_STOPWORDS = {"the", "and", "of", "for"}


def _clean(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def register_news_ticker_metadata(
    ticker: str, *, company_name: str | None = None, sector: str | None = None
) -> None:
    """Seed real yfinance company_name/sector for a ticker (non-curated tickers)."""
    key = str(ticker or "").strip().upper()
    name = _clean(company_name)
    if not key or not name:
        return
    with _METADATA_LOCK:
        _TICKER_METADATA[key] = {"company_name": name, "sector": _clean(sector) or ""}


def reset_news_ticker_metadata() -> None:
    with _METADATA_LOCK:
        _TICKER_METADATA.clear()


def _registered_metadata(ticker: str) -> dict[str, str]:
    with _METADATA_LOCK:
        return dict(_TICKER_METADATA.get(ticker) or {})


def _derive_aliases(company_name: str) -> list[str]:
    """Full name, name-without-legal-suffix, and acronym."""
    clean = " ".join(_LEGAL_SUFFIX_RE.sub("", company_name).split())
    aliases = [company_name]
    if clean and clean.casefold() != company_name.casefold():
        aliases.append(clean)
    words = [
        word
        for word in re.split(r"[^A-Za-z0-9]+", clean)
        if word and word.lower() not in _ALIAS_STOPWORDS
    ]
    acronym = "".join(word[0] for word in words)
    if len(acronym) >= 2:
        aliases.append(acronym.upper())
    return aliases


def _profile(
    company_name: str,
    aliases: list[str],
    *,
    subsidiaries: list[str] | None = None,
    negative_terms: list[str] | None = None,
    sector: str | None = None,
) -> dict[str, Any]:
    return {
        "company_name": company_name,
        "aliases": aliases,
        "subsidiaries": subsidiaries or [],
        "negative_terms": negative_terms or [],
        "sector": sector,
    }


IDX_TICKER_ALIASES: dict[str, dict[str, Any]] = {
    "BBCA.JK": _profile(
        "Bank Central Asia",
        ["BBCA", "BCA", "Bank Central Asia", "PT Bank Central Asia Tbk"],
        subsidiaries=["BCA Digital", "blu by BCA"],
        sector="Financial Services",
    ),
    "BBRI.JK": _profile(
        "Bank Rakyat Indonesia",
        ["BBRI", "BRI", "Bank Rakyat Indonesia", "PT Bank Rakyat Indonesia Tbk"],
        subsidiaries=["BRImo", "BRI Finance", "Pegadaian", "PNM"],
        sector="Financial Services",
    ),
    "BMRI.JK": _profile(
        "Bank Mandiri",
        ["BMRI", "Mandiri", "Bank Mandiri", "PT Bank Mandiri Tbk"],
        subsidiaries=["Livin by Mandiri", "Mandiri Sekuritas", "Mandiri Tunas Finance"],
        sector="Financial Services",
    ),
    "BBNI.JK": _profile(
        "Bank Negara Indonesia",
        ["BBNI", "BNI", "Bank Negara Indonesia", "PT Bank Negara Indonesia Tbk"],
        subsidiaries=["BNI Sekuritas", "BNI Life", "wondr by BNI"],
        sector="Financial Services",
    ),
    "TLKM.JK": _profile(
        "Telkom Indonesia",
        ["TLKM", "Telkom", "Telkom Indonesia", "PT Telkom Indonesia Tbk"],
        subsidiaries=["Telkomsel", "IndiHome", "NeutraDC"],
        sector="Communication Services",
    ),
    "ASII.JK": _profile(
        "Astra International",
        ["ASII", "Astra", "Astra International", "PT Astra International Tbk"],
        subsidiaries=["United Tractors", "Astra Honda Motor", "Astra Otoparts", "Astra Financial"],
        sector="Industrials",
    ),
    "GOTO.JK": _profile(
        "GoTo Gojek Tokopedia",
        ["GOTO", "GoTo", "GoTo Gojek Tokopedia", "PT GoTo Gojek Tokopedia Tbk"],
        subsidiaries=["Gojek", "Tokopedia", "GoPay", "GoTo Financial"],
        negative_terms=["go to market", "goto statement", "go to the"],
        sector="Technology",
    ),
    "ANTM.JK": _profile(
        "Aneka Tambang",
        ["ANTM", "Antam", "Aneka Tambang", "PT Aneka Tambang Tbk"],
        sector="Basic Materials",
    ),
    "ADRO.JK": _profile(
        "Adaro Energy Indonesia",
        ["ADRO", "Adaro", "Adaro Energy", "PT Adaro Energy Indonesia Tbk"],
        subsidiaries=["Alamtri", "Adaro Minerals"],
        sector="Energy",
    ),
    "UNTR.JK": _profile(
        "United Tractors",
        ["UNTR", "United Tractors", "PT United Tractors Tbk"],
        subsidiaries=["Pamapersada", "PAMA", "Agincourt Resources"],
        sector="Industrials",
    ),
    "INDF.JK": _profile(
        "Indofood Sukses Makmur",
        ["INDF", "Indofood", "Indofood Sukses Makmur", "PT Indofood Sukses Makmur Tbk"],
        subsidiaries=["Indofood CBP", "Bogasari"],
        sector="Consumer Defensive",
    ),
    "ICBP.JK": _profile(
        "Indofood CBP Sukses Makmur",
        ["ICBP", "Indofood CBP", "PT Indofood CBP Sukses Makmur Tbk"],
        subsidiaries=["Indomie", "Pop Mie", "Chitato"],
        sector="Consumer Defensive",
    ),
    "AMRT.JK": _profile(
        "Sumber Alfaria Trijaya",
        ["AMRT", "Alfamart", "Sumber Alfaria Trijaya", "PT Sumber Alfaria Trijaya Tbk"],
        subsidiaries=["Alfamidi"],
        sector="Consumer Defensive",
    ),
    "KLBF.JK": _profile(
        "Kalbe Farma",
        ["KLBF", "Kalbe", "Kalbe Farma", "PT Kalbe Farma Tbk"],
        subsidiaries=["Sido Muncul", "Bintang Toedjoe"],
        sector="Healthcare",
    ),
    "UNVR.JK": _profile(
        "Unilever Indonesia",
        ["UNVR", "Unilever Indonesia", "PT Unilever Indonesia Tbk"],
        sector="Consumer Defensive",
    ),
    "HMSP.JK": _profile(
        "Hanjaya Mandala Sampoerna",
        ["HMSP", "Sampoerna", "HM Sampoerna", "PT Hanjaya Mandala Sampoerna Tbk"],
        sector="Consumer Defensive",
    ),
    "INCO.JK": _profile(
        "Vale Indonesia",
        ["INCO", "Vale Indonesia", "PT Vale Indonesia Tbk"],
        sector="Basic Materials",
    ),
    "MDKA.JK": _profile(
        "Merdeka Copper Gold",
        ["MDKA", "Merdeka Copper Gold", "PT Merdeka Copper Gold Tbk"],
        subsidiaries=["Merdeka Battery Materials"],
        sector="Basic Materials",
    ),
    "BRPT.JK": _profile(
        "Barito Pacific",
        ["BRPT", "Barito Pacific", "PT Barito Pacific Tbk"],
        subsidiaries=["Chandra Asri", "Star Energy"],
        sector="Basic Materials",
    ),
    "TPIA.JK": _profile(
        "Chandra Asri Pacific",
        ["TPIA", "Chandra Asri", "Chandra Asri Pacific", "PT Chandra Asri Pacific Tbk"],
        sector="Basic Materials",
    ),
    "PGAS.JK": _profile(
        "Perusahaan Gas Negara",
        ["PGAS", "PGN", "Perusahaan Gas Negara", "PT Perusahaan Gas Negara Tbk"],
        sector="Utilities",
    ),
    "EXCL.JK": _profile(
        "XL Axiata",
        ["EXCL", "XL Axiata", "PT XL Axiata Tbk"],
        sector="Communication Services",
    ),
    "ISAT.JK": _profile(
        "Indosat Ooredoo Hutchison",
        ["ISAT", "Indosat", "Indosat Ooredoo Hutchison", "PT Indosat Tbk"],
        subsidiaries=["IM3", "Tri Indonesia"],
        sector="Communication Services",
    ),
    "MEDC.JK": _profile(
        "Medco Energi Internasional",
        ["MEDC", "Medco", "Medco Energi", "PT Medco Energi Internasional Tbk"],
        sector="Energy",
    ),
    "ITMG.JK": _profile(
        "Indo Tambangraya Megah",
        ["ITMG", "Indo Tambangraya Megah", "PT Indo Tambangraya Megah Tbk"],
        sector="Energy",
    ),
    "PTBA.JK": _profile(
        "Bukit Asam",
        ["PTBA", "Bukit Asam", "PT Bukit Asam Tbk"],
        sector="Energy",
    ),
    "CPIN.JK": _profile(
        "Charoen Pokphand Indonesia",
        ["CPIN", "Charoen Pokphand Indonesia", "PT Charoen Pokphand Indonesia Tbk"],
        sector="Consumer Defensive",
    ),
    "JPFA.JK": _profile(
        "Japfa Comfeed Indonesia",
        ["JPFA", "Japfa", "Japfa Comfeed", "PT Japfa Comfeed Indonesia Tbk"],
        sector="Consumer Defensive",
    ),
    "MAPI.JK": _profile(
        "Mitra Adiperkasa",
        ["MAPI", "Mitra Adiperkasa", "MAP Group", "PT Mitra Adiperkasa Tbk"],
        subsidiaries=["MAP Aktif Adiperkasa"],
        sector="Consumer Cyclical",
    ),
    "ACES.JK": _profile(
        "Aspirasi Hidup Indonesia",
        [
            "ACES",
            "Ace Hardware Indonesia",
            "Aspirasi Hidup Indonesia",
            "PT Aspirasi Hidup Indonesia Tbk",
        ],
        sector="Consumer Cyclical",
    ),
    "EMTK.JK": _profile(
        "Elang Mahkota Teknologi",
        ["EMTK", "Emtek", "Elang Mahkota Teknologi", "PT Elang Mahkota Teknologi Tbk"],
        subsidiaries=["SCM", "SCTV", "Vidio"],
        sector="Communication Services",
    ),
    "BUKA.JK": _profile(
        "Bukalapak.com",
        ["BUKA", "Bukalapak", "Bukalapak.com", "PT Bukalapak.com Tbk"],
        sector="Technology",
    ),
    "ARTO.JK": _profile(
        "Bank Jago",
        ["ARTO", "Bank Jago", "PT Bank Jago Tbk"],
        subsidiaries=["Jago Syariah"],
        sector="Financial Services",
    ),
    "SMGR.JK": _profile(
        "Semen Indonesia",
        ["SMGR", "Semen Indonesia", "PT Semen Indonesia Tbk", "SIG"],
        subsidiaries=["Semen Gresik", "Semen Padang", "Semen Tonasa"],
        sector="Basic Materials",
    ),
}

US_TICKER_ALIASES: dict[str, dict[str, Any]] = {
    "AAPL": _profile(
        "Apple Inc",
        ["AAPL", "Apple", "Apple Inc", "Apple stock"],
        subsidiaries=["iPhone", "App Store", "Apple Services"],
        negative_terms=["apple fruit", "apple cider"],
        sector="Technology",
    ),
    "MSFT": _profile(
        "Microsoft Corporation",
        ["MSFT", "Microsoft", "Microsoft Corporation"],
        subsidiaries=["Azure", "GitHub", "LinkedIn", "OpenAI partnership"],
        sector="Technology",
    ),
    "NVDA": _profile(
        "NVIDIA Corporation",
        ["NVDA", "NVIDIA", "Nvidia Corporation"],
        subsidiaries=["GeForce", "CUDA", "Blackwell", "Hopper"],
        sector="Technology",
    ),
    "TSLA": _profile(
        "Tesla Inc",
        ["TSLA", "Tesla", "Tesla Inc"],
        subsidiaries=["Tesla Energy", "Supercharger", "Cybertruck", "Model Y"],
        sector="Consumer Cyclical",
    ),
}


def _dedupe_strings(values: list[Any]) -> list[str]:
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


def _metadata_for(ticker: str) -> tuple[dict[str, Any] | None, str | None, str | None]:
    if ticker in IDX_TICKER_ALIASES:
        return IDX_TICKER_ALIASES[ticker], "IDX", "id"
    if ticker in US_TICKER_ALIASES:
        return US_TICKER_ALIASES[ticker], "US", "us"
    return None, None, None


# 6C: exchange-suffix -> (exchange, country) so non-.JK global tickers tag the right
# market instead of defaulting to US. Query localization beyond id/us stays English
# (US_SUFFIXES) until a market gets its own keyword corpus — F7 tail.
SUFFIX_MARKET: dict[str, tuple[str, str]] = {
    "JK": ("IDX", "id"),
    "HK": ("HKEX", "hk"),
    "T": ("TSE", "jp"),
    "DE": ("XETRA", "de"),
    "L": ("LSE", "gb"),
    "SS": ("SSE", "cn"),
    "SZ": ("SZSE", "cn"),
    "KS": ("KRX", "kr"),
    "SI": ("SGX", "sg"),
    "AX": ("ASX", "au"),
}


def resolve_news_ticker(
    value: str, *, company_name: str | None = None, sector: str | None = None
) -> dict[str, Any]:
    ticker = str(value or "").strip().upper()
    if not ticker:
        raise ValueError("Ticker is required.")

    metadata, exchange, country = _metadata_for(ticker)
    if metadata is None:
        # Non-curated ticker: enrich with supplied or registered yfinance identity.
        # Falls back to the ticker-only degenerate profile when no name is known.
        # Strip the exchange suffix so the short ticker / query term is the bare code
        # (0700.HK -> 0700), and map the suffix to its real market (6C).
        suffix = ticker.rsplit(".", 1)[1] if "." in ticker else ""
        short_ticker = ticker.rsplit(".", 1)[0] if "." in ticker else ticker
        exchange, country = SUFFIX_MARKET.get(suffix, ("US", "us"))
        registered = _registered_metadata(ticker)
        resolved_name = _clean(company_name) or _clean(registered.get("company_name"))
        resolved_sector = _clean(sector) or _clean(registered.get("sector"))

        if resolved_name and resolved_name.upper() != short_ticker:
            company = resolved_name
            aliases = _dedupe_strings(
                [short_ticker, ticker, resolved_name, *_derive_aliases(resolved_name)]
            )
        else:
            company = short_ticker
            aliases = _dedupe_strings([short_ticker, ticker])

        return {
            "input": value,
            "ticker": ticker,
            "short_ticker": short_ticker,
            "exchange": exchange,
            "country": country,
            "company_name": company,
            "aliases": aliases,
            "subsidiaries": [],
            "negative_terms": [],
            "sector": resolved_sector,
        }

    short_ticker = ticker.removesuffix(".JK")
    return {
        "input": value,
        "ticker": ticker,
        "short_ticker": short_ticker,
        "exchange": exchange,
        "country": country,
        "company_name": metadata["company_name"],
        "aliases": _dedupe_strings(
            [short_ticker, ticker, metadata["company_name"], *metadata.get("aliases", [])]
        ),
        "subsidiaries": _dedupe_strings(metadata.get("subsidiaries", [])),
        "negative_terms": _dedupe_strings(metadata.get("negative_terms", [])),
        "sector": metadata.get("sector"),
    }
