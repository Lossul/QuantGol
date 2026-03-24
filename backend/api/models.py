from django.db import models
from django.utils import timezone

class Match(models.Model):
    STATUS_CHOICES = [
        ('live', 'Live'),
        ('completed', 'Completed'),
        ('scheduled', 'Scheduled'),
    ]
    
    match_id = models.CharField(max_length=100, unique=True, primary_key=True)
    home_team = models.CharField(max_length=100)
    away_team = models.CharField(max_length=100)
    home_score = models.PositiveIntegerField(default=0)
    away_score = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='live')
    start_time = models.DateTimeField(default=timezone.now)
    end_time = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-start_time']
    
    def __str__(self):
        return f"{self.home_team} vs {self.away_team} ({self.status})"

class MatchEvent(models.Model):
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name='events', null=True, blank=True)
    timestamp = models.IntegerField(help_text="Minute of the game")
    event_type = models.CharField(max_length=50)
    team = models.CharField(max_length=100)
    player = models.CharField(max_length=100, null=True, blank=True)
    possession_stat = models.FloatField(default=50.0)
    x_coord = models.FloatField(null=True, blank=True)
    y_coord = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    
    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"[{self.timestamp}'] {self.team} - {self.event_type}"