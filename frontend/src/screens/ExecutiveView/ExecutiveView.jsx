import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { colors, fonts, card, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import { projectsApi } from "../../services/api";
import FeasibilityGauge from "../../components/shared/FeasibilityGauge";
import MetricCard from "../../components/shared/MetricCard";
import ModeToggle from "../../components/shared/ModeToggle";
import StatusBadge from "../../components/shared/StatusBadge";

/* ── Demo defaults ── */
const DEMO = {
  projectName: "Lakewood Residence",
  address: "4821 Swiss Ave, Dallas TX 75214",
  lotLabel: "Lot 482 — North Elevation",
  zoneInfo: "Zone R-7.5 · Residential Single Family",
  score: 88,
  irr: 24.2,
  irrDelta: 1.2,
  capitalCost: 482000,
  capitalDelta: -2.8,
  marketValue: 625000,
  profitMargin: 29.7,
  risk: "low",
  riskPercent: 18,
  sunExposure: "High (8.2h)",
  topography: "Flat (1.2%)",
  cashOnCash: 18.4,
  debtCoverage: 1.42,
};

/* ── Map control button ── */
function MapCtrl({ children, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 34,
        height: 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: h ? "rgba(26,34,51,0.95)" : "rgba(26,34,51,0.8)",
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: radii.md,
        color: colors.text,
        fontSize: 15,
        cursor: "pointer",
        fontFamily: fonts.data,
        lineHeight: 1,
        backdropFilter: "blur(8px)",
        transition: "background 0.15s",
      }}
    >
      {children}
    </button>
  );
}

/* ── Risk gradient bar ── */
function RiskBar({ percent }) {
  const clr = percent < 33 ? colors.success : percent < 66 ? colors.warn : colors.danger;
  return (
    <div style={{ width: "100%", height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${colors.success} 0%, ${colors.warn} 50%, ${colors.danger} 100%)`, position: "relative", opacity: 0.8 }}>
      <div style={{
        position: "absolute",
        left: `${percent}%`,
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: clr,
        border: `2px solid ${colors.bg}`,
        boxShadow: `0 0 8px ${clr}`,
        transition: "left 0.6s ease",
      }} />
    </div>
  );
}

/* ── Small breakdown row ── */
function BreakdownRow({ label, value, bar, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${colors.panelBorder}` }}>
      <span style={{ fontSize: 11, color: colors.textDim, fontFamily: fonts.label, minWidth: 100 }}>{label}</span>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: colors.panelBorder, overflow: "hidden" }}>
        <div style={{ width: `${bar}%`, height: "100%", borderRadius: 2, background: color || colors.accent, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: colors.textBright, fontFamily: fonts.data, minWidth: 48, textAlign: "right" }}>{value}</span>
    </div>
  );
}

/* ── Decorative map grid ── */
function MapGrid() {
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.06 }}>
      <defs>
        <pattern id="execGrid" width="80" height="80" patternUnits="userSpaceOnUse">
          <path d="M 80 0 L 0 0 0 80" fill="none" stroke={colors.text} strokeWidth="0.5" />
        </pattern>
        <radialGradient id="execGridFade" cx="45%" cy="50%" r="55%">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="execGridMask">
          <rect width="100%" height="100%" fill="url(#execGridFade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#execGrid)" mask="url(#execGridMask)" />
    </svg>
  );
}

/* ── Decorative map markers ── */
function MapMarkers() {
  const markers = [
    { x: "35%", y: "40%", r: 6, pulse: true },
    { x: "55%", y: "30%", r: 4, pulse: false },
    { x: "25%", y: "65%", r: 4, pulse: false },
    { x: "65%", y: "55%", r: 3, pulse: false },
    { x: "45%", y: "70%", r: 3, pulse: false },
    { x: "70%", y: "25%", r: 3, pulse: false },
  ];
  return (
    <>
      {markers.map((m, i) => (
        <div key={i} style={{
          position: "absolute",
          left: m.x,
          top: m.y,
          transform: "translate(-50%, -50%)",
        }}>
          {m.pulse && (
            <div style={{
              position: "absolute",
              inset: -8,
              borderRadius: "50%",
              border: `1.5px solid ${colors.accent}`,
              opacity: 0.3,
              animation: "pulse 2s ease-in-out infinite",
            }} />
          )}
          <div style={{
            width: m.r * 2,
            height: m.r * 2,
            borderRadius: "50%",
            background: i === 0 ? colors.accent : colors.secondary,
            opacity: i === 0 ? 1 : 0.4,
            boxShadow: i === 0 ? `0 0 12px ${colors.accent}` : "none",
          }} />
        </div>
      ))}
    </>
  );
}

