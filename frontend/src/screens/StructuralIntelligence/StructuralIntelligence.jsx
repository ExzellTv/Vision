import React, { useState, useEffect, useRef, useCallback } from "react";
import { colors, fonts, card, radii } from "../../theme/tokens";
import { complianceApi, projectsApi } from "../../services/api";
import { useProject } from "../../hooks/useProjectStore";

// ─── Structural params defaults ────────────────────────────────────────────
const _DEFAULT_PARAMS = {
  span_ft: 24, stories: 2, foundation_type: "slab",
  dead_load_psf: 25, live_load_psf: 40, section_designation: "W14x22",
  wind_load_psf: 0, snow_load_psf: 5, seismic_factor: 0.15,
  tributary_width_ft: 8, footing_area_sf: 4, story_height_ft: 9,
};

const MATERIALS = [
  { name: "Lumber & Framing",    color: colors.wood },
  { name: "Concrete Foundation", color: colors.concrete },
  { name: "Steel Reinforcement", color: colors.steel },
  { name: "Labor & Overhead",    color: colors.accent },
];

// ─── Derive structural building context from a real MongoDB project ──────────
// materials[0] = Foundation layer, materials[1] = Structural Frame layer
function deriveContextFromProject(project) {
  if (!project) return null;
  const fp  = project.floor_plan      || {};
  const gp  = project.generate_params || {};
  const mats = project.materials      || [];
  const dims = fp.dimensions || {};

  const totalSF  = fp.totalSF || dims.total_sf || gp.targetSF || 2200;
  const stories  = fp.stories || dims.stories  || gp.stories  || 2;

  // Compute beam span from the longest room dimension (most realistic for residential)
  const rooms = fp.rooms || [];
  let maxRoomSpan = 0;
  for (const r of rooms) {
    const bigger = Math.max(r.w || r.width || 0, r.h || r.depth || 0);
    if (bigger > maxRoomSpan) maxRoomSpan = bigger;
  }
  const fpWidth = fp.width || dims.footprint_width || Math.sqrt(totalSF / stories) || 44;
  // Prefer longest room span; fall back to footprint width
  const rawSpan = maxRoomSpan > 8 ? maxRoomSpan : fpWidth;
  const span_ft  = Math.max(16, Math.min(48, Math.round(rawSpan)));

  // Foundation type from layer 0
  const foundMat = (mats[0]?.material || "Slab").toLowerCase();
  const foundation_type = foundMat.includes("pier")  ? "pier_and_beam"
                        : foundMat.includes("crawl") ? "crawl_space"
                        : "slab_on_grade";

  // Framing and dead load from layer 1 (realistic residential per ASCE 7-22)
  const framMat      = mats[1]?.material || "Wood SPF";
  const framLower    = framMat.toLowerCase();
  const dead_load_psf = framLower.includes("concrete") ? 55
                      : framLower.includes("steel") || framLower.includes("metal") ? 35
                      : 25;

  const live_load_psf = 40, snow_load_psf = 5, trib_w = 8, E_ksi = 29000;

  // Auto-select lightest AISC section that passes flex AND deflection
  const SECTIONS = [
    { name: "W14x22", Ix: 199, Sx: 29.0, Zx: 33.2 },
    { name: "W14x30", Ix: 291, Sx: 42.0, Zx: 47.3 },
    { name: "W16x36", Ix: 448, Sx: 56.5, Zx: 64.0 },
    { name: "W18x50", Ix: 800, Sx: 88.9, Zx: 101.0 },
    { name: "W21x62", Ix: 1330, Sx: 127.0, Zx: 144.0 },
    { name: "W24x84", Ix: 2370, Sx: 196.0, Zx: 224.0 },
  ];
  const L_in_sel = span_ft * 12;
  const lc2_sel  = 1.2 * dead_load_psf + 1.6 * live_load_psf;
  const M_sel    = (lc2_sel * trib_w / 12) * L_in_sel * L_in_sel / 8;
  const w_svc_sel = (dead_load_psf + live_load_psf) * trib_w / 12;
  const d_allow  = L_in_sel / 360;
  let section = SECTIONS[SECTIONS.length - 1].name;
  let Ix_in4 = SECTIONS[SECTIONS.length - 1].Ix;
  let Sx_in3 = SECTIONS[SECTIONS.length - 1].Sx;
  let Zx_in3 = SECTIONS[SECTIONS.length - 1].Zx;
  for (const s of SECTIONS) {
    const fr = M_sel / (0.9 * 50 * s.Zx * 1000);
    const dr = (5 * w_svc_sel * Math.pow(L_in_sel, 4) / (384 * E_ksi * 1000 * s.Ix)) / d_allow;
    if (fr <= 1.0 && dr <= 1.0) {
      section = s.name; Ix_in4 = s.Ix; Sx_in3 = s.Sx; Zx_in3 = s.Zx;
      break;
    }
  }

  // Closed-form calcs: M = wL²/8, V = wL/2, Δ = 5wL⁴/(384EI)
  const w_klf         = (dead_load_psf + live_load_psf) * trib_w / 1000;
  const L             = span_ft;
  const max_moment_kip_ft  = Math.round(w_klf * L * L / 8 * 100) / 100;
  const max_shear_kips     = Math.round(w_klf * L / 2 * 100) / 100;
  const L_in               = L * 12;
  const max_deflection_in  = Math.round(
    5 * (w_klf / 12) * Math.pow(L_in, 4) / (384 * E_ksi * Ix_in4) * 1000
  ) / 1000;
  const footing_area_ft2   = Math.max(3.0, Math.round(
    (dead_load_psf + live_load_psf) * trib_w * L * stories / 2 / 2000 * 10
  ) / 10);

  // SCI — matches structural_engine.py formula exactly
  const norm    = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const fFactor = foundation_type === "pier_and_beam" ? 0.7
                : foundation_type === "crawl_space"   ? 0.5 : 0.2;
  const sci_score = Math.round(
    (0.35 * norm(span_ft, 12, 40) + 0.25 * norm(stories, 1, 5)
    + 0.20 * fFactor + 0.20 * norm(dead_load_psf + live_load_psf, 60, 200)) * 100
  ) / 10;

  return {
    span_ft: L, stories, total_sf: totalSF, foundation_type,
    framing_material: framMat, section, Ix_in4, Sx_in3, Zx_in3, Fy_ksi: 50,
    dead_load_psf, live_load_psf, snow_load_psf,
    max_moment_kip_ft, max_shear_kips, max_deflection_in,
    footing_area_ft2, total_reaction_lbs: Math.round(max_shear_kips * 1000),
    story_drift_ratio: 0.018, sci_score,
  };
}

