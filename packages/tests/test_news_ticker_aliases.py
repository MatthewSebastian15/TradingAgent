from tradingagents.dataflows.news.news_ticker_aliases import (
    register_news_ticker_metadata,
    reset_news_ticker_metadata,
    resolve_news_ticker,
)


def test_curated_ticker_uses_rich_table():
    profile = resolve_news_ticker("BBCA.JK")
    assert profile["company_name"] == "Bank Central Asia"
    assert "BCA" in profile["aliases"]
    assert profile["sector"] == "Financial Services"


def test_unknown_ticker_without_name_falls_back_to_ticker():
    reset_news_ticker_metadata()
    profile = resolve_news_ticker("PTPP.JK")
    assert profile["company_name"] == "PTPP"
    assert profile["aliases"] == ["PTPP", "PTPP.JK"]
    assert profile["exchange"] == "IDX"
    assert profile["sector"] is None


def test_supplied_company_name_enriches_profile():
    profile = resolve_news_ticker(
        "PTPP.JK",
        company_name="PT Pembangunan Perumahan Tbk",
        sector="Industrials",
    )
    assert profile["company_name"] == "PT Pembangunan Perumahan Tbk"
    assert "Pembangunan Perumahan" in profile["aliases"]  # legal suffix stripped
    assert "PTPP" in profile["aliases"]
    assert profile["sector"] == "Industrials"


def test_registered_metadata_is_used_by_later_resolve():
    reset_news_ticker_metadata()
    register_news_ticker_metadata(
        "0700.HK", company_name="Tencent Holdings Ltd", sector="Technology"
    )
    profile = resolve_news_ticker("0700.HK")
    assert profile["company_name"] == "Tencent Holdings Ltd"
    assert "Tencent Holdings" in profile["aliases"]
    assert profile["sector"] == "Technology"

    reset_news_ticker_metadata()
    # F7 (global suffix -> country/short-ticker) is Phase 6; unknown non-.JK keeps full symbol.
    assert resolve_news_ticker("0700.HK")["company_name"] == "0700.HK"


def test_curated_table_wins_over_registry():
    reset_news_ticker_metadata()
    register_news_ticker_metadata("BBCA.JK", company_name="Wrong Name")
    assert resolve_news_ticker("BBCA.JK")["company_name"] == "Bank Central Asia"
    reset_news_ticker_metadata()
