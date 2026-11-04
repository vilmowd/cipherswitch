"""Request bodies over the cap are refused before the app stores them."""

import unittest

from body_limit import MAX_BODY_BYTES, BodyLimitMiddleware


class BodyLimitTests(unittest.IsolatedAsyncioTestCase):
    async def _call(self, *, headers, messages, max_bytes=100):
        called = False

        async def app(scope, receive, send):
            nonlocal called
            called = True
            message = await receive()
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": message.get("body", b"")})

        sent = []

        async def send(message):
            sent.append(message)

        queue = list(messages)

        async def receive():
            if not queue:
                return {"type": "http.request", "body": b"", "more_body": False}
            return queue.pop(0)

        scope = {"type": "http", "method": "POST", "headers": headers}
        await BodyLimitMiddleware(app, max_bytes=max_bytes)(scope, receive, send)
        return called, sent

    async def test_small_body_reaches_the_app(self):
        called, sent = await self._call(
            headers=[(b"content-length", b"5")],
            messages=[{"type": "http.request", "body": b"hello", "more_body": False}],
        )
        self.assertTrue(called)
        self.assertEqual(sent[0]["status"], 200)
        self.assertEqual(sent[1]["body"], b"hello")

    async def test_announced_giant_body_never_reaches_the_app(self):
        called, sent = await self._call(
            headers=[(b"content-length", str(50 * 1024 * 1024 * 1024).encode())],
            messages=[{"type": "http.request", "body": b"x" * 1000, "more_body": True}],
        )
        self.assertFalse(called)
        self.assertEqual(sent[0]["status"], 413)
        self.assertLess(MAX_BODY_BYTES, 50 * 1024 * 1024)

    async def test_chunked_body_stops_at_the_cap(self):
        called, sent = await self._call(
            headers=[],
            messages=[
                {"type": "http.request", "body": b"x" * 60, "more_body": True},
                {"type": "http.request", "body": b"y" * 60, "more_body": False},
            ],
        )
        self.assertFalse(called)
        self.assertEqual(sent[0]["status"], 413)


if __name__ == "__main__":
    unittest.main()
