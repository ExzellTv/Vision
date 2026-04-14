import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { colors, fonts } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import { projectsApi, costApi } from "../../services/api";
import { useUserType } from "../../context/UserTypeContext";

/* ───────────────────────────────────────────────────────────
   LAYER EDITOR — Screen #2
   Vision — AI-Powered Land Feasibility Intelligence Platform

   3D layer-by-layer material customization with:
   - Parametric 7-layer house model
   - 6 visualization modes (Standard, Exploded, Ghost, Section, Heatmap, Build-Up)
   - Layer toggle + material picker + cost breakdown
   - Orbit controls (mousedown/mousemove/mouseup + wheel)
   ─────────────────────────────────────────────────────────── */

// ── Helpers ──
const ftToUnits = (ft) => ft * 0.3;
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const lerpColor = (c1, c2, t) => {
  const r = lerp((c1 >> 16) & 0xff, (c2 >> 16) & 0xff, t);
  const g = lerp((c1 >> 8) & 0xff, (c2 >> 8) & 0xff, t);
  const b2 = lerp(c1 & 0xff, c2 & 0xff, t);
  return new THREE.Color(r / 255, g / 255, b2 / 255);
};

const HEAT_LOW = 0x3b82f6;
const HEAT_MID = 0xf59e0b;
const HEAT_HIGH = 0xef4444;
function heatColor(t) {
  if (t < 0.5) return lerpColor(HEAT_LOW, HEAT_MID, t * 2);
  return lerpColor(HEAT_MID, HEAT_HIGH, (t - 0.5) * 2);
}

const fmtCost = (v) => {
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
};

// ── Materials Data (MVP hardcoded) — PRD Section 2.2.1 ──
export const MATERIALS_DATA = [
  {
    layerIndex: 0,
    name: "Foundation",
    color: "#6b7a8a",
    options: [
      { name: "Slab", cost: 38000 },
      { name: "Pier & Beam", cost: 45000 },
    ],
  },
  {
    layerIndex: 1,
    name: "Structural Frame",
    color: "#c4956a",
    options: [
      { name: "Wood SPF", cost: 48000 },
      { name: "Steel Studs", cost: 56000 },
      { name: "LVL/Glulam", cost: 62000 },
      { name: "Concrete Block", cost: 52000 },
    ],
  },
  {
    layerIndex: 2,
    name: "Sheathing",
    color: "#a0845c",
    options: [
      { name: "OSB", cost: 18000 },
      { name: "ZIP System", cost: 28000 },
      { name: "SIP Panels", cost: 44000 },
    ],
  },
  {
    layerIndex: 3,
    name: "Insulation",
    color: "#e8a0c0",
    options: [
      { name: "Fiberglass Batt", cost: 12000 },
      { name: "Open-Cell Foam", cost: 22000 },
      { name: "Closed-Cell Foam", cost: 34000 },
    ],
  },
  {
    layerIndex: 4,
    name: "Drywall",
    color: "#e8e2da",
    options: [
      { name: "Standard", cost: 14000 },
      { name: "Moisture-Resistant", cost: 16000 },
      { name: "Acoustic", cost: 19000 },
    ],
  },
  {
    layerIndex: 5,
    name: "Exterior Cladding",
    color: "#8a9bb0",
    options: [
      { name: "Vinyl", cost: 16000 },
      { name: "Fiber Cement", cost: 24000 },
      { name: "Brick Veneer", cost: 38000 },
      { name: "Stone Veneer", cost: 52000 },
    ],
  },
  {
    layerIndex: 6,
    name: "Roof",
    color: "#7a5c3a",
    options: [
      { name: "Gable — Asphalt",   cost: 14000 },
      { name: "Gable — Metal",     cost: 22000 },
      { name: "Hip — Asphalt",     cost: 16000 },
      { name: "Flat — TPO",        cost: 11000 },
    ],
  },
  {
    layerIndex: 7,
    name: "Color Palette",
    color: "#e87070",
    options: [
      { name: "Custom Colors", cost: 0 },
    ],
  },
];

const VIZ_MODES = [
  { key: "standard", label: "Standard" },
  { key: "ghost", label: "Ghost" },
  { key: "section", label: "Section" },
  { key: "buildup", label: "Build-Up" },
];

// ── Paint swatches for the Color Palette layer ──
const PAINT_COLORS = [
  { name: "Classic White",  hex: "#F5F0E8" },
  { name: "Light Gray",     hex: "#C8CDD4" },
  { name: "Charcoal",       hex: "#3A3E45" },
  { name: "Midnight",       hex: "#1A1D24" },
  { name: "Navy Blue",      hex: "#1D3461" },
  { name: "Steel Blue",     hex: "#4682B4" },
  { name: "Sky Blue",       hex: "#8AB4D0" },
  { name: "Sage Green",     hex: "#7A9E87" },
  { name: "Forest Green",   hex: "#2D5A27" },
  { name: "Warm Beige",     hex: "#D4B896" },
  { name: "Sand",           hex: "#DDD0B3" },
  { name: "Terracotta",     hex: "#C4622D" },
  { name: "Deep Red",       hex: "#8B1A1A" },
  { name: "Slate Blue",     hex: "#6B7FA0" },
  { name: "Olive",          hex: "#6B7340" },
  { name: "Cream",          hex: "#FFFDD0" },
];

// ── Default Layer State ──
function createDefaultLayers() {
  return MATERIALS_DATA.map((ld, i) => ({
    name: ld.name,
    visible: i === 0, // only foundation visible on load; user reveals layers manually
    materialIndex: 0,
    material: ld.options[0].name,
    cost: ld.options[0].cost,
  }));
}

// ── PBR Materials for each layer ──
export function createLayerMaterials() {
  return {
    foundation: new THREE.MeshStandardMaterial({
      color: 0x6b7a8a, roughness: 0.92, metalness: 0.02,
    }),
    frame_wood: new THREE.MeshStandardMaterial({
      color: 0xc4956a, roughness: 0.7, metalness: 0.0,
    }),
    frame_steel: new THREE.MeshStandardMaterial({
      color: 0x7a8ea0, roughness: 0.35, metalness: 0.8,
    }),
    frame_lvl: new THREE.MeshStandardMaterial({
      color: 0xa88050, roughness: 0.6, metalness: 0.0,
    }),
    frame_cmu: new THREE.MeshStandardMaterial({
      color: 0x909898, roughness: 0.97, metalness: 0.02,
    }),
    sheathing_osb: new THREE.MeshStandardMaterial({
      color: 0xa0845c, roughness: 0.8, metalness: 0.0,
    }),
    sheathing_zip: new THREE.MeshStandardMaterial({
      color: 0x4a8a4a, roughness: 0.7, metalness: 0.0,
    }),
    sheathing_sip: new THREE.MeshStandardMaterial({
      color: 0xf0e8d0, roughness: 0.55, metalness: 0.0,
    }),
    insulation_fiberglass: new THREE.MeshStandardMaterial({
      color: 0xe8a0c0, roughness: 0.95, metalness: 0.0,
    }),
    insulation_foam_open: new THREE.MeshStandardMaterial({
      color: 0xe8d878, roughness: 0.9, metalness: 0.0,
    }),
    insulation_foam_closed: new THREE.MeshStandardMaterial({
      color: 0xd4b830, roughness: 0.82, metalness: 0.0,
    }),
    drywall: new THREE.MeshStandardMaterial({
      color: 0xe8e2da, roughness: 0.85, metalness: 0.0,
    }),
    drywall_moisture: new THREE.MeshStandardMaterial({
      color: 0xb8d8c0, roughness: 0.85, metalness: 0.0,
    }),
    drywall_acoustic: new THREE.MeshStandardMaterial({
      color: 0xd0c8b8, roughness: 0.92, metalness: 0.0,
    }),
    cladding_vinyl: new THREE.MeshStandardMaterial({
      color: 0xd0d4d8, roughness: 0.6, metalness: 0.05,
    }),
    cladding_fiber: new THREE.MeshStandardMaterial({
      color: 0x7a8fa8, roughness: 0.78, metalness: 0.05,
    }),
    cladding_brick: new THREE.MeshStandardMaterial({
      color: 0xa04030, roughness: 0.9, metalness: 0.0,
    }),
    cladding_stone: new THREE.MeshStandardMaterial({
      color: 0x908878, roughness: 0.95, metalness: 0.0,
    }),
    cladding_metal: new THREE.MeshStandardMaterial({
      color: 0x8898a8, roughness: 0.2, metalness: 0.85,
    }),
    paint_budget: new THREE.MeshStandardMaterial({
      color: 0xb8c8d8, roughness: 0.8, metalness: 0.0,
    }),
    paint_ceramic: new THREE.MeshStandardMaterial({
      color: 0xd8e8f0, roughness: 0.45, metalness: 0.08,
    }),
    // Roof layer materials
    roof_asphalt: new THREE.MeshStandardMaterial({
      color: 0x2a2a2e, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide,
    }),
    roof_metal: new THREE.MeshStandardMaterial({
      color: 0x8a9aaa, roughness: 0.2, metalness: 0.9, side: THREE.DoubleSide,
    }),
    roof_clay: new THREE.MeshStandardMaterial({
      color: 0xb05030, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
    }),
    roof_tpo: new THREE.MeshStandardMaterial({
      color: 0xddd8cc, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide,
    }),
    roof_slate: new THREE.MeshStandardMaterial({
      color: 0x4a4e5a, roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide,
    }),
  };
}

// Map from layer index + material index to material key
export const MATERIAL_KEY_MAP = {
  0: ["foundation", "foundation", "foundation"],
  1: ["frame_wood", "frame_steel", "frame_lvl", "frame_cmu"],
  2: ["sheathing_osb", "sheathing_zip", "sheathing_sip"],
  3: ["insulation_fiberglass", "insulation_foam_open", "insulation_foam_closed"],
  4: ["drywall", "drywall_moisture", "drywall_acoustic"],
  5: ["cladding_vinyl", "cladding_fiber", "cladding_brick", "cladding_stone"],
  6: ["roof_asphalt", "roof_metal", "roof_asphalt", "roof_tpo"],
  7: [],
};

// ── House dimensions (mutable — updated from project floor plan before each build) ──
let W = ftToUnits(44);
let D = ftToUnits(50);
let SH = ftToUnits(9);
const SLAB_H = ftToUnits(1.5);
const WALL_THICK = 0.12;
let WALL_H = SH - 0.08;

// ── Room shapes in 3D space — set from floor plan before each build ──
// Each entry: { cx, cz, w, d } — center position and size in Three.js units
let ROOMS = [];

/**
 * Merge sub-rooms that share an edge and have the same extent on the other axis.
 * Prevents visual fragmentation from per-room clipping.
 */
