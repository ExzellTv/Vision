import React, { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { colors, fonts, card, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import DisclaimerBanner from "../../components/shared/DisclaimerBanner";
import FeatureImportanceBars from "../../components/shared/FeatureImportanceBars";
import SliderControl from "../../components/shared/SliderControl";
import ModeToggle from "../../components/shared/ModeToggle";

/* ─── Helpers ─── */
const ftToUnits = (ft) => ft * 0.3;
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const lerpColor = (c1, c2, t) => {
  const r = lerp((c1 >> 16) & 0xff, (c2 >> 16) & 0xff, t);
  const g = lerp((c1 >> 8) & 0xff, (c2 >> 8) & 0xff, t);
  const b_ = lerp(c1 & 0xff, c2 & 0xff, t);
  return new THREE.Color(r / 255, g / 255, b_ / 255);
};

const HEAT_LOW = 0x3b82f6;
const HEAT_MID = 0xf59e0b;
const HEAT_HIGH = 0xef4444;
function heatColor(t) {
  if (t < 0.5) return lerpColor(HEAT_LOW, HEAT_MID, t * 2);
  return lerpColor(HEAT_MID, HEAT_HIGH, (t - 0.5) * 2);
}

/* ─── Default structural state ─── */
const DEFAULTS = {
  spanMax: 24,
  stories: 1,
  marketIndex: 105,
};

/* ─── Cost data ─── */
const COST_ITEMS = [
  { name: "Lumber & Framing", cost: 52446, color: colors.wood },
  { name: "Concrete Foundation", cost: 30120, color: colors.concrete },
  { name: "Steel Reinforcement", cost: 18490, color: colors.steel },
  { name: "Labor & Overhead", cost: 23400, color: colors.accent },
  { name: "Additional", cost: 20744, color: colors.textDim },
];

const COST_TOTAL = 145200;

/* ─── ML Cost Drivers ─── */
const ML_FEATURES = [
  { name: "Total Sq Footage", importance: 0.92 },
  { name: "Structural Span", importance: 0.78 },
  { name: "Seismic Zone", importance: 0.61 },
  { name: "Soil Density", importance: 0.45 },
];

/* ─── SCI Gauge (0-10 scale) ─── */
function SCIGauge({ score = 7.5, size = 130 }) {
  const strokeWidth = size * 0.08;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(10, score)) / 10;
  const dashOffset = circumference * (1 - pct);

  const getColor = (s) => {
    if (s < 3) return colors.success;
    if (s < 5) return colors.accent;
    if (s < 7) return colors.warn;
    return colors.danger;
  };

  const color = getColor(score);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <span
        style={{
          fontFamily: fonts.label,
          fontSize: 10,
          fontWeight: 600,
          color: colors.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.8px",
        }}
      >
        Structural Complexity Index
      </span>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={colors.cardBorder} strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            top: 0, left: 0, width: "100%", height: "100%",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <span style={{ fontFamily: fonts.data, fontSize: size * 0.28, fontWeight: 700, color, lineHeight: 1 }}>
            {score.toFixed(1)}
          </span>
          <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, marginTop: 2 }}>/ 10</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Horizontal cost bar row ─── */
