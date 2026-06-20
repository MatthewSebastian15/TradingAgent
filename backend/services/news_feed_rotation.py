from __future__ import annotations

from typing import Any


class FeedRotationState:
    def __init__(self) -> None:
        self.offset = 0

    def next_batch(self, feeds: list[Any], batch_size: int) -> list[Any]:
        if not feeds:
            return []

        size = max(1, min(int(batch_size), len(feeds)))
        start = self.offset % len(feeds)
        end = start + size

        if end <= len(feeds):
            batch = feeds[start:end]
        else:
            batch = feeds[start:] + feeds[: end % len(feeds)]

        self.offset = end % len(feeds)
        return batch


_ROTATION_STATE = FeedRotationState()


def rotate_feed_ids(feeds: list[Any], batch_size: int) -> list[str]:
    batch = _ROTATION_STATE.next_batch(feeds, batch_size)
    return [str(getattr(feed, "id", "") or "") for feed in batch if getattr(feed, "id", None)]


def clear_feed_rotation_for_tests() -> None:
    _ROTATION_STATE.offset = 0