function mergeAdjacentRooms(rooms) {
  if (rooms.length <= 1) return rooms;
  const EPS = 0.02;
  const merged = rooms.map((r) => ({ ...r }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < merged.length && !changed; i++) {
      for (let j = i + 1; j < merged.length && !changed; j++) {
        const a = merged[i], b = merged[j];
        const aMinX = a.cx - a.w / 2, aMaxX = a.cx + a.w / 2;
        const aMinZ = a.cz - a.d / 2, aMaxZ = a.cz + a.d / 2;
        const bMinX = b.cx - b.w / 2, bMaxX = b.cx + b.w / 2;
        const bMinZ = b.cz - b.d / 2, bMaxZ = b.cz + b.d / 2;
        // Same x-range, adjacent in z
        if (Math.abs(aMinX - bMinX) < EPS && Math.abs(aMaxX - bMaxX) < EPS &&
            (Math.abs(aMaxZ - bMinZ) < EPS || Math.abs(bMaxZ - aMinZ) < EPS)) {
          const nMinZ = Math.min(aMinZ, bMinZ), nMaxZ = Math.max(aMaxZ, bMaxZ);
          merged[i] = { ...a, cz: (nMinZ + nMaxZ) / 2, d: nMaxZ - nMinZ };
          merged.splice(j, 1); changed = true;
        // Same z-range, adjacent in x
        } else if (Math.abs(aMinZ - bMinZ) < EPS && Math.abs(aMaxZ - bMaxZ) < EPS &&
                   (Math.abs(aMaxX - bMinX) < EPS || Math.abs(bMaxX - aMinX) < EPS)) {
          const nMinX = Math.min(aMinX, bMinX), nMaxX = Math.max(aMaxX, bMaxX);
          merged[i] = { ...a, cx: (nMinX + nMaxX) / 2, w: nMaxX - nMinX };
          merged.splice(j, 1); changed = true;
        }
      }
    }
  }
  return merged;
}

/**
 * Clip upper-story rooms so they only exist where supported by the floor below.
 * Intersects each upper room against each individual support room and keeps only
 * the overlapping portions. Merged afterwards to prevent fragmentation.
 */
function clipUpperRoomsToSupport(allRooms) {
  const maxStory = Math.max(...allRooms.map((r) => r.storyIndex ?? 0));
  if (maxStory === 0) return allRooms;

  const byStory = {};
  allRooms.forEach((r) => {
    const si = r.storyIndex ?? 0;
    if (!byStory[si]) byStory[si] = [];
    byStory[si].push(r);
  });

  const result = [...(byStory[0] || [])];

  for (let si = 1; si <= maxStory; si++) {
    const upperRooms = byStory[si] || [];
    const supportRooms = result.filter((r) => (r.storyIndex ?? 0) === si - 1);
    if (supportRooms.length === 0) { result.push(...upperRooms); continue; }

    const clipped = [];
    upperRooms.forEach((ur) => {
      const uMinX = ur.cx - ur.w / 2, uMaxX = ur.cx + ur.w / 2;
      const uMinZ = ur.cz - ur.d / 2, uMaxZ = ur.cz + ur.d / 2;
      supportRooms.forEach((sr) => {
        const sMinX = sr.cx - sr.w / 2, sMaxX = sr.cx + sr.w / 2;
        const sMinZ = sr.cz - sr.d / 2, sMaxZ = sr.cz + sr.d / 2;
        const iMinX = Math.max(uMinX, sMinX), iMaxX = Math.min(uMaxX, sMaxX);
        const iMinZ = Math.max(uMinZ, sMinZ), iMaxZ = Math.min(uMaxZ, sMaxZ);
        if (iMaxX > iMinX + 0.001 && iMaxZ > iMinZ + 0.001) {
          clipped.push({
            cx: (iMinX + iMaxX) / 2, cz: (iMinZ + iMaxZ) / 2,
            w: iMaxX - iMinX, d: iMaxZ - iMinZ,
            yBase: ur.yBase, storyIndex: ur.storyIndex,
          });
        }
      });
    });

    result.push(...mergeAdjacentRooms(clipped));
  }

  return result;
}

export function updateRooms(rooms, storyPlans) {
  const storyH = SLAB_H + WALL_H;

  // Multi-story path: use storyPlans array
  if (storyPlans && storyPlans.length > 1) {
    // Gather all rooms from all stories; center using story 0's actual bounding box
    const rawByStory = [];
    storyPlans.forEach((plan, si) => {
      const planRooms = plan.rooms || [];
      rawByStory.push({ si, rooms: planRooms });
    });

    // Compute centering offset from story 0's actual room extents
    const s0Rooms = rawByStory.find((s) => s.si === 0)?.rooms || [];
    let cenW, cenD;
    if (s0Rooms.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      s0Rooms.forEach((r) => {
        minX = Math.min(minX, r.x);
        maxX = Math.max(maxX, r.x + r.w);
        minY = Math.min(minY, r.y);
        maxY = Math.max(maxY, r.y + r.h);
      });
      cenW = ftToUnits((minX + maxX) / 2);
      cenD = ftToUnits((minY + maxY) / 2);
    } else {
      cenW = W / 2;
      cenD = D / 2;
    }

    const allRooms = [];
    rawByStory.forEach(({ si, rooms: planRooms }) => {
      const yBase = si * storyH;
      planRooms.forEach((r) => {
        allRooms.push({
          cx: ftToUnits(r.x + r.w / 2) - cenW,
          cz: ftToUnits(r.y + r.h / 2) - cenD,
          w: Math.max(ftToUnits(r.w), 0.1),
          d: Math.max(ftToUnits(r.h), 0.1),
          yBase,
          storyIndex: si,
        });
      });
    });
    // Clip upper stories so they don't extend beyond the floor below
    ROOMS = allRooms.length > 0 ? clipUpperRoomsToSupport(allRooms) : [{ cx: 0, cz: 0, w: W, d: D, yBase: 0, storyIndex: 0 }];
    return;
  }

  // Single-story path
  if (!rooms || rooms.length === 0) {
    ROOMS = [{ cx: 0, cz: 0, w: W, d: D, yBase: 0, storyIndex: 0 }];
    return;
  }
  // Compute centering from actual room extents
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  rooms.forEach((r) => {
    minX = Math.min(minX, r.x);
    maxX = Math.max(maxX, r.x + r.w);
    minY = Math.min(minY, r.y);
    maxY = Math.max(maxY, r.y + r.h);
  });
  const cenW = ftToUnits((minX + maxX) / 2);
  const cenD = ftToUnits((minY + maxY) / 2);
  const converted = rooms.map((r) => ({
    cx: ftToUnits(r.x + r.w / 2) - cenW,
    cz: ftToUnits(r.y + r.h / 2) - cenD,
    w: Math.max(ftToUnits(r.w), 0.1),
    d: Math.max(ftToUnits(r.h), 0.1),
    yBase: 0,
    storyIndex: 0,
  }));
  ROOMS = converted.length > 0 ? converted : [{ cx: 0, cz: 0, w: W, d: D, yBase: 0, storyIndex: 0 }];
}

// ── Build each layer group ──

