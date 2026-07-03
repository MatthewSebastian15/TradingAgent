from tradingagents.fundamentals.peer_comparison_builder import build_peer_comparison


def test_none_and_empty_payload_return_none():
    assert build_peer_comparison(None) is None
    assert build_peer_comparison({}) is None
    assert build_peer_comparison({"metrics": []}) is None
    assert build_peer_comparison({"metrics": "not-a-list"}) is None


def test_valid_payload_normalized():
    result = build_peer_comparison(
        {
            "primary_ticker": "AAPL",
            "peers": ["MSFT"],
            "metrics": [{"key": "pe"}, "junk", {"key": "pbv"}],
            "ranking_summary": {"pe": 1},
        }
    )
    assert result["primary_ticker"] == "AAPL"
    assert result["peers"] == ["MSFT"]
    assert result["metrics"] == [{"key": "pe"}, {"key": "pbv"}]  # non-dicts dropped
    assert result["data_quality"]["status"] == "complete"
    assert result["data_quality"]["missing_fields"] == []


def test_existing_data_quality_preserved():
    result = build_peer_comparison(
        {"metrics": [{"key": "pe"}], "data_quality": {"status": "partial"}}
    )
    assert result["data_quality"]["status"] == "partial"
