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
import { classifyWalls, findWallForOpening, decomposeFootprintRects, edgeSharing } from "./planGeometry";

const S = 0.1;          // feet → world units
const WALL_THICK = 0.065; // 0.65 ft ≈ 8" in world units
const WALL_H = 0.9;     // 9 ft story height in world units
const SLAB_H = 0.04;    // 0.4 ft slab

// ── Materials ────────────────────────────────────────────────────────────────
const mat = {
  exteriorWall: new THREE.MeshStandardMaterial({
    color: "#F5F0E8", roughness: 0.85, metalness: 0.0,
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
  roof: new THREE.MeshStandardMaterial({
    color: "#3A3A3A", roughness: 0.8, metalness: 0.1,
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
let _texturesLoaded = false;
function loadMaterialTexturesOnce() {
  if (_texturesLoaded) return;
  _texturesLoaded = true;
  const pairs = [
    ["exteriorWall", mat.exteriorWall],
    ["floor", mat.floor],
    ["slab", mat.slab],
    ["roof", mat.roof],
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
  const { interior } = classifyWalls(plan.rooms);
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
function buildGableOverRect(rect, center, overhang, ridgeAlongX, extensions, ridgeHOverride, idx) {
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
  const naturalRidgeH = ftToWorld(shortDimFt) / 2 * (5 / 12) * 2;
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
function computeNaturalRidgeH(rect, ridgeAlongX) {
  const shortDimFt = ridgeAlongX ? rect.h : rect.w;
  return ftToWorld(shortDimFt) / 2 * (5 / 12) * 2;
}

function buildRoof(plan, center) {
  const overhang = 0.15; // world units
  const rects = decomposeFootprintRects(plan.rooms);
  if (rects.length === 0) return [];

  const metas = rects.map(rect => {
    const shares = edgeSharing(rect, rects);
    const ridgeAlongX = pickRidgeAlongX(rect, shares);
    const naturalRidgeAlongX = rect.w >= rect.h;
    const rotated = ridgeAlongX !== naturalRidgeAlongX;
    const ridgeH = computeNaturalRidgeH(rect, ridgeAlongX);
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
      meta.rect, center, overhang, meta.ridgeAlongX, null, ridgeH, idx
    );
  });
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
// Renders items the user dropped on the 2D canvas as simple 3D boxes inside
// the house. Rooms / openings are filtered out — they're already built as
// structural geometry above.
//
// Heights and default colors per item type (matches the 2D catalog palette).
const FURNITURE_DEFAULTS = {
  sofa:    { heightFt: 2.8, color: "#6b7f9c" },
  tv:      { heightFt: 3.5, color: "#1a1a1a" },
  bed:     { heightFt: 2.2, color: "#c8a574" },
  dresser: { heightFt: 3.8, color: "#8a6a48" },
  oven:    { heightFt: 3.0, color: "#2a2a2a" },
  fridge:  { heightFt: 5.8, color: "#c0c4c8" },
  toilet:  { heightFt: 2.6, color: "#f4f4f4" },
  shower:  { heightFt: 6.8, color: "#c8d2dc" },
  washer:  { heightFt: 3.0, color: "#e8e8e8" },
  dryer:   { heightFt: 3.0, color: "#d8d8d8" },
  table:   { heightFt: 2.5, color: "#8a6a48" },
  stair:   { heightFt: 3.0, color: "#8a6a48" },
  // generic fallback for unknown / custom types
  _default:{ heightFt: 2.5, color: "#9a8a7a" },
};

// Types that are structural / already rendered by the builders above.
const STRUCTURAL_PLACED_TYPES = new Set([
  "door", "window", "glazing", "garage", "wall",
]);

function buildFurniture(plan, center) {
  const placed = plan.placed_items || plan.placedItems || [];
  if (!placed || placed.length === 0) return [];

  const meshes = [];
  placed.forEach((item, i) => {
    if (!item || item.isRoom) return;
    if (STRUCTURAL_PLACED_TYPES.has(item.type)) return;
    if (!(item.w > 0) || !(item.h > 0)) return;

    const def = FURNITURE_DEFAULTS[item.type] || FURNITURE_DEFAULTS._default;
    const heightWorld = ftToWorld(def.heightFt);
    const color = item.customColor || def.color;

    const geo = new THREE.BoxGeometry(
      ftToWorld(item.w),
      heightWorld,
      ftToWorld(item.h),
    );
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      metalness: item.type === "fridge" || item.type === "oven" ? 0.4 : 0.05,
    });
    const mesh = new THREE.Mesh(geo, material);

    const cxPlan = item.x + item.w / 2;
    const cyPlan = item.y + item.h / 2;
    mesh.position.set(
      ftToWorld(cxPlan - center.cx),
      SLAB_H + heightWorld / 2,
      -ftToWorld(cyPlan - center.cy),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    meshes.push({ mesh, name: `furniture-${item.type}-${i}`, layer: "furniture" });
  });

  return meshes;
}

// ── Main export ──────────────────────────────────────────────────────────────
/**
 * Build all Three.js geometry from a validated floor plan.
 * Returns an array of { mesh: THREE.Mesh|Group, name: string, layer: string }.
 */
export function buildHouseGeometry(plan) {
  const center = computeCenter(plan.rooms);

  return [
    ...buildFoundation(plan, center),
    ...buildFloors(plan, center),
    ...buildExteriorWalls(plan, center),
    ...buildInteriorWalls(plan, center),
    ...buildWindowFrames(plan, center),
    ...buildDoorFrames(plan, center),
    ...buildRoof(plan, center),
    ...buildFurniture(plan, center),
  ];
}

/**
 * Dispose all geometry + materials to prevent memory leaks.
 */
export function disposeHouseGeometry(items) {
  items.forEach(({ mesh }) => {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
      else mesh.material.dispose();
    }
    // Dispose children for groups
    if (mesh.children) {
      mesh.children.forEach(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
  });
}
