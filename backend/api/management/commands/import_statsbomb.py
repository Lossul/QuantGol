from datetime import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from api.models import Match
from services.statsbomb_open_data import get_matches


class Command(BaseCommand):
    help = "Import StatsBomb Open Data matches into the local DB (as SB-<id>)"

    def add_arguments(self, parser):
        parser.add_argument("--competition-id", type=int, required=True)
        parser.add_argument("--season-id", type=int, required=True)
        parser.add_argument("--limit", type=int, default=50)

    def handle(self, *args, **options):
        competition_id = options["competition_id"]
        season_id = options["season_id"]
        limit = max(1, min(int(options["limit"]), 200))

        matches = get_matches(competition_id=competition_id, season_id=season_id)
        if not matches:
            self.stderr.write(self.style.ERROR("No matches returned (check ids or connectivity)."))
            return

        created = 0
        updated = 0
        for item in matches[:limit]:
            sb_match_id = item.get("match_id")
            if not isinstance(sb_match_id, int):
                continue

            home = (item.get("home_team") or {}).get("home_team_name") or "Home"
            away = (item.get("away_team") or {}).get("away_team_name") or "Away"
            home_score = item.get("home_score") if isinstance(item.get("home_score"), int) else 0
            away_score = item.get("away_score") if isinstance(item.get("away_score"), int) else 0

            kick_off = item.get("kick_off")
            start_time = parse_datetime(kick_off) if isinstance(kick_off, str) else None
            if not start_time:
                start_time = timezone.now()

            match_id = f"SB-{sb_match_id}"
            obj, was_created = Match.objects.update_or_create(
                match_id=match_id,
                defaults={
                    "home_team": home,
                    "away_team": away,
                    "home_score": home_score,
                    "away_score": away_score,
                    "status": "completed",
                    "start_time": start_time,
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(self.style.SUCCESS(f"Imported StatsBomb: {created} created, {updated} updated."))

