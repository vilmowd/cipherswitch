# CIPHERSWITCH — Dead Man's Switch

Zero-knowledge digital time capsule (crypto **v2**). Secrets **and titles** are encrypted in the browser with **Argon2id → AES-GCM-256** plus **HMAC-SHA256** integrity. Ping tokens rotate and live in URL hashes / POST bodies. Unlock requires a recipient-bound token.

## Stack

| Service   | Tech                                      |
|-----------|-------------------------------------------|
| Frontend  | Next.js 14 (App Router), React, Tailwind  |
| API       | FastAPI, Pydantic v2, Uvicorn             |
| Worker    | Python loop → flips expired vaults        |
| Database  | PostgreSQL 16 (`vaultdb`)                 |

## Quick start (Docker)

```bash
docker compose up --build
```

- Web UI: http://localhost:3000  
- API docs: http://localhost:8000/docs  
- Health: http://localhost:8000/health  

## Local development

### Database

```bash
docker compose up db -d
```

### API + worker

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
set DATABASE_URL=postgresql://vaultuser:vaultpass@localhost:5432/vaultdb
uvicorn main:app --reload --port 8000
# separate terminal:
python worker.py
```

### Frontend

```bash
cd frontend
npm install
set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

## Security model (v2)

1. **Create** — Argon2id derives keys; title + message encrypted (AES-GCM); HMAC seals the package. Ping + unlock tokens hashed (SHA-256) server-side.
2. **Ping** — `POST /api/vaults/ping` with token in body (link uses `#token=`). Token **rotates** on every success.
3. **Trigger** — Worker marks vaults `TRIGGERED` when `next_ping_due` has passed.
4. **Unlock** — `POST /api/vaults/payload/{id}` with unlock token; ciphertext only if `TRIGGERED`. Client verifies MAC, then decrypts.

Passphrases, titles, and plaintext **never** reach the server.
