from django.contrib import admin

from .models import Match, MatchEvent


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = (
        "match_id",
        "home_team",
        "away_team",
        "status",
        "start_time",
        "end_time",
    )
    list_filter = ("status", "start_time")
    search_fields = ("match_id", "home_team", "away_team")
    ordering = ("-start_time",)


@admin.register(MatchEvent)
class MatchEventAdmin(admin.ModelAdmin):
    list_display = (
        "match_id",
        "timestamp",
        "event_type",
        "team",
        "player",
        "possession_stat",
    )
    list_filter = ("match_id", "team", "event_type")
    search_fields = ("match_id", "team", "player", "event_type")
    ordering = ("-timestamp",)
