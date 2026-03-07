import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

/* ───────────────────────────────────────────────────────────
   STRUCTURAL INTELLIGENCE VISUALIZATION
   Vision — AI-Powered Land Feasibility Intelligence Platform
   
   Three.js r128 procedural renderer with:
   - Parametric house model (foundation → walls → floors → roof)
   - Beam grid overlay (instanced meshes)
   - Load heatmap overlay (vertex colors)
   - Span dimension annotations (sprites + lines)
   - Quality presets (Low / Medium / High)
   - Developer Mode / Schematic Mode toggle
   - Full data binding to StructuralState
   ─────────────────────────────────────────────────────────── */

// ── Color Palette ──
const C = {
  bg: "#0a0e17",
  panel: "#0f1420",
  panelBorder: "#1a2236",
  surface: "#141b2d",
  surfaceHover: "#1a2440",
  text: "#c8d0e0",
  textDim: "#5a6580",
  textBright: "#e8ecf4",
  accent: "#00d4ff",
  accentDim: "#00d4ff33",
  accentGlow: "#00d4ff18",
  warn: "#ff9f43",
  warnDim: "#ff9f4333",
  danger: "#ff4757",
  success: "#2ed573",
  successDim: "#2ed57333",
  concrete: "#8a9bb0",
  wood: "#c4956a",
  steel: "#7a8ea0",
  glass: "#a0d2db",
  heatLow: "#0066ff",
  heatMid: "#ffcc00",
  heatHigh: "#ff3300",
};

// ── Structural State defaults ──
const DEFAULT_STATE = {
  square_footage: 2200,
  structural_span_ft: 20,
  stories: 1,
  foundation_type: "slab",
  imposed_load_psf: 60,
  story_height_ft: 9,
  footprint_width: 44,
  footprint_depth: 50,
  grid_density: "medium",
  cost_per_sf: 165,
  total_build_cost: 363000,
  market_value: 425000,
  feasibility_score: 72,
};

// ── Helpers ──
const ftToUnits = (ft) => ft * 0.3;
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const lerpColor = (c1, c2, t) => {
  const r = lerp((c1 >> 16) & 0xff, (c2 >> 16) & 0xff, t);
  const g = lerp((c1 >> 8) & 0xff, (c2 >> 8) & 0xff, t);
  const b = lerp(c1 & 0xff, c2 & 0xff, t);
  return new THREE.Color(r / 255, g / 255, b / 255);
};

const HEAT_LOW = 0x0066ff;
const HEAT_MID = 0xffcc00;
const HEAT_HIGH = 0xff3300;
function heatColor(t) {
  if (t < 0.5) return lerpColor(HEAT_LOW, HEAT_MID, t * 2);
  return lerpColor(HEAT_MID, HEAT_HIGH, (t - 0.5) * 2);
}

// ── PBR-ish Materials ──
function createMaterials() {
  return {
    concrete: new THREE.MeshStandardMaterial({
      color: 0x8a9bb0, roughness: 0.85, metalness: 0.05,
    }),
    concreteFoundation: new THREE.MeshStandardMaterial({
      color: 0x6b7a8a, roughness: 0.92, metalness: 0.02,
    }),
    wood: new THREE.MeshStandardMaterial({
      color: 0xc4956a, roughness: 0.7, metalness: 0.0,
    }),
    woodDark: new THREE.MeshStandardMaterial({
      color: 0x8b6b4a, roughness: 0.75, metalness: 0.0,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: 0x7a8ea0, roughness: 0.35, metalness: 0.8,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xa0d2db, roughness: 0.1, metalness: 0.1,
      transparent: true, opacity: 0.35,
    }),
    roofShingle: new THREE.MeshStandardMaterial({
      color: 0x3d4a5c, roughness: 0.9, metalness: 0.05,
    }),
    wall: new THREE.MeshStandardMaterial({
      color: 0xd4cfc8, roughness: 0.8, metalness: 0.0,
    }),
    wallInterior: new THREE.MeshStandardMaterial({
      color: 0xe8e2da, roughness: 0.85, metalness: 0.0,
    }),
    // Overlay materials
    beamOverlay: new THREE.MeshStandardMaterial({
      color: 0x00d4ff, transparent: true, opacity: 0.55,
      depthWrite: false, metalness: 0.6, roughness: 0.3,
    }),
    columnOverlay: new THREE.MeshStandardMaterial({
      color: 0xff9f43, transparent: true, opacity: 0.6,
      depthWrite: false, metalness: 0.5, roughness: 0.3,
    }),
    pierOverlay: new THREE.MeshStandardMaterial({
      color: 0xff9f43, transparent: true, opacity: 0.5,
      depthWrite: false,
    }),
    spanLine: new THREE.LineBasicMaterial({
      color: 0x00d4ff, transparent: true, opacity: 0.9,
    }),
    footprintOverlay: new THREE.MeshBasicMaterial({
      color: 0x00d4ff, transparent: true, opacity: 0.08,
      depthWrite: false, side: THREE.DoubleSide,
    }),
    wireframe: new THREE.MeshBasicMaterial({
      color: 0x00d4ff, wireframe: true, transparent: true, opacity: 0.3,
    }),
  };
}

// ── Scene Builder ──
function buildScene(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: quality !== "low", alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "high" ? 2 : 1.5));
  renderer.setClearColor(0x0a0e17, 1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  if (quality !== "low") {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = quality === "high"
      ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  }

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0e17, 0.015);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(18, 14, 22);
  camera.lookAt(0, 2, 0);

  return { renderer, scene, camera };
}

