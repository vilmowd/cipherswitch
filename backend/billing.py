"""One-time Stripe payments for a single premium action."""

from __future__ import annotations

import os
from typing import Optional
from urllib.parse import urlparse
from uuid import UUID

import stripe
from fastapi import HTTPException, status

import database as db

PURPOSE_SEAL = "premium_seal"
PURPOSE_TRAVEL = "premium_travel"
PURPOSE_EXTRA = "extra_vault"


def price_cents() -> int:
    raw = os.getenv("PREMIUM_PRICE_CENTS", "500").strip()
    try:
        cents = int(raw)
    except ValueError:
        cents = 500
    return max(50, cents)


def price_label() -> str:
    return _money(price_cents())


def extra_vault_cents() -> int:
    raw = os.getenv("EXTRA_VAULT_PRICE_CENTS", "1200").strip()
    try:
        cents = int(raw)
    except ValueError:
        cents = 1200
    return max(50, cents)


def extra_vault_label() -> str:
    return _money(extra_vault_cents())


def _money(cents: int) -> str:
    if cents % 100 == 0:
        return f"${cents // 100}"
    return f"${cents / 100:.2f}"


def email_has_vault(owner_email: str) -> bool:
    """True when this email still has a vault that has not been released."""
    row = db.fetch_one(
        """
        SELECT 1 AS ok FROM vaults
        WHERE owner_email = %s AND status IN ('ACTIVE', 'GRACE')
        LIMIT 1
        """,
        (owner_email.strip().lower(),),
    )
    return row is not None


def _secret() -> str:
    return os.getenv("STRIPE_SECRET_KEY", "").strip()


def _frontend() -> str:
    raw = os.getenv("FRONTEND_URL", "http://localhost:3000").strip().rstrip("/")
    if raw and not raw.startswith(("http://", "https://")):
        raw = "https://" + raw.lstrip("/")
    parsed = urlparse(raw)
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise HTTPException(status_code=500, detail="Could not start checkout.")
    return raw


COMFORT_CAP_CENTS = 500
# Ciphertext larger than this is treated as a file seal. The server cannot
# read the message, so size is the check that cannot be skipped.
LARGE_PAYLOAD_CHARS = 24_000


class Fee:
    def __init__(self, code: str, name: str, cents: int) -> None:
        self.code = code
        self.name = name
        self.cents = cents


def _capped_cents(env_name: str, default: int) -> int:
    raw = os.getenv(env_name, str(default)).strip()
    try:
        cents = int(raw)
    except ValueError:
        cents = default
    return min(COMFORT_CAP_CENTS, max(50, cents))


def recipients_cents() -> int:
    return _capped_cents("RECIPIENTS_PRICE_CENTS", 300)


def files_cents() -> int:
    return _capped_cents("FILES_PRICE_CENTS", 300)


def time_lock_cents() -> int:
    return _capped_cents("TIME_LOCK_PRICE_CENTS", 200)


def travel_cents() -> int:
    return _capped_cents("TRAVEL_PRICE_CENTS", 500)


def edit_needs_file_fee(*, already_has_files: bool, has_files: bool) -> bool:
    return has_files and not already_has_files


def payload_has_files(body) -> bool:
    if getattr(body, "has_attachments", False):
        return True
    if getattr(body, "release_files", None):
        return True
    payload = getattr(body, "encrypted_payload", "") or ""
    return len(payload) > LARGE_PAYLOAD_CHARS


def seal_fees(
    *,
    extra_vault: bool,
    recipient_count: int,
    has_files: bool,
    has_time_lock: bool,
    has_travel: bool,
) -> list[Fee]:
    fees: list[Fee] = []
    if extra_vault:
        fees.append(Fee("extra_vault", "Another vault", extra_vault_cents()))
    if recipient_count > 1:
        fees.append(Fee("recipients", "Extra recipients", recipients_cents()))
    if has_files:
        fees.append(Fee("files", "Encrypted files", files_cents()))
    if has_time_lock:
        fees.append(Fee("time_lock", "Time-lock", time_lock_cents()))
    if has_travel:
        fees.append(Fee("travel", "Travel mode", travel_cents()))
    return fees


def encode_fees(fees: list[Fee]) -> str:
    return ",".join(f"{fee.code}:{fee.cents}" for fee in fees)


def decode_fees(raw: str) -> dict[str, int]:
    paid: dict[str, int] = {}
    for part in (raw or "").split(","):
        if ":" not in part:
            continue
        code, amount = part.split(":", 1)
        try:
            paid[code.strip()] = int(amount)
        except ValueError:
            continue
    return paid


def catalog() -> dict:
    rows = [
        ("recipients", "Extra recipients", recipients_cents()),
        ("files", "Encrypted files", files_cents()),
        ("time_lock", "Time-lock", time_lock_cents()),
        ("travel", "Travel mode", travel_cents()),
        ("extra_vault", "Another vault", extra_vault_cents()),
    ]
    return {
        code: {"name": name, "cents": cents, "label": _money(cents)}
        for code, name, cents in rows
    }


