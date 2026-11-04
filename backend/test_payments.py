"""Stripe payment checks with a fake Stripe client. No network and no database."""

import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import billing
from fastapi import HTTPException


VAULT = "11111111-1111-1111-1111-111111111111"


def session(**kwargs):
    defaults = {
        "payment_status": "paid",
        "currency": "usd",
        "amount_total": 500,
        "metadata": {},
        "url": "https://checkout.stripe.com/c/pay/cs_test_ok",
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class PaymentChecks(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"STRIPE_SECRET_KEY": "sk_test_x", "FRONTEND_URL": "https://cipherswitch.pro"})
        self.env.start()
        self.fetch = patch("billing.db.fetch_one", return_value=None)
        self.fetch.start()

    def tearDown(self):
        self.fetch.stop()
        self.env.stop()

    def test_a_paid_seal_returns_its_fee_codes(self):
        fake = session(
            amount_total=1500,
            metadata={"purpose": "seal_fees", "fees": "extra_vault:1200,files:300", "vault_id": ""},
        )
        with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
            session_id, paid = billing.paid_fee_amounts("cs_test_seal")
        self.assertEqual(session_id, "cs_test_seal")
        self.assertEqual(paid, {"extra_vault": 1200, "files": 300})

    def test_a_short_payment_is_rejected(self):
        fake = session(amount_total=100, metadata={"purpose": "seal_fees", "fees": "travel:500"})
        with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
            with self.assertRaises(HTTPException) as caught:
                billing.paid_fee_amounts("cs_test_short")
        self.assertEqual(caught.exception.status_code, 402)

    def test_an_unpaid_or_non_usd_session_is_rejected(self):
        for fake in (
            session(payment_status="unpaid", metadata={"purpose": "seal_fees", "fees": "files:300"}),
            session(currency="eur", metadata={"purpose": "seal_fees", "fees": "files:300"}, amount_total=300),
        ):
            with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
                with self.assertRaises(HTTPException) as caught:
                    billing.paid_fee_amounts("cs_test_bad")
            self.assertEqual(caught.exception.status_code, 402)

    def test_a_used_session_is_rejected_before_stripe_is_called(self):
        with patch("billing.db.fetch_one", return_value={"session_id": "cs_test_used"}):
            with patch("billing.stripe.checkout.Session.retrieve") as retrieve:
                with self.assertRaises(HTTPException) as caught:
                    billing.paid_fee_amounts("cs_test_used")
        retrieve.assert_not_called()
        self.assertEqual(caught.exception.status_code, 402)

    def test_an_old_bundle_covers_comfort_fees_but_not_another_vault(self):
        fake = session(amount_total=500, metadata={"purpose": "premium_seal"})
        with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
            _session_id, paid = billing.paid_fee_amounts("cs_test_legacy")
        required = billing.seal_fees(
            extra_vault=True,
            recipient_count=2,
            has_files=True,
            has_time_lock=True,
            has_travel=True,
        )
        missing = [fee.code for fee in billing.missing_fees(required, paid)]
        self.assertEqual(missing, ["extra_vault"])

    def test_a_travel_payment_must_match_the_vault_amount_and_currency(self):
        ok = session(
            amount_total=500,
            metadata={"purpose": "premium_travel", "vault_id": VAULT},
        )
        with patch("billing.stripe.checkout.Session.retrieve", return_value=ok):
            self.assertEqual(
                billing.assert_payment_available("cs_test_travel", billing.PURPOSE_TRAVEL, VAULT),
                "cs_test_travel",
            )
        wrong_vault = session(
            amount_total=500,
            metadata={"purpose": "premium_travel", "vault_id": "22222222-2222-2222-2222-222222222222"},
        )
        cheap = session(amount_total=100, metadata={"purpose": "premium_travel", "vault_id": VAULT})
        foreign = session(currency="eur", amount_total=500, metadata={"purpose": "premium_travel", "vault_id": VAULT})
        for fake, code in ((wrong_vault, 400), (cheap, 402), (foreign, 402)):
            with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
                with self.assertRaises(HTTPException) as caught:
                    billing.assert_payment_available("cs_test_travel", billing.PURPOSE_TRAVEL, VAULT)
            self.assertEqual(caught.exception.status_code, code)

    def test_a_file_payment_cannot_be_applied_to_a_different_vault(self):
        fake = session(
            amount_total=300,
            metadata={"purpose": "seal_fees", "fees": "files:300", "vault_id": VAULT},
        )
        with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
            with self.assertRaises(HTTPException) as caught:
                billing.paid_fee_amounts("cs_test_files", "33333333-3333-3333-3333-333333333333")
        self.assertEqual(caught.exception.status_code, 400)

    def test_checkout_return_url_keeps_the_stripe_placeholder(self):
        captured = {}

        def create(**kwargs):
            captured.update(kwargs)
            return session()

        with patch("billing.stripe.checkout.Session.create", side_effect=create):
            url = billing.create_checkout(
                purpose="seal_fees",
                fees=[billing.Fee("files", "Encrypted files", 300), billing.Fee("travel", "Travel mode", 500)],
            )
        self.assertEqual(url, "https://checkout.stripe.com/c/pay/cs_test_ok")
        self.assertIn("{CHECKOUT_SESSION_ID}", captured["success_url"])
        self.assertTrue(captured["success_url"].startswith("https://cipherswitch.pro/create?paid="))
        amounts = [item["price_data"]["unit_amount"] for item in captured["line_items"]]
        self.assertEqual(amounts, [300, 500])
        self.assertEqual(captured["metadata"]["purpose"], "seal_fees")

    def test_travel_checkout_returns_to_the_same_vault(self):
        captured = {}

        def create(**kwargs):
            captured.update(kwargs)
            return session()

        with patch("billing.stripe.checkout.Session.create", side_effect=create):
            billing.create_checkout(purpose=billing.PURPOSE_TRAVEL, vault_id=VAULT)
        self.assertIn(f"vault={VAULT}", captured["success_url"])
        self.assertIn("{CHECKOUT_SESSION_ID}", captured["success_url"])
        self.assertEqual(captured["metadata"]["purpose"], "premium_travel")
        self.assertEqual(captured["line_items"][0]["price_data"]["unit_amount"], 500)

    def test_a_bare_site_address_still_builds_an_https_return_url(self):
        os.environ["FRONTEND_URL"] = "cipherswitch.pro"
        captured = {}

        def create(**kwargs):
            captured.update(kwargs)
            return session()

        with patch("billing.stripe.checkout.Session.create", side_effect=create):
            billing.create_checkout(purpose=billing.PURPOSE_TRAVEL, vault_id=VAULT)
        self.assertTrue(captured["success_url"].startswith("https://cipherswitch.pro/dashboard?"))

    def test_checkout_refuses_a_site_address_with_a_password(self):
        os.environ["FRONTEND_URL"] = "https://user:secret@cipherswitch.pro"
        with self.assertRaises(HTTPException) as caught:
            billing.create_checkout(purpose=billing.PURPOSE_TRAVEL, vault_id=VAULT)
        self.assertEqual(caught.exception.status_code, 500)


if __name__ == "__main__":
    unittest.main()
