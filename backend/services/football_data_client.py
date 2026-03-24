"""Thin wrapper around the football-data.org v4 REST API.

Free-tier covers 12 competitions.  Auth is via ``X-Auth-Token`` header
using the ``FOOTBALL_DATA_API_KEY`` environment variable.

Docs: https://www.football-data.org/documentation/quickstart
"""

import json
import logging
import os
import ssl
import time
from datetime import date, timedelta
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def _get_ssl_context() -> ssl.SSLContext:
    """Build an SSL context that works on macOS where system certs may not be found."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass

    # Fallback: try default context first, then unverified if needed
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.football-data.org/v4"

# Competitions available on the free tier
FREE_TIER_COMPETITIONS = [
    "PL",   # Premier League
    "PD",   # La Liga
    "BL1",  # Bundesliga
    "SA",   # Serie A
    "FL1",  # Ligue 1
    "CL",   # Champions League
    "EC",   # European Championship
    "WC",   # FIFA World Cup
    "ELC",  # Championship
    "PPL",  # Primeira Liga
    "DED",  # Eredivisie
    "BSA",  # Brasileirão
]

# Map football-data.org status strings to our internal format
STATUS_MAP = {
    "SCHEDULED": "scheduled",
    "TIMED": "scheduled",
    "IN_PLAY": "live",
    "PAUSED": "live",
    "LIVE": "live",
    "FINISHED": "completed",
    "POSTPONED": "scheduled",
    "SUSPENDED": "scheduled",
    "CANCELLED": "completed",
    "AWARDED": "completed",
}

SEARCH_TTL_SECONDS = 30
_search_cache: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}


def _get_api_key() -> Optional[str]:
    """Return the football-data.org API key, or None."""
    return (os.getenv("FOOTBALL_DATA_API_KEY") or "").strip() or None


def _api_request(path: str, params: Optional[Dict[str, str]] = None) -> Optional[Dict[str, Any]]:
    """Perform an authenticated GET request against the football-data.org API."""
    api_key = _get_api_key()
    if not api_key:
        return None

    query = ""
    if params:
        from urllib.parse import urlencode
        query = "?" + urlencode(params)

    url = f"{BASE_URL}{path}{query}"
    headers = {"X-Auth-Token": api_key}

    try:
        req = Request(url=url, headers=headers)
        with urlopen(req, timeout=10, context=_get_ssl_context()) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("football-data.org request failed: %s — %s", url, exc)
        return None


def _normalize_match(match_data: Dict[str, Any], competition_code: str = "") -> Dict[str, Any]:
    """Convert a single match object from the API into our internal format."""
    home = match_data.get("homeTeam") or {}
    away = match_data.get("awayTeam") or {}
    api_status = match_data.get("status", "SCHEDULED")
    score = match_data.get("score") or {}
    full_time = score.get("fullTime") or {}
    home_score = full_time.get("home")
    away_score = full_time.get("away")

    return {
        "match_id": f"FD-{match_data['id']}",
        "home_team": home.get("shortName") or home.get("name") or "TBD",
        "away_team": away.get("shortName") or away.get("name") or "TBD",
        "home_score": int(home_score) if isinstance(home_score, int) and home_score >= 0 else 0,
        "away_score": int(away_score) if isinstance(away_score, int) and away_score >= 0 else 0,
        "status": STATUS_MAP.get(api_status, "scheduled"),
        "start_time": match_data.get("utcDate") or "",
        "competition": competition_code,
    }


def fetch_matches(
    competition: str = "PL",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch matches for a given competition.

    Args:
        competition: League code, e.g. ``"PL"`` for Premier League.
        date_from:   ISO date string ``"YYYY-MM-DD"``.  Defaults to today − 3 days.
        date_to:     ISO date string ``"YYYY-MM-DD"``.  Defaults to today + 14 days.
        status:      Optional filter, e.g. ``"SCHEDULED"`` or ``"FINISHED"``.

    Returns:
        List of normalized match dicts.
    """
    today = date.today()
    params: Dict[str, str] = {
        "dateFrom": date_from or (today - timedelta(days=3)).isoformat(),
        "dateTo": date_to or (today + timedelta(days=14)).isoformat(),
    }
    if status:
        params["status"] = status

    payload = _api_request(f"/competitions/{competition}/matches", params)
    if not payload:
        return []

    raw_matches = payload.get("matches", [])
    return [_normalize_match(m, competition) for m in raw_matches]


def fetch_all_today(competitions: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Fetch today's matches across all (or specified) free-tier competitions."""
    today_str = date.today().isoformat()
    comps = competitions or FREE_TIER_COMPETITIONS
    all_matches: List[Dict[str, Any]] = []

    for comp in comps:
        matches = fetch_matches(comp, date_from=today_str, date_to=today_str)
        all_matches.extend(matches)

    return all_matches


def fetch_match_by_id(match_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single match by football-data.org numeric ID."""
    normalized_id = str(match_id).strip()
    if normalized_id.startswith("FD-"):
        normalized_id = normalized_id[3:]
    if not normalized_id.isdigit():
        return None

    payload = _api_request(f"/matches/{normalized_id}")
    if not payload or not isinstance(payload, dict):
        return None

    comp = payload.get("competition", {}) if isinstance(payload.get("competition"), dict) else {}
    return _normalize_match(payload, comp.get("code", ""))


def search_matches_by_team(query: str, days_back: int = 4, days_forward: int = 5) -> List[Dict[str, Any]]:
    """Search for matches mentioning a team name across free-tier competitions.

    This fetches recent + upcoming matches and filters client-side by team name.
    """
    query_lower = query.strip().lower()
    if len(query_lower) < 2:
        return []

    cache_key = f"{query_lower}:{days_back}:{days_forward}"
    cache_entry = _search_cache.get(cache_key)
    now_monotonic = time.monotonic()
    if cache_entry and now_monotonic - cache_entry[0] <= SEARCH_TTL_SECONDS:
        return cache_entry[1]

    today = date.today()
    date_from = (today - timedelta(days=days_back)).isoformat()
    date_to = (today + timedelta(days=days_forward)).isoformat()

    # Use the global /matches endpoint (more efficient, single request)
    params = {"dateFrom": date_from, "dateTo": date_to}
    payload = _api_request("/matches", params)
    if not payload:
        return []

    results: List[Dict[str, Any]] = []
    for m in payload.get("matches", []):
        home = m.get("homeTeam") or {}
        away = m.get("awayTeam") or {}
        home_name = (home.get("shortName") or home.get("name") or "").lower()
        away_name = (away.get("shortName") or away.get("name") or "").lower()

        if query_lower in home_name or query_lower in away_name:
            comp = m.get("competition", {})
            normalized = _normalize_match(m, comp.get("code", ""))
            normalized["source"] = "football-data.org"
            results.append(normalized)

    top_results = results[:20]
    _search_cache[cache_key] = (now_monotonic, top_results)
    return top_results


def is_configured() -> bool:
    """Return True if the football-data.org API key is set."""
    return _get_api_key() is not None
