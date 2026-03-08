import React, { useState, useEffect, useRef, useCallback } from "react";
import { colors, fonts, card, radii } from "../../theme/tokens";
import { complianceApi, structuralApi } from "../../services/api";

const SCREENS = { COMPLIANCE: "compliance", FORCE: "force" };

// ─── Project → structural params mapping (shared mock data) ─────────────────
// TODO [SWAP]: Replace with real project data. Options:
//   1. Fetch from API: const PROJECT_PARAMS = await projectsApi.getParams(projectId)
//   2. Or pass per-project params from a parent store / context
//   Remove _DEFAULT_PARAMS and PROJECT_PARAMS once real data is wired in.
const _DEFAULT_PARAMS = {
  span_ft: 24, stories: 2, foundation_type: "slab",
  dead_load_psf: 85, live_load_psf: 100, section_designation: "W14x22",
  wind_load_psf: 0, snow_load_psf: 5, seismic_factor: 0.15,
  tributary_width_ft: 8, footing_area_sf: 4, story_height_ft: 9,
};
const PROJECT_PARAMS = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [i + 1, { ..._DEFAULT_PARAMS }])
);

const MATERIALS = [
  { name: "Lumber & Framing",    color: colors.wood },
  { name: "Concrete Foundation", color: colors.concrete },
  { name: "Steel Reinforcement", color: colors.steel },
  { name: "Labor & Overhead",    color: colors.accent },
];

// TODO [SWAP]: Replace with real project list from API.
//   e.g. const [PROJECTS, setProjects] = useState([]); + useEffect fetching from projectsApi.list()
//   Each item needs: { id: number, name: string, sqft: number }
const PROJECTS = [
  { id: 1, name: "Highland Park Residence",  sqft: 4200  },
  { id: 2, name: "Oak Lawn Mixed-Use",        sqft: 12800 },
  { id: 3, name: "Uptown Townhomes",          sqft: 3650  },
  { id: 4, name: "Deep Ellum Live/Work",      sqft: 7900  },
  { id: 5, name: "Bishop Arts Duplex",        sqft: 2480  },
  { id: 6, name: "Bishop Arts Duplex",        sqft: 2480  },
  { id: 7, name: "Bishop Arts Duplex",        sqft: 2480  },
  { id: 8, name: "Bishop Arts Duplex",        sqft: 2480  },
  { id: 9, name: "Bishop Arts Duplex",        sqft: 2480  },
  { id: 10, name: "Bishop Arts Duplex",        sqft: 2480  },
];

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

