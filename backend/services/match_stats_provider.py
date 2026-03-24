import json
import os
from typing import Any, Dict, Optional
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def fetch_external_match_stats(match_id: str) -> Optional[Dict[str, Any]]:
    """Fetch optional box stats from a custom external provider."""
    endpoint = os.getenv("MATCH_STATS_ENDPOINT", "").strip()
    if not endpoint:
        return None

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
        return None

    if not isinstance(payload, dict):
        return None

    required = [
        "home_shots",
        "away_shots",
        "home_fouls",
        "away_fouls",
        "home_possession",
        "away_possession",
    ]
    if not all(key in payload for key in required):
        return None

    return payload
