import json
import time
from django.db.models import Q
from django.http import StreamingHttpResponse
from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import Match, MatchEvent
from .serializers import MatchSerializer, MatchEventSerializer
from services.ai_analyst import TacticalAnalyst
from services.data_ingestion import generate_mock_event
from services.feed_provider import get_feed_status, get_or_create_match, search_external_matches
from services.match_stats_provider import fetch_external_match_stats

def event_stream(request, match_id):
    def generate_events():
        # Ensure the match object exists
        match = get_or_create_match(match_id)

        # Resume from latest persisted minute or SSE Last-Event-ID header.
        latest_event = MatchEvent.objects.filter(match=match).order_by("-timestamp").first()
        persisted_next_minute = (latest_event.timestamp + 1) if latest_event else 1
        header_last_event_id = request.headers.get("Last-Event-ID")
        try:
            header_next_minute = int(header_last_event_id) + 1 if header_last_event_id else 1
        except ValueError:
            header_next_minute = 1

        minute = max(1, persisted_next_minute, header_next_minute)
        while True:
            # Generate a new event for the stream
            latest_event = generate_mock_event(match_id, minute)
            event_payload = {k: v for k, v in latest_event.items() if k != "match_id"}

            # Persist streaming data so it is queryable in admin and API tables.
            MatchEvent.objects.create(match=match, **event_payload)
            if event_payload.get("event_type") == "Goal":
                if event_payload.get("team") == match.home_team:
                    match.home_score += 1
                elif event_payload.get("team") == match.away_team:
                    match.away_score += 1
                match.save(update_fields=["home_score", "away_score", "updated_at"])
            
            # SSE format requires "data: {json}\n\n"
            yield f"id: {minute}\ndata: {json.dumps(latest_event)}\n\n"
            
            minute += 1
            if minute > 95:
                if match.status != "completed":
                    match.status = "completed"
                    match.save(update_fields=["status", "updated_at"])
                break
                
            time.sleep(3) # Push updates every 3 seconds for demo purposes

    return StreamingHttpResponse(generate_events(), content_type='text/event-stream')


class MatchListView(generics.ListAPIView):
    serializer_class = MatchSerializer
    queryset = Match.objects.all().order_by('-start_time')
    
    def get_queryset(self):
        status_filter = self.request.query_params.get('status')
        queryset = Match.objects.all().order_by('-start_time')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset


class TrendingMatchesView(APIView):
    """Return top 5 'trending' matches: live first, then nearest upcoming, then recent."""

    def get(self, request):
        from django.utils import timezone

        now = timezone.now()
        trending = []

        # 1) Live matches (highest priority)
        live = list(Match.objects.filter(status="live").order_by("-start_time")[:5])
        trending.extend(live)

        # 2) Upcoming scheduled (next to kick off)
        if len(trending) < 5:
            upcoming = list(
                Match.objects.filter(status="scheduled", start_time__gte=now)
                .order_by("start_time")[: 5 - len(trending)]
            )
            trending.extend(upcoming)

        # 3) Recently completed
        if len(trending) < 5:
            completed = list(
                Match.objects.filter(status="completed")
                .order_by("-start_time")[: 5 - len(trending)]
            )
            trending.extend(completed)

        from .serializers import MatchSerializer

        serializer = MatchSerializer(trending, many=True)
        return Response({"matches": serializer.data}, status=status.HTTP_200_OK)



class MatchEventListView(generics.ListAPIView):
    serializer_class = MatchEventSerializer

    def get_queryset(self):
        match_id = self.request.query_params.get('match_id')
        limit = int(self.request.query_params.get('limit', 100))
        limit = max(1, min(limit, 500))

        queryset = MatchEvent.objects.all().order_by('-timestamp')
        if match_id:
            queryset = queryset.filter(match__match_id=match_id)

        # Return oldest -> newest so charts and "recent events" are derived correctly.
        recent_slice = list(queryset[:limit])
        recent_slice.reverse()
        return recent_slice


class FeedStatusView(APIView):
    def get(self, request):
        return Response(get_feed_status().to_dict(), status=status.HTTP_200_OK)


class AIStatusView(APIView):
    def get(self, request):
        analyst = TacticalAnalyst()
        return Response({"is_ready": analyst.is_ready}, status=status.HTTP_200_OK)