function CostRow({ name, cost, maxCost, color }) {
  const pct = (cost / maxCost) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <span style={{ fontFamily: fonts.label, fontSize: 11, color: colors.text, width: 140, flexShrink: 0 }}>
        {name}
      </span>
      <div style={{ flex: 1, height: 8, background: colors.cardBorder, borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`, height: "100%",
            background: color || colors.accent, borderRadius: 4,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textBright, width: 64, textAlign: "right", flexShrink: 0 }}>
        ${cost.toLocaleString()}
      </span>
    </div>
  );
}

/* ─── Three.js Viewport ─── */
function useStructuralViewport(canvasRef, state) {
  const sceneRef = useRef(null);
  const frameRef = useRef(null);
  const mouseRef = useRef({ isDown: false, prevX: 0, prevY: 0 });
  const cameraAngle = useRef({ theta: 0.6, phi: 0.5, dist: 28 });

  const buildStructure = useCallback((scene, st) => {
    // Remove old house group
    const old = scene.getObjectByName("house");
    if (old) scene.remove(old);

    const group = new THREE.Group();
    group.name = "house";

    const w = ftToUnits(st.footprintWidth || 44);
    const d = ftToUnits(st.footprintDepth || 50);
    const sh = ftToUnits(9);
    const stories = st.stories;
    const slabH = ftToUnits(0.5);
    const spanFt = st.spanMax;

    // Materials
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8a9bb0, roughness: 0.85, metalness: 0.05 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xd4cfc8, roughness: 0.8, metalness: 0.0 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xa0d2db, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.35,
    });
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x00d4ff, transparent: true, opacity: 0.55, depthWrite: false, metalness: 0.6, roughness: 0.3,
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3d4a5c, roughness: 0.9, metalness: 0.05 });

    // Foundation slab
    const slabGeo = new THREE.BoxGeometry(w + 0.3, slabH, d + 0.3);
    const slab = new THREE.Mesh(slabGeo, concreteMat);
    slab.position.y = slabH / 2;
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);

    const baseY = slabH;

    // Build stories
    for (let s = 0; s < stories; s++) {
      const floorY = baseY + s * sh;

      // Floor plate
      const floorGeo = new THREE.BoxGeometry(w, 0.08, d);
      const floor = new THREE.Mesh(floorGeo, concreteMat);
      floor.position.y = floorY + 0.04;
      floor.castShadow = true;
      floor.receiveShadow = true;
      group.add(floor);

      // Walls (4 sides)
      const wallH = sh - 0.08;
      const wallThick = 0.12;

      const frontGeo = new THREE.BoxGeometry(w, wallH, wallThick);
      const sideGeo = new THREE.BoxGeometry(wallThick, wallH, d);

      const front = new THREE.Mesh(frontGeo, wallMat);
      front.position.set(0, floorY + 0.08 + wallH / 2, d / 2);
      front.castShadow = true;
      group.add(front);

      const back = new THREE.Mesh(frontGeo, wallMat);
      back.position.set(0, floorY + 0.08 + wallH / 2, -d / 2);
      back.castShadow = true;
      group.add(back);

      const left = new THREE.Mesh(sideGeo, wallMat);
      left.position.set(-w / 2, floorY + 0.08 + wallH / 2, 0);
      left.castShadow = true;
      group.add(left);

      const right = new THREE.Mesh(sideGeo, wallMat);
      right.position.set(w / 2, floorY + 0.08 + wallH / 2, 0);
      right.castShadow = true;
      group.add(right);

      // Windows (glass panels on front)
      const winW = 1.2;
      const winH = 0.9;
      const winGeo = new THREE.PlaneGeometry(winW, winH);
      for (let wi = 0; wi < 4; wi++) {
        const win = new THREE.Mesh(winGeo, glassMat);
        win.position.set(-w / 2 + (wi + 1) * (w / 5), floorY + 0.08 + wallH * 0.55, d / 2 + 0.07);
        group.add(win);
      }
    }

    // Roof
    const roofY = baseY + stories * sh;
    const roofGeo = new THREE.BoxGeometry(w + 0.6, 0.12, d + 0.6);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = roofY + 0.06;
    roof.castShadow = true;
    group.add(roof);

    // Beam grid overlay (instanced cyan cylinders)
    const beamRadius = 0.06;
    const beamCount = Math.max(3, Math.ceil(40 / spanFt) + 1);
    const beamGeoH = new THREE.CylinderGeometry(beamRadius, beamRadius, d, 8);
    beamGeoH.rotateX(Math.PI / 2);
    const beamGeoV = new THREE.CylinderGeometry(beamRadius, beamRadius, w, 8);
    beamGeoV.rotateZ(Math.PI / 2);

    for (let s = 0; s < stories; s++) {
      const by = baseY + s * sh + 0.08 + (sh - 0.08) * 0.85;
      for (let i = 0; i < beamCount; i++) {
        const t = i / (beamCount - 1);
        const x = -w / 2 + t * w;
        const hBeam = new THREE.Mesh(beamGeoH, beamMat);
        hBeam.position.set(x, by, 0);
        group.add(hBeam);
      }
      const beamCountV = Math.max(3, Math.ceil(50 / spanFt) + 1);
      for (let i = 0; i < beamCountV; i++) {
        const t = i / (beamCountV - 1);
        const z = -d / 2 + t * d;
        const vBeam = new THREE.Mesh(beamGeoV, beamMat);
        vBeam.position.set(0, by, z);
        group.add(vBeam);
      }
    }

    // Load heatmap overlay (colored plane at each floor)
    for (let s = 0; s < stories; s++) {
      const hmY = baseY + s * sh + 0.12;
      const segs = 20;
      const hmGeo = new THREE.PlaneGeometry(w * 0.95, d * 0.95, segs, segs);
      const heatmapColors = [];
      const posAttr = hmGeo.getAttribute("position");
      for (let vi = 0; vi < posAttr.count; vi++) {
        const px = posAttr.getX(vi);
        const py = posAttr.getY(vi);
        const cx = (px / (w * 0.475) + 1) / 2;
        const cy = (py / (d * 0.475) + 1) / 2;
        const load = Math.sin(cx * Math.PI) * Math.sin(cy * Math.PI) * 0.7 + 0.15;
        const col = heatColor(load);
        heatmapColors.push(col.r, col.g, col.b);
      }
      hmGeo.setAttribute("color", new THREE.Float32BufferAttribute(heatmapColors, 3));
      const hmMat = new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide,
      });
      const hmMesh = new THREE.Mesh(hmGeo, hmMat);
      hmMesh.rotation.x = -Math.PI / 2;
      hmMesh.position.y = hmY;
      group.add(hmMesh);
    }

    scene.add(group);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x0a0e17, 1);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0e17, 0.012);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    camera.position.set(18, 14, 22);
    camera.lookAt(0, 2, 0);

    // Lighting
    scene.add(new THREE.AmbientLight(0x2a3a5a, 0.4));
    scene.add(new THREE.HemisphereLight(0x4a6a9a, 0x1a1a2e, 0.35));

    const key = new THREE.DirectionalLight(0xffeedd, 1.2);
    key.position.set(12, 18, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 60;
    key.shadow.camera.left = -20;
    key.shadow.camera.right = 20;
    key.shadow.camera.top = 20;
    key.shadow.camera.bottom = -20;
    key.shadow.bias = -0.001;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x8ab4ff, 0.3);
    fill.position.set(-8, 6, -4);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x00d4ff, 0.25);
    rim.position.set(-6, 8, -12);
    scene.add(rim);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x0d1220, roughness: 0.95 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(40, 40, 0x1a2540, 0x111a30);
    grid.position.y = 0.005;
    scene.add(grid);

    sceneRef.current = { renderer, scene, camera };

    // Build initial structure
    buildStructure(scene, state);

    // Resize
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

    // Animate
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const { theta, phi, dist } = cameraAngle.current;
      camera.position.set(
        Math.sin(theta) * Math.cos(phi) * dist,
        Math.sin(phi) * dist,
        Math.cos(theta) * Math.cos(phi) * dist,
      );
      camera.lookAt(0, 2, 0);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameRef.current);
      renderer.dispose();
    };
  }, []);

  // Rebuild structure when state changes
  useEffect(() => {
    if (sceneRef.current) {
      buildStructure(sceneRef.current.scene, state);
    }
  }, [state, buildStructure]);

  // Mouse orbit handlers
  const onMouseDown = useCallback((e) => {
    mouseRef.current = { isDown: true, prevX: e.clientX, prevY: e.clientY };
  }, []);
  const onMouseMove = useCallback((e) => {
    if (!mouseRef.current.isDown) return;
    const dx = e.clientX - mouseRef.current.prevX;
    const dy = e.clientY - mouseRef.current.prevY;
    cameraAngle.current.theta += dx * 0.005;
    cameraAngle.current.phi = Math.max(0.1, Math.min(1.4, cameraAngle.current.phi + dy * 0.005));
    mouseRef.current.prevX = e.clientX;
    mouseRef.current.prevY = e.clientY;
  }, []);
  const onMouseUp = useCallback(() => {
    mouseRef.current.isDown = false;
  }, []);
  const onWheel = useCallback((e) => {
    cameraAngle.current.dist = Math.max(10, Math.min(50, cameraAngle.current.dist + e.deltaY * 0.02));
  }, []);

  return { onMouseDown, onMouseMove, onMouseUp, onWheel };
}

/* ─── Main Component ─── */
export default function StructuralIntelligence() {
  const project = useProject();
  const canvasRef = useRef(null);
  const [spanMax, setSpanMax] = useState(DEFAULTS.spanMax);
  const [stories, setStories] = useState(project.stories || DEFAULTS.stories);
  const [marketIndex, setMarketIndex] = useState(DEFAULTS.marketIndex);
  const [viewMode, setViewMode] = useState("developer");

  const structState = {
    spanMax,
    stories,
    marketIndex,
    footprintWidth: project.footprintWidth || 44,
    footprintDepth: project.footprintDepth || 50,
  };
  const { onMouseDown, onMouseMove, onMouseUp, onWheel } = useStructuralViewport(canvasRef, structState);

  const maxCost = Math.max(...COST_ITEMS.map((c) => c.cost));

  const resetDefaults = () => {
    setSpanMax(DEFAULTS.spanMax);
    setStories(project.stories || DEFAULTS.stories);
    setMarketIndex(DEFAULTS.marketIndex);
  };

  return (
    <div
      style={{
        height: "100%",
        background: colors.bgGradient,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          padding: "16px 20px 8px",
          flexShrink: 0,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: fonts.label,
              fontSize: 20,
              fontWeight: 700,
              color: colors.textBright,
              margin: 0,
            }}
          >
            Structural Intelligence Visualization
          </h1>
          <p
            style={{
              fontFamily: fonts.label,
              fontSize: 12,
              color: colors.textDim,
              margin: "4px 0 0",
            }}
          >
            BIM-integrated structural analysis and AI cost forecasting
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{
              padding: "8px 16px",
              fontFamily: fonts.label,
              fontSize: 12,
              fontWeight: 600,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: radii.md,
              background: colors.cardSurface,
              color: colors.text,
              cursor: "pointer",
            }}
          >
            Export CAD
          </button>
          <button
            style={{
              padding: "8px 16px",
              fontFamily: fonts.label,
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              borderRadius: radii.md,
              background: colors.accent,
              color: colors.bg,
              cursor: "pointer",
            }}
          >
            Run Simulation
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", padding: "0 20px", gap: 16 }}>
        {/* Left — 3D Viewport */}
        <div style={{ flex: "0 0 55%", display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              flex: 1,
              position: "relative",
              background: colors.panel,
              border: `1px solid ${colors.panelBorder}`,
              borderRadius: radii.lg,
              overflow: "hidden",
            }}
          >
            <canvas
              ref={canvasRef}
              style={{ width: "100%", height: "100%", display: "block", cursor: "grab" }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onWheel={onWheel}
            />

            {/* Heatmap legend */}
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(15, 20, 32, 0.85)",
                padding: "6px 10px",
                borderRadius: radii.md,
                border: `1px solid ${colors.panelBorder}`,
              }}
            >
              <span style={{ fontFamily: fonts.label, fontSize: 10, color: colors.textDim, fontWeight: 600, textTransform: "uppercase" }}>
                Load Distribution
              </span>
              <span style={{ fontFamily: fonts.data, fontSize: 9, color: colors.heatLow }}>Low</span>
              <div
                style={{
                  width: 80,
                  height: 8,
                  borderRadius: 4,
                  background: `linear-gradient(to right, ${colors.heatLow}, ${colors.heatMid}, ${colors.heatHigh})`,
                }}
              />
              <span style={{ fontFamily: fonts.data, fontSize: 9, color: colors.heatHigh }}>High</span>
            </div>

            {/* Span label */}
            <div
              style={{
                position: "absolute",
                bottom: 50,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0, 212, 255, 0.12)",
                border: `1px solid ${colors.accent}`,
                borderRadius: radii.sm,
                padding: "3px 10px",
              }}
            >
              <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.accent }}>
                Span: {spanMax}ft
              </span>
            </div>

            {/* Model info */}
            <div
              style={{
                position: "absolute",
                bottom: 12,
                left: 12,
                fontFamily: fonts.data,
                fontSize: 10,
                color: colors.textDim,
              }}
            >
              MODEL: W14-14-30 / META-14
            </div>

            {/* View controls */}
            <div
              style={{
                position: "absolute",
                bottom: 12,
                left: 12,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                marginBottom: 20,
              }}
            >
              {["perspective", "top", "front"].map((v) => (
                <button
                  key={v}
                  style={{
                    width: 28,
                    height: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: colors.cardSurface,
                    border: `1px solid ${colors.cardBorder}`,
                    borderRadius: radii.sm,
                    color: colors.textDim,
                    fontFamily: fonts.data,
                    fontSize: 9,
                    cursor: "pointer",
                    textTransform: "uppercase",
                  }}
                  title={v}
                >
                  {v === "perspective" ? "3D" : v === "top" ? "T" : "F"}
                </button>
              ))}
            </div>

            {/* View mode toggle */}
            <div style={{ position: "absolute", top: 12, right: 12 }}>
              <ModeToggle
                options={[
                  { value: "developer", label: "Dev" },
                  { value: "schematic", label: "Sch" },
                ]}
                active={viewMode}
                onChange={setViewMode}
              />
            </div>
          </div>
        </div>

        {/* Right panel — Cost & ML */}
        <div style={{ flex: "0 0 45%", display: "flex", flexDirection: "column", gap: 12, overflow: "auto", paddingBottom: 8 }}>
          <DisclaimerBanner compact />

          {/* Material Cost Breakdown */}
          <div style={{ ...card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <span
                style={{
                  fontFamily: fonts.label,
                  fontSize: 13,
                  fontWeight: 700,
                  color: colors.textBright,
                }}
              >
                Material Cost Breakdown
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim }}>Construction Total:</span>
                <span style={{ fontFamily: fonts.data, fontSize: 16, fontWeight: 700, color: colors.textBright }}>
                  ${COST_TOTAL.toLocaleString()}
                </span>
                <span style={{ fontFamily: fonts.data, fontSize: 11, fontWeight: 600, color: colors.success }}>
                  +3.4%
                </span>
              </div>
            </div>
            {COST_ITEMS.map((item) => (
              <CostRow key={item.name} name={item.name} cost={item.cost} maxCost={maxCost} color={item.color} />
            ))}
          </div>

          {/* ML Cost Drivers */}
          <div style={{ ...card }}>
            <span
              style={{
                fontFamily: fonts.label,
                fontSize: 13,
                fontWeight: 700,
                color: colors.textBright,
                display: "block",
                marginBottom: 10,
              }}
            >
              ML Cost Drivers
            </span>
            <FeatureImportanceBars features={ML_FEATURES} />
          </div>
        </div>
      </div>

      {/* Bottom section */}
      <div
        style={{
          display: "flex",
          gap: 16,
          padding: "12px 20px 16px",
          flexShrink: 0,
          alignItems: "flex-end",
        }}
      >
        {/* Structural inputs */}
        <div
          style={{
            ...card,
            flex: 1,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span
              style={{
                fontFamily: fonts.label,
                fontSize: 11,
                fontWeight: 700,
                color: colors.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.8px",
              }}
            >
              Adjust Structural Inputs
            </span>
            <button
              onClick={resetDefaults}
              style={{
                padding: "4px 10px",
                fontFamily: fonts.label,
                fontSize: 10,
                fontWeight: 600,
                border: `1px solid ${colors.cardBorder}`,
                borderRadius: radii.sm,
                background: "transparent",
                color: colors.textDim,
                cursor: "pointer",
              }}
            >
              Reset Defaults
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <SliderControl
              label="Structural Span Max"
              value={spanMax}
              min={8}
              max={40}
              step={1}
              unit="ft"
              onChange={setSpanMax}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 12, fontWeight: 500, color: colors.text }}>
                Building Stories
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => setStories(n)}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      fontFamily: fonts.data,
                      fontSize: 13,
                      fontWeight: 600,
                      border: `1px solid ${n === stories ? colors.accent : colors.cardBorder}`,
                      borderRadius: radii.sm,
                      background: n === stories ? colors.accentDim : "transparent",
                      color: n === stories ? colors.accent : colors.textDim,
                      cursor: "pointer",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <SliderControl
              label="Market Price Index"
              value={marketIndex}
              min={80}
              max={140}
              step={1}
              unit=""
              onChange={setMarketIndex}
            />
          </div>
        </div>

        {/* SCI Gauge */}
        <div
          style={{
            ...card,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 180,
          }}
        >
          <SCIGauge score={7.5} size={120} />
        </div>
      </div>
    </div>
  );
}