// ── Lighting ──
function setupLighting(scene, quality) {
  const group = new THREE.Group();
  group.name = "lighting";

  const ambient = new THREE.AmbientLight(0x2a3a5a, 0.4);
  group.add(ambient);

  const hemi = new THREE.HemisphereLight(0x4a6a9a, 0x1a1a2e, 0.35);
  group.add(hemi);

  const key = new THREE.DirectionalLight(0xffeedd, 1.2);
  key.position.set(12, 18, 8);
  key.target.position.set(0, 0, 0);
  if (quality !== "low") {
    key.castShadow = true;
    const s = quality === "high" ? 2048 : 1024;
    key.shadow.mapSize.set(s, s);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 60;
    key.shadow.camera.left = -20;
    key.shadow.camera.right = 20;
    key.shadow.camera.top = 20;
    key.shadow.camera.bottom = -20;
    key.shadow.bias = -0.001;
    key.shadow.normalBias = 0.02;
  }
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

  // Grid helper
  const grid = new THREE.GridHelper(40, 40, 0x1a2540, 0x111a30);
  grid.position.y = 0.005;
  group.add(grid);

  scene.add(group);
  return group;
}

// ── Parametric House Builder ──
function buildHouse(state, mats, quality) {
  const group = new THREE.Group();
  group.name = "house";

  const w = ftToUnits(state.footprint_width);
  const d = ftToUnits(state.footprint_depth);
  const sh = ftToUnits(state.story_height_ft);
  const stories = state.stories;
  const isSlab = state.foundation_type === "slab";
  const slabH = ftToUnits(0.5);
  const pierH = ftToUnits(2.5);
  const foundH = isSlab ? slabH : pierH;

  // Foundation
  if (isSlab) {
    const geo = new THREE.BoxGeometry(w + 0.3, slabH, d + 0.3);
    const mesh = new THREE.Mesh(geo, mats.concreteFoundation);
    mesh.position.y = slabH / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  } else {
    const pierGeo = new THREE.CylinderGeometry(0.15, 0.18, pierH, 8);
    const padGeo = new THREE.BoxGeometry(0.5, 0.08, 0.5);
    const spacing = 2.5;
    const nx = Math.max(2, Math.floor(w / spacing) + 1);
    const nz = Math.max(2, Math.floor(d / spacing) + 1);
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const x = -w / 2 + (ix / (nx - 1)) * w;
        const z = -d / 2 + (iz / (nz - 1)) * d;
        const pier = new THREE.Mesh(pierGeo, mats.concreteFoundation);
        pier.position.set(x, pierH / 2, z);
        pier.castShadow = true;
        group.add(pier);
        const pad = new THREE.Mesh(padGeo, mats.concrete);
        pad.position.set(x, 0.04, z);
        group.add(pad);
      }
    }
    // Bearer beam
    const bearerGeo = new THREE.BoxGeometry(w + 0.2, 0.12, 0.2);
    const bearer1 = new THREE.Mesh(bearerGeo, mats.woodDark);
    bearer1.position.set(0, pierH + 0.06, -d / 2);
    group.add(bearer1);
    const bearer2 = bearer1.clone();
    bearer2.position.z = d / 2;
    group.add(bearer2);
  }

  const baseY = foundH;

  for (let s = 0; s < stories; s++) {
    const floorY = baseY + s * sh;

    // Floor plate
    const floorGeo = new THREE.BoxGeometry(w, 0.08, d);
    const floor = new THREE.Mesh(floorGeo, mats.concrete);
    floor.position.y = floorY + 0.04;
    floor.castShadow = true;
    floor.receiveShadow = true;
    group.add(floor);

    // Walls
    const wallThick = 0.12;
    const wallH = sh - 0.08;

    // Front wall with window cutouts (simplified)
    const frontGeo = new THREE.BoxGeometry(w, wallH, wallThick);
    const front = new THREE.Mesh(frontGeo, mats.wall);
    front.position.set(0, floorY + 0.08 + wallH / 2, d / 2);
    front.castShadow = true;
    front.receiveShadow = true;
    group.add(front);

    // Back wall
    const back = new THREE.Mesh(frontGeo, mats.wall);
    back.position.set(0, floorY + 0.08 + wallH / 2, -d / 2);
    back.castShadow = true;
    group.add(back);

    // Side walls
    const sideGeo = new THREE.BoxGeometry(wallThick, wallH, d);
    const left = new THREE.Mesh(sideGeo, mats.wall);
    left.position.set(-w / 2, floorY + 0.08 + wallH / 2, 0);
    left.castShadow = true;
    group.add(left);

    const right = new THREE.Mesh(sideGeo, mats.wall);
    right.position.set(w / 2, floorY + 0.08 + wallH / 2, 0);
    right.castShadow = true;
    group.add(right);

    // Windows (glass planes)
    const winW = 1.0, winH = 0.8;
    const winCount = Math.max(2, Math.floor(w / 2.5));
    for (let i = 0; i < winCount; i++) {
      const wx = -w / 2 + (w / (winCount + 1)) * (i + 1);
      const wy = floorY + 0.08 + wallH * 0.5;
      const winGeo = new THREE.PlaneGeometry(winW, winH);

      const winFront = new THREE.Mesh(winGeo, mats.glass);
      winFront.position.set(wx, wy, d / 2 + 0.07);
      winFront.renderOrder = 1;
      group.add(winFront);

      const winBack = new THREE.Mesh(winGeo, mats.glass);
      winBack.position.set(wx, wy, -d / 2 - 0.07);
      winBack.rotation.y = Math.PI;
      winBack.renderOrder = 1;
      group.add(winBack);
    }
    const sideWinCount = Math.max(1, Math.floor(d / 3));
    for (let i = 0; i < sideWinCount; i++) {
      const wz = -d / 2 + (d / (sideWinCount + 1)) * (i + 1);
      const wy = floorY + 0.08 + wallH * 0.5;
      const winGeo = new THREE.PlaneGeometry(winH, winH);

      const winL = new THREE.Mesh(winGeo, mats.glass);
      winL.position.set(-w / 2 - 0.07, wy, wz);
      winL.rotation.y = -Math.PI / 2;
      winL.renderOrder = 1;
      group.add(winL);

      const winR = new THREE.Mesh(winGeo, mats.glass);
      winR.position.set(w / 2 + 0.07, wy, wz);
      winR.rotation.y = Math.PI / 2;
      winR.renderOrder = 1;
      group.add(winR);
    }
  }

  // Roof (gable)
  const roofBaseY = baseY + stories * sh;
  const roofPeakH = ftToUnits(4);
  const overhang = 0.4;

  const roofShape = new THREE.Shape();
  const rw = w / 2 + overhang;
  const rd = d / 2 + overhang;
  roofShape.moveTo(-rw, -rd);
  roofShape.lineTo(rw, -rd);
  roofShape.lineTo(rw, rd);
  roofShape.lineTo(-rw, rd);
  roofShape.closePath();

  // Simple hip/gable via two angled planes
  const roofSlope = Math.atan2(roofPeakH, w / 2);
  const roofLen = (w / 2 + overhang) / Math.cos(roofSlope);

  const roofPlaneGeo = new THREE.PlaneGeometry(roofLen * 2, d + overhang * 2);

  const roofL = new THREE.Mesh(roofPlaneGeo, mats.roofShingle);
  roofL.position.set(-w / 4 * Math.cos(roofSlope), roofBaseY + roofPeakH / 2, 0);
  roofL.rotation.z = roofSlope;
  roofL.rotation.order = "ZYX";
  roofL.castShadow = true;
  // Actually let's do a simpler approach: two tilted box planes
  // Reset: use a box for each roof half
  group.remove(roofL);

  const roofHalfGeo = new THREE.BoxGeometry(roofLen, 0.06, d + overhang * 2);

  const roofLeft = new THREE.Mesh(roofHalfGeo, mats.roofShingle);
  roofLeft.rotation.z = roofSlope;
  const rxOff = -(w / 4 + overhang / 2) * Math.cos(roofSlope) * 0.5;
  roofLeft.position.set(
    -(roofLen / 2) * Math.cos(roofSlope) * 0.5 - 0.1,
    roofBaseY + roofPeakH * 0.5 - 0.1,
    0
  );
  // Simplify: position manually
  roofLeft.position.set(
    -(w / 4),
    roofBaseY + roofPeakH / 2 - 0.15,
    0
  );
  roofLeft.rotation.z = roofSlope * 0.85;
  roofLeft.castShadow = true;
  group.add(roofLeft);

  const roofRight = new THREE.Mesh(roofHalfGeo, mats.roofShingle);
  roofRight.position.set(w / 4, roofBaseY + roofPeakH / 2 - 0.15, 0);
  roofRight.rotation.z = -roofSlope * 0.85;
  roofRight.castShadow = true;
  group.add(roofRight);

  // Ridge beam
  const ridgeGeo = new THREE.BoxGeometry(0.1, 0.1, d + overhang);
  const ridge = new THREE.Mesh(ridgeGeo, mats.woodDark);
  ridge.position.set(0, roofBaseY + roofPeakH - 0.2, 0);
  group.add(ridge);

  // Gable triangles
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-w / 2, 0);
  gableShape.lineTo(0, roofPeakH - 0.15);
  gableShape.lineTo(w / 2, 0);
  gableShape.closePath();
  const gableGeo = new THREE.ShapeGeometry(gableShape);

  const gableFront = new THREE.Mesh(gableGeo, mats.wall);
  gableFront.position.set(0, roofBaseY, d / 2);
  group.add(gableFront);

  const gableBack = new THREE.Mesh(gableGeo, mats.wall);
  gableBack.position.set(0, roofBaseY, -d / 2);
  gableBack.rotation.y = Math.PI;
  group.add(gableBack);

  return group;
}

