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

export interface PlayerStat {
  player: string;
  team: string;
  shots: number;
  goals: number;
  xg: number;
  passes: number;
  pressures: number;
}

export interface PlayerStatsResponse {
  players: PlayerStat[];
}

export interface DeepAnalyticsResponse {
  home_team: string;
  away_team: string;
  shots: Array<{
    minute: number;
    team: string;
    player?: string;
    x: number | null;
    y: number | null;
    xg: number;
    outcome: string;
    is_goal: boolean;
  }>;
  xg_timeline: Array<{
    minute: number;
    home_xg: number;
    away_xg: number;
  }>;
  pass_network: {
    nodes: Array<{ player: string; team: string; touches: number }>;
    edges: Array<{ from: string; to: string; count: number }>;
  };
  pressures: {
    by_team: Record<string, number>;
    top_players: Array<{ player: string; count: number }>;
  };
  source: string;
}
