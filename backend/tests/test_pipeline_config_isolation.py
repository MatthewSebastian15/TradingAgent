from __future__ import annotations

import asyncio


def test_parallel_pipeline_configs_do_not_overwrite_each_other():
    from tradingagents.dataflows.providers.config import get_config, initialize_config, use_config

    async def pipeline(timeout: int, release: asyncio.Event) -> tuple[int, str]:
        with use_config({"timeout": timeout, "llm_provider": f"provider-{timeout}"}):
            await release.wait()
            config = get_config()
            return config["timeout"], config["llm_provider"]

    async def main() -> list[tuple[int, str]]:
        release = asyncio.Event()
        first = asyncio.create_task(pipeline(11, release))
        second = asyncio.create_task(pipeline(22, release))
        await asyncio.sleep(0)
        release.set()
        return await asyncio.gather(first, second)

    try:
        assert asyncio.run(main()) == [(11, "provider-11"), (22, "provider-22")]
    finally:
        initialize_config()
