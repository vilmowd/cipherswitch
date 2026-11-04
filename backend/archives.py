"""Accept only zip and rar bytes for files that will be emailed later."""

from __future__ import annotations

import base64
import re

MAX_FILE_BYTES = 1_500_000
MAX_FILES = 3
MAX_TOTAL_FILE_BYTES = 3_000_000
_NAME = re.compile(r"^[^\\/\x00-\x1f]{1,120}$")


class ArchiveError(ValueError):
    pass


def _kind(data: bytes) -> str:
    if data.startswith(b"PK\x03\x04") or data.startswith(b"PK\x05\x06") or data.startswith(b"PK\x07\x08"):
        return "zip"
    if data.startswith(b"Rar!\x1a\x07"):
        return "rar"
    return ""


def _clean_name(name: str, kind: str) -> str:
    cleaned = str(name or "").replace("\\", "/").split("/")[-1].strip()
    if not _NAME.fullmatch(cleaned):
        raise ArchiveError("Use a plain file name ending in .zip or .rar.")
    lower = cleaned.lower()
    suffix = f".{kind}"
    if not lower.endswith(suffix):
        raise ArchiveError("Only .zip and .rar files can be attached.")
    return cleaned


def normalize_files(files: list) -> list[dict[str, str]]:
    if len(files) > MAX_FILES:
        raise ArchiveError("You can attach up to 3 files.")
    kept: list[dict[str, str]] = []
    total = 0
    for item in files:
        name = getattr(item, "name", None)
        data = getattr(item, "data", None)
        if name is None and isinstance(item, dict):
            name = item.get("name")
            data = item.get("data")
        try:
            raw = base64.b64decode(str(data or ""), validate=True)
        except Exception as exc:  # noqa: BLE001
            raise ArchiveError("A file could not be read.") from exc
        if not raw:
            raise ArchiveError("An empty file cannot be attached.")
        if len(raw) > MAX_FILE_BYTES:
            raise ArchiveError("Each file can be up to 1.5 MB.")
        total += len(raw)
        if total > MAX_TOTAL_FILE_BYTES:
            raise ArchiveError("Those files together are over 3 MB.")
        kind = _kind(raw)
        if not kind:
            raise ArchiveError("Only .zip and .rar files can be attached.")
        kept.append({"name": _clean_name(str(name), kind), "data": base64.b64encode(raw).decode("ascii")})
    return kept
