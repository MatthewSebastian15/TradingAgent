from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi.responses import JSONResponse

from errors import ApiError, error_payload


class InvalidContentLengthError(ApiError):
    def __init__(self, raw_value: str) -> None:
        super().__init__(
            400,
            "INVALID_CONTENT_LENGTH",
            "Content-Length must be a non-negative integer.",
            details={"content_length": raw_value},
        )


class RequestBodyTooLargeError(ApiError):
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
                content_length_value = int(content_length)
            except ValueError:
                await self._send_invalid_content_length(
                    send, content_length.decode("latin1", errors="replace")
                )
                return
            if content_length_value < 0:
                await self._send_invalid_content_length(send, str(content_length_value))
                return
            if content_length_value > self.max_bytes:
                await self._send_error(send)
                return

        received = 0

        async def limited_receive() -> dict:
            nonlocal received
            message = await receive()
            if message.get("type") == "http.request":
                received += len(message.get("body") or b"")
                if received > self.max_bytes:
                    raise RequestBodyTooLargeError(self.max_bytes)
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestBodyTooLargeError:
            await self._send_error(send)

    async def _send_invalid_content_length(self, send, raw_value: str) -> None:
        error = InvalidContentLengthError(raw_value)
        response = JSONResponse(status_code=error.status_code, content=error_payload(error))
        await response({"type": "http"}, None, send)

    async def _send_error(self, send) -> None:
        response = JSONResponse(
            status_code=413,
            content=error_payload(RequestBodyTooLargeError(self.max_bytes)),
        )
        await response({"type": "http"}, None, send)
