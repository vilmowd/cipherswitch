"""Worker: reminders, grace period, time-lock, hard trigger + emails."""

from __future__ import annotations

import logging
import os
import signal
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import database as db
import email_service

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("vault.worker")

POLL_INTERVAL_SECONDS = int(os.getenv("WORKER_POLL_INTERVAL", "30"))
REMINDER_HOURS = int(os.getenv("REMINDER_HOURS_BEFORE", "48"))
_shutdown = False


def _handle_signal(signum: int, _frame: Any) -> None:
    global _shutdown
    logger.info("Received signal %s — shutting down worker", signum)
    _shutdown = True


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: object) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _opt_dt(value: object) -> Optional[datetime]:
    if value is None or value == "":
        return None
    return _parse_dt(value)


def _sql_val(dt: datetime):
    return dt.isoformat() if db.is_sqlite() else dt


def send_upcoming_reminders() -> int:
    """Warn owners ~REMINDER_HOURS before next_ping_due (ACTIVE only)."""
    now = _utcnow()
    window_end = now + timedelta(hours=REMINDER_HOURS)
    count = 0
    rows = db.fetch_all(
        """
        SELECT id, owner_email, next_ping_due, reminder_sent_at
        FROM vaults
        WHERE status = 'ACTIVE'
          AND next_ping_due > %s
          AND next_ping_due <= %s
          AND reminder_sent_at IS NULL
        """,
        (_sql_val(now), _sql_val(window_end)),
    )
    for row in rows:
        email_service.send_deadline_reminder(
            owner_email=row["owner_email"],
            vault_id=str(row["id"]),
            next_ping_due=_parse_dt(row["next_ping_due"]),
            stage="warning",
        )
        db.execute(
            "UPDATE vaults SET reminder_sent_at = %s WHERE id = %s",
            (_sql_val(now), str(row["id"])),
        )
        count += 1
    return count


def enter_grace_period() -> int:
    """ACTIVE vaults past next_ping_due with grace_days > 0 → GRACE."""
    now = _utcnow()
    count = 0
    rows = db.fetch_all(
        """
        SELECT id, owner_email, next_ping_due, grace_days
        FROM vaults
        WHERE status = 'ACTIVE'
          AND next_ping_due < %s
          AND grace_days > 0
        """,
        (_sql_val(now),),
    )
    for row in rows:
        db.execute(
            """
            UPDATE vaults
            SET status = 'GRACE', grace_started_at = %s
            WHERE id = %s AND status = 'ACTIVE'
            """,
            (_sql_val(now), str(row["id"])),
        )
        email_service.send_deadline_reminder(
            owner_email=row["owner_email"],
            vault_id=str(row["id"]),
            next_ping_due=_parse_dt(row["next_ping_due"]),
            stage="grace",
        )
        count += 1
        logger.warning("Vault entered GRACE id=%s", row["id"])
    return count


def hard_trigger_vaults() -> int:
    """Trigger when grace expired, or ACTIVE with grace_days=0 overdue, or release_at passed."""
    now = _utcnow()
    count = 0

    candidates = db.fetch_all(
        """
        SELECT * FROM vaults
        WHERE status IN ('ACTIVE', 'GRACE')
        """
    )

    for vault in candidates:
        should = False
        release_at = _opt_dt(vault.get("release_at"))
        next_due = _parse_dt(vault["next_ping_due"])
        grace_days = int(vault.get("grace_days") or 0)
        grace_started = _opt_dt(vault.get("grace_started_at"))

        if release_at and release_at <= now:
            should = True
        elif vault["status"] == "ACTIVE" and next_due < now and grace_days == 0:
            should = True
        elif vault["status"] == "GRACE" and grace_started:
            if now >= grace_started + timedelta(days=grace_days):
                should = True
        elif vault["status"] == "ACTIVE" and next_due < now and grace_days > 0:
            # enter_grace should handle; skip here
            should = False

        if not should:
            continue

        db.execute(
            """
            UPDATE vaults
            SET status = 'TRIGGERED', triggered_at = %s
            WHERE id = %s AND status IN ('ACTIVE', 'GRACE')
            """,
            (_sql_val(now), str(vault["id"])),
        )
        _notify_owner(vault)
        count += 1
        logger.warning("Vault TRIGGERED id=%s dry_run=%s", vault["id"], vault.get("is_dry_run"))

    return count


def _notify_owner(vault: dict[str, Any]) -> None:
    email_service.send_vault_triggered_owner(
        owner_email=vault["owner_email"],
        vault_id=str(vault["id"]),
        is_dry_run=bool(vault.get("is_dry_run")),
    )


def deliver_pending_releases() -> int:
    """Email recipients only after a vault has triggered, honoring a release delay."""
    now = _utcnow()
    rows = db.fetch_all(
        """
        SELECT r.id AS recipient_id, r.email, r.role, r.release_delay_days,
               v.id AS vault_id, v.release_title, v.release_message, v.release_files,
               v.is_dry_run, v.triggered_at, v.has_attachments
        FROM recipients r
        JOIN vaults v ON v.id = r.vault_id
        WHERE v.status = 'TRIGGERED' AND r.content_sent_at IS NULL
        """
    )
    sent = 0
    for row in rows:
        delay = int(row.get("release_delay_days") or 0)
        triggered = _opt_dt(row.get("triggered_at"))
        if row["role"] != "witness" and delay > 0 and triggered and now < triggered + timedelta(days=delay):
            continue
        vault_id = str(row["vault_id"])
        is_dry = bool(row.get("is_dry_run"))
        if row["role"] == "witness":
            ok = email_service.send_vault_triggered_witness(
                witness_email=row["email"],
                vault_id=vault_id,
                is_dry_run=is_dry,
            )
        else:
            ok = email_service.send_vault_triggered_recipient(
                recipient_email=row["email"],
                vault_id=vault_id,
                is_dry_run=is_dry,
                has_attachments=bool(row.get("has_attachments")),
                title=row.get("release_title") or "",
                message=row.get("release_message") or "",
                files_json=row.get("release_files") or "",
            )
        if not ok:
            continue
        db.execute(
            """
            UPDATE recipients
            SET content_sent_at = %s
            WHERE id = %s AND content_sent_at IS NULL
            """,
            (now.isoformat(), str(row["recipient_id"])),
        )
        sent += 1
    return sent


def run_loop() -> None:
    logger.info(
        "Worker started (poll=%ss reminder=%sh resend=%s)",
        POLL_INTERVAL_SECONDS,
        REMINDER_HOURS,
        "on" if email_service.is_configured() else "off",
    )
    db.init_pool(minconn=1, maxconn=3)
    db.init_schema()

    while not _shutdown:
        try:
            r = send_upcoming_reminders()
            g = enter_grace_period()
            t = hard_trigger_vaults()
            d = deliver_pending_releases()
            if r or g or t or d:
                logger.info("tick reminders=%s grace=%s triggered=%s released=%s", r, g, t, d)
        except Exception:  # noqa: BLE001
            logger.exception("Worker iteration failed")

        for _ in range(POLL_INTERVAL_SECONDS):
            if _shutdown:
                break
            time.sleep(1)

    db.close_pool()
    logger.info("Worker stopped")


def main() -> None:
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)
    try:
        run_loop()
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