// ─── BeamChart (canvas) ──────────────────────────────────────────────────────
function BeamChart({ type, w = 10, L = 5, E = 200, I = 450 }) {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    const pad = { l: 40, r: 20, t: 30, b: 30 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = colors.panelBorder; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (i / 4) * ph;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    }

    const N = 120;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * L;
      let y;
      if (type === "shear") {
        y = w * L / 2 - w * x;
      } else if (type === "moment") {
        y = (w * x * (L - x)) / 2;
      } else {
        const EI = E * 1e9 * I * 1e-12;
        const wN = w * 1000;
        y = -(wN * x * (Math.pow(L, 3) - 2 * L * x * x + Math.pow(x, 3))) / (24 * EI) * 1000;
      }
      pts.push({ x, y });
    }

    const ys = pts.map(p => p.y);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const yRange = yMax - yMin || 1;

    const toCanvas = (xi, yi) => ({
      cx: pad.l + (xi / L) * pw,
      cy: pad.t + (1 - (yi - yMin) / yRange) * ph,
    });

    const zero = toCanvas(0, 0);
    ctx.strokeStyle = colors.cardBorder; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pad.l, zero.cy); ctx.lineTo(W - pad.r, zero.cy); ctx.stroke();
    ctx.setLineDash([]);

    const lineColor = type === "deflection" ? colors.warn : colors.accent;
    const fillColor = type === "deflection" ? "rgba(255,159,67,0.12)" : "rgba(0,212,255,0.10)";

    ctx.beginPath();
    ctx.moveTo(toCanvas(pts[0].x, pts[0].y).cx, zero.cy);
    pts.forEach(p => { const c = toCanvas(p.x, p.y); ctx.lineTo(c.cx, c.cy); });
    ctx.lineTo(toCanvas(pts[pts.length - 1].x, pts[pts.length - 1].y).cx, zero.cy);
    ctx.closePath();
    ctx.fillStyle = fillColor; ctx.fill();

    ctx.beginPath();
    pts.forEach((p, i) => { const c = toCanvas(p.x, p.y); i === 0 ? ctx.moveTo(c.cx, c.cy) : ctx.lineTo(c.cx, c.cy); });
    ctx.strokeStyle = lineColor; ctx.lineWidth = 2.5; ctx.stroke();

    [[pts[0]], [pts[pts.length - 1]]].forEach(([p]) => {
      const c = toCanvas(p.x, p.y);
      ctx.beginPath(); ctx.arc(c.cx, c.cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = colors.warn; ctx.fill();
    });
    const mid = pts[Math.floor(N / 2)];
    const mc = toCanvas(mid.x, mid.y);
    ctx.beginPath(); ctx.arc(mc.cx, mc.cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = lineColor; ctx.fill();
    ctx.strokeStyle = colors.bg; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.setLineDash([4, 4]); ctx.strokeStyle = colors.cardBorder; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mc.cx, pad.t); ctx.lineTo(mc.cx, H - pad.b); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = colors.textDim; ctx.font = `10px ${fonts.data}`;
    ctx.textAlign = "center";
    ["0", `${(L / 2).toFixed(1)}m`, `${L.toFixed(1)}m`].forEach((lbl, i) => {
      ctx.fillText(lbl, pad.l + (i / 2) * pw, H - 8);
    });
    ctx.textAlign = "right";
    [yMax, (yMax + yMin) / 2, yMin].forEach((v, i) => {
      ctx.fillText(v.toFixed(1), pad.l - 6, pad.t + i * (ph / 2) + 4);
    });
  }, [type, w, L, E, I]);

  return <canvas ref={ref} style={{ width: "100%", height: 200, display: "block" }} />;
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
function ComplianceScreen({ selectedProject, setSelectedProject }) {
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

  // Clear cache when project changes
  if (lastProjectRef.current !== selectedProject) {
    lastProjectRef.current = selectedProject;
    setDiagnoses(null);
    setModalOpen(false);
  }

  const hasIssues = checks.some(c => c.status === "FAIL" || c.status === "WARNING")
    || [metrics?.max_drift, metrics?.max_deflection, metrics?.base_shear].some(m => m && (m.status === "MARGINAL" || m.status === "FAIL"));

  const runCheck = () => {
    setLoading(true);
    setError(null);
    // Clear cached diagnosis on fresh generate
    setDiagnoses(null);
    delete diagCacheRef.current[selectedProject];
    complianceApi.check(selectedProject)
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
    complianceApi.diagnose("compliance", lastResult, selectedProject)
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
              {PROJECTS.length} total
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
            {PROJECTS.map(p => {
              const active = p.id === selectedProject;
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
                    {p.sqft.toLocaleString()} sf
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

// ─── ForceScreen ─────────────────────────────────────────────────────────────
function ForceScreen({ selectedProject, setSelectedProject }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagnoses, setDiagnoses] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const diagCacheRef = useRef({});
  const lastProjectRef = useRef(selectedProject);

  // Clear cache when project changes
  if (lastProjectRef.current !== selectedProject) {
    lastProjectRef.current = selectedProject;
    setDiagnoses(null);
    setModalOpen(false);
  }

  const hasIssues = result && (
    (result.compliance_checks || []).some(c => !c.passed)
    || (result.beam_analysis?.status === "WARNING" || result.beam_analysis?.status === "FAIL")
    || (result.beam_analysis?.utilization > 0.85)
  );

  const runAnalysis = () => {
    const p = PROJECT_PARAMS[selectedProject];
    if (!p) return;
    setLoading(true);
    setError(null);
    // Clear cached diagnosis on fresh analysis
    setDiagnoses(null);
    delete diagCacheRef.current[selectedProject];
    structuralApi.analyze(p)
      .then(data => setResult(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  const handleDiagnosisClick = useCallback(() => {
    const cached = diagCacheRef.current[selectedProject];
    if (cached) {
      setDiagnoses(cached);
      setModalOpen(true);
      return;
    }
    if (!result || !hasIssues) return;
    setDiagLoading(true);
    complianceApi.diagnose("structural", result, selectedProject)
      .then(data => {
        const diags = data.diagnoses || [];
        setDiagnoses(diags);
        diagCacheRef.current[selectedProject] = diags;
        setModalOpen(true);
      })
      .catch(err => setError(err.message))
      .finally(() => setDiagLoading(false));
  }, [result, hasIssues, selectedProject]);

  const beam = result?.beam_analysis;
  const section = result?.section;
  const lc = result?.load_combinations;
  const inputs = result?.inputs;

  // For BeamChart: convert imperial units for canvas rendering
  // w in lb/ft → kN/m (÷ 14.5939), L in ft → m (× 0.3048), E ksi → GPa (× 0.00689476), I in⁴ → 10⁶mm⁴ (× 416231)
  // Actually, BeamChart just needs numerical values for shape — we pass raw imperial and display imperial labels
  const w_plf = beam?.w_plf || 0;
  const L_ft = inputs?.span_ft || 24;
  const E_ksi = section?.E || 29000;
  const I_in4 = section?.Ix || 199;

  const Vmax = beam ? beam.V_max_kip.toFixed(1) : "--";
  const Mmax = beam ? beam.M_max_ftk.toFixed(2) : "--";
  const dmax = beam ? beam.delta_max_in.toFixed(3) : "--";
  const R = beam ? (beam.V_max_kip).toFixed(1) : "--";

  const ChartCard = ({ title, subtitle, type, valueLabel, value }) => (
    <div style={{ ...card, marginBottom: 16, position: "relative" }}>
      {loading && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(13,17,23,0.7)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: radii.md, zIndex: 2 }}>
          <span style={{ fontFamily: fonts.data, fontSize: 12, color: colors.accent }}>Analyzing...</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <div style={{ fontFamily: fonts.label, fontSize: 15, fontWeight: 700, color: colors.textBright }}>{title}</div>
          <div style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim, marginTop: 2 }}>{subtitle}</div>
        </div>
        <span style={{ padding: "4px 12px", borderRadius: radii.sm, background: colors.warnDim, border: `1px solid ${colors.warn}`, color: colors.warn, fontSize: 12, fontFamily: fonts.data, fontWeight: 700 }}>
          {valueLabel} = {value}
        </span>
      </div>
      {beam && <BeamChart type={type} w={w_plf / 1000} L={L_ft * 0.3048} E={E_ksi * 0.00689476} I={I_in4 * 416231 / 1e6} />}
      {!beam && !loading && (
        <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: fonts.data, fontSize: 12, color: colors.textDim }}>Click "Run Analysis" to generate</span>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, padding: 20 }}>
      {/* Left column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Beam Schematic */}
        <div style={{ ...card, position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>🏗</span>
              <span style={{ fontFamily: fonts.data, fontSize: 12, fontWeight: 700, color: colors.text, letterSpacing: "0.08em" }}>BEAM SCHEMATIC</span>
            </div>
            <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.accent, border: `1px solid ${colors.accentGlow}`, padding: "2px 7px", borderRadius: radii.sm }}>
              {section ? section.designation : "W14x22"}
            </span>
          </div>

          <div style={{ background: colors.panel, border: `1px solid ${colors.cardBorder}`, borderRadius: radii.md, padding: 16 }}>
            <div style={{ position: "relative", height: 80 }}>
              <div style={{ display: "flex", justifyContent: "space-around", paddingBottom: 6 }}>
                {Array(6).fill(0).map((_, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span style={{ color: colors.accent, fontSize: 14, lineHeight: 1 }}>↓</span>
                  </div>
                ))}
              </div>
              <div style={{ height: 10, background: `linear-gradient(90deg,#1e3a5f,${colors.secondary},#1e3a5f)`, borderRadius: 2, position: "relative" }}>
                <span style={{ position: "absolute", left: 2, bottom: -16, fontSize: 16, color: colors.warn }}>▲</span>
                <span style={{ position: "absolute", right: 2, bottom: -16, fontSize: 16, color: colors.text }}>○</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
                <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.warn }}>R1: {R} kips</span>
                <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.text }}>R2: {R} kips</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.panelBorder, letterSpacing: "0.06em" }}>
                SPAN: {L_ft} ft
              </span>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.panelBorder, letterSpacing: "0.06em" }}>
                w = {beam ? w_plf.toFixed(0) : "--"} lb/ft
              </span>
            </div>
          </div>
        </div>

        {/* Projects */}
        <div style={{ ...card, maxHeight: 260, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
            <span style={{ fontFamily: fonts.data, fontSize: 12, fontWeight: 700, color: colors.text, letterSpacing: "0.1em" }}>PROJECTS</span>
            <button
              onClick={runAnalysis}
              disabled={loading}
              style={{
                fontFamily: fonts.data, fontSize: 11, fontWeight: 600,
                color: loading ? colors.textDim : "#0d1117",
                background: loading ? colors.panel : colors.accent,
                border: "none", borderRadius: radii.sm,
                padding: "6px 16px", cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {loading ? "Analyzing..." : "Run Analysis"}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", flex: 1, minHeight: 0, paddingRight: 4 }}>
            {PROJECTS.map(p => {
              const active = p.id === selectedProject;
              return (
                <div key={p.id} onClick={() => setSelectedProject(p.id)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 10px", borderRadius: radii.sm, cursor: "pointer",
                  border: `1px solid ${active ? colors.accent : colors.cardBorder}`,
                  background: active ? colors.accentDim : "transparent",
                  transition: "all 0.15s ease",
                }}>
                  <span style={{ fontFamily: fonts.label, fontSize: 12, fontWeight: active ? 600 : 400, color: active ? colors.textBright : colors.text }}>{p.name}</span>
                  <span style={{ fontFamily: fonts.data, fontSize: 10, color: active ? colors.accent : colors.textDim }}>{p.sqft.toLocaleString()} sf</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Analysis Summary */}
        {result && (
        <div style={{ ...card }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: fonts.data, fontSize: 12, fontWeight: 700, color: colors.text, letterSpacing: "0.1em" }}>
              ANALYSIS SUMMARY
            </span>
            <AIDiagnosisBtn hasIssues={!!hasIssues} loading={diagLoading} onClick={handleDiagnosisClick} hasCached={!!diagCacheRef.current[selectedProject]} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "SECTION", value: section?.designation },
              { label: "UTILIZATION", value: beam ? `${(beam.utilization * 100).toFixed(1)}%` : "--" },
              { label: "STATUS", value: beam?.status },
              { label: "SCI", value: result.sci ? `${result.sci.value.toFixed(1)} (${result.sci.rating})` : "--" },
              { label: "GOVERNING", value: lc?.governing_combo?.replace(/^LC\d: /, "") },
              { label: "FACTORED LOAD", value: lc ? `${lc.governing_load_psf} psf` : "--" },
            ].map(m => (
              <div key={m.label}>
                <div style={{ fontFamily: fonts.data, fontSize: 9, color: colors.textDim, letterSpacing: "0.08em", marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontFamily: fonts.data, fontSize: 13, fontWeight: 600, color: m.label === "STATUS" && m.value === "FAIL" ? colors.danger : colors.textBright }}>{m.value || "--"}</div>
              </div>
            ))}
          </div>
          {result.diagnostics && (
            <div style={{ marginTop: 12, padding: "8px 10px", background: colors.panel, borderRadius: radii.sm, border: `1px solid ${colors.cardBorder}` }}>
              <div style={{ fontFamily: fonts.data, fontSize: 9, color: colors.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>SOLVER DIAGNOSTICS</div>
              <div style={{ fontFamily: fonts.data, fontSize: 11, color: colors.text }}>
                Method: {result.diagnostics.method} · Convergence: {result.diagnostics.convergence} · Residual: {result.diagnostics.residual_pct}% · {result.diagnostics.solve_time_ms}ms
              </div>
            </div>
          )}

          {/* AI Diagnosis Modal */}
          <DiagnosisModal diagnoses={diagnoses} open={modalOpen} onClose={() => setModalOpen(false)} />
        </div>
        )}
      </div>
      <div>
        {error && (
          <div style={{ ...card, marginBottom: 16, borderColor: colors.danger }}>
            <span style={{ fontFamily: fonts.data, fontSize: 12, color: colors.danger }}>{error}</span>
          </div>
        )}
        <ChartCard title="Shear Force Diagram (V)"    subtitle="V = wL/2 — Linear variation, simply supported beam"  type="shear"      valueLabel="V_max" value={`${Vmax} kips`} />
        <ChartCard title="Bending Moment Diagram (M)" subtitle="M = wL²/8 — Parabolic curve, peak at mid-span"      type="moment"     valueLabel="M_max" value={`${Mmax} ft·kips`} />
        <ChartCard title="Deflection Curve (Δ)"       subtitle="Δ = 5wL⁴/(384EI) — Exaggerated scale"              type="deflection" valueLabel="Δ_max" value={`${dmax} in`} />
      </div>
    </div>
  );
}

// ─── Tab button ───────────────────────────────────────────────────────────────
function TabBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 16px", fontFamily: fonts.label, fontSize: 12, fontWeight: 600,
      border: `1px solid ${active ? colors.accent : colors.cardBorder}`,
      borderRadius: radii.md,
      background: active ? colors.accentDim : "transparent",
      color: active ? colors.accent : colors.textDim,
      cursor: "pointer", transition: "all 0.15s ease", letterSpacing: "0.02em",
    }}>
      {label}
    </button>
  );
}


// ─── Main Component ──────────────────────────────────────────────────────────
export default function StructuralIntelligence() {
  const [screen, setScreen] = useState(SCREENS.COMPLIANCE);
  const [selectedProject, setSelectedProject] = useState(PROJECTS[0].id);

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
            Structural calculations do not constitute licensed engineering analysis.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <TabBtn label="Code Compliance" active={screen === SCREENS.COMPLIANCE} onClick={() => setScreen(SCREENS.COMPLIANCE)} />
          <TabBtn label="Force Diagrams"  active={screen === SCREENS.FORCE}      onClick={() => setScreen(SCREENS.FORCE)} />
        </div>
      </div>

      {/* ── Code Compliance tab ── */}
      <div style={{ flex: 1, overflow: "auto", display: screen === SCREENS.COMPLIANCE ? "block" : "none" }}>
        <ComplianceScreen selectedProject={selectedProject} setSelectedProject={setSelectedProject} />
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

      {/* ── Force Diagrams tab ── */}
      <div style={{ flex: 1, overflow: "auto", display: screen === SCREENS.FORCE ? "block" : "none" }}>
        <ForceScreen selectedProject={selectedProject} setSelectedProject={setSelectedProject} />
      </div>
    </div>
  );
}
