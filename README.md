# DPR / Measurement Book / Billing System

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture, folder structure, validation strategy, and mobile field-entry design.

## Backend (`backend/`)

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate   # Windows Git Bash; use .venv\Scripts\activate.bat for cmd.exe
pip install -e ".[dev]"
cp .env.example .env            # then point DATABASE_URL at your local Postgres
alembic revision --autogenerate -m "init"
alembic upgrade head
uvicorn app.main:app --reload
```

Runs at `http://localhost:8000`. Health check: `GET /health`. OpenAPI docs: `/docs`.

Run tests: `python -m pytest app/tests/unit`

## Frontend (`frontend/`)

```bash
cd frontend
npm install
npm run dev
```

Runs at `http://localhost:5173`. Set `VITE_API_BASE_URL` (default `http://localhost:8000/api/v1`) via a `.env` file if the backend runs elsewhere.

The same codebase serves both the desktop admin dashboard and the mobile field-entry PWA — login with role `SITE_ENGINEER` (dev-only role selector on the login screen) to see the field flow.

## Prerequisites

- PostgreSQL running locally (or update `DATABASE_URL`) — no Docker, per project decision.
- Python 3.11+, Node 18+.