export default function ExecutiveView() {
  const project = useProject();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState("executive");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const projectName = project.projectName || DEMO.projectName;
  const totalSF = project.generateParams?.targetSF || 2200;
  const stories = project.generateParams?.stories || 1;
  const capitalCost = Math.round((DEMO.capitalCost / 2200) * totalSF);
  const marketValue = Math.round((DEMO.marketValue / 2200) * totalSF);

  const handleSave = useCallback(async () => {
    setSaving(true); setSaveStatus(null);
    try {
      const payload = {
        name: project.projectName || "New Project",
        generate_params: { ...(project.generateParams || {}), totalSF, stories },
        floor_plan: project.floorPlan || null,
        story_plans: project.storyPlans || [],
        materials: project.materials || [],
        location: project.projectLocation || null,
      };
      let saved;
      if (project.projectId) {
        saved = await projectsApi.update(project.projectId, payload);
      } else {
        saved = await projectsApi.create(payload);
      }
      if (saved?.id) project.setProjectId(saved.id);
      setSaveStatus("ok");
      setTimeout(() => setSaveStatus(null), 2500);
    } catch {
      setSaveStatus("err");
      setTimeout(() => setSaveStatus(null), 2500);
    } finally {
      setSaving(false);
    }
  }, [project, totalSF, stories]);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: colors.bg, fontFamily: fonts.label, color: colors.text, overflow: "hidden" }}>

      {/* ════════ LEFT: Map Area (~55%) ════════ */}
      <div style={{ flex: "0 0 55%", position: "relative", background: "linear-gradient(145deg, #0f1a2a 0%, #0d1520 40%, #111d2e 100%)", overflow: "hidden" }}>
        {/* Ambient glow */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(circle at 38% 45%, rgba(0,212,255,0.04) 0%, transparent 55%), radial-gradient(circle at 65% 35%, rgba(59,130,246,0.03) 0%, transparent 45%)",
        }} />

        <MapGrid />
        <MapMarkers />

        {/* City watermark */}
        <div style={{
          position: "absolute", top: "50%", left: "45%", transform: "translate(-50%, -50%)",
          fontFamily: fonts.label, fontSize: 32, fontWeight: 800,
          color: "rgba(200,208,224,0.06)", letterSpacing: 8,
          textTransform: "uppercase", userSelect: "none",
        }}>
          Dallas
        </div>

        {/* LIVE VIEW badge + Lot label */}
        <div style={{ position: "absolute", top: 16, left: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 10px", background: colors.successDim,
            border: `1px solid rgba(46,213,115,0.3)`, borderRadius: radii.sm,
            fontSize: 9, fontWeight: 700, color: colors.success,
            textTransform: "uppercase", letterSpacing: "0.8px", width: "fit-content",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: colors.success, animation: "pulse 2s ease-in-out infinite" }} />
            LIVE VIEW
          </span>
          <div style={{
            ...card, padding: "10px 14px",
            background: "rgba(26,34,51,0.9)", backdropFilter: "blur(12px)",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.textBright }}>{DEMO.lotLabel}</div>
            <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>{DEMO.zoneInfo}</div>
          </div>
        </div>

        {/* Map controls */}
        <div style={{ position: "absolute", right: 16, top: 16, display: "flex", flexDirection: "column", gap: 4 }}>
          <MapCtrl>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </MapCtrl>
          <MapCtrl>+</MapCtrl>
          <MapCtrl>-</MapCtrl>
        </div>

        {/* Bottom info chips */}
        <div style={{ position: "absolute", bottom: 16, left: 16, display: "flex", gap: 8 }}>
          {[
            { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={colors.warn} strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>, text: `Sun: ${DEMO.sunExposure}` },
            { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={colors.secondary} strokeWidth="2"><polyline points="22 20 14 10 8 16 2 8"/></svg>, text: `Topo: ${DEMO.topography}` },
          ].map((chip, i) => (
            <span key={i} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 10px", background: "rgba(26,34,51,0.85)",
              border: `1px solid ${colors.cardBorder}`, borderRadius: radii.md,
              fontSize: 10, color: colors.text, fontWeight: 500,
              backdropFilter: "blur(8px)",
            }}>
              {chip.icon} {chip.text}
            </span>
          ))}
        </div>
      </div>

      {/* ════════ RIGHT: Executive Summary (~45%) ════════ */}
      <div style={{
        flex: "0 0 45%", background: colors.panel, borderLeft: `1px solid ${colors.panelBorder}`,
        overflowY: "auto", padding: "24px 24px 32px",
        display: "flex", flexDirection: "column", gap: 18,
      }}>
        {/* Header */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: colors.textBright, letterSpacing: "-0.3px" }}>
              {projectName}
            </h2>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "6px 16px",
                background: saveStatus === "ok" ? colors.successDim : saveStatus === "err" ? colors.dangerDim : "linear-gradient(135deg, #2563eb, #1d4ed8)",
                border: `1px solid ${saveStatus === "ok" ? colors.success : saveStatus === "err" ? colors.danger : "transparent"}`,
                borderRadius: 6, color: saveStatus === "ok" ? colors.success : saveStatus === "err" ? colors.danger : "#fff",
                fontFamily: fonts.label, fontSize: 12, fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
                transition: "all 0.2s ease",
              }}
            >
              {saving ? "Saving..." : saveStatus === "ok" ? "Saved" : saveStatus === "err" ? "Failed" : "Save Project"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, fontSize: 12, color: colors.textDim }}>
            <svg width="10" height="12" viewBox="0 0 24 24" fill={colors.textDim}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            </svg>
            {DEMO.address} | {totalSF.toLocaleString()} SF | {stories}-Story
          </div>
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <ModeToggle
            options={[
              { value: "executive", label: "Executive" },
              { value: "engineer", label: "Engineering" },
            ]}
            active={viewMode}
            onChange={setViewMode}
          />
        </div>

        {/* Feasibility Score */}
        <div style={{ ...card, display: "flex", alignItems: "center", gap: 16, padding: "20px" }}>
          <FeasibilityGauge score={DEMO.score} size={90} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
              FEASIBILITY SCORE
            </div>
            <p style={{ margin: 0, fontSize: 13, color: colors.text, lineHeight: 1.5 }}>
              Excellent potential for residential development.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill={colors.success}><path d="M7 14l5-5 5 5z" /></svg>
              <span style={{ fontSize: 11, color: colors.success, fontWeight: 600 }}>Top 5% in Region</span>
            </div>
          </div>
        </div>

        {/* Metric cards row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <MetricCard label="Project IRR" value={`${DEMO.irr}%`} delta={DEMO.irrDelta} deltaLabel="vs target" color={colors.textBright} />
          <MetricCard label="Capital Cost" value={`$${Math.round(capitalCost / 1000)}k`} delta={DEMO.capitalDelta} deltaLabel="under budget" color={colors.textBright} />
          <MetricCard label="Market Value" value={`$${Math.round(marketValue / 1000)}k`} delta={5.3} deltaLabel="appreciation" color={colors.textBright} />
          <MetricCard label="Profit Margin" value={`${DEMO.profitMargin}%`} delta={2.1} deltaLabel="vs benchmark" color={colors.textBright} />
        </div>

        {/* Financial Breakdown */}
        {viewMode === "engineer" && (
          <div style={{ ...card, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>
              Financial Breakdown
            </div>
            <BreakdownRow label="Land Acquisition" value="$142k" bar={29} color={colors.secondary} />
            <BreakdownRow label="Construction" value="$286k" bar={59} color={colors.accent} />
            <BreakdownRow label="Soft Costs" value="$38k" bar={8} color={colors.warn} />
            <BreakdownRow label="Contingency" value="$16k" bar={4} color={colors.textDim} />
          </div>
        )}

        {/* Risk Assessment */}
        <div style={{ ...card, padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.6px" }}>
              Risk Assessment
            </span>
            <StatusBadge status="pass" size="sm" />
          </div>
          <RiskBar percent={DEMO.riskPercent} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 9, color: colors.textDim, letterSpacing: "0.5px" }}>
            <span>LOW</span>
            <span>MODERATE</span>
            <span>HIGH</span>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: colors.textDim, lineHeight: 1.6 }}>
            Permitting probability is high. Environmental factors negligible. Market conditions favorable for Q2 delivery.
          </p>
        </div>

        {/* Key Ratios (engineer mode) */}
        {viewMode === "engineer" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <MetricCard label="Cash-on-Cash" value={`${DEMO.cashOnCash}%`} color={colors.accent} />
            <MetricCard label="Debt Coverage" value={`${DEMO.debtCoverage}x`} color={colors.accent} />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
          <button
            onClick={() => navigate("/schedule")}
            style={{
              flex: 1, padding: "12px 0",
              background: `linear-gradient(135deg, ${colors.accent}, #0099cc)`,
              border: "none", borderRadius: radii.md,
              color: colors.bg, fontSize: 13, fontWeight: 700,
              cursor: "pointer", letterSpacing: "0.3px",
              transition: "box-shadow 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = `0 4px 20px rgba(0,212,255,0.3)`}
            onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
          >
            Continue to Schedule
          </button>
          <button
            style={{
              padding: "12px 20px",
              background: "transparent",
              border: `1px solid ${colors.cardBorder}`, borderRadius: radii.md,
              color: colors.text, fontSize: 13, fontWeight: 500,
              cursor: "pointer",
              transition: "border-color 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = colors.accent}
            onMouseLeave={e => e.currentTarget.style.borderColor = colors.cardBorder}
          >
            Export PDF
          </button>
        </div>
      </div>
    </div>
  );
}
