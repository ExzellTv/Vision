import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as THREE from "three";
import { colors, fonts } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";

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
const MATERIALS_DATA = [
  {
    layerIndex: 0,
    name: "Foundation",
    color: "#6b7a8a",
    options: [
      { name: "Slab", cost: 38000 },
      { name: "Pier & Beam", cost: 45000 },
      { name: "Crawlspace", cost: 42000 },
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
      { name: "Hybrid", cost: 54000 },
    ],
  },
  {
    layerIndex: 2,
    name: "Sheathing",
    color: "#a0845c",
    options: [
      { name: "OSB", cost: 18000 },
      { name: "Plywood CDX", cost: 22000 },
      { name: "ZIP System", cost: 28000 },
    ],
  },
  {
    layerIndex: 3,
    name: "Insulation",
    color: "#e8a0c0",
    options: [
      { name: "Fiberglass", cost: 12000 },
      { name: "Mineral Wool", cost: 16000 },
      { name: "Spray Foam Open", cost: 22000 },
      { name: "Spray Foam Closed", cost: 28000 },
    ],
  },
  {
    layerIndex: 4,
    name: "Drywall",
    color: "#e8e2da",
    options: [
      { name: "Standard", cost: 14000 },
      { name: "Moisture-resistant", cost: 16000 },
      { name: "Fire-rated", cost: 18000 },
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
      { name: "Stucco", cost: 20000 },
    ],
  },
  {
    layerIndex: 6,
    name: "Paint",
    color: "#b8c8d8",
    options: [
      { name: "Budget Latex", cost: 4000 },
      { name: "Mid-grade", cost: 6000 },
      { name: "Premium", cost: 9000 },
    ],
  },
];

const VIZ_MODES = [
  { key: "standard", label: "Standard" },
  { key: "exploded", label: "Exploded" },
  { key: "ghost", label: "Ghost" },
  { key: "section", label: "Section" },
  { key: "heatmap", label: "Heatmap" },
  { key: "buildup", label: "Build-Up" },
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
function createLayerMaterials() {
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
    frame_hybrid: new THREE.MeshStandardMaterial({
      color: 0x9a8a70, roughness: 0.55, metalness: 0.3,
    }),
    sheathing_osb: new THREE.MeshStandardMaterial({
      color: 0xa0845c, roughness: 0.8, metalness: 0.0,
    }),
    sheathing_plywood: new THREE.MeshStandardMaterial({
      color: 0xb89468, roughness: 0.75, metalness: 0.0,
    }),
    sheathing_zip: new THREE.MeshStandardMaterial({
      color: 0x4a8a4a, roughness: 0.7, metalness: 0.0,
    }),
    insulation_fiberglass: new THREE.MeshStandardMaterial({
      color: 0xe8a0c0, roughness: 0.95, metalness: 0.0,
    }),
    insulation_mineral: new THREE.MeshStandardMaterial({
      color: 0xc8b040, roughness: 0.95, metalness: 0.0,
    }),
    insulation_foam_open: new THREE.MeshStandardMaterial({
      color: 0xe8d878, roughness: 0.9, metalness: 0.0,
    }),
    insulation_foam_closed: new THREE.MeshStandardMaterial({
      color: 0xd0c060, roughness: 0.85, metalness: 0.0,
    }),
    drywall: new THREE.MeshStandardMaterial({
      color: 0xe8e2da, roughness: 0.85, metalness: 0.0,
    }),
    drywall_moisture: new THREE.MeshStandardMaterial({
      color: 0xd8e2d8, roughness: 0.85, metalness: 0.0,
    }),
    drywall_fire: new THREE.MeshStandardMaterial({
      color: 0xe0d8d0, roughness: 0.85, metalness: 0.0,
    }),
    cladding_vinyl: new THREE.MeshStandardMaterial({
      color: 0xd0d4d8, roughness: 0.6, metalness: 0.05,
    }),
    cladding_fiber: new THREE.MeshStandardMaterial({
      color: 0x8a9bb0, roughness: 0.75, metalness: 0.05,
    }),
    cladding_brick: new THREE.MeshStandardMaterial({
      color: 0xa04030, roughness: 0.9, metalness: 0.0,
    }),
    cladding_stone: new THREE.MeshStandardMaterial({
      color: 0x908878, roughness: 0.95, metalness: 0.0,
    }),
    cladding_stucco: new THREE.MeshStandardMaterial({
      color: 0xd8d0c0, roughness: 0.92, metalness: 0.0,
    }),
    paint_budget: new THREE.MeshStandardMaterial({
      color: 0xb8c8d8, roughness: 0.8, metalness: 0.0,
    }),
    paint_mid: new THREE.MeshStandardMaterial({
      color: 0xc0d0e0, roughness: 0.75, metalness: 0.0,
    }),
    paint_premium: new THREE.MeshStandardMaterial({
      color: 0xd0dce8, roughness: 0.7, metalness: 0.0,
    }),
  };
}

