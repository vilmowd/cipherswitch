"""Reject request bodies before they are stored.

A sealed file is capped in the browser, but that check can be skipped.
This limit stops a direct upload from buffering tens of gigabytes.
"""

from starlette.responses import JSONResponse

MAX_BODY_BYTES = 8_000_000
MAX_CIPHERTEXT_CHARS = 6_500_000
TOO_LARGE = "That upload is too large. Each file can be up to 1.5 MB, and 3 MB combined."


class BodyLimitMiddleware:
    def __init__(self, app, max_bytes: int = MAX_BODY_BYTES):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") in ("GET", "HEAD", "OPTIONS"):
            await self.app(scope, receive, send)
            return

        headers = {name.lower(): value for name, value in scope.get("headers", [])}
        raw_length = headers.get(b"content-length")
        if raw_length is not None:
            try:
                announced = int(raw_length)
            except ValueError:
                announced = self.max_bytes + 1
            if announced > self.max_bytes:
                response = JSONResponse({"detail": TOO_LARGE}, status_code=413)
                await response(scope, receive, send)
                return

        body = b""
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                continue
            body += message.get("body", b"") or b""
            if len(body) > self.max_bytes:
                response = JSONResponse({"detail": TOO_LARGE}, status_code=413)
                await response(scope, receive, send)
                return
            if not message.get("more_body", False):
                break

        sent = False

        async def replay():
            nonlocal sent
            if sent:
                return {"type": "http.request", "body": b"", "more_body": False}
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay, send)