class MatchSearchView(APIView):
    def get(self, request):
        query = request.query_params.get("query", "").strip()
        match_date = request.query_params.get("date", "").strip() or None

        if len(query) < 2:
            return Response({"matches": []}, status=status.HTTP_200_OK)

        # 1) Local DB search first
        db_matches = Match.objects.filter(
            Q(match_id__icontains=query)
            | Q(home_team__icontains=query)
            | Q(away_team__icontains=query)
        ).order_by("-start_time")[:20]

        results = [
            {
                "match_id": m.match_id,
                "home_team": m.home_team,
                "away_team": m.away_team,
                "status": m.status,
                "start_time": m.start_time.isoformat() if m.start_time else "",
                "source": "database",
            }
            for m in db_matches
        ]

        # 2) Enrich from football-data.org API (searches historical matches)
        provider_matches = search_external_matches(query=query, match_date=match_date)
        existing_ids = {item["match_id"] for item in results}
        for match in provider_matches:
            if match["match_id"] not in existing_ids:
                results.append(match)
                existing_ids.add(match["match_id"])

        return Response({"matches": results[:20]}, status=status.HTTP_200_OK)


class MatchStatsView(APIView):
    def get(self, request, match_id):
        try:
            match = Match.objects.get(match_id=match_id)
        except Match.DoesNotExist:
            return Response({"error": "Match not found."}, status=status.HTTP_404_NOT_FOUND)

        external_stats = fetch_external_match_stats(match_id)
        if external_stats:
            return Response(
                {
                    **external_stats,
                    "score_home": match.home_score,
                    "score_away": match.away_score,
                    "is_official_stats": True,
                    "stats_available": True,
                },
                status=status.HTTP_200_OK,
            )

        # For football-data completed fixtures, avoid showing synthetic box stats
        # as if they were official.
        if match.match_id.startswith("FD-") and match.status == "completed":
            return Response(
                {
                    "score_home": match.home_score,
                    "score_away": match.away_score,
                    "home_shots": None,
                    "away_shots": None,
                    "home_fouls": None,
                    "away_fouls": None,
                    "home_possession": None,
                    "away_possession": None,
                    "is_official_stats": False,
                    "stats_available": False,
                },
                status=status.HTTP_200_OK,
            )

        events = MatchEvent.objects.filter(match=match)
        home_shots = events.filter(team=match.home_team, event_type__in=["Shot", "Goal"]).count()
        away_shots = events.filter(team=match.away_team, event_type__in=["Shot", "Goal"]).count()
        home_fouls = events.filter(team=match.home_team, event_type="Foul").count()
        away_fouls = events.filter(team=match.away_team, event_type="Foul").count()

        possession_values = list(events.values_list("possession_stat", flat=True))
        home_possession = (
            round(sum(possession_values) / len(possession_values), 1) if possession_values else 50.0
        )
        away_possession = round(max(0.0, 100.0 - home_possession), 1)

        return Response(
            {
                "score_home": match.home_score,
                "score_away": match.away_score,
                "home_shots": home_shots,
                "away_shots": away_shots,
                "home_fouls": home_fouls,
                "away_fouls": away_fouls,
                "home_possession": home_possession,
                "away_possession": away_possession,
                "is_official_stats": False,
                "stats_available": True,
            },
            status=status.HTTP_200_OK,
        )

class AnalyzeTacticsView(APIView):
    def post(self, request):
        try:
            recent_events = request.data.get('recentEvents', [])
            query = request.data.get('query', None)
            
            if not recent_events and not query:
                return Response(
                    {"error": "No data provided for analysis."}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            analyst = TacticalAnalyst()
            analysis = analyst.generate_insight(recent_events, query=query)
            
            return Response({"analysis": analysis, "insight": analysis}, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
class MatchDetailView(generics.RetrieveAPIView):
    serializer_class = MatchSerializer
    queryset = Match.objects.all()
    lookup_field = 'match_id'

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if (
            instance.match_id.startswith("FD-")
            and instance.status == "completed"
            and instance.home_score == 0
            and instance.away_score == 0
        ):
            try:
                from services.football_data_client import fetch_match_by_id

                fresh = fetch_match_by_id(instance.match_id)
                if fresh:
                    home_score = int(fresh.get("home_score", 0) or 0)
                    away_score = int(fresh.get("away_score", 0) or 0)
                    if home_score != instance.home_score or away_score != instance.away_score:
                        instance.home_score = home_score
                        instance.away_score = away_score
                        instance.save(update_fields=["home_score", "away_score", "updated_at"])
            except Exception:
                pass

        serializer = self.get_serializer(instance)
        return Response(serializer.data)
