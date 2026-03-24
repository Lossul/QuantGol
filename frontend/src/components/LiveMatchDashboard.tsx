"use client";
import { InteractiveAnalyst } from "./InteractiveAnalyst";

import React, { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Bell,
  BrainCircuit,
  Clock3,
  Flame,
  Search,
  TrendingUp,
  Gauge,
  Goal,
  Siren,
} from "lucide-react";
import { useMatchStream } from "../hooks/useMatchStream";
import type {
  FeedStatusResponse,
  Match,
  MatchEvent,
  MatchStatsResponse,
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

  const isDemoFeed = feedStatus?.is_demo ?? true;

  const filteredEvents = events.filter((event) => {
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

  const radarData = [
    { metric: "Press", value: Math.round((latestMomentum + averageMomentum) / 2) },
    { metric: "Build", value: Math.max(35, averageMomentum - 6) },
    { metric: "Width", value: Math.max(30, latestMomentum - 10) },
    { metric: "Transitions", value: Math.min(95, latestMomentum + 8) },
    { metric: "Shots", value: Math.max(28, averageMomentum - 12) },
    { metric: "Compact", value: Math.min(90, averageMomentum + 4) },
  ];

  const recentEvents = [...filteredEvents].slice(-8).reverse();

  const getEventAccent = (eventType: string) => {
    if (eventType === "Goal")
      return "border-amber-300/45 bg-amber-500/10 text-amber-200";
    if (eventType === "Shot")
      return "border-emerald-400/40 bg-emerald-500/10 text-emerald-300";
    if (eventType === "Foul")
      return "border-rose-400/40 bg-rose-500/10 text-rose-300";
    return "border-cyan-300/30 bg-cyan-500/10 text-cyan-200";
  };

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

  /* ── Derive dynamic team names from events ── */
  const uniqueTeams = Array.from(new Set(events.map((e) => e.team)));
  const homeTeamName = matchDetails?.home_team ?? uniqueTeams[0] ?? "Home";
  const awayTeamName = matchDetails?.away_team ?? uniqueTeams[1] ?? "Away";
  const dynamicTitle = matchDetails 
    ? `${matchDetails.home_team} vs ${matchDetails.away_team}`
    : uniqueTeams.length >= 2
      ? `${uniqueTeams[0]} vs ${uniqueTeams[1]}`
      : uniqueTeams[0] ?? "Match Dashboard";

  const shotsByHome = events.filter(
    (event) => (event.event_type === "Shot" || event.event_type === "Goal") && event.team === homeTeamName,
  ).length;
  const shotsByAway = events.filter(
    (event) => (event.event_type === "Shot" || event.event_type === "Goal") && event.team === awayTeamName,
  ).length;
  const foulsByHome = events.filter(
    (event) => event.event_type === "Foul" && event.team === homeTeamName,
  ).length;
  const foulsByAway = events.filter(
    (event) => event.event_type === "Foul" && event.team === awayTeamName,
  ).length;
  const averageHomePossession =
    events.length > 0
      ? Math.round(events.reduce((sum, event) => sum + event.possession_stat, 0) / events.length)
      : 50;
  const averageAwayPossession = Math.max(0, 100 - averageHomePossession);

  const filterButtons: {
    label: string;
    filter: typeof activeFilter;
    count: number;
  }[] = [
    { label: "All", filter: "all", count: events.length },
    { label: "Goals", filter: "goals", count: events.filter((e) => e.event_type === "Goal").length },
    { label: "Shots", filter: "shots", count: events.filter((e) => e.event_type === "Shot" || e.event_type === "Goal").length },
    { label: "Fouls", filter: "fouls", count: events.filter((e) => e.event_type === "Foul").length },
    { label: "Passes", filter: "passes", count: events.filter((e) => e.event_type === "Pass").length },
    {
      label: "Defensive",
      filter: "defensive",
      count: events.filter((e) => e.event_type === "Tackle" || e.event_type === "Interception").length,
    },
  ];

  const isScheduled = matchDetails?.status === "scheduled";
  
  if (isScheduled) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-cyan-400/15 bg-[#050d21]/95 px-6 py-8 shadow-[0_30px_100px_rgba(2,22,56,0.8)] md:px-10 md:py-12">
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
        
        <div className="mx-auto flex max-w-5xl flex-col items-stretch gap-8 lg:flex-row">
          {/* Status Box */}
          <div className="flex min-h-[400px] flex-1 flex-col items-center justify-center rounded-3xl border border-cyan-400/15 bg-[#040e24]/70 p-10 text-center shadow-inner">
            <Clock3 size={48} className="mb-6 text-cyan-400/50" />
            <h2 className="text-3xl font-bold tracking-tight text-cyan-50">
              Match Scheduled
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-cyan-100/60">
              {matchDetails.home_team} vs {matchDetails.away_team} will kick off on {new Date(matchDetails.start_time).toLocaleString()}.
              <br /><br />
              Check back closer to kick-off for real-time live events and momentum graphs. In the meantime, you can ask our AI analyst for pre-match facts and insights!
            </p>
          </div>
          
          {/* AI Box */}
          <div className="w-full lg:w-[420px]">
            <InteractiveAnalyst recentEvents={[]} />
          </div>
        </div>
      </section>
    );
  }

  const isCompleted = matchDetails?.status === "completed";
  const isOfficialStats = boxStats?.is_official_stats ?? false;
  const statsAvailable = boxStats?.stats_available ?? true;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-cyan-400/15 bg-[#050d21]/95 p-4 text-cyan-50 shadow-[0_30px_100px_rgba(2,22,56,0.8)] md:p-6">
      <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
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

            {/* Football-first stat tags */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-2.5 rounded-xl border border-cyan-300/10 bg-cyan-500/5 px-4 py-3">
                <Goal size={16} className="text-cyan-400/70" />
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-cyan-100/40">Score</p>
                  <p className="text-lg font-semibold text-cyan-50">
                    {homeTeamName} {boxStats?.score_home ?? matchDetails?.home_score ?? 0} - {boxStats?.score_away ?? matchDetails?.away_score ?? 0} {awayTeamName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-cyan-300/10 bg-cyan-500/5 px-4 py-3">
                <TrendingUp size={16} className="text-cyan-400/70" />
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-cyan-100/40">Shots</p>
                  <p className="text-lg font-semibold text-cyan-50">
                    {statsAvailable
                      ? `${homeTeamName} ${boxStats?.home_shots ?? shotsByHome} - ${boxStats?.away_shots ?? shotsByAway} ${awayTeamName}`
                      : "Unavailable"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-cyan-300/10 bg-cyan-500/5 px-4 py-3">
                <Siren size={16} className="text-cyan-400/70" />
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-cyan-100/40">Fouls</p>
                  <p className="text-lg font-semibold text-cyan-50">
                    {statsAvailable
                      ? `${homeTeamName} ${boxStats?.home_fouls ?? foulsByHome} - ${boxStats?.away_fouls ?? foulsByAway} ${awayTeamName}`
                      : "Unavailable"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-cyan-300/10 bg-cyan-500/5 px-4 py-3">
                <Gauge size={16} className="text-cyan-400/70" />
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-cyan-100/40">Possession Avg</p>
                  <p className="text-lg font-semibold text-cyan-50">
                    {statsAvailable
                      ? `${boxStats?.home_possession ?? averageHomePossession}% - ${boxStats?.away_possession ?? averageAwayPossession}%`
                      : "Unavailable"}
                  </p>
                </div>
              </div>
            </div>
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
              <h3 className="mb-3 text-base font-semibold text-cyan-50">Momentum Feed</h3>
              <div className="h-44">
                {isMounted ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timelineData}>
                      <CartesianGrid stroke="#12305c" strokeDasharray="3 3" />
                      <XAxis dataKey="minute" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#020b1f",
                          borderColor: "#1e3a8a",
                          borderRadius: 12,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="momentum"
                        stroke="#38bdf8"
                        strokeWidth={2.5}
                        dot={{ fill: "#38bdf8", r: 2 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full animate-pulse rounded-xl bg-cyan-900/20" />
                )}
              </div>
            </article>

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
          </div>

          {/* Interactive AI Chat */}
          <InteractiveAnalyst recentEvents={filteredEvents} />
        </div>

        {/* ── Right Sidebar ── */}
        <aside className="min-w-0 space-y-5">
          <article className="rounded-2xl border border-cyan-300/10 bg-[#07122b]/80 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-cyan-50">Tactical Radar</h3>
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
            <div className="h-56">
              {isMounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#1e3a8a" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar
                      name="Tactical"
                      dataKey="value"
                      stroke="#22d3ee"
                      fill="#0ea5e9"
                      fillOpacity={0.35}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full animate-pulse rounded-xl bg-cyan-900/20" />
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-cyan-300/10 bg-[#07122b]/80 p-4">
            <h3 className="mb-3 text-base font-semibold text-cyan-50">Recent Events</h3>
            <div className="space-y-2">
              {recentEvents.length === 0 ? (
                <div className="rounded-xl border border-cyan-300/10 bg-cyan-500/5 px-3 py-4 text-center text-sm text-cyan-100/50">
                  Waiting for live events…
                </div>
              ) : (
                recentEvents.map((event: MatchEvent, index) => (
                  <div
                    key={`${event.team}-${event.timestamp}-${event.event_type}-${index}`}
                    className="rounded-xl border border-cyan-300/10 bg-[#061530] px-3 py-2.5 transition hover:border-cyan-300/20"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-cyan-100/70">{event.team}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-cyan-100/45">
                        <Clock3 size={11} /> {Math.min(event.timestamp, 95)}&apos;
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${getEventAccent(event.event_type)}`}
                      >
                        {event.event_type}
                      </span>
                      <span className="text-xs font-medium text-cyan-100/60">
                        Possession {event.possession_stat}%
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}
