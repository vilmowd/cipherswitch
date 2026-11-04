"""CipherSwitch API — zero-knowledge vaults with dashboard, grace, multi-recipient."""

from __future__ import annotations

import hashlib
import logging
import os
import re
import secrets
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator, Literal, Optional
from uuid import UUID

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

import database as db
import email_service

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("vault.api")

_B64_RE = re.compile(r"^[A-Za-z0-9+/=_-]+$")
TEMPLATES = {
    "custom",
    "last-letter",
    "recovery-codes",
    "seed-phrase",
    "executor-notes",
    "unreachable-30d",
}


class RecipientIn(BaseModel):
    email: EmailStr
    role: Literal["primary", "backup", "witness"] = "primary"
    unlock_token: Optional[str] = Field(default=None, min_length=32, max_length=128)
    release_delay_days: int = Field(default=0, ge=0, le=3650)

    @field_validator("unlock_token")
    @classmethod
    def strip_token(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value else value


class VaultCreateRequest(BaseModel):
    encrypted_title: str = Field(..., min_length=16, max_length=8192)
    encrypted_payload: str = Field(..., min_length=16, max_length=5_000_000)
    init_vector: str = Field(..., min_length=8, max_length=128)
    title_iv: str = Field(..., min_length=8, max_length=128)
    salt: str = Field(..., min_length=8, max_length=128)
    payload_mac: str = Field(..., min_length=16, max_length=256)
    kdf: Literal["argon2id"] = "argon2id"
    crypto_version: int = Field(default=2, ge=2, le=2)
    template_id: str = Field(default="custom", max_length=64)
    interval_days: int = Field(..., ge=1, le=3650)
    grace_days: int = Field(default=2, ge=0, le=30)
    owner_email: EmailStr
    ping_token: str = Field(..., min_length=32, max_length=128)
    recipients: list[RecipientIn] = Field(..., min_length=1, max_length=8)
    release_at: Optional[datetime] = None
    travel_until: Optional[datetime] = None
    travel_interval_days: Optional[int] = Field(default=None, ge=1, le=3650)
    is_dry_run: bool = False
    has_attachments: bool = False

    @field_validator(
        "encrypted_title",
        "encrypted_payload",
        "init_vector",
        "title_iv",
        "salt",
        "payload_mac",
    )
    @classmethod
    def validate_b64_field(cls, value: str) -> str:
        cleaned = value.strip()
        if not _B64_RE.fullmatch(cleaned):
            raise ValueError("Field must be base64 or base64url encoded")
        return cleaned

    @field_validator("template_id")
    @classmethod
    def validate_template(cls, value: str) -> str:
        tid = value.strip().lower()
        if tid not in TEMPLATES:
            raise ValueError(f"Unknown template_id. Allowed: {sorted(TEMPLATES)}")
        return tid

    @model_validator(mode="after")
    def validate_recipients(self) -> "VaultCreateRequest":
        emails = [str(r.email).lower() for r in self.recipients]
        if len(emails) != len(set(emails)):
            raise ValueError("Duplicate recipient emails")
        unlockable = [r for r in self.recipients if r.role in ("primary", "backup")]
        if not unlockable:
            raise ValueError("At least one primary or backup recipient is required")
        for r in self.recipients:
            if r.role == "witness" and r.unlock_token:
                raise ValueError("Witness recipients cannot have unlock tokens")
            if r.role in ("primary", "backup") and not r.unlock_token:
                raise ValueError(f"{r.role} recipient requires unlock_token")
        if self.travel_until and not self.travel_interval_days:
            raise ValueError("travel_interval_days required when travel_until is set")
        return self


class VaultCreateResponse(BaseModel):
    vault_id: UUID
    status: Literal["ACTIVE"]
    next_ping_due: datetime
    owner_access_token: str
    dashboard_url_hint: str
    message: str


class PingRequest(BaseModel):
    token: str = Field(..., min_length=32, max_length=128)

    @field_validator("token")
    @classmethod
    def strip_token(cls, value: str) -> str:
        return value.strip()


class PingResponse(BaseModel):
    vault_id: UUID
    status: Literal["ACTIVE", "GRACE"]
    last_ping_at: datetime
    next_ping_due: datetime
    new_ping_token: str
    message: str


class PayloadRequest(BaseModel):
    unlock_token: str = Field(..., min_length=32, max_length=128)

    @field_validator("unlock_token")
    @classmethod
    def strip_unlock(cls, value: str) -> str:
        return value.strip()


class VaultPayloadResponse(BaseModel):
    vault_id: UUID
    status: Literal["TRIGGERED"]
    encrypted_title: str
    encrypted_payload: str
    init_vector: str
    title_iv: str
    salt: str
    payload_mac: str
    kdf: str
    crypto_version: int
    template_id: str
    has_attachments: bool
    is_dry_run: bool
    triggered_at: Optional[datetime]
    recipient_role: str


class TravelRequest(BaseModel):
    owner_access_token: str = Field(..., min_length=32, max_length=128)
    travel_until: datetime
    travel_interval_days: int = Field(..., ge=1, le=3650)


class DryRunTriggerRequest(BaseModel):
    owner_access_token: str = Field(..., min_length=32, max_length=128)


class DashboardVault(BaseModel):
    vault_id: UUID
    status: str
    template_id: str
    interval_days: int
    grace_days: int
    next_ping_due: datetime
    last_ping_at: Optional[datetime]
    grace_started_at: Optional[datetime]
    release_at: Optional[datetime]
    travel_until: Optional[datetime]
    travel_interval_days: Optional[int]
    is_dry_run: bool
    has_attachments: bool
    created_at: datetime
    triggered_at: Optional[datetime]
    days_sealed: int
    recipients: list[dict]


class DashboardResponse(BaseModel):
    owner_email: str
    vaults: list[DashboardVault]


class HealthResponse(BaseModel):
    status: str
    database: str
    email: str


class TemplatesResponse(BaseModel):
    templates: list[dict]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _new_token() -> str:
    return secrets.token_urlsafe(32)


def _parse_dt(value: object) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    raise TypeError(f"Cannot parse datetime from {type(value)}")


def _opt_dt(value: object) -> Optional[datetime]:
    if value is None or value == "":
        return None
    return _parse_dt(value)


def _is_unique_violation(exc: BaseException) -> bool:
    if isinstance(exc, sqlite3.IntegrityError):
        return True
    try:
        from psycopg2 import IntegrityError
        from psycopg2 import errors as pg_errors

        return isinstance(exc, (IntegrityError, pg_errors.UniqueViolation))
    except ImportError:
        return False


def _sql_val(dt: Optional[datetime]):
    if dt is None:
        return None
    return dt.isoformat() if db.is_sqlite() else dt


def _effective_interval(vault: dict) -> int:
    travel_until = _opt_dt(vault.get("travel_until"))
    if travel_until and travel_until > _utcnow() and vault.get("travel_interval_days"):
        return int(vault["travel_interval_days"])
    return int(vault["interval_days"])


def _days_sealed(created_at: datetime) -> int:
    delta = _utcnow() - created_at
    return max(0, delta.days)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    logger.info("Starting CipherSwitch API v3")
    try:
        db.init_pool()
        db.init_schema()
    except Exception:
        logger.exception("Failed to initialize database")
        raise
    yield
    db.close_pool()


app = FastAPI(
    title="CipherSwitch API",
    description="Zero-knowledge dead man's switch with dashboard, grace period, multi-recipient.",
    version="3.0.0",
    lifespan=lifespan,
)

cors_origins = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    try:
        row = db.fetch_one("SELECT 1 AS ok")
        ok_val = row.get("ok") if row else None
        db_status = "ok" if ok_val in (1, "1") else "degraded"
    except Exception:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        ) from None
    backend = "sqlite" if db.is_sqlite() else "postgres"
    return HealthResponse(
        status="ok",
        database=f"{db_status}:{backend}",
        email="configured" if email_service.is_configured() else "disabled",
    )


