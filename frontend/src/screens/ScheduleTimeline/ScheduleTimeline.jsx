import React, { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { colors, fonts, card, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import StatusBadge from "../../components/shared/StatusBadge";
import DisclaimerBanner from "../../components/shared/DisclaimerBanner";

/* ─── Phase data ─── */
const PHASES = [
  { id: 1, name: "Foundation",  startWeek: 1,  endWeek: 3,  status: "complete" },
  { id: 2, name: "Columns",    startWeek: 3,  endWeek: 5,  status: "complete" },
  { id: 3, name: "Beams",      startWeek: 5,  endWeek: 9,  status: "active" },
  { id: 4, name: "Slabs",      startWeek: 9,  endWeek: 12, status: "planned" },
  { id: 5, name: "Finishing",   startWeek: 12, endWeek: 16, status: "planned" },
];

const TOTAL_WEEKS = 16;
const CURRENT_DAY = 47;  // Day 47 of project
const CURRENT_MONTH = 2; // Month 2

/* ─── Phase status colors ─── */
const phaseColor = (status) => {
  if (status === "complete") return colors.success;
  if (status === "active") return colors.accent;
  return colors.textDim;
};

const phaseColorDim = (status) => {
  if (status === "complete") return colors.successDim;
  if (status === "active") return colors.accentDim;
  return "rgba(90, 101, 128, 0.15)";
};

/* ─── Buildability Gauge ─── */
function BuildabilityGauge({ score = 68, size = 120 }) {
  const strokeWidth = size * 0.08;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score));
  const dashOffset = circumference * (1 - pct / 100);

  const getColor = (s) => {
    if (s < 40) return colors.danger;
    if (s < 60) return colors.warn;
    if (s < 80) return colors.accent;
    return colors.success;
  };

  const color = getColor(score);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
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
          <span style={{ fontFamily: fonts.data, fontSize: size * 0.26, fontWeight: 700, color, lineHeight: 1 }}>
            {pct}%
          </span>
        </div>
      </div>
      <span style={{ fontFamily: fonts.label, fontSize: 10, color: colors.textDim, textAlign: "center" }}>
        Targeting 80% at Phase Completion
      </span>
    </div>
  );
}

