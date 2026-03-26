"use client";

import React from "react";

export interface PitchShot {
  x: number | null; // 0–100 scale
  y: number | null; // 0–100 scale
  team: string;
  event_type: string;
  player?: string | null;
  xg?: number;
}

interface FootballPitchProps {
  shots: PitchShot[];
  homeTeam: string;
  awayTeam: string;
  showLegend?: boolean;
}

// ─── Standard FIFA pitch: 105m × 68m ────────────────────────────────────────
const W = 105;
const H = 68;

// Penalty area: 16.5m deep, 40.32m wide
const PA_W = 16.5;
const PA_H = 40.32;
const PA_Y = (H - PA_H) / 2; // 13.84

// Goal area (6-yard box): 5.5m deep, 18.32m wide
const GA_W = 5.5;
const GA_H = 18.32;
const GA_Y = (H - GA_H) / 2; // 24.84

// Goal: 7.32m wide, 2m depth (visual)
const GOAL_H = 7.32;
const GOAL_Y = (H - GOAL_H) / 2; // 30.34
const GOAL_D = 2.5;

// Penalty spot 11m from goal line
const PEN_X = 11;

// Center circle / arc radius (9.15m)
const CC_R = 9.15;
const CORNER_R = 1;

// Penalty arc math: circle centered at (PEN_X, H/2) with r=CC_R intersects x=PA_W
// (PA_W − PEN_X)² + (y − H/2)² = CC_R²  →  y = H/2 ± √(CC_R² − (PA_W−PEN_X)²)
const arcDy = Math.sqrt(CC_R * CC_R - (PA_W - PEN_X) * (PA_W - PEN_X));
const LEFT_ARC_Y1 = H / 2 - arcDy; // ≈ 26.69
const LEFT_ARC_Y2 = H / 2 + arcDy; // ≈ 41.31

const LINE = "rgba(34,211,238,0.2)";
const LINE_BOLD = "rgba(34,211,238,0.35)";
const SW = 0.5; // stroke-width

// Map 0–100 event coords to SVG pitch coords
const mx = (x: number) => (x * W) / 100;
const my = (y: number) => (y * H) / 100;

