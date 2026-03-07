import React, { useState, useEffect, useRef } from "react";
import { colors, fonts, card, radii } from "../../theme/tokens";

const SCREENS = { COMPLIANCE: "compliance", FORCE: "force" };

const MATERIALS = [
  { name: "Lumber & Framing",    color: colors.wood },
  { name: "Concrete Foundation", color: colors.concrete },
  { name: "Steel Reinforcement", color: colors.steel },
  { name: "Labor & Overhead",    color: colors.accent },
];

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
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
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

  return <canvas ref={ref} width={640} height={200} style={{ width: "100%", height: 200 }} />;
}

// ─── metricBlock style ───────────────────────────────────────────────────────
const metricBlock = {
  background: colors.panel,
  border: `1px solid ${colors.cardBorder}`,
  borderRadius: radii.md,
  padding: "14px 16px",
  marginBottom: 12,
};

// ─── ComplianceScreen ────────────────────────────────────────────────────────
function ComplianceScreen() {
  const [selectedProject, setSelectedProject] = useState(PROJECTS[0].id);
  const checks = [
    { name: "International Building Code", standard: "IBC 2021",     factor: "1.00", status: "PASS" },
    { name: "Load Combinations",           standard: "ASCE 7-22",    factor: "1.00", status: "PASS" },
    { name: "Deflection Limit",            standard: "L/360",        factor: "0.98", status: "WARNING" },
    { name: "Seismic Drift Ratio",         standard: "ASCE 7-16",    factor: "0.90", status: "PASS" },
    { name: "Wind Uplift Check",           standard: "ASCE 7-16",    factor: "0.85", status: "PASS" },
    { name: "Foundation Bearing Pressure", standard: "Geotech 2023", factor: "1.15", status: "FAIL" },
    { name: "Snow Load Calculation",       standard: "ASCE 7-22",    factor: "0.65", status: "PASS" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: 20, alignItems: "stretch", minHeight: "calc(100% - 40px)" }}>
      {/* Left column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: fonts.label, fontSize: 15, fontWeight: 700, color: colors.textBright }}>Validation Protocol</span>
          </div>
          <span style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim, border: `1px solid ${colors.cardBorder}`, padding: "2px 8px", borderRadius: radii.sm }}>
            IBC 2021 // ASCE 7-22
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 70px 90px", gap: 8, padding: "0 0 8px", borderBottom: `1px solid ${colors.cardBorder}`, marginBottom: 4 }}>
          {["COMPLIANCE CHECK", "STANDARD", "FACTOR", "STATUS"].map(h => (
            <span key={h} style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, fontWeight: 700, letterSpacing: "0.08em" }}>{h}</span>
          ))}
        </div>

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

          <div style={metricBlock}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, letterSpacing: "0.1em" }}>MAX DRIFT RATIO</span>
              <Badge status="NOMINAL" />
            </div>
            <div style={{ fontFamily: fonts.data, fontSize: 38, fontWeight: 800, color: colors.textBright, lineHeight: 1.1, marginTop: 6 }}>
              0.018<span style={{ fontSize: 15, color: colors.textDim }}>h</span>
            </div>
            <MetricBar value={0.018} max={0.02} color={`linear-gradient(90deg,${colors.success},#4ade80)`} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>ACTUAL</span>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>LIMIT: 0.02H</span>
            </div>
          </div>

          <div style={metricBlock}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, letterSpacing: "0.1em" }}>MAX DEFLECTION</span>
              <Badge status="MARGINAL" />
            </div>
            <div style={{ fontFamily: fonts.data, fontSize: 38, fontWeight: 800, color: colors.textBright, lineHeight: 1.1, marginTop: 6 }}>
              0.78<span style={{ fontSize: 15, color: colors.textDim }}>in</span>
            </div>
            <MetricBar value={0.78} max={0.80} color={`linear-gradient(90deg,${colors.warn},#fbbf24)`} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>ACTUAL</span>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>ALLOWABLE: 0.80 IN</span>
            </div>
          </div>

          <div style={{ ...metricBlock, marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, letterSpacing: "0.1em" }}>TOTAL BASE SHEAR</span>
              <Badge status="CALC" />
            </div>
            <div style={{ fontFamily: fonts.data, fontSize: 38, fontWeight: 800, color: colors.textBright, lineHeight: 1.1, marginTop: 6 }}>
              450<span style={{ fontSize: 15, color: colors.textDim }}> kips</span>
            </div>
            <MetricBar value={450} max={690} color={`linear-gradient(90deg,${colors.secondary},#60a5fa)`} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>APPLIED</span>
              <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>CAPACITY: 690 KIPS</span>
            </div>
          </div>
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
              PRIMARY COMBINATION MATRIX LC-04
            </div>
            <div style={{ fontFamily: fonts.data, fontSize: 20, lineHeight: 1.6 }}>
              <span style={{ color: colors.secondary }}>1.2</span><span style={{ color: colors.textBright }}>D + </span>
              <span style={{ color: colors.secondary }}>1.6</span><span style={{ color: colors.textBright }}>L + </span>
              <span style={{ color: colors.secondary }}>0.5</span><span style={{ color: colors.text }}>(Lr || S || R)</span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "DEAD LOAD (D)",  value: "85.00",  unit: "psf" },
              { label: "LIVE LOAD (L)",  value: "100.00", unit: "psf" },
              { label: "SNOW LOAD (S)",  value: "30.00",  unit: "psf" },
              { label: "ROOF LIVE (LR)", value: "20.00",  unit: "psf" },
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
function ForceScreen() {
  const [params, setParams] = useState({ w: 10, L: 5, E: 200, I: 450 });
  const { w, L, E, I } = params;

  const Vmax = (w * L / 2).toFixed(1);
  const Mmax = (w * L * L / 8).toFixed(2);
  const EI = E * 1e9 * I * 1e-12;
  const dmax = -(5 * w * 1000 * Math.pow(L, 4)) / (384 * EI) * 1000;

  const inp = (key, label, unit) => (
    <div>
      <div style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim, letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", border: `1px solid ${colors.cardBorder}`, borderRadius: radii.md, overflow: "hidden" }}>
        <input
          type="number"
          value={params[key]}
          onChange={e => setParams(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
          style={{
            flex: 1, background: colors.panel, border: "none", outline: "none",
            color: colors.textBright, fontSize: 15, fontFamily: fonts.data,
            padding: "8px 10px", width: 0,
          }}
        />
        <span style={{ padding: "8px 10px", background: colors.cardSurface, color: colors.textDim, fontSize: 11, fontFamily: fonts.data, whiteSpace: "nowrap" }}>{unit}</span>
      </div>
    </div>
  );

  const ChartCard = ({ title, subtitle, type, valueLabel, value }) => (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <div style={{ fontFamily: fonts.label, fontSize: 15, fontWeight: 700, color: colors.textBright }}>{title}</div>
          <div style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim, marginTop: 2 }}>{subtitle}</div>
        </div>
        <span style={{ padding: "4px 12px", borderRadius: radii.sm, background: colors.warnDim, border: `1px solid ${colors.warn}`, color: colors.warn, fontSize: 12, fontFamily: fonts.data, fontWeight: 700 }}>
          {valueLabel} = {value}
        </span>
      </div>
      <BeamChart type={type} w={w} L={L} E={E} I={I} />
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, padding: 20 }}>
      {/* Left column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Beam Schematic */}
        <div style={{ ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>🏗</span>
              <span style={{ fontFamily: fonts.data, fontSize: 12, fontWeight: 700, color: colors.text, letterSpacing: "0.08em" }}>BEAM SCHEMATIC</span>
            </div>
            <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.accent, border: `1px solid ${colors.accentGlow}`, padding: "2px 7px", borderRadius: radii.sm }}>
              ID: BM-204
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
                <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.warn }}>R1: {(w * L / 2).toFixed(1)}kN</span>
                <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.text }}>R2: {(w * L / 2).toFixed(1)}kN</span>
              </div>
            </div>
            <div style={{ marginTop: 8, fontFamily: fonts.data, fontSize: 10, color: colors.panelBorder, letterSpacing: "0.06em" }}>
              ANALYSIS_GRID_V2.0
            </div>
          </div>
        </div>

        {/* Input Parameters */}
        <div style={{ ...card }}>
          <div style={{ fontFamily: fonts.data, fontSize: 12, fontWeight: 700, color: colors.text, letterSpacing: "0.1em", marginBottom: 14 }}>
            INPUT PARAMETERS
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {inp("w", "LOAD (W)", "kN/m")}
            {inp("L", "SPAN (L)", "METER")}
            {inp("E", "YOUNG'S MOD.", "GPA")}
            {inp("I", "INERTIA (I)", "10⁶mm⁴")}
          </div>
        </div>
      </div>

      {/* Right — Charts */}
      <div>
        <ChartCard title="Shear Force Diagram (V)"    subtitle="Linear variation due to UDL"         type="shear"      valueLabel="V_max" value={`${Vmax} kN`} />
        <ChartCard title="Bending Moment Diagram (M)" subtitle="Parabolic curve, peak at mid-span"    type="moment"     valueLabel="M_max" value={`${Mmax} kNm`} />
        <ChartCard title="Deflection Curve (Δ)"       subtitle="Exaggerated scale ×100"               type="deflection" valueLabel="Δ_max" value={`${dmax.toFixed(1)} mm`} />
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
      {screen === SCREENS.COMPLIANCE && (
        <div style={{ flex: 1, overflow: "auto" }}>
          <ComplianceScreen />
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
      )}

      {/* ── Force Diagrams tab ── */}
      {screen === SCREENS.FORCE && (
        <div style={{ flex: 1, overflow: "auto" }}>
          <ForceScreen />
        </div>
      )}
    </div>
  );
}