function buildFoundationSlab(mats) {
  const group = new THREE.Group();
  group.name = "layer_foundation";
  ROOMS.forEach((r) => {
    if ((r.storyIndex ?? 0) > 0) return; // upper floors sit on top — no foundation
    const yOff = r.yBase ?? 0;
    // Extend to match the outer face of the cladding layer (WALL_THICK/2 + 0.04 + panelThick per side)
    const geo = new THREE.BoxGeometry(r.w + 0.25, SLAB_H, r.d + 0.25);
    const mesh = new THREE.Mesh(geo, mats.foundation);
    mesh.position.set(r.cx, yOff + SLAB_H / 2, r.cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  return group;
}

function buildFoundationPierBeam(mats) {
  const group = new THREE.Group();
  group.name = "layer_foundation";
  const beamMat = new THREE.MeshStandardMaterial({ color: 0xc4956a, roughness: 0.7 });
  ROOMS.forEach((r) => {
    if ((r.storyIndex ?? 0) > 0) return; // upper floors sit on top — no pier/beam
    const yOff = r.yBase ?? 0;
    const pierSide = Math.min(0.22, r.w / 10);
    const beamH = SLAB_H * 0.25;
    const nX = Math.max(2, Math.round(r.w / ftToUnits(4)));
    const nZ = Math.max(2, Math.round(r.d / ftToUnits(4)));
    const pierGeo = new THREE.BoxGeometry(pierSide, SLAB_H, pierSide);
    for (let rr = 0; rr <= nZ; rr++) {
      for (let c = 0; c <= nX; c++) {
        const pier = new THREE.Mesh(pierGeo, mats.foundation);
        pier.position.set(
          r.cx - r.w / 2 + (c / nX) * r.w,
          yOff + SLAB_H / 2,
          r.cz - r.d / 2 + (rr / nZ) * r.d
        );
        pier.castShadow = true;
        group.add(pier);
      }
    }
    // Cross beams
    const beamGeo = new THREE.BoxGeometry(r.w, beamH, pierSide * 0.7);
    for (let rr = 0; rr <= nZ; rr++) {
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(r.cx, yOff + SLAB_H - beamH / 2, r.cz - r.d / 2 + (rr / nZ) * r.d);
      group.add(beam);
    }
    const crossGeo = new THREE.BoxGeometry(pierSide * 0.7, beamH, r.d);
    for (let c = 0; c <= nX; c++) {
      const beam = new THREE.Mesh(crossGeo, beamMat);
      beam.position.set(r.cx - r.w / 2 + (c / nX) * r.w, yOff + SLAB_H - beamH / 2, r.cz);
      group.add(beam);
    }
  });
  return group;
}

function buildFoundationCrawlspace(mats) {
  const group = new THREE.Group();
  group.name = "layer_foundation";
  const wallThick = 0.1;
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.98 });
  ROOMS.forEach((r) => {
    if ((r.storyIndex ?? 0) > 0) return; // upper floors sit on top — no crawlspace
    const yOff = r.yBase ?? 0;
    // Perimeter stem walls
    const fwGeo = new THREE.BoxGeometry(r.w + wallThick * 2, SLAB_H, wallThick);
    const front = new THREE.Mesh(fwGeo, mats.foundation);
    front.position.set(r.cx, yOff + SLAB_H / 2, r.cz + r.d / 2 + wallThick / 2);
    front.castShadow = true;
    group.add(front);
    const back = new THREE.Mesh(fwGeo, mats.foundation);
    back.position.set(r.cx, yOff + SLAB_H / 2, r.cz - r.d / 2 - wallThick / 2);
    group.add(back);

    const swGeo = new THREE.BoxGeometry(wallThick, SLAB_H, r.d);
    const left = new THREE.Mesh(swGeo, mats.foundation);
    left.position.set(r.cx - r.w / 2 - wallThick / 2, yOff + SLAB_H / 2, r.cz);
    group.add(left);
    const right = new THREE.Mesh(swGeo, mats.foundation);
    right.position.set(r.cx + r.w / 2 + wallThick / 2, yOff + SLAB_H / 2, r.cz);
    group.add(right);

    // Dirt floor
    const floorGeo = new THREE.BoxGeometry(r.w, SLAB_H * 0.06, r.d);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(r.cx, yOff + SLAB_H * 0.03, r.cz);
    group.add(floor);

    // Top slab
    const topGeo = new THREE.BoxGeometry(r.w + wallThick * 2, SLAB_H * 0.18, r.d + wallThick * 2);
    const top = new THREE.Mesh(topGeo, mats.foundation);
    top.position.set(r.cx, yOff + SLAB_H - SLAB_H * 0.09, r.cz);
    top.receiveShadow = true;
    group.add(top);
  });
  return group;
}

function buildFoundationLayer(mats, type = 0) {
  switch (type) {
    case 1: return buildFoundationPierBeam(mats);
    case 2: return buildFoundationCrawlspace(mats);
    default: return buildFoundationSlab(mats);
  }
}

function buildFrameLayer(mats) {
  const group = new THREE.Group();
  group.name = "layer_frame";
  const studH = WALL_H;
  const studSpacing = ftToUnits(1.33); // 16" OC

  ROOMS.forEach((r) => {
    const baseY = (r.yBase ?? 0) + ((r.storyIndex ?? 0) === 0 ? SLAB_H : 0);
    // Front/back wall studs
    const studGeo = new THREE.BoxGeometry(0.04, studH, 0.09);
    const nStudsW = Math.max(2, Math.floor(r.w / studSpacing));
    for (let i = 0; i <= nStudsW; i++) {
      const x = r.cx - r.w / 2 + (i / nStudsW) * r.w;
      const sf = new THREE.Mesh(studGeo, mats.frame_wood);
      sf.position.set(x, baseY + 0.08 + studH / 2, r.cz + r.d / 2);
      sf.castShadow = true;
      group.add(sf);
      const sb = new THREE.Mesh(studGeo, mats.frame_wood);
      sb.position.set(x, baseY + 0.08 + studH / 2, r.cz - r.d / 2);
      sb.castShadow = true;
      group.add(sb);
    }
    // Side wall studs
    const sideStudGeo = new THREE.BoxGeometry(0.09, studH, 0.04);
    const nStudsD = Math.max(2, Math.floor(r.d / studSpacing));
    for (let i = 0; i <= nStudsD; i++) {
      const z = r.cz - r.d / 2 + (i / nStudsD) * r.d;
      const sl = new THREE.Mesh(sideStudGeo, mats.frame_wood);
      sl.position.set(r.cx - r.w / 2, baseY + 0.08 + studH / 2, z);
      sl.castShadow = true;
      group.add(sl);
      const sr = new THREE.Mesh(sideStudGeo, mats.frame_wood);
      sr.position.set(r.cx + r.w / 2, baseY + 0.08 + studH / 2, z);
      sr.castShadow = true;
      group.add(sr);
    }
    // Top plate
    const tpGeo = new THREE.BoxGeometry(r.w, 0.04, 0.09);
    const tpF = new THREE.Mesh(tpGeo, mats.frame_wood);
    tpF.position.set(r.cx, baseY + 0.08 + studH + 0.02, r.cz + r.d / 2);
    group.add(tpF);
    const tpB = new THREE.Mesh(tpGeo, mats.frame_wood);
    tpB.position.set(r.cx, baseY + 0.08 + studH + 0.02, r.cz - r.d / 2);
    group.add(tpB);
    // Floor joists
    const joistGeo = new THREE.BoxGeometry(0.04, 0.18, r.d * 0.95);
    const nJoists = Math.max(3, Math.floor(r.w / studSpacing));
    for (let i = 0; i <= nJoists; i++) {
      const x = r.cx - r.w / 2 + (i / nJoists) * r.w;
      const joist = new THREE.Mesh(joistGeo, mats.frame_wood);
      joist.position.set(x, baseY + 0.09, r.cz);
      joist.castShadow = true;
      group.add(joist);
    }
  });
  return group;
}

function buildSheathingLayer(mats) {
  const group = new THREE.Group();
  group.name = "layer_sheathing";
  const sheathThick = 0.02;
  const panelH = WALL_H + 0.04;
  const off = WALL_THICK / 2 + sheathThick / 2;

  ROOMS.forEach((r) => {
    const baseY = (r.yBase ?? 0) + ((r.storyIndex ?? 0) === 0 ? SLAB_H : 0);
    const fGeo = new THREE.BoxGeometry(r.w, panelH, sheathThick);
    const f = new THREE.Mesh(fGeo, mats.sheathing_osb);
    f.position.set(r.cx, baseY + 0.06 + panelH / 2, r.cz + r.d / 2 + off);
    f.castShadow = true;
    group.add(f);
    const b = new THREE.Mesh(fGeo, mats.sheathing_osb);
    b.position.set(r.cx, baseY + 0.06 + panelH / 2, r.cz - r.d / 2 - off);
    b.castShadow = true;
    group.add(b);

    const sGeo = new THREE.BoxGeometry(sheathThick, panelH, r.d);
    const l = new THREE.Mesh(sGeo, mats.sheathing_osb);
    l.position.set(r.cx - r.w / 2 - off, baseY + 0.06 + panelH / 2, r.cz);
    l.castShadow = true;
    group.add(l);
    const rr = new THREE.Mesh(sGeo, mats.sheathing_osb);
    rr.position.set(r.cx + r.w / 2 + off, baseY + 0.06 + panelH / 2, r.cz);
    rr.castShadow = true;
    group.add(rr);
  });
  return group;
}

function buildInsulationLayer(mats) {
  const group = new THREE.Group();
  group.name = "layer_insulation";
  const battH = WALL_H - 0.1;
  const battThick = 0.08;
  const battW = ftToUnits(1.33) - 0.06;
  const studSpacing = ftToUnits(1.33);

  ROOMS.forEach((r) => {
    const baseY = (r.yBase ?? 0) + ((r.storyIndex ?? 0) === 0 ? SLAB_H : 0);
    const nStudsW = Math.max(2, Math.floor(r.w / studSpacing));
    for (let i = 0; i < nStudsW; i++) {
      const x = r.cx - r.w / 2 + (i / nStudsW) * r.w + studSpacing / 2;
      const bF = new THREE.Mesh(
        new THREE.BoxGeometry(battW, battH, battThick), mats.insulation_fiberglass
      );
      bF.position.set(x, baseY + 0.12 + battH / 2, r.cz + r.d / 2);
      group.add(bF);
      const bB = bF.clone();
      bB.position.z = r.cz - r.d / 2;
      group.add(bB);
    }
    const nStudsD = Math.max(2, Math.floor(r.d / studSpacing));
    for (let i = 0; i < nStudsD; i++) {
      const z = r.cz - r.d / 2 + (i / nStudsD) * r.d + studSpacing / 2;
      const bL = new THREE.Mesh(
        new THREE.BoxGeometry(battThick, battH, battW), mats.insulation_fiberglass
      );
      bL.position.set(r.cx - r.w / 2, baseY + 0.12 + battH / 2, z);
      group.add(bL);
      const bR = bL.clone();
      bR.position.x = r.cx + r.w / 2;
      group.add(bR);
    }
  });
  return group;
}

function buildDrywallLayer(mats) {
  const group = new THREE.Group();
  group.name = "layer_drywall";
  const panelH = WALL_H;
  const panelThick = 0.015;
  const off = WALL_THICK / 2 + panelThick / 2;

  ROOMS.forEach((r) => {
    const baseY = (r.yBase ?? 0) + ((r.storyIndex ?? 0) === 0 ? SLAB_H : 0);
    const fGeo = new THREE.BoxGeometry(r.w - 0.04, panelH, panelThick);
    const f = new THREE.Mesh(fGeo, mats.drywall);
    f.position.set(r.cx, baseY + 0.08 + panelH / 2, r.cz + r.d / 2 - off);
    group.add(f);
    const b = new THREE.Mesh(fGeo, mats.drywall);
    b.position.set(r.cx, baseY + 0.08 + panelH / 2, r.cz - r.d / 2 + off);
    group.add(b);

    const sGeo = new THREE.BoxGeometry(panelThick, panelH, r.d - 0.04);
    const l = new THREE.Mesh(sGeo, mats.drywall);
    l.position.set(r.cx - r.w / 2 + off, baseY + 0.08 + panelH / 2, r.cz);
    group.add(l);
    const rr = new THREE.Mesh(sGeo, mats.drywall);
    rr.position.set(r.cx + r.w / 2 - off, baseY + 0.08 + panelH / 2, r.cz);
    group.add(rr);

    // Ceiling
    const cGeo = new THREE.BoxGeometry(r.w - 0.08, panelThick, r.d - 0.08);
    const ceil = new THREE.Mesh(cGeo, mats.drywall);
    ceil.position.set(r.cx, baseY + 0.08 + panelH - panelThick / 2, r.cz);
    group.add(ceil);
  });
  return group;
}

function buildCladdingLayer(mats) {
  const group = new THREE.Group();
  group.name = "layer_cladding";
  const panelH = WALL_H + 0.08;
  const panelThick = 0.025;
  const off = WALL_THICK / 2 + 0.04 + panelThick / 2;

  ROOMS.forEach((r) => {
    const baseY = (r.yBase ?? 0) + ((r.storyIndex ?? 0) === 0 ? SLAB_H : 0);
    const fGeo = new THREE.BoxGeometry(r.w, panelH, panelThick);
    const f = new THREE.Mesh(fGeo, mats.cladding_fiber);
    f.position.set(r.cx, baseY + 0.04 + panelH / 2, r.cz + r.d / 2 + off);
    f.castShadow = true;
    f.receiveShadow = true;
    group.add(f);
    const b = new THREE.Mesh(fGeo, mats.cladding_fiber);
    b.position.set(r.cx, baseY + 0.04 + panelH / 2, r.cz - r.d / 2 - off);
    b.castShadow = true;
    b.receiveShadow = true;
    group.add(b);

    const sGeo = new THREE.BoxGeometry(panelThick, panelH, r.d);
    const l = new THREE.Mesh(sGeo, mats.cladding_fiber);
    l.position.set(r.cx - r.w / 2 - off, baseY + 0.04 + panelH / 2, r.cz);
    l.castShadow = true;
    l.receiveShadow = true;
    group.add(l);
    const rr = new THREE.Mesh(sGeo, mats.cladding_fiber);
    rr.position.set(r.cx + r.w / 2 + off, baseY + 0.04 + panelH / 2, r.cz);
    rr.castShadow = true;
    rr.receiveShadow = true;
    group.add(rr);
  });
  return group;
}

function buildPaintLayer(mats) {
  const group = new THREE.Group();
  group.name = "layer_paint";
  const panelH = WALL_H + 0.1;
  const panelThick = 0.005;
  const off = WALL_THICK / 2 + 0.04 + 0.025 + panelThick / 2 + 0.002;

  ROOMS.forEach((r) => {
    const baseY = (r.yBase ?? 0) + ((r.storyIndex ?? 0) === 0 ? SLAB_H : 0);
    const fGeo = new THREE.BoxGeometry(r.w, panelH, panelThick);
    const f = new THREE.Mesh(fGeo, mats.paint_budget);
    f.position.set(r.cx, baseY + 0.03 + panelH / 2, r.cz + r.d / 2 + off);
    group.add(f);
    const b = new THREE.Mesh(fGeo, mats.paint_budget);
    b.position.set(r.cx, baseY + 0.03 + panelH / 2, r.cz - r.d / 2 - off);
    group.add(b);

    const sGeo = new THREE.BoxGeometry(panelThick, panelH, r.d);
    const l = new THREE.Mesh(sGeo, mats.paint_budget);
    l.position.set(r.cx - r.w / 2 - off, baseY + 0.03 + panelH / 2, r.cz);
    group.add(l);
    const rr = new THREE.Mesh(sGeo, mats.paint_budget);
    rr.position.set(r.cx + r.w / 2 + off, baseY + 0.03 + panelH / 2, r.cz);
    group.add(rr);
  });
  return group;
}

// ── Roof helpers ──

/**
 * Compute a bounding-box footprint for a set of rooms.
 * Returns { topY, cx, cz, w, d }.
 */
function computeFootprint(rooms, overhang) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let topY = 0;
  rooms.forEach((r) => {
    minX = Math.min(minX, r.cx - r.w / 2);
    maxX = Math.max(maxX, r.cx + r.w / 2);
    minZ = Math.min(minZ, r.cz - r.d / 2);
    maxZ = Math.max(maxZ, r.cz + r.d / 2);
    const base = (r.yBase ?? 0) + ((r.storyIndex ?? 0) === 0 ? SLAB_H : 0);
    topY = Math.max(topY, base + WALL_H + 0.02);
  });
  minX -= overhang; maxX += overhang;
  minZ -= overhang; maxZ += overhang;
  return {
    topY,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    w: maxX - minX,
    d: maxZ - minZ,
  };
}

