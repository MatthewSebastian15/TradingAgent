from __future__ import annotations

from services.market_search_index import build_search_index, search_local_tickers


def test_builds_prefix_index_from_symbols_and_names():
    index = build_search_index(
        [
            {
                "symbol": "BBCA.JK",
                "name": "Bank Central Asia Tbk PT",
                "exchange": "IDX",
                "type": "EQUITY",
                "market": "ID",
            }
        ]
    )

    assert 0 in index["BBCA"]
    assert 0 in index["BANK"]


def test_exact_symbol_ranks_first():
    assert search_local_tickers("AAPL", 5)[0]["symbol"] == "AAPL"


def test_compact_symbol_search_works_for_bbcajk_and_bbca_jk():
    assert search_local_tickers("BBCAJK", 1)[0]["symbol"] == "BBCA.JK"
    assert search_local_tickers("BBCA.JK", 1)[0]["symbol"] == "BBCA.JK"


def test_name_token_prefix_works_for_bank():
    assert search_local_tickers("bank", 1)[0]["symbol"].endswith(".JK")


def test_query_bb_returns_idx_bank_tickers():
    assert [item["symbol"] for item in search_local_tickers("bb", 6)] == [
        "BBCA.JK",
        "BBRI.JK",
        "BBNI.JK",
        "BBTN.JK",
        "BMRI.JK",
        "BRIS.JK",
    ]


def test_market_filter_works():
    assert all(item["market"] == "ID" for item in search_local_tickers("bank", 10, market="ID"))


def test_asset_type_filter_works():
    results = search_local_tickers("SPY", 10, asset_type="ETF")

    assert results[0]["symbol"] == "SPY"
    assert all(item["type"] == "ETF" for item in results)


def test_manual_symbol_fallback_works():
    assert search_local_tickers("META2", 1)[0] == {
        "symbol": "META2",
        "name": "META2",
        "exchange": "",
        "type": "SYMBOL",
        "market": "US",
        "source": "manual_symbol",
        "rank": 99,
        "matched_by": "manual_symbol",
    }


def test_unknown_invalid_query_returns_empty_list():
    assert search_local_tickers("zzzzz!", 10) == []
