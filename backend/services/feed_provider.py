import json
import logging
import os
import random
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from django.utils import timezone

logger = logging.getLogger(__name__)


@dataclass
class FeedStatus:
    mode: str
    source: str
    is_demo: bool
    configured: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mode": self.mode,
            "source": self.source,
            "is_demo": self.is_demo,
            "configured": self.configured,
        }


def _demo_event(match_id: str, current_minute: int) -> Dict[str, Any]:
    from api.models import Match

    # Look up real team names from the DB
    try:
        match = Match.objects.get(match_id=match_id)
        teams = [match.home_team, match.away_team]
    except Match.DoesNotExist:
        teams = ["Home", "Away"]

    event_types = ["Pass", "Shot", "Goal", "Foul", "Tackle", "Interception"]

    active_team = random.choice(teams)
    base_possession = 55.0 if active_team == teams[0] else 45.0
    fluctuation = random.uniform(-5.0, 5.0)

    return {
        "match_id": match_id,
        "timestamp": current_minute,
        "event_type": random.choice(event_types),
        "team": active_team,
        "possession_stat": round(base_possession + fluctuation, 1),
    }


def _external_event(match_id: str, current_minute: int) -> Optional[Dict[str, Any]]:
    endpoint = os.getenv("LIVE_FEED_ENDPOINT", "").strip()
    if not endpoint:
        return None

    api_key = os.getenv("LIVE_FEED_API_KEY", "").strip()
    api_key_header = os.getenv("LIVE_FEED_API_KEY_HEADER", "Authorization").strip()
    api_key_prefix = os.getenv("LIVE_FEED_API_KEY_PREFIX", "Bearer ")

    query = urlencode({"match_id": match_id, "minute": current_minute})
    url = f"{endpoint}?{query}"
    headers = {}
    if api_key:
        headers[api_key_header] = f"{api_key_prefix}{api_key}"

    try:
        request = Request(url=url, headers=headers)
        with urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))

        return {
            "match_id": str(payload.get("match_id", match_id)),
            "timestamp": int(payload.get("timestamp", current_minute)),
            "event_type": str(payload.get("event_type", "Pass")),
            "team": str(payload.get("team", "Unknown")),
            "player": payload.get("player"),
            "possession_stat": float(payload.get("possession_stat", 50.0)),
            "x_coord": payload.get("x_coord"),
            "y_coord": payload.get("y_coord"),
        }
    except (URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return None


def get_feed_status() -> FeedStatus:
    mode = os.getenv("LIVE_FEED_MODE", "demo").strip().lower()
    endpoint = os.getenv("LIVE_FEED_ENDPOINT", "").strip()

    if mode == "external":
        return FeedStatus(
            mode="external",
            source=(endpoint or "not-configured"),
            is_demo=False,
            configured=bool(endpoint),
        )

    return FeedStatus(
        mode="demo",
        source="internal-simulator",
        is_demo=True,
        configured=True,
    )


def get_live_event(match_id: str, current_minute: int) -> Dict[str, Any]:
    status = get_feed_status()

    if status.mode == "external" and status.configured:
        event = _external_event(match_id, current_minute)
        if event is not None:
            return event

    return _demo_event(match_id, current_minute)


def get_or_create_match(match_id: str, default_home_team: str = "Home", default_away_team: str = "Away"):
    """Get or create a Match object for the given match_id.

    If the match already exists in the DB (e.g. synced from football-data.org),
    returns it directly.  Otherwise creates a new entry with the supplied defaults.
    """
    from api.models import Match

    match, created = Match.objects.get_or_create(
        match_id=match_id,
        defaults={
            "home_team": default_home_team,
            "away_team": default_away_team,
            "status": "live",
            "start_time": timezone.now(),
        }
    )
    return match


def search_external_matches(query: str, match_date: Optional[str] = None) -> List[Dict[str, Any]]:
    """Search matches via football-data.org or a custom external endpoint.

    Tries football-data.org first (if ``FOOTBALL_DATA_API_KEY`` is set),
    then falls back to the custom ``LIVE_MATCH_SEARCH_ENDPOINT``.
    """
    # 1) Try football-data.org API
    try:
        from services.football_data_client import is_configured, search_matches_by_team

        if is_configured():
            api_results = search_matches_by_team(query)
            if api_results:
                return api_results
    except Exception as exc:
        logger.warning("football-data.org search failed: %s", exc)

    # 2) Fall back to custom endpoint
    endpoint = os.getenv("LIVE_MATCH_SEARCH_ENDPOINT", "").strip()
    if not endpoint:
        return []

    api_key = os.getenv("LIVE_FEED_API_KEY", "").strip()
    api_key_header = os.getenv("LIVE_FEED_API_KEY_HEADER", "Authorization").strip()
    api_key_prefix = os.getenv("LIVE_FEED_API_KEY_PREFIX", "Bearer ")

    params: Dict[str, str] = {"query": query}
    if match_date:
        params["date"] = match_date

    query_string = urlencode(params)
    url = f"{endpoint}?{query_string}"

    headers = {}
    if api_key:
        headers[api_key_header] = f"{api_key_prefix}{api_key}"

    try:
        request = Request(url=url, headers=headers)
        with urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))

        raw_matches = payload.get("matches") if isinstance(payload, dict) else payload
        if not isinstance(raw_matches, list):
            return []

        normalized_matches: List[Dict[str, Any]] = []
        for item in raw_matches[:20]:
            if not isinstance(item, dict):
                continue

            match_id = str(item.get("match_id") or item.get("id") or "").strip()
            home_team = str(item.get("home_team") or item.get("home") or "").strip()
            away_team = str(item.get("away_team") or item.get("away") or "").strip()

            if not match_id or not home_team or not away_team:
                continue

            normalized_matches.append(
                {
                    "match_id": match_id,
                    "home_team": home_team,
                    "away_team": away_team,
                    "status": str(item.get("status", "completed")),
                    "start_time": item.get("start_time") or item.get("utc_date") or "",
                    "source": "provider",
                }
            )

        return normalized_matches
    except (URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return []
