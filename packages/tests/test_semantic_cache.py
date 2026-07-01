from tradingagents.llm_cache.semantic_cache import SemanticCache, embed_text


def _cache(tmp_path):
    return SemanticCache(
        str(tmp_path / "sem.sqlite3"), ttl_seconds=3600, max_entries=100, threshold=0.9
    )


def test_embed_text_is_deterministic_and_normalized():
    a = embed_text("BBCA price momentum strong")
    assert a == embed_text("BBCA price momentum strong")
    assert abs(sum(x * x for x in a) - 1.0) < 1e-9  # L2-normalized
    assert embed_text("") == [0.0] * 256  # empty -> zero vector, no crash


def test_semantic_hit_within_same_data_hash(tmp_path):
    cache = _cache(tmp_path)
    guard = {"agent_name": "Market Analyst", "data_hash": "snapshot-1"}
    prompt = "Market snapshot: price 100, rsi 55, trend up"
    cache.set(namespace="agent", guard=guard, embedding=embed_text(prompt), value={"rating": "Buy"})

    hit = cache.find(namespace="agent", guard=guard, embedding=embed_text(prompt))
    assert hit is not None
    assert hit["value"] == {"rating": "Buy"}


def test_semantic_never_serves_across_changed_snapshot(tmp_path):
    # Data-safety guarantee: a changed price/fundamentals snapshot -> different data_hash ->
    # different guard bucket -> the stale value is never returned.
    cache = _cache(tmp_path)
    prompt = "Market snapshot: price 100, rsi 55, trend up"
    cache.set(
        namespace="agent",
        guard={"agent_name": "Market Analyst", "data_hash": "snapshot-1"},
        embedding=embed_text(prompt),
        value={"rating": "Buy"},
    )

    miss = cache.find(
        namespace="agent",
        guard={"agent_name": "Market Analyst", "data_hash": "snapshot-2"},
        embedding=embed_text(prompt),
    )
    assert miss is None
