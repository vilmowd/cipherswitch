"""Database layer — PostgreSQL in production; SQLite for local launch."""

from __future__ import annotations

import logging
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator, Optional

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./vaultdb.sqlite3",
)

_USE_SQLITE = DATABASE_URL.startswith("sqlite:")
_pool = None
_sqlite_path: Optional[Path] = None

PG_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS vaults (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encrypted_title         TEXT NOT NULL,
    encrypted_payload       TEXT NOT NULL,
    init_vector             TEXT NOT NULL,
    title_iv                TEXT NOT NULL,
    salt                    TEXT NOT NULL,
    payload_mac             TEXT NOT NULL,
    kdf                     VARCHAR(32) NOT NULL DEFAULT 'argon2id',
    crypto_version          INTEGER NOT NULL DEFAULT 2,
    status                  VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE', 'GRACE', 'TRIGGERED')),
    template_id             VARCHAR(64) NOT NULL DEFAULT 'custom',
    interval_days           INTEGER NOT NULL CHECK (interval_days > 0),
    grace_days              INTEGER NOT NULL DEFAULT 2 CHECK (grace_days >= 0),
    next_ping_due           TIMESTAMPTZ NOT NULL,
    last_ping_at            TIMESTAMPTZ,
    grace_started_at        TIMESTAMPTZ,
    release_at              TIMESTAMPTZ,
    travel_until            TIMESTAMPTZ,
    travel_interval_days    INTEGER,
    is_dry_run              BOOLEAN NOT NULL DEFAULT FALSE,
    has_attachments         BOOLEAN NOT NULL DEFAULT FALSE,
    release_title           TEXT,
    release_message         TEXT,
    release_files           TEXT,
    owner_email             VARCHAR(320) NOT NULL,
    ping_token_hash         VARCHAR(64) NOT NULL UNIQUE,
    owner_access_token_hash VARCHAR(64) NOT NULL UNIQUE,
    reminder_sent_at        TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    triggered_at            TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS recipients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id            UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    email               VARCHAR(320) NOT NULL,
    role                VARCHAR(32) NOT NULL
                        CHECK (role IN ('primary', 'backup', 'witness')),
    unlock_token_hash   VARCHAR(64),
    release_delay_days  INTEGER NOT NULL DEFAULT 0 CHECK (release_delay_days >= 0),
    content_sent_at     TEXT,
    UNIQUE (vault_id, email)
);

CREATE INDEX IF NOT EXISTS idx_vaults_status_next_ping
    ON vaults (status, next_ping_due);

CREATE INDEX IF NOT EXISTS idx_vaults_owner_access
    ON vaults (owner_access_token_hash);

CREATE INDEX IF NOT EXISTS idx_vaults_owner_email
    ON vaults (owner_email);

CREATE TABLE IF NOT EXISTS email_locks (
    email TEXT PRIMARY KEY
);

CREATE INDEX IF NOT EXISTS idx_recipients_vault
    ON recipients (vault_id);

CREATE INDEX IF NOT EXISTS idx_recipients_unlock
    ON recipients (unlock_token_hash);

