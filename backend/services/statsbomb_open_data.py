import json
import logging
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

BASE_RAW = "https://raw.githubusercontent.com/statsbomb/open-data/master/data"

# Lock so concurrent requests don't race to build the index simultaneously.
_index_lock = threading.Lock()
_index_ready = False


def _cache_dir() -> Path:
    root = Path(__file__).resolve().parent.parent  # backend/
    d = root / "data" / "statsbomb"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _fetch_json(url: str, cache_path: Path) -> Any:
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    try:
        req = Request(url=url, headers={"User-Agent": "QuantGol/1.0"})
        with urlopen(req, timeout=20) as response:
            raw = response.read().decode("utf-8")
    except (URLError, TimeoutError, ValueError):
        raise

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(raw, encoding="utf-8")
    return json.loads(raw)


def get_matches(competition_id: int, season_id: int) -> List[Dict[str, Any]]:
    """Return StatsBomb match list for competition/season."""
    cache = _cache_dir() / "matches" / str(competition_id) / f"{season_id}.json"
    url = f"{BASE_RAW}/matches/{competition_id}/{season_id}.json"
    payload = _fetch_json(url, cache)
    return payload if isinstance(payload, list) else []


def get_events(match_id: int) -> List[Dict[str, Any]]:
    cache = _cache_dir() / "events" / f"{match_id}.json"
    url = f"{BASE_RAW}/events/{match_id}.json"
    payload = _fetch_json(url, cache)
    return payload if isinstance(payload, list) else []


def get_lineups(match_id: int) -> List[Dict[str, Any]]:
    cache = _cache_dir() / "lineups" / f"{match_id}.json"
    url = f"{BASE_RAW}/lineups/{match_id}.json"
    payload = _fetch_json(url, cache)
    return payload if isinstance(payload, list) else []


def _minute_from_event(e: Dict[str, Any]) -> int:
    minute = e.get("minute")
    if isinstance(minute, int):
        return minute
    return 0