@app.get("/api/templates", response_model=TemplatesResponse)
def list_templates() -> TemplatesResponse:
    catalog = [
        {
            "id": "last-letter",
            "name": "Last letter",
            "description": "A personal message released if you go silent.",
            "suggested_interval_days": 14,
            "placeholder": "My dearest…\n\nIf you’re reading this, I wasn’t able to check in…",
        },
        {
            "id": "recovery-codes",
            "name": "Recovery codes",
            "description": "Backup 2FA / account recovery codes for a trusted person.",
            "suggested_interval_days": 7,
            "placeholder": "Service: …\nCodes:\n1. …\n2. …",
        },
        {
            "id": "seed-phrase",
            "name": "Seed phrase packet",
            "description": "Wallet seed or key material — use a strong unique passphrase.",
            "suggested_interval_days": 7,
            "placeholder": "Wallet label: …\nSeed words:\n…",
        },
        {
            "id": "executor-notes",
            "name": "Executor notes",
            "description": "Practical instructions for an executor or next of kin.",
            "suggested_interval_days": 30,
            "placeholder": "Documents location: …\nAccounts to notify: …\nContacts: …",
        },
        {
            "id": "unreachable-30d",
            "name": "If unreachable 30 days",
            "description": "Contingency plan when you can’t be reached for a month.",
            "suggested_interval_days": 30,
            "placeholder": "If I haven’t checked in for 30 days, please…",
        },
        {
            "id": "custom",
            "name": "Custom",
            "description": "Blank vault — write anything.",
            "suggested_interval_days": 7,
            "placeholder": "",
        },
    ]
    return TemplatesResponse(templates=catalog)


