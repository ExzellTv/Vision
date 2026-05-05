import React, { useState, useEffect, useRef, useCallback, useMemo, Component } from "react";
import { useNavigate } from "react-router-dom";
import { colors, fonts, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import { useUserType } from "../../context/UserTypeContext";
import HelpTip from "../../components/shared/HelpTip";
import GuidedTour from "../../components/shared/GuidedTour";
import { projectsApi } from "../../services/api";
import { BUILD_COST_PSF } from "../FeasibilityDashboard/valuationEngine";
import StatusBadge from "../../components/shared/StatusBadge";
import House3D from "../../components/3d/House3D";
import { resolveHouseColors } from "../../lib/housePrefs";

import { MATERIALS_DATA } from "../LayerEditor/LayerEditor";

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

/* ─── Construction phase config — 14 phases, ~38 weeks total ───────────────
 *  layerIdx: legacy material layer index (kept for material-upgrade cost multipliers).
 *  reveal:   array of PlanHouse geometry-layer tags unlocked when this phase starts.
 *            Tags match { layer: "..." } on meshes emitted by buildHouseGeometry —
 *            foundation, floor, exterior, interior, roof, openings, porch, canopy,
 *            pillar, driveway, furniture.
 *  category: industry CPM category label (shown in Gantt)
 * ─────────────────────────────────────────────────────────────────────── */
const LAYER_PHASE_CONFIG = [
  // ── SITEWORK ──────────────────────────────────────────────────────────
  { layerIdx: null, reveal: [],                             name: "Permitting & Site Prep",            durationWeeks: 2, category: "SITEWORK" },
  { layerIdx: null, reveal: ["driveway"],                   name: "Excavation & Grading",              durationWeeks: 2, category: "SITEWORK" },
  // ── FOUNDATION ────────────────────────────────────────────────────────
  { layerIdx: 0,    reveal: ["foundation", "floor"],        name: "Foundation (Form, Pour, Cure)",     durationWeeks: 4, category: "FOUNDATION" },
  // ── STRUCTURE ─────────────────────────────────────────────────────────
  { layerIdx: 1,    reveal: ["exterior", "interior", "pillar"], name: "Structural Framing",           durationWeeks: 5, category: "STRUCTURE" },
  { layerIdx: 7,    reveal: ["roof", "canopy"],             name: "Roofing & Sheathing",               durationWeeks: 3, category: "STRUCTURE" },
  { layerIdx: 2,    reveal: [],                             name: "Exterior Sheathing & Wrap",         durationWeeks: 2, category: "STRUCTURE" },
  // ── MEP ROUGH-IN ──────────────────────────────────────────────────────
  { layerIdx: null, reveal: [],                             name: "Rough MEP (Plumbing, Elec, HVAC)",  durationWeeks: 4, category: "MEP" },
  // ── ENCLOSURE ─────────────────────────────────────────────────────────
  { layerIdx: 3,    reveal: [],                             name: "Insulation",                        durationWeeks: 2, category: "ENCLOSURE" },
  { layerIdx: 4,    reveal: [],                             name: "Drywall (Hang, Tape, Finish)",      durationWeeks: 3, category: "ENCLOSURE" },
  // ── FINISHES ──────────────────────────────────────────────────────────
  { layerIdx: 5,    reveal: [],                             name: "Exterior Cladding & Siding",        durationWeeks: 3, category: "FINISHES" },
  { layerIdx: null, reveal: ["porch"],                      name: "Interior Finish Carpentry",         durationWeeks: 3, category: "FINISHES" },
  { layerIdx: 6,    reveal: ["openings"],                   name: "Paint & Interior Finish",           durationWeeks: 2, category: "FINISHES" },
  // ── CLOSEOUT ──────────────────────────────────────────────────────────
  { layerIdx: null, reveal: ["furniture"],                  name: "Fixtures, Trim & Final MEP",        durationWeeks: 2, category: "CLOSEOUT" },
  { layerIdx: null, reveal: [],                             name: "Final Inspection & Punch List",     durationWeeks: 1, category: "CLOSEOUT" },
];

const TODAY = new Date();

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

/* ─── Schedule localStorage cache ─── */
const SCHEDULE_CACHE_KEY = "vision:schedule:v1";
function readScheduleCache(projectId) {
  try {
    const data = JSON.parse(localStorage.getItem(SCHEDULE_CACHE_KEY)) ?? null;
    if (!data) return null;
    // Reject cache if it belongs to a different project
    if (projectId && data.projectId && data.projectId !== projectId) return null;
    return data;
  } catch { return null; }
}
function writeScheduleCache(data) {
  try { localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
}

/* ─── Main Component ─── */
function ScheduleTimelineInner() {
  const project        = useProject();
  const { isHomeowner } = useUserType();

  // Restore from saved schedule (MongoDB) or fall back to localStorage cache (project-scoped)
  const saved = project.savedSchedule ?? readScheduleCache(project.projectId);

  const [startDateStr, setStartDateStr] = useState(() => {
    const savedStart = saved?.startDate;
    const hasSavedProgress = (saved?.manualDone || []).length > 0;
    // If saved start is in the past and no phases were manually marked done,
    // reset to today so a fresh project doesn't appear fully complete.
    if (savedStart && new Date(savedStart) < TODAY && !hasSavedProgress) {
      return TODAY.toISOString().slice(0, 10);
    }
    return savedStart || TODAY.toISOString().slice(0, 10);
  });
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

  // Write schedule state to localStorage whenever it changes so it survives navigation
  // (MongoDB save is a separate explicit action; this is a silent background cache)
  useEffect(() => {
    writeScheduleCache({
      projectId: project.projectId ?? null,
      startDate: startDateStr,
      manualDone: [...manualDone],
      durationOverrides,
      phaseNotes,
    });
  }, [startDateStr, manualDone, durationOverrides, phaseNotes]);
  const [noteOpenId,     setNoteOpenId]     = useState(null);
  const [noteDraft,      setNoteDraft]      = useState("");

  // ── Resizable panels ──
  const [leftPct,  setLeftPct]  = useState(55); // % of main row width for 3D panel
  const [topPct,   setTopPct]   = useState(58); // % of resizable area for main content
  const mainRowRef    = useRef(null);
  const resizableRef  = useRef(null);

  const startHResize = useCallback((e) => {
    e.preventDefault();
    const startX   = e.clientX;
    const startPct = leftPct;
    const onMove = (mv) => {
      if (!mainRowRef.current) return;
      const w = mainRowRef.current.getBoundingClientRect().width;
      const delta = ((mv.clientX - startX) / w) * 100;
      setLeftPct(Math.min(75, Math.max(25, startPct + delta)));
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [leftPct]);

  const startVResize = useCallback((e) => {
    e.preventDefault();
    const startY   = e.clientY;
    const startPct = topPct;
    const onMove = (mv) => {
      if (!resizableRef.current) return;
      const h = resizableRef.current.getBoundingClientRect().height;
      const delta = ((mv.clientY - startY) / h) * 100;
      setTopPct(Math.min(80, Math.max(20, startPct + delta)));
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [topPct]);

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

  // Fetch schedule from MongoDB on mount so notes/overrides/done persist per-project across reloads.
  // Use getPublic so builders viewing a homeowner's project (where the doc is owned by a different
  // user_id) still receive the real floor_plan / story_plans / materials — otherwise .get 404s and
  // the 3D preview falls back to the builder's own local/demo project data.
  useEffect(() => {
    if (!project.projectId) return;
    projectsApi.getPublic(project.projectId)
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

  // Sync scrubber to the end of the furthest completed phase when checkboxes change
  useEffect(() => {
    const completedInOrder = schedule.filter(p => p.status === "complete");
    if (completedInOrder.length === 0) {
      setTimeSlider(0);
      return;
    }
    const last = completedInOrder[completedInOrder.length - 1];
    const endWeek = weeksBetween(projectStart, last.endDate);
    setTimeSlider(Math.min(totalWeeks || endWeek, endWeek));
  }, [manualDone, schedule, projectStart, totalWeeks]);

  /* ─── Compute per-layer reveal progress from the timeline slider ───
   *  Each construction phase drives a 0..1 progress value across its week
   *  window; that progress is handed to PlanHouse per geometry-layer tag, so
   *  instead of every wall/roof piece popping in at once the build unfolds
   *  piece-by-piece as the active phase ticks forward. When a phase is
   *  complete the layer renders fully; before a phase starts it stays hidden. */
  const layerProgress = useMemo(() => {
    const map = {};
    LAYER_PHASE_CONFIG.forEach((cfg, phaseIdx) => {
      const phase = schedule[phaseIdx];
      if (!phase || !cfg.reveal?.length) return;
      const startWk = weeksBetween(projectStart, phase.startDate);
      const endWk   = weeksBetween(projectStart, phase.endDate);
      const span    = Math.max(1e-6, endWk - startWk);
      // Manual "done" override jumps straight to 1; otherwise interpolate on the slider.
      const p = phase.status === "complete"
        ? 1
        : Math.max(0, Math.min(1, (timeSlider - startWk) / span));
      cfg.reveal.forEach((layer) => {
        map[layer] = Math.max(map[layer] ?? 0, p);
      });
    });
    return map;
  }, [timeSlider, schedule, projectStart]);

  // Shared color resolution — matches /preview3d and the builder dashboard.
  // Prefers /preview3d localStorage picks, then per-project materials, then defaults.
  const { wallColor: sceneWallColor, roofColor: sceneRoofColor } =
    resolveHouseColors({ materials: project.materials });

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
        ...(project.projectLocation && { location: project.projectLocation }),
      };

      let saved;
      if (project.projectId) {
        // Use schedule-only endpoint so builders can save to homeowner projects (no user_id enforcement)
        saved = await projectsApi.updateSchedule(project.projectId, schedulePayload);
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
    <div style={{ height: "100%", background: colors.bgGradient, display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box" }}>

      {isHomeowner && (
        <GuidedTour
          storageKey="schedule"
          title="Construction Schedule"
          steps={[
            {
              title: "Your build, week by week",
              body: (
                <>
                  This is the construction calendar for the home you just designed. Each colored bar
                  is one phase of work. We&rsquo;ll show you how to read it and how to play it forward in
                  time.
                </>
              ),
            },
            {
              target: '[data-tour="schedule-header"]',
              placement: "bottom",
              title: "Start &amp; finish dates",
              body: (
                <>
                  At a glance: when the build starts, how long it takes, and when you&rsquo;d move in. The
                  status badge tells you which phase is currently &ldquo;on the clock&rdquo;.
                </>
              ),
            },
            {
              target: '[data-tour="gantt"]',
              placement: "top",
              title: "Reading the bars",
              body: (
                <>
                  Each row is a phase &mdash; <b>Sitework</b>, <b>Foundation</b>, <b>Structure</b>, <b>MEP</b> (plumbing/electric/HVAC), <b>Enclosure</b>, <b>Finishes</b>, <b>Closeout</b>. Bar length is duration. When two bars overlap, those phases run at the same time.
                </>
              ),
            },
            {
              target: '[data-tour="time-slider"]',
              placement: "top",
              title: "Scrub through time",
              body: (
                <>
                  Drag this slider to fast-forward the build. The 3D preview above updates as you go &mdash; you&rsquo;ll see foundation pour, framing rise, then finishes appear.
                </>
              ),
              optional: true,
            },
            {
              target: '[data-tour="phase-list"]',
              placement: "left",
              title: "Phase details",
              body: (
                <>
                  Click any phase to see what&rsquo;s being done that week, the cost allocated, and which
                  trades are on site. Helpful when a builder asks &ldquo;where are we at?&rdquo;.
                </>
              ),
              optional: true,
            },
            {
              title: "That&rsquo;s the journey",
              body: (
                <>
                  Floor plan &rarr; 3D preview &rarr; layers &amp; cost &rarr; land feasibility &rarr;
                  executive summary &rarr; schedule. From here, head to <b>Browse Builders</b> to send
                  your plan to a contractor for a real quote.
                </>
              ),
            },
          ]}
        />
      )}

      {/* ── Header ── */}
      <div data-tour="schedule-header" style={{ padding: "10px 16px 6px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ fontFamily: fonts.label, fontSize: 20, fontWeight: 700, color: colors.textBright, margin: 0 }}>
                Construction Schedule
              </h1>
              {isHomeowner && (
                <HelpTip
                  size={12}
                  title="Reading the timeline"
                  body="A Gantt chart — each row is one construction phase, the bar length is how long it takes. Phases that overlap can run at the same time. Vertical line marks today."
                />
              )}
              <StatusBadge
                status={activePhase ? "active" : completedPhases.length === schedule.length ? "complete" : "planned"}
                size="lg"
              />
              {isHomeowner && (
                <span style={{ fontFamily: fonts.label, fontSize: 9, color: colors.textDim, background: colors.cardBorder, border: `1px solid ${colors.panelBorder}`, borderRadius: 4, padding: "2px 7px", letterSpacing: "0.5px" }}>
                  VIEW ONLY
                </span>
              )}
            </div>
            <p style={{ fontFamily: fonts.label, fontSize: 12, color: colors.textDim, margin: "3px 0 0" }}>
              {projectName} · {stories} {stories === 1 ? "Story" : "Stories"} · {totalSF.toLocaleString()} SF
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
            {/* Back button — builder only */}
            {!isHomeowner && (
              <button
                onClick={() => navigate(-1)}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6, color: colors.textDim, fontSize: 12,
                  fontWeight: 600, padding: "4px 10px", cursor: "pointer",
                  fontFamily: fonts.label, transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.accent; e.currentTarget.style.color = colors.accent; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = colors.textDim; }}
              >
                ← Back
              </button>
            )}
            {/* Project start date picker — builder only; homeowner sees static label */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.6px" }}>
                Start Date
              </span>
              {isHomeowner ? (
                <span style={{ fontFamily: fonts.data, fontSize: 11, fontWeight: 700, color: colors.text, padding: "4px 8px", background: colors.cardBorder, borderRadius: 6 }}>
                  {startDateStr}
                </span>
              ) : (
                <input
                  type="date"
                  value={startDateStr}
                  onChange={(e) => e.target.value && setStartDateStr(e.target.value)}
                  style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 6, color: colors.text, fontFamily: fonts.data, fontSize: 11, padding: "4px 8px", outline: "none", cursor: "pointer" }}
                />
              )}
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
            {!isHomeowner && (
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
            )}
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
            {!isHomeowner && (
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
            )}
          </div>
        </div>

      </div>

      {/* ── Resizable area — single connected panel container ── */}
      <div ref={resizableRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", margin: "0 16px 10px", border: `1px solid ${colors.cardBorder}`, borderRadius: radii.lg }}>

      {/* ── Main content row ── */}
      <div ref={mainRowRef} style={{ display: "flex", flex: `${topPct} 1 0`, minHeight: 0, overflow: "hidden" }}>

        {/* Left — 3D Viewport: same plan-driven model as /preview3d, with
            construction phases progressively revealing layers via `visibleLayers`. */}
        <div style={{ flex: `${leftPct} 1 0`, minWidth: 280, position: "relative", overflow: "hidden", background: colors.panel }}>
          <House3D
            width={project.footprintWidth}
            depth={project.footprintDepth}
            stories={project.stories || 1}
            floorPlan={project.floorPlan}
            storyPlans={project.storyPlans}
            wallColor={sceneWallColor}
            roofColor={sceneRoofColor}
            layerProgress={layerProgress}
            showGround
            showSky
            interactive={false}
            style={{ width: "100%", height: "100%" }}
          />
          <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "center", gap: 8, background: "rgba(15,20,32,0.88)", padding: "6px 12px", borderRadius: radii.md, border: `1px solid ${colors.panelBorder}`, zIndex: 2 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors.accent }} />
            <span style={{ fontFamily: fonts.label, fontSize: 11, color: colors.accent, fontWeight: 600 }}>{sliderPhase}</span>
            <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>{sliderDate}</span>
          </div>
        </div>

        {/* ── Horizontal drag handle — flush divider ── */}
        <div
          onMouseDown={startHResize}
          style={{ width: 5, flexShrink: 0, cursor: "col-resize", background: colors.cardBorder, transition: "background 0.15s", zIndex: 10 }}
          onMouseEnter={e => { e.currentTarget.style.background = colors.accent; }}
          onMouseLeave={e => { e.currentTarget.style.background = colors.cardBorder; }}
        />

        {/* Right — Intelligence Panel: flush, no outer card */}
        <div style={{ flex: `${100 - leftPct} 1 0`, minWidth: 240, display: "flex", flexDirection: "column", overflow: "hidden", background: colors.cardSurface }}>
          {/* Cost summary */}
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${colors.cardBorder}`, flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 4 }}>
                  Est. Construction Cost
                </span>
                <span style={{ fontFamily: fonts.data, fontSize: 22, fontWeight: 700, color: colors.textBright, lineHeight: 1 }}>
                  {fmtCost(totalCost)}
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 4 }}>
                  Spent to Date
                </span>
                <span style={{ fontFamily: fonts.data, fontSize: 14, fontWeight: 700, color: colors.accent }}>
                  {fmtCost(Math.round(cumulativeCost))}
                </span>
              </div>
            </div>
          </div>

          {/* Progress gauge + Duration + Phases Done */}
          <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 16, borderBottom: `1px solid ${colors.cardBorder}`, flexShrink: 0 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 2 }}>Today</span>
                <span style={{ fontFamily: fonts.data, fontSize: 13, fontWeight: 700, color: colors.accent, lineHeight: 1 }}>{fmtDateFull(TODAY)}</span>
              </div>
              <div>
                <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 2 }}>Duration</span>
                <span style={{ fontFamily: fonts.data, fontSize: 20, fontWeight: 700, color: colors.textBright, lineHeight: 1 }}>{Math.round(totalWeeks)}<span style={{ fontSize: 11, fontWeight: 400, color: colors.textDim }}> wks</span></span>
                <span style={{ fontFamily: fonts.label, fontSize: 10, color: colors.textDim, display: "block", marginTop: 2 }}>≈ {Math.round(totalWeeks * 7 / 30)} months</span>
              </div>
              <div>
                <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 2 }}>Phases Done</span>
                <span style={{ fontFamily: fonts.data, fontSize: 20, fontWeight: 700, color: colors.textBright, lineHeight: 1 }}>{completedPhases.length}<span style={{ fontSize: 11, fontWeight: 400, color: colors.textDim }}>/{schedule.length}</span></span>
                <span style={{ fontFamily: fonts.label, fontSize: 10, color: colors.success, display: "block", marginTop: 2 }}>complete</span>
              </div>
            </div>
            <div style={{ width: 1, alignSelf: "stretch", background: colors.cardBorder, flexShrink: 0 }} />
            <ProgressGauge score={overallPct} size={88} />
          </div>

          {/* Building Context Summary — handoff to Structural Intelligence */}
          <div style={{ padding: "10px 12px", flex: 1, overflow: "auto" }}>
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

      {/* ── Vertical drag handle — flush divider ── */}
      <div
        onMouseDown={startVResize}
        style={{ height: 5, flexShrink: 0, cursor: "row-resize", background: colors.cardBorder, transition: "background 0.15s" }}
        onMouseEnter={e => { e.currentTarget.style.background = colors.accent; }}
        onMouseLeave={e => { e.currentTarget.style.background = colors.cardBorder; }}
      />

      {/* ── Bottom — Gantt Timeline: flush, no outer card ── */}
      <div style={{ flex: `${100 - topPct} 1 0`, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Card header — fixed, never scrolls */}
        <div style={{ padding: "10px 12px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 11, fontWeight: 700, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                Timeline
              </span>
              <span style={{ fontFamily: fonts.data, fontSize: 9, color: colors.textDim }}>
                {schedule.filter(p => p.status === "complete").length}/{schedule.length} complete
              </span>
              {!isHomeowner && Object.keys(durationOverrides).length > 0 && (
                <button
                  onClick={resetDurationOverrides}
                  title="Reset all duration edits to original schedule"
                  style={{ fontFamily: fonts.label, fontSize: 9, color: colors.warn, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4, padding: "2px 7px", cursor: "pointer", letterSpacing: "0.4px" }}
                >
                  Reset Edits
                </button>
              )}
            </div>
            <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim }}>
              {fmtDateFull(projectStart)} → {completionDate ? fmtDateFull(completionDate) : "—"} · {Math.round(totalWeeks)} wks
            </span>
          </div>

          {/* Category legend */}
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {Object.entries(CATEGORY_COLOR).map(([cat, col]) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: col, opacity: 0.85 }} />
                <span style={{ fontFamily: fonts.label, fontSize: 9, color: colors.textDim, letterSpacing: "0.5px" }}>{cat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable rows area */}
        <div data-tour="gantt" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "0 12px" }}>
          <div data-tour="phase-list" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {schedule.map((ph) => {
              const sw       = weeksBetween(projectStart, ph.startDate);
              const leftPct  = totalWeeks > 0 ? (sw / totalWeeks) * 100 : 0;
              const widthPct = totalWeeks > 0 ? (ph.durationWeeks / totalWeeks) * 100 : 0;
              const todayPct = totalWeeks > 0 ? Math.min(100, (todayWeek / totalWeeks) * 100) : 0;
              const barColor = ph.layerColor ?? CATEGORY_COLOR[ph.category] ?? phaseColor(ph.status);
              const isDone   = ph.status === "complete";
              const isManual = manualDone.has(ph.id);
              const hasNote  = !!phaseNotes[ph.id];
              return (
                <div key={ph.id}>
                  {/* ── Row ── */}
                  <div
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.035)"}
                    onMouseLeave={e => e.currentTarget.style.background = isDone ? "rgba(46,213,115,0.03)" : "transparent"}
                    style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 44, padding: "6px 8px", borderRadius: 4, border: "1px solid transparent", background: isDone ? "rgba(46,213,115,0.03)" : "transparent", transition: "background 0.2s" }}>
                    {/* Checkbox — builder only */}
                    {!isHomeowner && (
                      <button
                        onClick={() => toggleManualDone(ph.id)}
                        style={{ width: 14, height: 14, flexShrink: 0, borderRadius: 3, border: `1.5px solid ${isDone ? colors.success : colors.cardBorder}`, background: isDone ? colors.successDim : "transparent", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
                        title={isDone ? "Mark undone" : "Mark done"}
                      >
                        {isDone && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke={colors.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </button>
                    )}
                    {/* Activity ID */}
                    <span style={{ fontFamily: fonts.data, fontSize: 9, color: colors.textDim, width: 20, flexShrink: 0, textAlign: "right" }}>
                      A{String(ph.id).padStart(2, "0")}
                    </span>
                    {/* Phase name */}
                    <span title={ph.name} style={{ fontFamily: fonts.label, fontSize: 10, width: 160, flexShrink: 0, color: isDone ? colors.textDim : ph.status === "active" ? colors.accent : colors.text, fontWeight: ph.status === "active" ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: isDone ? "line-through" : "none", textDecorationColor: colors.success }}>
                      {ph.name}
                    </span>
                    {/* Bar track */}
                    <div style={{ flex: 1, position: "relative", height: 16, background: colors.cardBorder, borderRadius: 4 }}>
                      <div style={{
                        position: "absolute", left: `${leftPct}%`, width: `${widthPct}%`, height: "100%",
                        background: ph.status === "complete"
                          ? `linear-gradient(90deg,${barColor}88,${barColor}cc)`
                          : ph.status === "active"
                            ? `linear-gradient(90deg,${barColor},${barColor}dd)`
                            : barColor,
                        borderRadius: 4,
                        opacity: ph.status === "planned" ? 0.35 : ph.status === "complete" ? 0.65 : 1,
                        transition: "all 0.3s ease",
                      }} />
                      {todayWeek >= 0 && todayWeek <= totalWeeks && (
                        <div style={{ position: "absolute", left: `${todayPct}%`, top: -4, bottom: -4, width: 2, background: colors.warn, borderRadius: 1, opacity: 0.9, pointerEvents: "none" }} />
                      )}
                    </div>
                    {/* Duration — inline editable for builders */}
                    <div style={{ width: 46, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                      {isHomeowner ? (
                        <span style={{ fontFamily: fonts.data, fontSize: 9, color: colors.textDim }}>{ph.durationWeeks}w</span>
                      ) : editingPhaseId === ph.id ? (
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
                            onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                            onMouseLeave={e => e.currentTarget.style.opacity = "0.35"}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 0 2px", color: colors.accent, display: "flex", alignItems: "center", opacity: 0.35, lineHeight: 1, transition: "opacity 0.15s" }}
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M7 1L9 3L3 9H1V7L7 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                    {/* Date range */}
                    <span style={{ fontFamily: fonts.data, fontSize: 9, color: colors.textDim, width: 80, flexShrink: 0, textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmtDate(ph.startDate)}–{fmtDate(ph.endDate)}
                    </span>
                    {/* Note button — builder: pill; homeowner: dot view (only if note exists) */}
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isHomeowner ? (
                        phaseNotes[ph.id] && (
                          <button
                            onClick={() => setNoteOpenId(noteOpenId === ph.id ? null : ph.id)}
                            title={noteOpenId === ph.id ? "Hide builder note" : "View builder note"}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 3px", display: "flex", alignItems: "center", gap: 3, borderRadius: 4, flexShrink: 0 }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: noteOpenId === ph.id ? colors.accent : colors.warn, display: "inline-block", transition: "background 0.15s" }} />
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => openNote(ph)}
                          title={hasNote ? "View/edit delay note" : "Add delay note"}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
                        >
                          <div style={{
                            display: "flex", alignItems: "center", gap: 4,
                            padding: "3px 8px", borderRadius: 99,
                            border: `1px solid ${hasNote ? colors.warn : colors.cardBorder}`,
                            background: hasNote ? "rgba(255,190,0,0.08)" : "transparent",
                            color: noteOpenId === ph.id ? colors.accent : hasNote ? colors.warn : colors.textDim,
                            fontFamily: fonts.label, fontSize: 10, fontWeight: 600,
                            whiteSpace: "nowrap", letterSpacing: "0.3px",
                            transition: "border-color 0.15s, color 0.15s",
                          }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            {hasNote ? "Note ●" : "Note"}
                          </div>
                        </button>
                      )}
                    </div>
                    {/* Status badge + MANUAL tag */}
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, paddingRight: 4 }}>
                      {isManual && (
                        <span style={{ fontFamily: fonts.data, fontSize: 7, color: colors.success, background: colors.successDim, padding: "1px 4px", borderRadius: 3 }}>M</span>
                      )}
                      <StatusBadge status={ph.status} />
                    </div>
                  </div>

                  {/* ── Row divider ── */}
                  <div style={{ height: 1, background: `${colors.cardBorder}55`, margin: "0 -8px" }} />

                  {/* ── Note popover — homeowner read-only ── */}
                  {isHomeowner && phaseNotes[ph.id] && noteOpenId === ph.id && (
                    <div style={{ margin: "0 0 4px 36px", padding: "8px 12px", borderRadius: "0 0 6px 6px", background: "rgba(20,24,36,0.97)", border: `1px solid ${colors.warn}44`, borderTop: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                      <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 700, color: colors.warn, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 4 }}>Builder Note</span>
                      <p style={{ margin: 0, fontFamily: fonts.label, fontSize: 10, color: colors.textBright, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{phaseNotes[ph.id]}</p>
                    </div>
                  )}

                  {/* ── Note popover — builder edit ── */}
                  {!isHomeowner && noteOpenId === ph.id && (
                    <div style={{ margin: "0 0 4px 36px", padding: "10px 12px", borderRadius: "0 0 6px 6px", background: "rgba(20,24,36,0.97)", border: `1px solid ${colors.warn}44`, borderTop: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
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

            {/* TODAY arrow label */}
            {totalWeeks > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, height: 14, marginTop: 2 }}>
                <span style={{ width: 110, flexShrink: 0, fontFamily: fonts.data, fontSize: 8, color: colors.warn, fontWeight: 700 }}>
                  TODAY · {fmtDate(TODAY)}
                </span>
                <div style={{ flex: 1, position: "relative", height: "100%" }}>
                  <div style={{ position: "absolute", left: `${Math.min(100, (todayWeek / totalWeeks) * 100)}%`, transform: "translateX(-50%)", fontFamily: fonts.data, fontSize: 10, color: colors.warn, lineHeight: 1 }}>▲</div>
                </div>
                <span style={{ width: 152, flexShrink: 0 }} />
              </div>
            )}
          </div>
        </div>

        {/* 3D scrubber — fixed at bottom of card */}
        <div data-tour="time-slider" style={{ padding: "8px 12px 10px", flexShrink: 0, borderTop: `1px solid ${colors.cardBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.6px", width: 110, flexShrink: 0 }}>
              Scrub 3D View
            </span>
            <input
              type="range" className="tl-slider"
              min={0} max={totalWeeks || 19} step={0.25}
              value={timeSlider}
              onChange={(e) => setTimeSlider(parseFloat(e.target.value))}
              style={{ flex: 1, background: sliderBg }}
            />
            <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.accent, fontWeight: 600, width: 76, flexShrink: 0, textAlign: "right" }}>
              {sliderDate}
            </span>
          </div>
        </div>
      </div>

      </div>{/* end resizableRef */}
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