/* ─── Three.js Construction Viewport ─── */
function useConstructionViewport(canvasRef, timeSlider) {
  const frameRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraAngle = useRef({ theta: 0.5, phi: 0.45, dist: 24 });
  const mouseRef = useRef({ isDown: false, prevX: 0, prevY: 0 });

  const getPhaseProgress = useCallback((slider) => {
    // Convert slider (1-16 weeks) to phase completions
    const weekNow = slider;
    return PHASES.map((p) => {
      if (weekNow >= p.endWeek) return 1;
      if (weekNow <= p.startWeek) return 0;
      return (weekNow - p.startWeek) / (p.endWeek - p.startWeek);
    });
  }, []);

  const buildConstruction = useCallback((scene, slider) => {
    const old = scene.getObjectByName("construction");
    if (old) scene.remove(old);

    const group = new THREE.Group();
    group.name = "construction";

    const progress = getPhaseProgress(slider);
    const w = 8;
    const d = 10;

    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8a9bb0, roughness: 0.85, metalness: 0.05 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x7a8ea0, roughness: 0.35, metalness: 0.8 });
    const cyanWire = new THREE.MeshBasicMaterial({ color: 0x00d4ff, wireframe: true, transparent: true, opacity: 0.4 });
    const cyanSolid = new THREE.MeshStandardMaterial({
      color: 0x00d4ff, transparent: true, opacity: 0.5, depthWrite: false, metalness: 0.6, roughness: 0.3,
    });
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x6b7a8a, roughness: 0.92, metalness: 0.02 });
    const finishMat = new THREE.MeshStandardMaterial({ color: 0xd4cfc8, roughness: 0.8, metalness: 0.0 });

    // Phase 1: Foundation (slab)
    if (progress[0] > 0) {
      const slabH = 0.3 * progress[0];
      const slabGeo = new THREE.BoxGeometry(w + 0.4, slabH, d + 0.4);
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.y = slabH / 2;
      slab.castShadow = true;
      slab.receiveShadow = true;
      group.add(slab);
    }

    const baseY = 0.3;

    // Phase 2: Columns
    if (progress[1] > 0) {
      const colH = 3.2 * progress[1];
      const colGeo = new THREE.CylinderGeometry(0.12, 0.12, colH, 8);
      const positions = [
        [-w / 2 + 0.3, 0, -d / 2 + 0.3],
        [w / 2 - 0.3, 0, -d / 2 + 0.3],
        [-w / 2 + 0.3, 0, d / 2 - 0.3],
        [w / 2 - 0.3, 0, d / 2 - 0.3],
        [0, 0, -d / 2 + 0.3],
        [0, 0, d / 2 - 0.3],
        [-w / 2 + 0.3, 0, 0],
        [w / 2 - 0.3, 0, 0],
      ];
      // Determine if columns are in the active phase
      const isActive = progress[1] > 0 && progress[1] < 1;
      positions.forEach(([x, , z]) => {
        const col = new THREE.Mesh(colGeo, isActive ? cyanSolid : steelMat);
        col.position.set(x, baseY + colH / 2, z);
        col.castShadow = true;
        group.add(col);
        if (isActive) {
          const wire = new THREE.Mesh(colGeo, cyanWire);
          wire.position.set(x, baseY + colH / 2, z);
          group.add(wire);
        }
      });
    }

    // Phase 3: Beams
    if (progress[2] > 0) {
      const beamY = baseY + 3.2;
      const beamRadius = 0.08;
      const isActive = progress[2] > 0 && progress[2] < 1;
      const mat = isActive ? cyanSolid : steelMat;

      // Horizontal beams along X
      const beamCountX = Math.ceil(3 * progress[2]);
      for (let i = 0; i < beamCountX; i++) {
        const t = i / 2;
        const z = -d / 2 + 0.3 + t * (d - 0.6);
        const beamGeo = new THREE.CylinderGeometry(beamRadius, beamRadius, w - 0.2, 8);
        beamGeo.rotateZ(Math.PI / 2);
        const beam = new THREE.Mesh(beamGeo, mat);
        beam.position.set(0, beamY, z);
        beam.castShadow = true;
        group.add(beam);
        if (isActive) {
          const wire = new THREE.Mesh(beamGeo, cyanWire);
          wire.position.set(0, beamY, z);
          group.add(wire);
        }
      }

      // Horizontal beams along Z
      const beamCountZ = Math.ceil(3 * progress[2]);
      for (let i = 0; i < beamCountZ; i++) {
        const t = i / 2;
        const x = -w / 2 + 0.3 + t * (w - 0.6);
        const beamGeo = new THREE.CylinderGeometry(beamRadius, beamRadius, d - 0.2, 8);
        beamGeo.rotateX(Math.PI / 2);
        const beam = new THREE.Mesh(beamGeo, mat);
        beam.position.set(x, beamY + 0.18, 0);
        beam.castShadow = true;
        group.add(beam);
        if (isActive) {
          const wire = new THREE.Mesh(beamGeo, cyanWire);
          wire.position.set(x, beamY + 0.18, 0);
          group.add(wire);
        }
      }
    }

    // Phase 4: Slabs (floor plate on top of beams)
    if (progress[3] > 0) {
      const slabY = baseY + 3.5;
      const isActive = progress[3] > 0 && progress[3] < 1;
      const slabGeo = new THREE.BoxGeometry(w * progress[3], 0.15, d);
      const floorSlab = new THREE.Mesh(slabGeo, isActive ? cyanSolid : concreteMat);
      floorSlab.position.set((w * progress[3] - w) / 2, slabY, 0);
      floorSlab.castShadow = true;
      floorSlab.receiveShadow = true;
      group.add(floorSlab);
      if (isActive) {
        const wire = new THREE.Mesh(slabGeo, cyanWire);
        wire.position.set((w * progress[3] - w) / 2, slabY, 0);
        group.add(wire);
      }
    }

    // Phase 5: Finishing (walls)
    if (progress[4] > 0) {
      const wallBase = baseY + 0.1;
      const wallH = 3.1 * progress[4];
      const wallThick = 0.1;
      const isActive = progress[4] > 0 && progress[4] < 1;
      const mat = isActive ? cyanSolid : finishMat;

      const frontGeo = new THREE.BoxGeometry(w, wallH, wallThick);
      const sideGeo = new THREE.BoxGeometry(wallThick, wallH, d);

      const front = new THREE.Mesh(frontGeo, mat);
      front.position.set(0, wallBase + wallH / 2, d / 2);
      front.castShadow = true;
      group.add(front);

      const back = new THREE.Mesh(frontGeo, mat);
      back.position.set(0, wallBase + wallH / 2, -d / 2);
      back.castShadow = true;
      group.add(back);

      const left = new THREE.Mesh(sideGeo, mat);
      left.position.set(-w / 2, wallBase + wallH / 2, 0);
      left.castShadow = true;
      group.add(left);

      const right = new THREE.Mesh(sideGeo, mat);
      right.position.set(w / 2, wallBase + wallH / 2, 0);
      right.castShadow = true;
      group.add(right);

      if (isActive) {
        [front, back, left, right].forEach((m) => {
          const wf = m.clone();
          wf.material = cyanWire;
          group.add(wf);
        });
      }
    }

    scene.add(group);
  }, [getPhaseProgress]);

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
    scene.fog = new THREE.FogExp2(0x0a0e17, 0.015);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);

    // Lighting
    scene.add(new THREE.AmbientLight(0x2a3a5a, 0.45));
    scene.add(new THREE.HemisphereLight(0x4a6a9a, 0x1a1a2e, 0.35));

    const key = new THREE.DirectionalLight(0xffeedd, 1.1);
    key.position.set(10, 15, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 50;
    key.shadow.camera.left = -15;
    key.shadow.camera.right = 15;
    key.shadow.camera.top = 15;
    key.shadow.camera.bottom = -15;
    key.shadow.bias = -0.001;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x8ab4ff, 0.3);
    fill.position.set(-8, 6, -4);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x00d4ff, 0.2);
    rim.position.set(-5, 7, -10);
    scene.add(rim);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(80, 80);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x0d1220, roughness: 0.95 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(30, 30, 0x1a2540, 0x111a30);
    grid.position.y = 0.005;
    scene.add(grid);

    sceneRef.current = { renderer, scene, camera };

    buildConstruction(scene, timeSlider);

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

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const { theta, phi, dist } = cameraAngle.current;
      camera.position.set(
        Math.sin(theta) * Math.cos(phi) * dist,
        Math.sin(phi) * dist,
        Math.cos(theta) * Math.cos(phi) * dist,
      );
      camera.lookAt(0, 1.5, 0);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameRef.current);
      renderer.dispose();
    };
  }, []);

  // Rebuild when slider changes
  useEffect(() => {
    if (sceneRef.current) {
      buildConstruction(sceneRef.current.scene, timeSlider);
    }
  }, [timeSlider, buildConstruction]);

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
  const onMouseUp = useCallback(() => { mouseRef.current.isDown = false; }, []);
  const onWheel = useCallback((e) => {
    cameraAngle.current.dist = Math.max(8, Math.min(40, cameraAngle.current.dist + e.deltaY * 0.02));
  }, []);

  return { onMouseDown, onMouseMove, onMouseUp, onWheel };
}

