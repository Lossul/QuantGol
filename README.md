# QuantGol

QuantGol is a live football intelligence dashboard with:

- real-time match event streaming
- tactical visualization (momentum/activity/possession)
- match finder (trending + search)
- AI analyst chat and one-shot insight generation

The project is split into:

- `frontend/`: Next.js (App Router) + React + TypeScript + Tailwind + Recharts
- `backend/`: Django + Django REST Framework + SQLite + Gemini integration

---

## Tech Stack

### Frontend

- Next.js `16.2.1`
- React `19.2.4`
- TypeScript
- Tailwind CSS 4
- Recharts
- Lucide icons

### Backend

- Django 5.x style project
- Django REST Framework
- `django-cors-headers`
- SQLite (default local DB)
- `python-dotenv` for env loading
- `google-genai` for AI responses
- football-data.org (fixtures/search) + optional custom providers

---

## Quick Start

## 1) Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python3 manage.py migrate
python3 manage.py sync_matches --competition PL PD --days 21
python3 manage.py runserver
```

Backend runs at `http://127.0.0.1:8000`.

## 2) Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.

Set `NEXT_PUBLIC_API_BASE_URL` to your backend origin if needed.

---

## Environment Variables

Main backend variables are defined in `backend/.env.example`:

- `FOOTBALL_DATA_API_KEY`: football-data.org key (fixtures + search)
- `LIVE_FEED_MODE`: `demo` or `external`
- `LIVE_FEED_ENDPOINT` (+ auth vars): optional live event provider
- `LIVE_MATCH_SEARCH_ENDPOINT`: optional external search endpoint
- `MATCH_STATS_ENDPOINT` (+ auth vars): optional official box stats provider
- `GOOGLE_API_KEY` / `GEMINI_API_KEY`: Gemini API key
- `GEMINI_MODEL`: Gemini model id (default `gemini-1.5-flash`)

---

## Core API Endpoints

All API routes are under `/api`.

- `GET /api/matches/`
- `GET /api/matches/trending/`
- `GET /api/matches/search/?query=...&date=...`
- `GET /api/matches/{match_id}/`
- `GET /api/matches/{match_id}/stats/`
- `GET /api/events/?match_id=...&limit=...`
- `GET /api/stream/{match_id}/` (SSE)
- `GET /api/feed-status/`
- `GET /api/ai-status/`
- `POST /api/analyze/`
- `POST /api/analyze-tactics/`

---

## Data Behavior Notes

- Scores (`home_score`/`away_score`) are persisted on `Match`.
- For football-data completed matches, score is treated as official.
- Shots/fouls/possession for completed football-data matches require an official stats provider (`MATCH_STATS_ENDPOINT`), otherwise stats are marked unavailable.
- SSE streams emit one event about every 3 seconds in demo mode and persist events.

---

## Management Commands

From `backend/`:

- Seed demo/API-backed fixtures:
  - `python3 manage.py seed_matches`
- Sync fixtures from football-data.org:
  - `python3 manage.py sync_matches --competition PL PD --days 21`
- Import StatsBomb Open Data (historical deep analytics):
  - `python3 manage.py import_statsbomb --competition-id 2 --season-id 44 --limit 50`
    - Example above is a StatsBomb competition/season pair (see StatsBomb open-data repo for ids).
  - Imported matches appear as `SB-<id>` and unlock:
    - real shot map data (`statsbomb_xg`)
    - xG timeline
    - pass network
    - pressures

---

## AI Analyst Troubleshooting

If AI responses fail:

1. check backend health: `GET /api/ai-status/`
2. verify `GOOGLE_API_KEY`/`GEMINI_API_KEY` in `backend/.env`
3. restart backend after env changes

---

## Current Dev-Safety Defaults

This repo is currently configured for local development convenience:

- `DEBUG=True`
- `ALLOWED_HOSTS=["*"]`
- `CORS_ALLOW_ALL_ORIGINS=True`

Harden these before production deployment.

---

## Deploy (Recommended)

### Backend on Render

This repo now includes `render.yaml` for one-click backend deployment.

1. Push this repo to GitHub.
2. In Render, create a new Blueprint and select this repo.
3. Render will create:
   - `quantgol-backend` (web service)
   - `quantgol-postgres` (Postgres database)
4. Set required env vars in Render:
   - `FOOTBALL_DATA_API_KEY`
   - `GOOGLE_API_KEY`
   - `CORS_ALLOWED_ORIGINS` (set to your frontend URL)
   - `CSRF_TRUSTED_ORIGINS` (set to your frontend URL)
5. Deploy and note backend URL, e.g. `https://quantgol-backend.onrender.com`.

### Frontend on Vercel

1. Import the same repo in Vercel.
2. Set project root to `frontend`.
3. Add env var:
   - `NEXT_PUBLIC_API_BASE_URL=https://quantgol-backend.onrender.com`
4. Deploy.

### Post-deploy check

- `GET <backend>/api/feed-status/`
- `GET <backend>/api/ai-status/`
- Open frontend and verify:
  - match search/trending loads
  - scoreline renders
  - AI badge shows online/offline correctly
