/**
 * buildHouseGeometry — Converts a validated floor plan JSON into Three.js meshes.
 *
 * Produces: exterior walls, interior walls, floor slabs, roof, window/door cutout frames.
 * All geometry is returned as a flat array of { mesh, name, layer } descriptors
 * that HouseScene can add to a <group>.
 *
 * Coordinate convention:
 *   Floor plan: x right, y down (feet)
 *   Three.js:   x right, y up, z toward camera (forward)
 *   Mapping:     3D.x = (fp.x - centerX) * S
 *                3D.z = -(fp.y - centerY) * S   (flip Y)
 *                3D.y = vertical
 *   S = 0.1 (1 foot = 0.1 world units)
 */
import * as THREE from "three";
import { loadTextureSetAsync, applyTexturesToMaterial } from "./pbrTextures";
import { classifyWalls, findWallForOpening, decomposeFootprintRects, edgeSharing, rectSetDifference } from "./planGeometry";
import { getStyleConfig } from "./houseStyleConfigs";

const S = 0.1;          // feet → world units
const WALL_THICK = 0.065; // 0.65 ft ≈ 8" in world units
const WALL_H = 0.9;     // 9 ft story height in world units
const SLAB_H = 0.04;    // 0.4 ft slab

// ── Materials ────────────────────────────────────────────────────────────────
// Exterior wall uses MeshPhysicalMaterial so we get a subtle clearcoat — that's
// what gives painted plaster/stucco its slight sheen under directional light
// instead of looking matte and chalky. Clearcoat roughness is high so it's not
// gloss-paint shiny, just a hint of reflective top layer.
const mat = {
  exteriorWall: new THREE.MeshPhysicalMaterial({
    color: "#F5F0E8", roughness: 0.85, metalness: 0.0,
    clearcoat: 0.18, clearcoatRoughness: 0.55,
    envMapIntensity: 1.0,
    side: THREE.DoubleSide,
  }),
  interiorWall: new THREE.MeshStandardMaterial({
    color: "#FFFFFF", roughness: 0.9, metalness: 0.0,
    side: THREE.DoubleSide,
  }),
  floor: new THREE.MeshStandardMaterial({
    color: "#C4A56A", roughness: 0.7, metalness: 0.05,
  }),
  slab: new THREE.MeshStandardMaterial({
    color: "#8a8a8a", roughness: 0.9, metalness: 0.0,
  }),
  // Roof picks up a small clearcoat too — asphalt shingles have a slight sheen
  // when wet/new. Subtle so it doesn't read as plastic.
  roof: new THREE.MeshPhysicalMaterial({
    color: "#3A3A3A", roughness: 0.8, metalness: 0.1,
    clearcoat: 0.12, clearcoatRoughness: 0.7,
    envMapIntensity: 1.0,
    side: THREE.DoubleSide,
  }),
  windowFrame: new THREE.MeshStandardMaterial({
    color: "#1a1a2e", roughness: 0.3, metalness: 0.4,
  }),
  doorFrame: new THREE.MeshStandardMaterial({
    color: "#3a2a1a", roughness: 0.5, metalness: 0.1,
  }),
  // Physical glass — transmission + low roughness for realistic refraction/reflection.
  // envMapIntensity is boosted in the Canvas via the Environment preset.
  glass: new THREE.MeshPhysicalMaterial({
    color: "#aac9e0",
    roughness: 0.05,
    metalness: 0.0,
    transmission: 0.92,
    thickness: 0.03,
    ior: 1.45,
    transparent: true,
    opacity: 0.55,
    envMapIntensity: 1.2,
    side: THREE.DoubleSide,
  }),
};

// ── PBR textures — load once, apply to relevant materials when ready. ──
// Loads from Polyhaven CDN (CC0). Graceful fallback: if a fetch fails the
// material keeps its flat color.
//
// NOTE: the roof material is intentionally left OFF this list.  Roof
// geometry is built from multiple overlapping rectangles (one gable per
// decomposed footprint rect, plus porch roofs, canopies, partial roofs
// for smaller upper stories).  A repeating texture tiles inconsistently
// across those overlaps and reads as ugly seams.  A flat color with the
// per-style roughness/metalness looks uniform everywhere.
let _texturesLoaded = false;
function loadMaterialTexturesOnce() {
  if (_texturesLoaded) return;
  _texturesLoaded = true;
  const pairs = [
    ["exteriorWall", mat.exteriorWall],
    ["floor", mat.floor],
    ["slab", mat.slab],
  ];
  pairs.forEach(([key, material]) => {
    loadTextureSetAsync(key).then((textures) => {
      if (textures) applyTexturesToMaterial(material, textures);
    });
  });
}
// Kick off texture loads at module eval time — non-blocking.
loadMaterialTexturesOnce();

// ── Helpers ──────────────────────────────────────────────────────────────────
function ftToWorld(ft) { return ft * S; }

function computeCenter(rooms) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  rooms.forEach(r => {
    minX = Math.min(minX, r.x);
    maxX = Math.max(maxX, r.x + r.w);
    minY = Math.min(minY, r.y);
    maxY = Math.max(maxY, r.y + r.h);
  });
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    minX, maxX, minY, maxY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

// Convert floor plan coords to 3D position
function fp2pos(fpX, fpY, center, yUp = 0) {
  return new THREE.Vector3(
    ftToWorld(fpX - center.cx),
    yUp,
    -ftToWorld(fpY - center.cy),
  );
}

// ── Build floor slabs ────────────────────────────────────────────────────────
function buildFloors(plan, center) {
  const meshes = [];
  plan.rooms.forEach((room, i) => {
    const rw = ftToWorld(room.w);
    const rd = ftToWorld(room.h);
    const geo = new THREE.BoxGeometry(rw, SLAB_H, rd);
    const mesh = new THREE.Mesh(geo, room.type === "garage" ? mat.slab : mat.floor);
    const cx = ftToWorld(room.x + room.w / 2 - center.cx);
    const cz = -ftToWorld(room.y + room.h / 2 - center.cy);
    mesh.position.set(cx, SLAB_H / 2, cz);
    mesh.receiveShadow = true;
    meshes.push({ mesh, name: `floor-${i}`, layer: "floor" });
  });
  return meshes;
}