def _location_xy(e: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
    """Map StatsBomb 120x80 coordinates into 0..100 pitch coords."""
    loc = e.get("location")
    if not (isinstance(loc, list) and len(loc) >= 2):
        return None, None
    x, y = loc[0], loc[1]
    try:
        x_f = float(x)
        y_f = float(y)
    except (TypeError, ValueError):
        return None, None
    return round((x_f / 120.0) * 100.0, 1), round((y_f / 80.0) * 100.0, 1)


def map_events_to_quantgol(match_id: str, sb_events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert StatsBomb events into QuantGol MatchEvent-like dicts.

    possession_stat reflects the home team's running ball-share % derived from
    StatsBomb's possession_team field (which team held the ball at each event).
    """
    # Identify home team as whichever team appears first in the event stream.
    home_team: Optional[str] = None
    for e in sb_events:
        t = (e.get("team") or {}).get("name")
        if t:
            home_team = t
            break

    home_poss_count = 0
    total_poss_count = 0
    mapped: List[Dict[str, Any]] = []

    for e in sb_events:
        e_type = (e.get("type") or {}).get("name")
        team = (e.get("team") or {}).get("name") or "Unknown"
        player = (e.get("player") or {}).get("name")
        minute = _minute_from_event(e)
        x, y = _location_xy(e)

        # Update running possession counters from StatsBomb's possession_team field.
        poss_team = (e.get("possession_team") or {}).get("name")
        if poss_team:
            total_poss_count += 1
            if poss_team == home_team:
                home_poss_count += 1

        possession_stat = (
            round(home_poss_count / total_poss_count * 100, 1)
            if total_poss_count > 0
            else 50.0
        )

        event_type = None
        if e_type == "Pass":
            event_type = "Pass"
        elif e_type == "Shot":
            outcome = ((e.get("shot") or {}).get("outcome") or {}).get("name")
            event_type = "Goal" if outcome == "Goal" else "Shot"
        elif e_type == "Foul Committed":
            event_type = "Foul"
        elif e_type == "Duel":
            duel_type = ((e.get("duel") or {}).get("type") or {}).get("name", "")
            event_type = "Tackle" if "Tackle" in duel_type else "Interception"
        elif e_type == "Pressure":
            event_type = "Pressure"
        elif e_type == "Interception":
            event_type = "Interception"
        elif e_type == "Clearance":
            event_type = "Clearance"

        if not event_type:
            continue

        mapped.append(
            {
                "match_id": match_id,
                "timestamp": max(0, int(minute)),
                "event_type": event_type,
                "team": team,
                "player": player,
                "possession_stat": possession_stat,
                "x_coord": x,
                "y_coord": y,
            }
        )

    mapped.sort(key=lambda it: it["timestamp"])
    return mapped


def get_player_stats(sb_match_id: int) -> List[Dict[str, Any]]:
    """Aggregate per-player stats (shots, goals, xG, passes, pressures) from StatsBomb."""
    events = get_events(sb_match_id)

    shots_by_player: Dict[str, Dict[str, Any]] = {}
    passes_by_player: Dict[str, int] = {}
    pressures_by_player: Dict[str, int] = {}
    player_team: Dict[str, str] = {}

    for e in events:
        e_type = (e.get("type") or {}).get("name")
        player = (e.get("player") or {}).get("name")
        team = (e.get("team") or {}).get("name") or "Unknown"

        if not player:
            continue

        player_team[player] = team

        if e_type == "Shot":
            shot = e.get("shot") or {}
            outcome = ((shot.get("outcome") or {}).get("name")) or "Unknown"
            is_goal = outcome == "Goal"
            xg_raw = shot.get("statsbomb_xg")
            try:
                xg_f = float(xg_raw) if xg_raw is not None else 0.0
            except (TypeError, ValueError):
                xg_f = 0.0

            rec = shots_by_player.setdefault(player, {"shots": 0, "goals": 0, "xg": 0.0})
            rec["shots"] += 1
            rec["xg"] = round(rec["xg"] + xg_f, 3)
            if is_goal:
                rec["goals"] += 1

        elif e_type == "Pass":
            outcome = ((e.get("pass") or {}).get("outcome") or {}).get("name")
            if not outcome:  # completed pass
                passes_by_player[player] = passes_by_player.get(player, 0) + 1

        elif e_type == "Pressure":
            pressures_by_player[player] = pressures_by_player.get(player, 0) + 1

    # Merge into unified list; sort by xG desc then shots desc
    all_players = set(shots_by_player) | set(passes_by_player) | set(pressures_by_player)
    result = []
    for p in all_players:
        shot_data = shots_by_player.get(p, {"shots": 0, "goals": 0, "xg": 0.0})
        result.append(
            {
                "player": p,
                "team": player_team.get(p, "Unknown"),
                "shots": shot_data["shots"],
                "goals": shot_data["goals"],
                "xg": shot_data["xg"],
                "passes": passes_by_player.get(p, 0),
                "pressures": pressures_by_player.get(p, 0),
            }
        )

    result.sort(key=lambda r: (r["xg"], r["shots"]), reverse=True)
    return result


def build_deep_analytics(sb_match_id: int) -> Dict[str, Any]:
    """Build shot map, xG timeline, pass network, pressure counts from StatsBomb."""
    events = get_events(sb_match_id)

    # Identify teams from event stream.
    teams = []
    for e in events:
        t = (e.get("team") or {}).get("name")
        if t and t not in teams:
            teams.append(t)
        if len(teams) == 2:
            break
    home_team = teams[0] if teams else "Home"
    away_team = teams[1] if len(teams) > 1 else "Away"

    # Shot map + xG timeline (StatsBomb provides statsbomb_xg).
    shots = []
    timeline = []
    home_xg = 0.0
    away_xg = 0.0
    for e in events:
        if ((e.get("type") or {}).get("name")) != "Shot":
            continue
        minute = _minute_from_event(e)
        team = (e.get("team") or {}).get("name") or "Unknown"
        player = (e.get("player") or {}).get("name")
        x, y = _location_xy(e)
        shot = e.get("shot") or {}
        outcome = ((shot.get("outcome") or {}).get("name")) or "Unknown"
        xg = shot.get("statsbomb_xg")
        try:
            xg_f = float(xg) if xg is not None else 0.0
        except (TypeError, ValueError):
            xg_f = 0.0

        is_goal = outcome == "Goal"
        shots.append(
            {
                "minute": minute,
                "team": team,
                "player": player,
                "x": x,
                "y": y,
                "xg": round(xg_f, 3),
                "outcome": outcome,
                "is_goal": is_goal,
            }
        )

        if team == home_team:
            home_xg += xg_f
        else:
            away_xg += xg_f
        timeline.append(
            {
                "minute": minute,
                "home_xg": round(home_xg, 3),
                "away_xg": round(away_xg, 3),
            }
        )

    # Pass network: aggregate completed passes between players (simple).
    pass_edges: Dict[Tuple[str, str], int] = {}
    player_team: Dict[str, str] = {}
    player_touches: Dict[str, int] = {}

    for e in events:
        if ((e.get("type") or {}).get("name")) != "Pass":
            continue
        team = (e.get("team") or {}).get("name") or "Unknown"
        passer = (e.get("player") or {}).get("name") or "Unknown"
        recipient = ((e.get("pass") or {}).get("recipient") or {}).get("name") or "Unknown"
        outcome = ((e.get("pass") or {}).get("outcome") or {}).get("name")
        if outcome:  # if outcome exists, pass not completed
            continue

        player_team[passer] = team
        player_team[recipient] = team
        player_touches[passer] = player_touches.get(passer, 0) + 1
        player_touches[recipient] = player_touches.get(recipient, 0) + 1
        key = (passer, recipient)
        pass_edges[key] = pass_edges.get(key, 0) + 1

    nodes = [
        {"player": p, "team": player_team.get(p, "Unknown"), "touches": t}
        for p, t in sorted(player_touches.items(), key=lambda it: it[1], reverse=True)
    ][:14]
    node_set = {n["player"] for n in nodes}
    edges = [
        {"from": a, "to": b, "count": c}
        for (a, b), c in sorted(pass_edges.items(), key=lambda it: it[1], reverse=True)
        if a in node_set and b in node_set and c >= 2
    ][:40]

    # Pressures: counts per team/player.
    pressures_by_team: Dict[str, int] = {}
    pressures_by_player: Dict[str, int] = {}
    for e in events:
        if ((e.get("type") or {}).get("name")) != "Pressure":
            continue
        team = (e.get("team") or {}).get("name") or "Unknown"
        player = (e.get("player") or {}).get("name") or "Unknown"
        pressures_by_team[team] = pressures_by_team.get(team, 0) + 1
        pressures_by_player[player] = pressures_by_player.get(player, 0) + 1

    return {
        "home_team": home_team,
        "away_team": away_team,
        "shots": shots,
        "xg_timeline": timeline,
        "pass_network": {"nodes": nodes, "edges": edges},
        "pressures": {
            "by_team": pressures_by_team,
            "top_players": [
                {"player": p, "count": c}
                for p, c in sorted(pressures_by_player.items(), key=lambda it: it[1], reverse=True)[:10]
            ],
        },
        "source": "statsbomb-open-data",
    }


# ── Match index: search without prior import ───────────────────────────────────

def _index_path() -> Path:
    return _cache_dir() / "match_index.json"


def _build_index() -> List[Dict[str, Any]]:
    """Download every competition's match list and build a flat searchable index.

    Results are written to disk so subsequent calls are instant.
    This runs once; after that the cached file is used.
    """
    global _index_ready

    comps_cache = _cache_dir() / "competitions.json"
    try:
        competitions = _fetch_json(f"{BASE_RAW}/competitions.json", comps_cache)
    except Exception as exc:
        logger.warning("StatsBomb: could not fetch competitions list: %s", exc)
        return []

    index: List[Dict[str, Any]] = []
    for comp in competitions:
        comp_id = comp.get("competition_id")
        season_id = comp.get("season_id")
        if not (isinstance(comp_id, int) and isinstance(season_id, int)):
            continue
        try:
            matches = get_matches(comp_id, season_id)
        except Exception:
            continue
        for m in matches:
            sb_id = m.get("match_id")
            if not isinstance(sb_id, int):
                continue
            home = (m.get("home_team") or {}).get("home_team_name") or ""
            away = (m.get("away_team") or {}).get("away_team_name") or ""
            if not home or not away:
                continue
            index.append({
                "sb_id": sb_id,
                "home_team": home,
                "away_team": away,
                "home_score": m.get("home_score") if isinstance(m.get("home_score"), int) else 0,
                "away_score": m.get("away_score") if isinstance(m.get("away_score"), int) else 0,
                "match_date": m.get("match_date") or "",
                "competition": comp.get("competition_name", ""),
                "season": comp.get("season_name", ""),
            })

    _index_path().write_text(json.dumps(index), encoding="utf-8")
    _index_ready = True
    logger.info("StatsBomb index built: %d matches", len(index))
    return index


def _get_index() -> List[Dict[str, Any]]:
    """Return the match index, building + caching it if needed."""
    global _index_ready
    p = _index_path()
    if p.exists():
        _index_ready = True
        return json.loads(p.read_text(encoding="utf-8"))
    with _index_lock:
        if p.exists():
            _index_ready = True
            return json.loads(p.read_text(encoding="utf-8"))
        return _build_index()


def search_matches(query: str) -> List[Dict[str, Any]]:
    """Search all StatsBomb open data matches by team name.

    Returns match dicts ready to be used as search results.
    Builds and caches the index on first call (one-time, ~30-60s on cold start).
    """
    query_lower = query.strip().lower()
    if len(query_lower) < 2:
        return []

    try:
        index = _get_index()
    except Exception as exc:
        logger.warning("StatsBomb search failed: %s", exc)
        return []

    results = []
    for m in index:
        if query_lower in m["home_team"].lower() or query_lower in m["away_team"].lower():
            results.append({
                "match_id": f"SB-{m['sb_id']}",
                "home_team": m["home_team"],
                "away_team": m["away_team"],
                "status": "completed",
                "start_time": m["match_date"],
                "source": f"statsbomb — {m['competition']} {m['season']}",
            })
        if len(results) >= 20:
            break

    return results


def ensure_match_in_db(sb_match_id: int) -> Any:
    """Get or create a Match DB row for the given StatsBomb match ID.

    Called automatically when a user opens an SB- match — no manual
    import_statsbomb command required.
    """
    from django.utils.dateparse import parse_datetime
    from django.utils import timezone
    from api.models import Match

    match_id_str = f"SB-{sb_match_id}"
    existing = Match.objects.filter(match_id=match_id_str).first()
    if existing:
        return existing

    # Try the cached index first (fast path).
    try:
        index = _get_index()
    except Exception:
        index = []

    meta = next((m for m in index if m["sb_id"] == sb_match_id), None)

    if meta:
        home = meta["home_team"]
        away = meta["away_team"]
        home_score = meta["home_score"]
        away_score = meta["away_score"]
        start_time = parse_datetime(meta["match_date"]) if meta.get("match_date") else None
    else:
        # Slow path: scan competitions to find this specific match.
        try:
            comps_cache = _cache_dir() / "competitions.json"
            competitions = _fetch_json(f"{BASE_RAW}/competitions.json", comps_cache)
        except Exception:
            competitions = []
        home = away = ""
        home_score = away_score = 0
        start_time = None
        for comp in competitions:
            comp_id = comp.get("competition_id")
            season_id = comp.get("season_id")
            if not (isinstance(comp_id, int) and isinstance(season_id, int)):
                continue
            try:
                matches = get_matches(comp_id, season_id)
            except Exception:
                continue
            for m in matches:
                if m.get("match_id") == sb_match_id:
                    home = (m.get("home_team") or {}).get("home_team_name") or "Home"
                    away = (m.get("away_team") or {}).get("away_team_name") or "Away"
                    home_score = m.get("home_score", 0) or 0
                    away_score = m.get("away_score", 0) or 0
                    start_time = parse_datetime(m.get("match_date") or "") if m.get("match_date") else None
                    break
            if home:
                break

    obj, _ = Match.objects.update_or_create(
        match_id=match_id_str,
        defaults={
            "home_team": home or "Home",
            "away_team": away or "Away",
            "home_score": home_score,
            "away_score": away_score,
            "status": "completed",
            "start_time": start_time or timezone.now(),
        },
    )
    return obj
