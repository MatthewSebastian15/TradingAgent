from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi.responses import JSONResponse

from errors import ApiError, error_payload


class RequestBodyTooLarge(ApiError):
    def __init__(self, max_bytes: int) -> None:
        super().__init__(
            413,
            "REQUEST_BODY_TOO_LARGE",
            f"Request body exceeds the {max_bytes} byte limit.",
            details={"max_bytes": max_bytes},
        )


class RequestBodyLimitMiddleware:
    """Reject oversized request bodies before JSON parsing allocates memory."""

    def __init__(self, app, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max(1, int(max_bytes))

    async def __call__(self, scope, receive: Callable[[], Awaitable[dict]], send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        content_length = headers.get(b"content-length")
        if content_length:
            try:
                if int(content_length) > self.max_bytes:
                    await self._send_error(send)
                    return
            except ValueError:
                pass

        received = 0

        async def limited_receive() -> dict:
            nonlocal received
            message = await receive()
            if message.get("type") == "http.request":
                received += len(message.get("body") or b"")
                if received > self.max_bytes:
                    raise RequestBodyTooLarge(self.max_bytes)
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestBodyTooLarge:
            await self._send_error(send)

    async def _send_error(self, send) -> None:
        response = JSONResponse(
            status_code=413,
            content=error_payload(RequestBodyTooLarge(self.max_bytes)),
        )
        await response({"type": "http"}, None, send)
