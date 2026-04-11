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
};

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

// ── Build exterior walls ─────────────────────────────────────────────────────
function buildExteriorWalls(plan, center) {
  const meshes = [];
  const { minX, maxX, minY, maxY, w, h } = center;
  const ww = ftToWorld(w);
  const wh = ftToWorld(h);
  const thick = WALL_THICK;

  // Four perimeter walls
  const walls = [
    { // front (bottom edge, y=maxY → -z)
      geo: new THREE.BoxGeometry(ww + thick * 2, WALL_H, thick),
      pos: [0, SLAB_H + WALL_H / 2, -ftToWorld(h / 2)],
    },
    { // back (top edge, y=minY → +z)
      geo: new THREE.BoxGeometry(ww + thick * 2, WALL_H, thick),
      pos: [0, SLAB_H + WALL_H / 2, ftToWorld(h / 2)],
    },
    { // left
      geo: new THREE.BoxGeometry(thick, WALL_H, wh),
      pos: [-ftToWorld(w / 2), SLAB_H + WALL_H / 2, 0],
    },
    { // right
      geo: new THREE.BoxGeometry(thick, WALL_H, wh),
      pos: [ftToWorld(w / 2), SLAB_H + WALL_H / 2, 0],
    },
  ];

  walls.forEach(({ geo, pos }, i) => {
    const mesh = new THREE.Mesh(geo, mat.exteriorWall);
    mesh.position.set(...pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push({ mesh, name: `ext-wall-${i}`, layer: "exterior" });
  });

  return meshes;
}

// ── Build interior walls ─────────────────────────────────────────────────────
function buildInteriorWalls(plan, center) {
  const meshes = [];
  const { minX, maxX, minY, maxY } = center;
  const tolerance = 0.5; // ft — edge must be within this to be exterior

  plan.rooms.forEach((room, ri) => {
    const edges = [
      { side: "top",    cx: room.x + room.w / 2, cy: room.y,           len: room.w, horiz: true },
      { side: "bottom", cx: room.x + room.w / 2, cy: room.y + room.h,  len: room.w, horiz: true },
      { side: "left",   cx: room.x,              cy: room.y + room.h / 2, len: room.h, horiz: false },
      { side: "right",  cx: room.x + room.w,     cy: room.y + room.h / 2, len: room.h, horiz: false },
    ];

    edges.forEach(({ side, cx, cy, len, horiz }, ei) => {
      // Skip exterior edges
      const isExterior =
        (side === "top" && Math.abs(room.y - minY) < tolerance) ||
        (side === "bottom" && Math.abs(room.y + room.h - maxY) < tolerance) ||
        (side === "left" && Math.abs(room.x - minX) < tolerance) ||
        (side === "right" && Math.abs(room.x + room.w - maxX) < tolerance);
      if (isExterior) return;

      const wLen = ftToWorld(len);
      const geo = horiz
        ? new THREE.BoxGeometry(wLen, WALL_H * 0.95, WALL_THICK * 0.6)
        : new THREE.BoxGeometry(WALL_THICK * 0.6, WALL_H * 0.95, wLen);

      const mesh = new THREE.Mesh(geo, mat.interiorWall);
      const px = ftToWorld(cx - center.cx);
      const pz = -ftToWorld(cy - center.cy);
      mesh.position.set(px, SLAB_H + WALL_H * 0.95 / 2, pz);
      mesh.castShadow = true;
      meshes.push({ mesh, name: `int-wall-${ri}-${ei}`, layer: "interior" });
    });
  });

  return meshes;
}

// ── Build window frames ──────────────────────────────────────────────────────
function buildWindowFrames(plan, center) {
  const meshes = [];
  const { w, h } = center;
  const halfW = ftToWorld(w / 2);
  const halfH = ftToWorld(h / 2);
  const t = 0.02; // frame beam thickness

  plan.windows.forEach((win, i) => {
    const isSide = win.side === "left" || win.side === "right";
    const ww = ftToWorld(win.width);
    const wh = ftToWorld(win.height || 4);
    const sill = ftToWorld(win.sillHeight || 3);
    const yCenter = SLAB_H + sill + wh / 2;

    // Position on wall face
    let px, pz;
    if (win.side === "bottom") {
      px = ftToWorld(win.x - center.cx);
      pz = -halfH;
    } else if (win.side === "top") {
      px = ftToWorld(win.x - center.cx);
      pz = halfH;
    } else if (win.side === "left") {
      px = -halfW;
      pz = -ftToWorld(win.y - center.cy);
    } else {
      px = halfW;
      pz = -ftToWorld(win.y - center.cy);
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

    meshes.push({ mesh: group, name: `window-frame-${i}`, layer: "openings" });
  });

  return meshes;
}

// ── Build door frames ────────────────────────────────────────────────────────
function buildDoorFrames(plan, center) {
  const meshes = [];
  const { w, h } = center;
  const halfW = ftToWorld(w / 2);
  const halfH = ftToWorld(h / 2);
  const t = 0.025;

  plan.doors.forEach((door, i) => {
    const isSide = door.side === "left" || door.side === "right";
    const dw = ftToWorld(door.width);
    const dh = ftToWorld(door.height || 7);
    const yCenter = SLAB_H + dh / 2;

    let px, pz;
    if (door.side === "bottom") {
      px = ftToWorld(door.x - center.cx);
      pz = -halfH;
    } else if (door.side === "top") {
      px = ftToWorld(door.x - center.cx);
      pz = halfH;
    } else if (door.side === "left") {
      px = -halfW;
      pz = -ftToWorld(door.y - center.cy);
    } else {
      px = halfW;
      pz = -ftToWorld(door.y - center.cy);
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
function buildRoof(plan, center) {
  const ow = 0.15; // overhang in world units
  const rw = ftToWorld(center.w) / 2 + ow;
  const rd = ftToWorld(center.h) / 2 + ow;
  const ridgeH = ftToWorld(center.w) * 0.22; // ~25 degree pitch
  const baseY = SLAB_H + WALL_H;

  // Ridge runs along Z (depth axis) — slopes down on X sides
  const vertices = new Float32Array([
    // Front face
    -rw, 0, rd,   rw, 0, rd,   0, ridgeH, rd,
    // Back face
    rw, 0, -rd,   -rw, 0, -rd,   0, ridgeH, -rd,
    // Left slope
    -rw, 0, rd,   0, ridgeH, rd,   0, ridgeH, -rd,
    -rw, 0, rd,   0, ridgeH, -rd,  -rw, 0, -rd,
    // Right slope
    rw, 0, rd,    rw, 0, -rd,     0, ridgeH, -rd,
    rw, 0, rd,    0, ridgeH, -rd,  0, ridgeH, rd,
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, mat.roof);
  mesh.position.set(0, baseY, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return [{ mesh, name: "roof", layer: "roof" }];
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
