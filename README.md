# Aster Perps Bot

Lightweight trading bot UI + backend for Aster DEX perpetuals.

## What this repo contains

- `backend/` — FastAPI backend and trading engine (Python).
- `frontend/` — Next.js React frontend (TypeScript).
- `start.sh` — convenience script to start backend and frontend together.
- `.env.example` — example environment variables (DO NOT commit real secrets).

## Prerequisites

- Node.js (recommended 18+)
- Python 3.10+
- pip and a virtualenv tool

## Setup

1. Copy the example env and fill your credentials locally:

```bash
cp .env.example .env
# Edit .env and set ASTER_API_KEY and ASTER_API_SECRET (keep these secret!)
```

2. Backend: create a virtual environment and install deps

```bash
cd backend
python -m venv ../venv
source ../venv/bin/activate
pip install -r requirements.txt
```

3. Frontend: install npm dependencies

```bash
cd frontend
npm install
```

## Running

You can run both services with the helper script from the repo root:

```bash
./start.sh
```

This will:
- start the backend (default port `8000`)
- start the frontend (default port `3000`)

You can also run them individually:

Backend (dev):
```bash
cd backend
source ../venv/bin/activate
python server.py
```

Frontend (dev):
```bash
cd frontend
npm run dev
```

## Important: Secrets & Git

- `.env` is listed in `.gitignore` and **must not** be committed. Use `.env.example` to share configuration structure.
- If you accidentally commit API keys (you have one here), rotate them immediately with your exchange/provider.
- For sharing private repos or CI, use GitHub Secrets or an external secrets manager. Consider `git-crypt` if you need encrypted values in-repo.

## Notes

- Charts and tickers are polled periodically by the frontend (klines every ~30s, tickers every ~15s) — the UI updates automatically.
- Manual orders are sent to the backend endpoint `/trade/manual` which calls the exchange client.

## Contributing / Next steps

- If you want the `frontend/` history merged into the top-level repo (instead of an embedded repo/submodule), I can remove the embedded git and add files directly — say the word.
- Consider adding CI, linting, and an automated deployment workflow.
