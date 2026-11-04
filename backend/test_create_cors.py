"""A failed seal must still answer the browser, including after a paid return."""

import os
import tempfile
import unittest
from unittest.mock import patch

_fd, _db = tempfile.mkstemp(suffix=".sqlite3")
os.close(_fd)
os.environ["DATABASE_URL"] = "sqlite:///" + _db.replace("\\", "/")
os.environ["CORS_ORIGINS"] = "http://localhost:3000,cipherswitch.pro"

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


class CreateAnswersTheBrowser(unittest.TestCase):
    def test_a_bare_site_address_is_allowed(self):
        self.assertEqual(
            main.browser_origins("cipherswitch.pro, https://www.example.com"),
            ["https://cipherswitch.pro", "https://www.example.com"],
        )

    def test_an_unexpected_failure_still_sends_the_allowed_origin(self):
        with TestClient(main.app) as client:
            with patch("billing.email_has_vault", side_effect=RuntimeError("boom")):
                response = client.post(
                    "/api/billing/quote",
                    json={"owner_email": "owner@example.com"},
                    headers={"Origin": "http://localhost:3000"},
                )
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:3000")
        self.assertEqual(response.json()["detail"], "Something went wrong. Please try again.")

    def test_a_payment_refusal_is_not_turned_into_a_server_error(self):
        with TestClient(main.app) as client:
            response = client.post(
                "/api/billing/checkout",
                json={"purpose": "seal_fees", "recipient_count": 1},
                headers={"Origin": "https://cipherswitch.pro"},
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "https://cipherswitch.pro")

    def test_a_contact_message_is_emailed_to_the_configured_address(self):
        with TestClient(main.app) as client:
            with patch.dict(os.environ, {"CONTACT_EMAIL": "owner@example.com"}):
                with patch("email_service._send", return_value=True) as send:
                    response = client.post(
                        "/api/contact",
                        json={
                            "first_name": "Ada",
                            "last_name": "Lovelace",
                            "email": "ada@example.com",
                            "message": "Hello there",
                        },
                        headers={"Origin": "https://cipherswitch.pro"},
                    )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(send.call_args.kwargs["to"], "owner@example.com")
        self.assertEqual(send.call_args.kwargs["reply_to"], "ada@example.com")
        self.assertIn("Hello there", send.call_args.kwargs["text"])

    def test_contact_without_an_inbox_is_refused(self):
        with TestClient(main.app) as client:
            with patch.dict(os.environ, {"CONTACT_EMAIL": ""}):
                response = client.post(
                    "/api/contact",
                    json={
                        "first_name": "Ada",
                        "last_name": "Lovelace",
                        "email": "ada@example.com",
                        "message": "Hello there",
                    },
                )
        self.assertEqual(response.status_code, 503)

    def test_chrome_private_network_check_is_allowed(self):
        with TestClient(main.app) as client:
            response = client.options(
                "/api/vaults/create",
                headers={
                    "Origin": "https://cipherswitch.pro",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type",
                    "Access-Control-Request-Private-Network": "true",
                },
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-private-network"), "true")
        self.assertEqual(response.headers.get("access-control-allow-origin"), "https://cipherswitch.pro")


if __name__ == "__main__":
    unittest.main()