/* ─── Gantt Bar ─── */
function GanttBar({ phase, totalWeeks }) {
  const leftPct = ((phase.startWeek - 1) / totalWeeks) * 100;
  const widthPct = ((phase.endWeek - phase.startWeek) / totalWeeks) * 100;
  const color = phaseColor(phase.status);
  const dimColor = phaseColorDim(phase.status);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, height: 28 }}>
      <span
        style={{
          fontFamily: fonts.label,
          fontSize: 11,
          color: phase.status === "active" ? colors.accent : colors.text,
          width: 80,
          flexShrink: 0,
          fontWeight: phase.status === "active" ? 600 : 400,
        }}
      >
        {phase.name}
      </span>
      <div style={{ flex: 1, position: "relative", height: 14, background: colors.cardBorder, borderRadius: 4 }}>
        <div
          style={{
            position: "absolute",
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            height: "100%",
            background: color,
            borderRadius: 4,
            opacity: phase.status === "planned" ? 0.4 : 0.85,
            transition: "all 0.3s ease",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: fonts.data,
          fontSize: 10,
          color: colors.textDim,
          width: 60,
          flexShrink: 0,
          textAlign: "right",
        }}
      >
        W{phase.startWeek}-{phase.endWeek}
      </span>
    </div>
  );
}