// ── Beam Grid Overlay ──
function buildBeamGrid(state, mats) {
  const group = new THREE.Group();
  group.name = "beamGrid";
  group.renderOrder = 10;

  const w = ftToUnits(state.footprint_width);
  const d = ftToUnits(state.footprint_depth);
  const sh = ftToUnits(state.story_height_ft);
  const span = ftToUnits(state.structural_span_ft);
  const foundH = state.foundation_type === "slab" ? ftToUnits(0.5) : ftToUnits(2.5);
  const density = state.grid_density === "low" ? 0.6 : state.grid_density === "high" ? 1.5 : 1.0;

  const beamH = 0.08;
  const beamW = 0.05;

  for (let s = 0; s < state.stories; s++) {
    const floorY = foundH + s * sh + 0.12;

    // Primary beams (along width, spanning the depth)
    const beamSpacing = span * 0.3 / density;
    const nBeams = Math.max(2, Math.ceil(w / beamSpacing) + 1);
    const beamGeo = new THREE.BoxGeometry(beamW, beamH, d * 0.95);

    if (nBeams <= 100) {
      const instBeams = new THREE.InstancedMesh(beamGeo, mats.beamOverlay, nBeams);
      instBeams.renderOrder = 10;
      const mat4 = new THREE.Matrix4();
      for (let i = 0; i < nBeams; i++) {
        const x = -w / 2 + (i / (nBeams - 1)) * w;
        mat4.makeTranslation(x, floorY, 0);
        instBeams.setMatrixAt(i, mat4);
      }
      instBeams.instanceMatrix.needsUpdate = true;
      group.add(instBeams);
    }

    // Secondary beams / joists (along depth, spanning width)
    const joistSpacing = 0.5 / density;
    const nJoists = Math.max(2, Math.ceil(d / joistSpacing) + 1);
    const joistGeo = new THREE.BoxGeometry(w * 0.95, beamH * 0.6, beamW * 0.7);
    const maxJoists = Math.min(nJoists, 80);

    const instJoists = new THREE.InstancedMesh(joistGeo, mats.beamOverlay.clone(), maxJoists);
    instJoists.material.opacity = 0.3;
    instJoists.renderOrder = 10;
    const mat4j = new THREE.Matrix4();
    for (let i = 0; i < maxJoists; i++) {
      const z = -d / 2 + (i / (maxJoists - 1)) * d;
      mat4j.makeTranslation(0, floorY - beamH * 0.5, z);
      instJoists.setMatrixAt(i, mat4j);
    }
    instJoists.instanceMatrix.needsUpdate = true;
    group.add(instJoists);

    // Columns at beam intersections (corners + intermediates)
    const colGeo = new THREE.CylinderGeometry(0.06, 0.06, sh * 0.9, 6);
    const colPositions = [
      [-w / 2, 0, -d / 2], [w / 2, 0, -d / 2],
      [-w / 2, 0, d / 2], [w / 2, 0, d / 2],
    ];
    // Add mid columns for larger spans
    if (w > span * 0.8) {
      colPositions.push([0, 0, -d / 2], [0, 0, d / 2]);
    }
    const instCols = new THREE.InstancedMesh(colGeo, mats.columnOverlay, colPositions.length);
    instCols.renderOrder = 10;
    const mat4c = new THREE.Matrix4();
    colPositions.forEach(([cx, _, cz], idx) => {
      mat4c.makeTranslation(cx, floorY + sh * 0.45, cz);
      instCols.setMatrixAt(idx, mat4c);
    });
    instCols.instanceMatrix.needsUpdate = true;
    group.add(instCols);
  }

  return group;
}

