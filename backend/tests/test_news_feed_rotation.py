from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

from services.news_feed_rotation import clear_feed_rotation_for_tests, rotate_feed_ids


def setup_function():
    clear_feed_rotation_for_tests()


def teardown_function():
    clear_feed_rotation_for_tests()


def _feeds(count: int) -> list[SimpleNamespace]:
    return [SimpleNamespace(id=f"feed-{i}") for i in range(count)]


def test_rotate_feed_ids_advances_offset():
    feeds = _feeds(10)

    first = rotate_feed_ids(feeds, batch_size=4)
    second = rotate_feed_ids(feeds, batch_size=4)

    assert first == ["feed-0", "feed-1", "feed-2", "feed-3"]
    assert second == ["feed-4", "feed-5", "feed-6", "feed-7"]


def test_rotate_feed_ids_concurrent_calls_never_corrupt_batches():
    feeds = _feeds(20)
    batch_size = 5
    calls = 200

    results: list[list[str]] = []
    with ThreadPoolExecutor(max_workers=16) as executor:
        for batch in executor.map(lambda _: rotate_feed_ids(feeds, batch_size), range(calls)):
            results.append(batch)

    # The lock guarantees every batch is exactly batch_size well-formed ids,
    # never a partial/duplicated slice from two interleaved offset updates.
    for batch in results:
        assert len(batch) == batch_size
        assert len(set(batch)) == batch_size
        assert all(feed_id.startswith("feed-") for feed_id in batch)
