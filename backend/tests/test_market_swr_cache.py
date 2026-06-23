"""SWR + in-flight dedup for market overview/movers caches."""

from __future__ import annotations

import threading
import time

from services import market_yfinance_service as svc
from services.market_cache import market_cache


def setup_function() -> None:
    market_cache.clear()
    svc._refresh_locks.clear()
    svc._fetch_seq.clear()


def test_cold_then_fresh_hit_fetches_once() -> None:
    calls = {"n": 0}

    def fetch() -> dict:
        calls["n"] += 1
        return {"v": calls["n"]}

    value, hit = svc._swr_cached("k", fetch, ttl=60, force_refresh=False)
    assert value == {"v": 1} and hit is False  # cold: sync fetch
    value, hit = svc._swr_cached("k", fetch, ttl=60, force_refresh=False)
    assert value == {"v": 1} and hit is True  # fresh: served from cache, no fetch
    assert calls["n"] == 1


def test_force_refresh_refetches() -> None:
    calls = {"n": 0}

    def fetch() -> dict:
        calls["n"] += 1
        return {"v": calls["n"]}

    svc._swr_cached("k", fetch, ttl=60, force_refresh=False)
    value, hit = svc._swr_cached("k", fetch, ttl=60, force_refresh=True)
    assert value == {"v": 2} and hit is False
    assert calls["n"] == 2


def test_stale_serves_old_then_refreshes_in_background() -> None:
    calls = {"n": 0}

    def fetch() -> dict:
        calls["n"] += 1
        return {"v": calls["n"]}

    svc._swr_cached("k", fetch, ttl=0.01, force_refresh=False)
    time.sleep(0.05)  # let the entry go stale
    value, hit = svc._swr_cached("k", fetch, ttl=0.01, force_refresh=False)
    assert value == {"v": 1} and hit is True  # stale value served instantly
    for _ in range(100):  # background refresh runs eventually
        if calls["n"] >= 2:
            break
        time.sleep(0.01)
    assert calls["n"] == 2


def test_concurrent_cold_requests_dedupe_to_one_fetch() -> None:
    calls = {"n": 0}
    start = threading.Barrier(8)

    def fetch() -> dict:
        calls["n"] += 1
        time.sleep(0.05)  # hold the lock so others pile up behind it
        return {"v": calls["n"]}

    results: list = []

    def worker() -> None:
        start.wait()
        results.append(svc._swr_cached("k", fetch, ttl=60, force_refresh=False)[0])

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert calls["n"] == 1  # only one thread fetched
    assert all(r == {"v": 1} for r in results)
