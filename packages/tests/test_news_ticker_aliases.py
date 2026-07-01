from tradingagents.dataflows.news.news_ticker_aliases import (
    register_news_ticker_metadata,
    reset_news_ticker_metadata,
    resolve_news_ticker,
)


def test_suffix_maps_to_market_country():
    # 6C: exchange suffix drives market/country instead of defaulting to US.
    hk = resolve_news_ticker("0700.HK")
    assert (hk["exchange"], hk["country"]) == ("HKEX", "hk")
    assert resolve_news_ticker("7203.T")["country"] == "jp"
    assert resolve_news_ticker("SAP.DE")["country"] == "de"
    # unknown suffix still defaults to US
    assert resolve_news_ticker("SOME.XYZ")["country"] == "us"
    # no suffix -> US
    assert resolve_news_ticker("AMD")["country"] == "us"


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
    # Exchange suffix is stripped for the short ticker (0700.HK -> 0700); no-name fallback
    # uses the bare code. Country localization for non-.JK suffixes stays deferred (F7).
    resolved = resolve_news_ticker("0700.HK")
    assert resolved["company_name"] == "0700"
    assert resolved["short_ticker"] == "0700"


def test_curated_table_wins_over_registry():
    reset_news_ticker_metadata()
    register_news_ticker_metadata("BBCA.JK", company_name="Wrong Name")
    assert resolve_news_ticker("BBCA.JK")["company_name"] == "Bank Central Asia"
    reset_news_ticker_metadata()
