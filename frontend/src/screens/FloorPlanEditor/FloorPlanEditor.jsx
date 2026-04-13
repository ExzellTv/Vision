import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation, useBlocker } from "react-router-dom";
import { colors, fonts, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import { useUserType } from "../../context/UserTypeContext";
import { projectsApi, floorplanApi } from "../../services/api";
import { useStructuralValidation, ValidationPanel, ValidationBadge } from "../../hooks/useStructuralValidation.jsx";

/* ───────────────────────── Constants ───────────────────────── */

const ROOM_COLORS = {
  bedroom:  { fill: "rgba(59, 130, 246, 0.2)",  stroke: "#3b82f6" },
  bathroom: { fill: "rgba(0, 212, 255, 0.2)",   stroke: "#00d4ff" },
  kitchen:  { fill: "rgba(255, 159, 67, 0.2)",  stroke: "#ff9f43" },
  living:   { fill: "rgba(46, 213, 115, 0.2)",  stroke: "#2ed573" },
  dining:   { fill: "rgba(138, 155, 176, 0.2)", stroke: "#8a9bb0" },
  garage:   { fill: "rgba(90, 101, 128, 0.2)",  stroke: "#5a6580" },
  hallway:  { fill: "rgba(42, 53, 72, 0.25)",   stroke: "#2a3548" },
  closet:   { fill: "rgba(42, 53, 72, 0.2)",    stroke: "#2a3548" },
  laundry:  { fill: "rgba(138, 155, 176, 0.15)", stroke: "#6b7a90" },
  entry:    { fill: "rgba(0, 212, 255, 0.08)",  stroke: "#1a5c6a" },
  stair:    { fill: "rgba(90, 101, 128, 0.22)",  stroke: "#5a6580" },
};

const STYLE_OPTIONS = ["Ranch", "Colonial", "Modern", "Craftsman", "Mediterranean"];
const GARAGE_OPTIONS = ["None", "1-car", "2-car", "Detached"];

const PX_PER_FT = 4;         // 1 ft = 4 canvas pixels
const GRID_SPACING_FT = 0.5; // 6 inches
const GRID_PX = GRID_SPACING_FT * PX_PER_FT; // 2px per grid cell

const DEFAULT_PARAMS = {
  targetSF: 2200,
  bedrooms: 3,
  bathrooms: 2,
  stories: 1,
  lotWidth: 60,
  lotDepth: 120,
  style: "Ranch",
  garage: "2-car",
  openFloorPlan: true,
};

/* ─────────────────── SVG Icon System ──────────────────────── */
// Inline SVG sources with __C__ as the color placeholder
const _SVG_SRCS = {
  armchair: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="__C__" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"/><path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z"/><path d="M5 18v2"/><path d="M19 18v2"/></svg>`,
  bed:      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="__C__" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/></svg>`,
  utensils: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="__C__" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/></svg>`,
  fridge:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="__C__" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Z"/><path d="M5 10h14"/><path d="M15 7v6"/></svg>`,
  shower:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="__C__" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 4 2.5 2.5"/><path d="M13.5 6.5a4.95 4.95 0 0 0-7 7"/><path d="M15 5 5 15"/><path d="M14 17v.01"/><path d="M10 16v.01"/><path d="M13 13v.01"/><path d="M16 10v.01"/><path d="M11 20v.01"/><path d="M17 14v.01"/><path d="M20 11v.01"/></svg>`,
  toilet:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="__C__" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18"/><path d="M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8"/></svg>`,
  tv:       `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="__C__" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2-5 5-5-5"/><rect width="20" height="15" x="2" y="7" rx="2"/></svg>`,
  washer:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="__C__" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h3"/><path d="M17 6h.01"/><rect width="18" height="20" x="3" y="2" rx="2"/><circle cx="12" cy="13" r="5"/><path d="M12 18a2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 1 0-5"/></svg>`,
  door:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="__C__" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12h.01"/><path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><path d="M2 20h20"/></svg>`,
  dresser:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="__C__"><path d="M144,192a8,8,0,0,1-8,8H120a8,8,0,0,1,0-16h16A8,8,0,0,1,144,192ZM120,72h16a8,8,0,0,0,0-16H120a8,8,0,0,0,0,16Zm16,48H120a8,8,0,0,0,0,16h16a8,8,0,0,0,0-16Zm80-80V216a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V40A16,16,0,0,1,56,24H200A16,16,0,0,1,216,40ZM56,152H200V104H56ZM56,40V88H200V40ZM200,216V168H56v48H200Z"/></svg>`,
  garagei:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="__C__"><path d="M240,192h-8V98.67a16,16,0,0,0-7.12-13.31l-88-58.67a16,16,0,0,0-17.75,0l-88,58.67A16,16,0,0,0,24,98.67V192H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM40,98.67,128,40l88,58.66V192H192V136a8,8,0,0,0-8-8H72a8,8,0,0,0-8,8v56H40ZM176,144v16H136V144Zm-56,16H80V144h40ZM80,176h40v16H80Zm56,0h40v16H136Z"/></svg>`,
  oven:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="__C__"><path d="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H48V48H208V208ZM72,76A12,12,0,1,1,84,88,12,12,0,0,1,72,76Zm44,0a12,12,0,1,1,12,12A12,12,0,0,1,116,76Zm44,0a12,12,0,1,1,12,12A12,12,0,0,1,160,76Zm24,28H72a8,8,0,0,0-8,8v72a8,8,0,0,0,8,8H184a8,8,0,0,0,8-8V112A8,8,0,0,0,184,104Zm-8,72H80V120h96Z"/></svg>`,
  table:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="__C__"><path d="M41 265v30h430v-30H41zm39 48v158.066h32V313H80zm320 0v158.066h32V313h-32z"/></svg>`,
  toiletpaper: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="__C__"><path d="M76,120a12,12,0,1,1-12-12A12,12,0,0,1,76,120Zm164,0v88a16,16,0,0,1-16,16H112a16,16,0,0,1-16-16V186.35C87.37,200.37,76.18,208,64,208c-13.87,0-26.46-9.89-35.44-27.85C20.46,164,16,142.59,16,120s4.46-43.95,12.56-60.15C37.54,41.89,50.13,32,64,32H192c13.87,0,26.46,9.89,35.44,27.85C235.54,76.05,240,97.41,240,120ZM96,120c0-42.43-16.86-72-32-72S32,77.57,32,120s16.86,72,32,72S96,162.43,96,120Zm128,88V128H208a8,8,0,0,1,0-16h15.79C221.84,73.9,206.16,48,192,48H92.12a73.6,73.6,0,0,1,7.32,11.85c7.14,14.28,11.44,32.56,12.37,52.15H128a8,8,0,0,1,0,16H112v80Zm-48-96H160a8,8,0,0,0,0,16h16a8,8,0,0,0,0-16Z"/></svg>`,
  window:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="__C__" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M3 12h18m-9 9V3M5.4 3h13.2A2.4 2.4 0 0 1 21 5.4v13.2a2.4 2.4 0 0 1-2.4 2.4H5.4A2.4 2.4 0 0 1 3 18.6V5.4A2.4 2.4 0 0 1 5.4 3"/></svg>`,
  stair:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="__C__" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M22 5h-5v5h-5v5H7v5H2"/></svg>`,
};

const _iconImgCache = new Map();
let _iconReRender = null; // set by component to trigger re-draw when icons load

function _getIcon(name, color) {
  const key = `${name}:${color}`;
  if (_iconImgCache.has(key)) return _iconImgCache.get(key);
  const src = _SVG_SRCS[name];
  if (!src) return null;
  const colored = src.replace(/__C__/g, color);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`;
  img.onload = () => { _iconReRender?.(); };
  _iconImgCache.set(key, img);
  return img;
}

function _drawIcon(ctx, name, color, x, y, w, h) {
  const img = _getIcon(name, color);
  if (!img?.complete || img.naturalWidth === 0) return;
  const pad = Math.min(w, h) * 0.1;
  ctx.drawImage(img, x + pad, y + pad, w - pad * 2, h - pad * 2);
}

/* ──────────────────── Placement Constraint System ────────────────── */

// Which room type each furniture type is restricted to; "__edge__" = wall-snap
const ITEM_ROOM_CONSTRAINT = {
  sofa: "living",   tv: "living",
  bed: "bedroom",   dresser: "bedroom",
  oven: "kitchen",  fridge: "kitchen",
  toilet: "bathroom", shower: "bathroom",
  dryer: "laundry",  washer: "laundry",
  table: "dining",
  door: "__edge__",  glazing: "__edge__",  window: "__edge__",
};

// Accent color per item type — matches each room’s stroke color
const ITEM_ACCENT_COLOR = {
  sofa: "#2ed573",     tv: "#2ed573",
  bed: "#3b82f6",      dresser: "#3b82f6",
  oven: "#ff9f43",     fridge: "#ff9f43",
  toilet: "#00d4ff",   shower: "#00d4ff",
  washer: "#6b7a90",   dryer: "#6b7a90",
  table: "#8a9bb0",
  door: "#e8ecf4",     glazing: "#a8c4e0",  window: "#a8c4e0",
  stair: "#5a6580",    garage: "#5a6580",
};

function _constrainToRoom(item, allItems) {
  const roomType = ITEM_ROOM_CONSTRAINT[item.type];
  if (!roomType || roomType === "__edge__") return item;
  const normType = (t) => t === "dining-room" ? "dining" : t;
  const rooms = allItems.filter(p => p.isRoom && normType(p.type) === roomType);
  if (rooms.length === 0) return item;
  const cx = item.x + item.w / 2, cy = item.y + item.h / 2;
  let best = rooms[0], bestDist = Infinity;
  for (const r of rooms) {
    const d = Math.abs(cx - (r.x + r.w / 2)) + Math.abs(cy - (r.y + r.h / 2));
    if (d < bestDist) { bestDist = d; best = r; }
  }
  const snap = (ft) => Math.round(ft * 2) / 2;
  return {
    ...item,
    x: snap(Math.max(best.x + 0.5, Math.min(item.x, best.x + best.w - item.w - 0.5))),
    y: snap(Math.max(best.y + 0.5, Math.min(item.y, best.y + best.h - item.h - 0.5))),
  };
}

function _constrainToDoorEdge(item, allItems) {
  const rooms = allItems.filter(p => p.isRoom);
  if (rooms.length === 0) return item;
  const cx = item.x + item.w / 2, cy = item.y + item.h / 2;
  let best = rooms[0], bestDist = Infinity;
  for (const r of rooms) {
    const nearX = Math.max(r.x, Math.min(cx, r.x + r.w));
    const nearY = Math.max(r.y, Math.min(cy, r.y + r.h));
    const d = Math.hypot(cx - nearX, cy - nearY);
    if (d < bestDist) { bestDist = d; best = r; }
  }
  const r = best;
  const snap = (ft) => Math.round(ft * 2) / 2;
  const dT = Math.abs(cy - r.y), dR = Math.abs(cx - (r.x + r.w));
  const dB = Math.abs(cy - (r.y + r.h)), dL = Math.abs(cx - r.x);
  const m = Math.min(dT, dR, dB, dL);
  // Clamp along the edge so door stays within room boundary
  const edgeMin = (edgeStart, edgeLen) => Math.max(edgeStart, Math.min(cx - item.w / 2, edgeStart + edgeLen - item.w));
  const edgeMinY = (edgeStart, edgeLen) => Math.max(edgeStart, Math.min(cy - item.h / 2, edgeStart + edgeLen - item.h));
  if (m === dT) return { ...item, x: snap(edgeMin(r.x, r.w)),  y: snap(r.y - item.h / 2) };
  if (m === dB) return { ...item, x: snap(edgeMin(r.x, r.w)),  y: snap(r.y + r.h - item.h / 2) };
  if (m === dL) return { ...item, x: snap(r.x - item.w / 2),   y: snap(edgeMinY(r.y, r.h)) };
  return           { ...item, x: snap(r.x + r.w - item.w / 2), y: snap(edgeMinY(r.y, r.h)) };
}

function _constrainToExteriorEdge(item, allItems, planW, planH) {
  const EPS = 0.5;
  const rooms = allItems.filter(p => p.isRoom);
  if (rooms.length === 0) return _constrainToDoorEdge(item, allItems);
  const cx = item.x + item.w / 2, cy = item.y + item.h / 2;
  const snap = (ft) => Math.round(ft * 2) / 2;
  let bestPos = null, bestDist = Infinity;
  for (const r of rooms) {
    const cands = [];
    if (r.y <= EPS)               cands.push({ x: snap(Math.max(r.x, Math.min(cx - item.w / 2, r.x + r.w - item.w))), y: snap(r.y - item.h / 2) });
    if (r.y + r.h >= planH - EPS) cands.push({ x: snap(Math.max(r.x, Math.min(cx - item.w / 2, r.x + r.w - item.w))), y: snap(r.y + r.h - item.h / 2) });
    if (r.x <= EPS)               cands.push({ x: snap(r.x - item.w / 2), y: snap(Math.max(r.y, Math.min(cy - item.h / 2, r.y + r.h - item.h))) });
    if (r.x + r.w >= planW - EPS) cands.push({ x: snap(r.x + r.w - item.w / 2), y: snap(Math.max(r.y, Math.min(cy - item.h / 2, r.y + r.h - item.h))) });
    for (const p of cands) {
      const d = Math.hypot(cx - (p.x + item.w / 2), cy - (p.y + item.h / 2));
      if (d < bestDist) { bestDist = d; bestPos = p; }
    }
  }
  return bestPos ? { ...item, ...bestPos } : _constrainToDoorEdge(item, allItems);
}

function _applyConstraint(item, allItems, planW, planH) {
  const c = ITEM_ROOM_CONSTRAINT[item.type];
  if (!c) return item;
  if (c === "__edge__") {
    return _constrainToDoorEdge(item, allItems);
  }
  return _constrainToRoom(item, allItems);
}

function _doRectsOverlap(a, b) {
  const EPS = 0.01;
  return !(a.x + a.w <= b.x + EPS || b.x + b.w <= a.x + EPS ||
           a.y + a.h <= b.y + EPS || b.y + b.h <= a.y + EPS);
}

/**
 * Find the maximum valid position for moving item towards target without overlapping obstacles.
 * Uses binary search to find the collision boundary.
 */
function _findMaxValidMove(startItem, targetX, targetY, obstacles, planW, planH) {
  const snap = (ft) => Math.round(ft * 2) / 2;

  // If target position is valid, use it
  let candidate = { ...startItem, x: targetX, y: targetY };
  if (planW && planH) candidate = _clampToPlan(candidate, planW, planH);

  if (!obstacles.some(o => _doRectsOverlap(candidate, o))) {
    return candidate;
  }

  // Binary search to find the collision point
  const dx = targetX - startItem.x;
  const dy = targetY - startItem.y;

  let lo = 0, hi = 1;
  for (let i = 0; i < 10; i++) { // 10 iterations gives ~0.1% precision
    const mid = (lo + hi) / 2;
    const testX = snap(startItem.x + dx * mid);
    const testY = snap(startItem.y + dy * mid);
    let test = { ...startItem, x: testX, y: testY };
    if (planW && planH) test = _clampToPlan(test, planW, planH);

    if (obstacles.some(o => _doRectsOverlap(test, o))) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  // Use the safe position (lo)
  const safeX = snap(startItem.x + dx * lo);
  const safeY = snap(startItem.y + dy * lo);
  let result = { ...startItem, x: safeX, y: safeY };
  if (planW && planH) result = _clampToPlan(result, planW, planH);
  return result;
}

/**
 * Find the maximum valid resize dimensions without overlapping obstacles.
 * Clamps resize at the collision boundary instead of reverting entirely.
 */
function _findMaxValidResize(startItem, targetW, targetH, targetX, targetY, handle, obstacles, planW, planH) {
  const snap = (ft) => Math.round(ft * 2) / 2;

  // If target resize is valid, use it (use handle-aware clamping)
  let candidate = { ...startItem, x: targetX, y: targetY, w: targetW, h: targetH };
  if (planW && planH) candidate = _clampResizeToPlan(candidate, startItem, handle, planW, planH);

  if (!obstacles.some(o => _doRectsOverlap(candidate, o))) {
    return candidate;
  }

  // Binary search to find the collision point for resize
  const dw = targetW - startItem.w;
  const dh = targetH - startItem.h;
  const dx = targetX - startItem.x;
  const dy = targetY - startItem.y;

  let lo = 0, hi = 1;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    const testW = Math.max(0.5, snap(startItem.w + dw * mid));
    const testH = Math.max(0.5, snap(startItem.h + dh * mid));
    const testX = snap(startItem.x + dx * mid);
    const testY = snap(startItem.y + dy * mid);
    let test = { ...startItem, x: testX, y: testY, w: testW, h: testH };
    if (planW && planH) test = _clampResizeToPlan(test, startItem, handle, planW, planH);

    if (obstacles.some(o => _doRectsOverlap(test, o))) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  // Use the safe dimensions (lo)
  const safeW = Math.max(0.5, snap(startItem.w + dw * lo));
  const safeH = Math.max(0.5, snap(startItem.h + dh * lo));
  const safeX = snap(startItem.x + dx * lo);
  const safeY = snap(startItem.y + dy * lo);
  let result = { ...startItem, x: safeX, y: safeY, w: safeW, h: safeH };
  if (planW && planH) result = _clampResizeToPlan(result, startItem, handle, planW, planH);
  return result;
}

/** Clamp item so it stays fully inside the plan footprint (0,0)→(planW,planH). */
function _clampToPlan(item, planW, planH) {
  const w = Math.max(0.5, Math.min(item.w, planW));
  const h = Math.max(0.5, Math.min(item.h, planH));
  const x = Math.max(0, Math.min(item.x, planW - w));
  const y = Math.max(0, Math.min(item.y, planH - h));
  return { ...item, x, y, w, h };
}

/**
 * Clamp resize to plan boundaries while keeping the opposite edge fixed.
 * handle: 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'
 */
function _clampResizeToPlan(item, startItem, handle, planW, planH) {
  let { x, y, w, h } = item;

  // For east handle: keep west edge fixed, clamp east edge to plan
  if (handle.includes("e")) {
    const maxW = planW - startItem.x; // max width keeping west edge at startItem.x
    w = Math.min(w, maxW);
    x = startItem.x; // west edge stays fixed
  }

  // For west handle: keep east edge fixed, clamp west edge to 0
  if (handle.includes("w")) {
    const rightEdge = startItem.x + startItem.w; // original right edge
    if (x < 0) {
      w = w + x; // reduce width by how much x went negative
      x = 0;
    }
    // Ensure we don't exceed plan and right edge stays put
    w = Math.min(w, rightEdge);
    x = rightEdge - w;
  }

  // For south handle: keep north edge fixed, clamp south edge to plan
  if (handle.includes("s")) {
    const maxH = planH - startItem.y;
    h = Math.min(h, maxH);
    y = startItem.y; // north edge stays fixed
  }

  // For north handle: keep south edge fixed, clamp north edge to 0
  if (handle.includes("n")) {
    const bottomEdge = startItem.y + startItem.h;
    if (y < 0) {
      h = h + y;
      y = 0;
    }
    h = Math.min(h, bottomEdge);
    y = bottomEdge - h;
  }

  // Ensure minimum dimensions
  w = Math.max(0.5, w);
  h = Math.max(0.5, h);

  return { ...item, x, y, w, h };
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/* ───────────── Stair auto-placement for multi-story ────────── */

const STAIR_W = 6;
const STAIR_H = 9;

/** Return true if rect (x,y,w,h) overlaps any room in the array. */
function _overlapsAny(rect, rooms) {
  const EPS = 0.01;
  return rooms.some(r =>
    !(rect.x + rect.w <= r.x + EPS || r.x + r.w <= rect.x + EPS ||
      rect.y + rect.h <= r.y + EPS || r.y + r.h <= rect.y + EPS));
}

/**
 * Find a non-overlapping position for stairs inside the plan footprint.
 * Strategy: try shrinking the best candidate room to carve out space,
 * falling back to scanning for open gaps.
 */
function placeStairs(rooms, width, depth) {
  const sw = STAIR_W, sh = STAIR_H;

  // 1) Try to carve space from the hallway (top-right corner of hallway)
  const hallway = rooms.find(r => r.type === "hallway");
  if (hallway && hallway.w >= sw && hallway.h >= sh + 4) {
    const stairRect = { x: hallway.x, y: hallway.y + hallway.h - sh, w: sw, h: sh };
    // Shrink hallway to make room
    hallway.h -= sh;
    if (!_overlapsAny(stairRect, rooms)) {
      rooms.push({ type: "stair", label: "Stairs", x: stairRect.x, y: stairRect.y, w: stairRect.w, h: stairRect.h, bearing: [false, false, true, false], isStair: true });
      return;
    }
    // Revert if it still overlaps somehow
    hallway.h += sh;
  }

  // 2) Try carving from the kitchen (bottom-right corner)
  const kitchen = rooms.find(r => r.type === "kitchen");
  if (kitchen && kitchen.w >= sw + 4 && kitchen.h >= sh) {
    const stairRect = { x: kitchen.x + kitchen.w - sw, y: kitchen.y, w: sw, h: sh };
    kitchen.w -= sw;
    if (!_overlapsAny(stairRect, rooms)) {
      rooms.push({ type: "stair", label: "Stairs", x: stairRect.x, y: stairRect.y, w: stairRect.w, h: stairRect.h, bearing: [false, false, false, false], isStair: true });
      return;
    }
    kitchen.w += sw;
  }

  // 3) Try carving from the living room (bottom-right corner)
  const living = rooms.find(r => r.type === "living");
  if (living && living.w >= sw + 4 && living.h >= sh) {
    const stairRect = { x: living.x + living.w - sw, y: living.y + living.h - sh, w: sw, h: sh };
    living.w -= sw;
    if (!_overlapsAny(stairRect, rooms)) {
      rooms.push({ type: "stair", label: "Stairs", x: stairRect.x, y: stairRect.y, w: stairRect.w, h: stairRect.h, bearing: [false, false, false, false], isStair: true });
      return;
    }
    living.w += sw;
  }

  // 4) Scan grid for any open gap inside the footprint
  for (let y = 0; y <= depth - sh; y += 1) {
    for (let x = 0; x <= width - sw; x += 1) {
      const cand = { x, y, w: sw, h: sh };
      if (!_overlapsAny(cand, rooms)) {
        rooms.push({ type: "stair", label: "Stairs", x, y, w: sw, h: sh, bearing: [false, false, false, false], isStair: true });
        return;
      }
    }
  }
}

/* ───────────────────── Local Fallback Generator ────────────── */

function placeCommonRooms(rooms, cursor, width, depth, openFloorPlan, garage) {
  const garageWidths = { "2-car": 22, "1-car": 12 };
  const garageW = garageWidths[garage] || 0;
  if (garageW > 0 && garage !== "Detached") {
    rooms.push({
      type: "garage", label: "Garage",
      x: 0, y: 0, w: garageW, h: 22,
      bearing: [true, true, true, true],
    });
    cursor.x = garageW;
  }

  const livingW = openFloorPlan ? Math.round(width * 0.4) : Math.round(width * 0.28);
  const livingD = openFloorPlan ? Math.round(depth * 0.5) : Math.round(depth * 0.45);
  rooms.push({
    type: "living", label: "Living Room",
    x: cursor.x, y: 0, w: livingW, h: livingD,
    bearing: [true, false, false, true],
  });

  const kitchenW = openFloorPlan ? livingW : Math.round(width * 0.25);
  rooms.push({
    type: "kitchen", label: "Kitchen",
    x: cursor.x, y: livingD, w: kitchenW, h: depth - livingD,
    bearing: [false, false, true, true],
  });

  cursor.x += livingW;

  if (openFloorPlan) return;

  const diningW = Math.round(width * 0.2);
  const diningD = Math.round(depth * 0.4);
  rooms.push(
    {
      type: "dining", label: "Dining",
      x: cursor.x, y: 0, w: diningW, h: diningD,
      bearing: [true, false, false, false],
    },
    {
      type: "hallway", label: "Hall",
      x: cursor.x, y: diningD, w: diningW, h: depth - diningD,
      bearing: [false, false, true, false],
    },
  );
  cursor.x += diningW;
}

function placePrimaryBedroom(cursor, bedroomColW, cellH, bathrooms) {
  const bw = bedroomColW;
  const bh = Math.round(cellH * 1.4);
  const bathH = 6;

  const result = [
    {
      type: "bedroom", label: "Primary Bedroom",
      x: cursor.x, y: cursor.y, w: bw, h: bh,
      bearing: [cursor.y === 0, true, false, false],
    },
  ];
  if (bathrooms >= 2) {
    const bathW = Math.min(10, Math.round(bw * 0.45));
    result.push({
      type: "bathroom", label: "Primary Bath",
      x: cursor.x, y: cursor.y + bh, w: bathW, h: bathH,
      bearing: [false, false, true, false],
    });
    return { rooms: result, height: bh + bathH };
  }
  return { rooms: result, height: bh };
}

function placeSecondaryBedrooms(cursor, count, bedroomColW, cellH) {
  const result = [];
  for (let i = 1; i < count; i++) {
    const bw = Math.round(bedroomColW * 0.6);
    result.push({
      type: "bedroom", label: `Bedroom ${i + 1}`,
      x: cursor.x, y: cursor.y, w: bw, h: cellH,
      bearing: [cursor.y === 0, true, false, false],
    });
    cursor.y += cellH;
  }
  return result;
}

function placeRemainingBaths(cursor, bathrooms, bedroomColW, cellH, depth) {
  const remaining = bathrooms - (bathrooms >= 2 ? 1 : 0);
  const result = [];
  for (let i = 0; i < Math.ceil(remaining); i++) {
    const isHalf = remaining - i < 1;
    const bathW = Math.round(bedroomColW * (isHalf ? 0.3 : 0.4));
    const bathH = Math.round(cellH * (isHalf ? 0.6 : 0.8));
    result.push({
      type: "bathroom",
      label: isHalf ? "Half Bath" : `Bath ${i + 2}`,
      x: cursor.x, y: cursor.y, w: bathW, h: bathH,
      bearing: [false, false, cursor.y + bathH >= depth, false],
    });
    cursor.y += bathH;
  }
  return result;
}

function placeBedroomsAndBaths(rooms, cursor, bedrooms, bathrooms, bedroomColW, cellH, depth) {
  const primary = placePrimaryBedroom(cursor, bedroomColW, cellH, bathrooms);
  cursor.y += primary.height;

  const allBedBathRooms = [
    ...primary.rooms,
    ...placeSecondaryBedrooms(cursor, bedrooms, bedroomColW, cellH),
    ...placeRemainingBaths(cursor, bathrooms, bedroomColW, cellH, depth),
  ];
  rooms.push(...allBedBathRooms);

  if (cursor.y < depth) {
    rooms.push({
      type: "laundry", label: "Laundry",
      x: cursor.x, y: cursor.y, w: Math.round(bedroomColW * 0.4), h: depth - cursor.y,
      bearing: [false, true, true, false],
    });
  }
}

function generateDoors(rooms, garage) {
  const doors = [];
  for (const room of rooms) {
    if (room.type === "entry") {
      doors.push({ x: room.x + room.w / 2, y: room.y, side: "top", width: 3, isExterior: true });
    } else if (room.type === "garage" && garage !== "Detached") {
      doors.push(
        { x: room.x + room.w / 2, y: room.y, side: "top", width: 8, isExterior: true },
        { x: room.x + room.w, y: room.h / 2, side: "right", width: 3, isExterior: false },
      );
    } else if (room.type === "living") {
      doors.push({ x: room.x + room.w / 2, y: room.y + room.h, side: "bottom", width: 6, isExterior: false });
    }
  }
  return doors;
}

/**
 * Extract user-placed doors/windows from the placed_items array and convert
 * them into the OpeningSchema shape that the 3D renderer expects:
 *   { type, x, y, width, height, side, sillHeight? }
 *
 * Side is inferred from the item's proximity to the footprint bounding box
 * edge. If an opening isn't near any exterior wall (e.g. user dropped it
 * inside a room), it's skipped rather than placed on a guessed wall.
 */
function extractOpeningsFromPlacedItems(placedItems, bbox) {
  const doors = [];
  const windows = [];
  const TOL = 2.0; // feet — snap tolerance for inferring which wall

  (placedItems || []).forEach((item) => {
    if (!item || item.isRoom) return;
    const isDoor = item.type === "door";
    const isWindow = item.type === "window" || item.type === "glazing";
    if (!isDoor && !isWindow) return;

    const centerX = item.x + item.w / 2;
    const centerY = item.y + item.h / 2;

    const distTop    = Math.abs(item.y - bbox.minY);
    const distBottom = Math.abs((item.y + item.h) - bbox.maxY);
    const distLeft   = Math.abs(item.x - bbox.minX);
    const distRight  = Math.abs((item.x + item.w) - bbox.maxX);
    const minDist    = Math.min(distTop, distBottom, distLeft, distRight);
    if (minDist > TOL) return;

    let side, x, y, width;
    if (minDist === distTop) {
      side = "top";    x = centerX;     y = bbox.minY; width = item.w;
    } else if (minDist === distBottom) {
      side = "bottom"; x = centerX;     y = bbox.maxY; width = item.w;
    } else if (minDist === distLeft) {
      side = "left";   x = bbox.minX;   y = centerY;   width = item.h;
    } else {
      side = "right";  x = bbox.maxX;   y = centerY;   width = item.h;
    }

    const opening = {
      id: String(item.id ?? `${item.type}-${x}-${y}`),
      type: isDoor ? "door" : "window",
      x, y, width,
      height: isDoor ? 7 : 4,
      side,
      ...(isWindow ? { sillHeight: 3 } : {}),
      isExterior: true,
    };
    if (isDoor) doors.push(opening);
    else windows.push(opening);
  });

  return { doors, windows };
}

/**
 * Auto-generate a large garage door on the exterior wall of each garage room.
 * Typical double-car garage door: 16' wide × 8' tall.
 * Width clamps to (room's wall-parallel dim − 2' for jambs) so it always fits.
 */
function generateGarageDoors(rooms, bboxW, bboxD) {
  const doors = [];
  rooms.filter(r => r.type === "garage").forEach((room, i) => {
    const distTop    = room.y;
    const distBottom = bboxD - (room.y + room.h);
    const distLeft   = room.x;
    const distRight  = bboxW - (room.x + room.w);
    const minDist    = Math.min(distTop, distBottom, distLeft, distRight);

    // Garage door runs almost the full wall length — leaves a 2 ft gap on each
    // side (4 ft total) between the door and the perpendicular walls so the
    // corners still read as solid wall.
    const SIDE_MARGIN = 2; // feet per side
    let side, x, y, width;
    if (minDist === distTop) {
      side = "top";    x = room.x + room.w / 2; y = 0;     width = room.w - SIDE_MARGIN * 2;
    } else if (minDist === distBottom) {
      side = "bottom"; x = room.x + room.w / 2; y = bboxD; width = room.w - SIDE_MARGIN * 2;
    } else if (minDist === distLeft) {
      side = "left";   x = 0;     y = room.y + room.h / 2; width = room.h - SIDE_MARGIN * 2;
    } else {
      side = "right";  x = bboxW; y = room.y + room.h / 2; width = room.h - SIDE_MARGIN * 2;
    }

    doors.push({
      id: `garage-door-${i}`,
      type: "door",
      x, y,
      width: Math.max(8, width),
      height: 8, // standard garage-door height
      side,
      isExterior: true,
      isGarageDoor: true,
    });
  });
  return doors;
}

function generateWindowsForRoom(room, width, depth) {
  const SKIP_TYPES = new Set(["garage", "hallway", "closet"]);
  if (SKIP_TYPES.has(room.type)) return [];

  const wins = [];
  if (room.y === 0 && room.type !== "entry") {
    wins.push({ x: room.x + room.w * 0.3, y: room.y, side: "top", width: Math.min(4, room.w * 0.4) });
    if (room.w > 12) {
      wins.push({ x: room.x + room.w * 0.7, y: room.y, side: "top", width: Math.min(4, room.w * 0.4) });
    }
  }
  if (room.x + room.w >= width) {
    wins.push({ x: room.x + room.w, y: room.y + room.h * 0.4, side: "right", width: Math.min(3, room.h * 0.3) });
  }
  if (room.y + room.h >= depth && room.type !== "laundry") {
    wins.push({ x: room.x + room.w * 0.5, y: room.y + room.h, side: "bottom", width: Math.min(4, room.w * 0.4) });
  }
  if (room.x === 0 && room.type !== "garage") {
    wins.push({ x: room.x, y: room.y + room.h * 0.5, side: "left", width: Math.min(3, room.h * 0.3) });
  }
  return wins;
}

// ─────────────────────────────────────────────────────────────────
// Style-based floor plan helpers
// Each builder fills a mainW × depth rectangle.  No gaps, no overlaps.
// ─────────────────────────────────────────────────────────────────

/** Ranch: wide footprint, open kitchen/living up front, bedroom wing back. */
function _buildRanch(rooms, W, D, beds, baths) {
  const frontH = Math.round(D * 0.44);
  const backH  = D - frontH;
  const grW    = Math.round(W * 0.52);
  const kitW   = W - grW;
  const kitH   = Math.round(frontH * 0.6);
  rooms.push({ type: "living",  label: "Great Room",  x: 0,   y: 0,    w: grW,  h: frontH });
  rooms.push({ type: "kitchen", label: "Kitchen",     x: grW, y: 0,    w: kitW, h: kitH   });
  rooms.push({ type: "dining",  label: "Dining Room", x: grW, y: kitH, w: kitW, h: frontH - kitH });
  _bedroomWing(rooms, W, D, frontH, backH, beds, baths);
}

/** Craftsman: entry/mudroom + great room + kitchen nook, bedroom wing back. */
function _buildCraftsman(rooms, W, D, beds, baths) {
  const frontH  = Math.round(D * 0.42);
  const backH   = D - frontH;
  const entryW  = Math.min(8, Math.max(5, Math.round(W * 0.13)));
  const grW     = Math.round((W - entryW) * 0.56);
  const kitW    = W - entryW - grW;
  const kitH    = Math.round(frontH * 0.62);
  rooms.push({ type: "entry",   label: "Mudroom",      x: 0,             y: 0,    w: entryW, h: frontH });
  rooms.push({ type: "living",  label: "Great Room",   x: entryW,        y: 0,    w: grW,    h: frontH });
  rooms.push({ type: "kitchen", label: "Kitchen",      x: entryW + grW,  y: 0,    w: kitW,   h: kitH   });
  rooms.push({ type: "dining",  label: "Breakfast Nook", x: entryW + grW, y: kitH, w: kitW,  h: frontH - kitH });
  _bedroomWing(rooms, W, D, frontH, backH, beds, baths);
}

/** Colonial: formal front + kitchen/family middle + bedroom wing back. */
function _buildColonial(rooms, W, D, beds, baths) {
  const frontH = Math.round(D * 0.26);
  const midH   = Math.round(D * 0.36);
  const backH  = D - frontH - midH;
  const foyerW = Math.min(8, Math.round(W * 0.13));
  const flivW  = Math.round((W - foyerW) * 0.54);
  const fdingW = W - foyerW - flivW;
  rooms.push({ type: "entry",   label: "Foyer",         x: 0,               y: 0, w: foyerW, h: frontH });
  rooms.push({ type: "living",  label: "Formal Living", x: foyerW,          y: 0, w: flivW,  h: frontH });
  rooms.push({ type: "dining",  label: "Formal Dining", x: foyerW + flivW,  y: 0, w: fdingW, h: frontH });
  const kitW = Math.round(W * 0.44);
  rooms.push({ type: "kitchen", label: "Kitchen",     x: 0,    y: frontH, w: kitW,     h: midH });
  rooms.push({ type: "living",  label: "Family Room", x: kitW, y: frontH, w: W - kitW, h: midH });
  _bedroomWing(rooms, W, D, frontH + midH, backH, beds, baths);
}

/** Modern: open-concept left zone (living/kitchen/dining), bedroom corridor right. */
function _buildModern(rooms, W, D, beds, baths) {
  const openW = Math.round(W * 0.5);
  const bedW  = W - openW;
  const livH  = Math.round(D * 0.44);
  const kitH  = Math.round(D * 0.31);
  const dinH  = D - livH - kitH;
  rooms.push({ type: "living",  label: "Living Room", x: 0, y: 0,            w: openW, h: livH });
  rooms.push({ type: "kitchen", label: "Kitchen",     x: 0, y: livH,         w: openW, h: kitH });
  rooms.push({ type: "dining",  label: "Dining",      x: 0, y: livH + kitH,  w: openW, h: dinH });
  _bedroomColumn(rooms, openW, 0, bedW, D, beds, baths);
}

/** Mediterranean: hallway spine, living core left, bedroom corridor right. */
function _buildMediterranean(rooms, W, D, beds, baths) {
  const hallW  = Math.max(4, Math.round(W * 0.08));
  const hallX  = Math.round(W * 0.45);
  const leftW  = hallX;
  const rightX = hallX + hallW;
  const rightW = W - rightX;
  rooms.push({ type: "hallway", label: "Hall", x: hallX, y: 0, w: hallW, h: D,
    bearing: [true, false, true, false] });
  const kitH  = Math.round(D * 0.32);
  const livH  = Math.round(D * 0.40);
  const dinH  = D - kitH - livH;
  rooms.push({ type: "kitchen", label: "Kitchen",     x: 0, y: 0,          w: leftW, h: kitH });
  rooms.push({ type: "living",  label: "Living Room", x: 0, y: kitH,       w: leftW, h: livH });
  rooms.push({ type: "dining",  label: "Dining Room", x: 0, y: kitH + livH, w: leftW, h: dinH });
  _bedroomColumn(rooms, rightX, 0, rightW, D, beds, baths);
}

/**
 * Bedroom wing — horizontal back strip used by Ranch / Craftsman / Colonial.
 * Master suite on the left, hallway in the center, secondary rooms on the right.
 */
function _bedroomWing(rooms, totalW, totalD, startY, wingH, beds, baths) {
  const masterW      = Math.round(totalW * 0.38);
  const hallW        = Math.max(3, Math.min(5, Math.round(totalW * 0.07)));
  const rightW       = totalW - masterW - hallW;
  const rightX       = masterW + hallW;
  const masterBedH   = Math.round(wingH * 0.65);
  const masterSuiteH = wingH - masterBedH;
  rooms.push({ type: "bedroom",  label: "Master Bedroom",  x: 0,       y: startY,               w: masterW, h: masterBedH   });
  const closetW = Math.round(masterW * 0.5);
  const mbathW  = masterW - closetW;
  rooms.push({ type: "closet",   label: "Walk-in Closet",  x: 0,       y: startY + masterBedH,  w: closetW, h: masterSuiteH });
  rooms.push({ type: "bathroom", label: "Master Bath",     x: closetW, y: startY + masterBedH,  w: mbathW,  h: masterSuiteH });
  rooms.push({ type: "hallway",  label: "Hallway", x: masterW, y: startY, w: hallW, h: wingH });
  _placeSecondaryRooms(rooms, rightX, startY, rightW, wingH, Math.max(0, beds - 1), Math.max(0, baths - 1));
}

/**
 * Bedroom column — vertical strip used by Modern / Mediterranean.
 * Master suite at the top, hallway break, secondary rooms below.
 */
function _bedroomColumn(rooms, startX, startY, colW, colH, beds, baths) {
  const masterH      = Math.round(colH * 0.42);
  const masterBedH   = Math.round(masterH * 0.65);
  const masterSuiteH = masterH - masterBedH;
  rooms.push({ type: "bedroom",  label: "Master Bedroom", x: startX,           y: startY,               w: colW,      h: masterBedH   });
  const closetW = Math.round(colW * 0.45);
  const mbathW  = colW - closetW;
  rooms.push({ type: "closet",   label: "Walk-in Closet", x: startX,           y: startY + masterBedH,  w: closetW,   h: masterSuiteH });
  rooms.push({ type: "bathroom", label: "Master Bath",    x: startX + closetW, y: startY + masterBedH,  w: mbathW,    h: masterSuiteH });
  const hallH     = Math.max(3, Math.min(5, Math.round(colH * 0.06)));
  const secStartY = startY + masterH + hallH;
  const secH      = colH - masterH - hallH;
  rooms.push({ type: "hallway", label: "Hall", x: startX, y: startY + masterH, w: colW, h: hallH,
    bearing: [false, true, false, true] });
  _placeSecondaryRooms(rooms, startX, secStartY, colW, secH, Math.max(0, beds - 1), Math.max(0, baths - 1));
}

/**
 * Fill a rectangle with secondary bedrooms, shared bathrooms, and laundry.
 * Uses two columns when the zone is wide enough and rooms would be cramped
 * in a single stack.
 */
function _placeSecondaryRooms(rooms, x, y, w, h, secBeds, secBaths) {
  if (secBeds === 0 && secBaths === 0) {
    rooms.push({ type: "laundry", label: "Laundry", x, y, w, h });
    return;
  }
  const totalItems  = secBeds + secBaths + 1; // +1 for laundry
  const singleColH  = h / totalItems;
  const useTwoCols  = w >= 18 && singleColH < 9 && secBeds > 1;

  if (useTwoCols) {
    const bedColW  = Math.round(w * 0.58);
    const utilColW = w - bedColW;
    // Left: secondary bedrooms stacked evenly
    if (secBeds > 0) {
      const bedH = Math.round(h / secBeds);
      for (let i = 0; i < secBeds; i++) {
        const slotH = i === secBeds - 1 ? (y + h) - (y + i * bedH) : bedH;
        rooms.push({ type: "bedroom", label: `Bedroom ${i + 2}`, x, y: y + i * bedH, w: bedColW, h: slotH });
      }
    }
    // Right: baths + laundry
    const utilItems = [];
    for (let i = 0; i < secBaths; i++) {
      utilItems.push({ type: "bathroom", label: secBaths === 1 ? "Bathroom" : `Bath ${i + 2}`, weight: 1 });
    }
    utilItems.push({ type: "laundry", label: "Laundry", weight: 0.75 });
    const totalWt = utilItems.reduce((s, it) => s + it.weight, 0);
    let curY = y;
    utilItems.forEach((item, idx) => {
      const itemH = idx === utilItems.length - 1 ? (y + h) - curY : Math.round((item.weight / totalWt) * h);
      rooms.push({ type: item.type, label: item.label, x: x + bedColW, y: curY, w: utilColW, h: itemH });
      curY += itemH;
    });
  } else {
    // Single column — interleave bed/bath pairs, laundry at bottom
    const items = [];
    const bedsQ  = Array.from({ length: secBeds },  (_, i) => ({ type: "bedroom",  label: `Bedroom ${i + 2}`, weight: 1.5 }));
    const bathsQ = Array.from({ length: secBaths }, (_, i) => ({ type: "bathroom", label: secBaths <= 1 ? "Bathroom" : `Bath ${i + 2}`, weight: 0.85 }));
    const maxLen = Math.max(bedsQ.length, bathsQ.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < bedsQ.length)  items.push(bedsQ[i]);
      if (i < bathsQ.length) items.push(bathsQ[i]);
    }
    items.push({ type: "laundry", label: "Laundry", weight: 0.75 });
    const totalWt = items.reduce((s, it) => s + it.weight, 0);
    let curY = y;
    items.forEach((item, idx) => {
      const itemH = idx === items.length - 1
        ? (y + h) - curY
        : Math.max(6, Math.round((item.weight / totalWt) * h));
      rooms.push({ type: item.type, label: item.label, x, y: curY, w, h: itemH });
      curY += itemH;
    });
  }
}

/**
 * Generate a tile-perfect floor plan from user preferences.
 * Style drives the room arrangement; bedrooms/bathrooms are distributed
 * proportionally so each gets adequate space.
 * Every cell in the bounding box is covered by exactly one room.
 */
function generateLocalFloorPlan(params) {
  const { targetSF, bedrooms, bathrooms, stories, style, garage } = params;
  const storyArea = Math.round(targetSF / (stories || 1));

  // Style-specific aspect ratio (width : depth)
  const ASPECT = { Ranch: 1.75, Colonial: 1.15, Modern: 1.35, Craftsman: 1.5, Mediterranean: 1.05 };
  const ratio = ASPECT[style] || 1.5;
  const depth = Math.max(20, Math.round(Math.sqrt(storyArea / ratio)));
  const width = Math.max(20, Math.round(storyArea / depth));

  const hasGarage = garage && garage !== "None" && garage !== "Detached";
  const garageW   = hasGarage ? Math.min(24, Math.max(14, Math.round(width * 0.28))) : 0;
  const mainW     = width - garageW;

  const rooms = [];

  // Dispatch to style-specific layout builder
  switch (style) {
    case "Colonial":      _buildColonial(rooms, mainW, depth, bedrooms, bathrooms);     break;
    case "Modern":        _buildModern(rooms, mainW, depth, bedrooms, bathrooms);       break;
    case "Mediterranean": _buildMediterranean(rooms, mainW, depth, bedrooms, bathrooms); break;
    case "Craftsman":     _buildCraftsman(rooms, mainW, depth, bedrooms, bathrooms);    break;
    default:              _buildRanch(rooms, mainW, depth, bedrooms, bathrooms);        break;
  }

  // Attached garage: front bay + office/storage behind
  if (hasGarage) {
    const gFrontH = Math.round(depth * 0.5);
    rooms.push({ type: "garage", label: garage === "3-car" ? "3-Car Garage" : "2-Car Garage",
      x: mainW, y: 0,         w: garageW, h: gFrontH          });
    rooms.push({ type: "office", label: "Home Office",
      x: mainW, y: gFrontH,   w: garageW, h: depth - gFrontH  });
  }

  // Detached garage sits off to the side of the main footprint
  if (garage === "Detached") {
    rooms.push({ type: "garage", label: "Detached Garage",
      x: width + 8, y: 0, w: 22, h: 22, bearing: [true, true, true, true] });
  }

  if (stories > 1) placeStairs(rooms, width, depth);

  const doors   = generateGarageDoors(rooms, width, depth);
  const score   = Math.round((0.82 + Math.random() * 0.15) * 100) / 100;
  return {
    id: `local-${Date.now()}`,
    width, depth, rooms, doors, windows: [],
    totalSF: rooms.reduce((s, r) => s + (r.w || 0) * (r.h || 0), 0),
    score, stories, style,
  };
}

/* ── Upper floor generator (story 2+): bedroom/bath focused, no garage ── */
function generateUpperFloorPlan(params, refPlan) {
  const { bedrooms, bathrooms, style, stories } = params;
  const width  = refPlan?.width  || 44;
  const depth  = refPlan?.depth  || 50;

  const rooms = [];

  // If zero bedrooms and bathrooms allocated, return an empty floor for user customization
  if (bedrooms === 0 && bathrooms === 0) {
    return {
      id: `upper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      width, depth, rooms: [], doors: [],
      windows: [],
      totalSF: 0,
      score: Math.round((0.7 + Math.random() * 0.25) * 100) / 100,
      stories, style,
    };
  }

  // Center hallway spine
  const hallW = Math.max(4, Math.round(width * 0.08));
  const hallX = Math.round(width / 2) - Math.round(hallW / 2);
  rooms.push({ type: "hallway", label: "Hall", x: hallX, y: 0, w: hallW, h: depth,
    bearing: [true, false, true, false] });

  // Left side: primary suite (only if bedrooms allocated)
  const leftW = hallX;
  if (bedrooms >= 1) {
    const primaryH = Math.round(depth * 0.55);
    rooms.push({ type: "bedroom", label: "Primary Bedroom",
      x: 0, y: 0, w: leftW, h: primaryH, bearing: [true, false, false, true] });

    if (bathrooms >= 1) {
      const enSuiteH = Math.round(depth * 0.22);
      rooms.push({ type: "bathroom", label: "Primary Bath",
        x: 0, y: primaryH, w: leftW, h: enSuiteH, bearing: [false, false, false, true] });
      const leftRemain = depth - primaryH - enSuiteH;
      if (leftRemain > 4) {
        rooms.push({ type: "laundry", label: "Laundry",
          x: 0, y: primaryH + enSuiteH, w: leftW, h: leftRemain, bearing: [false, false, true, true] });
      }
    } else {
      const leftRemain = depth - primaryH;
      if (leftRemain > 4) {
        rooms.push({ type: "closet", label: "Walk-in Closet",
          x: 0, y: primaryH, w: leftW, h: leftRemain, bearing: [false, false, true, true] });
      }
    }
  }
  // No bedrooms allocated — left side left blank for user customization

  // Right side: secondary bedrooms + shared bath
  const rightX = hallX + hallW;
  const rightW = width - rightX;
  const secBeds = Math.max(0, bedrooms - 1);
  if (secBeds > 0) {
    const bedH = Math.round((depth * 0.65) / secBeds);
    for (let i = 0; i < secBeds; i++) {
      rooms.push({ type: "bedroom", label: `Bedroom ${i + 2}`,
        x: rightX, y: i * bedH, w: rightW, h: bedH,
        bearing: [i === 0, true, false, false] });
    }
    const usedH = secBeds * bedH;
    const remainingBaths = Math.max(0, bathrooms - (bedrooms >= 1 ? 1 : 0));
    if (remainingBaths > 0) {
      const sharedBathH = Math.round((depth - usedH) * 0.65);
      if (sharedBathH > 4) {
        rooms.push({ type: "bathroom", label: remainingBaths >= 2 ? "Bath 2" : "Full Bath",
          x: rightX, y: usedH, w: rightW, h: sharedBathH, bearing: [false, true, false, false] });
      }
    }
  }
  // No secondary bedrooms — right side left blank for user customization
  // (remaining vertical space intentionally left empty — no closet auto-generated)

  return {
    id: `upper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    width, depth, rooms, doors: [],
    windows: [], // user-placed only — see note above
    totalSF: rooms.reduce((s, r) => s + r.w * r.h, 0),
    score: Math.round((0.7 + Math.random() * 0.25) * 100) / 100,
    stories, style,
  };
}

/* ───────────────── Room Furniture Silhouettes ──────────────── */

function drawRoomFurniture(ctx, type, rx, ry, rw, rh, strokeColor) {
  if (rw < 24 || rh < 24) return;
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = strokeColor;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.28;
  ctx.setLineDash([]);

  switch (type) {
    case "living": {
      const sw = Math.min(rw * 0.58, rh * 0.65, 52);
      const sh = sw * 0.44;
      // seat
      ctx.strokeRect(cx - sw / 2, cy - sh * 0.3, sw, sh * 0.6);
      // back
      ctx.strokeRect(cx - sw / 2, cy - sh * 0.3 - sh * 0.38, sw, sh * 0.38);
      // arms
      ctx.strokeRect(cx - sw / 2 - sh * 0.18, cy - sh * 0.3, sh * 0.18, sh * 0.6);
      ctx.strokeRect(cx + sw / 2, cy - sh * 0.3, sh * 0.18, sh * 0.6);
      break;
    }
    case "bedroom": {
      const bw = Math.min(rw * 0.62, 42);
      const bh = Math.min(rh * 0.65, 50);
      ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
      // headboard fill
      ctx.globalAlpha = 0.12;
      ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh * 0.2);
      ctx.globalAlpha = 0.28;
      ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh * 0.2);
      // pillows
      const pw = bw * 0.36, ph = bh * 0.14;
      ctx.strokeRect(cx - bw / 2 + bw * 0.05, cy - bh / 2 + bh * 0.23, pw, ph);
      ctx.strokeRect(cx + bw * 0.09, cy - bh / 2 + bh * 0.23, pw, ph);
      break;
    }
    case "kitchen": {
      const kw = Math.min(rw * 0.52, 38);
      const kh = Math.min(rh * 0.38, 20);
      ctx.strokeRect(cx - kw / 2, cy - kh / 2, kw, kh);
      // burners
      const br = Math.min(kw, kh) * 0.1;
      [[-0.26, -0.18], [0.26, -0.18], [-0.26, 0.18], [0.26, 0.18]].forEach(([dx, dy]) => {
        ctx.beginPath(); ctx.arc(cx + dx * kw, cy + dy * kh, br, 0, Math.PI * 2); ctx.stroke();
      });
      break;
    }
    case "dining": {
      const tr = Math.min(rw * 0.26, rh * 0.3, 18);
      ctx.beginPath(); ctx.arc(cx, cy, tr, 0, Math.PI * 2); ctx.stroke();
      const cr = tr * 0.3;
      [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].forEach((a) => {
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * (tr + cr * 1.3), cy + Math.sin(a) * (tr + cr * 1.3), cr, 0, Math.PI * 2);
        ctx.stroke();
      });
      break;
    }
    case "garage": {
      const aw = Math.min(rw * 0.52, 50);
      const ah = Math.min(rh * 0.52, 34);
      ctx.strokeRect(cx - aw / 2, cy - ah / 2, aw, ah);
      // windshield lines
      ctx.beginPath();
      ctx.moveTo(cx - aw / 2 + aw * 0.15, cy - ah / 2 + ah * 0.22);
      ctx.lineTo(cx + aw / 2 - aw * 0.15, cy - ah / 2 + ah * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - aw / 2 + aw * 0.15, cy + ah / 2 - ah * 0.22);
      ctx.lineTo(cx + aw / 2 - aw * 0.15, cy + ah / 2 - ah * 0.22);
      ctx.stroke();
      // wheels
      const wr = ah * 0.11;
      [[-0.32, -0.35], [0.32, -0.35], [-0.32, 0.35], [0.32, 0.35]].forEach(([dx, dy]) => {
        ctx.beginPath(); ctx.arc(cx + dx * aw, cy + dy * ah, wr, 0, Math.PI * 2); ctx.stroke();
      });
      break;
    }
    case "bathroom": {
      // toilet bowl
      const tw = Math.min(rw * 0.38, rh * 0.38, 18);
      ctx.beginPath();
      ctx.ellipse(cx, cy + rh * 0.05, tw * 0.42, tw * 0.52, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(cx - tw * 0.32, cy - rh * 0.05 - tw * 0.55, tw * 0.64, tw * 0.28);
      break;
    }
    case "stair": {
      // Draw stair treads (horizontal lines ascending)
      const pad = Math.min(rw, rh) * 0.1;
      const sx = rx + pad, sy = ry + pad;
      const sw = rw - pad * 2, sh = rh - pad * 2;
      const steps = Math.max(3, Math.min(8, Math.round(sh / 6)));
      const stepH = sh / steps;
      for (let i = 0; i <= steps; i++) {
        ctx.beginPath();
        ctx.moveTo(sx, sy + i * stepH);
        ctx.lineTo(sx + sw, sy + i * stepH);
        ctx.stroke();
      }
      // Arrow indicating up direction
      const arrX = sx + sw / 2;
      ctx.beginPath();
      ctx.moveTo(arrX, sy + sh * 0.85);
      ctx.lineTo(arrX, sy + sh * 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(arrX - sw * 0.12, sy + sh * 0.32);
      ctx.lineTo(arrX, sy + sh * 0.2);
      ctx.lineTo(arrX + sw * 0.12, sy + sh * 0.32);
      ctx.stroke();
      break;
    }
    default: break;
  }
  ctx.restore();
}

function drawPlacedItem(ctx, item, toCanvas, ftToPx, isSelected = false) {
  const [ix, iy] = toCanvas(item.x, item.y);
  const iw = ftToPx(item.w);
  const ih = ftToPx(item.h);
  if (iw < 2 || ih < 2) return;

  ctx.save();

  if (item.isRoom) {
    /* ── Room block (preset-generated or user-dropped) ── */
    const colorKey = item.type === "dining-room" ? "dining" : item.type;
    const col = ROOM_COLORS[colorKey] || ROOM_COLORS.hallway;

    ctx.fillStyle = isSelected ? col.fill.replace(/[\d.]+\)$/, "0.38)") : col.fill;
    ctx.fillRect(ix, iy, iw, ih);

    ctx.strokeStyle = col.stroke;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(ix, iy, iw, ih);

    if (isSelected) {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(ix - 3, iy - 3, iw + 6, ih + 6);
      ctx.setLineDash([]);
    }

    drawRoomFurniture(ctx, colorKey, ix, iy, iw, ih, col.stroke);

    const lsz = Math.max(8, Math.min(13, iw / 8));
    const displayLabel = item.label || (item.type.charAt(0).toUpperCase() + item.type.slice(1).replace("-room", " Room"));

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = col.stroke;
    ctx.font = `600 ${lsz}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(displayLabel, ix + iw / 2, iy + ih / 2 - lsz * 0.6);

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "rgba(200,208,224,0.55)";
    ctx.font = `${Math.max(7, lsz - 2)}px 'JetBrains Mono', monospace`;
    ctx.fillText(`${Math.round(item.w * item.h)} sf`, ix + iw / 2, iy + ih / 2 + lsz * 0.55);

    if (isSelected) {
      ctx.globalAlpha = 0.4;
      ctx.font = `${Math.max(6, lsz - 3)}px 'JetBrains Mono', monospace`;
      ctx.fillText(`${item.w}'×${item.h}'`, ix + iw / 2, iy + ih / 2 + lsz * 1.85);
    }
  } else if (item.isCustom) {
    /* ── User-created custom block ── */
    const _CAT_C = { living: "#00d4ff", work: "#3b82f6", utility: "#ff9f43" };
    const _color = item.customColor || _CAT_C[item.category] || "#00d4ff";
    // Parse hex → r,g,b so any arbitrary color works
    const _hexToRgb = (hex) => {
      const h = hex.replace("#", "");
      const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
      const n = parseInt(full.slice(0, 6), 16);
      return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
    };
    const _rgb = _hexToRgb(_color);
    ctx.fillStyle = isSelected ? `rgba(${_rgb},0.28)` : `rgba(${_rgb},0.15)`;
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeStyle = _color;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(ix, iy, iw, ih);
    if (isSelected) {
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(ix - 3, iy - 3, iw + 6, ih + 6);
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = _color;
    ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(item.blockId || (item.label + "*"), ix + 4, iy + ih - 4);
    const _lsz = Math.max(8, Math.min(13, iw / 8));
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = _color;
    ctx.font = `600 ${_lsz}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(item.label, ix + iw / 2, iy + ih / 2 - _lsz * 0.6);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "rgba(200,208,224,0.55)";
    ctx.font = `${Math.max(7, _lsz - 2)}px 'JetBrains Mono', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round(item.w * item.h)} sf`, ix + iw / 2, iy + ih / 2 + _lsz * 0.55);
    if (isSelected) {
      ctx.globalAlpha = 0.4;
      ctx.font = `${Math.max(6, _lsz - 3)}px 'JetBrains Mono', monospace`;
      ctx.fillText(`${item.w}'×${item.h}'`, ix + iw / 2, iy + ih / 2 + _lsz * 1.85);
    }
  } else {
    /* ── Library element (door, furniture, glazing…) ── */
    const ITEM_ICONS = {
      sofa: "armchair", tv: "tv",
      bed: "bed",       dresser: "dresser",
      oven: "oven",     fridge: "fridge",
      toilet: "toilet", shower: "shower", washer: "washer",
      table: "table",
      door: "door",     garage: "garagei",
      stair: "stair",   window: "window",   dryer: "washer",
    };
    const isFurniture = !!(ITEM_ROOM_CONSTRAINT[item.type] && ITEM_ROOM_CONSTRAINT[item.type] !== "__edge__");
    const iconName = ITEM_ICONS[item.type] || null;
    const accentColor = ITEM_ACCENT_COLOR[item.type] || "#00d4ff";
    const COLOR_RGB = {
      "#2ed573": "46,213,115",  "#3b82f6": "59,130,246",  "#ff9f43": "255,159,67",
      "#00d4ff": "0,212,255",   "#8a9bb0": "138,155,176",  "#6b7a90": "107,122,144",
      "#e8ecf4": "232,236,244", "#a8c4e0": "168,196,224",  "#5a6580": "90,101,128",
    };
    const rgbBase = COLOR_RGB[accentColor] || "0,212,255";

    ctx.fillStyle = isSelected ? `rgba(${rgbBase},0.16)` : `rgba(${rgbBase},0.07)`;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = isSelected ? 2 : 1.5;
    if (!isSelected) ctx.setLineDash([4, 3]);
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeRect(ix, iy, iw, ih);
    ctx.setLineDash([]);

    if (iconName && iw > 12 && ih > 12) {
      ctx.globalAlpha = 0.85;
      let iconW, iconH, iconX, iconY;
      {
        iconH = isFurniture && iw > 30 ? ih * 0.72 : ih * 0.88;
        iconW = iw * 0.8; iconX = ix + iw * 0.1; iconY = iy + (ih - iconH) / 2;
      }
      _drawIcon(ctx, iconName, accentColor, iconX, iconY, iconW, iconH);

      // Label below icon for furniture
      if (isFurniture && iw > 30 && ih > 28) {
        ctx.globalAlpha = 0.65;
        const lfs = Math.max(7, Math.min(10, iw / 6));
        ctx.font = `500 ${lfs}px Inter, sans-serif`;
        ctx.fillStyle = "#a8c4e0";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const typeLabels = { sofa: "Sofa", bed: "Bed", oven: "Oven", table: "Table", washer: "Washer" };
        ctx.fillText(typeLabels[item.type] || item.type, ix + iw / 2, iy + ih - lfs - 3);
      }
    } else if (!iconName) {
      // Text fallback for glazing, stair
      ctx.globalAlpha = 0.85;
      const fs = Math.max(7, Math.min(11, iw / 5));
      ctx.font = `600 ${fs}px Inter, sans-serif`;
      ctx.fillStyle = accentColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.type.charAt(0).toUpperCase() + item.type.slice(1), ix + iw / 2, iy + ih / 2);
    }

    if (isSelected && iw > 28) {
      ctx.globalAlpha = 0.5;
      const sfs = Math.max(6, Math.min(9, iw / 7));
      ctx.font = `${sfs}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = accentColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${item.w}'×${item.h}'`, ix + iw / 2, iy + ih - sfs - 3);
    }
  }

  /* ── Resize handles (shared by rooms and elements) ── */
  if (isSelected) {
    const hs = 7;
    const handleColor = item.isRoom
      ? (ROOM_COLORS[item.type === "dining-room" ? "dining" : item.type]?.stroke || "#e8ecf4")
      : "#00d4ff";
    const hpts = [
      [ix,          iy         ], [ix + iw / 2, iy         ], [ix + iw,     iy         ],
      [ix + iw,     iy + ih / 2], [ix + iw,     iy + ih    ], [ix + iw / 2, iy + ih    ],
      [ix,          iy + ih    ], [ix,          iy + ih / 2],
    ];
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0d1117";
    ctx.strokeStyle = handleColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    hpts.forEach(([hx, hy]) => {
      ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
      ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
    });
  }

  ctx.restore();
}

const _HANDLE_NAMES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function getHandleAt(mx, my, item, scale, offX, offY) {
  const ix = offX + item.x * PX_PER_FT * scale;
  const iy = offY + item.y * PX_PER_FT * scale;
  const iw = item.w * PX_PER_FT * scale;
  const ih = item.h * PX_PER_FT * scale;
  const hs = 9;
  const pts = [
    [ix,          iy         ],
    [ix + iw / 2, iy         ],
    [ix + iw,     iy         ],
    [ix + iw,     iy + ih / 2],
    [ix + iw,     iy + ih    ],
    [ix + iw / 2, iy + ih    ],
    [ix,          iy + ih    ],
    [ix,          iy + ih / 2],
  ];
  for (let i = 0; i < pts.length; i++) {
    if (Math.abs(mx - pts[i][0]) <= hs && Math.abs(my - pts[i][1]) <= hs) return _HANDLE_NAMES[i];
  }
  return null;
}

function isOnPlacedItem(mx, my, item, scale, offX, offY) {
  const ix = offX + item.x * PX_PER_FT * scale;
  const iy = offY + item.y * PX_PER_FT * scale;
  const iw = item.w * PX_PER_FT * scale;
  const ih = item.h * PX_PER_FT * scale;
  return mx >= ix && mx <= ix + iw && my >= iy && my <= iy + ih;
}

/* ───────────────────── Canvas Renderer ─────────────────────── */

function renderFloorPlan(canvas, plan, hoveredRoom, zoom = 1.0, placedItems = [], selectedItemIdx = -1, annotations = [], panOffset = { x: 0, y: 0 }, drawingPreview = null, selectedAnnotIdx = -1) {
  if (!canvas || !plan) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const cw = rect.width;
  const ch = rect.height;

  // Fit plan into canvas with padding
  const pad = 60;
  const planPxW = plan.width * PX_PER_FT;
  const planPxH = plan.depth * PX_PER_FT;
  const scaleX = (cw - pad * 2) / planPxW;
  const scaleY = (ch - pad * 2) / planPxH;
  const scale = Math.min(scaleX, scaleY, 3) * zoom;
  const offX = (cw - planPxW * scale) / 2 + panOffset.x;
  const offY = (ch - planPxH * scale) / 2 + panOffset.y;

  const toCanvas = (ftX, ftY) => [offX + ftX * PX_PER_FT * scale, offY + ftY * PX_PER_FT * scale];
  const ftToPx = (ft) => ft * PX_PER_FT * scale;

  // Clear
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, cw, ch);

  // Grid
  ctx.strokeStyle = "rgba(42, 53, 72, 0.3)";
  ctx.lineWidth = 0.5;
  const gridStep = GRID_PX * scale;
  if (gridStep > 1.5) {
    for (let gx = offX; gx <= offX + planPxW * scale; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(gx, offY);
      ctx.lineTo(gx, offY + planPxH * scale);
      ctx.stroke();
    }
    for (let gy = offY; gy <= offY + planPxH * scale; gy += gridStep) {
      ctx.beginPath();
      ctx.moveTo(offX, gy);
      ctx.lineTo(offX + planPxW * scale, gy);
      ctx.stroke();
    }
  }

  // Major grid (every 5ft)
  ctx.strokeStyle = "rgba(42, 53, 72, 0.6)";
  ctx.lineWidth = 0.5;
  const majorStep = 5 * PX_PER_FT * scale;
  for (let gx = offX; gx <= offX + planPxW * scale; gx += majorStep) {
    ctx.beginPath();
    ctx.moveTo(gx, offY - 4);
    ctx.lineTo(gx, offY + planPxH * scale + 4);
    ctx.stroke();
  }
  for (let gy = offY; gy <= offY + planPxH * scale; gy += majorStep) {
    ctx.beginPath();
    ctx.moveTo(offX - 4, gy);
    ctx.lineTo(offX + planPxW * scale + 4, gy);
    ctx.stroke();
  }

  // Exterior dimension annotations
  ctx.setLineDash([]);
  const dimOff = 18;

  // Top dimension
  drawDimension(ctx, offX, offY - dimOff, offX + planPxW * scale, offY - dimOff, `${plan.width}'`);
  // Left dimension
  drawDimension(ctx, offX - dimOff, offY, offX - dimOff, offY + planPxH * scale, `${plan.depth}'`, { horizontal: false });

  // Per-room top dimensions
  const topRooms = plan.rooms
    .filter((r) => r.y === 0)
    .sort((a, b) => a.x - b.x);
  topRooms.forEach((room) => {
    const [rx] = toCanvas(room.x, 0);
    const rw = ftToPx(room.w);
    if (rw > 30) {
      drawDimension(ctx, rx, offY - dimOff * 2.2, rx + rw, offY - dimOff * 2.2, `${room.w}'`, { minor: true });
    }
  });

  // Placed items (drag-dropped from library)
  placedItems.forEach((item, idx) => drawPlacedItem(ctx, item, toCanvas, ftToPx, idx === selectedItemIdx));

  // User annotations (dimension lines, wall segments, labels, live preview)
  const allAnnotations = drawingPreview ? [...annotations, drawingPreview] : annotations;
  allAnnotations.forEach((ann, annIdx) => {
    const isSelected = annIdx === selectedAnnotIdx && !ann.preview;
    if (ann.type === "wall") {
      const [ax1, ay1] = toCanvas(ann.x1, ann.y1);
      const [ax2, ay2] = toCanvas(ann.x2, ann.y2);
      ctx.save();
      if (isSelected) {
        ctx.strokeStyle = "rgba(0,212,255,0.5)";
        ctx.lineWidth = 8;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2); ctx.stroke();
      }
      ctx.strokeStyle = ann.preview ? "rgba(200,208,224,0.6)" : "#c8d0e0";
      ctx.lineWidth = ann.preview ? 2 : 4;
      ctx.lineCap = "round";
      if (ann.preview) ctx.setLineDash([6, 3]);
      ctx.beginPath(); ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2); ctx.stroke();
      ctx.setLineDash([]);
      if (isSelected) {
        ctx.fillStyle = "#00d4ff";
        [[ax1, ay1], [ax2, ay2]].forEach(([x, y]) => {
          ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        });
      }
      ctx.restore();
    } else if (ann.type === "dimension") {
      const [ax1, ay1] = toCanvas(ann.x1, ann.y1);
      const [ax2, ay2] = toCanvas(ann.x2, ann.y2);
      const ddx = ann.x2 - ann.x1, ddy = ann.y2 - ann.y1;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      const distLabel = dist < 1 ? `${Math.round(dist * 12)}"` : `${dist.toFixed(1)}'`;
      const dimAngle = Math.atan2(ay2 - ay1, ax2 - ax1);
      ctx.save();
      if (isSelected) {
        ctx.strokeStyle = "rgba(0,212,255,0.4)";
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2); ctx.stroke();
      }
      ctx.strokeStyle = ann.preview ? "rgba(0,212,255,0.5)" : "#00d4ff";
      ctx.lineWidth = 1;
      if (ann.preview) ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2); ctx.stroke();
      ctx.setLineDash([]);
      if (!ann.preview) {
        const aLen = 7;
        ctx.fillStyle = "#00d4ff";
        [[ax1, ay1, dimAngle + Math.PI], [ax2, ay2, dimAngle]].forEach(([x, y, a]) => {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - aLen * Math.cos(a - 0.4), y - aLen * Math.sin(a - 0.4));
          ctx.lineTo(x - aLen * Math.cos(a + 0.4), y - aLen * Math.sin(a + 0.4));
          ctx.closePath(); ctx.fill();
        });
      }
      const midX = (ax1 + ax2) / 2, midY = (ay1 + ay2) / 2;
      ctx.save();
      ctx.translate(midX, midY);
      ctx.rotate(dimAngle);
      ctx.fillStyle = "rgba(13,17,23,0.85)";
      ctx.fillRect(-18, -9, 36, 16);
      ctx.fillStyle = ann.preview ? "rgba(0,212,255,0.6)" : "#00d4ff";
      ctx.font = "bold 10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(distLabel, 0, 2);
      ctx.restore();
      if (isSelected) {
        ctx.fillStyle = "#00d4ff";
        [[ax1, ay1], [ax2, ay2]].forEach(([x, y]) => {
          ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        });
      }
      ctx.restore();
    } else if (ann.type === "label") {
      const [ax, ay] = toCanvas(ann.x, ann.y);
      ctx.save();
      ctx.font = "600 12px Inter, sans-serif";
      const tw = ctx.measureText(ann.text).width;
      if (isSelected) {
        ctx.strokeStyle = "#00d4ff";
        ctx.lineWidth = 2;
        ctx.strokeRect(ax - tw / 2 - 6, ay - 12, tw + 12, 24);
      }
      ctx.fillStyle = "rgba(13,17,23,0.85)";
      ctx.fillRect(ax - tw / 2 - 4, ay - 10, tw + 8, 20);
      ctx.strokeStyle = isSelected ? "#00d4ff" : "#2a3548";
      ctx.lineWidth = 1;
      ctx.strokeRect(ax - tw / 2 - 4, ay - 10, tw + 8, 20);
      ctx.fillStyle = "#e8ecf4";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(ann.text, ax, ay);
      ctx.restore();
    }
  });
}

