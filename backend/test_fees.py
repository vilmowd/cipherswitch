"""Fee rules. No Stripe and no database."""

import os
import unittest
from types import SimpleNamespace

import billing


class FeeRules(unittest.TestCase):
    def test_comfort_fees_stay_at_or_under_five_dollars(self):
        self.assertLessEqual(billing.recipients_cents(), 500)
        self.assertLessEqual(billing.files_cents(), 500)
        self.assertLessEqual(billing.time_lock_cents(), 500)
        self.assertLessEqual(billing.travel_cents(), 500)

    def test_env_cannot_raise_a_comfort_fee_over_five_dollars(self):
        previous = os.environ.get("TRAVEL_PRICE_CENTS")
        os.environ["TRAVEL_PRICE_CENTS"] = "5000"
        try:
            self.assertEqual(billing.travel_cents(), 500)
        finally:
            if previous is None:
                os.environ.pop("TRAVEL_PRICE_CENTS", None)
            else:
                os.environ["TRAVEL_PRICE_CENTS"] = previous

    def test_first_plain_vault_is_free(self):
        fees = billing.seal_fees(
            extra_vault=False,
            recipient_count=1,
            has_files=False,
            has_time_lock=False,
            has_travel=False,
        )
        self.assertEqual(fees, [])

    def test_each_comfort_fee_is_itemized(self):
        fees = billing.seal_fees(
            extra_vault=False,
            recipient_count=2,
            has_files=True,
            has_time_lock=True,
            has_travel=True,
        )
        codes = [fee.code for fee in fees]
        self.assertEqual(codes, ["recipients", "files", "time_lock", "travel"])
        self.assertEqual(sum(fee.cents for fee in fees), 300 + 300 + 200 + 500)

    def test_another_vault_is_twelve_dollars_and_stacks(self):
        fees = billing.seal_fees(
            extra_vault=True,
            recipient_count=2,
            has_files=False,
            has_time_lock=False,
            has_travel=False,
        )
        self.assertEqual([fee.code for fee in fees], ["extra_vault", "recipients"])
        self.assertEqual(fees[0].cents, 1200)
        self.assertEqual(fees[1].cents, 300)

    def test_a_cheaper_payment_does_not_cover_a_larger_fee(self):
        required = billing.seal_fees(
            extra_vault=True,
            recipient_count=1,
            has_files=True,
            has_time_lock=False,
            has_travel=False,
        )
        paid = {"extra_vault": 1200}
        missing = billing.missing_fees(required, paid)
        self.assertEqual([fee.code for fee in missing], ["files"])

    def test_payment_metadata_round_trip(self):
        fees = billing.seal_fees(
            extra_vault=False,
            recipient_count=3,
            has_files=True,
            has_time_lock=False,
            has_travel=False,
        )
        parsed = billing.decode_fees(billing.encode_fees(fees))
        self.assertEqual(parsed, {"recipients": 300, "files": 300})

    def test_editing_charges_for_files_only_when_the_vault_had_none(self):
        self.assertFalse(billing.edit_needs_file_fee(already_has_files=True, has_files=True))
        self.assertFalse(billing.edit_needs_file_fee(already_has_files=False, has_files=False))
        self.assertTrue(billing.edit_needs_file_fee(already_has_files=False, has_files=True))

    def test_large_ciphertext_counts_as_files(self):
        small = SimpleNamespace(has_attachments=False, encrypted_payload="a" * 100)
        large = SimpleNamespace(has_attachments=False, encrypted_payload="a" * 24_001)
        flagged = SimpleNamespace(has_attachments=True, encrypted_payload="a")
        self.assertFalse(billing.payload_has_files(small))
        self.assertTrue(billing.payload_has_files(large))
        self.assertTrue(billing.payload_has_files(flagged))


if __name__ == "__main__":
    unittest.main()