def assert_checkout_url(url: str) -> str:
    parsed = urlparse(url or "")
    if parsed.scheme != "https" or parsed.hostname != "checkout.stripe.com":
        raise HTTPException(status_code=502, detail="Checkout did not return a URL.")
    return url


def _vault_id(vault_id: Optional[str]) -> Optional[str]:
    if not vault_id:
        return None
    try:
        return str(UUID(str(vault_id)))
    except ValueError:
        raise HTTPException(status_code=400, detail="vault_id is invalid") from None


def create_checkout(
    *,
    purpose: str,
    vault_id: Optional[str] = None,
    fees: Optional[list[Fee]] = None,
    return_to: str = "create",
) -> str:
    secret = _secret()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments are not configured yet.",
        )
    stripe.api_key = secret
    frontend = _frontend()
    vault_id = _vault_id(vault_id)
    line_fees = list(fees or [])
    if purpose == PURPOSE_TRAVEL:
        if not vault_id:
            raise HTTPException(status_code=400, detail="vault_id is required")
        success = (
            f"{frontend}/dashboard?travel_paid={{CHECKOUT_SESSION_ID}}&vault={vault_id}"
        )
        cancel = f"{frontend}/dashboard?travel_canceled=1"
        line_fees = [Fee("travel", "CipherSwitch travel mode", travel_cents())]
    elif purpose == "seal_fees":
        if not line_fees:
            raise HTTPException(status_code=400, detail="Nothing to pay for.")
        if return_to == "edit":
            success = f"{frontend}/dashboard?edit_paid={{CHECKOUT_SESSION_ID}}"
            cancel = f"{frontend}/dashboard?edit_canceled=1"
        else:
            success = f"{frontend}/create?paid={{CHECKOUT_SESSION_ID}}"
            cancel = f"{frontend}/create?canceled=1"
    else:
        raise HTTPException(status_code=400, detail="Unknown checkout.")
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            success_url=success,
            cancel_url=cancel,
            metadata={
                "purpose": purpose,
                "vault_id": vault_id or "",
                "fees": encode_fees(line_fees),
            },
            line_items=[
                {
                    "quantity": 1,
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": fee.cents,
                        "product_data": {
                            "name": fee.name,
                            "description": "One use. The next use is charged again.",
                        },
                    },
                }
                for fee in line_fees
            ],
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not start checkout.",
        ) from exc
    return assert_checkout_url(session.url or "")


def assert_payment_available(session_id: Optional[str], purpose: str, vault_id: Optional[str] = None) -> str:
    if not session_id or not session_id.strip():
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="This action is paid once per use. Pay to continue.",
        )
    session_id = session_id.strip()
    existing = db.fetch_one(
        "SELECT session_id FROM payments WHERE session_id = %s",
        (session_id,),
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="That payment was already used. Pay again to use this feature again.",
        )
    secret = _secret()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments are not configured yet.",
        )
    stripe.api_key = secret
    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment could not be verified.",
        ) from exc
    if session.payment_status != "paid" or (session.currency or "").lower() != "usd":
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Payment is not complete.",
        )
    if purpose == PURPOSE_TRAVEL and int(session.amount_total or 0) < travel_cents():
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Payment does not cover travel mode.",
        )
    meta = session.metadata or {}
    if meta.get("purpose") != purpose:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment does not match this action.",
        )
    if vault_id and meta.get("vault_id") != vault_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment does not match this vault.",
        )
    return session_id


def paid_fee_amounts(
    session_id: Optional[str],
    vault_id: Optional[str] = None,
) -> tuple[str, dict[str, int]]:
    """Return the session id and the cents paid toward each fee code."""
    if not session_id or not session_id.strip():
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="This action is paid once per use. Pay to continue.",
        )
    session_id = session_id.strip()
    existing = db.fetch_one(
        "SELECT session_id FROM payments WHERE session_id = %s",
        (session_id,),
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="That payment was already used. Pay again to use this feature again.",
        )
    secret = _secret()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments are not configured yet.",
        )
    stripe.api_key = secret
    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment could not be verified.",
        ) from exc
    if session.payment_status != "paid" or (session.currency or "").lower() != "usd":
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Payment is not complete.",
        )
    meta = session.metadata or {}
    if vault_id and meta.get("vault_id") and meta.get("vault_id") != str(vault_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment does not match this vault.",
        )
    purpose = meta.get("purpose") or ""
    amount = int(session.amount_total or 0)
    if purpose == "seal_fees":
        paid = decode_fees(meta.get("fees") or "")
        if not paid or amount < sum(paid.values()):
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Payment amount does not match the checkout.",
            )
    elif purpose == PURPOSE_SEAL and amount >= price_cents():
        # Older checkout: one payment covered comfort features, not another vault.
        paid = {
            "recipients": recipients_cents(),
            "files": files_cents(),
            "time_lock": time_lock_cents(),
            "travel": travel_cents(),
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment does not match this action.",
        )
    return session_id, paid


def missing_fees(required: list[Fee], paid: dict[str, int]) -> list[Fee]:
    return [fee for fee in required if int(paid.get(fee.code, 0)) < fee.cents]