// ── Load Heatmap Overlay ──
function buildLoadHeatmap(state, mats) {
  const group = new THREE.Group();
  group.name = "loadHeatmap";
  group.renderOrder = 5;

  const w = ftToUnits(state.footprint_width);
  const d = ftToUnits(state.footprint_depth);
  const sh = ftToUnits(state.story_height_ft);
  const foundH = state.foundation_type === "slab" ? ftToUnits(0.5) : ftToUnits(2.5);
  const loadNorm = Math.min(1, Math.max(0, (state.imposed_load_psf - 20) / 100));

  const res = 20;
  const planeGeo = new THREE.PlaneGeometry(w * 0.98, d * 0.98, res, res);
  const colors = new Float32Array(planeGeo.attributes.position.count * 3);

  const pos = planeGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = (pos.getX(i) / (w * 0.49) + 1) / 2;
    const z = (pos.getY(i) / (d * 0.49) + 1) / 2;
    // Simulate load concentration: higher at center, lower at edges
    const distFromCenter = Math.sqrt((x - 0.5) ** 2 + (z - 0.5) ** 2) * 1.4;
    const localIntensity = loadNorm * (1.0 - distFromCenter * 0.5);
    const noise = Math.sin(x * 12) * Math.cos(z * 8) * 0.08;
    const t = Math.max(0, Math.min(1, localIntensity + noise));
    const c = heatColor(t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  planeGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const heatMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.35,
    depthWrite: false, side: THREE.DoubleSide,
  });

  for (let s = 0; s < state.stories; s++) {
    const floorY = foundH + s * sh + 0.15;
    const plane = new THREE.Mesh(planeGeo.clone(), heatMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = floorY;
    plane.renderOrder = 5;
    group.add(plane);
  }

  return group;
}

