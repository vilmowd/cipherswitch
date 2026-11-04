"""Resend transactional email helpers for CipherSwitch."""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Optional
from urllib.parse import quote

logger = logging.getLogger("vault.email")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
EMAIL_FROM = os.getenv(
    "EMAIL_FROM",
    "CipherSwitch <onboarding@resend.dev>",
).strip()


def is_configured() -> bool:
    return bool(RESEND_API_KEY)


def _send(*, to: str, subject: str, html: str, text: str) -> bool:
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skip email to=%s subject=%s", to, subject)
        return False
    try:
        import resend

        resend.api_key = RESEND_API_KEY
        result = resend.Emails.send(
            {
                "from": EMAIL_FROM,
                "to": [to],
                "subject": subject,
                "html": html,
                "text": text,
            }
        )
        logger.info("Email sent to=%s id=%s", to, getattr(result, "id", result))
        return True
    except Exception:  # noqa: BLE001
        logger.exception("Failed to send email to=%s subject=%s", to, subject)
        return False


def _layout(title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f8fb;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1a1f2c;">
<table width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;"><tr><td align="center">
<table width="560" style="background:#fff;border-radius:20px;padding:32px;border:1px solid #e8eef5;">
<tr><td style="font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#5da8de;">CipherSwitch</td></tr>
<tr><td style="padding-top:12px;font-size:24px;font-weight:800;">{title}</td></tr>
<tr><td style="padding-top:16px;font-size:15px;line-height:1.6;color:#5a6578;">{body_html}</td></tr>
<tr><td style="padding-top:28px;font-size:12px;color:#8b95a8;">We never email your passphrase.</td></tr>
</table></td></tr></table></body></html>"""


def build_ping_url(token: str) -> str:
    return f"{FRONTEND_URL}/ping#token={quote(token, safe='')}"


def build_unlock_url(vault_id: str, unlock_token: str) -> str:
    return f"{FRONTEND_URL}/unlock/{vault_id}#unlock={quote(unlock_token, safe='')}"


def build_dashboard_url(access_token: str) -> str:
    return f"{FRONTEND_URL}/dashboard#access={quote(access_token, safe='')}"


def send_vault_created_owner(
    *,
    owner_email: str,
    vault_id: str,
    ping_token: str,
    next_ping_due: datetime,
    interval_days: int,
    owner_access_token: str,
    is_dry_run: bool = False,
) -> bool:
    ping_url = build_ping_url(ping_token)
    dash = build_dashboard_url(owner_access_token)
    due = next_ping_due.strftime("%Y-%m-%d %H:%M UTC")
    dry = " <strong>(dry-run)</strong>" if is_dry_run else ""
    html = _layout(
        f"Your vault is sealed{dry}",
        f"""
        <p>Vault <strong>{vault_id}</strong> is active. Check in every <strong>{interval_days}</strong> day(s). Next: <strong>{due}</strong>.</p>
        <p>Your dashboard code is below. It is not your email address. The email address alone cannot open the dashboard.</p>
        <p style="word-break:break-all;font-family:ui-monospace,monospace;font-size:13px;color:#1a1f2c;">{owner_access_token}</p>
        <p><a href="{dash}">Open your dashboard</a></p>
        <p><a href="{ping_url}" style="display:inline-block;background:#5da8de;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;">Check in</a></p>
        <p style="word-break:break-all;font-size:12px;">{ping_url}</p>
        """,
    )
    return _send(
        to=owner_email,
        subject="CipherSwitch — dashboard code and check-in link",
        html=html,
        text=(
            f"Vault {vault_id} sealed.\n"
            f"Dashboard code (not your email address): {owner_access_token}\n"
            f"Dashboard: {dash}\n"
            f"Check-in: {ping_url}\n"
        ),
    )


def send_vault_created_recipient(
    *,
    recipient_email: str,
    vault_id: str,
    unlock_token: str,
    role: str = "primary",
    release_delay_days: int = 0,
    is_dry_run: bool = False,
) -> bool:
    unlock_url = build_unlock_url(vault_id, unlock_token)
    dry = " (dry-run test)" if is_dry_run else ""
    delay = (
        f"<p>Your role is <strong>{role}</strong> with a <strong>{release_delay_days}-day</strong> delay after trigger.</p>"
        if release_delay_days
        else f"<p>Your role: <strong>{role}</strong>.</p>"
    )
    html = _layout(
        f"You’ve been named as a recipient{dry}",
        f"""
        <p>Save this unlock link. You’ll also need the passphrase shared separately.</p>
        {delay}
        <p><a href="{unlock_url}" style="display:inline-block;background:#5da8de;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;">Save unlock link</a></p>
        <p style="word-break:break-all;font-size:12px;">{unlock_url}</p>
        """,
    )
    return _send(
        to=recipient_email,
        subject="CipherSwitch — save your unlock link",
        html=html,
        text=f"Recipient for vault {vault_id} ({role}). Unlock: {unlock_url}\n",
    )


def send_witness_named(*, witness_email: str, vault_id: str) -> bool:
    html = _layout(
        "You’re a witness",
        f"""
        <p>You’ve been named as a <strong>witness</strong> for vault <strong>{vault_id}</strong>.</p>
        <p>You cannot decrypt the contents. You’ll only be notified if/when the vault triggers.</p>
        """,
    )
    return _send(
        to=witness_email,
        subject="CipherSwitch — witness nomination",
        html=html,
        text=f"You are a witness for vault {vault_id}. You will be notified on trigger.\n",
    )


def send_ping_rotated(
    *,
    owner_email: str,
    vault_id: str,
    new_ping_token: str,
    next_ping_due: datetime,
) -> bool:
    ping_url = build_ping_url(new_ping_token)
    due = next_ping_due.strftime("%Y-%m-%d %H:%M UTC")
    html = _layout(
        "Check-in confirmed — new link",
        f"""
        <p>Vault <strong>{vault_id}</strong> next deadline: <strong>{due}</strong>.</p>
        <p><a href="{ping_url}" style="display:inline-block;background:#5da8de;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;">Save new check-in link</a></p>
        """,
    )
    return _send(
        to=owner_email,
        subject="CipherSwitch — new check-in link",
        html=html,
        text=f"Check-in OK for {vault_id}. New link: {ping_url}\n",
    )


def send_deadline_reminder(
    *,
    owner_email: str,
    vault_id: str,
    next_ping_due: datetime,
    stage: str = "warning",
) -> bool:
    due = next_ping_due.strftime("%Y-%m-%d %H:%M UTC")
    title = "Grace period started" if stage == "grace" else "Check-in reminder"
    html = _layout(
        title,
        f"""
        <p>Vault <strong>{vault_id}</strong> deadline: <strong>{due}</strong>.</p>
        <p>Use your latest check-in link from email or the dashboard.</p>
        <p><a href="{FRONTEND_URL}/ping" style="display:inline-block;background:#5da8de;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;">Go to check-in</a></p>
        """,
    )
    return _send(
        to=owner_email,
        subject=f"CipherSwitch — {title.lower()}",
        html=html,
        text=f"Vault {vault_id} needs check-in by {due}.\n",
    )


def send_vault_triggered_recipient(
    *,
    recipient_email: str,
    vault_id: str,
    is_dry_run: bool = False,
) -> bool:
    path = f"{FRONTEND_URL}/unlock/{vault_id}"
    dry = " (dry-run)" if is_dry_run else ""
    html = _layout(
        f"Vault released to you{dry}",
        f"""
        <p>Vault <strong>{vault_id}</strong> is <strong>TRIGGERED</strong>.</p>
        <p>Use your unlock link (with <code>#unlock=</code>) from the earlier email + passphrase.</p>
        <p><a href="{path}" style="display:inline-block;background:#5da8de;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;">Open unlock page</a></p>
        """,
    )
    return _send(
        to=recipient_email,
        subject="CipherSwitch — vault released",
        html=html,
        text=f"Vault {vault_id} TRIGGERED. Open {path}\n",
    )


def send_vault_triggered_witness(
    *,
    witness_email: str,
    vault_id: str,
    is_dry_run: bool = False,
) -> bool:
    dry = " (dry-run)" if is_dry_run else ""
    html = _layout(
        f"Witness notice — vault triggered{dry}",
        f"<p>Vault <strong>{vault_id}</strong> has triggered. As a witness you cannot decrypt contents.</p>",
    )
    return _send(
        to=witness_email,
        subject="CipherSwitch — witness: vault triggered",
        html=html,
        text=f"Witness notice: vault {vault_id} triggered.\n",
    )


def send_vault_triggered_owner(
    *,
    owner_email: str,
    vault_id: str,
    is_dry_run: bool = False,
) -> bool:
    dry = " (dry-run)" if is_dry_run else ""
    html = _layout(
        f"Your vault was triggered{dry}",
        f"<p>Vault <strong>{vault_id}</strong> is now available to recipients. Check-ins are closed.</p>",
    )
    return _send(
        to=owner_email,
        subject="CipherSwitch — vault triggered",
        html=html,
        text=f"Vault {vault_id} triggered.\n",
    )


# Back-compat alias used by older worker snippets
def send_vault_triggered(
    *,
    recipient_email: str,
    owner_email: str,
    vault_id: str,
) -> tuple[bool, bool]:
    a = send_vault_triggered_recipient(
        recipient_email=recipient_email, vault_id=vault_id
    )
    b = send_vault_triggered_owner(owner_email=owner_email, vault_id=vault_id)
    return a, b