function drawDimension(ctx, x1, y1, x2, y2, label, { horizontal = true, minor = false } = {}) {
  const len = horizontal ? x2 - x1 : y2 - y1;
  if (len < 20) return;

  ctx.strokeStyle = minor ? "rgba(200, 208, 224, 0.25)" : "rgba(200, 208, 224, 0.45)";
  ctx.lineWidth = minor ? 0.5 : 0.75;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Tick marks
  const tick = 4;
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(x1, y1 - tick); ctx.lineTo(x1, y1 + tick);
    ctx.moveTo(x2, y2 - tick); ctx.lineTo(x2, y2 + tick);
  } else {
    ctx.moveTo(x1 - tick, y1); ctx.lineTo(x1 + tick, y1);
    ctx.moveTo(x2 - tick, y2); ctx.lineTo(x2 + tick, y2);
  }
  ctx.stroke();

  // Label
  ctx.fillStyle = minor ? "rgba(200, 208, 224, 0.4)" : "rgba(200, 208, 224, 0.65)";
  ctx.font = `${minor ? 8 : 10}px 'JetBrains Mono', monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (horizontal) {
    ctx.fillText(label, (x1 + x2) / 2, y1 - 8);
  } else {
    ctx.save();
    ctx.translate(x1 - 8, (y1 + y2) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

function drawCompass(ctx, cx, cy) {
  const r = 14;
  ctx.strokeStyle = "rgba(200, 208, 224, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // N arrow
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 2);
  ctx.lineTo(cx - 3, cy - 2);
  ctx.lineTo(cx + 3, cy - 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(200, 208, 224, 0.5)";
  ctx.font = "bold 7px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", cx, cy + 4);
}

/* ───────────────────── SVG Icon Helpers ────────────────────── */

function SelectIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 3l4.5 12 2.5-4.5L15 8z" stroke={active ? "#00d4ff" : "#5a6580"} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
function WallIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="7" width="14" height="4" stroke={active ? "#00d4ff" : "#5a6580"} strokeWidth="1.5" />
      <line x1="7" y1="7" x2="7" y2="11" stroke={active ? "#00d4ff" : "#5a6580"} strokeWidth="1" />
      <line x1="11" y1="7" x2="11" y2="11" stroke={active ? "#00d4ff" : "#5a6580"} strokeWidth="1" />
    </svg>
  );
}
function DimensionIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <line x1="3" y1="9" x2="15" y2="9" stroke={active ? "#00d4ff" : "#5a6580"} strokeWidth="1.5" />
      <line x1="3" y1="6" x2="3" y2="12" stroke={active ? "#00d4ff" : "#5a6580"} strokeWidth="1.5" />
      <line x1="15" y1="6" x2="15" y2="12" stroke={active ? "#00d4ff" : "#5a6580"} strokeWidth="1.5" />
    </svg>
  );
}
function LabelIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <text x="3" y="13" fontFamily="sans-serif" fontSize="11" fontWeight="700" fill={active ? "#00d4ff" : "#5a6580"}>T</text>
      <line x1="3" y1="15" x2="15" y2="15" stroke={active ? "#00d4ff" : "#5a6580"} strokeWidth="1" />
    </svg>
  );
}
function PanIcon({ active }) {
  const c = active ? "#00d4ff" : "#5a6580";
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="1" fill={c} />
      <path d="M9 1.5 7.2 4.5h3.6z" fill={c} />
      <path d="M9 16.5l-1.8-3h3.6z" fill={c} />
      <path d="M1.5 9l3-1.8v3.6z" fill={c} />
      <path d="M16.5 9l-3-1.8v3.6z" fill={c} />
      <line x1="9" y1="3" x2="9" y2="15" stroke={c} strokeWidth="0.8" strokeLinecap="round" />
      <line x1="3" y1="9" x2="15" y2="9" stroke={c} strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="#5a6580" strokeWidth="1.2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.54 11.54l1.41 1.41M3.05 12.95l1.42-1.42M11.54 4.46l1.41-1.41" stroke="#5a6580" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function BlockIcon({ type }) {
  const c = "#5a6580";
  const icons = {
    door: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="6" y="4" width="12" height="20" stroke={c} strokeWidth="1.5" />
        <path d="M18 4 Q24 14 18 24" stroke="#00d4ff" strokeWidth="1.2" fill="none" />
        <line x1="18" y1="4" x2="18" y2="24" stroke={c} strokeWidth="1.5" />
      </svg>
    ),
    glazing: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="5" y="8" width="18" height="12" stroke={c} strokeWidth="1.5" />
        <line x1="14" y1="8" x2="14" y2="20" stroke={c} strokeWidth="1" />
        <line x1="5" y1="14" x2="23" y2="14" stroke={c} strokeWidth="1" />
        <rect x="5" y="8" width="18" height="12" fill="rgba(0,212,255,0.08)" />
      </svg>
    ),
    stair: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <polyline points="6,22 6,16 10,16 10,12 14,12 14,8 18,8 18,6 22,6" stroke={c} strokeWidth="1.5" fill="none" />
      </svg>
    ),
    garage: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="4" y="12" width="20" height="12" stroke={c} strokeWidth="1.5" />
        <polyline points="4,12 14,5 24,12" stroke={c} strokeWidth="1.5" fill="none" />
        <line x1="4" y1="16" x2="24" y2="16" stroke={c} strokeWidth="1" />
        <line x1="4" y1="19" x2="24" y2="19" stroke={c} strokeWidth="1" />
      </svg>
    ),
    sofa: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="5" y="14" width="18" height="8" rx="2" stroke={c} strokeWidth="1.5" />
        <rect x="5" y="10" width="18" height="5" rx="1" stroke={c} strokeWidth="1.5" />
        <rect x="3" y="13" width="4" height="9" rx="1" stroke={c} strokeWidth="1.2" />
        <rect x="21" y="13" width="4" height="9" rx="1" stroke={c} strokeWidth="1.2" />
      </svg>
    ),
    dining: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <ellipse cx="14" cy="14" rx="7" ry="5" stroke={c} strokeWidth="1.5" />
        <rect x="7" y="6" width="4" height="3" rx="1" stroke={c} strokeWidth="1.2" />
        <rect x="17" y="6" width="4" height="3" rx="1" stroke={c} strokeWidth="1.2" />
        <rect x="7" y="19" width="4" height="3" rx="1" stroke={c} strokeWidth="1.2" />
        <rect x="17" y="19" width="4" height="3" rx="1" stroke={c} strokeWidth="1.2" />
      </svg>
    ),
    bed: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="5" y="8" width="18" height="14" rx="1" stroke={c} strokeWidth="1.5" />
        <rect x="5" y="8" width="18" height="5" rx="1" stroke={c} strokeWidth="1.2" fill="rgba(90,101,128,0.2)" />
        <rect x="7" y="14" width="6" height="5" rx="1" stroke={c} strokeWidth="1" />
        <rect x="15" y="14" width="6" height="5" rx="1" stroke={c} strokeWidth="1" />
      </svg>
    ),
    desk: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="4" y="10" width="16" height="10" stroke={c} strokeWidth="1.5" />
        <rect x="18" y="14" width="6" height="6" stroke={c} strokeWidth="1.5" />
        <line x1="4" y1="20" x2="4" y2="24" stroke={c} strokeWidth="1.5" />
        <line x1="20" y1="20" x2="20" y2="24" stroke={c} strokeWidth="1.5" />
      </svg>
    ),
    island: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="6" y="9" width="16" height="10" rx="1" stroke={c} strokeWidth="1.5" />
        <circle cx="14" cy="14" r="2" stroke="#00d4ff" strokeWidth="1" />
        <line x1="10" y1="14" x2="12" y2="14" stroke={c} strokeWidth="1" />
        <line x1="16" y1="14" x2="18" y2="14" stroke={c} strokeWidth="1" />
      </svg>
    ),
  };
  return icons[type] || null;
}

/* ─── Distribute bedrooms/bathrooms evenly across n stories ─── *
 *  Ground floor gets base allocation (at least 1 if any exist).
 *  Remaining rooms are spread across upper floors, remainder to highest.
 *  Examples:
 *    1 bed / 1 bath / 2 floors → [1/1, 0/0]
 *    2 bed / 2 bath / 2 floors → [1/1, 1/1]
 *    3 bed / 3 bath / 2 floors → [1/1, 2/2]
 *    4 bed / 4 bath / 2 floors → [2/2, 2/2]
 *    3 bed / 3 bath / 3 floors → [1/1, 1/1, 1/1]
 *    5 bed / 3 bath / 3 floors → [1/1, 2/1, 2/1]
 */
function computeFloorAllocation(stories, bedrooms, bathrooms) {
  const n = Math.max(1, stories);
  if (n === 1) return [{ beds: bedrooms, baths: bathrooms }];

  // Ground floor: base share, but at least 1 if total > 0
  const bedFloor1  = bedrooms  > 0 ? Math.max(1, Math.floor(bedrooms  / n)) : 0;
  const bathFloor1 = bathrooms > 0 ? Math.max(1, Math.floor(bathrooms / n)) : 0;

  // Distribute the rest across upper floors
  const upperCount    = n - 1;
  const bedRemaining  = bedrooms  - bedFloor1;
  const bathRemaining = bathrooms - bathFloor1;
  const bedBase   = Math.floor(bedRemaining  / upperCount);
  const bedRem    = bedRemaining  % upperCount;
  const bathBase  = Math.floor(bathRemaining / upperCount);
  const bathRem   = bathRemaining % upperCount;

  const result = [{ beds: bedFloor1, baths: bathFloor1 }];
  for (let i = 0; i < upperCount; i++) {
    result.push({
      beds:  bedBase  + (i >= upperCount - bedRem  ? 1 : 0),
      baths: bathBase + (i >= upperCount - bathRem ? 1 : 0),
    });
  }
  return result;
}

/* ───────────────────── Component ───────────────────────────── */

export default function FloorPlanEditor() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const project = useProject();
  const { isHomeowner } = useUserType();

  const [params, setParams] = useState(() => project.generateParams ?? { ...DEFAULT_PARAMS });
  const [allStoryVariants, setAllStoryVariants] = useState(() => {
    if (project.storyPlans.length > 0) return project.storyPlans.map((p) => [p]);
    if (project.allVariants.length > 0) return [project.allVariants];
    if (project.floorPlan) return [[project.floorPlan]];
    return [[]];
  });
  const [activeStory, setActiveStory] = useState(0);
  const [activeVariantPerStory, setActiveVariantPerStory] = useState([0]);
  const [hoveredRoom, setHoveredRoom] = useState(null);

  // UI state
  const [activeTool, setActiveTool] = useState("select");
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [annotations, setAnnotations] = useState([]);
  const [editingLabel, setEditingLabel] = useState(null); // { xFt, yFt, xPx, yPx, text }
  const [drawingPreview, setDrawingPreview] = useState(null);
  const [selectedAnnotationIdx, setSelectedAnnotationIdx] = useState(-1);
  const panDragRef = useRef(null);    // { startMx, startMy, startPanX, startPanY }
  const drawStartRef = useRef(null);  // { type, x1, y1 } in ft-space
  const drawPreviewRef = useRef(null); // mirrors drawingPreview (ref for stable callbacks)
  const previewCanvasRef = useRef(null); // custom block modal preview canvas
  const [libTab, setLibTab] = useState("elements");
  const [zoom, setZoom] = useState(1.4); // 1:35 default scale
  const [saving, setSaving] = useState(false);
  const [showParamsModal, setShowParamsModal] = useState(false);
  // Draft copy of params used inside the settings modal — only committed on "Regenerate"
  const [draftParams, setDraftParams] = useState(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customBlocks, setCustomBlocks] = useState([]);
  const [customDraft, setCustomDraft] = useState({ name: "", w: 12, h: 10, category: "living", color: "#00d4ff" });
  const [placedItems, setPlacedItems] = useState([]);
  // Persisted placed-items per story index so switching floors restores the user's work
  const floorItemsRef = useRef({});
  const [dragOver, setDragOver] = useState(false);
  const [selectedItemIdx, setSelectedItemIdx] = useState(-1);
  const [canvasCursor, setCanvasCursor] = useState("default");
  const dragStateRef = useRef(null);
  const [toastMsg, setToastMsg] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2400);
  }, []);

  // Track unsaved changes — set dirty on any user edit, cleared on save
  const [isDirty, setIsDirty] = useState(false);
  const savedRef = useRef(false); // true when navigating after successful save

  const variants = allStoryVariants[activeStory] || [];
  const activeVariant = activeVariantPerStory[activeStory] ?? 0;
  const activePlan = variants[activeVariant] || null;
  const numStories = params.stories || 1;

  /* ── Unsaved changes: block navigation ── */
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (savedRef.current) return false; // allow navigation after save
    return isDirty && currentLocation.pathname !== nextLocation.pathname;
  });

  /* ── Unsaved changes: block browser tab close ── */
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  /* Sync to store */
  useEffect(() => {
    if (activePlan) {
      project.setFloorPlan(activePlan);
      project.setGenerateParams(params);
    }
  }, [activePlan]);

  /* Also sync params to the store whenever they change (e.g. SF slider moves),
   * so values survive navigation to the 3D model and back. */
  useEffect(() => {
    project.setGenerateParams(params);
  }, [params]);

  /* Build preset layout on mount from project params */
  const hasAutoGenerated = useRef(false);
  useEffect(() => {
    if (!hasAutoGenerated.current && allStoryVariants[0]?.length === 0) {
      hasAutoGenerated.current = true;
      handleGenerate(params);
      // Don't mark dirty for the initial auto-generation
      setIsDirty(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* When the active plan changes (new generation or variant switch), load its
     rooms as interactive placedItems so the user can drag/resize/delete them.
     Per-floor state is saved in floorItemsRef so switching floors is non-destructive. */
  const prevPlanIdRef = useRef(null);
  const prevStoryRef = useRef(activeStory);
  useEffect(() => {
    if (!activePlan) return;
    const storyChanged = prevStoryRef.current !== activeStory;
    const planChanged  = activePlan.id !== prevPlanIdRef.current;
    if (!storyChanged && !planChanged) return;
    // Save current floor's items before switching
    if (storyChanged) {
      floorItemsRef.current[prevStoryRef.current] = placedItems;
      prevStoryRef.current = activeStory;
    }
    prevPlanIdRef.current = activePlan.id;
    // Restore saved items for this floor, or seed from plan rooms
    const saved = floorItemsRef.current[activeStory];
    if (saved && saved.length > 0) {
      setPlacedItems(saved);
    } else if (activePlan.placed_items && activePlan.placed_items.length > 0) {
      // Restore all previously placed items (rooms + custom blocks/furniture)
      setPlacedItems(activePlan.placed_items);
    } else {
      const stamp = Date.now();
      setPlacedItems(
        activePlan.rooms.map((r, i) => ({ id: `room-${stamp}-${i}`, isRoom: true, ...r }))
      );
    }
    setSelectedItemIdx(-1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlan, activeStory]);

  /* ─── Custom block preview renderer ─── */
  const renderCustomPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const cw = rect.width, ch = rect.height;

    ctx.fillStyle = "#0a0e1a"; ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = "rgba(42,53,72,0.8)";
    const dot = 13;
    for (let x = dot; x < cw; x += dot)
      for (let y = dot; y < ch; y += dot) { ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill(); }

    const CAT_PX = { living: "LVG", work: "WRK", utility: "UTL" };
    const color  = customDraft.color || "#00d4ff";
    const prefix = CAT_PX[customDraft.category] || "CST";
    const blockId = `${prefix}_BLK_01*`;

    const topPad = 42, rightPad = 40, botPad = 16, leftPad = 16;
    const avW = cw - leftPad - rightPad, avH = ch - topPad - botPad;
    const scl = Math.min(avW / Math.max(customDraft.w * PX_PER_FT, 1),
                         avH / Math.max(customDraft.h * PX_PER_FT, 1), 5);
    const bw = customDraft.w * PX_PER_FT * scl;
    const bh = customDraft.h * PX_PER_FT * scl;
    const bx = leftPad + (avW - bw) / 2;
    const by = topPad  + (avH - bh) / 2;

    ctx.fillStyle = `${color}1A`; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(bx + bw / 2, by + bh / 2, 3, 0, Math.PI * 2); ctx.fill();

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#c8d0e0";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText(blockId, bx + 4, by + bh - 4);
    ctx.globalAlpha = 1;

    // 2D_TOP badge
    const bx2 = 8, by2 = 8, bw2 = 46, bh2 = 18;
    ctx.fillStyle = "rgba(0,212,255,0.18)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx2, by2, bw2, bh2, 3); else ctx.rect(bx2, by2, bw2, bh2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,212,255,0.5)"; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.fillStyle = "#00d4ff"; ctx.font = "bold 8px 'JetBrains Mono', monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("2D_TOP", bx2 + bw2 / 2, by2 + bh2 / 2);

    ctx.fillStyle = "rgba(200,208,224,0.6)";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(`SCALE: 1:50  ${customDraft.w.toFixed(1)}'`, bx2 + bw2 + 6, by2 + bh2 / 2);

    // Depth tick + label (right)
    ctx.strokeStyle = "rgba(200,208,224,0.25)"; ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(bx + bw + 14, by); ctx.lineTo(bx + bw + 14, by + bh); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx + bw + 10, by);      ctx.lineTo(bx + bw + 18, by);
    ctx.moveTo(bx + bw + 10, by + bh); ctx.lineTo(bx + bw + 18, by + bh);
    ctx.stroke();
    ctx.save();
    ctx.translate(bx + bw + 28, by + bh / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = "rgba(200,208,224,0.6)";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(`${customDraft.h.toFixed(1)}'`, 0, 0);
    ctx.restore();
  }, [customDraft, customDraft.color]);

  useEffect(() => {
    if (!showCustomModal) return;
    const raf = requestAnimationFrame(renderCustomPreview);
    return () => cancelAnimationFrame(raf);
  }, [showCustomModal, renderCustomPreview]);

  /* ─── Add custom block to library ─── */
  const handleAddCustomBlock = useCallback(() => {
    if (!customDraft.name.trim()) return;
    const CAT_PX = { living: "LVG", work: "WRK", utility: "UTL" };
    const prefix = CAT_PX[customDraft.category] || "CST";
    const sameCount = customBlocks.filter(b => b.category === customDraft.category).length;
    const blockId = `${prefix}_BLK_${String(sameCount + 1).padStart(2, "0")}`;
    const newBlock = {
      key: `custom_${Date.now()}`,
      name: customDraft.name.trim(),
      w: customDraft.w, h: customDraft.h,
      category: customDraft.category,
      customColor: customDraft.color || "#00d4ff",
      blockId,
    };
    setCustomBlocks(prev => [...prev, newBlock]);
    setCustomDraft({ name: "", w: 12, h: 10, category: "living", color: "#00d4ff" });
    setShowCustomModal(false);
    setLibTab("custom");
  }, [customDraft, customBlocks]);

  /* Canvas render */
  const render = useCallback(() => {
    renderFloorPlan(canvasRef.current, activePlan, hoveredRoom, zoom, placedItems, selectedItemIdx, annotations, panOffset, drawingPreview, selectedAnnotationIdx);
  }, [activePlan, hoveredRoom, zoom, placedItems, selectedItemIdx, annotations, panOffset, drawingPreview, selectedAnnotationIdx]);

  /* Register icon re-render callback so loaded SVGs trigger a canvas redraw */
  useEffect(() => { _iconReRender = render; return () => { _iconReRender = null; }; }, [render]);

  useEffect(() => {
    render();
    const obs = new ResizeObserver(render);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [render]);

  /* Finalize drawing / pan on mouse up */
  const handleCanvasMouseUp = useCallback(() => {
    if (dragStateRef.current) setIsDirty(true); // user moved/resized something
    dragStateRef.current = null;
    panDragRef.current = null;
    if (drawStartRef.current && drawPreviewRef.current) {
      const ann = { ...drawPreviewRef.current, id: Date.now(), preview: false };
      const ddx = (ann.x2 ?? ann.x1) - ann.x1;
      const ddy = (ann.y2 ?? ann.y1) - ann.y1;
      if (Math.sqrt(ddx * ddx + ddy * ddy) > 0.3) {
        setAnnotations(prev => [...prev, ann]);
      }
    }
    drawStartRef.current = null;
    drawPreviewRef.current = null;
    setDrawingPreview(null);
  }, []);

  /* Release drag on mouse up anywhere (even outside canvas) */
  useEffect(() => {
    document.addEventListener("mouseup", handleCanvasMouseUp);
    return () => document.removeEventListener("mouseup", handleCanvasMouseUp);
  }, [handleCanvasMouseUp]);

  /* Delete selected item or annotation with Delete/Backspace */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key !== "Delete" && e.key !== "Backspace") || e.target.closest("input, textarea, select")) return;
      if (selectedItemIdx >= 0) {
        setPlacedItems((prev) => prev.filter((_, i) => i !== selectedItemIdx));
        setSelectedItemIdx(-1);
        setIsDirty(true);
      } else if (selectedAnnotationIdx >= 0) {
        setAnnotations((prev) => prev.filter((_, i) => i !== selectedAnnotationIdx));
        setSelectedAnnotationIdx(-1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedItemIdx, selectedAnnotationIdx]);

  /* ─── Canvas transform helper ─── */
  const getTransform = useCallback((rect) => {
    if (!activePlan) return null;
    const cw = rect.width, ch = rect.height;
    const planPxW = activePlan.width * PX_PER_FT;
    const planPxH = activePlan.depth * PX_PER_FT;
    const scale = Math.min((cw - 120) / planPxW, (ch - 120) / planPxH, 3) * zoom;
    const offX = (cw - planPxW * scale) / 2 + panOffset.x;
    const offY = (ch - planPxH * scale) / 2 + panOffset.y;
    return { scale, offX, offY };
  }, [activePlan, zoom, panOffset]);

  /* ─── Mouse move: drag/resize + hover ─── */
  const handleCanvasMove = useCallback((e) => {
    if (!activePlan || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Pan tool dragging
    if (panDragRef.current) {
      const pd = panDragRef.current;
      setPanOffset({ x: pd.startPanX + (mx - pd.startMx), y: pd.startPanY + (my - pd.startMy) });
      return;
    }

    // Drawing preview (dimension / wall)
    if (drawStartRef.current) {
      const t = getTransform(rect);
      if (t) {
        const xFt = (mx - t.offX) / (t.scale * PX_PER_FT);
        const yFt = (my - t.offY) / (t.scale * PX_PER_FT);
        const preview = { ...drawStartRef.current, x2: xFt, y2: yFt, preview: true };
        drawPreviewRef.current = preview;
        setDrawingPreview(preview);
      }
      return;
    }

    // ── Active drag/resize ──
    if (dragStateRef.current) {
      const ds = dragStateRef.current;

      // Annotation move
      if (ds.mode === "moveAnnotation") {
        const dftX = (mx - ds.startMx) / (ds.scale * PX_PER_FT);
        const dftY = (my - ds.startMy) / (ds.scale * PX_PER_FT);
        setAnnotations((prev) => {
          const next = [...prev];
          const ann = ds.startAnnot;
          if (ann.type === "label") {
            next[ds.annotIdx] = { ...ann, x: ann.x + dftX, y: ann.y + dftY };
          } else {
            next[ds.annotIdx] = { ...ann, x1: ann.x1 + dftX, y1: ann.y1 + dftY, x2: ann.x2 + dftX, y2: ann.y2 + dftY };
          }
          return next;
        });
        return;
      }

      // Annotation endpoint resize
      if (ds.mode === "resizeAnnotationEndpoint") {
        const xFt = (mx - ds.offX) / (ds.scale * PX_PER_FT);
        const yFt = (my - ds.offY) / (ds.scale * PX_PER_FT);
        setAnnotations((prev) => {
          const next = [...prev];
          const ann = ds.startAnnot;
          next[ds.annotIdx] = ds.endpoint === "start"
            ? { ...ann, x1: xFt, y1: yFt }
            : { ...ann, x2: xFt, y2: yFt };
          return next;
        });
        return;
      }

      const snap = (ft) => Math.round(ft * 2) / 2; // snap to 0.5 ft
      const dft_x = (mx - ds.startMx) / (ds.scale * PX_PER_FT);
      const dft_y = (my - ds.startMy) / (ds.scale * PX_PER_FT);
      const FURNITURE_MAX = 6; // ft — max dimension for any piece of furniture
      if (ds.mode === "move") {
        setPlacedItems((prev) => {
          const next = [...prev];
          const raw = { ...ds.startItem, x: snap(ds.startItem.x + dft_x), y: snap(ds.startItem.y + dft_y) };
          const others = prev.filter((_, i) => i !== ds.itemIdx);
          if (raw.isStair) {
            // Stairs: clamp to plan, no overlap rejection (other items can sit inside)
            const bounded = activePlan ? _clampToPlan(raw, activePlan.width, activePlan.depth) : raw;
            next[ds.itemIdx] = bounded;
          } else if (raw.isRoom || raw.isCustom) {
            // Rooms/custom: stop at collision boundary instead of rejecting
            const otherRooms = others.filter(o => (o.isRoom || o.isCustom) && !o.isStair);
            const validPos = _findMaxValidMove(
              ds.startItem,
              snap(ds.startItem.x + dft_x),
              snap(ds.startItem.y + dft_y),
              otherRooms,
              activePlan?.width,
              activePlan?.depth
            );
            next[ds.itemIdx] = validPos;
          } else {
            // Furniture/doors/windows: apply constraint first (snaps door to edge / furniture inside room),
            // then only reject if it collides with another non-room item (stairs excluded)
            const placed = _applyConstraint(raw, others, activePlan?.width, activePlan?.depth);
            const otherNonRooms = others.filter(o => !o.isRoom && !o.isCustom && !o.isStair);
            if (otherNonRooms.some((o) => _doRectsOverlap(placed, o))) {
              showToast("Can't place here — overlaps another item");
              return prev;
            }
            next[ds.itemIdx] = placed;
          }
          return next;
        });
      } else {
        setPlacedItems((prev) => {
          const next = [...prev];
          const si = ds.startItem;
          let { x, y, w, h } = si;
          const hn = ds.handle;
          const isFurniture = !si.isRoom && !si.isCustom && !si.isStair;
          if (hn.includes("e")) w = Math.max(0.5, snap(si.w + dft_x));
          if (hn.includes("s")) h = Math.max(0.5, snap(si.h + dft_y));
          if (hn.includes("w")) { x = snap(si.x + dft_x); w = Math.max(0.5, snap(si.w - dft_x)); }
          if (hn.includes("n")) { y = snap(si.y + dft_y); h = Math.max(0.5, snap(si.h - dft_y)); }
          // Cap furniture/door/window resize at FURNITURE_MAX (stairs excluded)
          if (isFurniture) {
            w = Math.min(w, FURNITURE_MAX);
            h = Math.min(h, FURNITURE_MAX);
            // Re-anchor position so the fixed edge stays put
            if (hn.includes("w")) x = si.x + si.w - w;
            if (hn.includes("n")) y = si.y + si.h - h;
          }
          let candidate = { ...si, x, y, w, h };
          const others = prev.filter((_, i) => i !== ds.itemIdx);
          if (candidate.isStair) {
            // Stairs: clamp to plan (handle-aware), no overlap rejection
            if (activePlan) candidate = _clampResizeToPlan(candidate, si, ds.handle, activePlan.width, activePlan.depth);
            next[ds.itemIdx] = candidate;
          } else if (candidate.isRoom || candidate.isCustom) {
            // Stop resize at collision boundary instead of rejecting entirely
            const otherRooms = others.filter(o => (o.isRoom || o.isCustom) && !o.isStair);
            const validResize = _findMaxValidResize(
              si,
              w, h, x, y,
              ds.handle,
              otherRooms,
              activePlan?.width,
              activePlan?.depth
            );
            next[ds.itemIdx] = validResize;
          } else {
            // Non-room resize: only block if it would overlap another non-room item (stairs excluded)
            const otherNonRooms = others.filter(o => !o.isRoom && !o.isCustom && !o.isStair);
            next[ds.itemIdx] = otherNonRooms.some((o) => _doRectsOverlap(candidate, o)) ? prev[ds.itemIdx] : candidate;
          }
          return next;
        });
      }
      return;
    }

    // ── Cursor + hover ──
    const t = getTransform(rect);
    if (!t) return;
    const { scale, offX, offY } = t;
    if (activeTool === "pan") { setCanvasCursor("grab"); return; }
    const RESIZE_CURSORS = {
      nw: "nw-resize", n: "n-resize", ne: "ne-resize", e: "e-resize",
      se: "se-resize", s: "s-resize", sw: "sw-resize", w: "w-resize",
    };

    // Check resize handles of selected item
    if (selectedItemIdx >= 0 && placedItems[selectedItemIdx]) {
      const handle = getHandleAt(mx, my, placedItems[selectedItemIdx], scale, offX, offY);
      if (handle) { setCanvasCursor(RESIZE_CURSORS[handle]); return; }
    }

    // Check if over any placed item
    for (let i = placedItems.length - 1; i >= 0; i--) {
      if (isOnPlacedItem(mx, my, placedItems[i], scale, offX, offY)) {
        setCanvasCursor("grab");
        return;
      }
    }

    // Cursor fallback based on active tool
    setCanvasCursor(
      activeTool === "dimension" || activeTool === "wall" ? "crosshair" :
      activeTool === "label" ? "text" :
      activeTool === "pan" ? "grab" : "default"
    );
  }, [activePlan, zoom, placedItems, selectedItemIdx, activeTool, getTransform]);

  /* ─── Mouse down: select / start drag or resize ─── */
  const handleCanvasMouseDown = useCallback((e) => {
    if (!activePlan || !canvasRef.current || e.button !== 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const t = getTransform(rect);
    if (!t) return;
    const { scale, offX, offY } = t;

    // Tool dispatch — select tool: annotation hit-testing first
    if (activeTool === "select") {
      const toC = (ftX, ftY) => [offX + ftX * PX_PER_FT * scale, offY + ftY * PX_PER_FT * scale];
      const HANDLE_R = 7;
      for (let i = annotations.length - 1; i >= 0; i--) {
        const ann = annotations[i];
        if (ann.type === "label") {
          const [ax, ay] = toC(ann.x, ann.y);
          if (Math.abs(mx - ax) < 50 && Math.abs(my - ay) < 14) {
            setSelectedAnnotationIdx(i);
            setSelectedItemIdx(-1);
            dragStateRef.current = {
              mode: "moveAnnotation", annotIdx: i,
              startMx: mx, startMy: my, startAnnot: { ...ann },
              scale, offX, offY,
            };
            e.preventDefault(); return;
          }
        } else {
          const [ax1, ay1] = toC(ann.x1, ann.y1);
          const [ax2, ay2] = toC(ann.x2, ann.y2);
          if (Math.hypot(mx - ax1, my - ay1) < HANDLE_R) {
            setSelectedAnnotationIdx(i);
            setSelectedItemIdx(-1);
            dragStateRef.current = {
              mode: "resizeAnnotationEndpoint", annotIdx: i, endpoint: "start",
              startMx: mx, startMy: my, startAnnot: { ...ann },
              scale, offX, offY,
            };
            e.preventDefault(); return;
          }
          if (Math.hypot(mx - ax2, my - ay2) < HANDLE_R) {
            setSelectedAnnotationIdx(i);
            setSelectedItemIdx(-1);
            dragStateRef.current = {
              mode: "resizeAnnotationEndpoint", annotIdx: i, endpoint: "end",
              startMx: mx, startMy: my, startAnnot: { ...ann },
              scale, offX, offY,
            };
            e.preventDefault(); return;
          }
          if (distToSegment(mx, my, ax1, ay1, ax2, ay2) < 8) {
            setSelectedAnnotationIdx(i);
            setSelectedItemIdx(-1);
            dragStateRef.current = {
              mode: "moveAnnotation", annotIdx: i,
              startMx: mx, startMy: my, startAnnot: { ...ann },
              scale, offX, offY,
            };
            e.preventDefault(); return;
          }
        }
      }
    }

    // Tool dispatch — non-select tools intercept mousedown
    if (activeTool === "pan") {
      panDragRef.current = { startMx: mx, startMy: my, startPanX: panOffset.x, startPanY: panOffset.y };
      setCanvasCursor("grabbing");
      e.preventDefault();
      return;
    }
    if (activeTool === "dimension" || activeTool === "wall") {
      const xFt = (mx - offX) / (scale * PX_PER_FT);
      const yFt = (my - offY) / (scale * PX_PER_FT);
      drawStartRef.current = { type: activeTool, x1: xFt, y1: yFt, x2: xFt, y2: yFt };
      const preview = { ...drawStartRef.current, preview: true };
      drawPreviewRef.current = preview;
      setDrawingPreview(preview);
      e.preventDefault();
      return;
    }
    if (activeTool === "label") {
      const xFt = (mx - offX) / (scale * PX_PER_FT);
      const yFt = (my - offY) / (scale * PX_PER_FT);
      setEditingLabel({ xFt, yFt, xPx: mx, yPx: my, text: "" });
      e.preventDefault();
      return;
    }

    // Check resize handles of currently selected item first
    if (selectedItemIdx >= 0 && placedItems[selectedItemIdx]) {
      const handle = getHandleAt(mx, my, placedItems[selectedItemIdx], scale, offX, offY);
      if (handle) {
        dragStateRef.current = {
          mode: "resize", itemIdx: selectedItemIdx, handle,
          startMx: mx, startMy: my,
          startItem: { ...placedItems[selectedItemIdx] },
          scale, offX, offY,
        };
        e.preventDefault();
        return;
      }
    }

    // Hit-test placed items (topmost first)
    for (let i = placedItems.length - 1; i >= 0; i--) {
      if (isOnPlacedItem(mx, my, placedItems[i], scale, offX, offY)) {
        setSelectedItemIdx(i);
        setCanvasCursor("grabbing");
        dragStateRef.current = {
          mode: "move", itemIdx: i,
          startMx: mx, startMy: my,
          startItem: { ...placedItems[i] },
          scale, offX, offY,
        };
        e.preventDefault();
        return;
      }
    }

    // Clicked background — deselect all
    setSelectedItemIdx(-1);
    setSelectedAnnotationIdx(-1);
  }, [activePlan, placedItems, selectedItemIdx, zoom, getTransform, activeTool, panOffset, annotations]);

  /* Build preset floor plan from params — fully local, no API */
  const handleGenerate = useCallback((overrideParams) => {
    const p = overrideParams || params;
    const storiesToGen = p.stories || 1;

    // Distribute bedrooms/bathrooms evenly across all floors
    const alloc = computeFloorAllocation(storiesToGen, p.bedrooms, p.bathrooms);

    const newAllStoryVariants = [];
    for (let si = 0; si < storiesToGen; si++) {
      const { beds: storyBeds, baths: storyBaths } = alloc[si] ?? { beds: 1, baths: 1 };
      if (si > 0) {
        const refPlan = newAllStoryVariants[0]?.[0];
        const upperParams = { ...p, garage: "None", bedrooms: storyBeds, bathrooms: storyBaths };
        newAllStoryVariants.push([generateUpperFloorPlan(upperParams, refPlan)]);
      } else {
        const floorParams = storiesToGen > 1 ? { ...p, bedrooms: storyBeds, bathrooms: storyBaths } : p;
        newAllStoryVariants.push([
          generateLocalFloorPlan(floorParams),
          generateLocalFloorPlan({ ...floorParams, openFloorPlan: !floorParams.openFloorPlan }),
        ]);
      }
    }
    setAllStoryVariants(newAllStoryVariants);
    setActiveVariantPerStory(newAllStoryVariants.map(() => 0));
    setActiveStory(0);
    setIsDirty(true);
  }, [params]);

  /* Drop handler — place a library block onto the floor plan */
  const BLOCK_SIZES = {
    // Structural elements
    door: { w: 2, h: 4 }, glazing: { w: 2, h: 0.5 }, window: { w: 2.5, h: 2.5 },
    stair: { w: 6, h: 9 }, garage: { w: 14, h: 12 },
    // Living room furniture
    sofa: { w: 4.5, h: 4 }, tv: { w: 3, h: 2.5 },
    // Bedroom furniture
    bed: { w: 4.5, h: 5 }, dresser: { w: 3.5, h: 3.5 },
    // Kitchen furniture
    oven: { w: 3, h: 3 }, fridge: { w: 2.5, h: 2.5 },
    // Bathroom furniture
    toilet: { w: 2, h: 2.5 }, shower: { w: 2, h: 2 },
    // Laundry
    washer: { w: 2.5, h: 2.5 }, dryer: { w: 2.5, h: 2.5 },
    // Dining furniture
    table: { w: 3, h: 3 },
    // Room blocks (Standard Rooms)
    living: { w: 16, h: 14 }, kitchen: { w: 14, h: 12 },
    bedroom: { w: 13, h: 12 }, bathroom: { w: 8, h: 6 },
    hallway: { w: 4, h: 12 }, "dining-room": { w: 12, h: 10 },
  };

  const handleCanvasDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const type = e.dataTransfer.getData("blockType");
    if (!type || !canvasRef.current || !activePlan) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cw = rect.width, ch = rect.height;
    const planPxW = activePlan.width * PX_PER_FT;
    const planPxH = activePlan.depth * PX_PER_FT;
    const scale = Math.min((cw - 120) / planPxW, (ch - 120) / planPxH, 3) * zoom;
    const offX = (cw - planPxW * scale) / 2;
    const offY = (ch - planPxH * scale) / 2;
    const ftX = (mx - offX) / (scale * PX_PER_FT);
    const ftY = (my - offY) / (scale * PX_PER_FT);

    // Custom block drop
    if (type === "custom") {
      const cbW     = parseFloat(e.dataTransfer.getData("customBlockW"))    || 10;
      const cbH     = parseFloat(e.dataTransfer.getData("customBlockH"))    || 10;
      const cbName  = e.dataTransfer.getData("customBlockName")  || "Custom";
      const cbId    = e.dataTransfer.getData("customBlockId")    || "CST_BLK_01";
      const cbCat   = e.dataTransfer.getData("customBlockCat")   || "living";
      const cbColor = e.dataTransfer.getData("customBlockColor") || "#00d4ff";
      const cbRaw = _clampToPlan(
        { x: Math.round(ftX - cbW / 2), y: Math.round(ftY - cbH / 2), w: cbW, h: cbH },
        activePlan.width, activePlan.depth,
      );
      setPlacedItems((prev) => {
        // Only block overlap with other non-room items (rooms are not obstacles for furniture/custom)
        const nonRooms = prev.filter(o => !o.isRoom);
        if (nonRooms.some((o) => _doRectsOverlap(cbRaw, o))) return prev;
        return [...prev, { id: Date.now(), type: "custom", isCustom: true,
          label: cbName, blockId: cbId, category: cbCat, customColor: cbColor, ...cbRaw }];
      });
      return;
    }

    const sz = BLOCK_SIZES[type] || { w: 5, h: 5 };
    const ROOM_TYPES = ["living", "kitchen", "bedroom", "bathroom", "garage", "dining-room", "hallway"];
    const ROOM_LABELS = {
      living: "Living Room", kitchen: "Kitchen", bedroom: "Bedroom",
      bathroom: "Bathroom", garage: "Garage", "dining-room": "Dining Room", hallway: "Hallway",
    };
    const isRoomType = ROOM_TYPES.includes(type);
    setPlacedItems((prev) => {
      if (isRoomType) {
        // Clamp rooms to plan footprint and reject if they overlap another room
        const raw = _clampToPlan({
          id: Date.now(), type,
          x: Math.round(ftX - sz.w / 2), y: Math.round(ftY - sz.h / 2),
          w: sz.w, h: sz.h,
          isRoom: true, label: ROOM_LABELS[type] || type,
        }, activePlan.width, activePlan.depth);
        const otherRooms = prev.filter(o => o.isRoom);
        if (otherRooms.some((o) => _doRectsOverlap(raw, o))) {
          showToast("Can't place here — overlaps an existing room");
          return prev;
        }
        return [...prev, raw];
      } else if (type === "stair") {
        // Stairs: clamp to plan, no overlap rejection, treated as room block with walls
        const raw = _clampToPlan({
          id: Date.now(), type, isStair: true, isRoom: true,
          label: "Stairs",
          x: Math.round(ftX - sz.w / 2), y: Math.round(ftY - sz.h / 2),
          w: sz.w, h: sz.h,
        }, activePlan.width, activePlan.depth);
        return [...prev, raw];
      } else {
        // Non-room (furniture, door, window, etc.): constrain to room edge/interior,
        // then only reject if it overlaps another non-room item (stairs excluded)
        const raw = {
          id: Date.now(), type,
          x: Math.round(ftX - sz.w / 2), y: Math.round(ftY - sz.h / 2),
          w: sz.w, h: sz.h,
        };
        const placed = _applyConstraint(raw, prev, activePlan?.width, activePlan?.depth);
        const nonRooms = prev.filter(o => !o.isRoom && !o.isStair);
        if (nonRooms.some((o) => _doRectsOverlap(placed, o))) {
          showToast("Can't place here — overlaps another item");
          return prev;
        }
        return [...prev, placed];
      }
    });
    setIsDirty(true);
  }, [activePlan, zoom]);

  const handleSaveToEdit = async () => {
    // Flush current floor's canvas edits into the ref before collecting all floors
    floorItemsRef.current[activeStory] = placedItems;

    const storyPlans = allStoryVariants
      .map((svs, si) => {
        const plan = svs[activeVariantPerStory[si] ?? 0];
        if (!plan) return null;
        // Prefer user-edited rooms for every floor (not just the active one)
        const allItems = floorItemsRef.current[si] || [];
        const editedRooms = allItems.filter((item) => item.isRoom);
        const rooms = editedRooms.length > 0 ? editedRooms : plan.rooms;
        // Recalculate totalSF from actual room dimensions so the saved value stays accurate
        const totalSF = rooms.reduce((s, r) => s + (r.w || 0) * (r.h || 0), 0) || plan.totalSF;
        // Compute tight bounding box from actual rooms for accurate 3D correlation
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        rooms.forEach((r) => {
          minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x + (r.w || 0));
          minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y + (r.h || 0));
        });
        const bboxW = rooms.length > 0 ? Math.round((maxX - minX) * 10) / 10 : plan.width;
        const bboxD = rooms.length > 0 ? Math.round((maxY - minY) * 10) / 10 : plan.depth;
        // Extract doors/windows the user placed so the 3D house cuts real
        // openings at those positions (not just the drag-drop preview boxes).
        const { doors: placedDoors, windows: placedWindows } =
          extractOpeningsFromPlacedItems(allItems, { minX, maxX, minY, maxY });
        // Auto-add a garage door for any garage room that doesn't already
        // have one (handles user-dropped garages from the catalog as well
        // as auto-generated garages whose plan.doors was lost during edit).
        const existingGarageDoors = new Set(
          [...(plan.doors || []), ...placedDoors]
            .filter((d) => d.isGarageDoor)
            .map((d) => d.id)
        );
        const generatedGarageDoors = generateGarageDoors(rooms, bboxW, bboxD)
          .filter((d) => !existingGarageDoors.has(d.id));
        return {
          ...plan,
          rooms,
          totalSF,
          placed_items: allItems,
          width: bboxW,
          depth: bboxD,
          doors: [...(plan.doors || []), ...placedDoors, ...generatedGarageDoors],
          windows: [...(plan.windows || []), ...placedWindows],
        };
      })
      .filter(Boolean);

    project.setStoryPlans(storyPlans);
    project.setAllVariants(storyPlans, params);
    project.setMaxStep(Math.max(project.maxStep, 1));

    // Update building context for structural intelligence
    const fp = storyPlans[0];
    const fpWidth = fp?.width || 44;
    const fpDepth = fp?.depth || 50;
    const spanFt = Math.min(fpWidth, fpDepth, 24);
    const numStories = storyPlans.length || params.stories || 2;
    // Sum SF across all stories (not story-1 × count) so multi-storey projects are correct
    const totalAllSF = storyPlans.reduce((s, sp) => s + (sp.totalSF || 0), 0) || params.targetSF || 2200;
    project.setBuildingContext({
      span_ft: spanFt,
      stories: numStories,
      total_sf: totalAllSF,
    });

    // Persist all story plans to MongoDB (best-effort — navigate regardless of outcome)
    setSaving(true);
    try {
      const payload = {
        name: project.projectName || "New Project",
        generate_params: params,
        floor_plan: storyPlans[0] || null,
        story_plans: storyPlans,
      };
      let saved;
      if (project.projectId) {
        saved = await projectsApi.update(project.projectId, payload);
      } else {
        saved = await projectsApi.create(payload);
      }
      if (saved?.id) project.setProjectId(saved.id);
    } catch (_) {
      // non-fatal: auth may be missing locally; still proceed
    } finally {
      setSaving(false);
    }

    setIsDirty(false);
    savedRef.current = true;
    // Homeowners go to complete 3D view; builders go to layer-by-layer editor
    navigate(isHomeowner ? "/preview3d" : "/edit");
  };

  const [exportingDxf, setExportingDxf] = useState(false);
  const handleExportDxf = async () => {
    if (!activePlan) return;
    // Flush current story's canvas edits into the ref before collecting all floors
    floorItemsRef.current[activeStory] = placedItems;
    // Build one export plan per story — all floors already in memory
    const storyExports = allStoryVariants
      .map((svs, si) => {
        const plan = svs[activeVariantPerStory[si] ?? 0];
        if (!plan) return null;
        const allItems = floorItemsRef.current[si] || [];
        const editedRooms = allItems.filter((item) => item.isRoom);
        const rooms = editedRooms.length > 0 ? editedRooms : plan.rooms;
        return { ...plan, rooms, doors: plan.doors || [], windows: plan.windows || [] };
      })
      .filter(Boolean);
    if (storyExports.length === 0) return;
    setExportingDxf(true);
    try {
      const projectName = project.projectName || "Vision Project";
      const blob = await floorplanApi.exportDxfAll(storyExports, projectName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = projectName.replace(/\s+/g, "_") + "_floor_plans.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("DXF export failed:", err);
    } finally {
      setExportingDxf(false);
    }
  };

  const setP = (key) => (e) => {
    let val = e.target.value;
    if (e.target.type === "checkbox") val = e.target.checked;
    else if (e.target.type === "range") val = Number(e.target.value);
    setParams((p) => ({ ...p, [key]: val }));
  };

  // Setter for the draft params inside the settings modal
  const setDraftP = (key) => (e) => {
    let val = e.target.value;
    if (e.target.type === "checkbox") val = e.target.checked;
    else if (e.target.type === "range") val = Number(e.target.value);
    setDraftParams((p) => ({ ...p, [key]: val }));
  };

  /* Room stats for right panel — derived from live placedItems so it updates on every add/move/resize */
  const roomStats = React.useMemo(() => {
    const roomItems = placedItems.filter(item => item.isRoom);
    if (roomItems.length === 0) return [];
    const merged = {};
    roomItems.forEach((r) => {
      const key = r.label || r.type;
      const area = (r.w || 0) * (r.h || 0);
      if (merged[key]) {
        merged[key].area += area;
      } else {
        const normT = r.type === "dining-room" ? "dining" : r.type;
        const col = ROOM_COLORS[normT] || ROOM_COLORS.hallway;
        merged[key] = { label: key, area, color: col.stroke, type: r.type };
      }
    });
    return Object.values(merged).sort((a, b) => b.area - a.area);
  }, [placedItems]);

  const totalSF = roomStats.reduce((s, r) => s + r.area, 0);
  const scaleLabel = zoom <= 0.6 ? "1:100" : zoom <= 0.9 ? "1:75" : zoom <= 1.2 ? "1:50" : zoom <= 1.6 ? "1:35" : "1:25";

  // Structural validation - real-time checks
  const validation = useStructuralValidation(placedItems, params);
  const [showValidationPanel, setShowValidationPanel] = useState(false);

  /* ── Shared style atoms ── */
  const panelLabel = {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
    textTransform: "uppercase", color: "#5a6580", fontFamily: fonts.label,
  };
  const propRow = {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 16px", borderBottom: "1px solid #1a2236",
  };
  const selectorBtn = (active) => ({
    flex: 1, padding: "6px 0", border: "none",
    background: active ? "#00d4ff" : "transparent",
    color: active ? "#0d1117" : "#5a6580",
    fontFamily: fonts.label, fontSize: 12, fontWeight: active ? 700 : 500,
    cursor: "pointer", borderRadius: 6, transition: "all 0.15s",
  });

  /* ── Tool button ── */
  const toolBtn = (tool) => ({
    width: 36, height: 36, border: "none", borderRadius: 6,
    background: activeTool === tool ? "rgba(0,212,255,0.12)" : "transparent",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.15s",
  });

  /* ── Component lib tile ── */
  const tile = {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 6, padding: "10px 4px", borderRadius: 6, border: "1px solid #1a2236",
    background: "#0d1320", cursor: "pointer", transition: "border-color 0.15s",
  };

  /* ── Guard: only show "no project" if user navigated here directly ── */
  const hasActiveWorkflow = project.projectId || project.generateParams || project.floorPlan || location.state?.newProject;
  if (!hasActiveWorkflow) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", background: "#0d1117", fontFamily: "'Inter', sans-serif" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M6 6h8l6 6v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" stroke="#3b82f6" strokeWidth="1.5" fill="none" /><path d="M14 6v6h6" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" /><path d="M9 17h10M9 20h6" stroke="#3b82f6" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" /></svg>
        </div>
        <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>No project selected</h2>
        <p style={{ margin: "0 0 32px", fontSize: 14, color: "#64748b", textAlign: "center", maxWidth: 340, lineHeight: 1.6 }}>Please select or create a project first before accessing this section.</p>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => navigate("/projects")} style={{ padding: "11px 24px", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 14px rgba(37,99,235,0.4)" }}>Go to Projects</button>
          <button onClick={() => navigate("/dashboard")} style={{ padding: "11px 24px", background: "transparent", border: "1px solid #2a3548", borderRadius: 8, color: "#94a3b8", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  /* ────────────────────────────── RENDER ────────────────────────────── */
  return (
    <div style={{ display: "flex", height: "100%", background: "#0d1117", overflow: "hidden" }}>

      {/* ═══════════════ LEFT: COMPONENT LIBRARY ═══════════════ */}
      <div style={{
        width: 210, flexShrink: 0, background: "#0b1018",
        borderRight: "1px solid #1a2236",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #1a2236" }}>
          <span style={{ ...panelLabel, fontSize: 11 }}>Component Library</span>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #1a2236", padding: "8px 10px", gap: 4 }}>
          {["elements", "furniture", "custom"].map((t) => (
            <button key={t} onClick={() => setLibTab(t)} style={{
              flex: 1, padding: "5px 0", border: "none", borderRadius: 6,
              background: libTab === t ? "#1a2236" : "transparent",
              color: libTab === t ? "#e8ecf4" : "#5a6580",
              fontFamily: fonts.label, fontSize: 11, fontWeight: libTab === t ? 600 : 400,
              cursor: "pointer", textTransform: "capitalize",
            }}>
              {t === "custom" ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                  Custom
                  {customBlocks.length > 0 && (
                    <span style={{ fontSize: 9, background: "#00d4ff", color: "#0d1117",
                      borderRadius: 8, padding: "1px 4px", fontWeight: 700 }}>
                      {customBlocks.length}
                    </span>
                  )}
                </span>
              ) : (t.charAt(0).toUpperCase() + t.slice(1))}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px" }}>
          {libTab === "elements" && (
            <>
              {/* Structural Blocks */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <svg width="10" height="10"><polygon points="5,0 10,10 0,10" fill="#00d4ff"/></svg>
                  <span style={{ ...panelLabel, fontSize: 10 }}>Structural Blocks</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[
                    { key: "door", label: "Swing Door" },
                    { key: "window", label: "Window" },
                    { key: "stair", label: "Stair" },
                  ].map(({ key, label }) => {
                    const sColor = ITEM_ACCENT_COLOR[key] || "#8a9bb0";
                    const sSrc = _SVG_SRCS[key];
                    const sUri = sSrc ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sSrc.replace(/__C__/g, sColor))}` : null;
                    return (
                      <div key={key}
                        style={{ ...tile, cursor: "grab", borderColor: `${sColor}30`, background: `${sColor}09` }}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("blockType", key); e.dataTransfer.effectAllowed = "copy"; }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = `${sColor}99`}
                        onMouseLeave={e => e.currentTarget.style.borderColor = `${sColor}30`}
                      >
                        {sUri ? <img src={sUri} width={26} height={26} alt="" style={{ opacity: 0.88 }} /> : <BlockIcon type={key} />}
                        <span style={{ fontSize: 10, color: "#8a9bb0", fontFamily: fonts.label, textAlign: "center", lineHeight: 1.2 }}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Standard Rooms */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <svg width="10" height="10"><circle cx="5" cy="5" r="5" fill="#00d4ff"/></svg>
                  <span style={{ ...panelLabel, fontSize: 10 }}>Standard Rooms</span>
                </div>
                {[
                  { label: "Living Room", color: "#00d4ff", key: "living" },
                  { label: "Kitchen", color: "#2ed573", key: "kitchen" },
                  { label: "Bedroom", color: "#3b82f6", key: "bedroom" },
                  { label: "Bathroom", color: "#00d4ff", key: "bathroom" },
                  { label: "Garage", color: "#5a6580", key: "garage" },
                  { label: "Dining Room", color: "#8a9bb0", key: "dining-room" },
                  { label: "Hallway", color: "#2a3548", key: "hallway" },
                ].map(({ label, color, key }) => (
                  <div key={label} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "7px 8px", borderRadius: 6, cursor: "grab",
                    borderBottom: "1px solid #0f1420",
                    transition: "background 0.12s",
                  }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("blockType", key);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#1a2236"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "#c8d0e0", fontFamily: fonts.label }}>{label}</span>
                    </div>
                    <span style={{ color: "#3d4e66", fontSize: 14 }}>⋯</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {libTab === "custom" && (
            customBlocks.length === 0 ? (
              <div style={{ padding: "24px 8px", textAlign: "center" }}>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ opacity: 0.18, marginBottom: 10 }}>
                  <rect x="3" y="3" width="26" height="26" stroke="#c8d0e0" strokeWidth="1.5" />
                  <line x1="16" y1="8" x2="16" y2="24" stroke="#c8d0e0" strokeWidth="1.5" />
                  <line x1="8" y1="16" x2="24" y2="16" stroke="#c8d0e0" strokeWidth="1.5" />
                </svg>
                <div style={{ fontSize: 12, color: "#3d4e66", fontFamily: fonts.label }}>No custom blocks yet</div>
                <div style={{ fontSize: 10, color: "#2a3548", fontFamily: fonts.label, marginTop: 4, lineHeight: 1.5 }}>
                  Click "Custom Block" below
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <svg width="10" height="10"><rect x="0" y="0" width="10" height="10" fill="none" stroke="#00d4ff" strokeWidth="1.5" /></svg>
                  <span style={{ ...panelLabel, fontSize: 10 }}>Custom Blocks</span>
                </div>
                {customBlocks.map((block) => {
                  const CAT_C = { living: "#00d4ff", work: "#3b82f6", utility: "#ff9f43" };
                  const color = CAT_C[block.category] || "#00d4ff";
                  return (
                    <div key={block.key} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "7px 8px", borderRadius: 6, cursor: "grab",
                      borderBottom: "1px solid #0f1420", transition: "background 0.12s",
                    }}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("blockType", "custom");
                        e.dataTransfer.setData("customBlockW",     String(block.w));
                        e.dataTransfer.setData("customBlockH",     String(block.h));
                        e.dataTransfer.setData("customBlockName",  block.name);
                        e.dataTransfer.setData("customBlockId",    block.blockId);
                        e.dataTransfer.setData("customBlockCat",   block.category);
                        e.dataTransfer.setData("customBlockColor", block.customColor || "#00d4ff");
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "#1a2236"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                        <div style={{
                          width: 10, height: 10, borderRadius: 2,
                          background: block.customColor || color,
                          flexShrink: 0, border: "1px solid rgba(255,255,255,0.12)",
                        }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: "#c8d0e0", fontFamily: fonts.label,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {block.name}
                          </div>
                          <div style={{ fontSize: 10, color: "#5a6580", fontFamily: fonts.data }}>
                            {block.w}' × {block.h}'
                          </div>
                        </div>
                      </div>
                      {/* Delete button */}
                      <button
                        title="Delete block"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCustomBlocks(prev => prev.filter(b => b.key !== block.key));
                        }}
                        onMouseDown={e => e.stopPropagation()}
                        style={{
                          flexShrink: 0, marginLeft: 6, background: "none", border: "none",
                          cursor: "pointer", padding: "3px 4px", borderRadius: 4,
                          color: "#3d4e66", lineHeight: 1, transition: "color 0.12s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = "#ff4757"}
                        onMouseLeave={e => e.currentTarget.style.color = "#3d4e66"}
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2 3h9M5 3V2h3v1M3.5 3l.5 8h5l.5-8" stroke="currentColor"
                            strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </>
            )
          )}

          {libTab === "furniture" && (
            <>
              {[
                { section: "Living Room", color: "#2ed573", items: [{ key: "sofa", label: "Sofa" }, { key: "tv", label: "TV" }] },
                { section: "Bedroom",     color: "#3b82f6", items: [{ key: "bed", label: "Bed" }, { key: "dresser", label: "Dresser" }] },
                { section: "Kitchen",     color: "#ff9f43", items: [{ key: "oven", label: "Oven" }, { key: "fridge", label: "Fridge" }] },
                { section: "Bathroom",    color: "#00d4ff", items: [{ key: "toilet", label: "Toilet" }, { key: "shower", label: "Shower" }] },
                { section: "Dining",      color: "#8a9bb0", items: [{ key: "table", label: "Table" }] },
                { section: "Laundry",     color: "#6b7a90", items: [{ key: "washer", label: "Washer" }, { key: "dryer", label: "Dryer" }] },
              ].map(({ section, color, items }) => {
                const ICON_KEY = {
                  sofa: "armchair", tv: "tv", bed: "bed", dresser: "dresser",
                  oven: "oven", fridge: "fridge", toilet: "toilet", shower: "shower",
                  washer: "washer", dryer: "washer", table: "table",
                };
                return (
                  <div key={section} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ ...panelLabel, fontSize: 10 }}>{section}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                      {items.map(({ key, label }) => {
                        const svgKey = ICON_KEY[key];
                        const src = svgKey ? _SVG_SRCS[svgKey] : null;
                        const uri = src
                          ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src.replace(/__C__/g, color))}`
                          : null;
                        return (
                          <div key={key}
                            style={{ ...tile, cursor: "grab", borderColor: `${color}30`, background: `${color}09` }}
                            draggable
                            onDragStart={(e) => { e.dataTransfer.setData("blockType", key); e.dataTransfer.effectAllowed = "copy"; }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = `${color}99`}
                            onMouseLeave={e => e.currentTarget.style.borderColor = `${color}30`}
                          >
                            {uri
                              ? <img src={uri} width={26} height={26} alt="" style={{ opacity: 0.88 }} />
                              : <BlockIcon type={key} />}
                            <span style={{ fontSize: 10, color: "#8a9bb0", fontFamily: fonts.label, textAlign: "center", lineHeight: 1.2 }}>
                              {label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Bottom: Custom Block */}
        <div style={{ padding: "10px", borderTop: "1px solid #1a2236" }}>
          <button onClick={() => setShowCustomModal(true)} style={{
            width: "100%", padding: "10px", border: "1px solid #1a3a4a",
            borderRadius: 6, background: "rgba(0,212,255,0.06)",
            color: "#00d4ff", fontFamily: fonts.label, fontSize: 12, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,212,255,0.14)"; e.currentTarget.style.borderColor = "#00d4ff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,212,255,0.06)"; e.currentTarget.style.borderColor = "#1a3a4a"; }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="12" height="12" stroke="#00d4ff" strokeWidth="1.2" />
              <line x1="7" y1="3" x2="7" y2="11" stroke="#00d4ff" strokeWidth="1.2" />
              <line x1="3" y1="7" x2="11" y2="7" stroke="#00d4ff" strokeWidth="1.2" />
            </svg>
            CUSTOM BLOCK
          </button>
        </div>
      </div>

      {/* ═══════════════ CENTER: CANVAS ═══════════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Toolbar */}
        <div style={{
          height: 48, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 4,
          padding: "0 12px", background: "#0b1018", borderBottom: "1px solid #1a2236",
        }}>
          {[
            { key: "select", Icon: SelectIcon },
            { key: "pan", Icon: PanIcon },
            { key: "dimension", Icon: DimensionIcon },
            { key: "label", Icon: LabelIcon },
          ].map(({ key, Icon }) => (
            <button key={key} style={toolBtn(key)} onClick={() => setActiveTool(key)}
              title={key.charAt(0).toUpperCase() + key.slice(1)}>
              <Icon active={activeTool === key} />
            </button>
          ))}

          {/* Project name pill */}
          <div style={{
            marginLeft: 8,
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 12px",
            background: "rgba(0,212,255,0.06)",
            border: "1px solid #1a3a4a",
            borderRadius: 6,
            fontFamily: fonts.label, fontSize: 13, fontWeight: 600,
            color: "#8a9bb0",
            letterSpacing: "0.1px",
            whiteSpace: "nowrap",
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="#8a9bb0" strokeWidth="1.8" />
              <line x1="7" y1="8" x2="17" y2="8" stroke="#8a9bb0" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="7" y1="12" x2="17" y2="12" stroke="#8a9bb0" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="7" y1="16" x2="13" y2="16" stroke="#8a9bb0" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            {project.projectName || "New Project"}
          </div>

          {/* Structural validation badge */}
          {placedItems.length > 0 && (
            <ValidationBadge
              validation={validation}
              onClick={() => setShowValidationPanel(!showValidationPanel)}
            />
          )}

          {/* Spacer + actions */}
          <div style={{ flex: 1 }} />
          {activePlan && (
            <>
<button onClick={handleExportDxf} disabled={exportingDxf || !activePlan} style={{
                padding: "6px 14px", borderRadius: 6,
                border: "1px solid #2a3548",
                background: "transparent",
                color: exportingDxf ? "#4a8a99" : colors.text,
                fontFamily: fonts.label, fontSize: 12, fontWeight: 600,
                cursor: (exportingDxf || !activePlan) ? "default" : "pointer",
                letterSpacing: "0.3px", display: "flex", alignItems: "center", gap: 5,
                transition: "all 0.2s",
              }}
                onMouseEnter={(e) => { if (!exportingDxf && activePlan) { e.currentTarget.style.borderColor = "#2ed573"; e.currentTarget.style.color = "#2ed573"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a3548"; e.currentTarget.style.color = colors.text; }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 9.5v1.5h9V9.5M6.5 1v7M4 6l2.5 2.5L9 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {exportingDxf ? "Exporting…" : "Export DXF"}
              </button>
              <button onClick={handleSaveToEdit} disabled={saving} style={{
                padding: "6px 18px", borderRadius: 6, border: "none",
                background: saving ? "rgba(0,212,255,0.3)" : "linear-gradient(135deg, #00d4ff, #0099cc)",
                color: saving ? "#4a8a99" : "#0d1117",
                fontFamily: fonts.label, fontSize: 12, fontWeight: 700,
                cursor: saving ? "default" : "pointer", letterSpacing: "0.3px",
                transition: "all 0.2s",
              }}>
                {saving ? "Saving…" : isHomeowner ? "Build My Home →" : "Save to Project →"}
              </button>
            </>
          )}
        </div>

        {/* Canvas area */}
        <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden", background: "#0d1117",
          outline: dragOver ? "2px dashed #00d4ff" : "none", outlineOffset: -2 }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleCanvasDrop}
        >
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "100%", display: "block", cursor: canvasCursor }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={() => { setHoveredRoom(null); setCanvasCursor("default"); }}
          />
          {editingLabel && (
            <div style={{
              position: "absolute",
              left: editingLabel.xPx - 60,
              top: editingLabel.yPx - 14,
              zIndex: 20,
            }}>
              <input
                autoFocus
                value={editingLabel.text}
                onChange={ev => setEditingLabel(prev => ({ ...prev, text: ev.target.value }))}
                onKeyDown={ev => {
                  if (ev.key === "Enter" && editingLabel.text.trim()) {
                    setAnnotations(prev => [...prev, {
                      id: Date.now(), type: "label",
                      x: editingLabel.xFt, y: editingLabel.yFt,
                      text: editingLabel.text.trim(),
                    }]);
                    setEditingLabel(null);
                  } else if (ev.key === "Escape") {
                    setEditingLabel(null);
                  }
                }}
                onBlur={() => {
                  if (editingLabel.text.trim()) {
                    setAnnotations(prev => [...prev, {
                      id: Date.now(), type: "label",
                      x: editingLabel.xFt, y: editingLabel.yFt,
                      text: editingLabel.text.trim(),
                    }]);
                  }
                  setEditingLabel(null);
                }}
                placeholder="Label text..."
                style={{
                  background: "#0f1420", border: "1px solid #00d4ff", borderRadius: 4,
                  color: "#e8ecf4", fontFamily: "Inter, sans-serif",
                  fontSize: 12, padding: "3px 8px", width: 120, outline: "none",
                }}
              />
            </div>
          )}
          {!activePlan && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12,
              color: "#5a6580", fontFamily: fonts.label,
            }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" opacity="0.2">
                <rect x="6" y="6" width="36" height="36" stroke="#c8d0e0" strokeWidth="2" />
                <line x1="24" y1="6" x2="24" y2="42" stroke="#c8d0e0" strokeWidth="1" />
                <line x1="6" y1="24" x2="42" y2="24" stroke="#c8d0e0" strokeWidth="1" />
              </svg>
              <div style={{ fontSize: 14, color: "#5a6580" }}>No layout yet</div>
              <button onClick={() => {
                if (activeStory === 0) {
                  // No floor 1 — generate everything fresh
                  handleGenerate(params);
                } else {
                  // Generate only this upper floor without touching floor 1
                  const refPlan = allStoryVariants[0]?.[0];
                  const floor1Beds  = Math.min(1, params.bedrooms);
                  const floor1Baths = Math.min(1, params.bathrooms);
                  const upperBeds   = Math.max(1, params.bedrooms  - floor1Beds);
                  const upperBaths  = Math.max(1, params.bathrooms - floor1Baths);
                  const upperP = { ...params, garage: "None", bedrooms: upperBeds, bathrooms: upperBaths };
                  const newPlan = generateUpperFloorPlan(upperP, refPlan);
                  setAllStoryVariants((prev) => {
                    const updated = [...prev];
                    while (updated.length <= activeStory) updated.push([]);
                    updated[activeStory] = [newPlan];
                    return updated;
                  });
                  setActiveVariantPerStory((prev) => {
                    const updated = [...prev];
                    while (updated.length <= activeStory) updated.push(0);
                    updated[activeStory] = 0;
                    return updated;
                  });
                }
              }} style={{
                padding: "8px 20px", borderRadius: 6, border: "1px solid #00d4ff",
                background: "transparent", color: "#00d4ff", fontFamily: fonts.label,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
                {activeStory === 0 ? "Build Floor Plan" : `Generate Floor ${activeStory + 1}`}
              </button>
            </div>
          )}
          {/* Error toast */}
          {toastMsg && (
            <div style={{
              position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
              pointerEvents: "none", zIndex: 50,
              background: "rgba(13,17,23,0.92)", border: "1px solid #ff4757",
              borderRadius: 10, padding: "11px 24px",
              display: "flex", alignItems: "center", gap: 10,
              boxShadow: "0 4px 20px rgba(255,71,87,0.22)",
              animation: "fpToastIn 0.15s ease",
            }}>
              <svg width="21" height="21" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="7" cy="7" r="6.5" stroke="#ff4757" strokeWidth="1.2" />
                <line x1="7" y1="4" x2="7" y2="7.5" stroke="#ff4757" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="7" cy="9.5" r="0.7" fill="#ff4757" />
              </svg>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 18, color: "#ff4757", fontWeight: 600, whiteSpace: "nowrap" }}>
                {toastMsg}
              </span>
            </div>
          )}
        </div>

        {/* Bottom bar: total width + zoom */}
        <div style={{
          height: 44, flexShrink: 0, background: "#0b1018",
          borderTop: "1px solid #1a2236",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px",
        }}>
          {/* Width label */}
          <div style={{ flex: 1 }}>
            {activePlan && (
              <span style={{ fontFamily: fonts.data, fontSize: 11, color: "#5a6580", letterSpacing: "0.08em" }}>
                TOTAL WIDTH: {activePlan.width}' 0"
              </span>
            )}
          </div>
          {/* Zoom controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} style={{
              width: 28, height: 28, border: "1px solid #1a2236", borderRadius: 6,
              background: "#0f1420", color: "#8a9bb0", cursor: "pointer", fontSize: 16, lineHeight: 1,
            }}>−</button>
            <span style={{ fontFamily: fonts.data, fontSize: 12, color: "#8a9bb0", minWidth: 36, textAlign: "center" }}>
              {scaleLabel}
            </span>
            <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))} style={{
              width: 28, height: 28, border: "1px solid #1a2236", borderRadius: 6,
              background: "#0f1420", color: "#8a9bb0", cursor: "pointer", fontSize: 16, lineHeight: 1,
            }}>+</button>
            <button style={{
              width: 28, height: 28, border: "1px solid #1a2236", borderRadius: 6,
              background: "#0f1420", color: "#8a9bb0", cursor: "pointer", fontSize: 11, lineHeight: 1,
            }} title="Fit to screen" onClick={() => setZoom(1.0)}>⛶</button>
          </div>
          <div style={{ flex: 1 }} />
        </div>
      </div>

      {/* ═══════════════ RIGHT: FLOOR NAVIGATION ═══════════════ */}
      <div style={{
        width: 232, flexShrink: 0, background: "#0b1018",
        borderLeft: "1px solid #1a2236",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 16px 10px", borderBottom: "1px solid #1a2236",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ ...panelLabel, fontSize: 11 }}>Floor Navigation</span>
        </div>

        {/* Level tabs */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #1a2236" }}>
          <div style={{ display: "flex", gap: 6, background: "#0f1420", padding: 4, borderRadius: 8 }}>
            {Array.from({ length: Math.max(numStories, 1) }, (_, i) => i).map((si) => (
              <button key={si} onClick={() => setActiveStory(si)} style={selectorBtn(activeStory === si)}>
                LEVEL {si + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Floor Properties */}
        <div style={{ borderBottom: "1px solid #1a2236", paddingBottom: 4 }}>
          <div style={{ padding: "10px 16px 6px" }}>
            <span style={panelLabel}>Floor Properties</span>
          </div>
          <div style={propRow}>
            <span style={{ fontSize: 12, color: "#8a9bb0", fontFamily: fonts.label }}>Floor Height</span>
            <span style={{ fontFamily: fonts.data, fontSize: 12, color: "#e8ecf4", fontWeight: 600 }}>10 ft</span>
          </div>
          <div style={propRow}>
            <span style={{ fontSize: 12, color: "#8a9bb0", fontFamily: fonts.label }}>Elevation</span>
            <span style={{ fontFamily: fonts.data, fontSize: 12, color: "#e8ecf4", fontWeight: 600 }}>
              {(activeStory * 10).toFixed(2)} ft
            </span>
          </div>
          <div style={{ ...propRow, borderBottom: "none" }}>
            <span style={{ fontSize: 12, color: "#8a9bb0", fontFamily: fonts.label }}>Status</span>
            <span style={{ fontFamily: fonts.label, fontSize: 11, fontWeight: 700, color: "#00d4ff",
              background: "rgba(0,212,255,0.08)", padding: "2px 8px", borderRadius: 4 }}>
              {activeStory === 0 ? "Primary" : "Upper"}
            </span>
          </div>
        </div>

        {/* Component Properties */}
        <div style={{ flex: 1, overflowY: "auto", borderBottom: "1px solid #1a2236" }}>
          <div style={{ padding: "10px 16px 6px" }}>
            <span style={panelLabel}>Component Properties</span>
          </div>
          {roomStats.length === 0 && (
            <div style={{ padding: "12px 16px", fontSize: 12, color: "#3d4e66", fontFamily: fonts.label }}>
              Generate a plan to see room stats
            </div>
          )}
          {roomStats.map((room) => {
            const pct = totalSF > 0 ? (room.area / totalSF) * 100 : 0;
            return (
              <div key={room.label} style={{ padding: "8px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: room.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#c8d0e0", fontFamily: fonts.label }}>{room.label}</span>
                  </div>
                  <span style={{ fontFamily: fonts.data, fontSize: 11, color: "#8a9bb0" }}>
                    {Math.round(room.area)} ft²
                  </span>
                </div>
                <div style={{ height: 3, background: "#1a2236", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: room.color, borderRadius: 2, transition: "width 0.4s" }} />
                </div>
              </div>
            );
          })}
          {activePlan && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid #1a2236", marginTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#8a9bb0", fontFamily: fonts.label }}>Total Footprint</span>
                <span style={{ fontFamily: fonts.data, fontSize: 14, fontWeight: 700, color: "#00d4ff" }}>
                  {totalSF.toLocaleString()} ft²
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Structural Validation Panel */}
        {showValidationPanel && placedItems.length > 0 && (
          <div style={{ borderBottom: "1px solid #1a2236", padding: "10px 12px" }}>
            <div style={{ padding: "0 4px 8px" }}>
              <span style={panelLabel}>Structural Checks</span>
            </div>
            <ValidationPanel
              validation={validation}
              onIssueClick={(issue) => {
                // Highlight the room with the issue
                if (issue.roomId) {
                  const idx = placedItems.findIndex(item => item.id === issue.roomId);
                  if (idx >= 0) setSelectedItemIdx(idx);
                }
              }}
            />
          </div>
        )}

        {/* Floor Plan Settings */}
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, marginTop: "auto", flexShrink: 0 }}>
          <button onClick={() => { setDraftParams({ ...params }); setShowParamsModal(true); }} style={{
            width: "100%", padding: "10px", border: "1px solid #1a2236", borderRadius: 6,
            background: "#0f1420", color: "#8a9bb0", fontFamily: fonts.label, fontSize: 12,
            fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <line x1="2" y1="4" x2="12" y2="4" stroke="#5a6580" strokeWidth="1.2" />
              <line x1="2" y1="7" x2="12" y2="7" stroke="#5a6580" strokeWidth="1.2" />
              <line x1="2" y1="10" x2="12" y2="10" stroke="#5a6580" strokeWidth="1.2" />
              <circle cx="5" cy="4" r="1.5" fill="#0f1420" stroke="#5a6580" strokeWidth="1.2" />
              <circle cx="9" cy="7" r="1.5" fill="#0f1420" stroke="#5a6580" strokeWidth="1.2" />
              <circle cx="5" cy="10" r="1.5" fill="#0f1420" stroke="#5a6580" strokeWidth="1.2" />
            </svg>
            FLOOR PLAN SETTINGS
          </button>
        </div>
      </div>

      {/* ═══════════════ CUSTOM BLOCK MODAL ═══════════════ */}
      {showCustomModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1001, fontFamily: fonts.label,
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowCustomModal(false); }}>
          <div style={{
            background: "#0f1929", border: "1px solid #1a2d45", borderRadius: 14,
            width: 820, maxWidth: "95vw", overflow: "hidden",
            display: "flex", flexDirection: "column",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          }}>
            {/* Header */}
            <div style={{ padding: "20px 28px 14px", borderBottom: "1px solid #1a2236",
              display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10,
                  background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect x="2" y="2" width="16" height="16" stroke="#00d4ff" strokeWidth="1.5" rx="1" />
                    <line x1="10" y1="5" x2="10" y2="15" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="5" y1="10" x2="15" y2="10" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#e8ecf4", letterSpacing: "-0.01em" }}>
                    Create Custom Block
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
                    color: "#00d4ff", textTransform: "uppercase", marginTop: 2 }}>
                    Architectural Module Editor
                  </div>
                </div>
              </div>
              <button onClick={() => setShowCustomModal(false)} style={{
                background: "none", border: "none", color: "#5a6580",
                cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 4,
              }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ display: "flex", minHeight: 440 }}>
              {/* ── Left: form ── */}
              <div style={{ flex: "0 0 46%", padding: "24px 28px",
                borderRight: "1px solid #1a2236",
                display: "flex", flexDirection: "column", gap: 22 }}>

                {/* Block Name */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700,
                    color: "#e8ecf4", marginBottom: 8 }}>Block Name</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="e.g., Home Office, Sunroom"
                    value={customDraft.name}
                    onChange={e => setCustomDraft(d => ({ ...d, name: e.target.value }))}
                    style={{
                      width: "100%", padding: "12px 14px", borderRadius: 8,
                      border: `1px solid ${customDraft.name ? "rgba(0,212,255,0.35)" : "#1a2d45"}`,
                      background: "#0d1526", color: "#e8ecf4",
                      fontFamily: fonts.label, fontSize: 14, outline: "none",
                      boxSizing: "border-box", transition: "border-color 0.15s",
                    }}
                  />
                </div>

                {/* Width + Depth */}
                <div style={{ display: "flex", gap: 16 }}>
                  {[{ label: "Width (ft)", key: "w" }, { label: "Depth (ft)", key: "h" }].map(({ label, key }) => (
                    <div key={key} style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 700,
                        color: "#e8ecf4", marginBottom: 8 }}>{label}</label>
                      <div style={{ position: "relative" }}>
                        <input
                          type="number" min={2} max={60}
                          value={customDraft[key]}
                          onChange={e => setCustomDraft(d => ({
                            ...d,
                            [key]: Math.min(60, Math.max(2, parseInt(e.target.value, 10) || 2)),
                          }))}
                          style={{
                            width: "100%", padding: "11px 40px 11px 14px", borderRadius: 8,
                            border: "1px solid #1a2d45", background: "#0d1526",
                            color: "#e8ecf4", fontFamily: fonts.data, fontSize: 18, fontWeight: 700,
                            outline: "none", boxSizing: "border-box",
                            MozAppearance: "textfield",
                          }}
                        />
                        <span style={{
                          position: "absolute", right: 12, top: "50%",
                          transform: "translateY(-50%)",
                          fontSize: 10, fontWeight: 700, color: "#5a6580",
                          fontFamily: fonts.label, pointerEvents: "none",
                        }}>FT</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Category */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700,
                    color: "#e8ecf4", marginBottom: 10 }}>Category</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    {[
                      { id: "living", label: "Living", defaultColor: "#00d4ff", icon: (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"/>
                          <path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z"/>
                          <path d="M5 18v2"/><path d="M19 18v2"/>
                        </svg>
                      )},
                      { id: "work", label: "Work", defaultColor: "#3b82f6", icon: (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="20" height="14" x="2" y="7" rx="2"/>
                          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                        </svg>
                      )},
                      { id: "utility", label: "Utility", defaultColor: "#ff9f43", icon: (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                        </svg>
                      )},
                    ].map(({ id, label, icon, defaultColor }) => {
                      const isAct = customDraft.category === id;
                      const cc = customDraft.color || defaultColor;
                      return (
                        <button key={id} onClick={() => setCustomDraft(d => ({ ...d, category: id, color: defaultColor }))}
                          style={{
                            flex: 1, padding: "14px 8px 10px", borderRadius: 8,
                            border: `1px solid ${isAct ? cc : "#1a2d45"}`,
                            background: isAct ? `${cc}14` : "transparent",
                            color: isAct ? cc : "#5a6580",
                            cursor: "pointer", display: "flex", flexDirection: "column",
                            alignItems: "center", gap: 7, transition: "all 0.15s",
                          }}>
                          {icon}
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                            fontFamily: fonts.label }}>
                            {label.toUpperCase()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color Picker */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700,
                    color: "#e8ecf4", marginBottom: 10 }}>Block Color</label>
                  {/* Preset swatches */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {["#00d4ff","#3b82f6","#ff9f43","#2ed573","#ff4757","#a78bfa","#f472b6","#fbbf24","#e8ecf4"].map((swatch) => (
                      <button key={swatch} onClick={() => setCustomDraft(d => ({ ...d, color: swatch }))}
                        title={swatch}
                        style={{
                          width: 22, height: 22, borderRadius: 4, background: swatch, border: "none",
                          cursor: "pointer", padding: 0, flexShrink: 0,
                          outline: customDraft.color === swatch ? `2px solid ${swatch}` : "2px solid transparent",
                          outlineOffset: 2, transition: "outline 0.1s",
                        }}
                      />
                    ))}
                  </div>
                  {/* Custom color row: native color wheel + hex display */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: `conic-gradient(from 0deg, #ff4757, #ff9f43, #fbbf24, #2ed573, #00d4ff, #3b82f6, #a78bfa, #f472b6, #ff4757)`,
                        border: "2px solid #1a2d45", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <div style={{
                          width: 10, height: 10, borderRadius: "50%",
                          background: customDraft.color, border: "2px solid rgba(0,0,0,0.5)",
                          pointerEvents: "none",
                        }} />
                      </div>
                      <input type="color" value={customDraft.color}
                        onChange={e => setCustomDraft(d => ({ ...d, color: e.target.value }))}
                        style={{
                          position: "absolute", inset: 0, opacity: 0,
                          width: "100%", height: "100%", cursor: "pointer", padding: 0, border: "none",
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, position: "relative" }}>
                      <span style={{
                        position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                        width: 14, height: 14, borderRadius: 3, background: customDraft.color,
                        border: "1px solid rgba(255,255,255,0.15)", flexShrink: 0,
                        pointerEvents: "none",
                      }} />
                      <input
                        type="text"
                        value={customDraft.color}
                        onChange={e => {
                          const v = e.target.value;
                          if (/^#[0-9a-fA-F]{0,6}$/.test(v))
                            setCustomDraft(d => ({ ...d, color: v }));
                        }}
                        onBlur={e => {
                          if (!/^#[0-9a-fA-F]{6}$/.test(e.target.value))
                            setCustomDraft(d => ({ ...d, color: "#00d4ff" }));
                        }}
                        style={{
                          width: "100%", padding: "9px 12px 9px 34px", borderRadius: 8,
                          border: "1px solid #1a2d45", background: "#0d1526",
                          color: "#e8ecf4", fontFamily: fonts.data, fontSize: 13, outline: "none",
                          boxSizing: "border-box", letterSpacing: "0.05em",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Right: preview ── */}
              <div style={{ flex: 1, padding: "24px 28px",
                display: "flex", flexDirection: "column", gap: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#e8ecf4" }}>Block Preview</label>
                <div style={{ flex: 1, borderRadius: 8, border: "1px solid #1a2d45",
                  overflow: "hidden", background: "#0a0e1a", minHeight: 240 }}>
                  <canvas
                    ref={previewCanvasRef}
                    style={{ width: "100%", height: "100%", display: "block" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "TOTAL AREA:", value: `${customDraft.w * customDraft.h} SQ FT` },
                    { label: "PERIMETER:",  value: `${2 * (customDraft.w + customDraft.h)} FT` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                        color: "#5a6580", textTransform: "uppercase", fontFamily: fonts.label }}>
                        {label}
                      </span>
                      <span style={{ fontFamily: fonts.data, fontSize: 14, fontWeight: 700, color: "#e8ecf4" }}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 28px", borderTop: "1px solid #1a2236",
              display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowCustomModal(false)} style={{
                padding: "10px 24px", border: "1px solid #1a2236", borderRadius: 8,
                background: "transparent", color: "#8a9bb0",
                fontFamily: fonts.label, fontSize: 13, cursor: "pointer",
              }}>Cancel</button>
              <button onClick={handleAddCustomBlock}
                disabled={!customDraft.name.trim()}
                style={{
                  padding: "10px 24px", border: "none", borderRadius: 8,
                  background: customDraft.name.trim()
                    ? "linear-gradient(135deg, #00d4ff, #0099cc)"
                    : "rgba(0,212,255,0.12)",
                  color: customDraft.name.trim() ? "#0d1117" : "#4a6070",
                  fontFamily: fonts.label, fontSize: 13, fontWeight: 700,
                  cursor: customDraft.name.trim() ? "pointer" : "default",
                  display: "flex", alignItems: "center", gap: 8,
                  transition: "all 0.15s",
                }}>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <rect x="1" y="1" width="13" height="13" rx="2"
                    stroke="currentColor" strokeWidth="1.4" />
                  <line x1="7.5" y1="4" x2="7.5" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <line x1="4" y1="7.5" x2="11" y2="7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                Add to Library
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ PARAMS MODAL (Floor Plan Settings) ═══════════════ */}
      {showParamsModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, fontFamily: fonts.label,
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowParamsModal(false); }}>
          <div style={{
            background: "#0f1929", border: "1px solid #1a2d45", borderRadius: 14,
            width: 420, maxHeight: "80vh", overflow: "hidden",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid #1a2236",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#e8ecf4" }}>Floor Plan Settings</span>
              <button onClick={() => setShowParamsModal(false)} style={{
                background: "none", border: "none", color: "#5a6580", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Target SF */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: "#8a9bb0" }}>Target Square Footage</label>
                  <span style={{ fontFamily: fonts.data, fontSize: 12, color: "#e8ecf4", fontWeight: 600 }}>
                    {(draftParams ?? params).targetSF.toLocaleString()} sf
                  </span>
                </div>
                <input type="range" min={800} max={5000} step={50} value={(draftParams ?? params).targetSF}
                  onChange={setDraftP("targetSF")}
                  style={{ width: "100%", accentColor: "#00d4ff", cursor: "pointer" }} />
              </div>
              {/* Bedrooms */}
              {[
                { label: "Bedrooms", key: "bedrooms", opts: [1,2,3,4,5,6] },
                { label: "Bathrooms", key: "bathrooms", opts: [1,1.5,2,2.5,3,4] },
                { label: "Stories", key: "stories", opts: [1,2] },
              ].map(({ label, key, opts }) => (
                <div key={key}>
                  <label style={{ fontSize: 12, color: "#8a9bb0", display: "block", marginBottom: 8 }}>{label}</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {opts.map((n) => (
                      <button key={n} onClick={() => setDraftParams((p) => ({ ...p, [key]: n }))} style={{
                        flex: 1, padding: "5px 0", border: `1px solid ${(draftParams ?? params)[key] === n ? "#00d4ff" : "#1a2236"}`,
                        borderRadius: 6, background: (draftParams ?? params)[key] === n ? "rgba(0,212,255,0.12)" : "transparent",
                        color: (draftParams ?? params)[key] === n ? "#00d4ff" : "#5a6580",
                        fontFamily: fonts.data, fontSize: 12, cursor: "pointer",
                      }}>{n}</button>
                    ))}
                  </div>
                </div>
              ))}
              {/* Floor distribution preview — visible when stories > 1 */}
              {(draftParams ?? params).stories > 1 && (() => {
                const dp = draftParams ?? params;
                const alloc = computeFloorAllocation(dp.stories, dp.bedrooms, dp.bathrooms);
                return (
                  <div>
                    <label style={{ fontSize: 12, color: "#8a9bb0", display: "block", marginBottom: 8 }}>Room Distribution by Floor</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {alloc.map((a, i) => (
                        <div key={i} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "7px 10px", borderRadius: 6,
                          background: i === 0 ? "rgba(0,212,255,0.06)" : "rgba(59,130,246,0.06)",
                          border: `1px solid ${i === 0 ? "rgba(0,212,255,0.18)" : "rgba(59,130,246,0.18)"}`,
                        }}>
                          <span style={{ fontSize: 12, color: "#8a9bb0", fontFamily: fonts.label }}>
                            Floor {i + 1}{i === 0 ? " · Ground" : i === dp.stories - 1 ? " · Top" : " · Upper"}
                          </span>
                          <span style={{ fontFamily: fonts.data, fontSize: 12, fontWeight: 700, color: i === 0 ? "#00d4ff" : "#3b82f6" }}>
                            {a.beds} bed · {a.baths} bath
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {/* Lot */}
              {[
                { label: "Lot Width", key: "lotWidth", min: 30, max: 200, step: 5, unit: "ft" },
                { label: "Lot Depth", key: "lotDepth", min: 50, max: 300, step: 5, unit: "ft" },
              ].map(({ label, key, min, max, step, unit }) => (
                <div key={key}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <label style={{ fontSize: 12, color: "#8a9bb0" }}>{label}</label>
                    <span style={{ fontFamily: fonts.data, fontSize: 12, color: "#e8ecf4", fontWeight: 600 }}>
                      {(draftParams ?? params)[key]} {unit}
                    </span>
                  </div>
                  <input type="range" min={min} max={max} step={step} value={(draftParams ?? params)[key]}
                    onChange={setDraftP(key)}
                    style={{ width: "100%", accentColor: "#00d4ff", cursor: "pointer" }} />
                </div>
              ))}
              {/* Style + Garage */}
              {[
                { label: "Style", key: "style", opts: STYLE_OPTIONS },
                { label: "Garage", key: "garage", opts: GARAGE_OPTIONS },
              ].map(({ label, key, opts }) => (
                <div key={key}>
                  <label style={{ fontSize: 12, color: "#8a9bb0", display: "block", marginBottom: 8 }}>{label}</label>
                  <select value={(draftParams ?? params)[key]} onChange={setDraftP(key)} style={{
                    width: "100%", padding: "8px 10px", borderRadius: 6,
                    border: "1px solid #1a2236", background: "#0d1526",
                    color: "#c8d0e0", fontFamily: fonts.label, fontSize: 13, outline: "none",
                  }}>
                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              {/* Open floor plan */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#8a9bb0" }}>Open Floor Plan</span>
                <button onClick={() => setDraftParams((p) => ({ ...p, openFloorPlan: !p.openFloorPlan }))} style={{
                  width: 40, height: 22, borderRadius: 11, border: "none", position: "relative", cursor: "pointer",
                  background: (draftParams ?? params).openFloorPlan ? "#00d4ff" : "#1a2236", transition: "background 0.2s",
                }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%", background: "#fff",
                    position: "absolute", top: 3, left: (draftParams ?? params).openFloorPlan ? 21 : 3, transition: "left 0.2s",
                  }} />
                </button>
              </div>
            </div>
            {/* Modal footer */}
            <div style={{ padding: "14px 24px", borderTop: "1px solid #1a2236", display: "flex", gap: 8 }}>
              <button onClick={() => { setShowParamsModal(false); setDraftParams(null); }} style={{
                flex: 1, padding: "10px", border: "1px solid #1a2236", borderRadius: 6,
                background: "transparent", color: "#8a9bb0", fontFamily: fonts.label, fontSize: 13, cursor: "pointer",
              }}>Cancel</button>
              <button onClick={() => {
                const dp = draftParams || params;
                setParams(dp);
                setShowParamsModal(false);
                setDraftParams(null);
                handleGenerate(dp);
                setPlacedItems([]);
                setSelectedItemIdx(-1);
              }} style={{
                flex: 2, padding: "10px", border: "none", borderRadius: 6,
                background: "linear-gradient(135deg, #00d4ff, #0099cc)",
                color: "#0d1117", fontFamily: fonts.label, fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}>Regenerate Floor Plan</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ UNSAVED CHANGES WARNING MODAL ═══════ */}
      {blocker.state === "blocked" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            width: 420, background: "#141b2a", border: "1px solid #2a3548",
            borderRadius: 12, overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{ padding: "20px 24px 12px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: "rgba(255,71,87,0.15)", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 1.5L16.5 15H1.5L9 1.5Z" stroke="#ff4757" strokeWidth="1.5" fill="none" />
                  <line x1="9" y1="7" x2="9" y2="10.5" stroke="#ff4757" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="9" cy="12.5" r="0.75" fill="#ff4757" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#f0f4f8", fontFamily: fonts.label }}>
                  Unsaved Changes
                </div>
                <div style={{ fontSize: 12, color: "#8a9bb0", fontFamily: fonts.label, marginTop: 2 }}>
                  Your floor plan has not been saved
                </div>
              </div>
            </div>
            {/* Body */}
            <div style={{ padding: "8px 24px 20px" }}>
              <p style={{ margin: 0, fontSize: 13, color: "#8a9bb0", fontFamily: fonts.label, lineHeight: 1.5 }}>
                If you leave without saving, your current floor plan and all edits will be lost. Press <strong style={{ color: "#f0f4f8" }}>Save to Project</strong> to persist your work to your account.
              </p>
            </div>
            {/* Actions */}
            <div style={{
              padding: "14px 24px", borderTop: "1px solid #1a2236",
              display: "flex", gap: 10, justifyContent: "flex-end",
            }}>
              <button
                onClick={() => blocker.proceed()}
                style={{
                  padding: "9px 18px", border: "1px solid #2a3548", borderRadius: 6,
                  background: "transparent", color: "#ff4757",
                  fontFamily: fonts.label, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Leave Without Saving
              </button>
              <button
                onClick={() => blocker.reset()}
                style={{
                  padding: "9px 18px", border: "none", borderRadius: 6,
                  background: "#2a3548", color: "#f0f4f8",
                  fontFamily: fonts.label, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Go Back
              </button>
              <button
                onClick={async () => {
                  blocker.reset();
                  await handleSaveToEdit();
                }}
                style={{
                  padding: "9px 18px", border: "none", borderRadius: 6,
                  background: "linear-gradient(135deg, #00d4ff, #0099cc)",
                  color: "#0d1117",
                  fontFamily: fonts.label, fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                Save to Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

