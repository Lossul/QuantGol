"""API-Football v3 client for real match statistics.

Free tier: 100 requests/day — register at https://dashboard.api-football.com/
Set API_FOOTBALL_KEY in your backend .env to activate.

Provides:
  - fetch_fixture_stats(home_team, away_team, match_date) → shots/possession/fouls for completed matches
  - fetch_live_stats(home_team, away_team)               → same for in-progress matches
"""

import json
import logging
import os
import re
import time
import unicodedata
from datetime import date, timedelta
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

BASE_URL = "https://v3.football.api-sports.io"

# ── In-process caches (survive request lifetime, reset on worker restart) ──────
# date string → (monotonic_ts, list[fixture_dict])
_fixture_date_cache: Dict[str, Any] = {}
# fixture_id (int) → (monotonic_ts, stats_dict | None)
_fixture_stats_cache: Dict[int, Any] = {}
# (monotonic_ts, list[live_fixture_dict])
_live_cache: Any = (0.0, [])

DATE_CACHE_TTL = 3600   # completed fixtures don't change
STATS_CACHE_TTL = 3600
LIVE_CACHE_TTL = 30     # refresh live data every 30 s


# ── Helpers ────────────────────────────────────────────────────────────────────

def is_configured() -> bool:
    return bool((os.getenv("API_FOOTBALL_KEY") or "").strip())


def _get_api_key() -> Optional[str]:
    return (os.getenv("API_FOOTBALL_KEY") or "").strip() or None


