from rest_framework import serializers

from .models import Match, MatchEvent


class MatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Match
        fields = [
            "match_id",
            "home_team",
            "away_team",
            "home_score",
            "away_score",
            "status",
            "start_time",
            "end_time",
        ]


class MatchEventSerializer(serializers.ModelSerializer):
    match_id = serializers.CharField(source="match.match_id", read_only=True)

    class Meta:
        model = MatchEvent
        fields = [
            "id",
            "match_id",
            "timestamp",
            "event_type",
            "team",
            "player",
            "possession_stat",
            "x_coord",
            "y_coord",
        ]