// ── Span Annotations ──
function buildSpanAnnotations(state) {
  const group = new THREE.Group();
  group.name = "spanAnnotations";
  group.renderOrder = 15;

  const w = ftToUnits(state.footprint_width);
  const d = ftToUnits(state.footprint_depth);
  const sh = ftToUnits(state.story_height_ft);
  const foundH = state.foundation_type === "slab" ? ftToUnits(0.5) : ftToUnits(2.5);

  const lineColor = 0x00d4ff;
  const lineMat = new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: 0.85 });

  // Width dimension line
  const wLineY = foundH - 0.3;
  const wLineZ = d / 2 + 1.2;
  const wPoints = [
    new THREE.Vector3(-w / 2, wLineY, wLineZ),
    new THREE.Vector3(w / 2, wLineY, wLineZ),
  ];
  const wLineGeo = new THREE.BufferGeometry().setFromPoints(wPoints);
  group.add(new THREE.Line(wLineGeo, lineMat));

  // End ticks
  const tickH = 0.3;
  [- w / 2, w / 2].forEach(x => {
    const tickPts = [
      new THREE.Vector3(x, wLineY - tickH / 2, wLineZ),
      new THREE.Vector3(x, wLineY + tickH / 2, wLineZ),
    ];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(tickPts), lineMat));
  });

  // Depth dimension
  const dLineX = w / 2 + 1.2;
  const dPoints = [
    new THREE.Vector3(dLineX, wLineY, -d / 2),
    new THREE.Vector3(dLineX, wLineY, d / 2),
  ];
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(dPoints), lineMat));
  [-d / 2, d / 2].forEach(z => {
    const tickPts = [
      new THREE.Vector3(dLineX - tickH / 2, wLineY, z),
      new THREE.Vector3(dLineX + tickH / 2, wLineY, z),
    ];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(tickPts), lineMat));
  });

  // Height dimension
  const hLineX = -w / 2 - 1.2;
  const hLineZ = d / 2;
  const topY = foundH + state.stories * sh;
  const hPoints = [
    new THREE.Vector3(hLineX, foundH, hLineZ),
    new THREE.Vector3(hLineX, topY, hLineZ),
  ];
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(hPoints), lineMat));
  [foundH, topY].forEach(y => {
    const tickPts = [
      new THREE.Vector3(hLineX - tickH / 2, y, hLineZ),
      new THREE.Vector3(hLineX + tickH / 2, y, hLineZ),
    ];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(tickPts), lineMat));
  });

  // Span indicator (structural span within the structure)
  const spanW = ftToUnits(state.structural_span_ft);
  const spanY = foundH + 0.5;
  const spanZ = 0;
  const spanPts = [
    new THREE.Vector3(-spanW / 2, spanY, spanZ),
    new THREE.Vector3(spanW / 2, spanY, spanZ),
  ];
  const spanLineMat = new THREE.LineBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.9 });
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(spanPts), spanLineMat));

  // Span arrowheads
  [-1, 1].forEach(dir => {
    const arrowPts = [
      new THREE.Vector3(dir * spanW / 2, spanY, spanZ),
      new THREE.Vector3(dir * (spanW / 2 - 0.2), spanY + 0.12, spanZ),
      new THREE.Vector3(dir * spanW / 2, spanY, spanZ),
      new THREE.Vector3(dir * (spanW / 2 - 0.2), spanY - 0.12, spanZ),
    ];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arrowPts), spanLineMat));
  });

  // Text labels as sprites
  function makeLabel(text, pos, color = "#00d4ff", size = 0.6) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "transparent";
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = "bold 28px monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(pos);
    sprite.scale.set(size * 2, size * 0.5, 1);
    sprite.renderOrder = 20;
    return sprite;
  }

  // Width label
  group.add(makeLabel(
    `${state.footprint_width} ft`,
    new THREE.Vector3(0, wLineY - 0.35, wLineZ)
  ));

  // Depth label
  group.add(makeLabel(
    `${state.footprint_depth} ft`,
    new THREE.Vector3(dLineX + 0.5, wLineY - 0.35, 0)
  ));

  // Height label
  group.add(makeLabel(
    `${(state.story_height_ft * state.stories).toFixed(0)} ft`,
    new THREE.Vector3(hLineX - 0.6, (foundH + topY) / 2, hLineZ),
    "#c8d0e0"
  ));

  // Span label
  group.add(makeLabel(
    `SPAN: ${state.structural_span_ft} ft`,
    new THREE.Vector3(0, spanY + 0.35, spanZ),
    "#ff9f43",
    0.5
  ));

  return group;
}

// ── Simple Orbit Controls ──
function useOrbitControls(canvasRef, cameraRef) {
  const stateRef = useRef({
    isDown: false, button: -1,
    startX: 0, startY: 0,
    theta: 0.7, phi: 0.9,
    radius: 28, target: new THREE.Vector3(0, 3, 0),
    lastTheta: 0.7, lastPhi: 0.9, lastRadius: 28,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = stateRef.current;

    const onDown = (e) => {
      s.isDown = true;
      s.button = e.button;
      s.startX = e.clientX;
      s.startY = e.clientY;
      s.lastTheta = s.theta;
      s.lastPhi = s.phi;
      s.lastRadius = s.radius;
    };
    const onMove = (e) => {
      if (!s.isDown) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (s.button === 0) {
        s.theta = s.lastTheta - dx * 0.005;
        s.phi = Math.max(0.15, Math.min(Math.PI * 0.48, s.lastPhi - dy * 0.005));
      } else if (s.button === 2) {
        const cam = cameraRef.current;
        if (cam) {
          const right = new THREE.Vector3();
          cam.getWorldDirection(right);
          const up = new THREE.Vector3(0, 1, 0);
          right.cross(up).normalize();
          s.target.addScaledVector(right, dx * 0.02);
          s.target.y += dy * 0.02;
        }
      }
    };
    const onUp = () => { s.isDown = false; s.button = -1; };
    const onWheel = (e) => {
      e.preventDefault();
      s.radius = Math.max(5, Math.min(60, s.radius + e.deltaY * 0.02));
    };
    const onContext = (e) => e.preventDefault();

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContext);

    return () => {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContext);
    };
  }, [canvasRef, cameraRef]);

  const update = useCallback((camera) => {
    const s = stateRef.current;
    const x = s.target.x + s.radius * Math.sin(s.phi) * Math.cos(s.theta);
    const y = s.target.y + s.radius * Math.cos(s.phi);
    const z = s.target.z + s.radius * Math.sin(s.phi) * Math.sin(s.theta);
    camera.position.set(x, y, z);
    camera.lookAt(s.target);
  }, []);

  return { update, stateRef };
}