def _api_request(path: str, params: Optional[Dict[str, str]] = None) -> Optional[Dict[str, Any]]:
    api_key = _get_api_key()
    if not api_key:
        return None

    query = f"?{urlencode(params)}" if params else ""
    url = f"{BASE_URL}{path}{query}"
    headers = {
        "x-apisports-key": api_key,
        "Accept": "application/json",
    }

    try:
        req = Request(url=url, headers=headers)
        with urlopen(req, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
        # API-Football wraps errors in {"errors": {key: message}}
        errors = payload.get("errors") if isinstance(payload, dict) else None
        if errors:
            logger.debug("api-football error for %s: %s", url, errors)
            return None
        return payload
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("api-football request failed %s: %s", url, exc)
        return None


def _normalize_name(name: str) -> str:
    value = unicodedata.normalize("NFKD", (name or "")).encode("ascii", "ignore").decode("ascii")
    # Strip common club suffixes/prefixes that vary between sources
    for token in [r"\bfc\b", r"\bcf\b", r"\bsc\b", r"\bac\b", r"\bafc\b", r"\bfk\b", r"\brc\b"]:
        value = re.sub(token, "", value, flags=re.IGNORECASE)
    return " ".join(value.lower().split())


def _name_similarity(a: str, b: str) -> float:
    na, nb = _normalize_name(a), _normalize_name(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if na in nb or nb in na:
        return 0.9
    return SequenceMatcher(None, na, nb).ratio()


def _find_best_fixture(fixtures: List[Dict[str, Any]], home_team: str, away_team: str) -> Optional[Dict[str, Any]]:
    """Return the fixture whose team names best match home_team / away_team."""
    best: Optional[Dict[str, Any]] = None
    best_score = 0.0

    for f in fixtures:
        teams = f.get("teams") or {}
        fh = str((teams.get("home") or {}).get("name") or "")
        fa = str((teams.get("away") or {}).get("name") or "")

        direct  = (_name_similarity(home_team, fh) + _name_similarity(away_team, fa)) / 2
        swapped = (_name_similarity(home_team, fa) + _name_similarity(away_team, fh)) / 2
        score = max(direct, swapped)

        if score > best_score:
            best = f
            best_score = score

    return best if best_score >= 0.60 else None


def _extract_stat(statistics: List[Dict[str, Any]], stat_type: str) -> Any:
    for s in statistics:
        if s.get("type") == stat_type:
            return s.get("value")
    return None


def _parse_int(val: Any) -> Optional[int]:
    if val is None:
        return None
    try:
        return int(str(val).replace("%", "").strip())
    except (ValueError, TypeError):
        return None


def _parse_pct(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        return float(str(val).replace("%", "").strip())
    except (ValueError, TypeError):
        return None


def _build_stats_dict(
    response: List[Dict[str, Any]], home_team: str, away_team: str
) -> Optional[Dict[str, Any]]:
    """
    Convert the /fixtures/statistics `response` list into our internal dict.

    Response has two entries (one per team). We figure out which is home/away
    by comparing team names.
    """
    if not response or len(response) < 2:
        return None

    entry_a, entry_b = response[0], response[1]
    name_a = str((entry_a.get("team") or {}).get("name") or "")
    name_b = str((entry_b.get("team") or {}).get("name") or "")

    if _name_similarity(home_team, name_a) >= _name_similarity(home_team, name_b):
        home_stats = entry_a.get("statistics") or []
        away_stats = entry_b.get("statistics") or []
    else:
        home_stats = entry_b.get("statistics") or []
        away_stats = entry_a.get("statistics") or []

    home_shots = _parse_int(_extract_stat(home_stats, "Total Shots"))
    away_shots = _parse_int(_extract_stat(away_stats, "Total Shots"))
    home_fouls = _parse_int(_extract_stat(home_stats, "Fouls"))
    away_fouls = _parse_int(_extract_stat(away_stats, "Fouls"))
    home_poss  = _parse_pct(_extract_stat(home_stats, "Ball Possession"))
    away_poss  = _parse_pct(_extract_stat(away_stats, "Ball Possession"))

    # Sanity-check: at minimum we need shots or possession
    if home_shots is None and away_shots is None and home_poss is None:
        return None

    return {
        "home_shots":      home_shots,
        "away_shots":      away_shots,
        "home_fouls":      home_fouls,
        "away_fouls":      away_fouls,
        "home_possession": home_poss,
        "away_possession": away_poss,
    }


def _fetch_stats_for_fixture_id(fixture_id: int, home_team: str, away_team: str) -> Optional[Dict[str, Any]]:
    """Call /fixtures/statistics for a known fixture ID; result is cached."""
    global _fixture_stats_cache

    now = time.monotonic()
    cache_entry = _fixture_stats_cache.get(fixture_id)
    if cache_entry and now - cache_entry[0] <= STATS_CACHE_TTL:
        return cache_entry[1]

    payload = _api_request("/fixtures/statistics", {"fixture": str(fixture_id)})
    result = None
    if payload and isinstance(payload.get("response"), list):
        result = _build_stats_dict(payload["response"], home_team, away_team)

    _fixture_stats_cache[fixture_id] = (now, result)
    return result


# ── Public API ─────────────────────────────────────────────────────────────────

def fetch_fixture_stats(
    home_team: str, away_team: str, match_date: str
) -> Optional[Dict[str, Any]]:
    """
    Fetch real match statistics for a completed fixture.

    Args:
        home_team:  Home team name (as stored in DB, e.g. from football-data.org).
        away_team:  Away team name.
        match_date: UTC date of kick-off in "YYYY-MM-DD" format.

    Returns:
        Dict with keys: home_shots, away_shots, home_fouls, away_fouls,
        home_possession, away_possession — or None if unavailable.
    """
    if not is_configured():
        return None

    # Free tier only allows roughly today ±1 day; skip out-of-range calls early.
    try:
        requested = date.fromisoformat(match_date)
        today = date.today()
        if abs((requested - today).days) > 2:
            logger.debug(
                "api-football: skipping date %s (outside free-tier window around %s)",
                match_date, today,
            )
            return None
    except ValueError:
        return None

    now = time.monotonic()

    # Fetch (or return cached) all fixtures for the given date
    cache_entry = _fixture_date_cache.get(match_date)
    if cache_entry and now - cache_entry[0] <= DATE_CACHE_TTL:
        fixtures = cache_entry[1]
    else:
        payload = _api_request("/fixtures", {"date": match_date})
        if not payload or not isinstance(payload.get("response"), list):
            return None
        fixtures = payload["response"]
        _fixture_date_cache[match_date] = (now, fixtures)

    fixture = _find_best_fixture(fixtures, home_team, away_team)
    if not fixture:
        logger.debug(
            "api-football: no fixture match for %s vs %s on %s",
            home_team, away_team, match_date,
        )
        return None

    fixture_id = (fixture.get("fixture") or {}).get("id")
    if not fixture_id:
        return None

    return _fetch_stats_for_fixture_id(int(fixture_id), home_team, away_team)


def fetch_live_stats(home_team: str, away_team: str) -> Optional[Dict[str, Any]]:
    """
    Fetch real-time statistics for a currently live match.

    Returns dict with same keys as fetch_fixture_stats, or None.
    """
    global _live_cache
    if not is_configured():
        return None

    now = time.monotonic()
    if now - _live_cache[0] > LIVE_CACHE_TTL:
        payload = _api_request("/fixtures", {"live": "all"})
        if payload and isinstance(payload.get("response"), list):
            _live_cache = (now, payload["response"])
        else:
            return None

    live_fixtures = _live_cache[1]
    fixture = _find_best_fixture(live_fixtures, home_team, away_team)
    if not fixture:
        return None

    fixture_id = (fixture.get("fixture") or {}).get("id")
    if not fixture_id:
        return None

    return _fetch_stats_for_fixture_id(int(fixture_id), home_team, away_team)