@app.post(
    "/api/vaults/create",
    response_model=VaultCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_vault(body: VaultCreateRequest) -> VaultCreateResponse:
    ping_hash = _hash_token(body.ping_token)
    owner_access = _new_token()
    owner_access_hash = _hash_token(owner_access)
    now = _utcnow()
    next_due = now + timedelta(days=body.interval_days)
    vault_id = db.new_vault_id()

    insert_sql = """
        INSERT INTO vaults (
            id, encrypted_title, encrypted_payload, init_vector, title_iv,
            salt, payload_mac, kdf, crypto_version, status, template_id,
            interval_days, grace_days, next_ping_due, last_ping_at,
            release_at, travel_until, travel_interval_days, is_dry_run,
            has_attachments, owner_email, ping_token_hash, owner_access_token_hash,
            created_at
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, 'ACTIVE', %s,
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        RETURNING id, next_ping_due, status
    """
    params = (
        vault_id,
        body.encrypted_title,
        body.encrypted_payload,
        body.init_vector,
        body.title_iv,
        body.salt,
        body.payload_mac,
        body.kdf,
        body.crypto_version,
        body.template_id,
        body.interval_days,
        body.grace_days,
        _sql_val(next_due),
        _sql_val(now),
        _sql_val(body.release_at),
        _sql_val(body.travel_until),
        body.travel_interval_days,
        1 if body.is_dry_run and db.is_sqlite() else body.is_dry_run,
        1 if body.has_attachments and db.is_sqlite() else body.has_attachments,
        str(body.owner_email).lower(),
        ping_hash,
        owner_access_hash,
        _sql_val(now),
    )

    # For Postgres, omit explicit id if we want gen_random_uuid — we pass id for both.
    try:
        with db.get_cursor(commit=True) as cur:
            cur.execute(insert_sql, params)
            row = cur.fetchone()
            for rec in body.recipients:
                rid = db.new_id()
                unlock_hash = (
                    _hash_token(rec.unlock_token) if rec.unlock_token else None
                )
                cur.execute(
                    """
                    INSERT INTO recipients (
                        id, vault_id, email, role, unlock_token_hash, release_delay_days
                    ) VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        rid,
                        vault_id,
                        str(rec.email).lower(),
                        rec.role,
                        unlock_hash,
                        rec.release_delay_days,
                    ),
                )
    except Exception as exc:
        if _is_unique_violation(exc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Token collision. Retry.",
            ) from exc
        logger.exception("Vault creation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create vault",
        ) from exc

    if not row:
        raise HTTPException(status_code=500, detail="Vault created but no row returned")

    next_due_parsed = _parse_dt(row["next_ping_due"])
    frontend = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    dashboard_hint = f"{frontend}/dashboard#access={owner_access}"

    email_service.send_vault_created_owner(
        owner_email=str(body.owner_email).lower(),
        vault_id=str(row["id"]),
        ping_token=body.ping_token,
        next_ping_due=next_due_parsed,
        interval_days=body.interval_days,
        owner_access_token=owner_access,
        is_dry_run=body.is_dry_run,
    )
    for rec in body.recipients:
        if rec.role == "witness":
            email_service.send_witness_named(
                witness_email=str(rec.email).lower(),
                vault_id=str(row["id"]),
            )
        else:
            email_service.send_vault_created_recipient(
                recipient_email=str(rec.email).lower(),
                vault_id=str(row["id"]),
                unlock_token=rec.unlock_token or "",
                role=rec.role,
                release_delay_days=rec.release_delay_days,
                is_dry_run=body.is_dry_run,
            )

    return VaultCreateResponse(
        vault_id=row["id"],
        status="ACTIVE",
        next_ping_due=next_due_parsed,
        owner_access_token=owner_access,
        dashboard_url_hint=dashboard_hint,
        message=(
            "Vault sealed. Save your passphrase, dashboard link, and check-in link. "
            + ("DRY-RUN vault — safe to test." if body.is_dry_run else "")
        ),
    )


@app.post("/api/vaults/ping", response_model=PingResponse)
def ping_vault(body: PingRequest) -> PingResponse:
    token_hash = _hash_token(body.token)
    now = _utcnow()
    rotated = _new_token()
    rotated_hash = _hash_token(rotated)
    owner_email = ""
    lock_sql = "FOR UPDATE" if not db.is_sqlite() else ""

    try:
        with db.get_cursor(commit=True) as cur:
            cur.execute(
                f"""
                SELECT id, status, interval_days, owner_email, travel_until,
                       travel_interval_days, grace_days
                FROM vaults
                WHERE ping_token_hash = %s
                {lock_sql}
                """,
                (token_hash,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Unknown or invalid check-in token")
            if row["status"] == "TRIGGERED":
                raise HTTPException(
                    status_code=409,
                    detail="This vault has already been triggered.",
                )

            owner_email = row["owner_email"]
            interval = _effective_interval(row)
            next_due = now + timedelta(days=interval)
            cur.execute(
                """
                UPDATE vaults
                SET last_ping_at = %s,
                    next_ping_due = %s,
                    ping_token_hash = %s,
                    status = 'ACTIVE',
                    grace_started_at = NULL,
                    reminder_sent_at = NULL
                WHERE id = %s
                RETURNING id, status, last_ping_at, next_ping_due
                """,
                (_sql_val(now), _sql_val(next_due), rotated_hash, row["id"]),
            )
            updated = cur.fetchone()
    except HTTPException:
        raise
    except Exception as exc:
        if _is_unique_violation(exc):
            raise HTTPException(status_code=500, detail="Unable to rotate token") from exc
        logger.exception("Ping failed")
        raise HTTPException(status_code=500, detail="Unable to register check-in") from exc

    if not updated:
        raise HTTPException(status_code=500, detail="Check-in recorded but no row returned")

    next_due_parsed = _parse_dt(updated["next_ping_due"])
    email_service.send_ping_rotated(
        owner_email=owner_email,
        vault_id=str(updated["id"]),
        new_ping_token=rotated,
        next_ping_due=next_due_parsed,
    )
    return PingResponse(
        vault_id=updated["id"],
        status=updated["status"],
        last_ping_at=_parse_dt(updated["last_ping_at"]),
        next_ping_due=next_due_parsed,
        new_ping_token=rotated,
        message="Heartbeat registered. Previous check-in token is invalid.",
    )


@app.get("/api/vaults/dashboard", response_model=DashboardResponse)
def dashboard(access_token: str) -> DashboardResponse:
    token_hash = _hash_token(access_token.strip())
    vaults = db.fetch_all(
        """
        SELECT * FROM vaults
        WHERE owner_access_token_hash = %s
        ORDER BY created_at DESC
        """,
        (token_hash,),
    )
    # owner_access is unique per vault — collect all vaults for same owner via email
    if not vaults:
        raise HTTPException(status_code=404, detail="Unknown dashboard access token")

    owner_email = vaults[0]["owner_email"]
    all_vaults = db.fetch_all(
        """
        SELECT * FROM vaults
        WHERE owner_email = %s
        ORDER BY created_at DESC
        """,
        (owner_email,),
    )

    # Security: only allow listing if the access token matches at least one vault;
    # still scope to that owner's email (token proves ownership of one vault → same email).
    out: list[DashboardVault] = []
    for v in all_vaults:
        recs = db.fetch_all(
            """
            SELECT email, role, release_delay_days,
                   CASE WHEN unlock_token_hash IS NULL THEN 0 ELSE 1 END AS can_unlock
            FROM recipients WHERE vault_id = %s
            """,
            (str(v["id"]),),
        )
        created = _parse_dt(v["created_at"])
        out.append(
            DashboardVault(
                vault_id=v["id"],
                status=v["status"],
                template_id=v["template_id"],
                interval_days=v["interval_days"],
                grace_days=v["grace_days"],
                next_ping_due=_parse_dt(v["next_ping_due"]),
                last_ping_at=_opt_dt(v.get("last_ping_at")),
                grace_started_at=_opt_dt(v.get("grace_started_at")),
                release_at=_opt_dt(v.get("release_at")),
                travel_until=_opt_dt(v.get("travel_until")),
                travel_interval_days=v.get("travel_interval_days"),
                is_dry_run=bool(v.get("is_dry_run")),
                has_attachments=bool(v.get("has_attachments")),
                created_at=created,
                triggered_at=_opt_dt(v.get("triggered_at")),
                days_sealed=_days_sealed(created),
                recipients=[
                    {
                        "email": r["email"],
                        "role": r["role"],
                        "release_delay_days": r["release_delay_days"],
                        "can_unlock": bool(r["can_unlock"]),
                    }
                    for r in recs
                ],
            )
        )

    return DashboardResponse(owner_email=owner_email, vaults=out)


@app.post("/api/vaults/{vault_id}/travel")
def enable_travel(vault_id: UUID, body: TravelRequest) -> dict:
    token_hash = _hash_token(body.owner_access_token.strip())
    vault = db.fetch_one(
        "SELECT * FROM vaults WHERE id = %s AND owner_access_token_hash = %s",
        (str(vault_id), token_hash),
    )
    if not vault:
        raise HTTPException(status_code=404, detail="Vault not found or access denied")
    if vault["status"] == "TRIGGERED":
        raise HTTPException(status_code=409, detail="Vault already triggered")

    until = body.travel_until
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    if until <= _utcnow():
        raise HTTPException(status_code=400, detail="travel_until must be in the future")

    now = _utcnow()
    next_due = now + timedelta(days=body.travel_interval_days)
    db.execute(
        """
        UPDATE vaults
        SET travel_until = %s,
            travel_interval_days = %s,
            next_ping_due = %s,
            status = 'ACTIVE',
            grace_started_at = NULL
        WHERE id = %s
        """,
        (
            _sql_val(until),
            body.travel_interval_days,
            _sql_val(next_due),
            str(vault_id),
        ),
    )
    return {
        "vault_id": str(vault_id),
        "travel_until": until.isoformat(),
        "travel_interval_days": body.travel_interval_days,
        "next_ping_due": next_due.isoformat(),
        "message": "Travel mode enabled — longer check-in interval until travel_until.",
    }


@app.post("/api/vaults/{vault_id}/dry-run-trigger")
def dry_run_trigger(vault_id: UUID, body: DryRunTriggerRequest) -> dict:
    token_hash = _hash_token(body.owner_access_token.strip())
    vault = db.fetch_one(
        "SELECT * FROM vaults WHERE id = %s AND owner_access_token_hash = %s",
        (str(vault_id), token_hash),
    )
    if not vault:
        raise HTTPException(status_code=404, detail="Vault not found or access denied")
    if not vault.get("is_dry_run"):
        raise HTTPException(
            status_code=400,
            detail="Only dry-run vaults can be force-triggered for testing.",
        )
    if vault["status"] == "TRIGGERED":
        return {"vault_id": str(vault_id), "status": "TRIGGERED", "message": "Already triggered"}

    now = _utcnow()
    db.execute(
        """
        UPDATE vaults
        SET status = 'TRIGGERED', triggered_at = %s
        WHERE id = %s
        """,
        (_sql_val(now), str(vault_id)),
    )
    recs = db.fetch_all(
        "SELECT email, role FROM recipients WHERE vault_id = %s",
        (str(vault_id),),
    )
    for r in recs:
        if r["role"] == "witness":
            email_service.send_vault_triggered_witness(
                witness_email=r["email"],
                vault_id=str(vault_id),
                is_dry_run=True,
            )
        else:
            email_service.send_vault_triggered_recipient(
                recipient_email=r["email"],
                vault_id=str(vault_id),
                is_dry_run=True,
            )
    email_service.send_vault_triggered_owner(
        owner_email=vault["owner_email"],
        vault_id=str(vault_id),
        is_dry_run=True,
    )
    return {
        "vault_id": str(vault_id),
        "status": "TRIGGERED",
        "message": "Dry-run trigger fired. Recipients can unlock with their links + passphrase.",
    }


@app.post("/api/vaults/payload/{vault_id}", response_model=VaultPayloadResponse)
def get_triggered_payload(vault_id: UUID, body: PayloadRequest) -> VaultPayloadResponse:
    unlock_hash = _hash_token(body.unlock_token)
    row = db.fetch_one(
        """
        SELECT v.*, r.role AS recipient_role, r.release_delay_days
        FROM vaults v
        JOIN recipients r ON r.vault_id = v.id
        WHERE v.id = %s AND r.unlock_token_hash = %s
        """,
        (str(vault_id), unlock_hash),
    )
    if not row:
        raise HTTPException(status_code=403, detail="Invalid unlock token")
    if row["status"] != "TRIGGERED":
        raise HTTPException(
            status_code=403,
            detail=(
                f"Vault is {row['status']}. Payload withheld until fully triggered."
            ),
        )

    # Staggered release for backup recipients
    delay = int(row.get("release_delay_days") or 0)
    triggered_at = _opt_dt(row.get("triggered_at"))
    if delay > 0 and triggered_at:
        unlock_after = triggered_at + timedelta(days=delay)
        if _utcnow() < unlock_after:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Staggered release: available after {unlock_after.isoformat()} "
                    f"({delay} day delay for {row['recipient_role']} role)."
                ),
            )

    return VaultPayloadResponse(
        vault_id=row["id"],
        status="TRIGGERED",
        encrypted_title=row["encrypted_title"],
        encrypted_payload=row["encrypted_payload"],
        init_vector=row["init_vector"],
        title_iv=row["title_iv"],
        salt=row["salt"],
        payload_mac=row["payload_mac"],
        kdf=row["kdf"],
        crypto_version=row["crypto_version"],
        template_id=row["template_id"],
        has_attachments=bool(row.get("has_attachments")),
        is_dry_run=bool(row.get("is_dry_run")),
        triggered_at=triggered_at,
        recipient_role=row["recipient_role"],
    )
