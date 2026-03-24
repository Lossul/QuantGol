from services.feed_provider import get_live_event


def generate_mock_event(match_id, current_minute):
    # Backward-compatible function name used by existing views.
    return get_live_event(match_id, current_minute)


def generate_completed_timeline(
    match,
    sync_score_from_generated: bool = True,
    allow_goal_events: bool = True,
):
    """Generate and persist a full 90-minute timeline for completed matches."""
    from api.models import MatchEvent

    if MatchEvent.objects.filter(match=match).exists():
        return

    generated_events = []
    home_score = 0
    away_score = 0
    for minute in range(1, 91):
        event = generate_mock_event(match.match_id, minute)
        payload = {k: v for k, v in event.items() if k != "match_id"}
        if not allow_goal_events and payload.get("event_type") == "Goal":
            payload["event_type"] = "Shot"
        generated_events.append(MatchEvent(match=match, **payload))
        if payload.get("event_type") == "Goal":
            if payload.get("team") == match.home_team:
                home_score += 1
            elif payload.get("team") == match.away_team:
                away_score += 1

    MatchEvent.objects.bulk_create(generated_events, batch_size=90)
    if sync_score_from_generated:
        match.home_score = home_score
        match.away_score = away_score
        match.save(update_fields=["home_score", "away_score", "updated_at"])