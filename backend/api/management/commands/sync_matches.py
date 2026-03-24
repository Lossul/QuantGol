"""Management command to sync real match fixtures from football-data.org.

Usage:
    python manage.py sync_matches
    python manage.py sync_matches --competition PL --days 7
    python manage.py sync_matches --competition PL PD BL1 --days 14
"""

from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from api.models import Match
from services.data_ingestion import generate_completed_timeline
from services.football_data_client import (
    FREE_TIER_COMPETITIONS,
    fetch_matches,
    is_configured,
)


class Command(BaseCommand):
    help = "Sync match fixtures from football-data.org into the local database"

    def add_arguments(self, parser):
        parser.add_argument(
            "--competition",
            nargs="+",
            default=["PL", "PD", "BL1", "SA", "CL"],
            help="Competition codes to sync (default: PL PD BL1 SA CL)",
        )
        parser.add_argument(
            "--days",
            type=int,
            default=7,
            help="Number of days forward and backward to fetch (default: 7)",
        )

    def handle(self, *args, **options):
        if not is_configured():
            self.stderr.write(
                self.style.WARNING(
                    "FOOTBALL_DATA_API_KEY is not set. "
                    "Get a free key at https://www.football-data.org/client/register "
                    "and add it to your .env file."
                )
            )
            return

        competitions = options["competition"]
        days = options["days"]
        today = date.today()
        date_from = (today - timedelta(days=days)).isoformat()
        date_to = (today + timedelta(days=days)).isoformat()

        created_count = 0
        updated_count = 0
        skipped_count = 0

        for comp in competitions:
            if comp not in FREE_TIER_COMPETITIONS:
                self.stderr.write(
                    self.style.WARNING(f"Skipping {comp} — not available on the free tier.")
                )
                continue

            self.stdout.write(f"Fetching {comp} matches ({date_from} → {date_to})…")
            matches = fetch_matches(comp, date_from=date_from, date_to=date_to)

            if not matches:
                self.stdout.write(self.style.NOTICE(f"  No matches found for {comp}."))
                continue

            for match_data in matches:
                match_id = match_data["match_id"]
                home_team = match_data["home_team"]
                away_team = match_data["away_team"]
                status = match_data["status"]
                start_time_str = match_data.get("start_time", "")

                start_time = None
                if start_time_str:
                    start_time = parse_datetime(start_time_str)

                if not start_time:
                    start_time = timezone.now()

                # Skip matches where teams are TBD (e.g. unresolved tournament brackets)
                if home_team == "TBD" or away_team == "TBD":
                    skipped_count += 1
                    continue

                match_obj, created = Match.objects.update_or_create(
                    match_id=match_id,
                    defaults={
                        "home_team": home_team,
                        "away_team": away_team,
                        "home_score": int(match_data.get("home_score", 0) or 0),
                        "away_score": int(match_data.get("away_score", 0) or 0),
                        "status": status,
                        "start_time": start_time,
                    },
                )

                if status == "completed":
                    generate_completed_timeline(
                        match_obj,
                        sync_score_from_generated=False,
                        allow_goal_events=False,
                    )

                if created:
                    created_count += 1
                else:
                    updated_count += 1

            self.stdout.write(
                self.style.SUCCESS(f"  {comp}: {len(matches)} matches processed.")
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone — {created_count} created, {updated_count} updated, {skipped_count} skipped."
            )
        )