/**
 * Check whether a room is fully covered by a set of other rooms (on the story above).
 * Samples a grid of points inside the room and checks if each is inside some cover room.
 */
function isRoomFullyCovered(room, coverRooms) {
  const EPS = 0.02;
  const rMinX = room.cx - room.w / 2 + EPS, rMaxX = room.cx + room.w / 2 - EPS;
  const rMinZ = room.cz - room.d / 2 + EPS, rMaxZ = room.cz + room.d / 2 - EPS;
  const N = 3;
  for (let xi = 0; xi <= N; xi++) {
    for (let zi = 0; zi <= N; zi++) {
      const px = rMinX + (rMaxX - rMinX) * xi / N;
      const pz = rMinZ + (rMaxZ - rMinZ) * zi / N;
      let hit = false;
      for (const cr of coverRooms) {
        if (px >= cr.cx - cr.w / 2 - EPS && px <= cr.cx + cr.w / 2 + EPS &&
            pz >= cr.cz - cr.d / 2 - EPS && pz <= cr.cz + cr.d / 2 + EPS) {
          hit = true; break;
        }
      }
      if (!hit) return false;
    }
  }
  return true;
}

/**
 * Cluster rooms that share an edge or overlap into groups (union-find).
 * Returns an array of arrays of rooms.
 */
function clusterRooms(rooms) {
  if (rooms.length === 0) return [];
  const EPS = 0.02;
  function touching(a, b) {
    return a.cx - a.w / 2 <= b.cx + b.w / 2 + EPS &&
           a.cx + a.w / 2 >= b.cx - b.w / 2 - EPS &&
           a.cz - a.d / 2 <= b.cz + b.d / 2 + EPS &&
           a.cz + a.d / 2 >= b.cz - b.d / 2 - EPS;
  }
  const parent = rooms.map((_, i) => i);
  function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
  function union(a, b) { parent[find(a)] = find(b); }
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++)
      if (touching(rooms[i], rooms[j])) union(i, j);
  const groups = {};
  rooms.forEach((r, i) => { const root = find(i); if (!groups[root]) groups[root] = []; groups[root].push(r); });
  return Object.values(groups);
}

/**
 * Compute roof footprints for all stories that need a roof.
 * Returns an array of { topY, cx, cz, w, d } footprints.
 * For each story, rooms NOT fully covered by rooms on the floor above are "exposed"
 * and grouped into clusters, each getting its own roof footprint.
 */
function getRoofFootprints(overhang = ftToUnits(1.5)) {
  if (!ROOMS.length) {
    return [{
      topY: SLAB_H + WALL_H + 0.02,
      cx: 0, cz: 0,
      w: W + overhang * 2, d: D + overhang * 2,
    }];
  }

  const maxStory = Math.max(...ROOMS.map((r) => r.storyIndex ?? 0));

  if (maxStory === 0) {
    return [computeFootprint(ROOMS, overhang)];
  }

  const footprints = [];

  // Walk from top story down; find rooms that need a roof on each level
  for (let si = maxStory; si >= 0; si--) {
    const storyRooms = ROOMS.filter((r) => (r.storyIndex ?? 0) === si);
    const aboveRooms = ROOMS.filter((r) => (r.storyIndex ?? 0) === si + 1);

    const exposedRooms = aboveRooms.length === 0
      ? storyRooms
      : storyRooms.filter((r) => !isRoomFullyCovered(r, aboveRooms));

    if (exposedRooms.length > 0) {
      const clusters = clusterRooms(exposedRooms);
      clusters.forEach((cluster) => {
        footprints.push(computeFootprint(cluster, overhang));
      });
    }
  }

  return footprints;
}

// Keep legacy single-footprint helper for any callers
function getRoofFootprint(overhang = ftToUnits(1.5)) {
  return getRoofFootprints(overhang)[0];
}

// Helper: add a quad (2 triangles, double-sided) from 4 world-space corners
function addQuad(group, mat, a, b, c, d) {
  const verts = new Float32Array([
    ...a, ...b, ...c,  // tri 1 front
    ...a, ...c, ...d,  // tri 2 front
    ...c, ...b, ...a,  // tri 1 back
    ...d, ...c, ...a,  // tri 2 back
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, mat));
}

// Helper: add a triangle (double-sided)
function addTri(group, mat, a, b, c) {
  const verts = new Float32Array([...a, ...b, ...c, ...c, ...b, ...a]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, mat));
}

function buildGableRoof(mat, bounds) {
  const group = new THREE.Group();
  group.name = "roof_gable";
  const { topY, cx, cz, w, d } = bounds.roofFootprint;
  const pitch = ftToUnits(6.5);

  // Ridge runs along the long axis of the footprint
  if (w >= d) {
    // ── Ridge along X, slopes in Z ──
    const run = d / 2;
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const zFront = cz + d / 2, zBack = cz - d / 2;
    const ridgeY = topY + pitch;

    // Front slope (z+ eave → ridge)
    addQuad(group, mat,
      [x0, topY, zFront], [x1, topY, zFront],
      [x1, ridgeY, cz],   [x0, ridgeY, cz],
    );
    // Back slope (z- eave → ridge)
    addQuad(group, mat,
      [x1, topY, zBack], [x0, topY, zBack],
      [x0, ridgeY, cz],  [x1, ridgeY, cz],
    );
    // Gable triangles (west / east ends)
    addTri(group, mat, [x0, topY, zBack], [x0, topY, zFront], [x0, ridgeY, cz]);
    addTri(group, mat, [x1, topY, zFront], [x1, topY, zBack], [x1, ridgeY, cz]);
    // Ridge beam
    const rg = new THREE.BoxGeometry(w + 0.05, 0.07, 0.07);
    const rm = new THREE.Mesh(rg, mat);
    rm.position.set(cx, ridgeY + 0.035, cz);
    group.add(rm);
  } else {
    // ── Ridge along Z, slopes in X ──
    const z0 = cz - d / 2, z1 = cz + d / 2;
    const xLeft = cx - w / 2, xRight = cx + w / 2;
    const ridgeY = topY + pitch;

    // Left slope (x- eave → ridge)
    addQuad(group, mat,
      [xLeft, topY, z0], [xLeft, topY, z1],
      [cx, ridgeY, z1],  [cx, ridgeY, z0],
    );
    // Right slope (x+ eave → ridge)
    addQuad(group, mat,
      [xRight, topY, z1], [xRight, topY, z0],
      [cx, ridgeY, z0],   [cx, ridgeY, z1],
    );
    // Gable triangles (south / north ends)
    addTri(group, mat, [xLeft, topY, z0], [xRight, topY, z0], [cx, ridgeY, z0]);
    addTri(group, mat, [xRight, topY, z1], [xLeft, topY, z1], [cx, ridgeY, z1]);
    // Ridge beam
    const rg = new THREE.BoxGeometry(0.07, 0.07, d + 0.05);
    const rm = new THREE.Mesh(rg, mat);
    rm.position.set(cx, ridgeY + 0.035, cz);
    group.add(rm);
  }

  return group;
}

function buildHipRoof(mat, bounds) {
  const group = new THREE.Group();
  group.name = "roof_hip";
  const { topY, cx, cz, w, d } = bounds.roofFootprint;
  const pitch = ftToUnits(6);
  const ridgeY = topY + pitch;

  // Ridge length = |w - d|, setback inward along the short axis by d/2 (or w/2)
  if (w >= d) {
    // Ridge along X
    const ridgeHalf = Math.max(0.01, (w - d) / 2);
    const rx0 = cx - ridgeHalf, rx1 = cx + ridgeHalf;
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const z0 = cz - d / 2, z1 = cz + d / 2;

    // Front face (z+): trapezoid
    addQuad(group, mat, [x0, topY, z1], [x1, topY, z1], [rx1, ridgeY, cz], [rx0, ridgeY, cz]);
    // Back face (z-): trapezoid
    addQuad(group, mat, [x1, topY, z0], [x0, topY, z0], [rx0, ridgeY, cz], [rx1, ridgeY, cz]);
    // Left hip (x-): triangle
    addTri(group, mat, [x0, topY, z0], [x0, topY, z1], [rx0, ridgeY, cz]);
    // Right hip (x+): triangle
    addTri(group, mat, [x1, topY, z1], [x1, topY, z0], [rx1, ridgeY, cz]);
    // Ridge beam
    const rl = Math.max(0.05, rx1 - rx0);
    const rg = new THREE.BoxGeometry(rl + 0.05, 0.07, 0.07);
    const rm = new THREE.Mesh(rg, mat);
    rm.position.set(cx, ridgeY + 0.035, cz);
    group.add(rm);
  } else {
    // Ridge along Z
    const ridgeHalf = Math.max(0.01, (d - w) / 2);
    const rz0 = cz - ridgeHalf, rz1 = cz + ridgeHalf;
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const z0 = cz - d / 2, z1 = cz + d / 2;

    // Left face (x-): trapezoid
    addQuad(group, mat, [x0, topY, z0], [x0, topY, z1], [cx, ridgeY, rz1], [cx, ridgeY, rz0]);
    // Right face (x+): trapezoid
    addQuad(group, mat, [x1, topY, z1], [x1, topY, z0], [cx, ridgeY, rz0], [cx, ridgeY, rz1]);
    // Front hip (z+): triangle
    addTri(group, mat, [x1, topY, z1], [x0, topY, z1], [cx, ridgeY, rz1]);
    // Back hip (z-): triangle
    addTri(group, mat, [x0, topY, z0], [x1, topY, z0], [cx, ridgeY, rz0]);
    // Ridge beam
    const rl = Math.max(0.05, rz1 - rz0);
    const rg = new THREE.BoxGeometry(0.07, 0.07, rl + 0.05);
    const rm = new THREE.Mesh(rg, mat);
    rm.position.set(cx, ridgeY + 0.035, cz);
    group.add(rm);
  }

  return group;
}

function buildFlatRoof(mat, bounds) {
  const group = new THREE.Group();
  group.name = "roof_flat";
  const { topY, cx, cz, w, d } = bounds.roofFootprint;
  const slabH = ftToUnits(0.5);
  const parapetH = ftToUnits(1.5);
  const parapetT = ftToUnits(0.33);

  // Slab
  const slabGeo = new THREE.BoxGeometry(w, slabH, d);
  const slab = new THREE.Mesh(slabGeo, mat);
  slab.position.set(cx, topY + slabH / 2, cz);
  group.add(slab);

  // Parapet walls
  [
    { size: [w + parapetT * 2, parapetH, parapetT], pos: [cx, topY + slabH + parapetH / 2, cz + d / 2 + parapetT / 2] },
    { size: [w + parapetT * 2, parapetH, parapetT], pos: [cx, topY + slabH + parapetH / 2, cz - d / 2 - parapetT / 2] },
    { size: [parapetT, parapetH, d], pos: [cx + w / 2 + parapetT / 2, topY + slabH + parapetH / 2, cz] },
    { size: [parapetT, parapetH, d], pos: [cx - w / 2 - parapetT / 2, topY + slabH + parapetH / 2, cz] },
  ].forEach(({ size, pos }) => {
    const geo = new THREE.BoxGeometry(...size);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    group.add(m);
  });

  return group;
}