// ── Wall segment emitter ─────────────────────────────────────────────────────
// Given a single classified wall segment (from planGeometry.classifyWalls)
// plus the openings that land on it, emit cutout-aware Three.js meshes.
// Openings turn into: solid portion left → sill below (windows) → lintel above
// → solid portion right. The result is a wall with true holes where the glass
// panes + doorframes sit.
function emitWallSegmentMeshes(wall, openings, center, material, nameBase) {
  const meshes = [];
  const thick = WALL_THICK;
  const horiz = wall.axis === "h";

  // Sort openings along the wall's span axis.
  const sorted = openings.slice().sort((a, b) => a.start - b.start);

  let cursor = wall.from;
  const segments = [];
  sorted.forEach((o) => {
    const oStart = Math.max(o.start, wall.from);
    const oEnd   = Math.min(o.end,   wall.to);
    if (oEnd <= oStart) return;
    if (oStart > cursor + 1e-6) {
      segments.push({ from: cursor, to: oStart });
    }
    if (o.sill > 0) {
      segments.push({ from: oStart, to: oEnd, y0: 0, y1: o.sill });
    }
    const lintelY0 = o.sill + o.height;
    segments.push({ from: oStart, to: oEnd, y0: lintelY0, y1: WALL_H / S });
    cursor = oEnd;
  });
  if (cursor < wall.to - 1e-6) {
    segments.push({ from: cursor, to: wall.to });
  }

  segments.forEach((seg, idx) => {
    const segLenPlan = seg.to - seg.from;
    if (segLenPlan <= 1e-6) return;
    const segLenWorld = ftToWorld(segLenPlan);
    const segCenterPlan = (seg.from + seg.to) / 2;

    const y0 = seg.y0 ?? 0;
    const y1 = seg.y1 ?? (WALL_H / S);
    const segH = ftToWorld(y1 - y0);
    if (segH <= 0) return;
    const yMid = SLAB_H + ftToWorld(y0) + segH / 2;

    const geo = horiz
      ? new THREE.BoxGeometry(segLenWorld, segH, thick)
      : new THREE.BoxGeometry(thick, segH, segLenWorld);
    const mesh = new THREE.Mesh(geo, material);

    // Map plan coords → 3D world. For horizontal walls (axis='h'):
    //   span axis is X, wall y = wall.at (plan Y) → world Z = -ftToWorld(at - center.cy)
    // For vertical walls (axis='v'):
    //   span axis is Y (plan) → world -Z; wall x = wall.at → world X = ftToWorld(at - center.cx)
    if (horiz) {
      const worldX = ftToWorld(segCenterPlan - center.cx);
      const worldZ = -ftToWorld(wall.at - center.cy);
      mesh.position.set(worldX, yMid, worldZ);
    } else {
      const worldX = ftToWorld(wall.at - center.cx);
      const worldZ = -ftToWorld(segCenterPlan - center.cy);
      mesh.position.set(worldX, yMid, worldZ);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push({ mesh, name: `${nameBase}-${idx}`, layer: nameBase.startsWith("int") ? "interior" : "exterior" });
  });

  return meshes;
}

// ── Build exterior walls ─────────────────────────────────────────────────────
// Uses classifyWalls() to support non-rectangular footprints (L, T, U, +).
// Each classified exterior segment gets its own cutout-aware mesh set based
// on the openings that land on it.
function buildExteriorWalls(plan, center) {
  const { exterior } = classifyWalls(plan.rooms);
  const meshes = [];

  // Index openings by their assigned wall segment for fast lookup.
  const openingsByWall = new Map();
  const assignOpening = (opening, kind) => {
    const wall = findWallForOpening(exterior, opening);
    if (!wall) return;
    if (!openingsByWall.has(wall)) openingsByWall.set(wall, []);
    const horiz = wall.axis === "h";
    const c = horiz ? opening.x : opening.y;
    const wdth = opening.width;
    openingsByWall.get(wall).push({
      kind,
      start: c - wdth / 2,
      end: c + wdth / 2,
      sill: kind === "window" ? (opening.sillHeight || 3) : 0,
      height: opening.height || (kind === "window" ? 4 : 7),
    });
  };
  (plan.doors || []).forEach(d => assignOpening(d, "door"));
  (plan.windows || []).forEach(w => assignOpening(w, "window"));

  exterior.forEach((wall, idx) => {
    const opens = openingsByWall.get(wall) || [];
    meshes.push(...emitWallSegmentMeshes(
      wall, opens, center, mat.exteriorWall, `ext-wall-${idx}`
    ));
  });

  return meshes;
}

// ── Build interior walls ─────────────────────────────────────────────────────
// Interior walls come from classifyWalls() — edges where rooms exist on BOTH
// sides. This naturally dedupes shared walls between adjacent rooms (no
// double-render) and extends to L/T/U-shaped plans for free.
function buildInteriorWalls(plan, center) {
  const stairs = (plan.rooms || []).filter((r) => r.type === "stair" || r.isStair);
  const { interior: rawInterior } = classifyWalls(plan.rooms);
  const interior = rawInterior.filter((seg) => !_isStairPerimeterSegment(seg, stairs));
  const meshes = [];
  const thick = WALL_THICK * 0.6;
  const wallHeight = WALL_H * 0.95;

  interior.forEach((wall, idx) => {
    const horiz = wall.axis === "h";
    const segLenPlan = wall.to - wall.from;
    if (segLenPlan <= 1e-6) return;
    const segLenWorld = ftToWorld(segLenPlan);
    const segCenterPlan = (wall.from + wall.to) / 2;

    const geo = horiz
      ? new THREE.BoxGeometry(segLenWorld, wallHeight, thick)
      : new THREE.BoxGeometry(thick, wallHeight, segLenWorld);
    const mesh = new THREE.Mesh(geo, mat.interiorWall);

    const worldX = horiz
      ? ftToWorld(segCenterPlan - center.cx)
      : ftToWorld(wall.at - center.cx);
    const worldZ = horiz
      ? -ftToWorld(wall.at - center.cy)
      : -ftToWorld(segCenterPlan - center.cy);

    mesh.position.set(worldX, SLAB_H + wallHeight / 2, worldZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push({ mesh, name: `int-wall-${idx}`, layer: "interior" });
  });

  return meshes;
}

// ── Build window frames ──────────────────────────────────────────────────────
function buildWindowFrames(plan, center) {
  const meshes = [];
  const { exterior } = classifyWalls(plan.rooms);
  const t = 0.02; // frame beam thickness

  plan.windows.forEach((win, i) => {
    const isSide = win.side === "left" || win.side === "right";
    const ww = ftToWorld(win.width);
    const wh = ftToWorld(win.height || 4);
    const sill = ftToWorld(win.sillHeight || 3);
    const yCenter = SLAB_H + sill + wh / 2;

    // Snap the frame to the actual classified exterior wall segment — so the
    // frame sits exactly where the cutout was emitted (works for L/T/U).
    const wall = findWallForOpening(exterior, win);
    if (!wall) return;

    let px, pz;
    if (isSide) {
      px = ftToWorld(wall.at - center.cx);
      pz = -ftToWorld(win.y - center.cy);
    } else {
      px = ftToWorld(win.x - center.cx);
      pz = -ftToWorld(wall.at - center.cy);
    }

    const group = new THREE.Group();
    group.position.set(px, yCenter, pz);

    // Frame beams
    const topBot = isSide ? [t, t, ww + t * 2] : [ww + t * 2, t, t];
    const sideBar = [t, wh, t];
    const crossH = isSide ? [t, 0.012, ww] : [ww, 0.012, t];
    const crossV = isSide ? [t, wh, 0.012] : [0.012, wh, t];
    const hOff = ww / 2;
    const lPos = isSide ? [0, 0, -hOff] : [-hOff, 0, 0];
    const rPos = isSide ? [0, 0, hOff] : [hOff, 0, 0];

    [
      { args: topBot, pos: [0, wh / 2, 0] },
      { args: topBot, pos: [0, -wh / 2, 0] },
      { args: sideBar, pos: lPos },
      { args: sideBar, pos: rPos },
      { args: crossH, pos: [0, 0, 0] },
      { args: crossV, pos: [0, 0, 0] },
    ].forEach(({ args, pos }) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...args), mat.windowFrame);
      m.position.set(...pos);
      group.add(m);
    });

    // Glass pane — sits inside the frame on the wall plane
    const paneThickness = 0.006;
    const paneArgs = isSide
      ? [paneThickness, wh - t * 2, ww - t * 2]
      : [ww - t * 2, wh - t * 2, paneThickness];
    const pane = new THREE.Mesh(new THREE.BoxGeometry(...paneArgs), mat.glass);
    pane.castShadow = false;
    pane.receiveShadow = false;
    group.add(pane);

    meshes.push({ mesh: group, name: `window-frame-${i}`, layer: "openings" });
  });

  return meshes;
}

// ── Build door frames ────────────────────────────────────────────────────────
function buildDoorFrames(plan, center) {
  const meshes = [];
  const { exterior } = classifyWalls(plan.rooms);
  const t = 0.025;

  plan.doors.forEach((door, i) => {
    const isSide = door.side === "left" || door.side === "right";
    const dw = ftToWorld(door.width);
    const dh = ftToWorld(door.height || 7);
    const yCenter = SLAB_H + dh / 2;

    const wall = findWallForOpening(exterior, door);
    if (!wall) return;

    let px, pz;
    if (isSide) {
      px = ftToWorld(wall.at - center.cx);
      pz = -ftToWorld(door.y - center.cy);
    } else {
      px = ftToWorld(door.x - center.cx);
      pz = -ftToWorld(wall.at - center.cy);
    }

    const group = new THREE.Group();
    group.position.set(px, yCenter, pz);

    const topBar = isSide ? [t, t, dw + t * 2] : [dw + t * 2, t, t];
    const sideBar = [t, dh, t];
    const hOff = dw / 2;
    const lPos = isSide ? [0, 0, -hOff] : [-hOff, 0, 0];
    const rPos = isSide ? [0, 0, hOff] : [hOff, 0, 0];

    [
      { args: topBar, pos: [0, dh / 2, 0] },
      { args: sideBar, pos: lPos },
      { args: sideBar, pos: rPos },
    ].forEach(({ args, pos }) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...args), mat.doorFrame);
      m.position.set(...pos);
      group.add(m);
    });

    meshes.push({ mesh: group, name: `door-frame-${i}`, layer: "openings" });
  });

  return meshes;
}

