from __future__ import annotations

import asyncio
import threading


def test_parallel_async_configs_do_not_overwrite_each_other():
    from tradingagents.dataflows.config import get_config, set_config

    async def worker(timeout: int, release: asyncio.Event) -> int:
        set_config({"timeout": timeout, "llm_provider": f"provider-{timeout}"})
        await release.wait()
        return get_config()["timeout"]

    async def main() -> list[int]:
        release = asyncio.Event()
        first = asyncio.create_task(worker(11, release))
        second = asyncio.create_task(worker(22, release))
        await asyncio.sleep(0)
        release.set()
        return await asyncio.gather(first, second)

    assert asyncio.run(main()) == [11, 22]


def test_set_config_does_not_leak_into_unscoped_threads():
    from tradingagents.dataflows.config import get_config, initialize_config, set_config
    from tradingagents.default_config import DEFAULT_CONFIG

    initialize_config()
    set_config({"timeout": 99, "llm_provider": "scoped-provider"})
    result = []
    worker = threading.Thread(target=lambda: result.append(get_config()))
    worker.start()
    worker.join()

    assert result[0]["timeout"] == DEFAULT_CONFIG["timeout"]
    assert result[0]["llm_provider"] == DEFAULT_CONFIG["llm_provider"]
    initialize_config()
