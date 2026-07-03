import asyncio

from tradingagents.dataflows.news.general_news_stream import GeneralNewsEventBus


async def _subscribed_bus():
    bus = GeneralNewsEventBus()
    subscription = bus.subscribe()
    first_event = asyncio.ensure_future(anext(subscription))
    await asyncio.sleep(0)  # let the subscriber register its queue
    return bus, subscription, first_event


def test_first_snapshot_primes_without_event():
    async def scenario():
        bus, _sub, first_event = await _subscribed_bus()
        await bus.publish_if_changed({"articles": [{"id": "a"}], "last_updated": "t1"})
        await asyncio.sleep(0)
        return first_event.done()

    assert asyncio.run(scenario()) is False


def test_new_article_publishes_update_event():
    async def scenario():
        bus, _sub, first_event = await _subscribed_bus()
        await bus.publish_if_changed({"articles": [{"id": "a"}], "last_updated": "t1"})
        await bus.publish_if_changed({"articles": [{"id": "a"}, {"id": "b"}], "last_updated": "t2"})
        return await asyncio.wait_for(first_event, 1)

    event = asyncio.run(scenario())
    assert event == {"event": "general_news_updated", "last_updated": "t2", "new_count": 1}


def test_unchanged_articles_do_not_publish():
    async def scenario():
        bus, _sub, first_event = await _subscribed_bus()
        snapshot = {"articles": [{"id": "a"}], "last_updated": "t1"}
        await bus.publish_if_changed(snapshot)
        await bus.publish_if_changed(snapshot)
        await asyncio.sleep(0)
        return first_event.done()

    assert asyncio.run(scenario()) is False


def test_article_id_falls_back_to_url_and_junk_ignored():
    async def scenario():
        bus, _sub, first_event = await _subscribed_bus()
        await bus.publish_if_changed({"articles": [{"url": "https://a"}]})
        await bus.publish_if_changed(
            {"articles": [{"url": "https://a"}, {"url": "https://b"}, "junk", {}]}
        )
        return await asyncio.wait_for(first_event, 1)

    assert asyncio.run(scenario())["new_count"] == 1


def test_empty_or_malformed_result_is_noop():
    async def scenario():
        bus = GeneralNewsEventBus()
        await bus.publish_if_changed("not-a-dict")
        await bus.publish_if_changed({"articles": None})
        await bus.publish_if_changed({"articles": [{"id": ""}]})
        return bus._last_article_ids

    assert asyncio.run(scenario()) == set()


def test_full_subscriber_queue_dropped():
    async def scenario():
        bus = GeneralNewsEventBus()
        full_queue = asyncio.Queue(maxsize=1)
        full_queue.put_nowait({"stale": True})
        bus._subscribers.add(full_queue)
        await bus.publish({"event": "general_news_updated"})
        return full_queue in bus._subscribers

    assert asyncio.run(scenario()) is False
