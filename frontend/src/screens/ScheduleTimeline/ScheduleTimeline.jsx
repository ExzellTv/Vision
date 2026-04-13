import React, { useState, useEffect, useRef, useCallback, useMemo, Component } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { colors, fonts, card, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import { projectsApi } from "../../services/api";
import { BUILD_COST_PSF } from "../FeasibilityDashboard/valuationEngine";
import StatusBadge from "../../components/shared/StatusBadge";

import {
  createLayerMaterials, MATERIAL_KEY_MAP, MATERIALS_DATA,
  updateDims, updateRooms, rebuildLayerGroups,
  buildScene, setupLighting, createOrbitControls,
} from "../LayerEditor/LayerEditor";

/* ─── Error Boundary ─── */
class ScheduleErrorBoundary extends Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("ScheduleTimeline error:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: "100%", background: colors.bgGradient, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
          <span style={{ fontFamily: fonts.label, fontSize: 16, fontWeight: 600, color: colors.danger }}>
            Schedule view encountered an error
          </span>
          <span style={{ fontFamily: fonts.data, fontSize: 12, color: colors.textDim, maxWidth: 400, textAlign: "center" }}>
            {String(this.state.error?.message || this.state.error)}
          </span>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ padding: "6px 16px", borderRadius: 6, background: colors.accent, border: "none", color: "#000", fontFamily: fonts.label, fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 8 }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── Construction phase config — 13 phases, ~34 weeks total ───────────────
 *  layerIdx: index into project.materials + layerGroups for 3D reveal.
 *            null = no direct material layer (permits, MEP rough-in, etc.)
 *  category: industry CPM category label (shown in Gantt)
 * ─────────────────────────────────────────────────────────────────────── */
const LAYER_PHASE_CONFIG = [
  // ── SITEWORK ──────────────────────────────────────────────────────────
  { layerIdx: null, name: "Permitting & Site Prep",       durationWeeks: 2,  category: "SITEWORK" },
  { layerIdx: null, name: "Excavation & Grading",         durationWeeks: 2,  category: "SITEWORK" },
  // ── FOUNDATION ────────────────────────────────────────────────────────
  { layerIdx: 0,    name: "Foundation (Form, Pour, Cure)",durationWeeks: 4,  category: "FOUNDATION" },
  // ── STRUCTURE ─────────────────────────────────────────────────────────
  { layerIdx: 1,    name: "Structural Framing",           durationWeeks: 5,  category: "STRUCTURE" },
  { layerIdx: 7,    name: "Roofing & Sheathing",          durationWeeks: 3,  category: "STRUCTURE" },
  { layerIdx: 2,    name: "Exterior Sheathing & Wrap",    durationWeeks: 2,  category: "STRUCTURE" },
  // ── MEP ROUGH-IN ──────────────────────────────────────────────────────
  { layerIdx: null, name: "Rough MEP (Plumbing, Elec, HVAC)", durationWeeks: 4, category: "MEP" },
  // ── ENCLOSURE ─────────────────────────────────────────────────────────
  { layerIdx: 3,    name: "Insulation",                  durationWeeks: 2,  category: "ENCLOSURE" },
  { layerIdx: 4,    name: "Drywall (Hang, Tape, Finish)", durationWeeks: 3,  category: "ENCLOSURE" },
  // ── FINISHES ──────────────────────────────────────────────────────────
  { layerIdx: 5,    name: "Exterior Cladding & Siding",  durationWeeks: 3,  category: "FINISHES" },
  { layerIdx: null, name: "Interior Finish Carpentry",   durationWeeks: 3,  category: "FINISHES" },
  { layerIdx: 6,    name: "Paint & Interior Finish",     durationWeeks: 2,  category: "FINISHES" },
  // ── CLOSEOUT ──────────────────────────────────────────────────────────
  { layerIdx: null, name: "Fixtures, Trim & Final MEP",  durationWeeks: 2,  category: "CLOSEOUT" },
  { layerIdx: null, name: "Final Inspection & Punch List",durationWeeks: 1,  category: "CLOSEOUT" },
];

// Pinned to today in the app
const TODAY = new Date("2026-03-07");

/* ─── CPM category colours — mirrors industry schedule swim-lane colours ─── */
const CATEGORY_COLOR = {
  SITEWORK:   "#a78bfa",   // violet
  FOUNDATION: "#f59e0b",   // amber
  STRUCTURE:  "#3b82f6",   // blue
  MEP:        "#ec4899",   // pink/magenta
  ENCLOSURE:  "#14b8a6",   // teal
  FINISHES:   "#2ed573",   // green
  CLOSEOUT:   "#00d4ff",   // accent cyan
};

/* ─── Date utilities ─── */
function addWeeks(date, weeks) {
  const d = new Date(date);
  d.setDate(d.getDate() + Math.round(weeks * 7));
  return d;
}
function weeksBetween(a, b) {
  return (b - a) / (7 * 24 * 60 * 60 * 1000);
}
function fmtDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDateFull(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
const fmtCost = (v) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString()}`;
};

/* ─── Industry-standard CPM phase cost percentages (14 phases, sums to 100) ─── */
const PHASE_COST_PCT = [
  3,   // Permitting & Site Prep
  4,   // Excavation & Grading
  10,  // Foundation
  14,  // Structural Framing
  7,   // Roofing & Sheathing
  4,   // Exterior Sheathing & Wrap
  13,  // Rough MEP
  4,   // Insulation
  6,   // Drywall
  8,   // Exterior Cladding & Siding
  6,   // Interior Finish Carpentry
  5,   // Paint & Interior Finish
  10,  // Fixtures, Trim & Final MEP
  6,   // Final Inspection & Punch List
];

/* ─── Material cost multipliers relative to each layer's baseline option ─── */
// Derived from MATERIALS_DATA cost ratios so upgrades shift costs proportionally
const MATERIAL_MULTIPLIERS = [
  [1.00, 1.18],                    // Layer 0 — Foundation: Slab, Pier & Beam
  [1.00, 1.17, 1.29, 1.08],        // Layer 1 — Framing: Wood, Steel, LVL, CMU
  [1.00, 1.56, 2.44],              // Layer 2 — Sheathing: OSB, ZIP, SIP
  [1.00, 1.83, 2.83],              // Layer 3 — Insulation: Fiberglass, Open-Cell, Closed-Cell
  [1.00, 1.14, 1.36],              // Layer 4 — Drywall: Standard, MR, Acoustic
  [1.00, 1.50, 2.38, 3.25],        // Layer 5 — Cladding: Vinyl, Fiber Cement, Brick, Stone
  [1.00, 1.57, 1.14, 0.79],        // Layer 6 — Roof: Gable-Asphalt, Metal, Hip-Asphalt, TPO
  [1.00],                          // Layer 7 — Color Palette: no cost impact
];

function getMaterialMultiplier(layerIdx, materials) {
  const matIdx = materials?.[layerIdx]?.materialIndex ?? 0;
  return MATERIAL_MULTIPLIERS[layerIdx]?.[matIdx] ?? 1.0;
}

/* ─── Build schedule from project layer materials ─── */
function buildSchedule(startDate, materials, durationOverrides = {}, totalSF = 2200, stories = 1) {
  // SF-based construction cost: $185/SF baseline, +12% per additional story
  const storyMult = 1 + Math.max(0, stories - 1) * 0.12;
  const totalBuildCost = Math.round(BUILD_COST_PSF * totalSF * storyMult);

  let cursor = new Date(startDate);
  return LAYER_PHASE_CONFIG.map((cfg, i) => {
    const phId = i + 1;
    const mat = cfg.layerIdx != null ? materials?.[cfg.layerIdx] : null;
    const dur = durationOverrides[phId] ?? cfg.durationWeeks;
    const start = new Date(cursor);
    const end = addWeeks(cursor, dur);
    cursor = new Date(end);
    let status;
    if (TODAY >= end) status = "complete";
    else if (TODAY >= start) status = "active";
    else status = "planned";

    // Phase cost = % slice of total build cost × material upgrade multiplier (if applicable)
    const matMult = cfg.layerIdx != null ? getMaterialMultiplier(cfg.layerIdx, materials) : 1.0;
    const cost = Math.round(totalBuildCost * (PHASE_COST_PCT[i] / 100) * matMult);

    return {
      id: phId,
      name: cfg.name,
      category: cfg.category,
      layerColor: cfg.layerIdx != null ? MATERIALS_DATA[cfg.layerIdx]?.color ?? null : null,
      material: mat?.material || "—",
      cost,
      durationWeeks: dur,
      configDurationWeeks: cfg.durationWeeks,
      startDate: start,
      endDate: end,
      status,
    };
  });
}

/* ─── Status helpers ─── */
const phaseColor    = (s) => s === "complete" ? colors.success : s === "active" ? colors.accent : colors.textDim;
const phaseColorDim = (s) => s === "complete" ? colors.successDim : s === "active" ? colors.accentDim : "rgba(90,101,128,0.15)";

/* ─── Buildability / Progress Gauge ─── */
function ProgressGauge({ score = 0, size = 100 }) {
  const sw     = size * 0.08;
  const r      = (size - sw) / 2;
  const circ   = 2 * Math.PI * r;
  const pct    = Math.max(0, Math.min(100, score));
  const dashOff = circ * (1 - pct / 100);
  const c = pct < 40 ? colors.danger : pct < 60 ? colors.warn : pct < 80 ? colors.accent : colors.success;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={colors.cardBorder} strokeWidth={sw} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={sw}
            strokeDasharray={circ} strokeDashoffset={dashOff} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: fonts.data, fontSize: size * 0.24, fontWeight: 700, color: c, lineHeight: 1 }}>{pct}%</span>
        </div>
      </div>
      <span style={{ fontFamily: fonts.label, fontSize: 10, color: colors.textDim }}>Overall Progress</span>
    </div>
  );
}

/* ─── Export PDF: opens a print-ready HTML window — use browser Print → Save as PDF ─── */
function exportGanttPDF({ schedule, projectStart, totalWeeks, projectName, startDateStr, totalSF, stories, totalCost, completionDate, overallPct, bc }) {
  const CATEGORY_COLORS_HEX = {
    SITEWORK: "#7c3aed", FOUNDATION: "#d97706", STRUCTURE: "#2563eb",
    MEP: "#db2777", ENCLOSURE: "#0d9488", FINISHES: "#16a34a", CLOSEOUT: "#0891b2",
  };
  const fmtD = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtShort = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmtC = (v) => v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${Math.round(v)}`;
  const doneCount = schedule.filter(p => p.status === "complete").length;
  const activePhase = schedule.find(p => p.status === "active");
  const costPerSF = totalSF > 0 ? Math.round(totalCost / totalSF) : 0;

  // ── Gantt SVG ──
  const BAR_LEFT = 260;
  const BAR_W    = 500;
  const ROW_H    = 22;
  const COL_H    = 18;
  const LEG_H    = 22;
  const ganttH   = COL_H + LEG_H + schedule.length * ROW_H + 20;
  const todayX   = totalWeeks > 0 ? BAR_LEFT + Math.min(1, weeksBetween(projectStart, TODAY) / totalWeeks) * BAR_W : -999;

  const rows = schedule.map((ph, i) => {
    const sw  = weeksBetween(projectStart, ph.startDate);
    const lx  = BAR_LEFT + (totalWeeks > 0 ? (sw / totalWeeks) * BAR_W : 0);
    const bw  = Math.max(4, totalWeeks > 0 ? (ph.durationWeeks / totalWeeks) * BAR_W : 0);
    const col = CATEGORY_COLORS_HEX[ph.category] ?? "#64748b";
    const y   = COL_H + LEG_H + i * ROW_H;
    const op  = ph.status === "planned" ? 0.4 : ph.status === "complete" ? 0.65 : 1;
    const fg  = ph.status === "complete" ? "#64748b" : ph.status === "active" ? "#0369a1" : "#1e293b";
    const mark = ph.status === "complete" ? "\u2713" : ph.status === "active" ? "\u25b6" : "\u00b7";
    const markColor = ph.status === "complete" ? "#16a34a" : ph.status === "active" ? "#0891b2" : "#94a3b8";
    const rowBg = i % 2 === 0 ? "#f8fafc" : "#f1f5f9";
    const fontWeight = ph.status === "active" ? "700" : "400";
    return `
      <rect x="0" y="${y}" width="820" height="${ROW_H}" fill="${rowBg}" />
      <text x="10" y="${y+14}" font-size="8" fill="#94a3b8" font-family="monospace">A${String(ph.id).padStart(2,"0")}</text>
      <text x="26" y="${y+14}" font-size="9" fill="${markColor}" font-family="monospace">${mark}</text>
      <text x="40" y="${y+14}" font-size="9" fill="${fg}" font-family="Arial,sans-serif" font-weight="${fontWeight}">${ph.name}</text>
      <text x="${BAR_LEFT-6}" y="${y+14}" font-size="8" fill="#64748b" text-anchor="end" font-family="monospace">${ph.durationWeeks}w</text>
      <rect x="${lx}" y="${y+4}" width="${bw}" height="${ROW_H-8}" rx="2" fill="${col}" opacity="${op}" />
      ${ph.status==="active" ? `<rect x="${lx}" y="${y+4}" width="${Math.max(2,bw*0.35)}" height="${ROW_H-8}" rx="2" fill="${col}" opacity="1" />` : ""}
      <text x="${BAR_LEFT+BAR_W+8}" y="${y+14}" font-size="7.5" fill="#64748b" font-family="monospace">${fmtShort(ph.startDate)}–${fmtShort(ph.endDate)}</text>
      ${ph.cost > 0 ? `<text x="820" y="${y+14}" font-size="8" fill="#475569" text-anchor="end" font-family="monospace">${fmtC(ph.cost)}</text>` : ""}
    `;
  }).join("");

  const legendItems = Object.entries(CATEGORY_COLORS_HEX).map(([cat, col], i) =>
    `<rect x="${BAR_LEFT + i*72}" y="5" width="8" height="8" rx="1" fill="${col}" />
     <text x="${BAR_LEFT + i*72 + 11}" y="13" font-size="7.5" fill="#475569" font-family="Arial,sans-serif">${cat}</text>`
  ).join("");

  const ganttSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="${ganttH}" font-family="Arial,sans-serif">
  <rect width="820" height="${ganttH}" fill="#f8fafc" rx="4"/>
  <!-- Column headers -->
  <rect x="0" y="0" width="820" height="${COL_H}" fill="#e2e8f0"/>
  <text x="10" y="13" font-size="7.5" fill="#64748b" font-family="monospace">ID</text>
  <text x="40" y="13" font-size="7.5" fill="#475569" font-family="Arial,sans-serif" font-weight="600">ACTIVITY</text>
  <text x="${BAR_LEFT-6}" y="13" font-size="7.5" fill="#64748b" text-anchor="end" font-family="monospace">DUR</text>
  <text x="${BAR_LEFT+BAR_W/2}" y="13" font-size="7.5" fill="#475569" text-anchor="middle" font-family="monospace">${fmtShort(projectStart)} ──── GANTT TIMELINE ──── ${completionDate ? fmtShort(completionDate) : ""}</text>
  <text x="${BAR_LEFT+BAR_W+8}" y="13" font-size="7.5" fill="#64748b" font-family="monospace">DATES</text>
  <text x="820" y="13" font-size="7.5" fill="#64748b" text-anchor="end" font-family="monospace">COST</text>
  <!-- Legend -->
  <rect x="0" y="${COL_H}" width="820" height="${LEG_H}" fill="#f1f5f9"/>
  ${legendItems}
  <!-- Rows -->
  ${rows}
  <!-- Today line -->
  <line x1="${todayX}" y1="${COL_H}" x2="${todayX}" y2="${COL_H+LEG_H+schedule.length*ROW_H}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3,2"/>
  <text x="${todayX}" y="${COL_H+LEG_H+schedule.length*ROW_H+12}" font-size="7" fill="#b45309" text-anchor="middle" font-family="monospace">TODAY</text>
</svg>`;

  // ── Phase table rows ──
  const tableRows = schedule.map((ph, i) => {
    const statusLabel = ph.status === "complete" ? "Complete" : ph.status === "active" ? "In Progress" : "Planned";
    const statusBg = ph.status === "complete" ? "#dcfce7" : ph.status === "active" ? "#dbeafe" : "#f1f5f9";
    const statusFg = ph.status === "complete" ? "#15803d" : ph.status === "active" ? "#1d4ed8" : "#64748b";
    const trBg = i % 2 === 0 ? "#fff" : "#f8fafc";
    const nameFw = ph.status === "active" ? "600" : "400";
    return `<tr style="background:${trBg}">
      <td style="padding:5px 8px;font-family:monospace;font-size:9pt;color:#94a3b8">A${String(ph.id).padStart(2,"0")}</td>
      <td style="padding:5px 8px;font-size:9pt;color:#1e293b;font-weight:${nameFw}">${ph.name}</td>
      <td style="padding:5px 8px;font-size:9pt;color:#475569">
        <span style="display:inline-block;padding:1px 6px;border-radius:3px;background:${CATEGORY_COLORS_HEX[ph.category]}22;color:${CATEGORY_COLORS_HEX[ph.category]};font-size:8pt;font-weight:600">${ph.category}</span>
      </td>
      <td style="padding:5px 8px;font-family:monospace;font-size:9pt;color:#475569;text-align:center">${ph.durationWeeks}w</td>
      <td style="padding:5px 8px;font-family:monospace;font-size:9pt;color:#0f172a;text-align:right">${ph.cost > 0 ? fmtC(ph.cost) : "—"}</td>
      <td style="padding:5px 8px;font-family:monospace;font-size:9pt;color:#475569">${fmtD(ph.startDate)}</td>
      <td style="padding:5px 8px;font-family:monospace;font-size:9pt;color:#475569">${fmtD(ph.endDate)}</td>
      <td style="padding:5px 8px;font-size:9pt;text-align:center">
        <span style="display:inline-block;padding:1px 7px;border-radius:10px;background:${statusBg};color:${statusFg};font-size:8pt;font-weight:600">${statusLabel}</span>
      </td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${projectName} — Construction Schedule</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #1e293b; background: #fff; }
    @page { size: landscape; margin: 14mm 12mm; }
    @media print { .no-print { display: none; } }
    h1 { font-size: 18pt; font-weight: 700; color: #0f172a; }
    h2 { font-size: 11pt; font-weight: 600; color: #334155; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #0f172a; }
    .header-left h1 { margin-bottom: 4px; }
    .header-left p { font-size: 9pt; color: #64748b; margin-top: 2px; }
    .header-right { text-align: right; font-size: 8.5pt; color: #64748b; }
    .metrics { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 14px; }
    .metric { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
    .metric .label { font-size: 7.5pt; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
    .metric .value { font-size: 13pt; font-weight: 700; color: #0f172a; font-family: monospace; }
    .metric .sub { font-size: 7.5pt; color: #64748b; margin-top: 2px; }
    .building { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
    .building-item { font-size: 8.5pt; color: #475569; }
    .building-item strong { color: #1e293b; }
    .gantt-wrap { margin-bottom: 14px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    thead tr { background: #0f172a; }
    thead th { padding: 6px 8px; text-align: left; font-size: 8pt; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
    thead th:last-child, thead th:nth-child(5) { text-align: center; }
    tbody tr:hover { background: #eff6ff !important; }
    .footer { margin-top: 14px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 7.5pt; color: #94a3b8; }
    .print-btn { position: fixed; top: 16px; right: 16px; padding: 8px 18px; background: #0f172a; color: #fff; border: none; border-radius: 6px; font-size: 11pt; font-weight: 600; cursor: pointer; z-index: 999; }
  </style>
</head>
<body>
  <button class="no-print print-btn" onclick="window.print()">⬇ Save as PDF</button>

  <div class="header">
    <div class="header-left">
      <h1>${projectName}</h1>
      <p>Construction Schedule &amp; Project Summary &nbsp;·&nbsp; Dallas, TX</p>
      <p>${stories} ${stories === 1 ? "Story" : "Stories"} &nbsp;·&nbsp; ${totalSF.toLocaleString()} SF &nbsp;·&nbsp; ${bc.foundation_type ? bc.foundation_type.replace(/_/g, " ") : "—"} foundation &nbsp;·&nbsp; ${bc.framing_material || "—"} framing</p>
    </div>
    <div class="header-right">
      <div style="font-size:9pt;font-weight:700;color:#0f172a;margin-bottom:4px">VISION AI PLATFORM</div>
      <div>Generated: ${fmtD(new Date())}</div>
      <div>Report Type: CPM Construction Schedule</div>
      <div>Market: Dallas–Fort Worth, TX</div>
    </div>
  </div>

  <div class="metrics">
    <div class="metric">
      <div class="label">Start Date</div>
      <div class="value" style="font-size:10pt">${fmtD(new Date(startDateStr))}</div>
    </div>
    <div class="metric">
      <div class="label">Completion</div>
      <div class="value" style="font-size:10pt">${completionDate ? fmtD(completionDate) : "—"}</div>
    </div>
    <div class="metric">
      <div class="label">Duration</div>
      <div class="value">${Math.round(totalWeeks)}<span style="font-size:9pt;font-weight:400"> wks</span></div>
    </div>
    <div class="metric">
      <div class="label">Est. Construction Cost</div>
      <div class="value" style="color:#0369a1">${fmtC(totalCost)}</div>
      <div class="sub">${fmtC(costPerSF)}/SF</div>
    </div>
    <div class="metric">
      <div class="label">Progress</div>
      <div class="value" style="color:${overallPct >= 80 ? "#15803d" : overallPct >= 40 ? "#0369a1" : "#b45309"}">${overallPct}%</div>
      <div class="sub">${doneCount} of ${schedule.length} phases done</div>
    </div>
    <div class="metric">
      <div class="label">Active Phase</div>
      <div class="value" style="font-size:8.5pt;font-weight:600;color:#1d4ed8">${activePhase ? activePhase.name : doneCount === schedule.length ? "Complete" : "Not Started"}</div>
      <div class="sub">${activePhase ? `Week ${Math.round(weeksBetween(projectStart, activePhase.startDate))} of ${Math.round(totalWeeks)}` : ""}</div>
    </div>
  </div>

  <h2>Gantt Chart</h2>
  <div class="gantt-wrap">${ganttSVG}</div>

  <h2>Phase Schedule</h2>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Activity</th>
        <th>Category</th>
        <th style="text-align:center">Dur</th>
        <th style="text-align:right">Cost</th>
        <th>Start</th>
        <th>Finish</th>
        <th style="text-align:center">Status</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
    <tfoot>
      <tr style="background:#0f172a">
        <td colspan="3" style="padding:6px 8px;font-size:8.5pt;font-weight:600;color:#94a3b8">TOTALS</td>
        <td style="padding:6px 8px;font-family:monospace;font-size:8.5pt;color:#94a3b8;text-align:center">${schedule.reduce((s,p)=>s+p.durationWeeks,0)}w</td>
        <td style="padding:6px 8px;font-family:monospace;font-size:9pt;font-weight:700;color:#38bdf8;text-align:right">${fmtC(totalCost)}</td>
        <td colspan="3" style="padding:6px 8px;font-size:8pt;color:#64748b">${doneCount} complete · ${schedule.filter(p=>p.status==="active").length} active · ${schedule.filter(p=>p.status==="planned").length} planned</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <span>ADVISORY ONLY — Not a licensed engineering or construction management document. All schedules are estimates. Verify all timelines with a qualified general contractor and construction manager before proceeding.</span>
    <span>© Vision AI Platform · Dallas, TX · Page 1 of 1</span>
  </div>

  <script>window.onload = () => window.print();<\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) { alert("Please allow pop-ups for this site to export the PDF."); return; }
  win.document.write(html);
  win.document.close();
}

/* ─── Main Component ─── */
function ScheduleTimelineInner() {
  const project        = useProject();
  const canvasRef      = useRef(null);
  const sceneRef       = useRef(null);
  const layerGroupsRef = useRef([]);
  const matsRef        = useRef(null);
  const controlsRef    = useRef(null);
  const animFrameRef   = useRef(null);
  const disposedRef    = useRef(false);

  // Restore from saved schedule if available
  const saved = project.savedSchedule;

  const [startDateStr, setStartDateStr] = useState(
    () => saved?.startDate || TODAY.toISOString().slice(0, 10)
  );
  const [timeSlider,   setTimeSlider]   = useState(1);
  const [saving,       setSaving]       = useState(false);
  const [saveStatus,   setSaveStatus]   = useState(null);
  // manualDone: Set of phase IDs manually marked complete by the user
  const [manualDone,   setManualDone]   = useState(
    () => new Set(saved?.manualDone || [])
  );
  const [durationOverrides, setDurationOverrides] = useState(
    () => saved?.durationOverrides || {}
  );
  const [editingPhaseId, setEditingPhaseId] = useState(null);
  const [editingValue,   setEditingValue]   = useState("");
  const [phaseNotes,     setPhaseNotes]     = useState(
    () => saved?.phaseNotes || {}
  );
  const [noteOpenId,     setNoteOpenId]     = useState(null);
  const [noteDraft,      setNoteDraft]      = useState("");

  const projectName = project.projectName || "New Project";
  const stories     = project.stories     || 1;
  const totalSF     = project.totalSF     || 2200;

  const bc = project.buildingContext || {};

  const scheduleBase = useMemo(
    () => buildSchedule(new Date(startDateStr), project.materials, durationOverrides, totalSF, stories),
    [startDateStr, project.materials, durationOverrides, totalSF, stories],
  );
  // Apply manual overrides on top of date-derived status
  const schedule = useMemo(() => {
    // Pass 1: apply manual done overrides
    const withDone = scheduleBase.map(ph =>
      manualDone.has(ph.id) ? { ...ph, status: "complete" } : ph
    );
    // Pass 2: ensure the first non-complete phase is "active", not "planned"
    let promoted = false;
    return withDone.map(ph => {
      if (!promoted && ph.status !== "complete") {
        promoted = true;
        return ph.status === "planned" ? { ...ph, status: "active" } : ph;
      }
      return ph;
    });
  }, [scheduleBase, manualDone]);

  const toggleManualDone = useCallback((phId) => {
    setManualDone(prev => {
      const next = new Set(prev);
      if (next.has(phId)) next.delete(phId); else next.add(phId);
      return next;
    });
  }, []);

  const startEditDuration = useCallback((ph) => {
    setEditingPhaseId(ph.id);
    setEditingValue(String(ph.durationWeeks));
  }, []);

  const commitEditDuration = useCallback((phId) => {
    const val = parseInt(editingValue, 10);
    if (!isNaN(val) && val >= 1 && val <= 52) {
      const configDur = LAYER_PHASE_CONFIG[phId - 1].durationWeeks;
      setDurationOverrides(prev => {
        const next = { ...prev };
        if (val === configDur) { delete next[phId]; } else { next[phId] = val; }
        return next;
      });
    }
    setEditingPhaseId(null);
    setEditingValue("");
  }, [editingValue]);

  const resetDurationOverrides = useCallback(() => {
    setDurationOverrides({});
  }, []);

  const openNote = useCallback((ph) => {
    if (noteOpenId === ph.id) {
      setNoteOpenId(null);
      setNoteDraft("");
    } else {
      setNoteOpenId(ph.id);
      setNoteDraft(phaseNotes[ph.id] || "");
    }
  }, [noteOpenId, phaseNotes]);

  const saveNote = useCallback((phId) => {
    setPhaseNotes(prev => {
      const next = { ...prev };
      if (noteDraft.trim()) { next[phId] = noteDraft.trim(); }
      else { delete next[phId]; }
      return next;
    });
    setNoteOpenId(null);
    setNoteDraft("");
  }, [noteDraft]);

  const clearNote = useCallback((phId) => {
    setPhaseNotes(prev => { const n = { ...prev }; delete n[phId]; return n; });
    setNoteOpenId(null);
    setNoteDraft("");
  }, []);
  const projectStart   = useMemo(() => schedule[0]?.startDate ?? TODAY, [schedule]);
  const completionDate = useMemo(() => schedule[schedule.length - 1]?.endDate, [schedule]);
  const totalWeeks     = useMemo(
    () => completionDate ? weeksBetween(projectStart, completionDate) : 0,
    [projectStart, completionDate],
  );

  // Today position in weeks from project start
  const todayWeek = useMemo(
    () => Math.max(0, Math.min(totalWeeks, weeksBetween(projectStart, TODAY))),
    [projectStart, totalWeeks],
  );

  const activePhase     = schedule.find((p) => p.status === "active");
  const completedPhases = schedule.filter((p) => p.status === "complete");
  const totalCost       = schedule.reduce((s, p) => s + p.cost, 0);
  const activeFrac      = activePhase && activePhase.durationWeeks > 0
    ? Math.min(1, Math.max(0, weeksBetween(activePhase.startDate, TODAY)) / activePhase.durationWeeks)
    : 0;
  const cumulativeCost  = completedPhases.reduce((s, p) => s + p.cost, 0)
    + (activePhase ? activePhase.cost * activeFrac : 0);
  const totalDur   = schedule.reduce((s, p) => s + p.durationWeeks, 0);
  const doneDur    = completedPhases.reduce((s, p) => s + p.durationWeeks, 0)
                   + (activePhase ? activePhase.durationWeeks * activeFrac : 0);
  const overallPct = totalDur > 0 ? Math.min(100, Math.round((doneDur / totalDur) * 100)) : 0;

  const sliderDate = useMemo(() => fmtDate(addWeeks(projectStart, timeSlider)), [projectStart, timeSlider]);
  const sliderPhase = useMemo(() => {
    return schedule.find((p) => {
      const sw = weeksBetween(projectStart, p.startDate);
      const ew = weeksBetween(projectStart, p.endDate);
      return timeSlider >= sw && timeSlider < ew;
    })?.name ?? (timeSlider >= totalWeeks ? "Complete" : schedule[0]?.name ?? "");
  }, [timeSlider, schedule, projectStart, totalWeeks]);

  // Fetch schedule from MongoDB on mount so notes/overrides/done persist per-project across reloads
  useEffect(() => {
    if (!project.projectId) return;
    projectsApi.get(project.projectId)
      .then((doc) => {
        // Restore schedule fields (notes, overrides, manual done)
        const s = doc?.schedule;
        if (s) {
          if (s.startDate)         setStartDateStr(s.startDate);
          if (s.manualDone)        setManualDone(new Set(s.manualDone));
          if (s.durationOverrides) setDurationOverrides(s.durationOverrides);
          if (s.phaseNotes)        setPhaseNotes(s.phaseNotes);
          project.setSavedSchedule(s);
        }
        // Sync floor plan + materials so "View Client's Model" renders the correct project
        if (doc?.story_plans?.length > 0) project.setStoryPlans(doc.story_plans);
        else if (doc?.floor_plan)          project.setFloorPlan(doc.floor_plan);
        if (doc?.materials?.length > 0)    project.setMaterials(doc.materials);
      })
      .catch(() => { /* network unavailable — silently keep existing state */ });
  }, [project.projectId]); // eslint-disable-line

  // Re-init slider to today when start date changes
  useEffect(() => {
    setTimeSlider(Math.max(0.5, Math.min(totalWeeks || 1, todayWeek || 1)));
  }, [startDateStr]); // eslint-disable-line

  /* ─── Three.js Init: Full LayerEditor Model ─── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    disposedRef.current = false;

    updateDims(project.footprintWidth, project.footprintDepth);
    updateRooms(project.floorPlan?.rooms, project.storyPlans);

    const { renderer, scene, camera } = buildScene(canvas);
    const mats = createLayerMaterials();
    matsRef.current = mats;
    setupLighting(scene);

    const foundationType = project.materials?.[0]?.materialIndex ?? 0;
    const roofType = project.materials?.[7]?.materialIndex ?? 0;
    const layerGroups = rebuildLayerGroups(scene, mats, foundationType, roofType);
    layerGroupsRef.current = layerGroups;

    // Apply user-selected materials for non-foundation/roof layers
    (project.materials || []).forEach((m, i) => {
      if (i === 0 || i === 7 || i >= 8 || !m) return;
      const matKey = MATERIAL_KEY_MAP[i]?.[m.materialIndex ?? 0];
      if (matKey && mats[matKey] && layerGroups[i]) {
        layerGroups[i].traverse((child) => {
          if (child.isMesh) child.material = mats[matKey];
        });
      }
    });

    // Apply custom paint colors (wall color on paint layer 6, roof color on roof layer 7)
    const wallColor = (project.materials || [])[6]?.wallColor;
    const roofColor = (project.materials || [])[7]?.roofColor;
    if (wallColor && layerGroups[6]) {
      const wc = new THREE.Color(wallColor);
      layerGroups[6].traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.material.color = wc;
          child.material.needsUpdate = true;
        }
      });
    }
    if (roofColor && layerGroups[7]) {
      const rc = new THREE.Color(roofColor);
      layerGroups[7].traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.material.color = rc;
          child.material.needsUpdate = true;
        }
      });
    }

    // Clone materials so per-layer opacity changes don't bleed across layers
    layerGroups.forEach(g => {
      if (!g) return;
      g.traverse(child => {
        if (child.isMesh && child.material) child.material = child.material.clone();
      });
    });

    // Initially hide all layers (schedule slider reveals them)
    layerGroups.forEach(g => { if (g) g.visible = false; });

    const controls = createOrbitControls(camera, canvas);
    controlsRef.current = controls;
    sceneRef.current = { renderer, scene, camera };

    const resize = () => {
      if (disposedRef.current) return;
      const p = canvas.parentElement;
      if (!p) return;
      renderer.setSize(p.clientWidth, p.clientHeight);
      camera.aspect = p.clientWidth / p.clientHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    const animate = () => {
      if (disposedRef.current) return;
      animFrameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposedRef.current = true;
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animFrameRef.current);
      controls.dispose();
      renderer.dispose();
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line

  /* ─── Sync layer visibility with timeline slider ─── */
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups || groups.length === 0) return;

    LAYER_PHASE_CONFIG.forEach((cfg, phaseIdx) => {
      const phase = schedule[phaseIdx];
      // Skip phases with no direct 3D layer (permits, MEP, carpentry, etc.)
      if (!phase || cfg.layerIdx == null || !groups[cfg.layerIdx]) return;

      const phaseStartWeek = weeksBetween(projectStart, phase.startDate);
      const phaseEndWeek = weeksBetween(projectStart, phase.endDate);

      if (timeSlider >= phaseEndWeek) {
        groups[cfg.layerIdx].visible = true;
        groups[cfg.layerIdx].traverse(child => {
          if (child.isMesh && child.material) {
            child.material.transparent = false;
            child.material.opacity = 1;
            child.material.needsUpdate = true;
          }
        });
      } else if (timeSlider >= phaseStartWeek) {
        groups[cfg.layerIdx].visible = true;
        const span = phaseEndWeek - phaseStartWeek;
        const progress = span > 0 ? (timeSlider - phaseStartWeek) / span : 1;
        groups[cfg.layerIdx].traverse(child => {
          if (child.isMesh && child.material) {
            child.material.transparent = true;
            child.material.opacity = 0.3 + progress * 0.7;
            child.material.needsUpdate = true;
          }
        });
      } else {
        groups[cfg.layerIdx].visible = false;
      }
    });
  }, [timeSlider, schedule, projectStart]);

  const handleSave = useCallback(async () => {
    setSaving(true); setSaveStatus(null);
    try {
      const schedulePayload = {
        startDate: startDateStr,
        totalWeeks,
        manualDone: [...manualDone],
        durationOverrides,
        phaseNotes,
        phases: schedule.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          material: p.material,
          cost: p.cost,
          durationWeeks: p.durationWeeks,
          startDate: p.startDate.toISOString(),
          endDate: p.endDate.toISOString(),
          status: p.status,
        })),
      };

      const payload = {
        name: projectName,
        schedule: schedulePayload,
        ...(project.materials?.length > 0 && { materials: project.materials }),
        ...(project.buildingContext && { building_context: project.buildingContext }),
      };

      let saved;
      if (project.projectId) {
        saved = await projectsApi.update(project.projectId, payload);
      } else {
        saved = await projectsApi.create({ ...payload, notes: "" });
      }
      if (saved?.id) project.setProjectId(saved.id);

      // Persist in store so navigating away and back restores state
      project.setSavedSchedule(schedulePayload);

      setSaveStatus("ok"); setTimeout(() => setSaveStatus(null), 2500);
    } catch (_) { setSaveStatus("err"); setTimeout(() => setSaveStatus(null), 2500); }
    finally { setSaving(false); }
  }, [projectName, project, schedule, startDateStr, totalWeeks, manualDone, durationOverrides, phaseNotes]);

  // Slider track styles
  useEffect(() => {
    const id = "vn-tl-slider";
    if (document.getElementById(id)) return;
    const s = document.createElement("style"); s.id = id;
    s.textContent = `
      input[type="range"].tl-slider{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:2px;outline:none;cursor:pointer}
      input[type="range"].tl-slider::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:${colors.accent};border:2px solid ${colors.bg};cursor:pointer}
      input[type="range"].tl-slider::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:${colors.accent};border:none;cursor:pointer}
      input[type="range"].tl-slider::-moz-range-track{height:4px;border-radius:2px;background:${colors.panelBorder}}
    `;
    document.head.appendChild(s);
  }, []);

  const navigate  = useNavigate();
  const sliderPct = totalWeeks > 0 ? (timeSlider / totalWeeks) * 100 : 0;
  const sliderBg  = `linear-gradient(to right,${colors.accent} 0%,${colors.accent} ${sliderPct}%,${colors.panelBorder} ${sliderPct}%,${colors.panelBorder} 100%)`;

  return (
    <div style={{ height: "100%", background: colors.bgGradient, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ padding: "14px 20px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src="/VisionLogo.png" alt="Vision" style={{ height: 22, width: "auto", objectFit: "contain", display: "block" }} />
              <h1 style={{ fontFamily: fonts.label, fontSize: 20, fontWeight: 700, color: colors.textBright, margin: 0 }}>
                Construction Schedule
              </h1>
              <StatusBadge
                status={activePhase ? "active" : completedPhases.length === schedule.length ? "complete" : "planned"}
                size="lg"
              />
            </div>
            <p style={{ fontFamily: fonts.label, fontSize: 12, color: colors.textDim, margin: "3px 0 0" }}>
              {projectName} · {stories} {stories === 1 ? "Story" : "Stories"} · {totalSF.toLocaleString()} SF
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
            {/* Project start date picker */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.6px" }}>
                Start Date
              </span>
              <input
                type="date"
                value={startDateStr}
                onChange={(e) => e.target.value && setStartDateStr(e.target.value)}
                style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 6, color: colors.text, fontFamily: fonts.data, fontSize: 11, padding: "4px 8px", outline: "none", cursor: "pointer" }}
              />
            </div>
            {/* Estimated completion */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.6px" }}>
                Est. Completion
              </span>
              <span style={{ fontFamily: fonts.data, fontSize: 12, fontWeight: 700, color: colors.success, padding: "4px 10px", background: colors.successDim, borderRadius: 6, border: "1px solid rgba(46,213,115,0.3)", whiteSpace: "nowrap" }}>
                {completionDate ? fmtDateFull(completionDate) : "—"}
              </span>
            </div>
            <button
              onClick={() => navigate("/preview3d")}
              title="View client's 3D model"
              style={{
                padding: "5px 14px", borderRadius: 6, fontFamily: fonts.label, fontSize: 12, fontWeight: 600,
                cursor: "pointer", transition: "all 0.2s ease", flexShrink: 0,
                background: "linear-gradient(135deg,#0891b2,#0e7490)",
                border: "1px solid rgba(8,145,178,0.5)",
                color: "#fff", display: "flex", alignItems: "center", gap: 5,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L11 4v4L6 11 1 8V4L6 1Z" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" fill="none"/>
                <path d="M6 1v10M1 4l5 3 5-3" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" opacity="0.7"/>
              </svg>
              View Client's Model
            </button>
            <button
              onClick={() => exportGanttPDF({ schedule, projectStart, totalWeeks, projectName, startDateStr, totalSF, stories, totalCost, completionDate, overallPct, bc })}
              style={{
                padding: "5px 14px", borderRadius: 6, fontFamily: fonts.label, fontSize: 12, fontWeight: 600,
                cursor: "pointer", transition: "all 0.2s ease", flexShrink: 0,
                background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
                border: "1px solid rgba(139,92,246,0.5)",
                color: "#fff", display: "flex", alignItems: "center", gap: 5,
              }}
              title="Export construction schedule as PDF"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Export PDF
            </button>
            <button
              onClick={handleSave} disabled={saving}
              style={{
                padding: "5px 14px", borderRadius: 6, fontFamily: fonts.label, fontSize: 12, fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, transition: "all 0.2s ease", flexShrink: 0,
                background: saveStatus === "ok" ? colors.successDim : saveStatus === "err" ? colors.dangerDim : "linear-gradient(135deg,#2563eb,#1d4ed8)",
                border: `1px solid ${saveStatus === "ok" ? colors.success : saveStatus === "err" ? colors.danger : "transparent"}`,
                color: saveStatus === "ok" ? colors.success : saveStatus === "err" ? colors.danger : "#fff",
              }}
            >
              {saving ? "Saving…" : saveStatus === "ok" ? "✓ Saved" : saveStatus === "err" ? "Failed" : "Save"}
            </button>
          </div>
        </div>

        {/* Overall progress bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
          <span style={{ fontFamily: fonts.label, fontSize: 10, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.6px", flexShrink: 0 }}>Today</span>
          <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.accent, flexShrink: 0 }}>{fmtDateFull(TODAY)}</span>
          <div style={{ flex: 1, height: 4, background: colors.cardBorder, borderRadius: 2 }}>
            <div style={{ width: `${overallPct}%`, height: "100%", background: `linear-gradient(90deg,${colors.success},${colors.accent})`, borderRadius: 2, transition: "width 0.5s" }} />
          </div>
          <span style={{ fontFamily: fonts.data, fontSize: 11, fontWeight: 600, color: colors.accent, flexShrink: 0 }}>{overallPct}%</span>
          <span style={{ fontFamily: fonts.label, fontSize: 11, color: colors.textDim, flexShrink: 0 }}>
            {activePhase ? activePhase.name : completedPhases.length === schedule.length ? "Complete" : "Not Started"}
          </span>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", padding: "0 20px", gap: 16 }}>

        {/* Left — 3D Viewport */}
        <div style={{ flex: "0 0 55%", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ flex: 1, position: "relative", background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: radii.lg, overflow: "hidden" }}>
            <canvas
              ref={canvasRef}
              style={{ width: "100%", height: "100%", display: "block", cursor: "grab" }}
            />
            <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "center", gap: 8, background: "rgba(15,20,32,0.88)", padding: "6px 12px", borderRadius: radii.md, border: `1px solid ${colors.panelBorder}` }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors.accent }} />
              <span style={{ fontFamily: fonts.label, fontSize: 11, color: colors.accent, fontWeight: 600 }}>{sliderPhase}</span>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>{sliderDate}</span>
            </div>
          </div>

          {/* Metric cards */}
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <div style={{ ...card, flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px" }}>Total Duration</span>
              <span style={{ fontFamily: fonts.data, fontSize: 20, fontWeight: 700, color: colors.textBright, lineHeight: 1.2 }}>{Math.round(totalWeeks)} wks</span>
              <span style={{ fontFamily: fonts.label, fontSize: 10, color: colors.textDim }}>≈ {Math.round(totalWeeks * 7 / 30)} months</span>
            </div>
            <div style={{ ...card, flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px" }}>Phases Done</span>
              <span style={{ fontFamily: fonts.data, fontSize: 20, fontWeight: 700, color: colors.textBright, lineHeight: 1.2 }}>
                {completedPhases.length}<span style={{ fontSize: 13, color: colors.textDim }}>/{schedule.length}</span>
              </span>
              <span style={{ fontFamily: fonts.label, fontSize: 10, color: colors.success }}>Complete</span>
            </div>
          </div>
        </div>

        {/* Right — Intelligence Panel */}
        <div style={{ flex: "0 0 45%", display: "flex", flexDirection: "column", gap: 10, overflow: "auto", paddingBottom: 8 }}>
          {/* Cost summary */}
          <div style={{ ...card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 4 }}>
                  Est. Construction Cost
                </span>
                <span style={{ fontFamily: fonts.data, fontSize: 26, fontWeight: 700, color: colors.textBright, lineHeight: 1 }}>
                  {fmtCost(totalCost)}
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 4 }}>
                  Spent to Date
                </span>
                <span style={{ fontFamily: fonts.data, fontSize: 16, fontWeight: 700, color: colors.accent }}>
                  {fmtCost(Math.round(cumulativeCost))}
                </span>
              </div>
            </div>
          </div>

          {/* Progress gauge */}
          <div style={{ ...card, display: "flex", justifyContent: "center" }}>
            <ProgressGauge score={overallPct} size={100} />
          </div>

          {/* Phase × material list with mark-as-done checkboxes */}
          <div style={{ ...card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 10, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                Phase Schedule
              </span>
              <span style={{ fontFamily: fonts.data, fontSize: 9, color: colors.textDim }}>
                {schedule.filter(p => p.status === "complete").length}/{schedule.length} complete
              </span>
            </div>
            {schedule.map((ph) => {
              const catCol = ph.layerColor ?? CATEGORY_COLOR[ph.category] ?? colors.textDim;
              const isDone = ph.status === "complete";
              const isManual = manualDone.has(ph.id);
              return (
                <div key={ph.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: noteOpenId === ph.id ? 0 : 7, padding: "4px 6px", borderRadius: 6, background: isDone ? "rgba(46,213,115,0.04)" : "transparent", border: isDone ? "1px solid rgba(46,213,115,0.12)" : "1px solid transparent", transition: "all 0.2s" }}>
                  {/* Mark-done checkbox */}
                  <button
                    onClick={() => toggleManualDone(ph.id)}
                    title={isDone ? "Mark as not done" : "Mark as done"}
                    style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: "pointer",
                      border: `2px solid ${isDone ? colors.success : colors.cardBorder}`,
                      background: isDone ? colors.successDim : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s", padding: 0,
                    }}
                  >
                    {isDone && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke={colors.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                  {/* Category colour stripe */}
                  <div style={{ width: 3, height: 26, borderRadius: 2, flexShrink: 0, background: catCol, opacity: ph.status === "planned" ? 0.4 : 1 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontFamily: fonts.label, fontSize: 10, fontWeight: ph.status === "active" ? 600 : 400, color: isDone ? colors.textDim : ph.status === "active" ? colors.textBright : colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: isDone ? "line-through" : "none", textDecorationColor: colors.success }}>
                        {ph.name}
                      </span>
                      {isManual && (
                        <span style={{ fontFamily: fonts.data, fontSize: 7, color: colors.success, background: colors.successDim, padding: "1px 4px", borderRadius: 3, flexShrink: 0 }}>MANUAL</span>
                      )}
                      <span style={{ fontFamily: fonts.data, fontSize: 8, color: catCol, letterSpacing: "0.4px", flexShrink: 0, opacity: 0.8 }}>
                        {ph.category}
                      </span>
                    </div>
                    <span style={{ fontFamily: fonts.label, fontSize: 9, color: colors.textDim }}>
                      {ph.material !== "—" ? ph.material : `${ph.durationWeeks} wk${ph.durationWeeks !== 1 ? "s" : ""} · ${fmtDate(ph.startDate)}–${fmtDate(ph.endDate)}`}
                    </span>
                  </div>
                  {ph.cost > 0 && (
                    <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, flexShrink: 0 }}>{fmtCost(ph.cost)}</span>
                  )}
                  <StatusBadge status={ph.status} />
                  {/* Three-dot note button */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <button
                      onClick={() => openNote(ph)}
                      title={phaseNotes[ph.id] ? "View/edit delay note" : "Add delay note"}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: colors.textDim, display: "flex", alignItems: "center", gap: 2, borderRadius: 4, transition: "background 0.15s" }}
                    >
                      <span style={{ fontFamily: fonts.data, fontSize: 13, letterSpacing: 1, lineHeight: 1, color: noteOpenId === ph.id ? colors.accent : colors.textDim }}>⋯</span>
                      {phaseNotes[ph.id] && (
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: colors.warn, display: "inline-block", marginLeft: 1, flexShrink: 0 }} />
                      )}
                    </button>
                  </div>
                </div>
                {/* Inline note popover */}
                {noteOpenId === ph.id && (
                  <div style={{ margin: "0 0 7px 28px", padding: "10px 12px", borderRadius: "0 0 8px 8px", background: "rgba(20,24,36,0.97)", border: `1px solid ${colors.warn}44`, borderTop: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                      <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 700, color: colors.warn, textTransform: "uppercase", letterSpacing: "0.8px" }}>Delay Note</span>
                      <button onClick={() => { setNoteOpenId(null); setNoteDraft(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textDim, fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
                    </div>
                    <textarea
                      autoFocus
                      rows={3}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="e.g. Concrete delayed by rain — pushed 2 weeks…"
                      style={{ width: "100%", boxSizing: "border-box", fontFamily: fonts.label, fontSize: 10, color: colors.textBright, background: colors.cardBorder, border: `1px solid ${colors.panelBorder}`, borderRadius: 5, padding: "6px 8px", resize: "vertical", outline: "none", lineHeight: 1.5 }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 7 }}>
                      {phaseNotes[ph.id] && (
                        <button onClick={() => clearNote(ph.id)} style={{ fontFamily: fonts.label, fontSize: 9, color: colors.danger, background: "transparent", border: `1px solid ${colors.danger}44`, borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}>Clear</button>
                      )}
                      <button onClick={() => { setNoteOpenId(null); setNoteDraft(""); }} style={{ fontFamily: fonts.label, fontSize: 9, color: colors.textDim, background: "transparent", border: `1px solid ${colors.cardBorder}`, borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}>Cancel</button>
                      <button onClick={() => saveNote(ph.id)} style={{ fontFamily: fonts.label, fontSize: 9, color: "#000", background: colors.accent, border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontWeight: 600 }}>Save</button>
                    </div>
                  </div>
                )}
                </div>
              );
            })}
          </div>

          {/* Building Context Summary — handoff to Structural Intelligence */}
          <div style={{ ...card }}>
            <span style={{ fontFamily: fonts.label, fontSize: 10, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 10 }}>
              Structural Context
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Span", value: `${bc.span_ft || 24} ft` },
                { label: "Section", value: bc.section || "W14x22" },
                { label: "Dead Load", value: `${bc.dead_load_psf || 85} psf` },
                { label: "Live Load", value: `${bc.live_load_psf || 100} psf` },
                { label: "Snow Load", value: `${bc.snow_load_psf || 5} psf` },
                { label: "SCI Score", value: `${bc.sci_score || 6.2}` },
                { label: "Foundation", value: (bc.foundation_type || "slab_on_grade").replace(/_/g, " ") },
                { label: "Framing", value: bc.framing_material || "Wood SPF" },
              ].map((m) => (
                <div key={m.label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ fontFamily: fonts.label, fontSize: 10, color: colors.textDim }}>{m.label}</span>
                  <span style={{ fontFamily: fonts.data, fontSize: 11, fontWeight: 600, color: colors.textBright }}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom — Gantt Timeline ── */}
      <div style={{ ...card, margin: "8px 20px 12px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: fonts.label, fontSize: 11, fontWeight: 700, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px" }}>
              Timeline
            </span>
            {Object.keys(durationOverrides).length > 0 && (
              <button
                onClick={resetDurationOverrides}
                title="Reset all duration edits to original schedule"
                style={{ fontFamily: fonts.label, fontSize: 9, color: colors.warn, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4, padding: "2px 7px", cursor: "pointer", letterSpacing: "0.4px" }}
              >
                Reset Schedule Edits
              </button>
            )}
          </div>
          <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim }}>
            {fmtDateFull(projectStart)} → {completionDate ? fmtDateFull(completionDate) : "—"} · {Math.round(totalWeeks)} wks
          </span>
        </div>

        {/* Gantt header — category swim-lane labels */}
        <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
          {Object.entries(CATEGORY_COLOR).map(([cat, col]) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: col, opacity: 0.85 }} />
              <span style={{ fontFamily: fonts.label, fontSize: 9, color: colors.textDim, letterSpacing: "0.5px" }}>{cat}</span>
            </div>
          ))}
        </div>

        {/* Gantt rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {schedule.map((ph) => {
            const sw        = weeksBetween(projectStart, ph.startDate);
            const leftPct   = totalWeeks > 0 ? (sw / totalWeeks) * 100 : 0;
            const widthPct  = totalWeeks > 0 ? (ph.durationWeeks / totalWeeks) * 100 : 0;
            const todayPct  = totalWeeks > 0 ? Math.min(100, (todayWeek / totalWeeks) * 100) : 0;
            const barColor  = ph.layerColor ?? CATEGORY_COLOR[ph.category] ?? phaseColor(ph.status);
            const isDone    = ph.status === "complete";
            return (
              <div key={ph.id} style={{ display: "flex", alignItems: "center", gap: 6, height: 22 }}>
                {/* Checkbox */}
                <button
                  onClick={() => toggleManualDone(ph.id)}
                  style={{ width: 14, height: 14, flexShrink: 0, borderRadius: 3, border: `1.5px solid ${isDone ? colors.success : colors.cardBorder}`, background: isDone ? colors.successDim : "transparent", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
                  title={isDone ? "Mark undone" : "Mark done"}
                >
                  {isDone && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke={colors.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </button>
                {/* Activity ID */}
                <span style={{ fontFamily: fonts.data, fontSize: 9, color: colors.textDim, width: 20, flexShrink: 0, textAlign: "right" }}>
                  A{String(ph.id).padStart(2, "0")}
                </span>
                {/* Phase name */}
                <span style={{ fontFamily: fonts.label, fontSize: 10, width: 152, flexShrink: 0, color: isDone ? colors.textDim : ph.status === "active" ? colors.accent : colors.text, fontWeight: ph.status === "active" ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: isDone ? "line-through" : "none", textDecorationColor: colors.success }}>
                  {ph.name}
                </span>
                {/* Bar track */}
                <div style={{ flex: 1, position: "relative", height: 12, background: colors.cardBorder, borderRadius: 3 }}>
                  <div style={{
                    position: "absolute", left: `${leftPct}%`, width: `${widthPct}%`, height: "100%",
                    background: ph.status === "complete"
                      ? `linear-gradient(90deg,${barColor}88,${barColor}cc)`
                      : ph.status === "active"
                        ? `linear-gradient(90deg,${barColor},${barColor}dd)`
                        : barColor,
                    borderRadius: 3,
                    opacity: ph.status === "planned" ? 0.35 : ph.status === "complete" ? 0.65 : 1,
                    transition: "all 0.3s ease",
                  }} />
                  {/* TODAY marker */}
                  {todayWeek >= 0 && todayWeek <= totalWeeks && (
                    <div style={{ position: "absolute", left: `${todayPct}%`, top: -4, bottom: -4, width: 2, background: colors.warn, borderRadius: 1, opacity: 0.9, pointerEvents: "none" }} />
                  )}
                </div>
                {/* Duration — inline editable */}
                <div style={{ width: 54, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                  {editingPhaseId === ph.id ? (
                    <>
                      <input
                        type="number" min={1} max={52}
                        value={editingValue}
                        autoFocus
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={() => commitEditDuration(ph.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") commitEditDuration(ph.id); if (e.key === "Escape") { setEditingPhaseId(null); setEditingValue(""); } }}
                        style={{ width: 30, fontFamily: fonts.data, fontSize: 9, color: colors.textBright, background: colors.cardBorder, border: `1px solid ${colors.accent}`, borderRadius: 3, padding: "1px 3px", outline: "none", textAlign: "center" }}
                      />
                      <span style={{ fontFamily: fonts.data, fontSize: 9, color: colors.textDim }}>w</span>
                    </>
                  ) : (
                    <>
                      {ph.durationWeeks !== ph.configDurationWeeks && (
                        <span style={{ fontFamily: fonts.data, fontSize: 8, color: ph.durationWeeks > ph.configDurationWeeks ? colors.warn : colors.success, marginRight: 2 }}>
                          {ph.durationWeeks > ph.configDurationWeeks ? `+${ph.durationWeeks - ph.configDurationWeeks}` : `${ph.durationWeeks - ph.configDurationWeeks}`}
                        </span>
                      )}
                      <span style={{ fontFamily: fonts.data, fontSize: 9, color: ph.durationWeeks !== ph.configDurationWeeks ? colors.warn : colors.textDim }}>
                        {ph.durationWeeks}w
                      </span>
                      <button
                        onClick={() => startEditDuration(ph)}
                        title="Edit phase duration"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 0 2px", color: colors.textDim, display: "flex", alignItems: "center", opacity: 0.5, lineHeight: 1 }}
                      >
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                          <path d="M7 1L9 3L3 9H1V7L7 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </>
                  )}
                </div>
                {/* Date range */}
                <span style={{ fontFamily: fonts.data, fontSize: 9, color: colors.textDim, width: 90, flexShrink: 0, textAlign: "right", whiteSpace: "nowrap" }}>
                  {fmtDate(ph.startDate)}–{fmtDate(ph.endDate)}
                </span>
              </div>
            );
          })}

          {/* TODAY arrow label */}
          {totalWeeks > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 14, marginTop: 1 }}>
              <span style={{ width: 130, flexShrink: 0, fontFamily: fonts.data, fontSize: 8, color: colors.warn, fontWeight: 700 }}>
                TODAY · {fmtDate(TODAY)}
              </span>
              <div style={{ flex: 1, position: "relative", height: "100%" }}>
                <div style={{ position: "absolute", left: `${Math.min(100, (todayWeek / totalWeeks) * 100)}%`, transform: "translateX(-50%)", fontFamily: fonts.data, fontSize: 10, color: colors.warn, lineHeight: 1 }}>▲</div>
              </div>
              <span style={{ width: 86, flexShrink: 0 }} />
            </div>
          )}
        </div>

        {/* 3D scrubber */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.6px", width: 130, flexShrink: 0 }}>
            Scrub 3D View
          </span>
          <input
            type="range" className="tl-slider"
            min={0} max={totalWeeks || 19} step={0.25}
            value={timeSlider}
            onChange={(e) => setTimeSlider(parseFloat(e.target.value))}
            style={{ flex: 1, background: sliderBg }}
          />
          <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.accent, fontWeight: 600, width: 86, flexShrink: 0, textAlign: "right" }}>
            {sliderDate}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ScheduleTimeline() {
  return (
    <ScheduleErrorBoundary>
      <ScheduleTimelineInner />
    </ScheduleErrorBoundary>
  );
}
