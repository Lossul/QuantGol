import json
import os
import unicodedata
from datetime import timedelta
from difflib import SequenceMatcher
from typing import Any, Dict, Optional
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def _normalize_team_name(name: str) -> str:
    value = unicodedata.normalize("NFKD", (name or "")).encode("ascii", "ignore").decode("ascii")
    value = value.lower().replace("fc", "").replace("cf", "")
    for ch in [".", ",", "-", "_", "'", '"']:
        value = value.replace(ch, " ")
    return " ".join(value.split())


def _name_similarity(left: str, right: str) -> float:
    l = _normalize_team_name(left)
    r = _normalize_team_name(right)
    if not l or not r:
        return 0.0
    if l == r:
        return 1.0
    if l in r or r in l:
        return 0.92
    return SequenceMatcher(None, l, r).ratio()


def _bzz_request(path: str, token: str, params: Optional[Dict[str, str]] = None) -> Optional[Dict[str, Any]]:
    base = os.getenv("BZZOIRO_API_BASE_URL", "https://sports.bzzoiro.com/api").strip().rstrip("/")
    query = f"?{urlencode(params)}" if params else ""
    url = f"{base}{path}{query}"
    headers = {
        "Authorization": f"Token {token}",
        "Accept": "application/json",
        "User-Agent": "QuantGol/1.0",
    }

    try:
        request = Request(url=url, headers=headers)
        with urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return payload if isinstance(payload, dict) else None
    except (URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return None


def _pick_best_bzz_event(match: Any, candidates: list[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not candidates:
        return None

    home = getattr(match, "home_team", "")
    away = getattr(match, "away_team", "")
    target_ts = getattr(match, "start_time", None)
    best: Optional[Dict[str, Any]] = None
    best_score = -1.0

    for event in candidates:
        eh = str(event.get("home_team") or "")
        ea = str(event.get("away_team") or "")

        direct = (_name_similarity(home, eh) + _name_similarity(away, ea)) / 2
        swapped = (_name_similarity(home, ea) + _name_similarity(away, eh)) / 2
        score = max(direct, swapped)

        if target_ts and event.get("event_date"):
            try:
                from django.utils.dateparse import parse_datetime

                event_dt = parse_datetime(str(event["event_date"]))
                if event_dt:
                    minute_delta = abs((event_dt - target_ts).total_seconds()) / 60
                    if minute_delta <= 180:
                        score += 0.08
                    elif minute_delta <= 720:
                        score += 0.03
            except Exception:
                pass

        if score > best_score:
            best = event
            best_score = score

    return best if best_score >= 0.65 else None


def _extract_team_side_from_player_row(row: Dict[str, Any], home: str, away: str) -> Optional[str]:
    if isinstance(row.get("is_home"), bool):
        return "home" if row["is_home"] else "away"

    team_obj = row.get("team") if isinstance(row.get("team"), dict) else {}
    team_name = str(team_obj.get("name") or row.get("team_name") or "")
    if team_name:
        home_sim = _name_similarity(home, team_name)
        away_sim = _name_similarity(away, team_name)
        if home_sim >= away_sim and home_sim >= 0.65:
            return "home"
        if away_sim > home_sim and away_sim >= 0.65:
            return "away"

    return None


def _fetch_api_football_match_stats(match: Any) -> Optional[Dict[str, Any]]:
    """Fetch match stats from API-Football (api-football.com).

    Works for both completed and live matches. Requires API_FOOTBALL_KEY env var.
    """
    try:
        from services.api_football_client import (
            fetch_fixture_stats,
            fetch_live_stats,
            is_configured,
        )
    except ImportError:
        return None

    if not is_configured():
        return None

    home = getattr(match, "home_team", "") or ""
    away = getattr(match, "away_team", "") or ""
    if not home or not away:
        return None

    match_status = str(getattr(match, "status", "")).lower()

    if match_status == "live":
        return fetch_live_stats(home, away)

    # Completed (or scheduled — treated the same for stats lookup)
    from django.utils import timezone

    start = getattr(match, "start_time", None) or timezone.now()
    match_date = start.date().isoformat()
    return fetch_fixture_stats(home, away, match_date)


def _fetch_bzzoiro_match_stats(match: Any) -> Optional[Dict[str, Any]]:
    token = os.getenv("BZZOIRO_API_TOKEN", "").strip()
    if not token:
        return None

    from django.utils import timezone

    start = getattr(match, "start_time", None) or timezone.now()
    date_from = (start - timedelta(days=1)).date().isoformat()
    date_to = (start + timedelta(days=1)).date().isoformat()

    events_payload = _bzz_request(
        "/events/",
        token,
        {
            "date_from": date_from,
            "date_to": date_to,
            "team": getattr(match, "home_team", ""),
            "tz": "UTC",
        },
    )
    if not events_payload:
        return None

    candidates = events_payload.get("results") if isinstance(events_payload.get("results"), list) else []
    selected = _pick_best_bzz_event(match, candidates)
    if not selected:
        return None

    # If event is live/in-progress, use direct live_stats when available.
    status_value = str(selected.get("status") or "").lower()
    if status_value in {"inprogress", "1st_half", "halftime", "2nd_half"}:
        live_payload = _bzz_request("/live/", token, {"tz": "UTC"})
        if live_payload and isinstance(live_payload.get("results"), list):
            live_match = _pick_best_bzz_event(match, live_payload["results"])
            live_stats = live_match.get("live_stats") if isinstance(live_match, dict) else None
            if isinstance(live_stats, dict):
                home_stats = live_stats.get("home") if isinstance(live_stats.get("home"), dict) else {}
                away_stats = live_stats.get("away") if isinstance(live_stats.get("away"), dict) else {}
                return {
                    "home_shots": int(home_stats.get("total_shots") or 0),
                    "away_shots": int(away_stats.get("total_shots") or 0),
                    "home_fouls": int(home_stats.get("fouls") or 0),
                    "away_fouls": int(away_stats.get("fouls") or 0),
                    "home_possession": float(home_stats.get("ball_possession")) if home_stats.get("ball_possession") is not None else None,
                    "away_possession": float(away_stats.get("ball_possession")) if away_stats.get("ball_possession") is not None else None,
                }

    # Completed or non-live: aggregate from player stats by event.
    event_id = selected.get("id")
    if event_id is None:
        return None

    player_stats_payload = _bzz_request("/player-stats/", token, {"event": str(event_id), "tz": "UTC"})
    if not player_stats_payload:
        return None
    rows = player_stats_payload.get("results") if isinstance(player_stats_payload.get("results"), list) else []
    if not rows:
        return None

    home_shots = 0
    away_shots = 0
    home_fouls = 0
    away_fouls = 0
    home_side_count = 0
    away_side_count = 0

    for row in rows:
        if not isinstance(row, dict):
            continue
        side = _extract_team_side_from_player_row(row, getattr(match, "home_team", ""), getattr(match, "away_team", ""))
        if side == "home":
            home_side_count += 1
            home_shots += int(row.get("total_shots") or 0)
            home_fouls += int(row.get("fouls") or 0)
        elif side == "away":
            away_side_count += 1
            away_shots += int(row.get("total_shots") or 0)
            away_fouls += int(row.get("fouls") or 0)

    if home_side_count == 0 and away_side_count == 0:
        return None

    return {
        "home_shots": home_shots,
        "away_shots": away_shots,
        "home_fouls": home_fouls,
        "away_fouls": away_fouls,
        "home_possession": None,
        "away_possession": None,
    }


def fetch_external_match_stats(match_id: str) -> Optional[Dict[str, Any]]:
    """Fetch optional box stats from a custom external provider."""
    endpoint = os.getenv("MATCH_STATS_ENDPOINT", "").strip()

    if endpoint:
        api_key = os.getenv("MATCH_STATS_API_KEY", "").strip()
        api_key_header = os.getenv("MATCH_STATS_API_KEY_HEADER", "Authorization").strip()
        api_key_prefix = os.getenv("MATCH_STATS_API_KEY_PREFIX", "Bearer ")

        query = urlencode({"match_id": match_id})
        url = f"{endpoint}?{query}"
        headers: Dict[str, str] = {}
        if api_key:
            headers[api_key_header] = f"{api_key_prefix}{api_key}"

        try:
            request = Request(url=url, headers=headers)
            with urlopen(request, timeout=6) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (URLError, TimeoutError, ValueError, json.JSONDecodeError):
            payload = None

        if isinstance(payload, dict):
            required = [
                "home_shots",
                "away_shots",
                "home_fouls",
                "away_fouls",
                "home_possession",
                "away_possession",
            ]
            if all(key in payload for key in required):
                return payload

    # Optional built-in provider integrations — tried in order, first win returned.
    try:
        from api.models import Match

        match = Match.objects.filter(match_id=match_id).first()
        if not match:
            return None

        # 1) API-Football (primary: free tier, reliable stats)
        api_football_result = _fetch_api_football_match_stats(match)
        if api_football_result:
            return api_football_result

        # 2) Bzzoiro (secondary fallback)
        return _fetch_bzzoiro_match_stats(match)
    except Exception:
        return None
