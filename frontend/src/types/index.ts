export interface Match {
  match_id: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  status: "live" | "completed" | "scheduled";
  start_time: string;
  end_time?: string;
}

export interface MatchSearchSuggestion {
  match_id: string;
  home_team: string;
  away_team: string;
  status: "live" | "completed" | "scheduled" | string;
  start_time: string;
  source: "database" | "provider" | string;
}

export interface MatchEvent {
  match_id: string;
  timestamp: number;
  event_type: string;
  team: string;
  player?: string;
  possession_stat: number;
  x_coord?: number;
  y_coord?: number;
}

export interface TacticalAnalysisResponse {
  analysis: string;
  error?: string;
}

export interface FeedStatusResponse {
  mode: "demo" | "external";
  source: string;
  is_demo: boolean;
  configured: boolean;
}

export interface MatchStatsResponse {
  score_home: number;
  score_away: number;
  home_shots: number | null;
  away_shots: number | null;
  home_fouls: number | null;
  away_fouls: number | null;
  home_possession: number | null;
  away_possession: number | null;
  is_official_stats: boolean;
  stats_available: boolean;
}
