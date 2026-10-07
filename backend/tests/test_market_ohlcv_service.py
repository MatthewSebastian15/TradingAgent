from __future__ import annotations

import threading
from datetime import datetime

import pandas as pd

from services.market import ohlcv_service

_ROW = {"Open": [1], "High": [2], "Low": [0.5], "Close": [1.5], "Volume": [100]}


def _daily_frame() -> pd.DataFrame:
    return pd.DataFrame(_ROW, index=pd.to_datetime(["2024-01-02"]))


def test_fetch_intervals_parallel_calls_all_intervals_concurrently(monkeypatch):
    seen: list[str] = []

    def fake_download(_symbol, _start, _end, interval):
        seen.append(interval)
        return _daily_frame() if interval == "1d" else pd.DataFrame()

    monkeypatch.setattr(ohlcv_service, "_download_ohlcv", fake_download)

    results, error = ohlcv_service._fetch_intervals_parallel(
        "AAPL", datetime(2024, 1, 1), datetime(2024, 1, 2), ["5m", "15m", "1d"]
    )

    assert sorted(seen) == ["15m", "1d", "5m"]
    assert results["1d"][0]["close"] == 1.5
    assert results["5m"] == []
    assert error is None


def test_fetch_intervals_parallel_records_last_error_when_all_fail(monkeypatch):
    def fake_download(_symbol, _start, _end, interval):
        raise RuntimeError(f"boom-{interval}")

    monkeypatch.setattr(ohlcv_service, "_download_ohlcv", fake_download)

    results, error = ohlcv_service._fetch_intervals_parallel(
        "AAPL", datetime(2024, 1, 1), datetime(2024, 1, 2), ["5m", "1d"]
    )

    assert results == {}
    assert isinstance(error, RuntimeError)


def test_fetch_ohlcv_range_coalesces_concurrent_calls(monkeypatch):
    ohlcv_service._OHLCV_CACHE.clear()
    calls = {"n": 0}
    release = threading.Event()

    def fake_parallel(_symbol, _start, _end, intervals):
        calls["n"] += 1
        release.wait(timeout=2)
        row = {"date": "2024-01-02", "open": 1, "high": 2, "low": 0.5, "close": 1.5, "volume": 1}
        return {interval: [row] for interval in intervals}, None

    monkeypatch.setattr(ohlcv_service, "_fetch_intervals_parallel", fake_parallel)

    results: list[dict] = []
    threads = [
        threading.Thread(
            target=lambda: results.append(
                ohlcv_service.fetch_ohlcv_range("AAPL", "3M", "2024-01-02")
            )
        )
        for _ in range(3)
    ]
    for t in threads:
        t.start()
    release.set()
    for t in threads:
        t.join(timeout=5)

    assert calls["n"] == 1
    assert len(results) == 3
    assert all(r["points"] for r in results)
