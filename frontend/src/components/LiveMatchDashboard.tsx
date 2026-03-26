"use client";
import { InteractiveAnalyst } from "./InteractiveAnalyst";

import React, { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import FootballPitch, { PitchShot } from "./FootballPitch";
import StatComparisonBars from "./StatComparisonBars";
import {
  Bell,
  BrainCircuit,
  Clock3,
  Flame,
  Goal,
  Search,
} from "lucide-react";
import { useMatchStream } from "../hooks/useMatchStream";
import type {
  FeedStatusResponse,
  Match,
  MatchEvent,
  MatchStatsResponse,
  DeepAnalyticsResponse,
  PlayerStatsResponse,
  TacticalAnalysisResponse,
} from "../types";

export default function LiveMatchDashboard({ matchId }: { matchId: string }) {
  const { events, isConnected, connectionMessage } = useMatchStream(matchId);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "goals" | "shots" | "fouls" | "passes" | "defensive"
  >("all");
  const [feedStatus, setFeedStatus] = useState<FeedStatusResponse | null>(null);
  const [matchDetails, setMatchDetails] = useState<Match | null>(null);
  const [insight, setInsight] = useState<string>(
    "Click 'Analyze Current Play' to generate tactical insights.",
  );
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [boxStats, setBoxStats] = useState<MatchStatsResponse | null>(null);
  const [deepAnalytics, setDeepAnalytics] = useState<DeepAnalyticsResponse | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerStatsResponse | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  useEffect(() => {
    const loadMatchDetails = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/matches/${matchId}/`);
        if (response.ok) {
          const match = await response.json();
          setMatchDetails(match);
        }
      } catch (e) {
        console.error("Failed to load match info", e);
      }
    };
    if (matchId) {
      loadMatchDetails();
    }
  }, [matchId, apiBaseUrl]);

  useEffect(() => {
    if (!matchId || events.length === 0) return;
    if (events[events.length - 1]?.event_type !== "Goal") return;

    const refreshScore = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/matches/${matchId}/`);
        if (!response.ok) return;
        const match = await response.json();
        setMatchDetails(match);
      } catch {
        // keep previous score state
      }
    };
    void refreshScore();
  }, [events, matchId, apiBaseUrl]);

  useEffect(() => {
    const loadFeedStatus = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/feed-status/`);
        if (!response.ok) return;
        const payload = (await response.json()) as FeedStatusResponse;
        setFeedStatus(payload);
      } catch {
        // fallback to unknown status
      }
    };
    void loadFeedStatus();
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!matchId) return;
    const loadBoxStats = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/matches/${matchId}/stats/`);
        if (!response.ok) return;
        const payload = (await response.json()) as MatchStatsResponse;
        setBoxStats(payload);
      } catch {
        // keep fallback stats
      }
    };
    void loadBoxStats();
  }, [apiBaseUrl, events, matchId]);

  useEffect(() => {
    if (!matchId.startsWith("SB-")) {
      setDeepAnalytics(null);
      return;
    }
    const loadDeepAnalytics = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/matches/${matchId}/deep-analytics/`);
        if (!response.ok) return;
        const payload = (await response.json()) as DeepAnalyticsResponse;
        setDeepAnalytics(payload);
      } catch {
        // ignore
      }
    };
    void loadDeepAnalytics();
  }, [apiBaseUrl, matchId]);

  useEffect(() => {
    if (!matchId) return;
    const loadPlayerStats = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/matches/${matchId}/players/`);
        if (!response.ok) return;
        const payload = (await response.json()) as PlayerStatsResponse;
        setPlayerStats(payload);
      } catch {
        // ignore
      }
    };
    void loadPlayerStats();
  }, [apiBaseUrl, matchId, events]);

  const isDemoFeed = feedStatus?.is_demo ?? true;

  const scopedEvents = events.filter((event) => event.match_id === matchId);
  const fallbackTeams = Array.from(new Set(scopedEvents.map((event) => event.team)));
  const homeTeamName = (matchDetails?.home_team ?? fallbackTeams[0] ?? "Home").trim();
  const awayTeamName = (matchDetails?.away_team ?? fallbackTeams[1] ?? "Away").trim();

  const hasAuthoritativeTeams = Boolean(matchDetails?.home_team && matchDetails?.away_team);
  const validScopedEvents = hasAuthoritativeTeams
    ? scopedEvents.filter(
        (event) => event.team === homeTeamName || event.team === awayTeamName,
      )
    : scopedEvents;
  const droppedEventCount = Math.max(0, scopedEvents.length - validScopedEvents.length);

  const filteredEvents = validScopedEvents.filter((event) => {
    const query = searchQuery.trim().toLowerCase();
    const queryMatch =
      query.length === 0 ||
      event.team.toLowerCase().includes(query) ||
      event.event_type.toLowerCase().includes(query) ||
      event.match_id.toLowerCase().includes(query) ||
      (event.player?.toLowerCase().includes(query) ?? false);

    if (!queryMatch) return false;
    if (activeFilter === "all") return true;
    if (activeFilter === "goals") return event.event_type === "Goal";
    if (activeFilter === "shots") return event.event_type === "Shot" || event.event_type === "Goal";
    if (activeFilter === "passes") return event.event_type === "Pass";
    if (activeFilter === "fouls") return event.event_type === "Foul";
    return event.event_type === "Tackle" || event.event_type === "Interception";
  });

  const timelineData = filteredEvents.map((event) => ({
    minute: Math.min(event.timestamp, 95),
    momentum: event.possession_stat,
  }));

  const areaPulseData = timelineData.map((point, index) => ({
    step: index + 1,
    value: Math.max(15, Math.min(100, point.momentum - 22)),
  }));

  const latestMomentum =
    timelineData.length > 0 ? timelineData[timelineData.length - 1].momentum : 0;

  const averageMomentum =
    timelineData.length > 0
      ? Math.round(
          timelineData.reduce((sum, point) => sum + point.momentum, 0) /
            timelineData.length,
        )
      : 0;

  const getEventAccent = (eventType: string) => {
    if (eventType === "Goal")
      return "border-amber-300/45 bg-amber-500/10 text-amber-200";
    if (eventType === "Shot")
      return "border-emerald-400/40 bg-emerald-500/10 text-emerald-300";
    if (eventType === "Foul")
      return "border-rose-400/40 bg-rose-500/10 text-rose-300";
    return "border-cyan-300/30 bg-cyan-500/10 text-cyan-200";
  };

  const toProgressWidthClass = (percent: number) => {
    const value = Math.max(0, Math.min(100, percent));
    if (value >= 96) return "w-full";
    if (value >= 88) return "w-11/12";
    if (value >= 80) return "w-10/12";
    if (value >= 72) return "w-9/12";
    if (value >= 64) return "w-8/12";
    if (value >= 56) return "w-7/12";
    if (value >= 48) return "w-6/12";
    if (value >= 40) return "w-5/12";
    if (value >= 32) return "w-4/12";
    if (value >= 24) return "w-3/12";
    if (value >= 16) return "w-2/12";
    if (value >= 8) return "w-1/12";
    return "w-[4px]";
  };

  const estimateXg = (event: MatchEvent, homeTeam: string) => {
    const x = event.x_coord;
    const y = event.y_coord;
    if (typeof x !== "number" || typeof y !== "number") return 0.06;

    const isHomeShot = event.team === homeTeam;
    const xAttacking = isHomeShot ? x : 100 - x;
    const dx = Math.max(0, 100 - xAttacking);
    const dy = Math.abs(50 - y);
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angleBonus = Math.max(0, 1 - dy / 50);

    const base = Math.max(0.02, 0.65 * Math.exp(-distance / 18));
    const adjusted = Math.min(0.85, base * (0.65 + 0.35 * angleBonus));
    return event.event_type === "Goal" ? Math.max(adjusted, 0.25) : adjusted;
  };

  const shotEvents = validScopedEvents.filter((e) => e.event_type === "Shot" || e.event_type === "Goal");

  // Build unified shot array for FootballPitch — prefer StatsBomb real xG when available
  const pitchShots: PitchShot[] = deepAnalytics
    ? deepAnalytics.shots.map((s) => ({
        x: s.x,
        y: s.y,
        team: s.team,
        event_type: s.is_goal ? "Goal" : "Shot",
        player: s.player,
        xg: s.xg,
      }))
    : shotEvents.map((s) => ({
        x: s.x_coord ?? null,
        y: s.y_coord ?? null,
        team: s.team,
        event_type: s.event_type,
        player: s.player,
        xg: estimateXg(s, homeTeamName),
      }));

  // xG totals per team (used later in comparisonStats after possession vars are declared)
  const homeXg = pitchShots
    .filter((s) => s.team === homeTeamName)
    .reduce((sum, s) => sum + (s.xg ?? 0), 0);
  const awayXg = pitchShots
    .filter((s) => s.team === awayTeamName)
    .reduce((sum, s) => sum + (s.xg ?? 0), 0);
  const xgTimelineData = shotEvents
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .reduce<{ minute: number; home_xg: number; away_xg: number }[]>((acc, e) => {
      const last = acc[acc.length - 1] ?? { minute: 0, home_xg: 0, away_xg: 0 };
      const xg = estimateXg(e, homeTeamName);
      const next = { ...last, minute: Math.min(95, e.timestamp) };
      if (e.team === homeTeamName) next.home_xg = Number((next.home_xg + xg).toFixed(2));
      else next.away_xg = Number((next.away_xg + xg).toFixed(2));
      acc.push(next);
      return acc;
    }, []);

  const fetchAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/analyze/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recentEvents: filteredEvents }),
      });
      const data: TacticalAnalysisResponse =
        (await res.json()) as TacticalAnalysisResponse;
      setInsight(data.analysis || data.error || "No analysis returned.");
    } catch {
      setInsight("Failed to connect to AI engine.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const dynamicTitle = `${homeTeamName} vs ${awayTeamName}`;

  const shotsByHome = validScopedEvents.filter(
    (event) => (event.event_type === "Shot" || event.event_type === "Goal") && event.team === homeTeamName,
  ).length;
  const shotsByAway = validScopedEvents.filter(
    (event) => (event.event_type === "Shot" || event.event_type === "Goal") && event.team === awayTeamName,
  ).length;
  const foulsByHome = validScopedEvents.filter(
    (event) => event.event_type === "Foul" && event.team === homeTeamName,
  ).length;
  const foulsByAway = validScopedEvents.filter(
    (event) => event.event_type === "Foul" && event.team === awayTeamName,
  ).length;
  const averageHomePossession =
    validScopedEvents.length > 0
      ? Math.round(validScopedEvents.reduce((sum, event) => sum + event.possession_stat, 0) / validScopedEvents.length)
      : 50;
  const averageAwayPossession = Math.max(0, 100 - averageHomePossession);

  const comparisonStats = [
    {
      label: "Possession",
      home: boxStats?.home_possession ?? averageHomePossession,
      away: boxStats?.away_possession ?? averageAwayPossession,
      format: (v: number) => `${v}%`,
    },
    {
      label: "Shots",
      home: boxStats?.home_shots ?? shotsByHome,
      away: boxStats?.away_shots ?? shotsByAway,
    },
    {
      label: "xG",
      home: Number(homeXg.toFixed(2)),
      away: Number(awayXg.toFixed(2)),
      format: (v: number) => v.toFixed(2),
    },
    {
      label: "Fouls",
      home: boxStats?.home_fouls ?? foulsByHome,
      away: boxStats?.away_fouls ?? foulsByAway,
    },
  ];

  const goalMinutes = validScopedEvents
    .filter((e) => e.event_type === "Goal")
    .map((e) => ({ minute: Math.min(95, e.timestamp), team: e.team }));

  const filterButtons: {
    label: string;
    filter: typeof activeFilter;
    count: number;
  }[] = [
    { label: "All", filter: "all", count: validScopedEvents.length },
    { label: "Goals", filter: "goals", count: validScopedEvents.filter((e) => e.event_type === "Goal").length },
    { label: "Shots", filter: "shots", count: validScopedEvents.filter((e) => e.event_type === "Shot" || e.event_type === "Goal").length },
    { label: "Fouls", filter: "fouls", count: validScopedEvents.filter((e) => e.event_type === "Foul").length },
    { label: "Passes", filter: "passes", count: validScopedEvents.filter((e) => e.event_type === "Pass").length },
    {
      label: "Defensive",
      filter: "defensive",
      count: validScopedEvents.filter((e) => e.event_type === "Tackle" || e.event_type === "Interception").length,
    },
  ];

  const isScheduled = matchDetails?.status === "scheduled";
  
  if (isScheduled) {
    const kickOff = matchDetails.start_time ? new Date(matchDetails.start_time) : null;
    return (
      <section className="relative mt-2 overflow-visible rounded-2xl border border-cyan-400/15 bg-[#050d21]/95 p-4 shadow-[0_30px_100px_rgba(2,22,56,0.8)] md:p-6">
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Left: match info */}
          <div className="space-y-5">
            {/* Header — mirrors the live/completed header */}
            <header className="rounded-2xl border border-cyan-300/10 bg-gradient-to-br from-[#071330] to-[#040b1f] p-5 md:p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-cyan-300/60">Upcoming Match</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-cyan-50 md:text-3xl">
                {matchDetails.home_team} vs {matchDetails.away_team}
              </h2>
              {kickOff && (
                <p className="mt-1 font-mono text-base text-cyan-100/70">
                  {kickOff.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  {" · "}
                  {kickOff.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              <p className="mt-1 text-sm text-cyan-100/45">Pre-match — no events yet</p>
            </header>

            {/* Waiting card */}
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-cyan-300/10 bg-[#040e24]/70 p-10 text-center">
              <Clock3 size={40} className="text-cyan-400/40" />
              <p className="max-w-sm text-sm leading-relaxed text-cyan-100/55">
                Check back closer to kick-off for real-time live events, momentum graphs, and tactical analysis.
              </p>
            </div>
          </div>

          {/* Right: AI analyst */}
          <div>
            <InteractiveAnalyst recentEvents={[]} />
          </div>
        </div>
      </section>
    );
  }

  const isCompleted = matchDetails?.status === "completed";
  const isOfficialStats = boxStats?.is_official_stats ?? false;
  const statsAvailable = boxStats?.stats_available ?? true;
  const isLive = matchDetails?.status === "live";
  const hasReliableTimeline = matchId.startsWith("SB-") || (!isDemoFeed && isLive);
  const canRenderComparisonStats = statsAvailable && (isOfficialStats || !isDemoFeed || matchId.startsWith("SB-"));
  const hasReliableDerivedAnalytics = hasReliableTimeline;

  return (
    <section className="relative mt-2 overflow-visible rounded-2xl border border-cyan-400/15 bg-[#050d21]/95 p-4 text-cyan-50 shadow-[0_30px_100px_rgba(2,22,56,0.8)] md:p-6">
      <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Main Column ── */}
        <div className="min-w-0 space-y-5">
          {/* Header */}
          <header className="rounded-2xl border border-cyan-300/10 bg-gradient-to-br from-[#071330] to-[#040b1f] p-5 md:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-cyan-300/60">
                  {isCompleted ? "Match Stats" : isDemoFeed ? "Demo Feed" : "Live Feed"}
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-cyan-50 md:text-3xl">
                  {dynamicTitle}
                </h2>
                <p className="mt-1 font-mono text-lg text-cyan-100/90">
                  {(matchDetails?.home_score ?? 0)} - {(matchDetails?.away_score ?? 0)}
                </p>
                <p className="mt-1 text-sm text-cyan-100/45">
                  {isCompleted
                    ? "Post-match statistical review and events"
                    : isDemoFeed
                      ? "Simulated tactical feed — backend demo mode"
                      : "Live tactical overview from active match events"}
                </p>
              </div>
              {hasReliableDerivedAnalytics && (
                <div className="flex items-center gap-2.5">
                  <label className="hidden items-center gap-2 rounded-xl border border-cyan-300/15 bg-[#05112b] px-3 py-2 text-xs text-cyan-100/70 focus-within:border-cyan-400/35 transition-colors sm:flex">
                    <Search size={14} className="text-cyan-300/50" />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search team / event"
                      className="w-36 bg-transparent text-cyan-100 placeholder:text-cyan-100/35 focus:outline-none"
                    />
                  </label>
                  <button
                    aria-label="Reset filters"
                    title="Reset filters"
                    onClick={() => {
                      setSearchQuery("");
                      setActiveFilter("all");
                    }}
                    className="rounded-xl border border-cyan-300/15 p-2 text-cyan-100/60 transition hover:bg-cyan-500/10 hover:text-cyan-100/90"
                  >
                    <Bell size={14} />
                  </button>
                </div>
              )}
            </div>

            {isDemoFeed && !isCompleted && (
              <p className="mb-4 rounded-xl border border-cyan-300/10 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-100/60">
                No live match feed connected. Data is generated by the backend demo stream.
              </p>
            )}

            {!isDemoFeed && !isCompleted && feedStatus && !feedStatus.configured && (
              <p className="mb-4 rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/80">
                External mode is enabled but not configured. Set LIVE_FEED_ENDPOINT in backend env.
              </p>
            )}

            {feedStatus && (
              <p className="mb-4 text-[11px] text-cyan-100/40">
                {isCompleted ? "Historical data generated from simulator" : `Feed source: ${feedStatus.source}`}
              </p>
            )}

            {!hasReliableDerivedAnalytics && (
              <p className="mb-4 rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/85">
                Real-data-only mode: simulated timelines are hidden for this fixture.
              </p>
            )}

            {droppedEventCount > 0 && (
              <p className="mb-4 rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/80">
                Hidden {droppedEventCount} stale events that did not match {homeTeamName} or {awayTeamName}.
              </p>
            )}

            {hasReliableDerivedAnalytics && (
              <div className="mb-4 flex flex-wrap gap-2">
                {filterButtons.map((btn) => (
                  <button
                    key={btn.filter}
                    onClick={() => setActiveFilter(btn.filter)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      activeFilter === btn.filter
                        ? "border-cyan-300/35 bg-cyan-500/20 text-cyan-50"
                        : "border-cyan-300/15 bg-cyan-500/5 text-cyan-100/70 hover:bg-cyan-500/10"
                    }`}
                  >
                    {btn.label} ({btn.count})
                  </button>
                ))}
              </div>
            )}

            {/* Score + stat comparison */}
            <div className="flex items-center gap-3 rounded-xl border border-cyan-300/10 bg-cyan-500/5 px-4 py-3 mb-1">
              <Goal size={16} className="text-cyan-400/70 shrink-0" />
              <p className="text-sm text-cyan-100/40 uppercase tracking-wider shrink-0">Score</p>
              <p className="text-xl font-bold text-cyan-50 font-mono tracking-tight ml-auto">
                {homeTeamName}{" "}
                <span className="text-cyan-300">{boxStats?.score_home ?? matchDetails?.home_score ?? 0}</span>
                {" — "}
                <span className="text-pink-300">{boxStats?.score_away ?? matchDetails?.away_score ?? 0}</span>
                {" "}{awayTeamName}
              </p>
            </div>

            {canRenderComparisonStats && (
              <StatComparisonBars
                homeTeam={homeTeamName}
                awayTeam={awayTeamName}
                stats={comparisonStats}
              />
            )}
            {isCompleted && (
              <p className="mt-3 text-[11px] text-cyan-100/45">
                Stats source: {isOfficialStats ? "official provider" : statsAvailable ? "simulated event aggregation" : "official provider not configured"}
              </p>
            )}

            {/* Match Status Badge */}
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-500/8 px-3 py-1.5 font-mono text-xs text-cyan-100/70">
                {isConnected && (
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
                {matchId} {isConnected ? "• Connected" : "• Waiting"}
              </span>
            </div>
          </header>

          {connectionMessage && (
            <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/80">
              {connectionMessage}
            </p>
          )}

          {hasReliableDerivedAnalytics ? (
            <>
              {/* Charts Row 1 */}
              <div className="grid gap-5 md:grid-cols-3">
                <article className="rounded-2xl border border-cyan-300/10 bg-[#07122b]/80 p-4 md:col-span-2">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-cyan-50">Event Intensity</h3>
                    <span className="text-xs text-cyan-100/40">
                      {filteredEvents.length > 0
                        ? `Minute ${filteredEvents[filteredEvents.length - 1].timestamp}`
                        : "No events"}
                    </span>
                  </div>
                  <div className="h-52">
                    {isMounted ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={areaPulseData}>
                          <defs>
                            <linearGradient id="pulseGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.75} />
                              <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="#12305c" strokeDasharray="4 4" />
                          <XAxis dataKey="step" tick={false} axisLine={false} />
                          <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} />
                          <Tooltip
                            cursor={{ stroke: "#38bdf8", strokeWidth: 1 }}
                            contentStyle={{
                              backgroundColor: "#020b1f",
                              borderColor: "#1e3a8a",
                              borderRadius: 12,
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#38bdf8"
                            fill="url(#pulseGradient)"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full w-full animate-pulse rounded-xl bg-cyan-900/20" />
                    )}
                  </div>
                </article>

                <article className="rounded-2xl border border-cyan-300/10 bg-[#07122b]/80 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-cyan-50">Possession</h3>
                    <Flame className="text-cyan-300/60" size={16} />
                  </div>
                  <div className="flex h-52 items-center justify-center">
                    <div className="relative flex flex-col items-center">
                      <div className="relative h-36 w-36 rounded-full border-4 border-cyan-500/25 bg-gradient-to-b from-cyan-500/15 to-blue-600/15">
                        <div className="absolute inset-3 rounded-full border border-cyan-300/15" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-3xl font-bold text-cyan-100">
                            {filteredEvents.length > 0 ? `${latestMomentum}%` : "—"}
                          </span>
                        </div>
                      </div>
                      <span className="mt-2.5 text-xs text-cyan-100/40">
                        Avg: {averageMomentum > 0 ? `${averageMomentum}%` : "—"}
                      </span>
                    </div>
                  </div>
                </article>
              </div>

              {/* Charts Row 2 */}
              <div className="grid gap-5 md:grid-cols-3">
                <article className="rounded-2xl border border-cyan-300/10 bg-[#07122b]/80 p-4">
                  <h3 className="mb-3 text-base font-semibold text-cyan-50">xG Timeline</h3>
                  <div className="h-44">
                    {isMounted ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={xgTimelineData}>
                          <CartesianGrid stroke="#12305c" strokeDasharray="3 3" />
                          <XAxis dataKey="minute" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                          <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#020b1f",
                              borderColor: "#1e3a8a",
                              borderRadius: 12,
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="home_xg"
                            stroke="#22d3ee"
                            strokeWidth={2.5}
                            dot={false}
                            connectNulls
                          />
                          <Line
                            type="monotone"
                            dataKey="away_xg"
                            stroke="#f472b6"
                            strokeWidth={2.5}
                            dot={false}
                            connectNulls
                          />
                          {goalMinutes.map((g, i) => (
                            <ReferenceLine
                              key={`goal-${i}`}
                              x={g.minute}
                              stroke={g.team === homeTeamName ? "rgba(34,211,238,0.55)" : "rgba(244,114,182,0.55)"}
                              strokeDasharray="4 3"
                              label={{ value: "⚽", position: "insideTopRight", fontSize: 9, fill: "rgba(251,191,36,0.9)" }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full w-full animate-pulse rounded-xl bg-cyan-900/20" />
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-cyan-100/40">
                    xG is estimated from shot location in demo data.
                  </p>
                </article>

                {isLive && (
                  <article className="rounded-2xl border border-cyan-300/10 bg-[#07122b]/80 p-4 md:col-span-2">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="flex items-center gap-2 text-base font-semibold text-cyan-50">
                        <BrainCircuit className="text-cyan-300" size={18} />
                        AI Tactical Analyst
                      </h3>
                      <button
                        onClick={fetchAnalysis}
                        disabled={isAnalyzing}
                        className="rounded-xl border border-cyan-400/20 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:border-cyan-900/30 disabled:bg-cyan-950/30 disabled:text-cyan-100/25"
                      >
                        {isAnalyzing ? "Analyzing…" : "Analyze Current Play"}
                      </button>
                    </div>
                    <div className="rounded-xl border-l-[3px] border-cyan-400/60 bg-cyan-500/5 px-4 py-3">
                      <p className="text-sm italic leading-relaxed text-cyan-100/80">
                        {insight}
                      </p>
                    </div>
                  </article>
                )}
              </div>
            </>
          ) : (
            <article className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-amber-100/85">
              <h3 className="text-sm font-semibold uppercase tracking-wider">Limited Post-Match Analytics</h3>
              <p className="mt-2 text-sm leading-relaxed">
                Official event-based stats are not available for this completed fixture, so advanced charts and tactical analysis are hidden to avoid misleading numbers.
              </p>
            </article>
          )}
          {/* Interactive AI Chat */}
          {isLive && <InteractiveAnalyst recentEvents={filteredEvents} />}
        </div>

        {/* ── Right Sidebar ── */}
        <aside className="min-w-0 space-y-5">
          {hasReliableDerivedAnalytics && (
            <article className="rounded-2xl border border-cyan-300/10 bg-[#07122b]/80 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-cyan-50">Shot Map</h3>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    isConnected
                      ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20"
                      : "bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20"
                  }`}
                >
                  {isConnected && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                  {isConnected ? "Live" : "Offline"}
                </span>
              </div>
              <div className="h-72 overflow-visible rounded-xl border border-cyan-300/10 bg-[#061530] p-2">
                <FootballPitch
                  shots={pitchShots}
                  homeTeam={homeTeamName}
                  awayTeam={awayTeamName}
                />
              </div>
            </article>
          )}

          {deepAnalytics && (
            <article className="rounded-2xl border border-cyan-300/10 bg-[#07122b]/80 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-cyan-50">Pass Network</h3>
                <span className="text-[11px] text-cyan-100/45">StatsBomb</span>
              </div>
              <div className="h-56 overflow-hidden rounded-xl border border-cyan-300/10 bg-[#061530] p-3">
                <div className="relative h-full w-full">
                  {(() => {
                    const nodes = deepAnalytics.pass_network.nodes;
                    const edges = deepAnalytics.pass_network.edges;
                    if (nodes.length === 0) return null;

                    const positions: Record<string, { x: number; y: number }> = {};
                    const homeNodes = nodes.filter((n) => n.team === deepAnalytics.home_team);
                    const awayNodes = nodes.filter((n) => n.team !== deepAnalytics.home_team);
                    const vSpaceHome = homeNodes.length > 1 ? 180 / (homeNodes.length - 1) : 0;
                    const vSpaceAway = awayNodes.length > 1 ? 180 / (awayNodes.length - 1) : 0;
                    homeNodes.forEach((n, i) => {
                      positions[n.player] = {
                        x: 40,
                        y: 20 + i * vSpaceHome,
                      };
                    });
                    awayNodes.forEach((n, i) => {
                      positions[n.player] = {
                        x: 200,
                        y: 20 + i * vSpaceAway,
                      };
                    });

                    const maxEdge = Math.max(1, ...edges.map((e) => e.count));
                    const maxTouches = Math.max(1, ...nodes.map((n) => n.touches));

                    return (
                      <svg viewBox="0 0 240 220" className="h-full w-full">
                        {/* Team labels */}
                        <text x="40" y="10" textAnchor="middle" fontSize="8" fill="rgba(34,211,238,0.6)" fontWeight="600">
                          {deepAnalytics.home_team.split(" ").slice(-1)[0]}
                        </text>
                        <text x="200" y="10" textAnchor="middle" fontSize="8" fill="rgba(244,114,182,0.6)" fontWeight="600">
                          {deepAnalytics.away_team.split(" ").slice(-1)[0]}
                        </text>
                        {/* Dividing line */}
                        <line x1="120" y1="0" x2="120" y2="220" stroke="rgba(34,211,238,0.08)" strokeWidth="1" strokeDasharray="4 4" />
                        {edges.map((e) => {
                          const a = positions[e.from];
                          const b = positions[e.to];
                          if (!a || !b) return null;
                          const w = 1 + (e.count / maxEdge) * 4.5;
                          return (
                            <line
                              key={`${e.from}-${e.to}-${e.count}`}
                              x1={a.x}
                              y1={a.y}
                              x2={b.x}
                              y2={b.y}
                              stroke="rgba(34,211,238,0.25)"
                              strokeWidth={w}
                            />
                          );
                        })}
                        {nodes.map((n) => {
                          const p = positions[n.player];
                          const r = 4 + (n.touches / maxTouches) * 6;
                          const fill = n.team === deepAnalytics.home_team ? "rgba(34,211,238,0.85)" : "rgba(244,114,182,0.85)";
                          return (
                            <g key={n.player}>
                              <circle cx={p.x} cy={p.y} r={r} fill={fill} />
                              <text
                                x={p.x}
                                y={p.y + r + 9}
                                textAnchor="middle"
                                fontSize="7"
                                fill="rgba(226,232,240,0.75)"
                              >
                                {n.player.split(" ").slice(-1)[0]}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>
              </div>
            </article>
          )}

          {deepAnalytics && (
            <article className="rounded-2xl border border-cyan-300/10 bg-[#07122b]/80 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-cyan-50">Pressures</h3>
                <span className="text-[11px] text-cyan-100/45">Top players</span>
              </div>
              <div className="space-y-2">
                {deepAnalytics.pressures.top_players.slice(0, 6).map((p) => (
                  <div
                    key={p.player}
                    className="flex items-center justify-between rounded-xl border border-cyan-300/10 bg-[#061530] px-3 py-2"
                  >
                    <span className="text-xs text-cyan-100/75">{p.player}</span>
                    <span className="text-xs font-semibold text-cyan-50">{p.count}</span>
                  </div>
                ))}
              </div>
            </article>
          )}

          {hasReliableDerivedAnalytics && playerStats && playerStats.players.length > 0 && (
            <article className="rounded-2xl border border-cyan-300/10 bg-[#07122b]/80 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-cyan-50">Player xG</h3>
                <span className="text-[11px] text-cyan-100/45">Top performers</span>
              </div>
              <div className="space-y-2">
                {playerStats.players.slice(0, 7).map((p) => {
                  const maxXg = playerStats.players[0]?.xg || 1;
                  const barPct = maxXg > 0 ? Math.round((p.xg / maxXg) * 100) : 0;
                  const barWidthClass = toProgressWidthClass(barPct);
                  const isHome = p.team === homeTeamName;
                  return (
                    <div key={p.player} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`font-medium truncate max-w-[60%] ${isHome ? "text-cyan-200/85" : "text-pink-200/85"}`}>
                          {p.player.split(" ").slice(-1)[0]}
                          {p.goals > 0 && <span className="ml-1 text-amber-300">⚽×{p.goals}</span>}
                        </span>
                        <span className="text-cyan-100/50 tabular-nums">{p.xg.toFixed(2)} xG</span>
                      </div>
                      <div className="h-1 w-full rounded-full bg-[#071a3a]">
                        <div
                          className={`h-full rounded-full ${barWidthClass} ${isHome ? "bg-cyan-400/70" : "bg-pink-400/70"}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          )}

          {hasReliableDerivedAnalytics && (
            <article className="rounded-2xl border border-cyan-300/10 bg-[#07122b]/80 p-4">
              <h3 className="mb-3 text-base font-semibold text-cyan-50">Key Moments</h3>
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {shotEvents.length === 0 ? (
                  <div className="rounded-xl border border-cyan-300/10 bg-cyan-500/5 px-3 py-4 text-center text-sm text-cyan-100/50">
                    No shots yet…
                  </div>
                ) : (
                  shotEvents
                    .slice(-8)
                    .reverse()
                    .map((event: MatchEvent, index) => {
                      const xg = estimateXg(event, homeTeamName);
                      const xgWidthClass = toProgressWidthClass(Math.max(8, Math.min(100, Math.round(xg * 100))));
                      const isHomeEvent = event.team === homeTeamName;
                      return (
                    <div
                      key={`${event.team}-${event.timestamp}-${event.event_type}-${index}`}
                      className="rounded-xl border border-cyan-300/10 bg-gradient-to-br from-[#061530] to-[#07122b] px-3 py-3 transition hover:-translate-y-0.5 hover:border-cyan-300/25"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            isHomeEvent
                              ? "border-cyan-300/30 bg-cyan-500/10 text-cyan-100"
                              : "border-pink-300/30 bg-pink-500/10 text-pink-100"
                          }`}
                        >
                          {event.team}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/15 bg-cyan-500/5 px-2 py-1 text-[11px] text-cyan-100/55">
                          <Clock3 size={11} /> {Math.min(event.timestamp, 95)}&apos;
                        </span>
                      </div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${getEventAccent(event.event_type)}`}
                        >
                          {event.event_type}
                        </span>
                        <span className="text-xs font-medium text-cyan-100/65">xG {xg.toFixed(2)}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#071a3a]">
                        <div
                          className={`h-full rounded-full ${xgWidthClass} ${isHomeEvent ? "bg-cyan-400/80" : "bg-pink-400/80"}`}
                        />
                      </div>
                    </div>
                      );
                    })
                )}
              </div>
            </article>
          )}
        </aside>
      </div>
    </section>
  );
}