CREATE TABLE IF NOT EXISTS payments (
    session_id   TEXT PRIMARY KEY,
    purpose      TEXT NOT NULL,
    vault_id     TEXT,
    consumed_at  TIMESTAMPTZ NOT NULL
);
"""

SQLITE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS vaults (
    id                      TEXT PRIMARY KEY,
    encrypted_title         TEXT NOT NULL,
    encrypted_payload       TEXT NOT NULL,
    init_vector             TEXT NOT NULL,
    title_iv                TEXT NOT NULL,
    salt                    TEXT NOT NULL,
    payload_mac             TEXT NOT NULL,
    kdf                     TEXT NOT NULL DEFAULT 'argon2id',
    crypto_version          INTEGER NOT NULL DEFAULT 2,
    status                  TEXT NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE', 'GRACE', 'TRIGGERED')),
    template_id             TEXT NOT NULL DEFAULT 'custom',
    interval_days           INTEGER NOT NULL CHECK (interval_days > 0),
    grace_days              INTEGER NOT NULL DEFAULT 2,
    next_ping_due           TEXT NOT NULL,
    last_ping_at            TEXT,
    grace_started_at        TEXT,
    release_at              TEXT,
    travel_until            TEXT,
    travel_interval_days    INTEGER,
    is_dry_run              INTEGER NOT NULL DEFAULT 0,
    has_attachments         INTEGER NOT NULL DEFAULT 0,
    release_title           TEXT,
    release_message         TEXT,
    release_files           TEXT,
    owner_email             TEXT NOT NULL,
    ping_token_hash         TEXT NOT NULL UNIQUE,
    owner_access_token_hash TEXT NOT NULL UNIQUE,
    reminder_sent_at        TEXT,
    created_at              TEXT NOT NULL,
    triggered_at            TEXT
);

CREATE TABLE IF NOT EXISTS recipients (
    id                  TEXT PRIMARY KEY,
    vault_id            TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    email               TEXT NOT NULL,
    role                TEXT NOT NULL
                        CHECK (role IN ('primary', 'backup', 'witness')),
    unlock_token_hash   TEXT,
    release_delay_days  INTEGER NOT NULL DEFAULT 0,
    content_sent_at     TEXT,
    UNIQUE (vault_id, email)
);

CREATE INDEX IF NOT EXISTS idx_vaults_status_next_ping ON vaults (status, next_ping_due);
CREATE INDEX IF NOT EXISTS idx_vaults_owner_access ON vaults (owner_access_token_hash);
CREATE INDEX IF NOT EXISTS idx_vaults_owner_email ON vaults (owner_email);

CREATE TABLE IF NOT EXISTS email_locks (
    email TEXT PRIMARY KEY
);

CREATE INDEX IF NOT EXISTS idx_recipients_vault ON recipients (vault_id);
CREATE INDEX IF NOT EXISTS idx_recipients_unlock ON recipients (unlock_token_hash);

CREATE TABLE IF NOT EXISTS payments (
    session_id   TEXT PRIMARY KEY,
    purpose      TEXT NOT NULL,
    vault_id     TEXT,
    consumed_at  TEXT NOT NULL
);
"""


def _parse_sqlite_path(url: str) -> Path:
    raw = url.replace("sqlite:///", "", 1)
    path = Path(raw)
    if not path.is_absolute():
        path = Path.cwd() / path
    return path.resolve()


def init_pool(
    minconn: int = 1,
    maxconn: int = 10,
    dsn: Optional[str] = None,
) -> Any:
    global _pool, _sqlite_path, _USE_SQLITE, DATABASE_URL

    target = dsn or DATABASE_URL
    _USE_SQLITE = target.startswith("sqlite:")

    if _USE_SQLITE:
        _sqlite_path = _parse_sqlite_path(target)
        _sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        _pool = "sqlite"
        logger.info("SQLite database ready at %s", _sqlite_path)
        return _pool

    import psycopg2
    import psycopg2.extras
    import psycopg2.pool

    if _pool is not None and _pool != "sqlite":
        try:
            _pool.closeall()
        except Exception:  # noqa: BLE001
            logger.exception("Failed to close existing connection pool")
        _pool = None

    _pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=minconn,
        maxconn=maxconn,
        dsn=target,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    logger.info("PostgreSQL connection pool initialized")
    return _pool


def get_pool() -> Any:
    if _pool is None:
        raise RuntimeError("Database pool is not initialized. Call init_pool() first.")
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is None:
        return
    if _pool != "sqlite":
        _pool.closeall()
    _pool = None
    logger.info("Database pool closed")