// ── Build gable roof ─────────────────────────────────────────────────────────
//
// Footprint-aware: decomposes the plan into rectangles and emits one gable per
// rectangle with the full eave overhang on every side. Where two rectangles
// meet (e.g. the inner corner of an L), their roof meshes overlap — the
// overlap reads as a natural intersection/valley when viewed from outside.
//
// Ridge runs along the LONGER plan dimension. Pitch 5/12 (22.6°). Ridge
// height is computed from the rect's footprint short dim (not overhang-padded)
// so adjacent rectangles with matching short dimensions share ridge height
// and their slopes line up cleanly in the overlap region.
function buildGableOverRect(rect, center, overhang, ridgeAlongX, extensions, ridgeHOverride, idx, pitch) {
  const ow = overhang;

  // Per-side extents in world units:
  //   half-width + overhang + cross-gable extension (0 for non-rotated rects).
  // ext is in feet (from crossGableExtensions); convert with ftToWorld.
  const ext = extensions || { n: 0, s: 0, e: 0, w: 0 };
  const rx_e = ftToWorld(rect.w) / 2 + ow + ftToWorld(ext.e);
  const rx_w = ftToWorld(rect.w) / 2 + ow + ftToWorld(ext.w);
  const rz_s = ftToWorld(rect.h) / 2 + ow + ftToWorld(ext.s);
  const rz_n = ftToWorld(rect.h) / 2 + ow + ftToWorld(ext.n);

  const shortDimFt = ridgeAlongX ? rect.h : rect.w;
  const naturalRidgeH = ftToWorld(shortDimFt) / 2 * (pitch || 5 / 12) * 2;
  const ridgeH = ridgeHOverride != null ? ridgeHOverride : naturalRidgeH;

  const baseY = SLAB_H + WALL_H;

  const cxPlan = rect.x + rect.w / 2;
  const cyPlan = rect.y + rect.h / 2;
  const cxWorld = ftToWorld(cxPlan - center.cx);
  const czWorld = -ftToWorld(cyPlan - center.cy);

  let vertices;
  if (ridgeAlongX) {
    // Ridge parallel to 3D X at z=0, y=ridgeH.
    // Gable-end triangles face ±X (at rx_e / -rx_w); slopes face ±Z.
    vertices = new Float32Array([
      // +X gable triangle
      rx_e, 0, -rz_n,   rx_e, 0, rz_s,   rx_e, ridgeH, 0,
      // -X gable triangle
      -rx_w, 0, rz_s,   -rx_w, 0, -rz_n,  -rx_w, ridgeH, 0,
      // +Z slope
      -rx_w, 0, rz_s,   rx_e, 0, rz_s,   rx_e, ridgeH, 0,
      -rx_w, 0, rz_s,   rx_e, ridgeH, 0,  -rx_w, ridgeH, 0,
      // -Z slope
      rx_e, 0, -rz_n,   -rx_w, 0, -rz_n,  -rx_w, ridgeH, 0,
      rx_e, 0, -rz_n,   -rx_w, ridgeH, 0,  rx_e, ridgeH, 0,
    ]);
  } else {
    // Ridge along Z at x=0, y=ridgeH. Gables face ±Z; slopes face ±X.
    // Ridge span: z ∈ [-rz_n, +rz_s].
    vertices = new Float32Array([
      // +Z gable triangle (south)
      -rx_w, 0, rz_s,   rx_e, 0, rz_s,   0, ridgeH, rz_s,
      // -Z gable triangle (north)
      rx_e, 0, -rz_n,   -rx_w, 0, -rz_n,   0, ridgeH, -rz_n,
      // -X slope
      -rx_w, 0, rz_s,   0, ridgeH, rz_s,   0, ridgeH, -rz_n,
      -rx_w, 0, rz_s,   0, ridgeH, -rz_n,  -rx_w, 0, -rz_n,
      // +X slope
      rx_e, 0, rz_s,    rx_e, 0, -rz_n,     0, ridgeH, -rz_n,
      rx_e, 0, rz_s,    0, ridgeH, -rz_n,  0, ridgeH, rz_s,
    ]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, mat.roof);
  mesh.position.set(cxWorld, baseY, czWorld);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return { mesh, name: `roof-${idx}`, layer: "roof" };
}

/**
 * Pick the ridge direction for a roof rectangle.
 *
 * Default — ridge along the longer plan dimension (standard residential).
 *
 * Cross-gable override — when this rect is an "arm" extending from a neighbor:
 *   - Shared top/bottom edge only AND vertical dim ≥ horizontal →
 *       rotate ridge to Z so the gable triangle faces the neighbor.
 *   - Shared left/right edge only AND horizontal dim ≥ vertical →
 *       ridge along X, gable faces the neighbor.
 *
 * This gives the classic L/T cross-gable look: the shorter arm's gable
 * triangle butts into the longer arm's slope, rather than both arms running
 * parallel ridges that look awkward at the inner corner.
 */
function pickRidgeAlongX(rect, shares) {
  const horizShare = shares.n || shares.s;
  const vertShare  = shares.e || shares.w;

  if (horizShare && !vertShare && rect.h >= rect.w) return false; // ridge along Z
  if (vertShare && !horizShare && rect.w >= rect.h) return true;  // ridge along X

  return rect.w >= rect.h;
}

/** Natural ridge height (world units) for a rect given its ridge direction. */
function computeNaturalRidgeH(rect, ridgeAlongX, pitch = 5 / 12) {
  const shortDimFt = ridgeAlongX ? rect.h : rect.w;
  return ftToWorld(shortDimFt) / 2 * pitch * 2;
}

function buildRoof(plan, center, overhangOverride, pitchOverride) {
  const overhang = overhangOverride ?? 0.15; // world units
  const pitch = pitchOverride ?? 5 / 12;
  const rects = decomposeFootprintRects(plan.rooms);
  if (rects.length === 0) return [];

  const metas = rects.map(rect => {
    const shares = edgeSharing(rect, rects);
    const ridgeAlongX = pickRidgeAlongX(rect, shares);
    const naturalRidgeAlongX = rect.w >= rect.h;
    const rotated = ridgeAlongX !== naturalRidgeAlongX;
    const ridgeH = computeNaturalRidgeH(rect, ridgeAlongX, pitch);
    return { rect, shares, ridgeAlongX, rotated, ridgeH };
  });

  return metas.map((meta, idx) => {
    let ridgeH = meta.ridgeH;

    if (meta.rotated) {
      const neighbor = metas.find(m => m !== meta && !m.rotated &&
        ((meta.shares.n && Math.abs(m.rect.y + m.rect.h - meta.rect.y) < 1e-6) ||
         (meta.shares.s && Math.abs(meta.rect.y + meta.rect.h - m.rect.y) < 1e-6) ||
         (meta.shares.w && Math.abs(m.rect.x + m.rect.w - meta.rect.x) < 1e-6) ||
         (meta.shares.e && Math.abs(meta.rect.x + meta.rect.w - m.rect.x) < 1e-6)));
      if (neighbor) ridgeH = neighbor.ridgeH / 2;
    }

    return buildGableOverRect(
      meta.rect, center, overhang, meta.ridgeAlongX, null, ridgeH, idx, pitch
    );
  });
}

// ── Build flat roof ─────────────────────────────────────────────────────────
// A near-flat cap with slight slope for drainage. Used by Modern style.
function buildFlatRoof(plan, center, overhang = 0.06) {
  const rects = decomposeFootprintRects(plan.rooms);
  if (rects.length === 0) return [];
  const thickness = 0.04;
  const baseY = SLAB_H + WALL_H;
  // Use a wider minimum overhang so the roof visually covers the wall top
  // with no hairline gap between the fascia and the stucco.
  const effectiveOverhang = Math.max(overhang, 0.12);
  return rects.map((rect, i) => {
    const rw = ftToWorld(rect.w) + effectiveOverhang * 2;
    const rd = ftToWorld(rect.h) + effectiveOverhang * 2;
    const geo = new THREE.BoxGeometry(rw, thickness, rd);
    const mesh = new THREE.Mesh(geo, mat.roof);
    const cxPlan = rect.x + rect.w / 2;
    const cyPlan = rect.y + rect.h / 2;
    // Sit the bottom of the roof flush on top of the walls — no tilt.
    // A tilted flat roof looked correct edge-on but exposed a gap on the
    // low-side wall top in screenshots.
    mesh.position.set(
      ftToWorld(cxPlan - center.cx),
      baseY + thickness / 2,
      -ftToWorld(cyPlan - center.cy),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return { mesh, name: `flat-roof-${i}`, layer: "roof" };
  });
}

// ── Build hip roof ──────────────────────────────────────────────────────────
// Four sloping faces meeting at a ridge (rectangular plans) or a peak (square).
// Pitch is configurable via the style config.
function buildHipRoof(plan, center, overhang = 0.18, pitch = 3 / 12) {
  const rects = decomposeFootprintRects(plan.rooms);
  if (rects.length === 0) return [];
  const baseY = SLAB_H + WALL_H;

  return rects.map((rect, idx) => {
    const hw = ftToWorld(rect.w) / 2 + overhang;
    const hd = ftToWorld(rect.h) / 2 + overhang;
    const shortHalf = Math.min(hw, hd);
    const ridgeH = shortHalf * pitch * 2;

    const cxWorld = ftToWorld(rect.x + rect.w / 2 - center.cx);
    const czWorld = -ftToWorld(rect.y + rect.h / 2 - center.cy);

    // Ridge along the longer axis. For a square, ridge is zero-length (peak).
    const ridgeAlongX = rect.w >= rect.h;
    const ridgeLen = ridgeAlongX
      ? Math.max(0, hw - hd)
      : Math.max(0, hd - hw);

    let vertices;
    if (ridgeAlongX) {
      // Ridge runs along X from -ridgeLen to +ridgeLen at y=ridgeH.
      // Four slope triangles from the eave edges up to the ridge endpoints.
      vertices = new Float32Array([
        // Front slope (+Z face)
        -hw, 0,  hd,    hw, 0,  hd,    ridgeLen, ridgeH,  0,
        -hw, 0,  hd,    ridgeLen, ridgeH, 0,   -ridgeLen, ridgeH, 0,
        // Back slope (-Z face)
         hw, 0, -hd,   -hw, 0, -hd,   -ridgeLen, ridgeH,  0,
         hw, 0, -hd,   -ridgeLen, ridgeH, 0,    ridgeLen, ridgeH, 0,
        // Left hip (-X face)
        -hw, 0, -hd,   -hw, 0,  hd,   -ridgeLen, ridgeH,  0,
        // Right hip (+X face)
         hw, 0,  hd,    hw, 0, -hd,    ridgeLen, ridgeH,  0,
      ]);
    } else {
      // Ridge runs along Z from -ridgeLen to +ridgeLen.
      vertices = new Float32Array([
        // Left slope (-X face)
        -hw, 0,  hd,   -hw, 0, -hd,    0, ridgeH, -ridgeLen,
        -hw, 0,  hd,    0, ridgeH, -ridgeLen,   0, ridgeH,  ridgeLen,
        // Right slope (+X face)
         hw, 0, -hd,    hw, 0,  hd,    0, ridgeH,  ridgeLen,
         hw, 0, -hd,    0, ridgeH,  ridgeLen,   0, ridgeH, -ridgeLen,
        // Front hip (+Z face)
        -hw, 0,  hd,    hw, 0,  hd,    0, ridgeH,  ridgeLen,
        // Back hip (-Z face)
         hw, 0, -hd,   -hw, 0, -hd,    0, ridgeH, -ridgeLen,
      ]);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mat.roof);
    mesh.position.set(cxWorld, baseY, czWorld);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return { mesh, name: `hip-roof-${idx}`, layer: "roof" };
  });
}

// ── Build front porch ───────────────────────────────────────────────────────
// A slab extending from the front wall (y = minY) with columns and a mini-roof
// matching the main roof material. Used by Ranch and Craftsman.
function buildPorch(plan, center, porchDepthFt = 6) {
  if (!porchDepthFt || porchDepthFt <= 0) return [];
  const meshes = [];
  const porchD = ftToWorld(porchDepthFt);
  const bboxW = ftToWorld(center.w);
  const porchThick = 0.03;

  // Find front rooms (at y = center.minY) to determine porch width
  const frontRooms = plan.rooms.filter(r => r.type !== "garage" && Math.abs(r.y - center.minY) < 0.3);
  if (frontRooms.length === 0) return [];
  const porchMinX = Math.min(...frontRooms.map(r => r.x));
  const porchMaxX = Math.max(...frontRooms.map(r => r.x + r.w));
  const porchW = ftToWorld(porchMaxX - porchMinX);
  const porchCxPlan = (porchMinX + porchMaxX) / 2;
  const porchCx = ftToWorld(porchCxPlan - center.cx);
  const porchFrontZ = -ftToWorld(center.minY - center.cy) + porchD / 2;

  // Porch floor slab
  const slabGeo = new THREE.BoxGeometry(porchW + 0.06, porchThick, porchD);
  const slab = new THREE.Mesh(slabGeo, mat.slab);
  slab.position.set(porchCx, SLAB_H / 2, porchFrontZ);
  slab.receiveShadow = true;
  meshes.push({ mesh: slab, name: "porch-slab", layer: "porch" });

  // Columns at the two front corners
  const colRadius = 0.025;
  const colH = WALL_H * 0.85;
  const colGeo = new THREE.CylinderGeometry(colRadius, colRadius * 1.15, colH, 8);
  const colMat = new THREE.MeshStandardMaterial({
    color: mat.exteriorWall.color.clone(),
    roughness: 0.6,
    metalness: 0.0,
  });
  const porchHalfW = porchW / 2 - 0.04;
  const porchFrontEdgeZ = porchFrontZ + porchD / 2 - 0.04;
  [[-porchHalfW + porchCx, porchFrontEdgeZ], [porchHalfW + porchCx, porchFrontEdgeZ]].forEach(([cx, cz], i) => {
    const col = new THREE.Mesh(colGeo, colMat);
    col.position.set(cx, SLAB_H + colH / 2, cz);
    col.castShadow = true;
    meshes.push({ mesh: col, name: `porch-col-${i}`, layer: "porch" });
  });

  // Porch roof — thin flat slab over the porch
  const roofGeo = new THREE.BoxGeometry(porchW + 0.12, porchThick, porchD + 0.06);
  const roofMesh = new THREE.Mesh(roofGeo, mat.roof);
  roofMesh.position.set(porchCx, SLAB_H + colH, porchFrontZ);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  meshes.push({ mesh: roofMesh, name: "porch-roof", layer: "porch" });

  return meshes;
}

// ── Build entry canopy ──────────────────────────────────────────────────────
// A thin flat slab above the front door position. Used by Modern, Colonial,
// Mediterranean.
function buildEntryCanopy(plan, center, canopyConfig) {
  if (!canopyConfig) return [];
  const { depthFt, heightFt } = canopyConfig;
  if (!depthFt || !heightFt) return [];

  // Find the front door
  const frontDoor = (plan.doors || []).find(d => d.isFrontDoor) ||
                    (plan.doors || []).find(d => d.isExterior && d.side === "top");
  if (!frontDoor) return [];

  const canopyW = ftToWorld(Math.max(frontDoor.width + 2, 5));
  const canopyD = ftToWorld(depthFt);
  const canopyY = SLAB_H + ftToWorld(heightFt);
  const thick = 0.025;

  const px = ftToWorld(frontDoor.x - center.cx);
  const pz = -ftToWorld(center.minY - center.cy) + canopyD / 2;

  const geo = new THREE.BoxGeometry(canopyW, thick, canopyD);
  const mesh = new THREE.Mesh(geo, mat.roof);
  mesh.position.set(px, canopyY, pz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return [{ mesh, name: "entry-canopy", layer: "canopy" }];
}

// ── Build structural pillars ────────────────────────────────────────────────
// Consumed from the `pillars` option — placements come from structuralSupport
// generatePillars() in plan coords (feet).  Each pillar sits at y=0 and rises
// to the 1st floor wall height.  Geometry family is driven by the style
// config ("square" | "tapered" | "stucco") so pillars match the exterior.
function buildPillars(pillars, center) {
  if (!pillars || pillars.length === 0) return [];
  const meshes = [];
  // Darken the wall color slightly so pillars read as separate elements.
  const pillarColor = mat.exteriorWall.color.clone().multiplyScalar(0.78);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: pillarColor,
    roughness: Math.min(1, mat.exteriorWall.roughness + 0.05),
    metalness: 0.0,
  });

  pillars.forEach((p, i) => {
    const baseW = ftToWorld(p.baseSizeFt || 1);
    const h = ftToWorld(p.heightFt || 9);
    let geo;
    if (p.geometry === "tapered") {
      const topR  = baseW * 0.4;  // tapered: top ~80% of base radius
      const baseR = baseW * 0.5;
      geo = new THREE.CylinderGeometry(topR, baseR, h, 12);
    } else if (p.geometry === "stucco") {
      // Square with a slight flare at the very top — approximate by
      // stacking a small box on the main column.
      const col = new THREE.BoxGeometry(baseW, h * 0.95, baseW);
      const flare = new THREE.BoxGeometry(baseW * 1.12, h * 0.05, baseW * 1.12);
      // Merge-like: wrap two meshes in a group.
      const group = new THREE.Group();
      const colMesh = new THREE.Mesh(col, pillarMat);
      colMesh.position.y = h * 0.475;
      const flareMesh = new THREE.Mesh(flare, pillarMat);
      flareMesh.position.y = h * 0.975;
      group.add(colMesh);
      group.add(flareMesh);
      const cxWorld = ftToWorld(p.xFt - center.cx);
      const czWorld = -ftToWorld(p.yFt - center.cy);
      group.position.set(cxWorld, 0, czWorld);
      colMesh.castShadow = true;
      colMesh.receiveShadow = true;
      flareMesh.castShadow = true;
      meshes.push({ mesh: group, name: `pillar-${i}`, layer: "pillar" });
      return;
    } else {
      geo = new THREE.BoxGeometry(baseW, h, baseW);
    }
    const mesh = new THREE.Mesh(geo, pillarMat);
    const cxWorld = ftToWorld(p.xFt - center.cx);
    const czWorld = -ftToWorld(p.yFt - center.cy);
    mesh.position.set(cxWorld, h / 2, czWorld);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push({ mesh, name: `pillar-${i}`, layer: "pillar" });
  });
  return meshes;
}

// ── Build driveway ──────────────────────────────────────────────────────────
// The driveway always sits directly in front of the garage door — we read
// the garage door's side and x/y out of plan.doors (where isGarageDoor is
// true) and extend the slab perpendicular from it, so the driveway can
// never land on a wall with no door.
//
// Only emits when the ground story has at least one garage door.
const driveMat = new THREE.MeshStandardMaterial({
  color: "#7c7c7c",
  roughness: 0.92,
  metalness: 0.02,
});
function buildDriveway(plan, center) {
  const garageDoors = (plan.doors || []).filter((d) => d.isGarageDoor);
  if (garageDoors.length === 0) return [];
  const meshes = [];
  const DRIVE_DEPTH_FT = 18;       // 18 ft out from the garage face
  const thickness = 0.015;

  garageDoors.forEach((door, i) => {
    const doorW = door.width || 14;
    // OpeningSchema: for top/bottom walls, door.x is CENTER along the wall
    // and door.y is the wall's y coord.  For left/right walls, door.x is
    // the wall's x coord and door.y is CENTER along the wall.
    let x, y, w, d;
    if (door.side === "top") {
      x = door.x - doorW / 2;
      y = door.y - DRIVE_DEPTH_FT;
      w = doorW;
      d = DRIVE_DEPTH_FT;
    } else if (door.side === "bottom") {
      x = door.x - doorW / 2;
      y = door.y;
      w = doorW;
      d = DRIVE_DEPTH_FT;
    } else if (door.side === "left") {
      x = door.x - DRIVE_DEPTH_FT;
      y = door.y - doorW / 2;
      w = DRIVE_DEPTH_FT;
      d = doorW;
    } else { // "right"
      x = door.x;
      y = door.y - doorW / 2;
      w = DRIVE_DEPTH_FT;
      d = doorW;
    }

    const geo = new THREE.BoxGeometry(ftToWorld(w), thickness, ftToWorld(d));
    const mesh = new THREE.Mesh(geo, driveMat);
    const cxPlan = x + w / 2;
    const cyPlan = y + d / 2;
    mesh.position.set(
      ftToWorld(cxPlan - center.cx),
      thickness / 2,
      -ftToWorld(cyPlan - center.cy),
    );
    mesh.receiveShadow = true;
    meshes.push({ mesh, name: `driveway-${i}`, layer: "driveway" });
  });
  return meshes;
}

// ── Build foundation slab ────────────────────────────────────────────────────
function buildFoundation(plan, center) {
  const fw = ftToWorld(center.w) + 0.15;
  const fd = ftToWorld(center.h) + 0.15;
  const geo = new THREE.BoxGeometry(fw, 0.03, fd);
  const mesh = new THREE.Mesh(geo, mat.slab);
  mesh.position.set(0, 0, 0);
  mesh.receiveShadow = true;
  return [{ mesh, name: "foundation", layer: "foundation" }];
}

// ── Furniture ────────────────────────────────────────────────────────────────
//
// Each placed item becomes a small Three.js Group with composite child meshes
// so the cutaway view (Remove Roof) shows recognisable furniture rather than
// flat coloured boxes.
//
// Conventions for every per-type builder:
//   - Local origin at the centre of the item's footprint, floor at y = 0.
//   - Box width  = ftToWorld(item.w) along world X
//   - Box depth  = ftToWorld(item.h) along world Z
//   - "Back" of furniture (sofa back, headboard, fridge hinges, shower wall)
//     is on the −Z face. AI-placed items always sit at the south edge of a
//     room, which maps to −Z, so the back lines up against the wall.
//
// Heights and base body colours per item type.
const FURNITURE_DEFAULTS = {
  sofa:    { heightFt: 2.8, color: "#6b7f9c" },
  tv:      { heightFt: 3.5, color: "#1a1a1a" },
  bed:     { heightFt: 2.6, color: "#c8a574" },
  dresser: { heightFt: 3.8, color: "#8a6a48" },
  oven:    { heightFt: 3.0, color: "#2a2a2a" },
  fridge:  { heightFt: 5.8, color: "#c0c4c8" },
  toilet:  { heightFt: 2.6, color: "#f4f4f4" },
  shower:  { heightFt: 6.8, color: "#c8d2dc" },
  washer:  { heightFt: 3.0, color: "#e8e8e8" },
  dryer:   { heightFt: 3.0, color: "#d8d8d8" },
  table:   { heightFt: 2.5, color: "#8a6a48" },
  stair:   { heightFt: 3.0, color: "#8a6a48" },
  _default:{ heightFt: 2.5, color: "#9a8a7a" },
};

// Types that are structural / already rendered by the builders above.
const STRUCTURAL_PLACED_TYPES = new Set([
  "door", "window", "glazing", "garage", "wall",
]);

// ── Furniture materials ───────────────────────────────────────────────────────
// Module-level singletons so disposeHouseGeometry can dispose only geometries.
// `_FURN_BODY_MATS` caches body materials by colour so user-coloured furniture
// doesn't leak a fresh material every render.
const _FURN_BODY_MATS = new Map();
function _bodyMat(color, metalness = 0.05) {
  const key = `${color}|${metalness}`;
  if (!_FURN_BODY_MATS.has(key)) {
    _FURN_BODY_MATS.set(key, new THREE.MeshStandardMaterial({
      color, roughness: 0.72, metalness,
    }));
  }
  return _FURN_BODY_MATS.get(key);
}
const _FURN = {
  pillow:  new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.85 }),
  cushion: new THREE.MeshStandardMaterial({ color: "#8898ad", roughness: 0.9 }),
  wood:    new THREE.MeshStandardMaterial({ color: "#5a3d22", roughness: 0.75 }),
  woodLt:  new THREE.MeshStandardMaterial({ color: "#a8835a", roughness: 0.7 }),
  metal:   new THREE.MeshStandardMaterial({ color: "#4a4a4a", roughness: 0.4, metalness: 0.7 }),
  chrome:  new THREE.MeshStandardMaterial({ color: "#bcbcbc", roughness: 0.25, metalness: 0.85 }),
  ceramic: new THREE.MeshStandardMaterial({ color: "#fafafa", roughness: 0.35 }),
  screen:  new THREE.MeshStandardMaterial({ color: "#0a0a14", roughness: 0.18, emissive: "#0a1a2a", emissiveIntensity: 0.18 }),
  knob:    new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.4, metalness: 0.6 }),
  shroud:  new THREE.MeshStandardMaterial({ color: "#2a2a2a", roughness: 0.5 }),
  glass:   new THREE.MeshPhysicalMaterial({
    color: "#cce4f0", roughness: 0.1, metalness: 0,
    transmission: 0.78, opacity: 0.55, transparent: true,
    ior: 1.4, thickness: 0.02, side: THREE.DoubleSide,
  }),
};

