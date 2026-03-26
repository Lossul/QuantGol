# QuantGol

A football intelligence dashboard with live match tracking, real tactical statistics, interactive visualizations, and an AI analyst.

---

## What it does

- **Match search** — search any team across live fixtures (football-data.org) and the full StatsBomb historical dataset
- **Live dashboard** — real-time event stream with momentum chart, possession timeline, shot map, and xG chart
- **Real stats** — shots, possession, fouls, xG from official StatsBomb open data for historical matches; live stats from API-Football for recent fixtures
- **AI analyst** — ask tactical questions about any match; powered by Groq → Gemini → local fallback
- **Deep analytics** — shot map, xG timeline, pass network, and pressure counts for StatsBomb matches
- **Player stats** — per-player shots, goals, xG, passes, and pressures

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js, React 19, TypeScript, Tailwind CSS 4, Recharts |
| Backend | Django 5, Django REST Framework, SQLite (local) / Postgres (prod) |
| Data — live | football-data.org (scores + fixtures) |
| Data — historical | StatsBomb Open Data (full event-level stats) |
| Data — real-time stats | API-Football free tier (shots/possession for live/recent) |
| AI | Groq (primary) → Gemini (fallback) → local rule-based (offline fallback) |

---

## Quick start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # then fill in your keys (see below)
python manage.py migrate
python manage.py sync_matches --competition PL PD CL --days 14
python manage.py runserver
```

Runs at `http://127.0.0.1:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at `http://localhost:3000`.

---

## API keys

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Where to get it | Required? |
|---|---|---|
| `FOOTBALL_DATA_API_KEY` | [football-data.org/client/register](https://www.football-data.org/client/register) — free | Yes |
| `GROQ_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) — free | Yes (AI) |
| `GOOGLE_API_KEY` | [aistudio.google.com](https://aistudio.google.com) — free | Optional (AI fallback) |
| `API_FOOTBALL_KEY` | [dashboard.api-football.com](https://dashboard.api-football.com) — free, 100 req/day | Optional (live stats) |
| `BZZOIRO_API_TOKEN` | Bzzoiro Sports API | Optional (stats fallback) |

The app runs without AI keys — it falls back gracefully. StatsBomb data requires no key at all.

---

## How data works

### Historical matches (StatsBomb)

Search any team name — results include every match in the StatsBomb open dataset (~3,800 matches across La Liga, Champions League, Premier League, World Cup, Euros, and more).

Click any result to open full stats:
- Shot map with real xG values
- xG timeline
- Possession (derived from real event data)
- Pass network
- Per-player stats

**No import command needed.** The index is built automatically on first search and cached to disk.

First search on a fresh install takes ~30–60 seconds while the index downloads. Every search after that is instant.

### Live / recent matches (football-data.org)

Covers 12 top competitions on the free tier (Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, World Cup, Euros, and more).

Scores are real. Detailed stats (shots, possession, fouls) are available for fixtures within ~2 days via API-Football.

### Live feed mode

Set `LIVE_FEED_MODE=demo` to use the built-in simulated event stream (default). Set to `external` and provide `LIVE_FEED_ENDPOINT` to connect a real live data provider.

---

## Environment variables reference

```env
# football-data.org — fixtures, scores, search
FOOTBALL_DATA_API_KEY=

# AI — Groq is primary, Gemini is fallback
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
GOOGLE_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
AI_PROVIDER_ORDER=groq,gemini

# Live stats for recent/live matches (free tier, 100 req/day)
API_FOOTBALL_KEY=

# Live event feed
LIVE_FEED_MODE=demo                # demo | external
LIVE_FEED_ENDPOINT=                # only needed for external mode
LIVE_FEED_API_KEY=
LIVE_FEED_API_KEY_HEADER=Authorization
LIVE_FEED_API_KEY_PREFIX=Bearer

# Custom stats endpoint (optional — overrides all built-in providers)
MATCH_STATS_ENDPOINT=
MATCH_STATS_API_KEY=

# Bzzoiro Sports API (optional stats fallback)
BZZOIRO_API_BASE_URL=https://sports.bzzoiro.com/api
BZZOIRO_API_TOKEN=
```

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/matches/` | All matches |
| GET | `/api/matches/trending/` | Live → upcoming → recent (top 5) |
| GET | `/api/matches/search/?query=Arsenal` | Search by team name |
| GET | `/api/matches/{match_id}/` | Match detail |
| GET | `/api/matches/{match_id}/stats/` | Box stats (shots, possession, fouls) |
| GET | `/api/matches/{match_id}/players/` | Per-player stats |
| GET | `/api/matches/{match_id}/deep-analytics/` | Shot map, xG, pass network (SB- only) |
| GET | `/api/events/?match_id=...` | Event timeline |
| GET | `/api/stream/{match_id}/` | SSE live event stream |
| GET | `/api/feed-status/` | Current feed mode and source |
| GET | `/api/ai-status/` | AI provider health check |
| POST | `/api/analyze-tactics/` | Generate tactical insight |

Match ID prefixes:
- `SB-` — StatsBomb open data (full stats, xG, pass network)
- `FD-` — football-data.org (scores only for historical; live stats for recent fixtures)

---

## Management commands

```bash
# Sync recent + upcoming fixtures from football-data.org
python manage.py sync_matches --competition PL PD CL SA BL1 --days 14

# Seed a set of demo matches for local dev
python manage.py seed_matches

# Optional: pre-import a specific StatsBomb competition (not required — search does this automatically)
python manage.py import_statsbomb --competition-id 11 --season-id 27   # La Liga 2015/16
python manage.py import_statsbomb --competition-id 43 --season-id 106  # World Cup 2022
python manage.py import_statsbomb --competition-id 55 --season-id 43   # Euro 2020
```

StatsBomb competition IDs: `11` La Liga, `2` Premier League, `16` Champions League, `43` World Cup, `55` Euros.

---

## Deploy

### Backend → Render

This repo includes `render.yaml` for one-click deployment.

1. Push to GitHub
2. In Render, create a **Blueprint** and point it at this repo
3. Render creates a web service + Postgres database automatically
4. Set these env vars in the Render dashboard:
   - `FOOTBALL_DATA_API_KEY`
   - `GROQ_API_KEY`
   - `GOOGLE_API_KEY`
   - `CORS_ALLOWED_ORIGINS` → your frontend URL
   - `CSRF_TRUSTED_ORIGINS` → your frontend URL
5. Note the backend URL (e.g. `https://quantgol-backend.onrender.com`)

### Frontend → Vercel

1. Import the repo in Vercel, set root directory to `frontend`
2. Add env var: `NEXT_PUBLIC_API_BASE_URL=https://quantgol-backend.onrender.com`
3. Deploy

### Post-deploy checks

```
GET /api/feed-status/   → should return {"mode": "demo", ...}
GET /api/ai-status/     → should return {"is_ready": true}
```

---

## Security note

The defaults are configured for local development:

```
DEBUG=True
ALLOWED_HOSTS=["*"]
CORS_ALLOW_ALL_ORIGINS=True
```

Set `DEBUG=False`, restrict `ALLOWED_HOSTS`, and set `CORS_ALLOWED_ORIGINS` to your frontend domain before deploying to production. The `render.yaml` already handles this for Render deployments.
