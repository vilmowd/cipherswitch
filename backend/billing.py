"""One-time Stripe payments for a single premium action."""

from __future__ import annotations

import os
from typing import Optional

import stripe
from fastapi import HTTPException, status

import database as db

PURPOSE_SEAL = "premium_seal"
PURPOSE_TRAVEL = "premium_travel"


def price_cents() -> int:
    raw = os.getenv("PREMIUM_PRICE_CENTS", "500").strip()
    try:
        cents = int(raw)
    except ValueError:
        cents = 500
    return max(50, cents)


def price_label() -> str:
    cents = price_cents()
    if cents % 100 == 0:
        return f"${cents // 100}"
    return f"${cents / 100:.2f}"


def _secret() -> str:
    return os.getenv("STRIPE_SECRET_KEY", "").strip()


def _frontend() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")


def vault_needs_payment(body) -> bool:
    if len(body.recipients) > 1:
        return True
    if body.has_attachments:
        return True
    if body.travel_until is not None:
        return True
    if body.release_at is not None:
        return True
    return False


def create_checkout(*, purpose: str, vault_id: Optional[str] = None) -> str:
    secret = _secret()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments are not configured yet.",
        )
    stripe.api_key = secret
    frontend = _frontend()
    if purpose == PURPOSE_TRAVEL:
        if not vault_id:
            raise HTTPException(status_code=400, detail="vault_id is required")
        success = (
            f"{frontend}/dashboard?travel_paid={{CHECKOUT_SESSION_ID}}&vault={vault_id}"
        )
        cancel = f"{frontend}/dashboard?travel_canceled=1"
        name = "CipherSwitch travel mode"
    else:
        success = f"{frontend}/create?paid={{CHECKOUT_SESSION_ID}}"
        cancel = f"{frontend}/create?canceled=1"
        name = "CipherSwitch premium seal"
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            success_url=success,
            cancel_url=cancel,
            metadata={"purpose": purpose, "vault_id": vault_id or ""},
            line_items=[
                {
                    "quantity": 1,
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": price_cents(),
                        "product_data": {
                            "name": name,
                            "description": "One use. The next use is charged again.",
                        },
                    },
                }
            ],
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not start checkout.",
        ) from exc
    if not session.url:
        raise HTTPException(status_code=502, detail="Checkout did not return a URL.")
    return session.url


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
    if session.payment_status != "paid":
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Payment is not complete.",
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