// Convenience: append a Box mesh to `group`. Position is the bottom-centre of
// the box (Y = 0 means resting on floor) so callers can think in stack order.
function _addBox(group, w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}
function _addCyl(group, r, h, material, x = 0, y = 0, z = 0, segments = 16, axis = "y") {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material);
  if (axis === "x") m.rotation.z = Math.PI / 2;
  else if (axis === "z") m.rotation.x = Math.PI / 2;
  m.position.set(x, y + (axis === "y" ? h / 2 : 0), z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

// ── Per-type composite builders ──────────────────────────────────────────────
function _buildSofaGroup(W, H, D, body) {
  const g = new THREE.Group();
  const armW = Math.min(W * 0.14, ftToWorld(0.8));
  const backD = Math.min(D * 0.22, ftToWorld(0.6));
  const seatH = H * 0.42, backH = H, armH = H * 0.78;
  const seatW = W - armW * 2;
  const seatD = D - backD;
  // Backrest at −Z
  _addBox(g, W, backH, backD, body, 0, 0, -D / 2 + backD / 2);
  // Seat slab
  _addBox(g, seatW, seatH, seatD, body, 0, 0, backD / 2);
  // Cushions on the seat (3 if wide, otherwise 2)
  const cushCount = seatW > ftToWorld(5) ? 3 : 2;
  const cushPad = seatW * 0.04;
  const cushW = (seatW - cushPad * (cushCount + 1)) / cushCount;
  for (let i = 0; i < cushCount; i++) {
    const cx = -seatW / 2 + cushPad + cushW / 2 + i * (cushW + cushPad);
    _addBox(g, cushW, H * 0.18, seatD * 0.85, _FURN.cushion, cx, seatH, backD / 2 + (D - backD) * 0.05);
  }
  // Armrests
  _addBox(g, armW, armH, D - backD * 0.5, body, -W / 2 + armW / 2, 0, backD / 4);
  _addBox(g, armW, armH, D - backD * 0.5, body,  W / 2 - armW / 2, 0, backD / 4);
  return g;
}

function _buildTvGroup(W, H, D, body) {
  const g = new THREE.Group();
  // Stand (low base)
  _addBox(g, W * 0.45, H * 0.18, D * 0.6, _FURN.wood, 0, 0, 0);
  // Vertical post on the stand
  _addBox(g, W * 0.06, H * 0.4, D * 0.06, _FURN.metal, 0, H * 0.18, 0);
  // Screen — thin upright slab
  const scrH = H * 0.55;
  _addBox(g, W, scrH, D * 0.08, _FURN.screen, 0, H * 0.42, -D * 0.02);
  // Bezel ring around the screen (thin frame)
  _addBox(g, W * 1.02, scrH * 0.04, D * 0.09, body, 0, H * 0.42 + scrH - scrH * 0.02, -D * 0.02);
  return g;
}

function _buildBedGroup(W, H, D, body) {
  const g = new THREE.Group();
  // Base (boxspring)
  const baseH = H * 0.32;
  _addBox(g, W, baseH, D, _FURN.wood, 0, 0, 0);
  // Mattress
  const matH = H * 0.32;
  _addBox(g, W * 0.95, matH, D * 0.95, _FURN.pillow, 0, baseH, 0);
  // Headboard at −Z
  const hbH = H * 1.15;
  _addBox(g, W, hbH, ftToWorld(0.25), _FURN.wood, 0, 0, -D / 2 + ftToWorld(0.125));
  // Two pillows along headboard
  const pillowW = W * 0.42, pillowD = D * 0.18;
  _addBox(g, pillowW, H * 0.18, pillowD, _FURN.pillow, -W * 0.22, baseH + matH, -D / 2 + pillowD / 2 + ftToWorld(0.2));
  _addBox(g, pillowW, H * 0.18, pillowD, _FURN.pillow,  W * 0.22, baseH + matH, -D / 2 + pillowD / 2 + ftToWorld(0.2));
  // Comforter accent on the foot
  _addBox(g, W * 0.95, H * 0.04, D * 0.35, body, 0, baseH + matH, D * 0.3);
  return g;
}

function _buildDresserGroup(W, H, D, body) {
  const g = new THREE.Group();
  // Body
  _addBox(g, W, H, D, body, 0, 0, 0);
  // 3 drawer faces — slightly inset on +Z (front)
  const drawerD = ftToWorld(0.05);
  const drawerH = H / 3 * 0.85;
  for (let i = 0; i < 3; i++) {
    const dy = i * (H / 3) + H / 6 - drawerH / 2;
    _addBox(g, W * 0.92, drawerH, drawerD, _FURN.woodLt, 0, dy, D / 2 + drawerD / 2 - drawerD * 0.4);
    // Two knobs per drawer
    _addCyl(g, ftToWorld(0.08), ftToWorld(0.1), _FURN.knob, -W * 0.18, dy + drawerH / 2, D / 2 + drawerD * 0.6, 8, "z");
    _addCyl(g, ftToWorld(0.08), ftToWorld(0.1), _FURN.knob,  W * 0.18, dy + drawerH / 2, D / 2 + drawerD * 0.6, 8, "z");
  }
  return g;
}

function _buildOvenGroup(W, H, D, body) {
  const g = new THREE.Group();
  // Body
  _addBox(g, W, H, D, body, 0, 0, 0);
  // Door (darker face on +Z)
  _addBox(g, W * 0.9, H * 0.62, ftToWorld(0.05), _FURN.shroud, 0, H * 0.06, D / 2 + ftToWorld(0.02));
  // Handle (horizontal bar across door)
  _addCyl(g, ftToWorld(0.06), W * 0.85, _FURN.chrome, 0, H * 0.62, D / 2 + ftToWorld(0.07), 10, "x");
  // Control panel knobs along top of door
  const knobY = H * 0.86;
  for (let i = 0; i < 4; i++) {
    const kx = -W * 0.3 + i * (W * 0.2);
    _addCyl(g, ftToWorld(0.07), ftToWorld(0.08), _FURN.chrome, kx, knobY, D / 2 + ftToWorld(0.04), 12, "z");
  }
  return g;
}

function _buildFridgeGroup(W, H, D, body) {
  const g = new THREE.Group();
  _addBox(g, W, H, D, body, 0, 0, 0);
  // Door split — thin dark vertical seam at +Z face (top compartment break)
  _addBox(g, W, ftToWorld(0.05), ftToWorld(0.05), _FURN.shroud, 0, H * 0.66, D / 2 + ftToWorld(0.005));
  // Two vertical handles (one per door)
  _addCyl(g, ftToWorld(0.05), H * 0.55, _FURN.chrome, -W * 0.42, H * 0.08, D / 2 + ftToWorld(0.04), 10);
  _addCyl(g, ftToWorld(0.05), H * 0.28, _FURN.chrome, -W * 0.42, H * 0.7,  D / 2 + ftToWorld(0.04), 10);
  return g;
}

function _buildToiletGroup(W, H, D, body) {
  const g = new THREE.Group();
  // Bowl — short box at +Z half
  const bowlH = H * 0.5;
  _addBox(g, W * 0.7, bowlH, D * 0.65, body, 0, 0, D * 0.1);
  // Seat lid
  _addBox(g, W * 0.78, ftToWorld(0.04), D * 0.7, _FURN.ceramic, 0, bowlH, D * 0.1);
  // Tank at −Z
  _addBox(g, W * 0.85, H * 0.78, D * 0.32, body, 0, 0, -D * 0.32);
  // Flush button
  _addBox(g, W * 0.12, ftToWorld(0.02), D * 0.04, _FURN.chrome, 0, H * 0.78, -D * 0.32);
  return g;
}

function _buildShowerGroup(W, H, D, body) {
  const g = new THREE.Group();
  const wall = ftToWorld(0.08);
  // Floor pan
  _addBox(g, W, ftToWorld(0.12), D, _FURN.ceramic, 0, 0, 0);
  // Back wall (-Z)
  _addBox(g, W, H, wall, body, 0, 0, -D / 2 + wall / 2);
  // Side walls
  _addBox(g, wall, H, D, body, -W / 2 + wall / 2, 0, 0);
  _addBox(g, wall, H, D, body,  W / 2 - wall / 2, 0, 0);
  // Front glass door (+Z), partial coverage so you can see in
  _addBox(g, W - wall * 2, H * 0.92, wall * 0.6, _FURN.glass, 0, 0, D / 2 - wall * 0.3);
  // Showerhead on back wall, top
  _addCyl(g, ftToWorld(0.18), ftToWorld(0.05), _FURN.chrome, 0, H * 0.85, -D / 2 + wall + ftToWorld(0.05), 16);
  _addCyl(g, ftToWorld(0.04), ftToWorld(0.4), _FURN.chrome, 0, H * 0.65, -D / 2 + wall + ftToWorld(0.02), 10, "z");
  return g;
}

function _buildTableGroup(W, H, D, body) {
  const g = new THREE.Group();
  const topH = ftToWorld(0.12);
  const legW = ftToWorld(0.18);
  const legH = H - topH;
  // Tabletop
  _addBox(g, W, topH, D, body, 0, legH, 0);
  // Four legs at corners (inset by leg width so they sit visibly under the top)
  const lx = W / 2 - legW * 1.6;
  const lz = D / 2 - legW * 1.6;
  _addBox(g, legW, legH, legW, _FURN.wood, -lx, 0, -lz);
  _addBox(g, legW, legH, legW, _FURN.wood,  lx, 0, -lz);
  _addBox(g, legW, legH, legW, _FURN.wood, -lx, 0,  lz);
  _addBox(g, legW, legH, legW, _FURN.wood,  lx, 0,  lz);
  return g;
}

function _buildLaundryGroup(W, H, D, body) {
  const g = new THREE.Group();
  // Body
  _addBox(g, W, H * 0.92, D, body, 0, 0, 0);
  // Top control panel (slight overhang)
  _addBox(g, W, H * 0.08, D, _FURN.shroud, 0, H * 0.92, 0);
  // Circular front door — recessed dark ring + lighter glass disc
  const r = Math.min(W, H * 0.92) * 0.34;
  _addCyl(g, r * 1.05, ftToWorld(0.05), _FURN.shroud, 0, H * 0.42, D / 2 + ftToWorld(0.005), 24, "z");
  _addCyl(g, r,        ftToWorld(0.07), _FURN.glass,  0, H * 0.42, D / 2 + ftToWorld(0.04), 24, "z");
  // Two knobs on the control panel
  _addCyl(g, ftToWorld(0.08), ftToWorld(0.06), _FURN.chrome, -W * 0.28, H * 0.96, D / 2 + ftToWorld(0.005), 12, "z");
  _addCyl(g, ftToWorld(0.08), ftToWorld(0.06), _FURN.chrome,  W * 0.28, H * 0.96, D / 2 + ftToWorld(0.005), 12, "z");
  return g;
}

function _buildStairGroup(W, H, D, body) {
  const g = new THREE.Group();
  // Step stack — 8 risers along +Z
  const steps = 8;
  const stepH = H / steps;
  const stepD = D / steps;
  for (let i = 0; i < steps; i++) {
    _addBox(g, W * 0.95, stepH, D - stepD * i, body, 0, i * stepH, -D / 2 + (D - stepD * i) / 2);
  }
  return g;
}

function _buildFurnitureMesh(item, def) {
  const W = ftToWorld(item.w);
  const D = ftToWorld(item.h);
  const H = ftToWorld(def.heightFt);
  const color = item.customColor || def.color;
  const metal = (item.type === "fridge" || item.type === "oven") ? 0.4 : 0.05;
  const body = _bodyMat(color, metal);
  switch (item.type) {
    case "sofa":    return _buildSofaGroup(W, H, D, body);
    case "tv":      return _buildTvGroup(W, H, D, body);
    case "bed":     return _buildBedGroup(W, H, D, body);
    case "dresser": return _buildDresserGroup(W, H, D, body);
    case "oven":    return _buildOvenGroup(W, H, D, body);
    case "fridge":  return _buildFridgeGroup(W, H, D, body);
    case "toilet":  return _buildToiletGroup(W, H, D, body);
    case "shower":  return _buildShowerGroup(W, H, D, body);
    case "table":   return _buildTableGroup(W, H, D, body);
    case "washer":
    case "dryer":   return _buildLaundryGroup(W, H, D, body);
    case "stair":   return _buildStairGroup(W, H, D, body);
    default: {
      // Unknown / custom block — fall back to a single body box.
      const g = new THREE.Group();
      _addBox(g, W, H, D, body, 0, 0, 0);
      return g;
    }
  }
}

function buildFurniture(plan, center) {
  const placed = plan.placed_items || plan.placedItems || [];
  if (!placed || placed.length === 0) return [];

  const meshes = [];
  placed.forEach((item, i) => {
    if (!item || item.isRoom) return;
    if (STRUCTURAL_PLACED_TYPES.has(item.type)) return;
    if (!(item.w > 0) || !(item.h > 0)) return;

    const def = FURNITURE_DEFAULTS[item.type] || FURNITURE_DEFAULTS._default;
    const group = _buildFurnitureMesh(item, def);

    const cxPlan = item.x + item.w / 2;
    const cyPlan = item.y + item.h / 2;
    group.position.set(
      ftToWorld(cxPlan - center.cx),
      SLAB_H,
      -ftToWorld(cyPlan - center.cy),
    );

    meshes.push({ mesh: group, name: `furniture-${item.type}-${i}`, layer: "furniture" });
  });

  return meshes;
}

// ── Stairs ───────────────────────────────────────────────────────────────────
// Stair rooms come from `placeStairs()` in FloorPlanEditor — they live in
// `plan.rooms[]` with `isStair: true`.  classifyWalls() treats them like any
// other room and emits interior wall segments around their perimeter, which
// in 3D would render as a hollow box around the stair.  `_isStairPerimeterSegment`
// lets the wall builders filter those segments out so the stair area stays
// open to the rooms it was carved from.
function _isStairPerimeterSegment(seg, stairs) {
  if (!stairs.length) return false;
  const eps = 0.05;
  for (const s of stairs) {
    const sx2 = s.x + s.w, sy2 = s.y + s.h;
    if (seg.axis === "h") {
      // Horizontal segment at y=seg.at, spanning [seg.from, seg.to] in x
      const onTopOrBottom = Math.abs(seg.at - s.y) < eps || Math.abs(seg.at - sy2) < eps;
      if (onTopOrBottom && seg.from < sx2 - eps && seg.to > s.x + eps) return true;
    } else {
      const onLeftOrRight = Math.abs(seg.at - s.x) < eps || Math.abs(seg.at - sx2) < eps;
      if (onLeftOrRight && seg.from < sy2 - eps && seg.to > s.y + eps) return true;
    }
  }
  return false;
}

// Render the actual ascending stair geometry (8 risers stepping up along +Z)
// for every stair room.  Lower stories only — upper-floor "stairs" are just
// the landing aligned with floor 1's stair coords; their geometry already lives
// on floor 1.
function buildStairsFromRooms(plan, center, isLowerStory) {
  if (!isLowerStory) return [];
  const meshes = [];
  (plan.rooms || []).forEach((room, i) => {
    if (room.type !== "stair" && !room.isStair) return;
    if (!(room.w > 0) || !(room.h > 0)) return;
    const W = ftToWorld(room.w);
    const D = ftToWorld(room.h);
    const H = ftToWorld(3.0); // total rise from one floor to the next
    const body = _bodyMat("#a8835a", 0.05);
    const group = _buildStairGroup(W, H, D, body);
    const cxPlan = room.x + room.w / 2;
    const cyPlan = room.y + room.h / 2;
    group.position.set(
      ftToWorld(cxPlan - center.cx),
      SLAB_H,
      -ftToWorld(cyPlan - center.cy),
    );
    meshes.push({ mesh: group, name: `stair-${i}`, layer: "stair" });
  });
  return meshes;
}

// ── Partial roof (flat) for multi-story uncovered areas ──────────────────────
// When the upper story doesn't fully cover the lower one, the exposed parts of
// the lower ceiling need a roof. A thin flat slab sitting on top of the lower
// walls does the job — simple and reads correctly at demo zoom levels.
function buildPartialRoofs(rects, center, overhang = 0.15) {
  if (!rects || rects.length === 0) return [];
  const thickness = 0.03;
  const baseY = SLAB_H + WALL_H; // top of lower-story walls
  const meshes = [];
  rects.forEach((rect, i) => {
    if (rect.w <= 0 || rect.h <= 0) return;
    const geo = new THREE.BoxGeometry(
      ftToWorld(rect.w) + overhang * 2,
      thickness,
      ftToWorld(rect.h) + overhang * 2,
    );
    const mesh = new THREE.Mesh(geo, mat.roof);
    const cxPlan = rect.x + rect.w / 2;
    const cyPlan = rect.y + rect.h / 2;
    mesh.position.set(
      ftToWorld(cxPlan - center.cx),
      baseY + thickness / 2,
      -ftToWorld(cyPlan - center.cy),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push({ mesh, name: `partial-roof-${i}`, layer: "roof" });
  });
  return meshes;
}

// ── Main export ──────────────────────────────────────────────────────────────
// Vertical offset between stories in world units — matches the wall height.
// Story N is rendered at y = N * STORY_HEIGHT_WORLD by PlanHouse.
export const STORY_HEIGHT_WORLD = WALL_H;

/**
 * Build all Three.js geometry from a validated floor plan.
 * Returns an array of { mesh: THREE.Mesh|Group, name: string, layer: string }.
 *
 * Options (used by multi-story rendering):
 *   includeFoundation — set false on stories above 1 (they sit on lower walls).
 *   includeRoof       — set false on every story except the topmost.
 *   partialRoofRects  — rectangles (in plan coords) where a flat roof should be
 *                       emitted on top of this story's walls. Used on a lower
 *                       story for areas NOT covered by the story above.
 *   sharedCenter      — override the computed plan center. Passed in by
 *                       PlanHouse so every story shares the same origin and
 *                       story-2 sits in its real plan position (not re-centered
 *                       on story-2's own rooms).
 */
export function buildHouseGeometry(plan, options = {}) {
  const {
    includeFoundation = true,
    includeRoof = true,
    partialRoofRects = null,
    sharedCenter = null,
    wallColor = null,
    roofColor = null,
    pillars = null,       // PillarPlacement[] from structuralSupport
    showPillars = true,
  } = options;
  const center = sharedCenter || computeCenter(plan.rooms);

  // Style config drives roof type, overhang, pitch, porch/canopy presence,
  // and material palette.  Falls back to a sensible default (Ranch) if the
  // plan's style string isn't in the registry.
  const styleConfig = getStyleConfig(plan.style);

  // Materials are module-level singletons for PBR texture reuse.  We mutate
  // their colors/roughness here based on the active style.  User-supplied
  // wallColor/roofColor (from the 3D preview swatches) take precedence so
  // the UI color pickers still work on top of the style palette.
  mat.exteriorWall.color.set(wallColor || styleConfig.materials.wallColor);
  mat.exteriorWall.roughness = styleConfig.wallRoughness;
  mat.roof.color.set(roofColor || styleConfig.materials.roofColor);
  mat.roof.roughness = styleConfig.roofRoughness;
  mat.roof.metalness = styleConfig.roofMetalness;
  mat.windowFrame.color.set(styleConfig.materials.windowFrameColor);
  mat.doorFrame.color.set(styleConfig.materials.doorFrameColor);

  // Dispatch the roof by the style's roofType.  Unknown types fall through
  // to gable so the scene never goes roofless.
  let roofMeshes = [];
  if (includeRoof) {
    if (styleConfig.roofType === "flat") {
      roofMeshes = buildFlatRoof(plan, center, styleConfig.roofOverhang);
    } else if (styleConfig.roofType === "hip") {
      roofMeshes = buildHipRoof(plan, center, styleConfig.roofOverhang, styleConfig.roofPitch);
    } else {
      roofMeshes = buildRoof(plan, center, styleConfig.roofOverhang, styleConfig.roofPitch);
    }
  }

  // Porch and entry canopy live at ground level, so they only emit on the
  // story that has the foundation (story 0 in multi-story builds).
  const porchMeshes = includeFoundation
    ? buildPorch(plan, center, styleConfig.porchDepthFt)
    : [];
  const canopyMeshes = includeFoundation
    ? buildEntryCanopy(plan, center, styleConfig.entryCanopy)
    : [];
  // Structural pillars also sit at ground level (same gate as foundation).
  const pillarMeshes = (includeFoundation && showPillars && pillars && pillars.length > 0)
    ? buildPillars(pillars, center)
    : [];

  return [
    ...(includeFoundation ? buildDriveway(plan, center) : []),
    ...(includeFoundation ? buildFoundation(plan, center) : []),
    ...buildFloors(plan, center),
    ...buildExteriorWalls(plan, center),
    ...buildInteriorWalls(plan, center),
    ...buildWindowFrames(plan, center),
    ...buildDoorFrames(plan, center),
    ...roofMeshes,
    ...(partialRoofRects ? buildPartialRoofs(partialRoofRects, center) : []),
    ...porchMeshes,
    ...canopyMeshes,
    ...pillarMeshes,
    ...buildFurniture(plan, center),
    // Stair geometry only goes on the story that has the foundation (story 0)
    // — it ascends from there to the next story.  Upper stories receive a
    // flat landing implicit in the bonus-room slab, no extra stair geometry
    // needed there.
    ...buildStairsFromRooms(plan, center, includeFoundation),
  ];
}

/**
 * Given two sets of rooms (a lower story and an upper story), compute the
 * rectangles on the lower story that are NOT covered by the upper — these
 * need a flat roof. Exposed here so PlanHouse can pass it as an option.
 */
export function computeUncoveredByUpperStory(lowerRooms, upperRooms) {
  const lowerRects = decomposeFootprintRects(lowerRooms || []);
  const upperRects = decomposeFootprintRects(upperRooms || []);
  if (upperRects.length === 0) return lowerRects;
  return rectSetDifference(lowerRects, upperRects);
}

/**
 * Shared center across multiple stories' rooms — so every story uses the same
 * origin in 3D and an upper story that's smaller/offset stays in its actual
 * plan position relative to the lower story.
 */
export function computeSharedCenter(stories) {
  const allRooms = (stories || []).flatMap((s) => (s && s.rooms) || []);
  if (allRooms.length === 0) return null;
  return computeCenter(allRooms);
}

/**
 * Dispose per-instance geometry to prevent GPU memory leaks.
 *
 * Materials are module-level singletons (shared by every story, every render)
 * so we intentionally do NOT dispose them here — doing so would break the
 * textures on subsequent renders (story 2 would lose its plaster/roof maps
 * after story 1 is torn down on re-render). The shared materials live for
 * the lifetime of the module.
 */
export function disposeHouseGeometry(items) {
  items.forEach(({ mesh }) => {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.children) {
      mesh.children.forEach((child) => {
        if (child.geometry) child.geometry.dispose();
      });
    }
  });
}
