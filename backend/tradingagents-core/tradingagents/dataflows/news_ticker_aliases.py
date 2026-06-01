from __future__ import annotations

from typing import Any

IDX_COMPANY_ALIASES: dict[str, dict[str, Any]] = {
    "BBCA.JK": {
        "company_name": "Bank Central Asia",
        "aliases": ["BBCA", "BCA", "Bank Central Asia", "PT Bank Central Asia Tbk"],
        "sector": "Financial Services",
    },
    "BBRI.JK": {
        "company_name": "Bank Rakyat Indonesia",
        "aliases": ["BBRI", "BRI", "Bank Rakyat Indonesia", "PT Bank Rakyat Indonesia Tbk"],
        "sector": "Financial Services",
    },
    "BMRI.JK": {
        "company_name": "Bank Mandiri",
        "aliases": ["BMRI", "Bank Mandiri", "PT Bank Mandiri Tbk"],
        "sector": "Financial Services",
    },
    "TLKM.JK": {
        "company_name": "Telkom Indonesia",
        "aliases": ["TLKM", "Telkom", "Telkom Indonesia", "PT Telkom Indonesia Tbk"],
        "sector": "Communication Services",
    },
    "ASII.JK": {
        "company_name": "Astra International",
        "aliases": ["ASII", "Astra", "Astra International", "PT Astra International Tbk"],
        "sector": "Industrials",
    },
    "UNVR.JK": {
        "company_name": "Unilever Indonesia",
        "aliases": ["UNVR", "Unilever Indonesia", "PT Unilever Indonesia Tbk"],
        "sector": "Consumer Defensive",
    },
    "ICBP.JK": {
        "company_name": "Indofood CBP Sukses Makmur",
        "aliases": ["ICBP", "Indofood CBP", "PT Indofood CBP Sukses Makmur Tbk"],
        "sector": "Consumer Defensive",
    },
    "ADRO.JK": {
        "company_name": "Alamtri Resources Indonesia",
        "aliases": ["ADRO", "Adaro", "Alamtri Resources Indonesia", "PT Alamtri Resources Indonesia Tbk"],
        "sector": "Energy",
    },
    "ANTM.JK": {
        "company_name": "Aneka Tambang",
        "aliases": ["ANTM", "Antam", "Aneka Tambang", "PT Aneka Tambang Tbk"],
        "sector": "Basic Materials",
    },
    "GOTO.JK": {
        "company_name": "GoTo Gojek Tokopedia",
        "aliases": ["GOTO", "GoTo", "Gojek Tokopedia", "PT GoTo Gojek Tokopedia Tbk"],
        "sector": "Technology",
    },
}


def resolve_news_ticker(value: str) -> dict[str, Any]:
    ticker = str(value or "").strip().upper()
    if not ticker:
        raise ValueError("Ticker is required.")

    if ticker in IDX_COMPANY_ALIASES:
        metadata = IDX_COMPANY_ALIASES[ticker]
        short_ticker = ticker.removesuffix(".JK")
        return {
            "input": value,
            "ticker": ticker,
            "short_ticker": short_ticker,
            "exchange": "IDX",
            "country": "id",
            "company_name": metadata["company_name"],
            "aliases": list(dict.fromkeys([short_ticker, ticker, *metadata["aliases"]])),
            "sector": metadata["sector"],
        }

    if ticker.endswith(".JK"):
        short_ticker = ticker.removesuffix(".JK")
        return {
            "input": value,
            "ticker": ticker,
            "short_ticker": short_ticker,
            "exchange": "IDX",
            "country": "id",
            "company_name": short_ticker,
            "aliases": [short_ticker, ticker],
            "sector": None,
        }

    return {
        "input": value,
        "ticker": ticker,
        "short_ticker": ticker,
        "exchange": None,
        "country": None,
        "company_name": ticker,
        "aliases": [ticker],
        "sector": None,
    }