// ─── Badge ───────────────────────────────────────────────────────────────────
const BADGE_CFG = {
  PASS:     { bg: colors.successDim,          border: colors.success,   text: colors.success,   dot: colors.success },
  WARNING:  { bg: colors.warnDim,             border: colors.warn,      text: colors.warn,      dot: colors.warn },
  FAIL:     { bg: colors.dangerDim,           border: colors.danger,    text: colors.danger,    dot: colors.danger },
  NOMINAL:  { bg: colors.accentGlow,          border: colors.accent,    text: colors.accent,    dot: colors.accent },
  MARGINAL: { bg: colors.warnDim,             border: colors.warn,      text: colors.warn,      dot: colors.warn },
  CALC:     { bg: "rgba(59,130,246,0.15)",    border: colors.secondary, text: "#93c5fd",        dot: colors.secondary },
};

function Badge({ status }) {
  const c = BADGE_CFG[status] || BADGE_CFG.PASS;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: radii.sm,
      border: `1px solid ${c.border}`, background: c.bg,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
      color: c.text, fontFamily: fonts.data,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

// ─── MetricBar ───────────────────────────────────────────────────────────────
function MetricBar({ value, max, color: barColor }) {
  return (
    <div style={{ background: colors.panelBorder, borderRadius: 3, height: 6, overflow: "hidden", margin: "8px 0 4px" }}>
      <div style={{
        height: "100%", borderRadius: 3,
        width: `${Math.min((value / max) * 100, 100)}%`,
        background: barColor,
        transition: "width 1s cubic-bezier(.4,0,.2,1)",
      }} />
    </div>
  );
}

// ─── metricBlock style ───────────────────────────────────────────────────────
const metricBlock = {
  background: colors.panel,
  border: `1px solid ${colors.cardBorder}`,
  borderRadius: radii.md,
  padding: "14px 16px",
  marginBottom: 12,
};

// ─── AI Diagnosis Button ─────────────────────────────────────────────────────
function AIDiagnosisBtn({ hasIssues, loading, onClick, hasCached }) {
  const disabled = (!hasIssues && !hasCached) || loading;
  const label = loading ? "Analyzing..." : hasCached ? "Open AI Analysis" : "AI Analysis";
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={!hasIssues && !hasCached ? "Nothing to analyze — all checks passed" : hasCached ? "View cached AI diagnosis" : "Run AI diagnosis on failed/marginal items"}
      style={{
        fontFamily: fonts.data, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 12px", borderRadius: radii.sm, border: "none",
        color: disabled ? colors.textDim : "#0d1117",
        background: disabled ? colors.panel : hasCached ? colors.accent : colors.warn,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "all 0.15s ease",
      }}
    >
      <span style={{ fontSize: 13 }}>⚡</span>
      {label}
    </button>
  );
}

