"use client";

import React from "react";

export interface StatRow {
  label: string;
  home: number;
  away: number;
  /** Optional formatting function; defaults to plain number */
  format?: (v: number) => string;
  /** If true, higher away value is "better" for away (bars same logic) */
  invertGood?: boolean;
}

interface StatComparisonBarsProps {
  homeTeam: string;
  awayTeam: string;
  stats: StatRow[];
}

function fmt(v: number, format?: (v: number) => string) {
  if (format) return format(v);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

function pctToWidthClass(percent: number) {
  const v = Math.max(0, Math.min(100, percent));
  if (v >= 96) return "w-full";
  if (v >= 88) return "w-11/12";
  if (v >= 80) return "w-10/12";
  if (v >= 72) return "w-9/12";
  if (v >= 64) return "w-8/12";
  if (v >= 56) return "w-7/12";
  if (v >= 48) return "w-6/12";
  if (v >= 40) return "w-5/12";
  if (v >= 32) return "w-4/12";
  if (v >= 24) return "w-3/12";
  if (v >= 16) return "w-2/12";
  if (v >= 8) return "w-1/12";
  return "w-[4px]";
}

function StatBar({ row }: { row: StatRow }) {
  const total = row.home + row.away;
  const homePct = total === 0 ? 50 : (row.home / total) * 100;
  const awayPct = 100 - homePct;
  const homeWidthClass = pctToWidthClass(homePct);
  const awayWidthClass = pctToWidthClass(awayPct);

  return (
    <div className="space-y-1">
      {/* Values row */}
      <div className="flex items-center justify-between text-sm font-semibold">
        <span className="text-cyan-200 tabular-nums w-14 text-left">{fmt(row.home, row.format)}</span>
        <span className="text-[11px] font-medium uppercase tracking-wider text-cyan-100/40 flex-1 text-center">
          {row.label}
        </span>
        <span className="text-pink-300 tabular-nums w-14 text-right">{fmt(row.away, row.format)}</span>
      </div>

      {/* Bar row */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#071a3a]">
        <div
          className={`h-full rounded-l-full bg-gradient-to-r from-cyan-400/40 to-cyan-400/75 transition-all duration-700 ${homeWidthClass}`}
        />
        <div
          className={`h-full rounded-r-full bg-gradient-to-l from-pink-400/40 to-pink-400/75 transition-all duration-700 ${awayWidthClass}`}
        />
      </div>
    </div>
  );
}

export default function StatComparisonBars({
  homeTeam,
  awayTeam,
  stats,
}: StatComparisonBarsProps) {
  return (
    <div className="rounded-2xl border border-cyan-300/10 bg-[#07122b]/80 p-4 space-y-4">
      {/* Team header */}
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
        <span className="text-cyan-300/80 truncate max-w-[40%]">{homeTeam}</span>
        <span className="text-cyan-100/25">vs</span>
        <span className="text-pink-300/80 truncate max-w-[40%] text-right">{awayTeam}</span>
      </div>

      {/* Stat rows */}
      <div className="space-y-3">
        {stats.map((row) => (
          <StatBar key={row.label} row={row} />
        ))}
      </div>
    </div>
  );
}
