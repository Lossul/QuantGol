import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from api.models import Match, MatchEvent
from services.data_ingestion import generate_completed_timeline
from services.football_data_client import fetch_matches, is_configured


# Fallback data when no API key is configured
FALLBACK_TEAMS = [
    ("Real Madrid", "FC Barcelona"),
    ("Manchester United", "Liverpool"),
    ("Bayern Munich", "Borussia Dortmund"),
    ("PSG", "AS Monaco"),
    ("Inter Milan", "AC Milan"),
]


class Command(BaseCommand):
    help = "Seed database with matches — uses football-data.org API if configured, otherwise hardcoded fallback data"

    def handle(self, *args, **options):
        if is_configured():
            self._seed_from_api()
        else:
            self.stdout.write(
                self.style.NOTICE(
                    "FOOTBALL_DATA_API_KEY not set — using hardcoded fallback data. "
                    "Run `python manage.py sync_matches` after setting the key for real fixtures."
                )
            )
            self._seed_fallback()

    def _seed_from_api(self):
        """Seed using real fixtures from football-data.org."""
        self.stdout.write("Fetching real fixtures from football-data.org…")
        matches = fetch_matches("PL")  # Default: Premier League recent + upcoming

        if not matches:
            self.stdout.write(self.style.WARNING("No matches returned — falling back to hardcoded data."))
            self._seed_fallback()
            return

        created = 0
        for match_data in matches[:10]:  # Seed up to 10 matches
            match_id = match_data["match_id"]
            if Match.objects.filter(match_id=match_id).exists():
                continue

            start_time = None
            if match_data.get("start_time"):
                start_time = parse_datetime(match_data["start_time"])
            if not start_time:
                start_time = timezone.now()

            match = Match.objects.create(
                match_id=match_id,
                home_team=match_data["home_team"],
                away_team=match_data["away_team"],
                home_score=int(match_data.get("home_score", 0) or 0),
                away_score=int(match_data.get("away_score", 0) or 0),
                status=match_data["status"],
                start_time=start_time,
            )

            # Generate some synthetic events for completed matches
            if match_data["status"] == "completed":
                generate_completed_timeline(
                    match,
                    sync_score_from_generated=False,
                    allow_goal_events=False,
                )

            created += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f"  Created: {match_data['home_team']} vs {match_data['away_team']} ({match_data['status']})"
                )
            )

        self.stdout.write(self.style.SUCCESS(f"Seeded {created} matches from football-data.org."))

    def _seed_fallback(self):
        """Original hardcoded seed logic."""
        now = timezone.now()

        # Completed matches
        for i, (home, away) in enumerate(FALLBACK_TEAMS[:2]):
            match_id = f"COMPLETED-{i + 1}"
            if Match.objects.filter(match_id=match_id).exists():
                continue

            start_time = now - timedelta(days=5 - i, hours=2)
            match = Match.objects.create(
                match_id=match_id,
                home_team=home,
                away_team=away,
                home_score=0,
                away_score=0,
                status="completed",
                start_time=start_time,
                end_time=start_time + timedelta(minutes=95),
            )
            generate_completed_timeline(match)
            self.stdout.write(self.style.SUCCESS(f"Created completed match: {home} vs {away}"))

        # Live / scheduled matches
        for i, (home, away) in enumerate(FALLBACK_TEAMS[2:5]):
            match_id = f"LIVE-MATCH-{i + 1}"
            if Match.objects.filter(match_id=match_id).exists():
                continue

            start_time = now + timedelta(hours=1 + i)
            status = "live" if i == 0 else "scheduled"
            match = Match.objects.create(
                match_id=match_id,
                home_team=home,
                away_team=away,
                home_score=0,
                away_score=0,
                status=status,
                start_time=start_time,
            )

            if i == 0:
                for j in range(random.randint(5, 15)):
                    minute = random.randint(1, 20)
                    team = random.choice([home, away])
                    event_type = random.choice(["Pass", "Shot", "Goal", "Foul", "Tackle", "Interception"])
                    possession = 55.0 if team == home else 45.0
                    MatchEvent.objects.create(
                        match=match,
                        timestamp=minute,
                        event_type=event_type,
                        team=team,
                        possession_stat=round(possession + random.uniform(-5, 5), 1),
                    )
                    if event_type == "Goal":
                        if team == home:
                            match.home_score += 1
                        else:
                            match.away_score += 1
                if match.home_score or match.away_score:
                    match.save(update_fields=["home_score", "away_score", "updated_at"])

            self.stdout.write(self.style.SUCCESS(f"Created {status} match: {home} vs {away}"))

        self.stdout.write(self.style.SUCCESS("Successfully seeded database with matches"))