// ─── DiagnosisModal (centered overlay) ───────────────────────────────────────
function DiagnosisModal({ diagnoses, open, onClose }) {
  if (!open || !diagnoses || diagnoses.length === 0) return null;
  const sevColor = (s) => s === "critical" ? colors.danger : colors.warn;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 600, maxHeight: "80vh", overflowY: "auto",
          background: colors.card, border: `1px solid ${colors.warn}`,
          borderRadius: radii.md, padding: 24,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <span style={{ fontSize: 16 }}>🔍</span>
          <span style={{ fontFamily: fonts.label, fontSize: 16, fontWeight: 700, color: colors.textBright }}>AI Diagnosis Report</span>
          <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, marginLeft: "auto", marginRight: 12 }}>Gemini 2.5 Flash</span>
          <button
            onClick={onClose}
            style={{
              background: "none", border: `1px solid ${colors.cardBorder}`, borderRadius: radii.sm,
              color: colors.textDim, cursor: "pointer", fontSize: 16, lineHeight: 1,
              padding: "2px 8px", fontFamily: fonts.data,
            }}
          >
            ✕
          </button>
        </div>

        {/* Diagnosis items */}
        {diagnoses.map((d, i) => (
          <div key={i} style={{ background: colors.panel, border: `1px solid ${colors.cardBorder}`, borderRadius: radii.md, padding: 14, marginBottom: i < diagnoses.length - 1 ? 12 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 13, fontWeight: 600, color: sevColor(d.severity) }}>{d.item_name}</span>
              <span style={{
                fontFamily: fonts.data, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                padding: "2px 8px", borderRadius: radii.sm,
                background: d.severity === "critical" ? colors.dangerDim : colors.warnDim,
                color: sevColor(d.severity),
                border: `1px solid ${sevColor(d.severity)}`,
              }}>
                {d.severity?.toUpperCase()}
              </span>
            </div>
            <div style={{ fontFamily: fonts.data, fontSize: 12, color: colors.text, lineHeight: 1.5, marginBottom: 10 }}>
              {d.root_cause}
            </div>
            <div style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, letterSpacing: "0.08em", marginBottom: 6 }}>RECOMMENDATIONS</div>
            {(d.recommendations || []).map((rec, j) => (
              <div key={j} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.accent, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{j + 1}.</span>
                <span style={{ fontFamily: fonts.data, fontSize: 12, color: colors.text, lineHeight: 1.4 }}>{rec}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ComplianceScreen ────────────────────────────────────────────────────────
function ComplianceScreen({ selectedProject, setSelectedProject, projects, projectContext }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [checks, setChecks] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loads, setLoads] = useState(null);
  const [governing, setGoverning] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagnoses, setDiagnoses] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  // Track the full result for passing to diagnosis
  const [lastResult, setLastResult] = useState(null);
  // Cache diagnosis results per project so re-opening doesn't re-run
  const diagCacheRef = useRef({});
  const lastProjectRef = useRef(selectedProject);
  const hasAutoRun = useRef(false);

  // Clear stale results and auto-run when project changes
  if (lastProjectRef.current !== selectedProject) {
    lastProjectRef.current = selectedProject;
    setDiagnoses(null);
    setModalOpen(false);
    setChecks([]);
    setMetrics(null);
    setLoads(null);
    setGoverning(null);
    setLastResult(null);
    hasAutoRun.current = false;
  }

  useEffect(() => {
    if (selectedProject && !hasAutoRun.current) {
      hasAutoRun.current = true;
      runCheckFn();
    }
  }, [selectedProject, projectContext]);

  const hasIssues = checks.some(c => c.status === "FAIL" || c.status === "WARNING")
    || [metrics?.max_drift, metrics?.max_deflection, metrics?.base_shear].some(m => m && (m.status === "MARGINAL" || m.status === "FAIL"));

  const runCheckFn = () => {
    setLoading(true);
    setError(null);
    // Clear cached diagnosis on fresh generate
    setDiagnoses(null);
    delete diagCacheRef.current[selectedProject];
    complianceApi.check(selectedProject, projectContext)
      .then(data => {
        setChecks(data.checks || []);
        setMetrics(data.metrics || null);
        setLoads(data.loads || null);
        setGoverning(data.governing_combination || null);
        setLastResult(data);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  const runCheck = runCheckFn;

  const handleDiagnosisClick = useCallback(() => {
    // If we have cached results for this project, just open the modal
    const cached = diagCacheRef.current[selectedProject];
    if (cached) {
      setDiagnoses(cached);
      setModalOpen(true);
      return;
    }
    // Otherwise run the diagnosis
    if (!lastResult || !hasIssues) return;
    setDiagLoading(true);
    complianceApi.diagnose("compliance", lastResult, 1, projectContext)
      .then(data => {
        const diags = data.diagnoses || [];
        setDiagnoses(diags);
        diagCacheRef.current[selectedProject] = diags;
        setModalOpen(true);
      })
      .catch(err => setError(err.message))
      .finally(() => setDiagLoading(false));
  }, [lastResult, hasIssues, selectedProject]);

  const drift = metrics?.max_drift;
  const deflection = metrics?.max_deflection;
  const shear = metrics?.base_shear;

  const metricColor = (status) => {
    if (status === "NOMINAL") return `linear-gradient(90deg,${colors.success},#4ade80)`;
    if (status === "MARGINAL") return `linear-gradient(90deg,${colors.warn},#fbbf24)`;
    if (status === "FAIL") return `linear-gradient(90deg,${colors.danger},#f87171)`;
    return `linear-gradient(90deg,${colors.secondary},#60a5fa)`;
  };

  // Parse governing formula into styled spans
  const renderFormula = (formula) => {
    if (!formula) return null;
    const parts = formula.split(/(\d+\.?\d*)/);
    return parts.map((p, i) => {
      if (/^\d+\.?\d*$/.test(p)) {
        return <span key={i} style={{ color: colors.secondary }}>{p}</span>;
      }
      return <span key={i} style={{ color: colors.textBright }}>{p}</span>;
    });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: 20, alignItems: "stretch", minHeight: "calc(100% - 40px)" }}>
      {/* Left column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card, position: "relative" }}>
        {loading && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(13,17,23,0.7)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: radii.md, zIndex: 2 }}>
            <span style={{ fontFamily: fonts.data, fontSize: 12, color: colors.accent }}>Evaluating compliance...</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: fonts.label, fontSize: 15, fontWeight: 700, color: colors.textBright }}>Validation Protocol</span>
            <AIDiagnosisBtn hasIssues={hasIssues} loading={diagLoading} onClick={handleDiagnosisClick} hasCached={!!diagCacheRef.current[selectedProject]} />
          </div>
          <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim, border: `1px solid ${colors.cardBorder}`, padding: "2px 8px", borderRadius: radii.sm }}>
            IBC 2021 // ASCE 7-22
          </span>
        </div>

        {error && (
          <div style={{ padding: "8px 12px", marginBottom: 12, borderRadius: radii.sm, background: colors.dangerDim, border: `1px solid ${colors.danger}` }}>
            <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.danger }}>{error}</span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 70px 90px", gap: 8, padding: "0 0 8px", borderBottom: `1px solid ${colors.cardBorder}`, marginBottom: 4 }}>
          {["COMPLIANCE CHECK", "STANDARD", "FACTOR", "STATUS"].map(h => (
            <span key={h} style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, fontWeight: 700, letterSpacing: "0.08em" }}>{h}</span>
          ))}
        </div>
        {!metrics && !loading && (
            <div style={{ fontFamily: fonts.data, fontSize: 12, color: colors.textDim, padding: "20px 0", textAlign: "center" }}>Select a project to view metrics</div>
          )}

        {checks.map((c, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "1fr 110px 70px 90px",
            gap: 8, padding: "11px 0", borderBottom: `1px solid ${colors.panel}`,
            alignItems: "center",
          }}>
            <span style={{ fontFamily: fonts.label, fontSize: 13, fontWeight: 500, color: c.status === "FAIL" ? colors.danger : colors.text }}>
              {c.name}
            </span>
            <span style={{ fontFamily: fonts.data, fontSize: 12, color: colors.textDim }}>{c.standard}</span>
            <span style={{ fontFamily: fonts.data, fontSize: 13, color: parseFloat(c.factor) > 1 ? colors.danger : colors.text }}>
              {c.factor}
            </span>
            <Badge status={c.status} />
          </div>
        ))}

        {/* AI Diagnosis Modal */}
        <DiagnosisModal diagnoses={diagnoses} open={modalOpen} onClose={() => setModalOpen(false)} />
      </div>

        {/* Projects */}
        <div style={{ ...card, maxHeight: 300, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 15, fontWeight: 700, color: colors.textBright }}>Projects</span>
            </div>
            <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, border: `1px solid ${colors.cardBorder}`, padding: "2px 8px", borderRadius: radii.sm }}>
              {(projects || []).length} total
            </span>
          </div>
          <button
            onClick={runCheck}
            disabled={loading}
            style={{
              fontFamily: fonts.data, fontSize: 12, fontWeight: 600,
              color: loading ? colors.textDim : "#0d1117",
              background: loading ? colors.panel : colors.accent,
              border: "none", borderRadius: radii.sm,
              padding: "8px 20px", cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.15s ease", letterSpacing: "0.04em",
            }}
          >
            {loading ? "Evaluating..." : "Generate"}
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", flex: 1, minHeight: 0, paddingRight: 4 }}>
            {(projects || []).length === 0 ? (
              <div style={{ fontFamily: fonts.data, fontSize: 12, color: colors.textDim, padding: "20px 0", textAlign: "center" }}>
                No saved projects — create one in Develop
              </div>
            ) : (projects || []).map(p => {
              const active = p.id === selectedProject;
              const sqft   = p.floor_plan?.totalSF || p.generate_params?.targetSF || 0;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProject(p.id)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "9px 12px", borderRadius: radii.md, cursor: "pointer",
                    border: `1px solid ${active ? colors.accent : colors.cardBorder}`,
                    background: active ? colors.accentDim : colors.panel,
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block",
                      background: active ? colors.accent : colors.cardBorder,
                    }} />
                    <span style={{
                      fontFamily: fonts.label, fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      color: active ? colors.textBright : colors.text,
                    }}>
                      {p.name}
                    </span>
                  </div>
                  <span style={{ fontFamily: fonts.data, fontSize: 11, color: active ? colors.accent : colors.textDim, flexShrink: 0 }}>
                    {sqft ? sqft.toLocaleString() + " sf" : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>{/* end left column */}

      {/* Right column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Critical Metrics */}
        <div style={{ ...card }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <span style={{ fontFamily: fonts.label, fontSize: 15, fontWeight: 700, color: colors.textBright }}>Critical Metrics</span>
          </div>

          {drift && (
          <div style={metricBlock}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, letterSpacing: "0.1em" }}>MAX DRIFT RATIO</span>
              <Badge status={drift.status} />
            </div>
            <div style={{ fontFamily: fonts.data, fontSize: 38, fontWeight: 800, color: colors.textBright, lineHeight: 1.1, marginTop: 6 }}>
              {drift.value}<span style={{ fontSize: 15, color: colors.textDim }}>{drift.unit}</span>
            </div>
            <MetricBar value={drift.value} max={drift.limit} color={metricColor(drift.status)} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>ACTUAL</span>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>LIMIT: {drift.limit}{drift.unit.toUpperCase()}</span>
            </div>
          </div>
          )}

          {deflection && (
          <div style={metricBlock}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, letterSpacing: "0.1em" }}>MAX DEFLECTION</span>
              <Badge status={deflection.status} />
            </div>
            <div style={{ fontFamily: fonts.data, fontSize: 38, fontWeight: 800, color: colors.textBright, lineHeight: 1.1, marginTop: 6 }}>
              {deflection.value}<span style={{ fontSize: 15, color: colors.textDim }}>{deflection.unit}</span>
            </div>
            <MetricBar value={deflection.value} max={deflection.limit} color={metricColor(deflection.status)} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>ACTUAL</span>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>ALLOWABLE: {deflection.limit} {deflection.unit.toUpperCase()}</span>
            </div>
          </div>
          )}

          {shear && (
          <div style={{ ...metricBlock, marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, letterSpacing: "0.1em" }}>TOTAL BASE SHEAR</span>
              <Badge status={shear.status} />
            </div>
            <div style={{ fontFamily: fonts.data, fontSize: 38, fontWeight: 800, color: colors.textBright, lineHeight: 1.1, marginTop: 6 }}>
              {shear.value}<span style={{ fontSize: 15, color: colors.textDim }}> {shear.unit}</span>
            </div>
            <MetricBar value={shear.value} max={shear.limit} color={metricColor(shear.status)} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>APPLIED</span>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>CAPACITY: {shear.limit} {shear.unit.toUpperCase()}</span>
            </div>
          </div>
          )}

          {!metrics && !loading && (
            <div style={{ fontFamily: fonts.data, fontSize: 12, color: colors.textDim, padding: "20px 0", textAlign: "center" }}>Select a project to view metrics</div>
          )}
        </div>

        {/* Load Sequence Analysis */}
        <div style={{ ...card}}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: fonts.label, fontSize: 15, fontWeight: 700, color: colors.textBright }}>Load Sequence Analysis</span>
            </div>
          </div>

          <div style={{ background: colors.panel, border: `1px solid ${colors.cardBorder}`, borderRadius: radii.md, padding: 16, marginBottom: 16 }}>
            <div style={{ fontFamily: fonts.data, fontSize: 10, color: colors.accent, letterSpacing: "0.1em", marginBottom: 10 }}>
              {governing ? governing.label : "PRIMARY COMBINATION MATRIX"}
            </div>
            <div style={{ fontFamily: fonts.data, fontSize: 20, lineHeight: 1.6 }}>
              {governing ? renderFormula(governing.formula) : (
                <span style={{ color: colors.textDim }}>Awaiting evaluation...</span>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "DEAD LOAD (D)",  value: loads ? loads.D.toFixed(2) : "--",  unit: "psf" },
              { label: "LIVE LOAD (L)",  value: loads ? loads.L.toFixed(2) : "--", unit: "psf" },
              { label: "SNOW LOAD (S)",  value: loads ? loads.S.toFixed(2) : "--",  unit: "psf" },
              { label: "ROOF LIVE (LR)", value: loads ? loads.Lr.toFixed(2) : "--",  unit: "psf" },
            ].map(m => (
              <div key={m.label}>
                <div style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, letterSpacing: "0.08em", marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontFamily: fonts.data, fontSize: 19, fontWeight: 700, color: colors.textBright }}>
                  {m.value}<span style={{ fontSize: 12, color: colors.textDim }}> {m.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function StructuralIntelligence() {
  const project = useProject();
  const bc = project.buildingContext || {};
  const [mongoProjects, setMongoProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);

  // Load real projects from MongoDB on mount
  useEffect(() => {
    projectsApi.list()
      .then(ps => {
        setMongoProjects(ps);
        if (ps.length > 0) setSelectedProject(ps[0].id);
      })
      .catch(() => {});
  }, []);

  // Derive building context from the selected project's real data; fall back to store context
  const selectedProjectData    = mongoProjects.find(p => p.id === selectedProject) || null;
  const selectedProjectContext = deriveContextFromProject(selectedProjectData) || bc;

  return (
    <div style={{ height: "100%", background: colors.bgGradient, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "14px 20px 10px", flexShrink: 0, borderBottom: `1px solid ${colors.cardBorder}` }}>
        <div>
          <div style={{ fontFamily: fonts.data, fontSize: 10, color: colors.accent, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 4 }}>
            ENGINEERING VALIDATION SYSTEMS
          </div>
          <h1 style={{ fontFamily: fonts.label, fontSize: 20, fontWeight: 700, color: colors.textBright, margin: 0 }}>
            Structural <span style={{ color: colors.accent }}>Intelligence</span> Visualization
          </h1>
          <p style={{ fontFamily: fonts.label, fontSize: 12, color: colors.textDim, margin: "4px 0 0" }}>
            {selectedProjectContext.section || "W14x22"} · {selectedProjectContext.span_ft || 24}ft span · {selectedProjectContext.stories || 2} stories · {(selectedProjectContext.total_sf || 2200).toLocaleString()} SF · {selectedProjectContext.framing_material || "Wood SPF"} — Advisory only
          </p>
        </div>

      </div>

      {/* ── Code Compliance ── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <ComplianceScreen selectedProject={selectedProject} setSelectedProject={setSelectedProject} projects={mongoProjects} projectContext={selectedProjectContext} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", borderTop: `1px solid ${colors.cardBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors.success, display: "inline-block" }} />
            <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim }}>System Online</span>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            {["Vision Platform v2.4.0", "IBC 2021", "ASCE 7-22"].map(t => (
              <span key={t} style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim, cursor: "pointer" }}>{t}</span>
            ))}
          </div>
        </div>
      </div>


    </div>
  );
}