export default function FootballPitch({
  shots,
  homeTeam,
  awayTeam,
  showLegend = true,
}: FootballPitchProps) {
  const viewPad = 4;

  return (
    <svg
      viewBox={`${-viewPad} ${-viewPad} ${W + viewPad * 2} ${H + viewPad * 2 + (showLegend ? 10 : 0)}`}
      className="w-full h-full"
      aria-label="Football pitch shot map"
    >
      {/* ── Pitch surface ── */}
      <rect x="0" y="0" width={W} height={H} fill="rgba(3,18,8,0.85)" />

      {/* Subtle pitch stripes */}
      {Array.from({ length: 10 }, (_, i) => (
        <rect
          key={i}
          x={i * (W / 10)}
          y="0"
          width={W / 10}
          height={H}
          fill={i % 2 === 0 ? "rgba(255,255,255,0.016)" : "none"}
        />
      ))}

      {/* ── Outer boundary ── */}
      <rect x="0" y="0" width={W} height={H} fill="none" stroke={LINE_BOLD} strokeWidth={SW} />

      {/* ── Center line ── */}
      <line x1={W / 2} y1="0" x2={W / 2} y2={H} stroke={LINE} strokeWidth={SW} />

      {/* ── Center circle + spot ── */}
      <circle cx={W / 2} cy={H / 2} r={CC_R} fill="none" stroke={LINE} strokeWidth={SW} />
      <circle cx={W / 2} cy={H / 2} r="0.65" fill={LINE} />

      {/* ── LEFT penalty area ── */}
      <rect x="0" y={PA_Y} width={PA_W} height={PA_H} fill="none" stroke={LINE} strokeWidth={SW} />
      {/* LEFT 6-yard box */}
      <rect x="0" y={GA_Y} width={GA_W} height={GA_H} fill="none" stroke={LINE} strokeWidth={SW} />
      {/* LEFT goal */}
      <rect
        x={-GOAL_D}
        y={GOAL_Y}
        width={GOAL_D}
        height={GOAL_H}
        fill="rgba(34,211,238,0.04)"
        stroke={LINE_BOLD}
        strokeWidth={SW}
      />
      {/* LEFT penalty spot */}
      <circle cx={PEN_X} cy={H / 2} r="0.6" fill={LINE} />
      {/* LEFT penalty arc (D) — arc outside penalty area */}
      <path
        d={`M ${PA_W} ${LEFT_ARC_Y1} A ${CC_R} ${CC_R} 0 0 1 ${PA_W} ${LEFT_ARC_Y2}`}
        fill="none"
        stroke={LINE}
        strokeWidth={SW}
      />

      {/* ── RIGHT penalty area ── */}
      <rect x={W - PA_W} y={PA_Y} width={PA_W} height={PA_H} fill="none" stroke={LINE} strokeWidth={SW} />
      {/* RIGHT 6-yard box */}
      <rect x={W - GA_W} y={GA_Y} width={GA_W} height={GA_H} fill="none" stroke={LINE} strokeWidth={SW} />
      {/* RIGHT goal */}
      <rect
        x={W}
        y={GOAL_Y}
        width={GOAL_D}
        height={GOAL_H}
        fill="rgba(244,114,182,0.04)"
        stroke={LINE_BOLD}
        strokeWidth={SW}
      />
      {/* RIGHT penalty spot */}
      <circle cx={W - PEN_X} cy={H / 2} r="0.6" fill={LINE} />
      {/* RIGHT penalty arc (D) */}
      <path
        d={`M ${W - PA_W} ${LEFT_ARC_Y1} A ${CC_R} ${CC_R} 0 0 0 ${W - PA_W} ${LEFT_ARC_Y2}`}
        fill="none"
        stroke={LINE}
        strokeWidth={SW}
      />

      {/* ── Corner arcs ── */}
      <path d={`M ${CORNER_R} 0 A ${CORNER_R} ${CORNER_R} 0 0 1 0 ${CORNER_R}`} fill="none" stroke={LINE} strokeWidth={SW} />
      <path d={`M ${W - CORNER_R} 0 A ${CORNER_R} ${CORNER_R} 0 0 0 ${W} ${CORNER_R}`} fill="none" stroke={LINE} strokeWidth={SW} />
      <path d={`M 0 ${H - CORNER_R} A ${CORNER_R} ${CORNER_R} 0 0 0 ${CORNER_R} ${H}`} fill="none" stroke={LINE} strokeWidth={SW} />
      <path d={`M ${W - CORNER_R} ${H} A ${CORNER_R} ${CORNER_R} 0 0 1 ${W} ${H - CORNER_R}`} fill="none" stroke={LINE} strokeWidth={SW} />

      {/* ── Team labels on goals ── */}
      <text x={-viewPad + 0.5} y={H / 2} textAnchor="middle" fontSize="3.5" fill="rgba(34,211,238,0.35)" transform={`rotate(-90, ${-viewPad + 0.5}, ${H / 2})`}>
        {awayTeam.split(" ").slice(-1)[0]}
      </text>
      <text x={W + viewPad - 0.5} y={H / 2} textAnchor="middle" fontSize="3.5" fill="rgba(244,114,182,0.35)" transform={`rotate(90, ${W + viewPad - 0.5}, ${H / 2})`}>
        {homeTeam.split(" ").slice(-1)[0]}
      </text>

      {/* ── Shots ── */}
      {shots.map((s, idx) => {
        if (s.x == null || s.y == null) return null;

        const px = mx(s.x);
        const py = my(s.y);
        const xg = s.xg ?? 0.06;
        // radius: 1.5 to 5 based on xG
        const r = Math.max(1.5, Math.min(5, 1.5 + xg * 10));
        const isGoal = s.event_type === "Goal";
        const isHome = s.team === homeTeam;

        const color = isGoal ? "#fbbf24" : isHome ? "#22d3ee" : "#f472b6";
        const glowColor = isGoal ? "rgba(251,191,36,0.3)" : isHome ? "rgba(34,211,238,0.2)" : "rgba(244,114,182,0.2)";

        return (
          <g key={`shot-${idx}`}>
            {/* glow halo */}
            <circle cx={px} cy={py} r={r + (isGoal ? 3.5 : 2)} fill={glowColor} />
            {/* main dot */}
            <circle cx={px} cy={py} r={r} fill={color} opacity={isGoal ? 1 : 0.82} />
            {/* goal star marker */}
            {isGoal && (
              <circle cx={px} cy={py} r={r * 0.4} fill="rgba(255,255,255,0.85)" />
            )}
            {/* tooltip title */}
            <title>
              {s.player ?? s.team} — {s.event_type} (xG {xg.toFixed(2)}) min {s.xg != null ? "" : "~"}
            </title>
          </g>
        );
      })}

      {/* ── Legend ── */}
      {showLegend && (
        <g transform={`translate(0, ${H + 2})`}>
          <circle cx="4" cy="3" r="1.8" fill="#22d3ee" opacity="0.85" />
          <text x="7.5" y="4.5" fontSize="3.8" fill="rgba(226,232,240,0.65)">
            {homeTeam}
          </text>
          <circle cx={W / 2 - 2} cy="3" r="1.8" fill="#f472b6" opacity="0.85" />
          <text x={W / 2 + 2} y="4.5" fontSize="3.8" fill="rgba(226,232,240,0.65)">
            {awayTeam}
          </text>
          <circle cx={W - 22} cy="3" r="1.8" fill="#fbbf24" opacity="0.9" />
          <circle cx={W - 22} cy="3" r="0.7" fill="rgba(255,255,255,0.85)" />
          <text x={W - 18} y="4.5" fontSize="3.8" fill="rgba(226,232,240,0.65)">
            Goal
          </text>
        </g>
      )}
    </svg>
  );
}