function buildShedRoof(mat, bounds) {
  const group = new THREE.Group();
  group.name = "roof_shed";
  const { topY, cx, cz, w, d } = bounds.roofFootprint;
  const pitchH = ftToUnits(6);

  const x0 = cx - w / 2, x1 = cx + w / 2;
  const z0 = cz - d / 2, z1 = cz + d / 2;

  // Single slope: low at z-, high at z+
  addQuad(group, mat,
    [x0, topY, z0], [x1, topY, z0],
    [x1, topY + pitchH, z1], [x0, topY + pitchH, z1],
  );
  // End caps
  addTri(group, mat, [x0, topY, z0], [x0, topY, z1], [x0, topY + pitchH, z1]);
  addTri(group, mat, [x1, topY, z1], [x1, topY, z0], [x1, topY + pitchH, z1]);

  return group;
}

function buildMansardRoof(mat, bounds) {
  const group = new THREE.Group();
  group.name = "roof_mansard";
  const { topY, cx, cz, w, d } = bounds.roofFootprint;
  const lowerH = ftToUnits(5);
  const setback = ftToUnits(2.5);
  const upperH = ftToUnits(1.5);
  const iw = Math.max(0.3, w - setback * 2);
  const id = Math.max(0.3, d - setback * 2);

  // 4 steep trapezoidal lower slopes
  addQuad(group, mat,
    [cx - w / 2, topY, cz + d / 2], [cx + w / 2, topY, cz + d / 2],
    [cx + iw / 2, topY + lowerH, cz + id / 2], [cx - iw / 2, topY + lowerH, cz + id / 2],
  );
  addQuad(group, mat,
    [cx + w / 2, topY, cz - d / 2], [cx - w / 2, topY, cz - d / 2],
    [cx - iw / 2, topY + lowerH, cz - id / 2], [cx + iw / 2, topY + lowerH, cz - id / 2],
  );
  addQuad(group, mat,
    [cx - w / 2, topY, cz - d / 2], [cx - w / 2, topY, cz + d / 2],
    [cx - iw / 2, topY + lowerH, cz + id / 2], [cx - iw / 2, topY + lowerH, cz - id / 2],
  );
  addQuad(group, mat,
    [cx + w / 2, topY, cz + d / 2], [cx + w / 2, topY, cz - d / 2],
    [cx + iw / 2, topY + lowerH, cz - id / 2], [cx + iw / 2, topY + lowerH, cz + id / 2],
  );

  // Flat top slab
  const topGeo = new THREE.BoxGeometry(iw, upperH, id);
  const top = new THREE.Mesh(topGeo, mat);
  top.position.set(cx, topY + lowerH + upperH / 2, cz);
  group.add(top);

  return group;
}

function buildRoofLayer(mats, roofType = 0) {
  const matKey = (MATERIAL_KEY_MAP[6] || [])[roofType] || "roof_asphalt";
  const mat = mats[matKey] || mats.roof_asphalt;

  const overhangMap = [1.5, 1.5, 1.5, 0.4];
  const overhang = ftToUnits(overhangMap[roofType] ?? 1.5);
  const footprints = getRoofFootprints(overhang);

  const builders = [
    buildGableRoof,   // 0  Gable — Asphalt
    buildGableRoof,   // 1  Gable — Metal
    buildHipRoof,     // 2  Hip — Asphalt
    buildFlatRoof,    // 3  Flat — TPO
  ];
  const fn = builders[roofType] || buildGableRoof;

  // Build a roof section for each footprint (top story + exposed lower stories)
  const group = new THREE.Group();
  group.name = "layer_roof";
  footprints.forEach((fp) => {
    const section = fn(mat, { roofFootprint: fp });
    group.add(section);
  });
  return group;
}

function buildColorPaletteLayer() {
  const group = new THREE.Group();
  group.name = "layer_color_palette";
  return group;
}

// ── Update module-level dims from project floor plan ──
export function updateDims(fpW, fpD) {
  W = ftToUnits(fpW || 44);
  D = ftToUnits(fpD || 50);
  SH = ftToUnits(9); // per-story height; stories stack via yBase in ROOMS
  WALL_H = SH - 0.08;
}

export function rebuildLayerGroups(scene, mats, foundationType = 0, roofType = 0) {
  const builders = [
    (m) => buildFoundationLayer(m, foundationType),
    buildFrameLayer,
    buildSheathingLayer,
    buildInsulationLayer,
    buildDrywallLayer,
    buildCladdingLayer,
    (m) => buildRoofLayer(m, roofType),
    buildColorPaletteLayer,
  ];
  return builders.map((fn) => {
    const g = fn(mats);
    scene.add(g);
    return g;
  });
}

// ── Build Scene ──
export function buildScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0a0e17, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0e17, 0.015);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(18, 18, 28);
  camera.lookAt(0, 4, 0);

  return { renderer, scene, camera };
}

// ── Lighting ──
export function setupLighting(scene) {
  const group = new THREE.Group();
  group.name = "lighting";

  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  group.add(ambient);

  const hemi = new THREE.HemisphereLight(0x4a6a9a, 0x1a1a2e, 0.35);
  group.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(12, 18, 8);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  key.shadow.camera.left = -20;
  key.shadow.camera.right = 20;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.bias = -0.001;
  key.shadow.normalBias = 0.02;
  group.add(key);
  group.add(key.target);

  const fill = new THREE.DirectionalLight(0x8ab4ff, 0.3);
  fill.position.set(-8, 6, -4);
  group.add(fill);

  const rim = new THREE.DirectionalLight(0x00d4ff, 0.25);
  rim.position.set(-6, 8, -12);
  group.add(rim);

  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(100, 100);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0d1220, roughness: 0.95, metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  group.add(ground);

  // Grid
  const grid = new THREE.GridHelper(40, 40, 0x1a2540, 0x111a30);
  grid.position.y = 0.005;
  group.add(grid);

  scene.add(group);
  return group;
}

// ── Orbit Controls (manual implementation) ──
export function createOrbitControls(camera, domElement) {
  const state = {
    isRotating: false,
    isPanning: false,
    prevMouse: { x: 0, y: 0 },
    spherical: { radius: 0, phi: 0, theta: 0 },
    target: new THREE.Vector3(0, 2, 0),
  };

  // Initialize spherical coords from camera
  const offset = camera.position.clone().sub(state.target);
  state.spherical.radius = offset.length();
  state.spherical.phi = Math.acos(Math.max(-1, Math.min(1, offset.y / state.spherical.radius)));
  state.spherical.theta = Math.atan2(offset.x, offset.z);

  function updateCamera() {
    const { radius, phi, theta } = state.spherical;
    const sinPhi = Math.sin(phi);
    camera.position.set(
      state.target.x + radius * sinPhi * Math.sin(theta),
      state.target.y + radius * Math.cos(phi),
      state.target.z + radius * sinPhi * Math.cos(theta)
    );
    camera.lookAt(state.target);
  }

  const onMouseDown = (e) => {
    if (e.button === 0) {
      state.isRotating = true;
    } else if (e.button === 2) {
      state.isPanning = true;
    }
    state.prevMouse.x = e.clientX;
    state.prevMouse.y = e.clientY;
  };

  const onMouseMove = (e) => {
    const dx = e.clientX - state.prevMouse.x;
    const dy = e.clientY - state.prevMouse.y;
    state.prevMouse.x = e.clientX;
    state.prevMouse.y = e.clientY;

    if (state.isRotating) {
      state.spherical.theta -= dx * 0.005;
      state.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1,
        state.spherical.phi + dy * 0.005));
      updateCamera();
    } else if (state.isPanning) {
      const panSpeed = 0.02;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      camera.getWorldDirection(new THREE.Vector3());
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      state.target.addScaledVector(right, -dx * panSpeed);
      state.target.addScaledVector(up, dy * panSpeed);
      updateCamera();
    }
  };

  const onMouseUp = () => {
    state.isRotating = false;
    state.isPanning = false;
  };

  const onWheel = (e) => {
    e.preventDefault();
    state.spherical.radius *= 1 + e.deltaY * 0.001;
    state.spherical.radius = Math.max(5, Math.min(80, state.spherical.radius));
    updateCamera();
  };

  const onContextMenu = (e) => e.preventDefault();

  domElement.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  domElement.addEventListener("wheel", onWheel, { passive: false });
  domElement.addEventListener("contextmenu", onContextMenu);

  return {
    update: updateCamera,
    dispose: () => {
      domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      domElement.removeEventListener("wheel", onWheel);
      domElement.removeEventListener("contextmenu", onContextMenu);
    },
  };
}

// ═══════════════════════════════════════════════════════════
//  LayerEditor Component
// ═══════════════════════════════════════════════════════════

