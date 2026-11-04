"""Resend transactional email helpers for CipherSwitch."""

from __future__ import annotations

import concurrent.futures
import json
import logging
import os
from datetime import datetime
from html import escape
from typing import Optional
from urllib.parse import quote

logger = logging.getLogger("vault.email")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
EMAIL_FROM = os.getenv(
    "EMAIL_FROM",
    "CipherSwitch <onboarding@resend.dev>",
).strip()


def _e(value: object) -> str:
    return escape(str(value), quote=True)


def is_configured() -> bool:
    return bool(RESEND_API_KEY)


def _send(
    *,
    to: str,
    subject: str,
    html: str,
    text: str,
    attachments: Optional[list[dict[str, str]]] = None,
) -> bool:
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skip email to=%s subject=%s", to, subject)
        return False
    payload: dict = {
        "from": EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
    }
    if attachments:
        payload["attachments"] = attachments

    def deliver() -> object:
        import resend

        resend.api_key = RESEND_API_KEY
        return resend.Emails.send(payload)

    # A stalled mail provider must not hold the seal request open until the
    # browser gives up and reports a CORS failure.
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        result = pool.submit(deliver).result(timeout=8)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to send email to=%s subject=%s", to, subject)
        return False
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    logger.info("Email sent to=%s id=%s", to, getattr(result, "id", result))
    return True


def _untrusted_file_notice(*, has_file: bool) -> tuple[str, str]:
    lead = (
        "This vault includes a file chosen by the person who sealed it."
        if has_file
        else "If this vault includes a file, that file was chosen by the person who sealed it."
    )
    text = (
        f"{lead} CipherSwitch cannot open or scan it. "
        "A file might be unsafe, including malware disguised as something important. "
        "Do not download or open a file unless you trust the sender, and scan it on your own device first."
    )
    html = (
        '<p style="margin-top:16px;padding:12px 14px;border:1px solid #e7c48a;'
        'border-radius:12px;background:#fff6e5;color:#1a1f2c;">'
        f"<strong>Before you open a file.</strong> {text}</p>"
    )
    return html, text


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
    return (
        f"{FRONTEND_URL}/unlock/{quote(str(vault_id), safe='')}"
        f"#unlock={quote(unlock_token, safe='')}"
    )


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
        <p>Vault <strong>{_e(vault_id)}</strong> is active. Check in every <strong>{_e(interval_days)}</strong> day(s). Next: <strong>{_e(due)}</strong>.</p>
        <p>Your dashboard code is below. It is not your email address. The email address alone cannot open the dashboard.</p>
        <p style="word-break:break-all;font-family:ui-monospace,monospace;font-size:13px;color:#1a1f2c;">{_e(owner_access_token)}</p>
        <p><a href="{_e(dash)}">Open your dashboard</a></p>
        <p><a href="{_e(ping_url)}" style="display:inline-block;background:#5da8de;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;">Check in</a></p>
        <p style="word-break:break-all;font-size:12px;">{_e(ping_url)}</p>
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
    has_attachments: bool = False,
) -> bool:
    unlock_url = build_unlock_url(vault_id, unlock_token)
    dry = " (dry-run test)" if is_dry_run else ""
    notice_html, notice_text = _untrusted_file_notice(has_file=has_attachments)
    delay = (
        f"<p>Your role is <strong>{_e(role)}</strong> with a <strong>{_e(release_delay_days)}-day</strong> delay after trigger.</p>"
        if release_delay_days
        else f"<p>Your role: <strong>{_e(role)}</strong>.</p>"
    )
    html = _layout(
        f"You’ve been named as a recipient{dry}",
        f"""
        <p>Save this unlock link. You’ll also need the passphrase shared separately.</p>
        {delay}
        {notice_html}
        <p><a href="{_e(unlock_url)}" style="display:inline-block;background:#5da8de;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;">Save unlock link</a></p>
        <p style="word-break:break-all;font-size:12px;">{_e(unlock_url)}</p>
        """,
    )
    return _send(
        to=recipient_email,
        subject="CipherSwitch — save your unlock link",
        html=html,
        text=(
            f"Recipient for vault {vault_id} ({role}). Unlock: {unlock_url}\n"
            f"Before you open a file. {notice_text}\n"
        ),
    )


def send_witness_named(*, witness_email: str, vault_id: str) -> bool:
    html = _layout(
        "You’re a witness",
        f"""
        <p>You’ve been named as a <strong>witness</strong> for vault <strong>{_e(vault_id)}</strong>.</p>
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
        <p>Vault <strong>{_e(vault_id)}</strong> next deadline: <strong>{_e(due)}</strong>.</p>
        <p><a href="{_e(ping_url)}" style="display:inline-block;background:#5da8de;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;">Save new check-in link</a></p>
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
        <p>Vault <strong>{_e(vault_id)}</strong> deadline: <strong>{_e(due)}</strong>.</p>
        <p>Use your latest check-in link from email or the dashboard.</p>
        <p><a href="{_e(FRONTEND_URL)}/ping" style="display:inline-block;background:#5da8de;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700;">Go to check-in</a></p>
        """,
    )
    return _send(
        to=owner_email,
        subject=f"CipherSwitch — {title.lower()}",
        html=html,
        text=f"Vault {vault_id} needs check-in by {due}.\n",
    )


def _release_attachments(files_json: str) -> list[dict[str, str]]:
    if not files_json:
        return []
    try:
        parsed = json.loads(files_json)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    attachments = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        data = str(item.get("data") or "").strip()
        if name and data:
            attachments.append({"filename": name, "content": data})
    return attachments


def send_vault_triggered_recipient(
    *,
    recipient_email: str,
    vault_id: str,
    is_dry_run: bool = False,
    has_attachments: bool = False,
    title: str = "",
    message: str = "",
    files_json: str = "",
) -> bool:
    dry = " (dry-run)" if is_dry_run else ""
    attachments = _release_attachments(files_json)
    notice_html, notice_text = _untrusted_file_notice(has_file=bool(attachments) or has_attachments)
    heading = " ".join(title.split())[:80] or "Vault released"
    if message.strip():
        body = (
            f"<p style=\"white-space:pre-wrap;color:#1a1f2c;\">{_e(message)}</p>"
            + (
                "<p>The archive files are attached to this email.</p>"
                if attachments
                else ""
            )
        )
        text = message + ("\n\nThe archive files are attached.\n" if attachments else "\n")
    else:
        body = (
            "<p>This vault triggered, but it was sealed before the release email "
            "included the message. Use the unlock link from the email you received "
            "when it was created, and the passphrase shared with you.</p>"
        )
        text = (
            f"Vault {vault_id} triggered. This seal has no release copy in the email. "
            "Use the earlier unlock link and the passphrase.\n"
        )
    html = _layout(
        f"{_e(heading)}{dry}",
        f"""
        <p>Vault <strong>{_e(vault_id)}</strong> is released.</p>
        {body}
        {notice_html}
        """,
    )
    return _send(
        to=recipient_email,
        subject=f"CipherSwitch — {heading}",
        html=html,
        text=f"{heading}\nVault {vault_id} released.\n{text}Before you open a file. {notice_text}\n",
        attachments=attachments or None,
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
        f"<p>Vault <strong>{_e(vault_id)}</strong> has triggered. As a witness you cannot decrypt contents.</p>",
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
        f"<p>Vault <strong>{_e(vault_id)}</strong> is now available to recipients. Check-ins are closed.</p>",
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
