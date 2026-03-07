import React, { useState } from "react";
import { colors, fonts, card, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import FeasibilityGauge from "../../components/shared/FeasibilityGauge";
import MetricCard from "../../components/shared/MetricCard";
import ModeToggle from "../../components/shared/ModeToggle";
import StatusBadge from "../../components/shared/StatusBadge";

/* ── Hardcoded Dallas fixture data ── */
const DEMO = {
  parcelId: "93382-A",
  parcelType: "Single Family Residential",
  lotSize: "22,458",
  lotSizeUnit: "sf",
  maxHeight: "36",
  maxHeightUnit: "ft",
  address: "48113000000, Dallas, TX",
  lat: "32.7767° N",
  lng: "96.7970° W",
  ctId: "48113000000",
  score: 82,
  costPerSf: 185,
  totalCost: 452400,
  marketValue: 785000,
  margin: 28.4,
  marginConfidence: 4.1,
  marketYoy: 12,
};

/* ── Monte Carlo mini histogram data ── */
const HISTOGRAM_BARS = [3, 5, 8, 14, 22, 30, 26, 18, 10, 6, 3, 2];

/* ── Sub-score bar component ── */
function SubScoreBar({ label, level, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
      <span
        style={{
          fontFamily: fonts.label,
          fontSize: 10,
          color: colors.textDim,
          whiteSpace: "nowrap",
          minWidth: 70,
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          background: colors.cardBorder,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width:
              level === "High" ? "85%" : level === "Med" ? "55%" : "30%",
            height: "100%",
            borderRadius: 2,
            background: color,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: fonts.data,
          fontSize: 10,
          fontWeight: 600,
          color,
          minWidth: 28,
          textAlign: "right",
        }}
      >
        {level}
      </span>
    </div>
  );
}

/* ── Monte Carlo histogram ── */
function MonteCarloHistogram({ bars }) {
  const max = Math.max(...bars);
  const barWidth = 14;
  const barGap = 3;
  const height = 48;
  const svgWidth = bars.length * (barWidth + barGap);

  return (
    <svg
      width={svgWidth}
      height={height}
      viewBox={`0 0 ${svgWidth} ${height}`}
      style={{ display: "block" }}
    >
      {bars.map((val, i) => {
        const barH = (val / max) * (height - 4);
        return (
          <rect
            key={i}
            x={i * (barWidth + barGap)}
            y={height - barH}
            width={barWidth}
            height={barH}
            rx={2}
            fill={colors.secondary}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

/* ── Map control button ── */
function MapControl({ children, onClick }) {
  return (
    <button
      onClick={onClick}
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

export default function FeasibilityDashboard() {
  const project = useProject();
  const [mode, setMode] = useState("developer");

  // Derive feasibility values from project state, falling back to DEMO defaults
  const totalSF = project.totalSF || 2200;
  const stories = project.stories || 1;
  const style = project.floorPlan?.style || "traditional";
  const projectName = project.projectName || "New Project";

  // Recompute financial estimates based on project square footage
  const costPerSf = DEMO.costPerSf;
  const estTotalCost = Math.round(costPerSf * totalSF);
  const estMarketValue = Math.round(estTotalCost / (1 - DEMO.margin / 100));

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
      {/* ════════ LEFT: Map Area (~60%) ════════ */}
      <div
        style={{
          flex: "0 0 60%",
          position: "relative",
          background:
            "linear-gradient(145deg, #1a2a3a 0%, #0d1a28 40%, #162230 100%)",
          overflow: "hidden",
        }}
      >
        {/* Simulated map tiles / texture */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 30% 60%, rgba(0,212,255,0.03) 0%, transparent 60%), " +
              "radial-gradient(circle at 70% 30%, rgba(59,130,246,0.04) 0%, transparent 50%)",
          }}
        />

        {/* Grid lines to simulate map roads */}
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

        {/* Dallas label */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "40%",
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
          Dallas
        </div>

        {/* ── Search bar ── */}
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            right: 16,
            display: "flex",
            gap: 8,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: colors.cardSurface,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: radii.md,
              padding: "8px 12px",
            }}
          >
            {/* Search icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textDim} strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span
              style={{
                fontFamily: fonts.label,
                fontSize: 13,
                color: colors.textDim,
              }}
            >
              {DEMO.address}
            </span>
          </div>
          {/* Filter button */}
          <button
            style={{
              width: 38,
              height: 38,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: colors.cardSurface,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: radii.md,
              cursor: "pointer",
              color: colors.textDim,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="8" y1="12" x2="16" y2="12" />
              <line x1="11" y1="18" x2="13" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Filter chip ── */}
        <div
          style={{
            position: "absolute",
            top: 62,
            left: 16,
            display: "flex",
            gap: 6,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 10px",
              background: colors.accentDim,
              border: `1px solid ${colors.accent}`,
              borderRadius: 999,
              fontFamily: fonts.label,
              fontSize: 11,
              color: colors.accent,
              fontWeight: 600,
            }}
          >
            0.5 Acres
            <span style={{ cursor: "pointer", marginLeft: 2 }}>x</span>
          </span>
        </div>

        {/* ── Parcel info card (bottom-left) ── */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: 16,
            ...card,
            padding: "14px 18px",
            minWidth: 240,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            background: "rgba(26, 34, 51, 0.95)",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontFamily: fonts.data,
                fontSize: 14,
                fontWeight: 700,
                color: colors.textBright,
              }}
            >
              Parcel #{DEMO.parcelId}
            </span>
            <StatusBadge status="active" />
          </div>

          {/* Type */}
          <span
            style={{
              fontFamily: fonts.label,
              fontSize: 11,
              color: colors.textDim,
            }}
          >
            {DEMO.parcelType}
          </span>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 20 }}>
            <div>
              <div
                style={{
                  fontFamily: fonts.label,
                  fontSize: 9,
                  color: colors.textDim,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Lot Size
              </div>
              <span style={{ fontFamily: fonts.data, fontSize: 13, color: colors.textBright }}>
                {DEMO.lotSize}{" "}
                <span style={{ fontSize: 10, color: colors.textDim }}>{DEMO.lotSizeUnit}</span>
              </span>
            </div>
            <div>
              <div
                style={{
                  fontFamily: fonts.label,
                  fontSize: 9,
                  color: colors.textDim,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Max Height
              </div>
              <span style={{ fontFamily: fonts.data, fontSize: 13, color: colors.textBright }}>
                {DEMO.maxHeight}{" "}
                <span style={{ fontSize: 10, color: colors.textDim }}>{DEMO.maxHeightUnit}</span>
              </span>
            </div>
          </div>

          {/* View Zoning button */}
          <button
            style={{
              padding: "7px 0",
              background: "transparent",
              border: `1px solid ${colors.accent}`,
              borderRadius: radii.md,
              color: colors.accent,
              fontFamily: fonts.label,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            View Zoning Details
          </button>
        </div>

        {/* ── Map controls (right side) ── */}
        <div
          style={{
            position: "absolute",
            right: 16,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <MapControl>
            {/* Layers icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </MapControl>
          <MapControl>+</MapControl>
          <MapControl>-</MapControl>
          <MapControl>
            {/* Compass icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill={colors.accent} stroke={colors.accent} />
            </svg>
          </MapControl>
        </div>
      </div>

      {/* ════════ RIGHT: Feasibility Analysis Panel (~40%) ════════ */}
      <div
        style={{
          flex: "0 0 40%",
          background: colors.panel,
          borderLeft: `1px solid ${colors.panelBorder}`,
          overflowY: "auto",
          padding: "24px 24px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* ── Header ── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2
              style={{
                margin: 0,
                fontFamily: fonts.label,
                fontSize: 18,
                fontWeight: 700,
                color: colors.textBright,
              }}
            >
              {projectName} — Feasibility
            </h2>
            {/* Three-dot menu */}
            <span style={{ color: colors.textDim, cursor: "pointer", fontSize: 18, letterSpacing: 2 }}>
              ...
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
              fontFamily: fonts.data,
              fontSize: 11,
              color: colors.textDim,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill={colors.textDim}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            </svg>
            {DEMO.lat}, {DEMO.lng} | CT: {DEMO.ctId} | {totalSF.toLocaleString()} SF · {stories}-story · {style}
          </div>
        </div>

        {/* ── Gauge ── */}
        <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
          <FeasibilityGauge score={DEMO.score} size={110} />
        </div>

        {/* ── Sub-scores ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <SubScoreBar label="Profitability" level="High" color={colors.success} />
            <SubScoreBar label="Market Strength" level="Med" color={colors.warn} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <SubScoreBar label="Risk Profile" level="Low" color={colors.secondary} />
            <SubScoreBar label="Infrastructure" level="High" color={colors.success} />
          </div>
        </div>

        {/* ── Mode Toggle ── */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <ModeToggle
            options={[
              { value: "developer", label: "Developer Mode" },
              { value: "investor", label: "Investor Mode" },
            ]}
            active={mode}
            onChange={setMode}
          />
        </div>

        {/* ── Financial Estimates ── */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 14,
              fontFamily: fonts.label,
              fontSize: 13,
              fontWeight: 700,
              color: colors.textBright,
            }}
          >
            {/* Dollar icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="6" x2="12" y2="18" />
              <path d="M9 10a3 3 0 0 1 3-2h0a3 3 0 0 1 0 4H9a3 3 0 0 0 3 4h0a3 3 0 0 0 3-2" />
            </svg>
            Financial Estimates
          </div>

          {/* Est. Const. Cost */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: fonts.label, fontSize: 12, color: colors.textDim }}>
                Est. Const. Cost
              </div>
              <div style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim }}>
                ${costPerSf} / sqft
              </div>
            </div>
            <span
              style={{
                fontFamily: fonts.data,
                fontSize: 18,
                fontWeight: 700,
                color: colors.textBright,
              }}
            >
              ${estTotalCost.toLocaleString()}
            </span>
          </div>

          {/* Market Value (ARV) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: fonts.label, fontSize: 12, color: colors.textDim }}>
                Market Value (ARV)
              </div>
              <div style={{ fontFamily: fonts.data, fontSize: 11, color: colors.success }}>
                +{DEMO.marketYoy}% YoY
              </div>
            </div>
            <span
              style={{
                fontFamily: fonts.data,
                fontSize: 18,
                fontWeight: 700,
                color: colors.textBright,
              }}
            >
              ${estMarketValue.toLocaleString()}
            </span>
          </div>

          {/* Net Margin */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div style={{ fontFamily: fonts.label, fontSize: 12, color: colors.textDim }}>
                Net Margin
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span
                style={{
                  fontFamily: fonts.data,
                  fontSize: 18,
                  fontWeight: 700,
                  color: colors.success,
                }}
              >
                {DEMO.margin}%
              </span>
              <div style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>
                Confidence: +/-{DEMO.marginConfidence}%
              </div>
            </div>
          </div>
        </div>

        {/* ── Monte Carlo Risk ── */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: fonts.label,
                fontSize: 13,
                fontWeight: 700,
                color: colors.textBright,
              }}
            >
              {/* Chart icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
                <rect x="3" y="12" width="4" height="9" rx="1" />
                <rect x="10" y="6" width="4" height="15" rx="1" />
                <rect x="17" y="3" width="4" height="18" rx="1" />
              </svg>
              Monte Carlo Risk
            </div>
            <span
              style={{
                fontFamily: fonts.label,
                fontSize: 11,
                color: colors.accent,
                cursor: "pointer",
              }}
            >
              Configure
            </span>
          </div>
          <MonteCarloHistogram bars={HISTOGRAM_BARS} />
        </div>

        {/* ── Action Buttons ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
          {/* Add to Comparison */}
          <button
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "10px 0",
              background: "transparent",
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: radii.md,
              color: colors.text,
              fontFamily: fonts.label,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 14 }}>+</span> Add to Comparison
          </button>

          {/* Generate PDF Report */}
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
            Generate PDF Report
          </button>
        </div>
      </div>
    </div>
  );
}
