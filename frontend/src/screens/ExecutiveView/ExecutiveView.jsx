import React, { useState, useCallback } from "react";
import { colors, fonts, card, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import { projectsApi } from "../../services/api";
import FeasibilityGauge from "../../components/shared/FeasibilityGauge";
import MetricCard from "../../components/shared/MetricCard";
import ModeToggle from "../../components/shared/ModeToggle";
import StatusBadge from "../../components/shared/StatusBadge";

/* ── Hardcoded demo data ── */
const DEMO = {
  projectName: "Project Alpha",
  address: "1234 Skyline Dr, Austin TX",
  lotLabel: "Lot 482 - North Elevation",
  zoneInfo: "Zone R-2 · Residential Single Family",
  score: 88,
  irr: 24.2,
  irrDelta: 1.2,
  capitalCost: 482000,
  capitalDelta: -2.8,
  risk: "low",
  riskPercent: 18,
  sunExposure: "High (8.2h)",
  topography: "Flat (1.2%)",
};

/* ── Map control button ── */
function MapControl({ children }) {
  return (
    <button
      style={{
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: colors.cardSurface,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: radii.md,
        color: colors.text,
        fontSize: 16,
        cursor: "pointer",
        fontFamily: fonts.label,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

/* ── Risk progress bar ── */
function RiskBar({ percent }) {
  return (
    <div
      style={{
        width: "100%",
        height: 6,
        borderRadius: 3,
        background: `linear-gradient(90deg, ${colors.success} 0%, ${colors.warn} 50%, ${colors.danger} 100%)`,
        position: "relative",
        opacity: 0.7,
      }}
    >
      {/* Indicator dot */}
      <div
        style={{
          position: "absolute",
          left: `${percent}%`,
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: colors.success,
          border: `2px solid ${colors.panel}`,
          boxShadow: `0 0 6px ${colors.success}`,
        }}
      />
    </div>
  );
}

export default function ExecutiveView() {
  const project = useProject();
  const [viewMode, setViewMode] = useState("executive");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // "ok" | "err"

  const handleSave = useCallback(async () => {
    setSaving(true); setSaveStatus(null);
    try {
      const payload = {
        name: project.projectName || "New Project",
        generate_params: { ...(project.generateParams || {}), totalSF, stories },
        floor_plan: project.floorPlan || null,
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
    } catch (_) {
      setSaveStatus("err");
      setTimeout(() => setSaveStatus(null), 2500);
    } finally {
      setSaving(false);
    }
  }, [project, totalSF, stories]);

  // Derive display values from project state, falling back to DEMO defaults
  const projectName = project.projectName || DEMO.projectName;
  const totalSF = project.totalSF || 2200;
  const stories = project.stories || 1;
  // Scale capital cost proportionally to project square footage
  const capitalCost = Math.round((DEMO.capitalCost / 2200) * totalSF);

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100vh",
        background: colors.bg,
        fontFamily: fonts.label,
        color: colors.text,
        overflow: "hidden",
      }}
    >
      {/* ════════ LEFT: Map Area (~55%) ════════ */}
      <div
        style={{
          flex: "0 0 55%",
          position: "relative",
          background:
            "linear-gradient(145deg, #1a2a3a 0%, #0d1a28 40%, #162230 100%)",
          overflow: "hidden",
        }}
      >
        {/* Simulated map texture */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 40% 55%, rgba(0,212,255,0.03) 0%, transparent 60%), " +
              "radial-gradient(circle at 65% 35%, rgba(59,130,246,0.04) 0%, transparent 50%)",
          }}
        />

        {/* Grid lines simulating map roads */}
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.08 }}
        >
          {Array.from({ length: 20 }).map((_, i) => (
            <React.Fragment key={i}>
              <line
                x1={`${i * 5.5}%`} y1="0" x2={`${i * 5.5 + 8}%`} y2="100%"
                stroke={colors.text} strokeWidth="0.5"
              />
              <line
                x1="0" y1={`${i * 5.5}%`} x2="100%" y2={`${i * 5.5 + 3}%`}
                stroke={colors.text} strokeWidth="0.5"
              />
            </React.Fragment>
          ))}
        </svg>

        {/* City label */}
        <div
          style={{
            position: "absolute",
            top: "52%",
            left: "42%",
            transform: "translate(-50%, -50%)",
            fontFamily: fonts.label,
            fontSize: 28,
            fontWeight: 700,
            color: "rgba(200, 208, 224, 0.18)",
            letterSpacing: 6,
            textTransform: "uppercase",
            userSelect: "none",
          }}
        >
          Austin
        </div>

        {/* ── LIVE VIEW badge + Lot label (top-left) ── */}
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              background: colors.successDim,
              border: `1px solid ${colors.success}`,
              borderRadius: radii.sm,
              fontFamily: fonts.label,
              fontSize: 10,
              fontWeight: 700,
              color: colors.success,
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              width: "fit-content",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: colors.success,
                display: "inline-block",
              }}
            />
            LIVE VIEW
          </span>
          <div
            style={{
              ...card,
              padding: "10px 14px",
              background: "rgba(26, 34, 51, 0.92)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div
              style={{
                fontFamily: fonts.label,
                fontSize: 13,
                fontWeight: 700,
                color: colors.textBright,
              }}
            >
              {DEMO.lotLabel}
            </div>
            <div
              style={{
                fontFamily: fonts.label,
                fontSize: 11,
                color: colors.textDim,
                marginTop: 2,
              }}
            >
              {DEMO.zoneInfo}
            </div>
          </div>
        </div>

        {/* ── Map controls (right side) ── */}
        <div
          style={{
            position: "absolute",
            right: 16,
            top: 16,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <MapControl>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </MapControl>
          <MapControl>+</MapControl>
          <MapControl>-</MapControl>
        </div>

        {/* ── Bottom info chips ── */}
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            display: "flex",
            gap: 8,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 12px",
              background: "rgba(26, 34, 51, 0.9)",
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: radii.md,
              fontFamily: fonts.label,
              fontSize: 11,
              color: colors.text,
              fontWeight: 600,
              backdropFilter: "blur(8px)",
            }}
          >
            {/* Sun icon */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.warn} strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            Sun Exposure: {DEMO.sunExposure}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 12px",
              background: "rgba(26, 34, 51, 0.9)",
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: radii.md,
              fontFamily: fonts.label,
              fontSize: 11,
              color: colors.text,
              fontWeight: 600,
              backdropFilter: "blur(8px)",
            }}
          >
            {/* Terrain icon */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.secondary} strokeWidth="2">
              <polyline points="22 20 14 10 8 16 2 8" />
            </svg>
            Topography: {DEMO.topography}
          </span>
        </div>
      </div>

      {/* ════════ RIGHT: Executive Summary Panel (~45%) ════════ */}
      <div
        style={{
          flex: "0 0 45%",
          background: colors.panel,
          borderLeft: `1px solid ${colors.panelBorder}`,
          overflowY: "auto",
          padding: "24px 24px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* ── Project header ── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2
              style={{
                margin: 0,
                fontFamily: fonts.label,
                fontSize: 20,
                fontWeight: 700,
                color: colors.textBright,
              }}
            >
              {projectName}
            </h2>
            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "6px 14px",
                background: saveStatus === "ok" ? colors.successDim : saveStatus === "err" ? colors.dangerDim : "linear-gradient(135deg, #2563eb, #1d4ed8)",
                border: `1px solid ${saveStatus === "ok" ? colors.success : saveStatus === "err" ? colors.danger : "transparent"}`,
                borderRadius: 6,
                color: saveStatus === "ok" ? colors.success : saveStatus === "err" ? colors.danger : "#fff",
                fontFamily: fonts.label,
                fontSize: 12,
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
                transition: "all 0.2s ease",
              }}
            >
              {saving ? "Saving…" : saveStatus === "ok" ? "✓ Saved" : saveStatus === "err" ? "Failed" : "Save"}
            </button>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 4,
              fontFamily: fonts.label,
              fontSize: 12,
              color: colors.textDim,
            }}
          >
            <svg width="10" height="12" viewBox="0 0 24 24" fill={colors.textDim}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            </svg>
            {DEMO.address} | {totalSF.toLocaleString()} SF · {stories}-story
          </div>
        </div>

        {/* ── View toggle ── */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <ModeToggle
            options={[
              { value: "executive", label: "Executive View" },
              { value: "engineer", label: "Engineer View" },
            ]}
            active={viewMode}
            onChange={setViewMode}
          />
        </div>

        {/* ── Feasibility Score card ── */}
        <div
          style={{
            ...card,
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "20px",
          }}
        >
          <FeasibilityGauge score={DEMO.score} size={90} />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: fonts.label,
                fontSize: 9,
                fontWeight: 700,
                color: colors.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.8px",
                marginBottom: 6,
              }}
            >
              FEASIBILITY SCORE
            </div>
            <p
              style={{
                margin: 0,
                fontFamily: fonts.label,
                fontSize: 13,
                color: colors.text,
                lineHeight: 1.5,
              }}
            >
              Excellent potential for residential development.
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                marginTop: 6,
              }}
            >
              {/* Green up-arrow */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill={colors.success}>
                <path d="M7 14l5-5 5 5z" />
              </svg>
              <span
                style={{
                  fontFamily: fonts.label,
                  fontSize: 11,
                  color: colors.success,
                  fontWeight: 600,
                }}
              >
                Top 5% in Region
              </span>
            </div>
          </div>
        </div>

        {/* ── Metric cards row ── */}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <MetricCard
              label="Project IRR"
              value={`${DEMO.irr}%`}
              delta={DEMO.irrDelta}
              deltaLabel="vs target"
              color={colors.textBright}
            />
          </div>
          <div style={{ flex: 1 }}>
            <MetricCard
              label="Capital Cost"
              value={`$${Math.round(capitalCost / 1000)}k`}
              delta={DEMO.capitalDelta}
              deltaLabel="under budget"
              color={colors.textBright}
            />
          </div>
        </div>

        {/* ── Risk Assessment ── */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontFamily: fonts.label,
                fontSize: 13,
                fontWeight: 600,
                color: colors.textDim,
              }}
            >
              Risk Assessment
            </span>
            <StatusBadge status="pass" size="sm" />
          </div>

          {/* Risk bar */}
          <RiskBar percent={DEMO.riskPercent} />

          {/* Low / High labels */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 6,
              fontFamily: fonts.label,
              fontSize: 10,
              color: colors.textDim,
            }}
          >
            <span>Low</span>
            <span>High</span>
          </div>

          {/* Risk description */}
          <p
            style={{
              margin: "12px 0 0",
              fontFamily: fonts.label,
              fontSize: 12,
              color: colors.textDim,
              lineHeight: 1.6,
            }}
          >
            Permitting approval probability is high. Environmental factors are negligible.
          </p>
        </div>

        {/* ── Action buttons ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
          {/* Export Executive Report */}
          <button
            style={{
              padding: "12px 0",
              background: colors.accent,
              border: "none",
              borderRadius: radii.md,
              color: colors.bg,
              fontFamily: fonts.label,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              textAlign: "center",
              letterSpacing: "0.3px",
            }}
          >
            Export Executive Report
          </button>

          {/* Customize Metrics link */}
          <button
            style={{
              padding: "8px 0",
              background: "transparent",
              border: "none",
              color: colors.textDim,
              fontFamily: fonts.label,
              fontSize: 13,
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            Customize Metrics
          </button>
        </div>
      </div>
    </div>
  );
}