/* ─── Main Component ─── */
export default function ScheduleTimeline() {
  const project = useProject();
  const canvasRef = useRef(null);
  const [timeSlider, setTimeSlider] = useState(7); // Current week (in Beams phase)

  const { onMouseDown, onMouseMove, onMouseUp, onWheel } = useConstructionViewport(canvasRef, timeSlider);

  const projectName = project.projectName || "New Project";

  // Derive current phase statuses based on slider
  const phasesWithStatus = PHASES.map((p) => {
    if (timeSlider >= p.endWeek) return { ...p, status: "complete" };
    if (timeSlider >= p.startWeek) return { ...p, status: "active" };
    return { ...p, status: "planned" };
  });

  const activePhase = phasesWithStatus.find((p) => p.status === "active");
  const activePhaseProgress = activePhase
    ? Math.round(((timeSlider - activePhase.startWeek) / (activePhase.endWeek - activePhase.startWeek)) * 100)
    : 0;

  // Inject slider styles
  useEffect(() => {
    const styleId = "vision-timeline-slider-styles";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      input[type="range"].timeline-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 4px;
        border-radius: 2px;
        outline: none;
        cursor: pointer;
        background: ${colors.panelBorder};
      }
      input[type="range"].timeline-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: ${colors.accent};
        border: 2px solid ${colors.bg};
        cursor: pointer;
      }
      input[type="range"].timeline-slider::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: ${colors.accent};
        border: 2px solid ${colors.bg};
        cursor: pointer;
      }
      input[type="range"].timeline-slider::-moz-range-track {
        height: 4px;
        border-radius: 2px;
        background: ${colors.panelBorder};
      }
    `;
    document.head.appendChild(style);
  }, []);

  const sliderPct = ((timeSlider - 1) / (TOTAL_WEEKS - 1)) * 100;
  const sliderBg = `linear-gradient(to right, ${colors.accent} 0%, ${colors.accent} ${sliderPct}%, ${colors.panelBorder} ${sliderPct}%, ${colors.panelBorder} 100%)`;

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
      <div style={{ padding: "16px 20px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h1
                style={{
                  fontFamily: fonts.label,
                  fontSize: 20,
                  fontWeight: 700,
                  color: colors.textBright,
                  margin: 0,
                }}
              >
                Construction Phasing
              </h1>
              <StatusBadge status={activePhase ? "active" : "complete"} size="lg" />
            </div>
            <p style={{ fontFamily: fonts.label, fontSize: 12, color: colors.textDim, margin: "4px 0 0" }}>
              {projectName}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontFamily: fonts.label, fontSize: 10, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.6px" }}>
              Current Phase
            </span>
            <span
              style={{
                fontFamily: fonts.label,
                fontSize: 13,
                fontWeight: 700,
                color: colors.accent,
                padding: "4px 12px",
                background: colors.accentDim,
                borderRadius: radii.md,
                border: `1px solid rgba(0, 212, 255, 0.3)`,
              }}
            >
              {activePhase ? activePhase.name + " & Structural Support" : "Complete"}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim }}>
              DAY/{CURRENT_DAY}
            </span>
            <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim }}>
              Day {CURRENT_DAY}
            </span>
          </div>
          <div style={{ flex: 1, height: 4, background: colors.cardBorder, borderRadius: 2 }}>
            <div
              style={{
                width: `${(timeSlider / TOTAL_WEEKS) * 100}%`,
                height: "100%",
                background: colors.accent,
                borderRadius: 2,
                transition: "width 0.3s",
              }}
            />
          </div>
          <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.accent, fontWeight: 600 }}>
            {activePhaseProgress}%
          </span>
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

            {/* Phase overlay label */}
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(15, 20, 32, 0.85)",
                padding: "6px 12px",
                borderRadius: radii.md,
                border: `1px solid ${colors.panelBorder}`,
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors.accent }} />
              <span style={{ fontFamily: fonts.label, fontSize: 11, color: colors.accent, fontWeight: 600 }}>
                {activePhase ? activePhase.name : "Complete"} Phase
              </span>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>
                Week {timeSlider}
              </span>
            </div>
          </div>

          {/* Budget tracking cards */}
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <div
              style={{
                ...card,
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                Concrete Curing
              </span>
              <span style={{ fontFamily: fonts.data, fontSize: 22, fontWeight: 700, color: colors.textBright, lineHeight: 1 }}>
                Day 14
              </span>
            </div>
            <div
              style={{
                ...card,
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                Steel Erection
              </span>
              <span style={{ fontFamily: fonts.data, fontSize: 22, fontWeight: 700, color: colors.textBright, lineHeight: 1 }}>
                80%
              </span>
            </div>
          </div>
        </div>

        {/* Right panel — Phase Intelligence */}
        <div style={{ flex: "0 0 45%", display: "flex", flexDirection: "column", gap: 12, overflow: "auto", paddingBottom: 8 }}>
          <DisclaimerBanner compact />

          {/* Cumulative Cost */}
          <div style={{ ...card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 10, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                Cumulative Cost
              </span>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: colors.successDim,
                  color: colors.success,
                  fontFamily: fonts.label,
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.6px",
                }}
              >
                On Budget
              </span>
            </div>
            <span style={{ fontFamily: fonts.data, fontSize: 28, fontWeight: 700, color: colors.textBright, lineHeight: 1 }}>
              $142,500
            </span>
          </div>

          {/* Buildability Index */}
          <div style={{ ...card, display: "flex", justifyContent: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 10, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>
                Buildability Index
              </span>
              <BuildabilityGauge score={68} size={110} />
            </div>
          </div>

          {/* Active Materials */}
          <div style={{ ...card }}>
            <span style={{ fontFamily: fonts.label, fontSize: 10, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 10 }}>
              Active Materials
            </span>
            {[
              { name: "Reinforced Steel", status: "active" },
              { name: "Concrete Mix", status: "active" },
            ].map((mat) => (
              <div key={mat.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: mat.status === "active" ? colors.accent : colors.textDim,
                    boxShadow: mat.status === "active" ? `0 0 6px ${colors.accent}` : "none",
                  }}
                />
                <span style={{ fontFamily: fonts.label, fontSize: 12, color: colors.text }}>
                  {mat.name}
                </span>
                <StatusBadge status={mat.status} />
              </div>
            ))}
          </div>

          {/* Weather Alert */}
          <div
            style={{
              ...card,
              background: colors.warnDim,
              border: `1px solid rgba(255, 159, 67, 0.3)`,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>&#9888;</span>
              <div>
                <span style={{ fontFamily: fonts.label, fontSize: 12, fontWeight: 700, color: colors.warn, display: "block" }}>
                  Weather Alert
                </span>
                <span style={{ fontFamily: fonts.label, fontSize: 11, color: colors.warn, opacity: 0.8, lineHeight: 1.4 }}>
                  Rain forecast for Day 50. Reschedule concrete pour if sustained precipitation exceeds 0.1in/hr.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom section — Gantt timeline */}
      <div
        style={{
          ...card,
          margin: "8px 20px 12px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontFamily: fonts.label, fontSize: 11, fontWeight: 700, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px" }}>
            Timeline
          </span>
          <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim }}>
            {TOTAL_WEEKS} weeks total
          </span>
        </div>

        {/* Week numbers */}
        <div style={{ display: "flex", marginLeft: 90, marginBottom: 4 }}>
          {Array.from({ length: TOTAL_WEEKS }, (_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                textAlign: "center",
                fontFamily: fonts.data,
                fontSize: 8,
                color: i + 1 === timeSlider ? colors.accent : colors.textDim,
                fontWeight: i + 1 === timeSlider ? 700 : 400,
              }}
            >
              {(i + 1) % 2 === 1 ? i + 1 : ""}
            </div>
          ))}
          <div style={{ width: 60, flexShrink: 0 }} />
        </div>

        {/* Gantt bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {phasesWithStatus.map((phase) => (
            <GanttBar key={phase.id} phase={phase} totalWeeks={TOTAL_WEEKS} />
          ))}
        </div>

        {/* Time slider */}
        <div style={{ marginTop: 10, marginLeft: 90, marginRight: 60 }}>
          <input
            type="range"
            className="timeline-slider"
            min={1}
            max={TOTAL_WEEKS}
            step={0.5}
            value={timeSlider}
            onChange={(e) => setTimeSlider(parseFloat(e.target.value))}
            style={{ background: sliderBg }}
          />
        </div>
      </div>
    </div>
  );
}
