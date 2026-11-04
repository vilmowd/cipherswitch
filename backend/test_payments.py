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
        self.assertNotIn("vault_id", captured["metadata"])

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
        self.assertEqual(captured["metadata"]["vault_id"], VAULT)
        self.assertEqual(captured["line_items"][0]["price_data"]["unit_amount"], 500)
        self.assertEqual(captured["line_items"][0]["price_data"]["product_data"]["name"], "Travel mode")

    def test_a_paid_session_without_a_currency_field_still_counts(self):
        import stripe

        fake = stripe.checkout.Session.construct_from(
            {
                "id": "cs_test_paid",
                "object": "checkout.session",
                "payment_status": "paid",
                "amount_total": 1200,
                "metadata": {"purpose": "seal_fees", "fees": "extra_vault:1200"},
            },
            "sk_test_x",
        )
        with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
            with patch("billing.stripe.checkout.Session.list_line_items") as lines:
                _session_id, paid = billing.paid_fee_amounts("cs_test_nocurrency")
        lines.assert_not_called()
        self.assertEqual(paid, {"extra_vault": 1200})

    def test_a_paid_checkout_without_metadata_uses_the_line_item_name(self):
        import stripe

        fake = stripe.checkout.Session.construct_from(
            {
                "id": "cs_test_paid",
                "object": "checkout.session",
                "payment_status": "paid",
                "currency": "usd",
                "amount_total": 1200,
            },
            "sk_test_x",
        )
        listed = SimpleNamespace(
            data=[SimpleNamespace(description="Another vault", amount_total=1200)]
        )
        with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
            with patch("billing.stripe.checkout.Session.list_line_items", return_value=listed):
                _session_id, paid = billing.paid_fee_amounts("cs_test_lines")
        self.assertEqual(paid, {"extra_vault": 1200})

    def test_a_smaller_line_does_not_count_as_another_vault(self):
        fake = session(amount_total=500, metadata={})
        listed = SimpleNamespace(
            data=[SimpleNamespace(description="Another vault", amount_total=500)]
        )
        with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
            with patch("billing.stripe.checkout.Session.list_line_items", return_value=listed):
                with self.assertRaises(HTTPException) as caught:
                    billing.paid_fee_amounts("cs_test_small")
        self.assertEqual(caught.exception.status_code, 400)

    def _stripe_session(self, **fields):
        import stripe

        body = {
            "id": "cs_test_paid",
            "object": "checkout.session",
            "payment_status": "paid",
            "amount_total": 0,
        }
        body.update(fields)
        return stripe.checkout.Session.construct_from(body, "sk_test_x")

    def test_each_fee_is_accepted_without_a_currency_field(self):
        catalog = billing.catalog()
        for code, row in catalog.items():
            fake = self._stripe_session(
                amount_total=row["cents"],
                metadata={"purpose": "seal_fees", "fees": f"{code}:{row['cents']}"},
            )
            with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
                _session_id, paid = billing.paid_fee_amounts(f"cs_test_{code}")
            self.assertEqual(paid, {code: row["cents"]})

    def test_one_checkout_can_cover_every_fee_together(self):
        catalog = billing.catalog()
        encoded = ",".join(f"{code}:{row['cents']}" for code, row in catalog.items())
        total = sum(row["cents"] for row in catalog.values())
        fake = self._stripe_session(
            amount_total=total,
            metadata={"purpose": "seal_fees", "fees": encoded},
        )
        with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
            _session_id, paid = billing.paid_fee_amounts("cs_test_all")
        self.assertEqual(paid, {code: row["cents"] for code, row in catalog.items()})
        required = billing.seal_fees(
            extra_vault=True,
            recipient_count=2,
            has_files=True,
            has_time_lock=True,
            has_travel=True,
        )
        self.assertEqual(billing.missing_fees(required, paid), [])

    def test_dashboard_travel_is_accepted_without_a_currency_field(self):
        fake = self._stripe_session(
            amount_total=500,
            metadata={"purpose": "premium_travel", "fees": "travel:500", "vault_id": VAULT},
        )
        with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
            self.assertEqual(
                billing.assert_payment_available("cs_test_travel", billing.PURPOSE_TRAVEL, VAULT),
                "cs_test_travel",
            )

    def test_an_older_travel_charge_without_metadata_still_counts(self):
        fake = self._stripe_session(amount_total=500, currency="usd")
        listed = SimpleNamespace(
            data=[SimpleNamespace(description="CipherSwitch travel mode", amount_total=500)]
        )
        with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
            with patch("billing.stripe.checkout.Session.list_line_items", return_value=listed):
                self.assertEqual(
                    billing.assert_payment_available("cs_test_old_travel", billing.PURPOSE_TRAVEL, VAULT),
                    "cs_test_old_travel",
                )

    def test_a_file_payment_cannot_turn_on_travel(self):
        fake = self._stripe_session(
            amount_total=300,
            metadata={"purpose": "seal_fees", "fees": "files:300", "vault_id": VAULT},
        )
        with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
            with self.assertRaises(HTTPException) as caught:
                billing.assert_payment_available("cs_test_files", billing.PURPOSE_TRAVEL, VAULT)
        self.assertEqual(caught.exception.status_code, 400)

    def test_a_travel_payment_cannot_seal_another_vault(self):
        fake = self._stripe_session(
            amount_total=500,
            metadata={"purpose": "premium_travel", "fees": "travel:500", "vault_id": VAULT},
        )
        with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
            with self.assertRaises(HTTPException) as caught:
                billing.paid_fee_amounts("cs_test_travel", VAULT)
        self.assertEqual(caught.exception.status_code, 400)

    def test_adding_files_uses_only_the_file_fee(self):
        fake = self._stripe_session(
            amount_total=300,
            metadata={"purpose": "seal_fees", "fees": "files:300", "vault_id": VAULT},
        )
        with patch("billing.stripe.checkout.Session.retrieve", return_value=fake):
            _session_id, paid = billing.paid_fee_amounts("cs_test_edit", VAULT)
        self.assertEqual(billing.missing_fees(
            [billing.Fee("files", "Encrypted files", 300)],
            paid,
        ), [])
        self.assertEqual(
            [fee.code for fee in billing.missing_fees(
                billing.seal_fees(
                    extra_vault=True,
                    recipient_count=1,
                    has_files=True,
                    has_time_lock=False,
                    has_travel=False,
                ),
                paid,
            )],
            ["extra_vault"],
        )

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
