from __future__ import annotations

import asyncio
import json
from collections import deque

from body_limit import RequestBodyLimitMiddleware


async def _call_body_limit(headers: list[tuple[bytes, bytes]], bodies: list[bytes], *, max_bytes: int = 5) -> tuple[int, dict]:
    async def app(scope, receive, send):
        while True:
            message = await receive()
            if not message.get("more_body"):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b'{"ok":true}'})

    messages = deque(
        {"type": "http.request", "body": body, "more_body": index < len(bodies) - 1}
        for index, body in enumerate(bodies)
    )
    if not messages:
        messages.append({"type": "http.request", "body": b"", "more_body": False})

    async def receive():
        return messages.popleft()

    sent: list[dict] = []

    async def send(message):
        sent.append(message)

    middleware = RequestBodyLimitMiddleware(app, max_bytes=max_bytes)
    await middleware({"type": "http", "headers": headers}, receive, send)

    status = next(message["status"] for message in sent if message["type"] == "http.response.start")
    body = b"".join(message.get("body", b"") for message in sent if message["type"] == "http.response.body")
    return status, json.loads(body or b"{}")


def test_invalid_content_length_is_rejected_before_body_read():
    status, payload = asyncio.run(_call_body_limit([(b"content-length", b"abc")], [b"{}"]))

    assert status == 400
    assert payload["error"]["code"] == "INVALID_CONTENT_LENGTH"


def test_negative_content_length_is_rejected_before_body_read():
    status, payload = asyncio.run(_call_body_limit([(b"content-length", b"-1")], [b"{}"]))

    assert status == 400
    assert payload["error"]["code"] == "INVALID_CONTENT_LENGTH"


def test_chunked_body_over_limit_is_rejected():
    status, payload = asyncio.run(_call_body_limit([], [b"abc", b"def"]))

    assert status == 413
    assert payload["error"]["code"] == "REQUEST_BODY_TOO_LARGE"
