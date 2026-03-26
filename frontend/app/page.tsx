"use client";

import React, { useRef, useState, useEffect } from "react";
import LiveMatchDashboard from "../src/components/LiveMatchDashboard";
import { Match, MatchSearchSuggestion } from "../src/types";
import { Search, CalendarDays, X, Zap, ChevronRight, TrendingUp, Flame } from "lucide-react";

export default function Home() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const [activeMatchId, setActiveMatchId] = useState<string>("");
  const [trendingMatches, setTrendingMatches] = useState<Match[]>([]);
  const [inputMatchId, setInputMatchId] = useState<string>("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [isLoadingTrending, setIsLoadingTrending] = useState(true);
  const [trendingError, setTrendingError] = useState<string | null>(null);
  const [finderQuery, setFinderQuery] = useState("");
  const [finderDate, setFinderDate] = useState("");
  const [finderResults, setFinderResults] = useState<MatchSearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const finderDateRef = useRef<HTMLInputElement | null>(null);
  const dashboardRef = useRef<HTMLDivElement | null>(null);

  // Fetch top 5 trending matches on load
  useEffect(() => {
    const fetchTrending = async () => {
      try {
        setIsLoadingTrending(true);
        setTrendingError(null);
        const response = await fetch(`${apiBaseUrl}/api/matches/trending/`);
        if (response.ok) {
          const data = await response.json();
          const matches = data.matches || data;
          setTrendingMatches(Array.isArray(matches) ? matches : []);
          // Auto-select the first trending match
          if (Array.isArray(matches) && matches.length > 0 && !activeMatchId) {
            setActiveMatchId(matches[0].match_id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch trending matches:", error);
        setTrendingError("Backend appears offline. Start Django and try again.");
      } finally {
        setIsLoadingTrending(false);
      }
    };

    fetchTrending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll dashboard into view when a match is selected
  useEffect(() => {
    if (activeMatchId && dashboardRef.current) {
      setTimeout(() => {
        dashboardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }, [activeMatchId]);

  // Debounced search
  useEffect(() => {
    const normalizedQuery = finderQuery.trim();
    if (normalizedQuery.length < 2) {
      setFinderResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        setIsSearching(true);
        const params = new URLSearchParams({ query: normalizedQuery });
        if (finderDate) {
          params.set("date", finderDate);
        }

        const response = await fetch(`${apiBaseUrl}/api/matches/search/?${params.toString()}`);
        if (!response.ok) {
          setFinderResults([]);
          return;
        }

        const data = await response.json();
        setFinderResults(Array.isArray(data.matches) ? data.matches : []);
      } catch (error) {
        console.error("Failed to search matches:", error);
        setFinderResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [finderQuery, finderDate]);

  const handleConnect = () => {
    const normalized = inputMatchId.trim();
    if (!normalized) return;
    setActiveMatchId(normalized);
    setInputMatchId("");
    setShowManualInput(false);
  };

  const formatTodayForInput = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleSelectSuggestion = (result: MatchSearchSuggestion) => {
    setInputMatchId(result.match_id);
    setActiveMatchId(result.match_id);
    setShowManualInput(true);
    setFinderResults([]);
    setFinderQuery("");
  };

  const openDatePicker = () => {
    const input = finderDateRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
    } else {
      input.focus();
      input.click();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "live":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-red-300 ring-1 ring-red-400/30">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            Live
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/25">
            Completed
          </span>
        );
      case "scheduled":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-300 ring-1 ring-blue-400/25">
            Scheduled
          </span>
        );
      default:
        return null;
    }
  };

  const isSearchActive = finderQuery.trim().length >= 2;

  return (
    <main className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#020616]">
      <div className="pointer-events-none absolute left-1/3 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative z-10 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">

        {/* ── Branded Header ── */}
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-cyan-50 sm:text-3xl">
              <Zap className="text-cyan-400" size={24} />
              QuantGol
            </h1>
            <p className="mt-1 text-sm text-cyan-100/50">
              Real-time match analytics &amp; AI-powered tactical insights
            </p>
          </div>
          <span className="hidden rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 font-mono text-xs text-cyan-300/80 sm:inline-block">
            v0.2
          </span>
        </header>

        {/* ── Match Finder Panel ── */}
        <section className="mb-8 rounded-2xl border border-cyan-400/15 bg-[#07112b]/70 p-5 backdrop-blur-sm">
          <h2 className="mb-1 text-base font-semibold text-cyan-50">Find a Match</h2>
          <p className="mb-4 text-xs text-cyan-100/50">
            Search any team to find matches — past, present, or upcoming across all major leagues.
          </p>

          {/* Search row */}
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
            <label className="flex items-center gap-2.5 rounded-xl border border-cyan-300/15 bg-[#041028] px-3.5 py-2.5 text-sm text-cyan-100 focus-within:border-cyan-400/40 transition-colors">
              <Search size={15} className="shrink-0 text-cyan-300/60" />
              <input
                value={finderQuery}
                onChange={(event) => setFinderQuery(event.target.value)}
                placeholder="Search any team — e.g. Arsenal, Real Madrid, Bayern…"
                className="w-full bg-transparent placeholder:text-cyan-100/35 focus:outline-none"
              />
              {finderQuery && (
                <button onClick={() => setFinderQuery("")} className="shrink-0 text-cyan-100/40 hover:text-cyan-100/70 transition-colors">
                  <X size={14} />
                </button>
              )}
            </label>
            <input
              ref={finderDateRef}
              type="date"
              title="Filter by date"
              value={finderDate}
              onChange={(event) => setFinderDate(event.target.value)}
              className="rounded-xl border border-cyan-300/15 bg-[#041028] px-3.5 py-2.5 text-sm text-cyan-100 [color-scheme:dark] focus:outline-none focus:border-cyan-400/40 transition-colors"
            />
          </div>

          {/* Date helper pills */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openDatePicker}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/15 bg-cyan-500/5 px-3 py-1.5 text-xs font-medium text-cyan-200/80 transition hover:bg-cyan-500/15 hover:border-cyan-300/30"
            >
              <CalendarDays size={13} />
              Pick date
            </button>
            <button
              type="button"
              onClick={() => setFinderDate(formatTodayForInput())}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/15 bg-cyan-500/5 px-3 py-1.5 text-xs font-medium text-cyan-200/80 transition hover:bg-cyan-500/15 hover:border-cyan-300/30"
            >
              Today
            </button>
            {finderDate && (
              <button
                type="button"
                onClick={() => setFinderDate("")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/20 bg-rose-500/5 px-3 py-1.5 text-xs font-medium text-rose-300/80 transition hover:bg-rose-500/15"
              >
                <X size={12} />
                Clear
              </button>
            )}
            {finderDate && (
              <span className="text-[11px] text-cyan-100/45">
                Filtering: {finderDate}
              </span>
            )}
          </div>

          {/* Search results */}
          {(isSearching || (isSearchActive && finderResults.length > 0)) && (
            <div className="mb-5 rounded-xl border border-cyan-300/15 bg-[#041028]/80 p-2 backdrop-blur-sm">
              {isSearching ? (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-cyan-100/60">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-400/40 border-t-cyan-400" />
                  Searching across leagues…
                </div>
              ) : (
                <div className="space-y-1.5">
                  {finderResults.map((result) => (
                    <button
                      key={`${result.match_id}-${result.source}`}
                      onClick={() => handleSelectSuggestion(result)}
                      className="card-hover-glow w-full rounded-lg border border-cyan-300/10 bg-[#061536] px-4 py-3 text-left transition hover:border-cyan-300/30"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-cyan-50">
                          {result.home_team} vs {result.away_team}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          result.source === "football-data.org"
                            ? "bg-amber-500/15 text-amber-300/90"
                            : "bg-cyan-500/10 text-cyan-300/90"
                        }`}>
                          {result.source === "football-data.org" ? "API" : result.source}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-cyan-100/50">
                        {getStatusBadge(result.status)}
                        {result.start_time && (
                          <span>
                            {new Date(result.start_time).toLocaleDateString()} {new Date(result.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* No results message */}
          {isSearchActive && !isSearching && finderResults.length === 0 && (
            <div className="mb-5 rounded-xl border border-cyan-300/10 bg-cyan-500/5 px-4 py-4 text-center text-sm text-cyan-100/50">
              No matches found for &ldquo;{finderQuery}&rdquo;. Try a different team name.
            </div>
          )}

          {/* ── Trending Matches ── */}
          <div className="border-t border-cyan-300/10 pt-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-cyan-100/90">
              <Flame size={14} className="text-orange-400" />
              Trending Matches
            </h3>

            {isLoadingTrending ? (
              <div className="flex items-center justify-center gap-2 py-8 text-cyan-100/50">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
                <span className="text-sm">Loading trending…</span>
              </div>
            ) : trendingError ? (
              <div className="rounded-xl border border-rose-300/25 bg-rose-500/10 px-4 py-6 text-center text-sm text-rose-200/85">
                {trendingError}
              </div>
            ) : trendingMatches.length === 0 ? (
              <div className="rounded-xl border border-cyan-300/10 bg-cyan-500/5 px-4 py-6 text-center text-sm text-cyan-100/50">
                No matches available — run <code className="text-cyan-300/70">sync_matches</code> to pull fixtures.
              </div>
            ) : (
              <div className="space-y-2.5">
                {trendingMatches.map((match, index) => {
                  const isActive = activeMatchId === match.match_id;
                  return (
                    <button
                      key={match.match_id}
                      onClick={() => setActiveMatchId(match.match_id)}
                      className={`card-hover-glow group relative w-full rounded-xl border p-4 text-left transition-all ${
                        isActive
                          ? "border-cyan-400/40 bg-cyan-500/15 shadow-[0_0_24px_rgba(34,211,238,0.08)]"
                          : "border-cyan-300/12 bg-[#041028]/60 hover:border-cyan-300/30"
                      }`}
                    >
                      {/* Active indicator bar */}
                      {isActive && (
                        <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-cyan-400" />
                      )}

                      <div className="flex items-center gap-3">
                        {/* Rank number */}
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                          index === 0 ? "bg-orange-500/20 text-orange-300" :
                          index === 1 ? "bg-amber-500/15 text-amber-300/80" :
                          "bg-cyan-500/10 text-cyan-300/60"
                        }`}>
                          {index + 1}
                        </span>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-sm font-semibold text-cyan-50 leading-snug truncate">
                              {match.home_team} vs {match.away_team}
                            </span>
                            {getStatusBadge(match.status)}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-cyan-100/50">
                            <CalendarDays size={12} />
                            {new Date(match.start_time).toLocaleDateString()}{" "}
                            {new Date(match.start_time).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>

                        {isActive && (
                          <div className="flex items-center gap-1 text-[11px] font-medium text-cyan-300/70 shrink-0">
                            <ChevronRight size={12} />
                            Viewing
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Manual Match ID */}
            <div className="mt-5 border-t border-cyan-300/10 pt-4">
              {!showManualInput ? (
                <button
                  onClick={() => setShowManualInput(true)}
                  className="text-xs font-medium text-cyan-400/80 hover:text-cyan-300 transition-colors"
                >
                  Or enter a custom match ID →
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={inputMatchId}
                    onChange={(e) => setInputMatchId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                    placeholder="Enter match ID"
                    className="flex-1 rounded-xl border border-cyan-300/15 bg-[#041028] px-3.5 py-2.5 text-sm text-cyan-100 placeholder:text-cyan-100/35 focus:outline-none focus:border-cyan-400/40 transition-colors"
                    autoFocus
                  />
                  <button
                    onClick={handleConnect}
                    className="rounded-xl border border-cyan-400/25 bg-cyan-500/20 px-5 py-2.5 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-500/30"
                  >
                    Connect
                  </button>
                  <button
                    onClick={() => setShowManualInput(false)}
                    className="rounded-xl border border-cyan-300/15 px-3.5 py-2.5 text-sm text-cyan-100/60 transition hover:bg-cyan-500/10"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Match Dashboard ── */}
        {activeMatchId && (
          <div ref={dashboardRef}>
            <LiveMatchDashboard matchId={activeMatchId} />
          </div>
        )}
      </div>
    </main>
  );
}
