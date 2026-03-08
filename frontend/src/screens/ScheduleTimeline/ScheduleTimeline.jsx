import React, { useState, useEffect, useRef, useCallback, useMemo, Component } from "react";
import * as THREE from "three";
import { colors, fonts, card, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import { projectsApi } from "../../services/api";
import StatusBadge from "../../components/shared/StatusBadge";
import DisclaimerBanner from "../../components/shared/DisclaimerBanner";
import {
  createLayerMaterials, MATERIAL_KEY_MAP,
  updateDims, updateRooms, rebuildLayerGroups,
  buildScene, setupLighting, createOrbitControls,
} from "../LayerEditor/LayerEditor";

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

/* ─── Construction phase config: 8 material layers → build sequence ─── */
const LAYER_PHASE_CONFIG = [
  { layerIdx: 0, name: "Foundation",        durationWeeks: 3,  threeIdx: 0 },
  { layerIdx: 1, name: "Structural Frame",  durationWeeks: 4,  threeIdx: 1 },
  { layerIdx: 2, name: "Sheathing",         durationWeeks: 2,  threeIdx: 2 },
  { layerIdx: 7, name: "Roof",              durationWeeks: 2,  threeIdx: 2 },
  { layerIdx: 3, name: "Insulation",        durationWeeks: 2,  threeIdx: 3 },
  { layerIdx: 4, name: "Drywall",           durationWeeks: 2,  threeIdx: 3 },
  { layerIdx: 5, name: "Exterior Cladding", durationWeeks: 3,  threeIdx: 4 },
  { layerIdx: 6, name: "Paint & Finish",    durationWeeks: 1,  threeIdx: 4 },
];

// Pinned to today in the app
const TODAY = new Date("2026-03-07");

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

/* ─── Build schedule from project layer materials ─── */
function buildSchedule(startDate, materials) {
  let cursor = new Date(startDate);
  return LAYER_PHASE_CONFIG.map((cfg, i) => {
    const mat = materials?.[cfg.layerIdx];
    const start = new Date(cursor);
    const end = addWeeks(cursor, cfg.durationWeeks);
    cursor = new Date(end);
    let status;
    if (TODAY >= end) status = "complete";
    else if (TODAY >= start) status = "active";
    else status = "planned";
    return {
      id: i + 1,
      name: cfg.name,
      material: mat?.material || "—",
      cost: mat?.cost ?? 0,
      durationWeeks: cfg.durationWeeks,
      startDate: start,
      endDate: end,
      threeIdx: cfg.threeIdx,
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

/* ─── Main Component ─── */
function ScheduleTimelineInner() {
  const project        = useProject();
  const canvasRef      = useRef(null);
  const sceneRef       = useRef(null);
  const layerGroupsRef = useRef([]);
  const matsRef        = useRef(null);
  const controlsRef    = useRef(null);
  const animFrameRef   = useRef(null);
  const disposedRef    = useRef(false);

  const [startDateStr, setStartDateStr] = useState(() => TODAY.toISOString().slice(0, 10));
  const [timeSlider,   setTimeSlider]   = useState(1);
  const [saving,       setSaving]       = useState(false);
  const [saveStatus,   setSaveStatus]   = useState(null);

  const projectName = project.projectName || "New Project";
  const stories     = project.stories     || 1;
  const totalSF     = project.totalSF     || 2200;

  const bc = project.buildingContext || {};

  const schedule = useMemo(
    () => buildSchedule(new Date(startDateStr), project.materials),
    [startDateStr, project.materials],
  );
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
  const overallPct      = totalWeeks > 0 ? Math.min(100, Math.round((todayWeek / totalWeeks) * 100)) : 0;

  const sliderDate = useMemo(() => fmtDate(addWeeks(projectStart, timeSlider)), [projectStart, timeSlider]);
  const sliderPhase = useMemo(() => {
    return schedule.find((p) => {
      const sw = weeksBetween(projectStart, p.startDate);
      const ew = weeksBetween(projectStart, p.endDate);
      return timeSlider >= sw && timeSlider < ew;
    })?.name ?? (timeSlider >= totalWeeks ? "Complete" : schedule[0]?.name ?? "");
  }, [timeSlider, schedule, projectStart, totalWeeks]);

  // Re-init slider to today when start date changes
  useEffect(() => {
    setTimeSlider(Math.max(0.5, Math.min(totalWeeks || 1, todayWeek || 1)));
  }, [startDateStr]); // eslint-disable-line

  /* ─── Three.js Init: Full LayerEditor Model ─── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    disposedRef.current = false;

    updateDims(project.footprintWidth, project.footprintDepth);
    updateRooms(project.floorPlan?.rooms, project.storyPlans);

    const { renderer, scene, camera } = buildScene(canvas);
    const mats = createLayerMaterials();
    matsRef.current = mats;
    setupLighting(scene);

    const foundationType = project.materials?.[0]?.materialIndex ?? 0;
    const roofType = project.materials?.[7]?.materialIndex ?? 0;
    const layerGroups = rebuildLayerGroups(scene, mats, foundationType, roofType);
    layerGroupsRef.current = layerGroups;

    // Apply user-selected materials for non-foundation/roof layers
    (project.materials || []).forEach((m, i) => {
      if (i === 0 || i === 7 || i >= 8 || !m) return;
      const matKey = MATERIAL_KEY_MAP[i]?.[m.materialIndex ?? 0];
      if (matKey && mats[matKey] && layerGroups[i]) {
        layerGroups[i].traverse((child) => {
          if (child.isMesh) child.material = mats[matKey];
        });
      }
    });

    // Apply custom paint colors (wall color on paint layer 6, roof color on roof layer 7)
    const wallColor = (project.materials || [])[6]?.wallColor;
    const roofColor = (project.materials || [])[7]?.roofColor;
    if (wallColor && layerGroups[6]) {
      const wc = new THREE.Color(wallColor);
      layerGroups[6].traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.material.color = wc;
          child.material.needsUpdate = true;
        }
      });
    }
    if (roofColor && layerGroups[7]) {
      const rc = new THREE.Color(roofColor);
      layerGroups[7].traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.material.color = rc;
          child.material.needsUpdate = true;
        }
      });
    }

    // Clone materials so per-layer opacity changes don't bleed across layers
    layerGroups.forEach(g => {
      if (!g) return;
      g.traverse(child => {
        if (child.isMesh && child.material) child.material = child.material.clone();
      });
    });

    // Initially hide all layers (schedule slider reveals them)
    layerGroups.forEach(g => { if (g) g.visible = false; });

    const controls = createOrbitControls(camera, canvas);
    controlsRef.current = controls;
    sceneRef.current = { renderer, scene, camera };

    const resize = () => {
      if (disposedRef.current) return;
      const p = canvas.parentElement;
      if (!p) return;
      renderer.setSize(p.clientWidth, p.clientHeight);
      camera.aspect = p.clientWidth / p.clientHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    const animate = () => {
      if (disposedRef.current) return;
      animFrameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposedRef.current = true;
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animFrameRef.current);
      controls.dispose();
      renderer.dispose();
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line

  /* ─── Sync layer visibility with timeline slider ─── */
  useEffect(() => {
    const groups = layerGroupsRef.current;
    if (!groups || groups.length === 0) return;

    LAYER_PHASE_CONFIG.forEach((cfg, phaseIdx) => {
      const phase = schedule[phaseIdx];
      if (!phase || !groups[cfg.layerIdx]) return;

      const phaseStartWeek = weeksBetween(projectStart, phase.startDate);
      const phaseEndWeek = weeksBetween(projectStart, phase.endDate);

      if (timeSlider >= phaseEndWeek) {
        groups[cfg.layerIdx].visible = true;
        groups[cfg.layerIdx].traverse(child => {
          if (child.isMesh && child.material) {
            child.material.transparent = false;
            child.material.opacity = 1;
            child.material.needsUpdate = true;
          }
        });
      } else if (timeSlider >= phaseStartWeek) {
        groups[cfg.layerIdx].visible = true;
        const span = phaseEndWeek - phaseStartWeek;
        const progress = span > 0 ? (timeSlider - phaseStartWeek) / span : 1;
        groups[cfg.layerIdx].traverse(child => {
          if (child.isMesh && child.material) {
            child.material.transparent = true;
            child.material.opacity = 0.3 + progress * 0.7;
            child.material.needsUpdate = true;
          }
        });
      } else {
        groups[cfg.layerIdx].visible = false;
      }
    });
  }, [timeSlider, schedule, projectStart]);

  const handleSave = useCallback(async () => {
    setSaving(true); setSaveStatus(null);
    try {
      const payload = {
        name: projectName,
        schedule: {
          startDate: startDateStr, totalWeeks,
          phases: schedule.map((p) => ({ ...p, startDate: p.startDate.toISOString(), endDate: p.endDate.toISOString() })),
        },
      };
      let saved;
      if (project.projectId) saved = await projectsApi.update(project.projectId, payload);
      else                    saved = await projectsApi.create(payload);
      if (saved?.id) project.setProjectId(saved.id);
      setSaveStatus("ok"); setTimeout(() => setSaveStatus(null), 2500);
    } catch (_) { setSaveStatus("err"); setTimeout(() => setSaveStatus(null), 2500); }
    finally { setSaving(false); }
  }, [projectName, project, schedule, startDateStr, totalWeeks]);

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

  const sliderPct = totalWeeks > 0 ? (timeSlider / totalWeeks) * 100 : 0;
  const sliderBg  = `linear-gradient(to right,${colors.accent} 0%,${colors.accent} ${sliderPct}%,${colors.panelBorder} ${sliderPct}%,${colors.panelBorder} 100%)`;

  return (
    <div style={{ height: "100%", background: colors.bgGradient, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ padding: "14px 20px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ fontFamily: fonts.label, fontSize: 20, fontWeight: 700, color: colors.textBright, margin: 0 }}>
                Construction Schedule
              </h1>
              <StatusBadge
                status={activePhase ? "active" : completedPhases.length === schedule.length ? "complete" : "planned"}
                size="lg"
              />
            </div>
            <p style={{ fontFamily: fonts.label, fontSize: 12, color: colors.textDim, margin: "3px 0 0" }}>
              {projectName} · {stories} {stories === 1 ? "Story" : "Stories"} · {totalSF.toLocaleString()} SF
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Project start date picker */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.6px" }}>
                Start Date
              </span>
              <input
                type="date"
                value={startDateStr}
                onChange={(e) => e.target.value && setStartDateStr(e.target.value)}
                style={{ background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: 6, color: colors.text, fontFamily: fonts.data, fontSize: 11, padding: "4px 8px", outline: "none", cursor: "pointer" }}
              />
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
          </div>
        </div>

        {/* Overall progress bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
          <span style={{ fontFamily: fonts.label, fontSize: 10, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.6px", flexShrink: 0 }}>Today</span>
          <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.accent, flexShrink: 0 }}>{fmtDateFull(TODAY)}</span>
          <div style={{ flex: 1, height: 4, background: colors.cardBorder, borderRadius: 2 }}>
            <div style={{ width: `${overallPct}%`, height: "100%", background: `linear-gradient(90deg,${colors.success},${colors.accent})`, borderRadius: 2, transition: "width 0.5s" }} />
          </div>
          <span style={{ fontFamily: fonts.data, fontSize: 11, fontWeight: 600, color: colors.accent, flexShrink: 0 }}>{overallPct}%</span>
          <span style={{ fontFamily: fonts.label, fontSize: 11, color: colors.textDim, flexShrink: 0 }}>
            {activePhase ? activePhase.name : completedPhases.length === schedule.length ? "Complete" : "Not Started"}
          </span>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", padding: "0 20px", gap: 16 }}>

        {/* Left — 3D Viewport */}
        <div style={{ flex: "0 0 55%", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ flex: 1, position: "relative", background: colors.panel, border: `1px solid ${colors.panelBorder}`, borderRadius: radii.lg, overflow: "hidden" }}>
            <canvas
              ref={canvasRef}
              style={{ width: "100%", height: "100%", display: "block", cursor: "grab" }}
            />
            <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "center", gap: 8, background: "rgba(15,20,32,0.88)", padding: "6px 12px", borderRadius: radii.md, border: `1px solid ${colors.panelBorder}` }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors.accent }} />
              <span style={{ fontFamily: fonts.label, fontSize: 11, color: colors.accent, fontWeight: 600 }}>{sliderPhase}</span>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>{sliderDate}</span>
            </div>
          </div>

          {/* Metric cards */}
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <div style={{ ...card, flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px" }}>Total Duration</span>
              <span style={{ fontFamily: fonts.data, fontSize: 20, fontWeight: 700, color: colors.textBright, lineHeight: 1.2 }}>{Math.round(totalWeeks)} wks</span>
              <span style={{ fontFamily: fonts.label, fontSize: 10, color: colors.textDim }}>≈ {Math.round(totalWeeks * 7 / 30)} months</span>
            </div>
            <div style={{ ...card, flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px" }}>Phases Done</span>
              <span style={{ fontFamily: fonts.data, fontSize: 20, fontWeight: 700, color: colors.textBright, lineHeight: 1.2 }}>
                {completedPhases.length}<span style={{ fontSize: 13, color: colors.textDim }}>/{schedule.length}</span>
              </span>
              <span style={{ fontFamily: fonts.label, fontSize: 10, color: colors.success }}>Complete</span>
            </div>
          </div>
        </div>

        {/* Right — Intelligence Panel */}
        <div style={{ flex: "0 0 45%", display: "flex", flexDirection: "column", gap: 10, overflow: "auto", paddingBottom: 8 }}>
          <DisclaimerBanner compact />

          {/* Cost summary */}
          <div style={{ ...card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 4 }}>
                  Total Project Cost
                </span>
                <span style={{ fontFamily: fonts.data, fontSize: 26, fontWeight: 700, color: colors.textBright, lineHeight: 1 }}>
                  {fmtCost(totalCost)}
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 4 }}>
                  Spent to Date
                </span>
                <span style={{ fontFamily: fonts.data, fontSize: 16, fontWeight: 700, color: colors.accent }}>
                  {fmtCost(Math.round(cumulativeCost))}
                </span>
              </div>
            </div>
          </div>

          {/* Progress gauge */}
          <div style={{ ...card, display: "flex", justifyContent: "center" }}>
            <ProgressGauge score={overallPct} size={100} />
          </div>

          {/* Phase × material list */}
          <div style={{ ...card }}>
            <span style={{ fontFamily: fonts.label, fontSize: 10, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 10 }}>
              Phase Materials
            </span>
            {schedule.map((ph) => (
              <div key={ph.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: phaseColor(ph.status), boxShadow: ph.status === "active" ? `0 0 6px ${colors.accent}` : "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: fonts.label, fontSize: 11, fontWeight: ph.status === "active" ? 600 : 400, color: ph.status === "active" ? colors.textBright : colors.text, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ph.name}
                  </span>
                  {ph.material !== "—" && (
                    <span style={{ fontFamily: fonts.label, fontSize: 10, color: colors.textDim }}>{ph.material}</span>
                  )}
                </div>
                <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, flexShrink: 0 }}>{fmtCost(ph.cost)}</span>
                <StatusBadge status={ph.status} />
              </div>
            ))}
          </div>

          {/* Building Context Summary — handoff to Structural Intelligence */}
          <div style={{ ...card }}>
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

      {/* ── Bottom — Gantt Timeline ── */}
      <div style={{ ...card, margin: "8px 20px 12px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: fonts.label, fontSize: 11, fontWeight: 700, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px" }}>
            Timeline
          </span>
          <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim }}>
            {fmtDateFull(projectStart)} → {completionDate ? fmtDateFull(completionDate) : "—"} · {Math.round(totalWeeks)} wks
          </span>
        </div>

        {/* Gantt rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {schedule.map((ph) => {
            const sw       = weeksBetween(projectStart, ph.startDate);
            const leftPct  = totalWeeks > 0 ? (sw / totalWeeks) * 100 : 0;
            const widthPct = totalWeeks > 0 ? (ph.durationWeeks / totalWeeks) * 100 : 0;
            const todayPct = totalWeeks > 0 ? Math.min(100, (todayWeek / totalWeeks) * 100) : 0;
            return (
              <div key={ph.id} style={{ display: "flex", alignItems: "center", gap: 8, height: 24 }}>
                <span style={{ fontFamily: fonts.label, fontSize: 11, width: 130, flexShrink: 0, color: ph.status === "active" ? colors.accent : colors.text, fontWeight: ph.status === "active" ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ph.name}
                </span>
                <div style={{ flex: 1, position: "relative", height: 13, background: colors.cardBorder, borderRadius: 4 }}>
                  <div style={{ position: "absolute", left: `${leftPct}%`, width: `${widthPct}%`, height: "100%", background: phaseColor(ph.status), borderRadius: 4, opacity: ph.status === "planned" ? 0.38 : 0.88, transition: "all 0.3s ease" }} />
                  {/* TODAY marker */}
                  {todayWeek >= 0 && todayWeek <= totalWeeks && (
                    <div style={{ position: "absolute", left: `${todayPct}%`, top: -4, bottom: -4, width: 2, background: colors.warn, borderRadius: 1, opacity: 0.9, pointerEvents: "none" }} />
                  )}
                </div>
                <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, width: 86, flexShrink: 0, textAlign: "right", whiteSpace: "nowrap" }}>
                  {fmtDate(ph.startDate)}–{fmtDate(ph.endDate)}
                </span>
              </div>
            );
          })}

          {/* TODAY arrow label */}
          {totalWeeks > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 14, marginTop: 1 }}>
              <span style={{ width: 130, flexShrink: 0, fontFamily: fonts.data, fontSize: 8, color: colors.warn, fontWeight: 700 }}>
                TODAY · {fmtDate(TODAY)}
              </span>
              <div style={{ flex: 1, position: "relative", height: "100%" }}>
                <div style={{ position: "absolute", left: `${Math.min(100, (todayWeek / totalWeeks) * 100)}%`, transform: "translateX(-50%)", fontFamily: fonts.data, fontSize: 10, color: colors.warn, lineHeight: 1 }}>▲</div>
              </div>
              <span style={{ width: 86, flexShrink: 0 }} />
            </div>
          )}
        </div>

        {/* 3D scrubber */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.6px", width: 130, flexShrink: 0 }}>
            Scrub 3D View
          </span>
          <input
            type="range" className="tl-slider"
            min={0} max={totalWeeks || 19} step={0.25}
            value={timeSlider}
            onChange={(e) => setTimeSlider(parseFloat(e.target.value))}
            style={{ flex: 1, background: sliderBg }}
          />
          <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.accent, fontWeight: 600, width: 86, flexShrink: 0, textAlign: "right" }}>
            {sliderDate}
          </span>
        </div>
      </div>
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