export default function LayerEditor() {
  const project = useProject();
  const { isHomeowner, isBuilder } = useUserType();
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const layerGroupsRef = useRef([]);
  const matsRef = useRef(null);
  const animFrameRef = useRef(null);
  const controlsRef = useRef(null);
  const clippingPlaneRef = useRef(null);
  const buildUpTimerRef = useRef(null);

  const navigate = useNavigate();
  const [layers, setLayers] = useState(createDefaultLayers);
  const [activeLayer, setActiveLayer] = useState(0);
  const [vizMode, setVizMode] = useState("standard");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // "ok" | "err"
  const foundationTypeRef = useRef(0); // tracks current foundation option (0=slab, 1=pier&beam, 2=crawlspace)
  const roofTypeRef = useRef(0);
  const wallColorRef = useRef("#d0dce8");
  const roofColorRef = useRef("#2a2a2a");
  const [wallColor, setWallColor] = useState("#d0dce8");
  const [roofColor, setRoofColor] = useState("#2a2a2a");
  const [paintTarget, setPaintTarget] = useState("walls");
  const [dragColor, setDragColor] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);

  const sqft = project.totalSF || 2200;
  // Base SF used as reference for material cost calibration
  const BASE_SF = 2200;

  const totalCost = useMemo(
    () => Math.round(layers.reduce((s, l) => s + l.cost, 0) * (sqft / BASE_SF)),
    [layers, sqft]
  );
  const costPerSF = useMemo(() => Math.round(totalCost / sqft), [totalCost, sqft]);
  const maxLayerCost = useMemo(() => Math.max(...layers.map((l) => l.cost)), [layers]);

  // ── ML Intelligence ──
  const [mlData, setMlData] = useState(null);
  const [mlLoading, setMlLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setMlLoading(true);
      try {
        const features = {
          square_footage: sqft,
          bedrooms: project.generateParams?.beds || 3,
          bathrooms: project.generateParams?.baths || 2,
          latitude: project.generateParams?.lat || 32.7767,
          longitude: project.generateParams?.lng || -96.7970,
          quality_score: 5.0,
        };
        const res = await costApi.predict(features);
        if (!cancelled) setMlData(res);
      } catch {
        // ML panel gracefully hidden on error
      } finally {
        if (!cancelled) setMlLoading(false);
      }
    }, 400); // debounce
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sqft, project.generateParams]);

  // Inject spin animation for ML loading spinner
  useEffect(() => {
    if (document.getElementById("ml-spin-keyframes")) return;
    const style = document.createElement("style");
    style.id = "ml-spin-keyframes";
    style.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(style);
  }, []);

  // ── Three.js Init ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { renderer, scene, camera } = buildScene(canvas);
    const mats = createLayerMaterials();
    matsRef.current = mats;

    setupLighting(scene);

    // Set 3D dims and room shapes from the active floor plan
    updateDims(project.footprintWidth, project.footprintDepth);
    updateRooms(project.floorPlan?.rooms, project.storyPlans);

    // Build layer groups
    const layerGroups = rebuildLayerGroups(scene, mats, 0, 0);
    layerGroupsRef.current = layerGroups;

    // Clipping plane for section mode
    const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 20);
    clippingPlaneRef.current = clipPlane;

    // Orbit controls
    const controls = createOrbitControls(camera, canvas);
    controlsRef.current = controls;

    sceneRef.current = { renderer, scene, camera };

    // Resize handler
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    // Render loop
    let time = 0;
    const animate = () => {
      time += 0.016;
      renderer.render(scene, camera);
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animFrameRef.current);
      controls.dispose();
      renderer.dispose();
      // Dispose geometries & materials
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    };
  }, []);

  // ── Rebuild 3D model when floor plan dimensions change ──
  const dimInitRef = useRef(false);
  useEffect(() => {
    if (!dimInitRef.current) {
      dimInitRef.current = true;
      return; // initial build handled by mount effect
    }
    const sceneData = sceneRef.current;
    const mats = matsRef.current;
    if (!sceneData || !mats) return;

    updateDims(project.footprintWidth, project.footprintDepth);
    updateRooms(project.floorPlan?.rooms, project.storyPlans);

    // Dispose and remove old layer groups
    layerGroupsRef.current.forEach((g) => {
      sceneData.scene.remove(g);
      g.traverse((child) => { if (child.geometry) child.geometry.dispose(); });
    });

    // Rebuild with new dims
    const newGroups = rebuildLayerGroups(sceneData.scene, mats, foundationTypeRef.current, roofTypeRef.current);
    layerGroupsRef.current = newGroups;
    layers.forEach((l, i) => { if (newGroups[i]) newGroups[i].visible = l.visible; });
  }, [project.footprintWidth, project.footprintDepth, project.floorPlan, project.storyPlans]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync layer visibility ──
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups.length) return;
    layers.forEach((l, i) => {
      if (groups[i]) groups[i].visible = l.visible;
    });
  }, [layers]);

  // ── Sync material changes ──
  const updateLayerMaterial = useCallback((layerIdx, matIdx) => {
    if (layerIdx === 7) return; // Color palette is UI-only — no material to swap
    const groups = layerGroupsRef.current;
    const mats = matsRef.current;
    if (!groups[layerIdx] || !mats) return;

    const matKey = MATERIAL_KEY_MAP[layerIdx]?.[matIdx];
    if (!matKey || !mats[matKey]) return;

    const mat = mats[matKey];
    groups[layerIdx].traverse((child) => {
      if (child.isMesh) {
        child.material = mat;
      }
    });
  }, []);

  // ── Visualization Mode Effects ──
  useEffect(() => {
    const groups = layerGroupsRef.current;
    const mats = matsRef.current;
    const sceneData = sceneRef.current;
    if (!groups.length || !mats || !sceneData) return;

    // Clear any active build-up timer
    if (buildUpTimerRef.current) {
      clearInterval(buildUpTimerRef.current);
      buildUpTimerRef.current = null;
    }

    // Reset clipping
    sceneData.renderer.clippingPlanes = [];
    sceneData.renderer.localClippingEnabled = false;

    // Reset all layers
    groups.forEach((g, i) => {
      g.visible = layers[i].visible;
      g.position.y = 0;
      g.traverse((child) => {
        if (child.isMesh) {
          child.material.transparent = false;
          child.material.opacity = 1;
          child.material.wireframe = false;
          child.material.clippingPlanes = [];
          child.material.needsUpdate = true;
        }
      });
    });

    // Restore correct materials after reset
    layers.forEach((l, i) => {
      updateLayerMaterial(i, l.materialIndex);
    });

    switch (vizMode) {
      case "ghost": {
        groups.forEach((g, i) => {
          g.visible = true; // show all for ghost
          g.traverse((child) => {
            if (child.isMesh) {
              if (i === activeLayer) {
                child.material.transparent = false;
                child.material.opacity = 1;
                child.material.wireframe = false;
              } else {
                child.material.transparent = true;
                child.material.opacity = 0.1;
                child.material.wireframe = true;
              }
              child.material.needsUpdate = true;
            }
          });
        });
        break;
      }

      case "section": {
        const clipPlane = clippingPlaneRef.current;
        if (clipPlane) {
          sceneData.renderer.localClippingEnabled = true;
          let clipX = -W;
          const clipAnimate = () => {
            clipX += 0.03;
            if (clipX > W) clipX = -W;
            clipPlane.constant = clipX;
          };
          // Apply clipping to all layer meshes
          groups.forEach((g) => {
            g.traverse((child) => {
              if (child.isMesh) {
                child.material.clippingPlanes = [clipPlane];
                child.material.clipShadows = true;
                child.material.needsUpdate = true;
              }
            });
          });
          // Animate clip plane in render loop
          const origAnimate = animFrameRef.current;
          const sectionLoop = () => {
            clipAnimate();
            animFrameRef.current = requestAnimationFrame(sectionLoop);
            sceneData.renderer.render(sceneData.scene, sceneData.camera);
          };
          cancelAnimationFrame(animFrameRef.current);
          sectionLoop();
        }
        break;
      }

      case "buildup": {
        // Hide all, then reveal bottom-to-top over 5 seconds
        groups.forEach((g) => { g.visible = false; });
        let currentLayer = 0;
        const interval = 5000 / MATERIALS_DATA.length;
        buildUpTimerRef.current = setInterval(() => {
          if (currentLayer < MATERIALS_DATA.length && groups[currentLayer]) {
            groups[currentLayer].visible = true;
          }
          currentLayer++;
          if (currentLayer >= MATERIALS_DATA.length) {
            clearInterval(buildUpTimerRef.current);
            buildUpTimerRef.current = null;
          }
        }, interval);
        break;
      }

      default: // "standard"
        break;
    }

    return () => {
      if (buildUpTimerRef.current) {
        clearInterval(buildUpTimerRef.current);
        buildUpTimerRef.current = null;
      }
    };
  }, [vizMode, activeLayer, layers, maxLayerCost, updateLayerMaterial]);

  // ── Save to MongoDB ──
  const handleSave = useCallback(async () => {
    setSaving(true); setSaveStatus(null);
    try {
      const payload = {
        name: project.projectName || "New Project",
        materials: layers.map((l) => ({ name: l.name, material: l.material, cost: l.cost, materialIndex: l.materialIndex })),
        location: project.projectLocation || null,
      };
      let saved;
      if (project.projectId) {
        saved = await projectsApi.update(project.projectId, payload);
      } else {
        saved = await projectsApi.create(payload);
      }
      if (saved?.id) project.setProjectId(saved.id);
      project.setMaterials(layers.map((l) => ({ name: l.name, material: l.material, cost: l.cost })));

      // Sync building context from material selections
      const foundationMap = { "Slab": "slab_on_grade", "Pier & Beam": "pier", "Crawlspace": "crawlspace" };
      const foundationName = layers[0]?.material || "Slab";
      const framingName = layers[1]?.material || "Wood SPF";
      project.setBuildingContext({
        foundation_type: foundationMap[foundationName] || "slab_on_grade",
        framing_material: framingName,
      });

      setSaveStatus("ok");
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (_) {
      setSaveStatus("err");
      setTimeout(() => setSaveStatus(null), 2500);
    } finally {
      setSaving(false);
    }
  }, [layers, project]);

  // ── Color paint callbacks ──
  const applyWallColor = useCallback((hex) => {
    wallColorRef.current = hex;
    setWallColor(hex);
    const groups = layerGroupsRef.current;
    if (!groups[5]) return; // cladding layer is index 5
    const color = new THREE.Color(hex);
    groups[5].traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.color = color;
        child.material.needsUpdate = true;
      }
    });
  }, []);

  const applyRoofColor = useCallback((hex) => {
    roofColorRef.current = hex;
    setRoofColor(hex);
    const groups = layerGroupsRef.current;
    if (!groups[6]) return; // roof layer is index 6
    const color = new THREE.Color(hex);
    groups[6].traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.color = color;
        child.material.needsUpdate = true;
      }
    });
  }, []);

  // ── Handlers ──
  const handleToggleLayer = useCallback((idx) => {
    setLayers((prev) => prev.map((l, i) =>
      i === idx ? { ...l, visible: !l.visible } : l
    ));
  }, []);

  const handleSelectLayer = useCallback((idx) => {
    setActiveLayer(idx);
  }, []);

  const handleMaterialChange = useCallback((layerIdx, optionIdx) => {
    const opt = MATERIALS_DATA[layerIdx].options[optionIdx];
    setLayers((prev) => prev.map((l, i) =>
      i === layerIdx
        ? { ...l, materialIndex: optionIdx, material: opt.name, cost: opt.cost }
        : l
    ));

    if (layerIdx === 7) return; // Color palette — no geometry to update

    if (layerIdx === 0) {
      // Foundation type changed — rebuild geometry
      foundationTypeRef.current = optionIdx;
      const sceneData = sceneRef.current;
      const mats = matsRef.current;
      if (!sceneData || !mats) return;
      const oldGroup = layerGroupsRef.current[0];
      const wasVisible = oldGroup?.visible ?? true;
      if (oldGroup) {
        sceneData.scene.remove(oldGroup);
        oldGroup.traverse((child) => { if (child.geometry) child.geometry.dispose(); });
      }
      const newGroup = buildFoundationLayer(mats, optionIdx);
      newGroup.visible = wasVisible;
      sceneData.scene.add(newGroup);
      layerGroupsRef.current = [newGroup, ...layerGroupsRef.current.slice(1)];
    } else if (layerIdx === 6) {
      // Roof style changed — rebuild roof geometry
      roofTypeRef.current = optionIdx;
      const sceneData = sceneRef.current;
      const mats = matsRef.current;
      if (!sceneData || !mats) return;
      const oldGroup = layerGroupsRef.current[6];
      const wasVisible = oldGroup?.visible ?? true;
      if (oldGroup) {
        sceneData.scene.remove(oldGroup);
        oldGroup.traverse((child) => { if (child.geometry) child.geometry.dispose(); });
      }
      const newGroup = buildRoofLayer(mats, optionIdx);
      newGroup.visible = wasVisible;
      // Re-apply current roof color
      if (roofColorRef.current !== "#2a2a2a") {
        const c = new THREE.Color(roofColorRef.current);
        newGroup.traverse((child) => {
          if (child.isMesh) { child.material = child.material.clone(); child.material.color = c; }
        });
      }
      sceneData.scene.add(newGroup);
      layerGroupsRef.current = [
        ...layerGroupsRef.current.slice(0, 6),
        newGroup,
        ...layerGroupsRef.current.slice(7),
      ];
    } else {
      updateLayerMaterial(layerIdx, optionIdx);
    }
  }, [updateLayerMaterial]);

  // ── Styles ──
  const layerData = MATERIALS_DATA[activeLayer];
  const currentMaterialIndex = layers[activeLayer].materialIndex;
  const currentCost = layers[activeLayer].cost;

  // Workflow stages for breadcrumb
  const STAGES = [
    { key: "develop", label: "Plan", route: "/develop" },
    { key: "edit",    label: "3D Edit", route: "/edit" },
    { key: "feasibility", label: "Feasibility", route: "/feasibility" },
    { key: "structural", label: "Structural", route: "/structural" },
    { key: "schedule",   label: "Schedule", route: "/schedule" },
  ];
  const currentStageIdx = 1; // 3D Edit

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      width: "100%", height: "100vh",
      background: colors.bg, fontFamily: fonts.label, color: colors.text, overflow: "hidden",
    }}>

      {/* ── Main content row ── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* ── Left: 3D Viewport ── */}
        <div style={{ flex: "0 0 65%", position: "relative", background: "#080c14", minHeight: 0 }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

          {/* Project name overlay — top left */}
          <div style={{
            position: "absolute", top: 16, left: 16,
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(8,12,20,0.75)", backdropFilter: "blur(10px)",
            border: "1px solid #1a2236", borderRadius: 8, padding: "6px 12px",
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: colors.accent, boxShadow: `0 0 6px ${colors.accent}`,
            }} />
            <span style={{ fontSize: 12, fontFamily: fonts.data, color: colors.textBright, fontWeight: 600 }}>
              {project.projectName || "New Project"}
            </span>
            <span style={{
              fontSize: 10, fontFamily: fonts.data, color: colors.textDim,
              background: "#1a2236", padding: "2px 6px", borderRadius: 4,
            }}>
              {project.stories || 1}F
            </span>
          </div>

          {/* Viz mode bar — bottom center */}
          <div style={{
            position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
            display: "flex", gap: 2,
            background: "rgba(8,12,20,0.92)", backdropFilter: "blur(16px)",
            border: "1px solid #1a2236", borderRadius: 10,
            padding: "4px 5px", zIndex: 10,
          }}>
            {VIZ_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setVizMode(m.key)}
                style={{
                  padding: "5px 13px",
                  fontSize: 11, fontFamily: fonts.data, fontWeight: 600,
                  letterSpacing: "0.04em", textTransform: "uppercase",
                  border: "none", borderRadius: 7, cursor: "pointer",
                  transition: "all 0.15s ease",
                  background: vizMode === m.key ? colors.accent : "transparent",
                  color: vizMode === m.key ? "#080c14" : colors.textDim,
                  boxShadow: vizMode === m.key ? `0 0 12px ${colors.accent}55` : "none",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Total cost badge — bottom right of viewport */}
          <div style={{
            position: "absolute", bottom: 16, right: 16,
            background: "rgba(8,12,20,0.85)", backdropFilter: "blur(10px)",
            border: "1px solid #1a2236", borderRadius: 8, padding: "8px 14px",
            textAlign: "right",
          }}>
            <div style={{ fontSize: 11, fontFamily: fonts.data, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>Est. Cost</div>
            <div style={{ fontSize: 20, fontFamily: fonts.data, fontWeight: 800, color: colors.accent, lineHeight: 1.2 }}>
              ${totalCost.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, fontFamily: fonts.data, color: colors.textDim }}>
              ${costPerSF}/SF · {sqft.toLocaleString()} SF
            </div>
            {mlData && mlData.feasibility && (
              <div style={{
                marginTop: 4, paddingTop: 4, borderTop: "1px solid #1a2236",
                fontSize: 10, fontFamily: fonts.data,
                color: mlData.feasibility.viable ? colors.success : colors.danger,
              }}>
                MV ${Math.round(mlData.feasibility.market_value_estimate).toLocaleString()} · {mlData.feasibility.margin_pct > 0 ? "+" : ""}{mlData.feasibility.margin_pct}%
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Control Panel ── */}
        <div style={{
          flex: "0 0 35%",
          display: "flex", flexDirection: "column",
          background: colors.panel,
          borderLeft: "1px solid #1a2236",
          minHeight: 0, overflow: "hidden",
        }}>

          {/* Panel header */}
          <div style={{
            flexShrink: 0,
            padding: "14px 20px",
            borderBottom: "1px solid #1a2236",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <img src="/VisionLogo.png" alt="Vision" style={{ height: 20, width: "auto", objectFit: "contain", display: "block" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.textBright, flex: 1 }}>LAYER EDITOR</span>
            <span style={{
              fontSize: 10, fontFamily: fonts.data, color: colors.accent,
              background: `${colors.accent}15`, border: `1px solid ${colors.accent}30`,
              padding: "2px 8px", borderRadius: 10, letterSpacing: "0.06em",
            }}>8 LAYERS</span>
          </div>

          {/* Scrollable section */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>

            {/* Layer Controls - Only visible for builders */}
            {isBuilder && (
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #1a2236" }}>
                <div style={{
                  fontSize: 10, fontFamily: fonts.data, fontWeight: 700,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  color: colors.textDim, marginBottom: 10,
                }}>Layer Controls</div>

                {[...MATERIALS_DATA].reverse().map((ld, ri) => {
                  const i = MATERIALS_DATA.length - 1 - ri;
                  const layer = layers[i];
                  const isActive = activeLayer === i;
                  return (
                    <div
                      key={i}
                      onClick={() => handleSelectLayer(i)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                        marginBottom: 2,
                        transition: "all 0.15s ease",
                        background: isActive ? `${colors.accent}10` : "transparent",
                        border: isActive ? `1px solid ${colors.accent}30` : "1px solid transparent",
                      }}
                    >
                      {/* Visibility toggle */}
                      <div
                        onClick={(e) => { e.stopPropagation(); handleToggleLayer(i); }}
                        style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          border: `2px solid ${layer.visible ? ld.color : "#2a3548"}`,
                          background: layer.visible ? ld.color : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", transition: "all 0.15s ease",
                        }}
                      >
                        {layer.visible && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="#080c14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      {/* Layer number */}
                      <span style={{ fontSize: 10, fontFamily: fonts.data, color: colors.textDim, width: 14, flexShrink: 0 }}>{i + 1}</span>
                      {/* Layer name */}
                      <span style={{ flex: 1, fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? colors.textBright : colors.text }}>
                        {ld.name}
                      </span>
                      {/* Selected material chip */}
                      <span style={{
                        fontSize: 10, fontFamily: fonts.data,
                        color: isActive ? colors.accent : colors.textDim,
                        background: isActive ? `${colors.accent}10` : "transparent",
                        padding: "1px 6px", borderRadius: 4,
                        whiteSpace: "nowrap",
                      }}>{layer.material}</span>
                      {/* Color dot */}
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: ld.color, flexShrink: 0 }} />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Material Picker - Only visible for builders */}
            {isBuilder ? (
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #1a2236" }}>
              <div style={{
                fontSize: 10, fontFamily: fonts.data, fontWeight: 700,
                letterSpacing: "0.12em", textTransform: "uppercase",
                color: colors.textDim, marginBottom: 4,
              }}>Material Picker</div>
              <div style={{
                fontSize: 13, fontFamily: fonts.data, fontWeight: 600,
                color: colors.accent, marginBottom: 10,
              }}>Layer {activeLayer + 1}: {layerData.name}</div>

              {activeLayer === 7 ? (
                /* ── Color Palette (Layer 9) ── */
                <div>
                  {/* Drop targets */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    {[
                      { key: "walls", label: "Walls", color: wallColor, fn: applyWallColor },
                      { key: "roof",  label: "Roof",  color: roofColor, fn: applyRoofColor },
                    ].map(({ key, label, color, fn }) => (
                      <div
                        key={key}
                        onDragOver={(e) => { e.preventDefault(); setDragTarget(key); }}
                        onDragLeave={() => setDragTarget(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          const hex = e.dataTransfer.getData("text/plain");
                          if (hex) fn(hex);
                          setDragTarget(null);
                          setDragColor(null);
                        }}
                        onClick={() => setPaintTarget(key)}
                        style={{
                          flex: 1, borderRadius: 8, padding: "10px 8px",
                          cursor: "pointer", textAlign: "center",
                          border: `2px solid ${(dragTarget === key || paintTarget === key) ? colors.accent : "#2a3548"}`,
                          background: dragTarget === key ? `${colors.accent}15` : "rgba(26,34,54,0.6)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: "50%",
                          background: color,
                          border: "2px solid #2a3548",
                          margin: "0 auto 6px",
                        }} />
                        <div style={{ fontSize: 11, fontFamily: fonts.data, color: colors.textDim }}>{label}</div>
                        <div style={{ fontSize: 10, fontFamily: fonts.data, color: colors.textDim, marginTop: 2 }}>{color}</div>
                      </div>
                    ))}
                  </div>

                  {/* Swatch grid */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 12,
                  }}>
                    {PAINT_COLORS.map((sw) => (
                      <div
                        key={sw.hex}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", sw.hex);
                          setDragColor(sw.hex);
                        }}
                        onDragEnd={() => setDragColor(null)}
                        onClick={() => {
                          if (paintTarget === "walls") applyWallColor(sw.hex);
                          else applyRoofColor(sw.hex);
                        }}
                        title={sw.name}
                        style={{
                          height: 32, borderRadius: 6,
                          background: sw.hex,
                          cursor: "grab",
                          border: dragColor === sw.hex ? `2px solid ${colors.accent}` : "2px solid transparent",
                          transition: "transform 0.1s ease, border-color 0.1s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                      />
                    ))}
                  </div>

                  {/* Custom hex input */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="color"
                      value={paintTarget === "walls" ? wallColor : roofColor}
                      onChange={(e) => {
                        if (paintTarget === "walls") applyWallColor(e.target.value);
                        else applyRoofColor(e.target.value);
                      }}
                      style={{ width: 32, height: 28, border: "none", padding: 0, cursor: "pointer", background: "none" }}
                    />
                    <input
                      type="text"
                      value={paintTarget === "walls" ? wallColor : roofColor}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
                          if (paintTarget === "walls") applyWallColor(v);
                          else applyRoofColor(v);
                        }
                      }}
                      placeholder="#RRGGBB"
                      style={{
                        flex: 1, padding: "5px 10px", borderRadius: 6,
                        background: "rgba(26,34,54,0.8)", border: "1px solid #2a3548",
                        color: colors.text, fontFamily: fonts.data, fontSize: 12,
                        outline: "none",
                      }}
                    />
                    <div style={{
                      fontSize: 10, fontFamily: fonts.data, color: colors.textDim,
                      background: `${colors.accent}10`, border: `1px solid ${colors.accent}20`,
                      padding: "4px 8px", borderRadius: 6,
                    }}>
                      {paintTarget === "walls" ? "WALLS" : "ROOF"}
                    </div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 10, fontFamily: fonts.data, color: colors.textDim }}>
                    Drag swatches onto drop targets, or click a swatch to paint the active surface.
                  </div>
                </div>
              ) : (
                layerData.options.map((opt, oi) => {
                  const isSelected = oi === currentMaterialIndex;
                  const delta = opt.cost - currentCost;
                  return (
                    <div
                      key={oi}
                      onClick={() => handleMaterialChange(activeLayer, oi)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 12px", borderRadius: 7,
                        cursor: "pointer", marginBottom: 4,
                        transition: "all 0.15s ease",
                        background: isSelected ? `${colors.accent}12` : "rgba(26,34,54,0.4)",
                        border: isSelected ? `1px solid ${colors.accent}40` : "1px solid #1a2236",
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                        border: `2px solid ${isSelected ? colors.accent : "#2a3548"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {isSelected && <div style={{ width: 7, height: 7, borderRadius: "50%", background: colors.accent }} />}
                      </div>
                      <span style={{ flex: 1, fontSize: 13, color: isSelected ? colors.textBright : colors.text }}>{opt.name}</span>
                      <span style={{ fontSize: 11, fontFamily: fonts.data, color: colors.textDim }}>
                        ${(opt.cost / 1000).toFixed(0)}K
                      </span>
                      {delta !== 0 && (
                        <span style={{
                          fontSize: 10, fontFamily: fonts.data, fontWeight: 600,
                          color: delta > 0 ? colors.warn : colors.success,
                          background: delta > 0 ? colors.warnDim : colors.successDim,
                          padding: "2px 6px", borderRadius: 6,
                        }}>
                          {delta > 0 ? "+" : ""}{fmtCost(Math.abs(delta))}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            ) : (
              /* Homeowner View - Simplified info panel */
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #1a2236" }}>
                <div style={{
                  fontSize: 10, fontFamily: fonts.data, fontWeight: 700,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  color: colors.textDim, marginBottom: 12,
                }}>Your Home Preview</div>
                <div style={{
                  padding: "16px",
                  background: "rgba(59, 130, 246, 0.08)",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                  borderRadius: 8,
                  marginBottom: 12,
                }}>
                  <div style={{ fontSize: 13, color: colors.textBright, fontWeight: 500, marginBottom: 8 }}>
                    Explore Your Vision
                  </div>
                  <div style={{ fontSize: 12, color: colors.text, lineHeight: 1.5 }}>
                    Use the visualization modes below to explore your home design.
                    Rotate the view by dragging, and zoom with your scroll wheel.
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(46, 213, 115, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 2L2 6v6l6 4 6-4V6L8 2z" stroke="#2ed573" strokeWidth="1.5" fill="none"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: colors.textBright, fontWeight: 500 }}>Standard View</div>
                      <div style={{ fontSize: 11, color: colors.textDim }}>Full house exterior</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(0, 212, 255, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M2 8h12M8 2v12" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: colors.textBright, fontWeight: 500 }}>Section View</div>
                      <div style={{ fontSize: 11, color: colors.textDim }}>See inside your home</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(255, 159, 67, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M4 12V4l4 4 4-4v8" stroke="#ff9f43" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: colors.textBright, fontWeight: 500 }}>Build-Up View</div>
                      <div style={{ fontSize: 11, color: colors.textDim }}>Watch it come together</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Cost Breakdown */}
            <div style={{ padding: "14px 20px" }}>
              <div style={{
                fontSize: 10, fontFamily: fonts.data, fontWeight: 700,
                letterSpacing: "0.12em", textTransform: "uppercase",
                color: colors.textDim, marginBottom: 12,
              }}>Cost Breakdown</div>

              {layers.map((l, i) => {
                const pct = maxLayerCost > 0 ? (l.cost / maxLayerCost) * 100 : 0;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: MATERIALS_DATA[i].color, flexShrink: 0 }} />
                    <span style={{ width: 82, fontSize: 11, fontFamily: fonts.data, color: colors.textDim, flexShrink: 0 }}>{l.name}</span>
                    <div style={{ flex: 1, height: 5, background: "#141b2d", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{
                        width: `${pct}%`, height: "100%",
                        background: MATERIALS_DATA[i].color, borderRadius: 3,
                        transition: "width 0.3s ease",
                      }} />
                    </div>
                    <span style={{ width: 48, textAlign: "right", fontSize: 12, fontFamily: fonts.data, fontWeight: 600, color: colors.text }}>
                      {fmtCost(l.cost)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── ML Intelligence Panel ── */}
          {mlData && !mlLoading && (
            <div style={{ padding: "14px 20px", borderTop: "1px solid #1a2236" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
              }}>
                <div style={{
                  fontSize: 10, fontFamily: fonts.data, fontWeight: 700,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  color: colors.accent, flex: 1,
                }}>ML Market Intelligence</div>
                {mlData.cluster && (
                  <span style={{
                    fontSize: 9, fontFamily: fonts.data, fontWeight: 700,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    padding: "2px 8px", borderRadius: 10,
                    background: mlData.cluster.tier === "premium" ? `${colors.success}20`
                      : mlData.cluster.tier === "above_average" ? `${colors.accent}15`
                      : mlData.cluster.tier === "value" ? `${colors.warn}20`
                      : "rgba(26,34,54,0.6)",
                    color: mlData.cluster.tier === "premium" ? colors.success
                      : mlData.cluster.tier === "above_average" ? colors.accent
                      : mlData.cluster.tier === "value" ? colors.warn
                      : colors.textDim,
                    border: `1px solid ${
                      mlData.cluster.tier === "premium" ? `${colors.success}40`
                      : mlData.cluster.tier === "above_average" ? `${colors.accent}30`
                      : mlData.cluster.tier === "value" ? `${colors.warn}40`
                      : "#2a3548"
                    }`,
                  }}>
                    {mlData.cluster.tier.replace(/_/g, " ")}
                  </span>
                )}
              </div>

              {/* Market Value vs Construction Cost */}
              {mlData.feasibility && (() => {
                const f = mlData.feasibility;
                const marginColor = f.margin_pct > 20 ? colors.success
                  : f.margin_pct > 10 ? colors.warn
                  : colors.danger;
                return (
                  <div style={{
                    background: "rgba(26,34,54,0.4)", border: "1px solid #1a2236",
                    borderRadius: 8, padding: "10px 12px", marginBottom: 10,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 9, fontFamily: fonts.data, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>Market Value</div>
                        <div style={{ fontSize: 16, fontFamily: fonts.data, fontWeight: 700, color: colors.textBright }}>
                          ${Math.round(f.market_value_estimate).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 9, fontFamily: fonts.data, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>ML Cost/SF</div>
                        <div style={{ fontSize: 16, fontFamily: fonts.data, fontWeight: 700, color: colors.accent }}>
                          ${mlData.cost_per_sf}
                        </div>
                      </div>
                    </div>
                    {/* Margin bar */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: "#141b2d", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                          width: `${Math.min(Math.max(f.margin_pct, 0), 50) * 2}%`,
                          height: "100%", background: marginColor, borderRadius: 2,
                          transition: "width 0.3s ease",
                        }} />
                      </div>
                      <span style={{ fontSize: 11, fontFamily: fonts.data, fontWeight: 700, color: marginColor }}>
                        {f.margin_pct > 0 ? "+" : ""}{f.margin_pct}%
                      </span>
                    </div>
                    <div style={{ fontSize: 9, fontFamily: fonts.data, color: colors.textDim, marginTop: 4 }}>
                      {f.viable ? "✓ Feasible" : "✗ Below 15% threshold"} · CI: ${mlData.confidence_interval_95.low}–${mlData.confidence_interval_95.high}/SF
                    </div>
                  </div>
                );
              })()}

              {/* Per-layer: Selected vs ML Suggested */}
              {mlData.construction_cost_breakdown && (
                <div>
                  <div style={{
                    fontSize: 9, fontFamily: fonts.data, color: colors.textDim,
                    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
                  }}>Selected vs ML Estimate</div>
                  {layers.slice(0, 7).map((l, i) => {
                    const layerKey = ["foundation", "framing", "sheathing", "insulation", "drywall", "cladding", "roof"][i];
                    const mlLayer = mlData.construction_cost_breakdown[layerKey];
                    if (!mlLayer) return null;
                    const diff = l.cost - mlLayer.estimated_cost;
                    const diffPct = mlLayer.estimated_cost > 0 ? (diff / mlLayer.estimated_cost) * 100 : 0;
                    const diffColor = Math.abs(diffPct) < 15 ? colors.success
                      : Math.abs(diffPct) < 30 ? colors.warn : colors.danger;
                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 6, marginBottom: 5,
                        fontSize: 11, fontFamily: fonts.data,
                      }}>
                        <span style={{ width: 62, color: colors.textDim, flexShrink: 0 }}>{l.name}</span>
                        <span style={{ width: 44, textAlign: "right", color: colors.text, flexShrink: 0 }}>{fmtCost(l.cost)}</span>
                        <span style={{ color: colors.textDim, flexShrink: 0 }}>→</span>
                        <span style={{ width: 44, textAlign: "right", color: colors.accent, flexShrink: 0 }}>{fmtCost(mlLayer.estimated_cost)}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: diffColor, flexShrink: 0 }}>
                          {diff > 0 ? "+" : ""}{Math.round(diffPct)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {mlLoading && (
            <div style={{
              padding: "14px 20px", borderTop: "1px solid #1a2236",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: "50%",
                border: `2px solid ${colors.accent}30`,
                borderTopColor: colors.accent,
                animation: "spin 0.8s linear infinite",
              }} />
              <span style={{ fontSize: 11, fontFamily: fonts.data, color: colors.textDim }}>Analyzing market data…</span>
            </div>
          )}

          {/* ── Sticky Footer: Total + Actions ── */}
          <div style={{
            flexShrink: 0,
            padding: "14px 20px",
            borderTop: "1px solid #1a2236",
            background: "#080c14",
          }}>
            {/* Total cost row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: fonts.data, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Total Construction</div>
                <div style={{ fontSize: 22, fontFamily: fonts.data, fontWeight: 800, color: colors.accent }}>
                  ${totalCost.toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, fontFamily: fonts.data, color: colors.textDim, letterSpacing: "0.06em" }}>Per SF</div>
                <div style={{ fontSize: 18, fontFamily: fonts.data, fontWeight: 700, color: colors.textBright }}>
                  ${costPerSF}
                </div>
                <div style={{ fontSize: 10, fontFamily: fonts.data, color: colors.textDim }}>{sqft.toLocaleString()} SF</div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1, padding: "9px 0",
                  background: saveStatus === "ok" ? colors.successDim
                    : saveStatus === "err" ? colors.dangerDim
                    : "rgba(26,34,54,0.8)",
                  border: `1px solid ${
                    saveStatus === "ok" ? colors.success
                    : saveStatus === "err" ? colors.danger
                    : "#2a3548"
                  }`,
                  borderRadius: 8,
                  color: saveStatus === "ok" ? colors.success
                    : saveStatus === "err" ? colors.danger
                    : colors.text,
                  fontFamily: fonts.label, fontSize: 12, fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                  transition: "all 0.2s ease",
                }}
              >
                {saving ? "Saving…" : saveStatus === "ok" ? "✓ Saved" : saveStatus === "err" ? "✗ Failed" : "Save"}
              </button>
              <button
                onClick={async () => { await handleSave(); navigate("/schedule"); }}
                style={{
                  flex: 2, padding: "9px 0",
                  background: "linear-gradient(135deg, #00d4ff, #0099cc)",
                  border: "none", borderRadius: 8,
                  color: "#080c14",
                  fontFamily: fonts.label, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", letterSpacing: "0.02em",
                  transition: "opacity 0.15s ease",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
                onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
              >
                Schedule
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6H10M7 3L10 6L7 9" stroke="#080c14" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom: Workflow Stage Bar ── */}
      <div style={{
        flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 0,
        padding: "0 32px",
        height: 46,
        background: "#080c14",
        borderTop: "1px solid #1a2236",
      }}>
        {STAGES.map((stage, idx) => {
          const isActive  = idx === currentStageIdx;
          const isDone    = idx < currentStageIdx;
          const isLocked  = idx > currentStageIdx;
          return (
            <div key={stage.key} style={{ display: "flex", alignItems: "center" }}>
              {idx > 0 && (
                <div style={{
                  width: 28, height: 1,
                  background: isDone ? `${colors.accent}40` : "#1a2236",
                }} />
              )}
              <button
                onClick={() => !isLocked && navigate(stage.route)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 14px", borderRadius: 20,
                  background: isActive ? `${colors.accent}15` : "transparent",
                  border: isActive ? `1px solid ${colors.accent}35` : "1px solid transparent",
                  cursor: isLocked ? "default" : "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {isDone && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L3.8 7.5L8.5 2" stroke={colors.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {isActive && (
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: colors.accent, boxShadow: `0 0 6px ${colors.accent}` }} />
                )}
                <span style={{
                  fontSize: 11, fontFamily: fonts.data, fontWeight: isActive ? 700 : 500,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  color: isActive ? colors.accent : isDone ? `${colors.accent}70` : "#2a3548",
                }}>
                  {stage.label}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