// Map from layer index + material index to material key
const MATERIAL_KEY_MAP = {
  0: ["foundation", "foundation", "foundation"],
  1: ["frame_wood", "frame_steel", "frame_lvl", "frame_hybrid"],
  2: ["sheathing_osb", "sheathing_plywood", "sheathing_zip"],
  3: ["insulation_fiberglass", "insulation_mineral", "insulation_foam_open", "insulation_foam_closed"],
  4: ["drywall", "drywall_moisture", "drywall_fire"],
  5: ["cladding_vinyl", "cladding_fiber", "cladding_brick", "cladding_stone", "cladding_stucco"],
  6: ["paint_budget", "paint_mid", "paint_premium"],
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

function updateRooms(rooms, storyPlans) {
  const storyH = SLAB_H + WALL_H;

  // Multi-story path: use storyPlans array
  if (storyPlans && storyPlans.length > 1) {
    const allRooms = [];
    storyPlans.forEach((plan, si) => {
      const planRooms = plan.rooms || [];
      const halfW = W / 2;
      const halfD = D / 2;
      const yBase = si * storyH;
      planRooms.forEach((r) => {
        allRooms.push({
          cx: ftToUnits(r.x + r.w / 2) - halfW,
          cz: ftToUnits(r.y + r.h / 2) - halfD,
          w: Math.max(ftToUnits(r.w), 0.1),
          d: Math.max(ftToUnits(r.h), 0.1),
          yBase,
          storyIndex: si,
        });
      });
    });
    ROOMS = allRooms.length > 0 ? allRooms : [{ cx: 0, cz: 0, w: W, d: D, yBase: 0, storyIndex: 0 }];
    return;
  }

  // Single-story path
  if (!rooms || rooms.length === 0) {
    ROOMS = [{ cx: 0, cz: 0, w: W, d: D, yBase: 0, storyIndex: 0 }];
    return;
  }
  const halfW = W / 2;
  const halfD = D / 2;
  const converted = rooms.map((r) => ({
    cx: ftToUnits(r.x + r.w / 2) - halfW,
    cz: ftToUnits(r.y + r.h / 2) - halfD,
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
    const geo = new THREE.BoxGeometry(r.w + 0.05, SLAB_H, r.d + 0.05);
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
    const fGeo = new THREE.BoxGeometry(r.w + 0.06, panelH, sheathThick);
    const f = new THREE.Mesh(fGeo, mats.sheathing_osb);
    f.position.set(r.cx, baseY + 0.06 + panelH / 2, r.cz + r.d / 2 + off);
    f.castShadow = true;
    group.add(f);
    const b = new THREE.Mesh(fGeo, mats.sheathing_osb);
    b.position.set(r.cx, baseY + 0.06 + panelH / 2, r.cz - r.d / 2 - off);
    b.castShadow = true;
    group.add(b);

    const sGeo = new THREE.BoxGeometry(sheathThick, panelH, r.d + 0.06);
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
    const fGeo = new THREE.BoxGeometry(r.w + 0.12, panelH, panelThick);
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

    const sGeo = new THREE.BoxGeometry(panelThick, panelH, r.d + 0.12);
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
    const fGeo = new THREE.BoxGeometry(r.w + 0.14, panelH, panelThick);
    const f = new THREE.Mesh(fGeo, mats.paint_budget);
    f.position.set(r.cx, baseY + 0.03 + panelH / 2, r.cz + r.d / 2 + off);
    group.add(f);
    const b = new THREE.Mesh(fGeo, mats.paint_budget);
    b.position.set(r.cx, baseY + 0.03 + panelH / 2, r.cz - r.d / 2 - off);
    group.add(b);

    const sGeo = new THREE.BoxGeometry(panelThick, panelH, r.d + 0.14);
    const l = new THREE.Mesh(sGeo, mats.paint_budget);
    l.position.set(r.cx - r.w / 2 - off, baseY + 0.03 + panelH / 2, r.cz);
    group.add(l);
    const rr = new THREE.Mesh(sGeo, mats.paint_budget);
    rr.position.set(r.cx + r.w / 2 + off, baseY + 0.03 + panelH / 2, r.cz);
    group.add(rr);
  });
  return group;
}

// ── Update module-level dims from project floor plan ──
function updateDims(fpW, fpD) {
  W = ftToUnits(fpW || 44);
  D = ftToUnits(fpD || 50);
  SH = ftToUnits(9); // per-story height; stories stack via yBase in ROOMS
  WALL_H = SH - 0.08;
}

function rebuildLayerGroups(scene, mats, foundationType = 0) {
  const builders = [
    (m) => buildFoundationLayer(m, foundationType),
    buildFrameLayer,
    buildSheathingLayer,
    buildInsulationLayer,
    buildDrywallLayer,
    buildCladdingLayer,
    buildPaintLayer,
  ];
  return builders.map((fn) => {
    const g = fn(mats);
    scene.add(g);
    return g;
  });
}

// ── Build Scene ──
function buildScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0a0e17, 1);
  renderer.outputEncoding = THREE.sRGBEncoding;
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
function setupLighting(scene) {
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
function createOrbitControls(camera, domElement) {
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
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const layerGroupsRef = useRef([]);
  const matsRef = useRef(null);
  const animFrameRef = useRef(null);
  const controlsRef = useRef(null);
  const clippingPlaneRef = useRef(null);
  const buildUpTimerRef = useRef(null);

  const [layers, setLayers] = useState(createDefaultLayers);
  const [activeLayer, setActiveLayer] = useState(0);
  const [vizMode, setVizMode] = useState("standard");
  const foundationTypeRef = useRef(0); // tracks current foundation option (0=slab, 1=pier&beam, 2=crawlspace)

  const sqft = project.totalSF || 2200;

  const totalCost = useMemo(() => layers.reduce((s, l) => s + l.cost, 0), [layers]);
  const costPerSF = useMemo(() => Math.round(totalCost / sqft), [totalCost, sqft]);
  const maxLayerCost = useMemo(() => Math.max(...layers.map((l) => l.cost)), [layers]);

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
    const layerGroups = rebuildLayerGroups(scene, mats);
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
    const newGroups = rebuildLayerGroups(sceneData.scene, mats, foundationTypeRef.current);
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
      case "exploded": {
        const gap = ftToUnits(2.5);
        groups.forEach((g, i) => {
          g.position.y = i * gap;
        });
        break;
      }

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

      case "heatmap": {
        groups.forEach((g, i) => {
          const t = layers[i].cost / maxLayerCost;
          const hc = heatColor(t);
          g.traverse((child) => {
            if (child.isMesh) {
              child.material = new THREE.MeshStandardMaterial({
                color: hc,
                roughness: 0.5,
                metalness: 0.1,
                emissive: hc,
                emissiveIntensity: 0.15,
              });
            }
          });
        });
        break;
      }

      case "buildup": {
        // Hide all, then reveal bottom-to-top over 5 seconds
        groups.forEach((g) => { g.visible = false; });
        let currentLayer = 0;
        const interval = 5000 / 7;
        buildUpTimerRef.current = setInterval(() => {
          if (currentLayer < 7 && groups[currentLayer]) {
            groups[currentLayer].visible = true;
          }
          currentLayer++;
          if (currentLayer >= 7) {
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
    } else {
      updateLayerMaterial(layerIdx, optionIdx);
    }
  }, [updateLayerMaterial]);

  // ── Styles ──
  const S = {
    root: {
      display: "flex",
      width: "100%",
      height: "100vh",
      background: colors.bg,
      fontFamily: fonts.label,
      color: colors.text,
      overflow: "hidden",
    },
    viewport: {
      flex: "0 0 65%",
      position: "relative",
      background: "#0a0e17",
      minHeight: 0,
    },
    canvas: {
      width: "100%",
      height: "100%",
      display: "block",
    },
    vizBar: {
      position: "absolute",
      bottom: 16,
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      gap: 4,
      background: "rgba(15, 20, 32, 0.85)",
      backdropFilter: "blur(12px)",
      border: `1px solid ${colors.panelBorder}`,
      borderRadius: 8,
      padding: "4px 6px",
      zIndex: 10,
    },
    vizBtn: (active) => ({
      padding: "6px 14px",
      fontSize: 12,
      fontFamily: fonts.data,
      fontWeight: 600,
      letterSpacing: "0.02em",
      border: "none",
      borderRadius: 6,
      cursor: "pointer",
      transition: "all 0.15s ease",
      background: active ? colors.accent : "transparent",
      color: active ? "#0a0e17" : colors.textDim,
    }),
    panel: {
      flex: "0 0 35%",
      display: "flex",
      flexDirection: "column",
      background: colors.panel,
      borderLeft: `1px solid ${colors.panelBorder}`,
      overflowY: "auto",
      minHeight: 0,
    },
    panelSection: {
      padding: "16px 20px",
      borderBottom: `1px solid ${colors.panelBorder}`,
    },
    sectionTitle: {
      fontSize: 11,
      fontFamily: fonts.data,
      fontWeight: 700,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: colors.textDim,
      marginBottom: 12,
    },
    layerRow: (isActive) => ({
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 10px",
      borderRadius: 6,
      cursor: "pointer",
      transition: "all 0.15s ease",
      background: isActive ? colors.surfaceHover : "transparent",
      border: isActive ? `1px solid ${colors.accent}33` : "1px solid transparent",
    }),
    checkbox: (checked, layerColor) => ({
      width: 18,
      height: 18,
      borderRadius: 4,
      border: `2px solid ${checked ? layerColor : colors.textDim}`,
      background: checked ? layerColor : "transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      flexShrink: 0,
      transition: "all 0.15s ease",
    }),
    checkMark: {
      color: "#0a0e17",
      fontSize: 12,
      fontWeight: 800,
      lineHeight: 1,
    },
    layerLabel: {
      fontSize: 13,
      fontWeight: 500,
      color: colors.text,
      flex: 1,
    },
    layerNumber: {
      fontSize: 11,
      fontFamily: fonts.data,
      color: colors.textDim,
      width: 16,
      textAlign: "right",
      flexShrink: 0,
    },
    colorDot: (c) => ({
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: c,
      flexShrink: 0,
    }),
    materialOption: (isSelected) => ({
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 12px",
      borderRadius: 6,
      cursor: "pointer",
      transition: "all 0.15s ease",
      background: isSelected ? `${colors.accent}18` : "transparent",
      border: isSelected ? `1px solid ${colors.accent}44` : "1px solid transparent",
    }),
    radio: (isSelected) => ({
      width: 16,
      height: 16,
      borderRadius: "50%",
      border: `2px solid ${isSelected ? colors.accent : colors.textDim}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }),
    radioDot: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: colors.accent,
    },
    materialName: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
    },
    costDelta: (positive) => ({
      fontSize: 11,
      fontFamily: fonts.data,
      fontWeight: 600,
      color: positive ? colors.warn : colors.success,
      background: positive ? colors.warnDim : colors.successDim,
      padding: "2px 8px",
      borderRadius: 10,
    }),
    costRow: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    costLabel: {
      width: 90,
      fontSize: 12,
      color: colors.textDim,
      fontFamily: fonts.data,
    },
    costMaterial: {
      flex: 1,
      fontSize: 11,
      color: colors.textDim,
      fontFamily: fonts.data,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    costBarOuter: {
      flex: 1,
      height: 6,
      background: colors.surface,
      borderRadius: 3,
      overflow: "hidden",
    },
    costBarInner: (pct, color) => ({
      width: `${pct}%`,
      height: "100%",
      background: color || colors.accent,
      borderRadius: 3,
      transition: "width 0.3s ease",
    }),
    costValue: {
      width: 55,
      textAlign: "right",
      fontSize: 12,
      fontFamily: fonts.data,
      fontWeight: 600,
      color: colors.text,
    },
    totalRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      paddingTop: 12,
      marginTop: 8,
      borderTop: `1px solid ${colors.panelBorder}`,
    },
    totalLabel: {
      fontSize: 13,
      fontWeight: 700,
      color: colors.textDim,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      fontFamily: fonts.data,
    },
    totalValue: {
      fontSize: 24,
      fontWeight: 800,
      fontFamily: fonts.data,
      color: colors.accent,
    },
    sfMetric: {
      fontSize: 12,
      fontFamily: fonts.data,
      color: colors.textDim,
      marginTop: 4,
      textAlign: "right",
    },
    activeLayerLabel: {
      fontSize: 13,
      fontFamily: fonts.data,
      color: colors.accent,
      marginBottom: 10,
      fontWeight: 600,
    },
  };

  const layerData = MATERIALS_DATA[activeLayer];
  const currentMaterialIndex = layers[activeLayer].materialIndex;
  const currentCost = layers[activeLayer].cost;

  return (
    <div style={S.root}>
      {/* ── Left: 3D Viewport ── */}
      <div style={S.viewport}>
        <canvas ref={canvasRef} style={S.canvas} />
        <div style={S.vizBar}>
          {VIZ_MODES.map((m) => (
            <button
              key={m.key}
              style={S.vizBtn(vizMode === m.key)}
              onClick={() => setVizMode(m.key)}
              onMouseEnter={(e) => {
                if (vizMode !== m.key) {
                  e.currentTarget.style.background = colors.surfaceHover;
                  e.currentTarget.style.color = colors.text;
                }
              }}
              onMouseLeave={(e) => {
                if (vizMode !== m.key) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = colors.textDim;
                }
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: Control Panel ── */}
      <div style={S.panel}>
        {/* Layer Toggle Panel */}
        <div style={S.panelSection}>
          <div style={S.sectionTitle}>Layer Controls</div>
          {[...MATERIALS_DATA].reverse().map((ld, ri) => {
            const i = 6 - ri; // reverse: 7 at top, 1 at bottom
            const layer = layers[i];
            const isActive = activeLayer === i;
            return (
              <div
                key={i}
                style={S.layerRow(isActive)}
                onClick={() => handleSelectLayer(i)}
              >
                <div
                  style={S.checkbox(layer.visible, ld.color)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleLayer(i);
                  }}
                >
                  {layer.visible && <span style={S.checkMark}>&#10003;</span>}
                </div>
                <span style={S.layerNumber}>{i + 1}.</span>
                <span style={S.layerLabel}>{ld.name}</span>
                <span style={S.colorDot(ld.color)} />
              </div>
            );
          })}
        </div>

        {/* Material Picker */}
        <div style={S.panelSection}>
          <div style={S.sectionTitle}>Material Picker</div>
          <div style={S.activeLayerLabel}>
            Layer {activeLayer + 1}: {layerData.name}
          </div>
          {layerData.options.map((opt, oi) => {
            const isSelected = oi === currentMaterialIndex;
            const delta = opt.cost - currentCost;
            return (
              <div
                key={oi}
                style={S.materialOption(isSelected)}
                onClick={() => handleMaterialChange(activeLayer, oi)}
              >
                <div style={S.radio(isSelected)}>
                  {isSelected && <div style={S.radioDot} />}
                </div>
                <span style={S.materialName}>{opt.name}</span>
                {delta !== 0 && (
                  <span style={S.costDelta(delta > 0)}>
                    {delta > 0 ? "+" : ""}{fmtCost(Math.abs(delta))}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Cost Breakdown */}
        <div style={{ ...S.panelSection, borderBottom: "none", flex: 1 }}>
          <div style={S.sectionTitle}>Cost Breakdown</div>
          {layers.map((l, i) => {
            const pct = maxLayerCost > 0 ? (l.cost / maxLayerCost) * 100 : 0;
            return (
              <div key={i} style={S.costRow}>
                <span style={S.costLabel}>{l.name}</span>
                <div style={S.costBarOuter}>
                  <div style={S.costBarInner(pct, MATERIALS_DATA[i].color)} />
                </div>
                <span style={S.costValue}>{fmtCost(l.cost)}</span>
              </div>
            );
          })}
          <div style={{ marginTop: 4 }}>
            {layers.map((l, i) => (
              <div key={i} style={{ fontSize: 10, fontFamily: fonts.data, color: colors.textDim, marginBottom: 2 }}>
                <span style={{ display: "inline-block", width: 90 }}>{l.name}</span>
                <span style={{ color: colors.text }}>{l.material}</span>
              </div>
            ))}
          </div>
          <div style={S.totalRow}>
            <span style={S.totalLabel}>Total</span>
            <div>
              <div style={S.totalValue}>
                ${totalCost.toLocaleString()}
              </div>
              <div style={S.sfMetric}>
                ${costPerSF}/SF
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
