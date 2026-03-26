from django.urls import path
from . import views

urlpatterns = [
    path('matches/', views.MatchListView.as_view(), name='match_list'),
    path('matches/trending/', views.TrendingMatchesView.as_view(), name='match_trending'),
    path('matches/search/', views.MatchSearchView.as_view(), name='match_search'),
    path('matches/<str:match_id>/stats/', views.MatchStatsView.as_view(), name='match_stats'),
    path('matches/<str:match_id>/deep-analytics/', views.DeepAnalyticsView.as_view(), name='deep_analytics'),
    path('matches/<str:match_id>/players/', views.PlayerStatsView.as_view(), name='player_stats'),
    path('matches/<str:match_id>/', views.MatchDetailView.as_view(), name='match_detail'),
    path('stream/<str:match_id>/', views.event_stream, name='event_stream'),
    path('events/', views.MatchEventListView.as_view(), name='match_events'),
    path('feed-status/', views.FeedStatusView.as_view(), name='feed_status'),
    path('ai-status/', views.AIStatusView.as_view(), name='ai_status'),
    path('analyze/', views.AnalyzeTacticsView.as_view(), name='analyze_tactics'),
    path('analyze-tactics/', views.AnalyzeTacticsView.as_view(), name='analyze_tactics_chat'),
]