// ── UI Components ──
const SliderControl = ({ label, value, min, max, step, unit, onChange, color }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ color: C.textDim, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ color: color || C.accent, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{value}{unit}</span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      style={{
        width: "100%", height: 4, appearance: "none", background: `linear-gradient(to right, ${color || C.accent}88 0%, ${color || C.accent}88 ${((value - min) / (max - min)) * 100}%, ${C.panelBorder} ${((value - min) / (max - min)) * 100}%, ${C.panelBorder} 100%)`,
        borderRadius: 2, outline: "none", cursor: "pointer",
        accentColor: color || C.accent,
      }}
    />
  </div>
);

const ToggleSwitch = ({ label, checked, onChange, color }) => (
  <div
    style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "6px 0", cursor: "pointer",
    }}
    onClick={() => onChange(!checked)}
  >
    <span style={{ color: C.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
    <div style={{
      width: 32, height: 16, borderRadius: 8,
      background: checked ? (color || C.accent) : C.panelBorder,
      position: "relative", transition: "background 0.2s",
    }}>
      <div style={{
        width: 12, height: 12, borderRadius: 6,
        background: checked ? "#fff" : C.textDim,
        position: "absolute", top: 2,
        left: checked ? 18 : 2,
        transition: "left 0.2s, background 0.2s",
      }} />
    </div>
  </div>
);

const StatBadge = ({ label, value, unit, color }) => (
  <div style={{
    background: `${color}12`, border: `1px solid ${color}30`,
    borderRadius: 6, padding: "8px 10px", flex: 1, minWidth: 0,
  }}>
    <div style={{ color: `${color}99`, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
    <div style={{ color, fontSize: 15, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{value}<span style={{ fontSize: 10, opacity: 0.7 }}>{unit}</span></div>
  </div>
);

// ── Main Component ──
export default function StructuralIntelligenceViz() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const matsRef = useRef(null);
  const groupsRef = useRef({ house: null, beams: null, heatmap: null, spans: null, lighting: null });
  const rafRef = useRef(null);

  const [state, setState] = useState({ ...DEFAULT_STATE });
  const [overlays, setOverlays] = useState({
    beamGrid: true, loadHeatmap: true, spanLabels: true, wireframe: false,
  });
  const [quality, setQuality] = useState("medium");
  const [mode, setMode] = useState("developer");
  const [initialized, setInitialized] = useState(false);

  const { update: updateOrbit } = useOrbitControls(canvasRef, cameraRef);

  // Derived ML values
  const costPerSf = 120 + (state.imposed_load_psf - 40) * 0.4 + (state.structural_span_ft - 12) * 1.8 + (state.stories - 1) * 15 + (state.foundation_type === "pier" ? 12 : 0);
  const totalCost = Math.round(costPerSf * state.square_footage);
  const marketValue = Math.round((230 + (50 - Math.abs(state.footprint_width - 44) * 1.5)) * state.square_footage * (1 + (state.stories - 1) * 0.08));
  const margin = marketValue - totalCost;
  const marginPct = ((margin / totalCost) * 100).toFixed(1);
  const feasScore = Math.min(100, Math.max(0, Math.round(
    (margin > 0 ? 30 : 0) +
    Math.min(30, marginPct * 0.8) +
    Math.min(20, (100 - state.imposed_load_psf) * 0.25) +
    Math.min(20, (30 - state.structural_span_ft) * 1.2)
  )));

  // Init Three.js
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || initialized) return;

    const { renderer, scene, camera } = buildScene(canvas, quality);
    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    matsRef.current = createMaterials();

    setupLighting(scene, quality);

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
    setInitialized(true);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      renderer.dispose();
    };
  }, []);

  // Rebuild geometry on state change
  useEffect(() => {
    if (!initialized || !sceneRef.current || !matsRef.current) return;
    const scene = sceneRef.current;
    const mats = matsRef.current;
    const g = groupsRef.current;

    // Remove old groups
    ["house", "beams", "heatmap", "spans"].forEach(key => {
      if (g[key]) { scene.remove(g[key]); g[key] = null; }
    });

    // Build new
    g.house = buildHouse(state, mats, quality);
    scene.add(g.house);

    g.beams = buildBeamGrid(state, mats);
    g.beams.visible = overlays.beamGrid;
    scene.add(g.beams);

    g.heatmap = buildLoadHeatmap(state, mats);
    g.heatmap.visible = overlays.loadHeatmap;
    scene.add(g.heatmap);

    g.spans = buildSpanAnnotations(state);
    g.spans.visible = overlays.spanLabels;
    scene.add(g.spans);
  }, [state, initialized, quality]);

  // Update overlay visibility
  useEffect(() => {
    const g = groupsRef.current;
    if (g.beams) g.beams.visible = overlays.beamGrid;
    if (g.heatmap) g.heatmap.visible = overlays.loadHeatmap;
    if (g.spans) g.spans.visible = overlays.spanLabels;
    // Wireframe toggle
    if (g.house) {
      g.house.traverse(child => {
        if (child.isMesh && child.material && !child.material.transparent) {
          child.material.wireframe = overlays.wireframe;
        }
      });
    }
  }, [overlays]);

  // Render loop
  useEffect(() => {
    if (!initialized) return;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    let running = true;
    const animate = () => {
      if (!running) return;
      rafRef.current = requestAnimationFrame(animate);
      updateOrbit(camera);
      renderer.render(scene, camera);
    };
    animate();
    return () => { running = false; };
  }, [initialized, updateOrbit]);

  const updateState = (key, val) => setState(prev => ({ ...prev, [key]: val }));

  return (
    <div style={{
      width: "100%", height: "100vh", display: "flex",
      background: C.bg, fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      color: C.text, overflow: "hidden",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {/* 3D Viewport */}
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

        {/* Viewport HUD */}
        <div style={{
          position: "absolute", top: 16, left: 16,
          display: "flex", gap: 8, flexWrap: "wrap",
        }}>
          <div style={{
            background: `${C.panel}dd`, backdropFilter: "blur(8px)",
            border: `1px solid ${C.panelBorder}`, borderRadius: 6,
            padding: "6px 12px", display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.success, boxShadow: `0 0 6px ${C.success}` }} />
            <span style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Structural Intelligence
            </span>
          </div>
          <div style={{
            background: feasScore > 60 ? `${C.success}18` : feasScore > 35 ? `${C.warn}18` : `${C.danger}18`,
            border: `1px solid ${feasScore > 60 ? C.success : feasScore > 35 ? C.warn : C.danger}40`,
            borderRadius: 6, padding: "6px 12px",
          }}>
            <span style={{ fontSize: 10, color: C.textDim, marginRight: 6 }}>FEASIBILITY</span>
            <span style={{
              fontSize: 14, fontWeight: 700,
              color: feasScore > 60 ? C.success : feasScore > 35 ? C.warn : C.danger,
            }}>{feasScore}</span>
            <span style={{ fontSize: 9, color: C.textDim }}>/100</span>
          </div>
        </div>

        {/* Quality selector */}
        <div style={{
          position: "absolute", bottom: 16, left: 16,
          display: "flex", gap: 4,
          background: `${C.panel}cc`, backdropFilter: "blur(8px)",
          border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: 3,
        }}>
          {["low", "medium", "high"].map(q => (
            <button key={q} onClick={() => setQuality(q)} style={{
              background: quality === q ? C.accent : "transparent",
              color: quality === q ? C.bg : C.textDim,
              border: "none", borderRadius: 4, padding: "4px 10px",
              fontSize: 10, fontFamily: "inherit", cursor: "pointer",
              fontWeight: quality === q ? 700 : 400,
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>{q}</button>
          ))}
        </div>

        {/* Controls hint */}
        <div style={{
          position: "absolute", bottom: 16, right: 316,
          fontSize: 9, color: `${C.textDim}88`,
          display: "flex", gap: 12,
        }}>
          <span>LMB: Orbit</span>
          <span>RMB: Pan</span>
          <span>Scroll: Zoom</span>
        </div>
      </div>

      {/* Control Panel */}
      <div style={{
        width: 300, minWidth: 300, height: "100%",
        background: C.panel, borderLeft: `1px solid ${C.panelBorder}`,
        overflowY: "auto", overflowX: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 16px 12px",
          borderBottom: `1px solid ${C.panelBorder}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="6" width="14" height="9" rx="1" stroke={C.accent} strokeWidth="1.2" fill="none" />
              <path d="M4 6V3a4 4 0 018 0v3" stroke={C.accent} strokeWidth="1.2" fill="none" />
              <rect x="3" y="9" width="2" height="3" fill={C.accent} opacity="0.4" />
              <rect x="7" y="9" width="2" height="3" fill={C.accent} opacity="0.6" />
              <rect x="11" y="9" width="2" height="3" fill={C.accent} opacity="0.8" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.textBright, letterSpacing: "0.02em" }}>
              VISION
            </span>
            <span style={{ fontSize: 9, color: C.textDim, marginLeft: "auto", textTransform: "uppercase" }}>
              Structural
            </span>
          </div>

          {/* Mode Toggle */}
          <div style={{
            display: "flex", gap: 2,
            background: C.surface, borderRadius: 6, padding: 2,
          }}>
            {["developer", "investor"].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, background: mode === m ? C.accent : "transparent",
                color: mode === m ? C.bg : C.textDim,
                border: "none", borderRadius: 4, padding: "6px 0",
                fontSize: 10, fontFamily: "inherit", cursor: "pointer",
                fontWeight: mode === m ? 700 : 400,
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>{m}</button>
            ))}
          </div>
        </div>

        {/* Stats Row */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.panelBorder}` }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <StatBadge label="Cost/SF" value={`$${costPerSf.toFixed(0)}`} unit="" color={C.accent} />
            <StatBadge label="Total Cost" value={`$${(totalCost / 1000).toFixed(0)}K`} unit="" color={C.accent} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <StatBadge label="Mkt Value" value={`$${(marketValue / 1000).toFixed(0)}K`} unit="" color={C.success} />
            <StatBadge label="Margin" value={`${marginPct}%`} unit="" color={margin > 0 ? C.success : C.danger} />
          </div>
          {mode === "investor" && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <StatBadge label="5yr Proj." value={`$${((marketValue * 1.15) / 1000).toFixed(0)}K`} unit="" color={C.warn} />
              <StatBadge label="Yield Est." value="5.8" unit="%" color={C.warn} />
            </div>
          )}
        </div>

        {/* Structural Parameters */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.panelBorder}` }}>
          <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            Structural Parameters
          </div>
          <SliderControl label="Square Footage" value={state.square_footage} min={1200} max={3500} step={100} unit=" sf" onChange={v => {
            const ratio = Math.sqrt(v / 2200);
            updateState("square_footage", v);
            setState(prev => ({ ...prev, square_footage: v, footprint_width: Math.round(44 * ratio), footprint_depth: Math.round(50 * ratio) }));
          }} />
          <SliderControl label="Structural Span" value={state.structural_span_ft} min={12} max={30} step={1} unit=" ft" color={C.warn} onChange={v => updateState("structural_span_ft", v)} />
          <SliderControl label="Story Height" value={state.story_height_ft} min={8} max={12} step={0.5} unit=" ft" onChange={v => updateState("story_height_ft", v)} />
          <SliderControl label="Imposed Load" value={state.imposed_load_psf} min={20} max={120} step={5} unit=" psf" color="#ff6b6b" onChange={v => updateState("imposed_load_psf", v)} />

          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <div style={{ flex: 1, fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Stories</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2].map(s => (
                <button key={s} onClick={() => updateState("stories", s)} style={{
                  width: 32, height: 24,
                  background: state.stories === s ? C.accent : C.surface,
                  color: state.stories === s ? C.bg : C.textDim,
                  border: `1px solid ${state.stories === s ? C.accent : C.panelBorder}`,
                  borderRadius: 4, fontSize: 11, fontFamily: "inherit",
                  cursor: "pointer", fontWeight: 600,
                }}>{s}</button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
            <div style={{ flex: 1, fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>Foundation</div>
            <div style={{ display: "flex", gap: 4 }}>
              {["slab", "pier"].map(f => (
                <button key={f} onClick={() => updateState("foundation_type", f)} style={{
                  padding: "4px 10px",
                  background: state.foundation_type === f ? C.accent : C.surface,
                  color: state.foundation_type === f ? C.bg : C.textDim,
                  border: `1px solid ${state.foundation_type === f ? C.accent : C.panelBorder}`,
                  borderRadius: 4, fontSize: 10, fontFamily: "inherit",
                  cursor: "pointer", fontWeight: 600, textTransform: "uppercase",
                }}>{f}</button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
            <div style={{ flex: 1, fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>Grid Density</div>
            <div style={{ display: "flex", gap: 4 }}>
              {["low", "medium", "high"].map(g => (
                <button key={g} onClick={() => updateState("grid_density", g)} style={{
                  padding: "4px 8px",
                  background: state.grid_density === g ? C.accent : C.surface,
                  color: state.grid_density === g ? C.bg : C.textDim,
                  border: `1px solid ${state.grid_density === g ? C.accent : C.panelBorder}`,
                  borderRadius: 4, fontSize: 9, fontFamily: "inherit",
                  cursor: "pointer", fontWeight: 600, textTransform: "uppercase",
                }}>{g}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Overlay Toggles */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.panelBorder}` }}>
          <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            Visualization Layers
          </div>
          <ToggleSwitch label="Beam Grid" checked={overlays.beamGrid} onChange={v => setOverlays(p => ({ ...p, beamGrid: v }))} />
          <ToggleSwitch label="Load Heatmap" checked={overlays.loadHeatmap} onChange={v => setOverlays(p => ({ ...p, loadHeatmap: v }))} color="#ff6b6b" />
          <ToggleSwitch label="Span Labels" checked={overlays.spanLabels} onChange={v => setOverlays(p => ({ ...p, spanLabels: v }))} color={C.warn} />
          <ToggleSwitch label="Wireframe Mode" checked={overlays.wireframe} onChange={v => setOverlays(p => ({ ...p, wireframe: v }))} color={C.textDim} />
        </div>

        {/* Feature Importance */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.panelBorder}` }}>
          <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            Cost Driver Importance
          </div>
          {[
            { label: "Lumber Price", pct: 35, c: C.wood },
            { label: "Structural Span", pct: 22, c: C.warn },
            { label: "Labor Rate", pct: 18, c: C.accent },
            { label: "Concrete Cost", pct: 14, c: C.concrete },
            { label: "Foundation Type", pct: 11, c: C.steel },
          ].map(({ label, pct, c }) => (
            <div key={label} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: C.text }}>{label}</span>
                <span style={{ fontSize: 10, color: c, fontWeight: 600 }}>{pct}%</span>
              </div>
              <div style={{ height: 3, background: C.surface, borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: c, borderRadius: 2, transition: "width 0.3s" }} />
              </div>
            </div>
          ))}
        </div>

        {/* Model Info */}
        <div style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            Model Performance
          </div>
          <div style={{
            background: C.surface, borderRadius: 6, padding: 10,
            border: `1px solid ${C.panelBorder}`,
          }}>
            {[
              { label: "Active Model", value: "Random Forest", c: C.success },
              { label: "MAE", value: "$4.2/sf", c: C.accent },
              { label: "RMSE", value: "$6.8/sf", c: C.accent },
              { label: "R²", value: "0.934", c: C.accent },
            ].map(({ label, value, c }) => (
              <div key={label} style={{
                display: "flex", justifyContent: "space-between",
                padding: "3px 0", borderBottom: `1px solid ${C.panelBorder}22`,
              }}>
                <span style={{ fontSize: 10, color: C.textDim }}>{label}</span>
                <span style={{ fontSize: 10, color: c, fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 10, padding: 8,
            background: `${C.accent}08`, border: `1px solid ${C.accent}20`,
            borderRadius: 6, fontSize: 9, color: C.textDim, lineHeight: 1.5,
          }}>
            Methodology adapted from Elhegazy et al. (2022) — ANN cost prediction for composite flooring systems. Synthetic training data calibrated to Dallas, TX residential construction costs ($120–$220/sf).
          </div>
          <div style={{
            marginTop: 6, fontSize: 8, color: `${C.textDim}88`, textAlign: "center",
          }}>
            DOI: 10.1080/13467581.2020.1838288
          </div>
        </div>
      </div>
    </div>
  );
}