def _sqlite_connect() -> sqlite3.Connection:
    if _sqlite_path is None:
        raise RuntimeError("SQLite path not initialized")
    conn = sqlite3.connect(str(_sqlite_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _adapt_sql(sql: str) -> str:
    if not _USE_SQLITE:
        return sql
    return sql.replace("%s", "?")


def _normalize_row(row: Optional[Any]) -> Optional[dict[str, Any]]:
    if row is None:
        return None
    data = dict(row)
    # Normalize sqlite bools
    for key in ("is_dry_run", "has_attachments"):
        if key in data and data[key] is not None:
            data[key] = bool(data[key])
    return data


@contextmanager
def get_connection() -> Generator[Any, None, None]:
    if _USE_SQLITE:
        conn = _sqlite_connect()
        try:
            yield conn
        finally:
            conn.close()
        return

    pool = get_pool()
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)


class _CursorAdapter:
    def __init__(self, cur: Any, conn: Any) -> None:
        self._cur = cur
        self._conn = conn

    def execute(self, query: str, params: Optional[tuple[Any, ...]] = None) -> Any:
        sql = _adapt_sql(query)
        if params is None:
            return self._cur.execute(sql)
        return self._cur.execute(sql, params)

    def fetchone(self) -> Optional[dict[str, Any]]:
        return _normalize_row(self._cur.fetchone())

    def fetchall(self) -> list[dict[str, Any]]:
        rows = self._cur.fetchall() or []
        return [_normalize_row(r) for r in rows if r is not None]  # type: ignore[misc]

    @property
    def rowcount(self) -> int:
        return int(self._cur.rowcount or 0)


@contextmanager
def get_cursor(*, commit: bool = False) -> Generator[_CursorAdapter, None, None]:
    with get_connection() as conn:
        cur = conn.cursor()
        try:
            yield _CursorAdapter(cur, conn)
            if commit:
                conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()


def _legacy_needs_reset(cur: _CursorAdapter) -> bool:
    try:
        cur.execute(
            """
            SELECT 1 AS ok FROM information_schema.columns
            WHERE table_name = 'vaults' AND column_name = 'owner_access_token_hash'
            """
            if not _USE_SQLITE
            else "PRAGMA table_info(vaults)"
        )
        if _USE_SQLITE:
            cols = {row["name"] for row in cur.fetchall() if row}
            return "owner_access_token_hash" not in cols and len(cols) > 0
        return cur.fetchone() is None
    except Exception:  # noqa: BLE001
        return False


def init_schema() -> None:
    with get_cursor(commit=True) as cur:
        if _USE_SQLITE:
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='vaults'")
            exists = cur.fetchone()
            if exists:
                cur.execute("PRAGMA table_info(vaults)")
                cols = {row["name"] for row in cur.fetchall() if row}
                if "owner_access_token_hash" not in cols:
                    logger.warning("Migrating SQLite schema to v3 (drop + recreate)")
                    cur.execute("DROP TABLE IF EXISTS recipients")
                    cur.execute("DROP TABLE IF EXISTS vaults")
            for stmt in SQLITE_SCHEMA_SQL.split(";"):
                cleaned = stmt.strip()
                if cleaned:
                    cur.execute(cleaned)
            _ensure_release_columns(cur)
        else:
            cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
            # Soft upgrade: if old vaults without owner_access_token_hash, recreate
            cur.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'vaults'
                """
            )
            cols = {r["column_name"] for r in cur.fetchall() if r}
            if cols and "owner_access_token_hash" not in cols:
                logger.warning("Migrating Postgres schema to v3 (drop + recreate)")
                cur.execute("DROP TABLE IF EXISTS recipients CASCADE")
                cur.execute("DROP TABLE IF EXISTS vaults CASCADE")
            for stmt in PG_SCHEMA_SQL.split(";"):
                cleaned = stmt.strip()
                if cleaned:
                    cur.execute(cleaned)
            _ensure_release_columns(cur)
    logger.info(
        "Database schema initialized (v3, backend=%s)",
        "sqlite" if _USE_SQLITE else "postgres",
    )


def _column_names(cur: _CursorAdapter, table: str) -> set[str]:
    if _USE_SQLITE:
        cur.execute(f"PRAGMA table_info({table})")
        return {row["name"] for row in cur.fetchall() if row}
    cur.execute(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_name = %s
        """,
        (table,),
    )
    return {row["column_name"] for row in cur.fetchall() if row}


def _ensure_release_columns(cur: _CursorAdapter) -> None:
    """Add release columns on databases created before emails carried the vault."""
    vault_cols = _column_names(cur, "vaults")
    for name in ("release_title", "release_message", "release_files"):
        if name not in vault_cols:
            cur.execute(f"ALTER TABLE vaults ADD COLUMN {name} TEXT")
    recipient_cols = _column_names(cur, "recipients")
    if "content_sent_at" not in recipient_cols:
        cur.execute("ALTER TABLE recipients ADD COLUMN content_sent_at TEXT")


def new_id() -> str:
    return str(uuid.uuid4())


def new_vault_id() -> str:
    return new_id()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_one(query: str, params: Optional[tuple[Any, ...]] = None) -> Optional[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(query, params)
        return cur.fetchone()


def fetch_all(query: str, params: Optional[tuple[Any, ...]] = None) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(query, params)
        return cur.fetchall()


def execute(query: str, params: Optional[tuple[Any, ...]] = None) -> int:
    with get_cursor(commit=True) as cur:
        cur.execute(query, params)
        return cur.rowcount


def is_sqlite() -> bool:
    return _USE_SQLITE
