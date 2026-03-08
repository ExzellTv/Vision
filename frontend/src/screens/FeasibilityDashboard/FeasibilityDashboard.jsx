import React, { useState, useMemo } from "react";
import { colors, fonts, card, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import FeasibilityGauge from "../../components/shared/FeasibilityGauge";
import ModeToggle from "../../components/shared/ModeToggle";
import StatusBadge from "../../components/shared/StatusBadge";
import DisclaimerBanner from "../../components/shared/DisclaimerBanner";
import LeafletMap from "./LeafletMap";
import { computeNearbyComps, runValuation, getZone, fmtK, fmtUSD } from "./valuationEngine";
import { DALLAS_COMPS, ZONING_DISTRICTS } from "./mapData";
import { projectsApi } from "../../services/api";

/* ── Hardcoded Dallas fixture data (shown when no location is selected) ── */
const DEMO = {
  parcelId:         "93382-A",
  parcelType:       "Single Family Residential",
  lotSize:          "22,458",
  lotSizeUnit:      "sf",
  maxHeight:        "36",
  maxHeightUnit:    "ft",
  address:          "48113000000, Dallas, TX",
  lat:              "32.7767° N",
  lng:              "96.7970° W",
  ctId:             "48113000000",
  score:            82,
  costPerSf:        185,
  totalCost:        452400,
  marketValue:      785000,
  margin:           28.4,
  marginConfidence: 4.1,
  marketYoy:        12,
};

/* ── Monte Carlo mini histogram data ── */
const HISTOGRAM_BARS = [3, 5, 8, 14, 22, 30, 26, 18, 10, 6, 3, 2];

/* ── Sub-score bar ── */
function SubScoreBar({ label, level, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
      <span style={{
        fontFamily: fonts.label, fontSize: 10, color: colors.textDim,
        whiteSpace: "nowrap", minWidth: 70,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: 4, borderRadius: 2,
        background: colors.cardBorder, overflow: "hidden",
      }}>
        <div style={{
          width:      level === "High" ? "85%" : level === "Med" ? "55%" : "30%",
          height:     "100%",
          borderRadius: 2,
          background: color,
          transition: "width 0.4s ease",
        }} />
      </div>
      <span style={{
        fontFamily: fonts.data, fontSize: 10, fontWeight: 600,
        color, minWidth: 28, textAlign: "right",
      }}>
        {level}
      </span>
    </div>
  );
}

/* ── Monte Carlo histogram ── */
function MonteCarloHistogram({ bars }) {
  const max      = Math.max(...bars);
  const barWidth = 14, barGap = 3, height = 48;
  const svgWidth = bars.length * (barWidth + barGap);
  return (
    <svg width={svgWidth} height={height} viewBox={`0 0 ${svgWidth} ${height}`}
         style={{ display: "block" }}>
      {bars.map((val, i) => {
        const barH = (val / max) * (height - 4);
        return (
          <rect key={i}
            x={i * (barWidth + barGap)} y={height - barH}
            width={barWidth} height={barH} rx={2}
            fill={colors.secondary} opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

/* ── Main screen ─────────────────────────────────────────────────────────── */
export default function FeasibilityDashboard() {
  const project = useProject();
  const [mode, setMode] = useState("developer");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // "ok" | "err"

  const handleSave = async () => {
    setSaving(true); setSaveStatus(null);
    try {
      const payload = {
        name: project.projectName || "New Project",
        generate_params: project.generateParams,
        floor_plan: project.floorPlan || null,
        feasibility: { loc, valuation, displayScore, displayCost, displayARV, displayMargin },
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
  };

  // ── Map / analysis state ──────────────────────────────────────────────
  const [loc,     setLoc]     = useState(null);  // pinned map location
  const [selLand, setSelLand] = useState(null);  // selected vacant land parcel
  const [radius,  setRadius]  = useState(0.75);  // comp search radius (miles)

  // ── Project-derived subject-property specs ────────────────────────────
  const totalSF     = project.totalSF || 2200;
  const stories     = project.stories || 1;
  const style       = project.floorPlan?.style || "traditional";
  const projectName = project.projectName || "New Project";

  // Bedroom / bathroom count from the generated floor plan (fallback 3/2)
  const bedrooms  = project.floorPlan?.rooms?.filter((r) => r.type === "bedroom").length  || 3;
  const bathrooms = project.floorPlan?.rooms?.filter((r) => r.type === "bathroom").length || 2;

  // ── Derived analysis values ───────────────────────────────────────────
  const nearbyComps = useMemo(
    () => computeNearbyComps(loc, radius, DALLAS_COMPS),
    [loc, radius]
  );

  const valuation = useMemo(
    () => runValuation(loc, selLand, nearbyComps, totalSF, bedrooms, bathrooms),
    [loc, selLand, nearbyComps, totalSF, bedrooms, bathrooms]
  );

  const currentZone = useMemo(
    () => (loc ? getZone(loc.lat, loc.lng, ZONING_DISTRICTS) : null),
    [loc]
  );

  // ── Display values: live valuation when available, DEMO otherwise ─────
  const estTotalCost   = Math.round(DEMO.costPerSf * totalSF);
  const estMarketValue = Math.round(estTotalCost / (1 - DEMO.margin / 100));

  const displayScore   = valuation ? valuation.feasScore                            : DEMO.score;
  const displayCost    = valuation ? Math.round(valuation.totalInvestment)          : estTotalCost;
  const displayCostPSF = valuation ? Math.round(valuation.totalInvestment / totalSF) : DEMO.costPerSf;
  const displayARV     = valuation ? Math.round(valuation.blended)                  : estMarketValue;
  const displayMargin  = valuation ? valuation.margin.toFixed(1)                    : DEMO.margin;

  // Parcel card — live data when land selected, DEMO data otherwise
  const parcelStatus  = selLand?.status === "Price Reduced" ? "warning" : "active";
  const parcelType    = selLand ? `${selLand.zoning} Zone · ${selLand.topography}` : DEMO.parcelType;
  const parcelLotSize = selLand ? selLand.lot_sf.toLocaleString("en-US")            : DEMO.lotSize;
  const parcelMaxH    = currentZone ? String(currentZone.max_height_ft)             : DEMO.maxHeight;

  return (
    <div style={{
      display:    "flex",
      width:      "100%",
      height:     "100%",         // fills <main flex:1> — must NOT be 100vh
      background: colors.bg,
      fontFamily: fonts.label,
      color:      colors.text,
      overflow:   "hidden",
    }}>

      {/* ════════ LEFT: Live Leaflet Map (60%) ════════ */}
      <div style={{
        flex:       "0 0 60%",
        position:   "relative",
        background: colors.bg,
        overflow:   "hidden",
      }}>

        {/* Real Leaflet map fills the entire left panel */}
        <LeafletMap
          loc={loc}
          onLocChange={setLoc}
          onLandSelect={setSelLand}
          radius={radius}
          onRadiusChange={setRadius}
          nearbyComps={nearbyComps}
        />

        {/* ── Search / address bar (z-index 800 — above all Leaflet layers) ── */}
        <div style={{
          position: "absolute", top: 16, left: 16, right: 16,
          display: "flex", gap: 8, zIndex: 800,
        }}>
          <div style={{
            flex: 1, display: "flex", alignItems: "center", gap: 8,
            background:   colors.cardSurface,
            border:       `1px solid ${colors.cardBorder}`,
            borderRadius: radii.md,
            padding:      "8px 12px",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke={colors.textDim} strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span style={{ fontFamily: fonts.label, fontSize: 13, color: colors.textDim }}>
              {selLand?.address || DEMO.address}
            </span>
          </div>
          <button style={{
            width: 38, height: 38, display: "flex",
            alignItems: "center", justifyContent: "center",
            background: colors.cardSurface,
            border:     `1px solid ${colors.cardBorder}`,
            borderRadius: radii.md,
            cursor: "pointer", color: colors.textDim,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <line x1="4"  y1="6"  x2="20" y2="6"  />
              <line x1="8"  y1="12" x2="16" y2="12" />
              <line x1="11" y1="18" x2="13" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Radius filter chip + project name ── */}
        <div style={{
          position: "absolute", top: 62, left: 16,
          display: "flex", gap: 6, zIndex: 800,
        }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 10px",
            background: "rgba(26,34,51,0.88)",
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: 999,
            fontFamily: fonts.label, fontSize: 11,
            color: colors.textBright, fontWeight: 600,
            backdropFilter: "blur(8px)",
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill={colors.accent}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            </svg>
            {projectName}
          </span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 10px",
            background:   colors.accentDim,
            border:       `1px solid ${colors.accent}`,
            borderRadius: 999,
            fontFamily: fonts.label, fontSize: 11,
            color: colors.accent, fontWeight: 600,
          }}>
            {radius.toFixed(1)} mi radius
          </span>
        </div>

        {/* ── Parcel info card (bottom-left, above Leaflet) ── */}
        <div style={{
          position: "absolute", bottom: 20, left: 16, zIndex: 800,
          ...card,
          padding:             "14px 18px",
          minWidth:            240,
          display:             "flex",
          flexDirection:       "column",
          gap:                 10,
          background:          "rgba(26,34,51,0.96)",
          backdropFilter:      "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}>
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontFamily: fonts.data, fontSize: 13, fontWeight: 700,
              color: colors.textBright,
              overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", maxWidth: 160,
            }}>
              {selLand ? selLand.address : `Parcel #${DEMO.parcelId}`}
            </span>
            <StatusBadge status={parcelStatus} />
          </div>

          <span style={{ fontFamily: fonts.label, fontSize: 11, color: colors.textDim }}>
            {parcelType}
          </span>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 16 }}>
            <div>
              <div style={{
                fontFamily: fonts.label, fontSize: 9, color: colors.textDim,
                textTransform: "uppercase", letterSpacing: "0.5px",
              }}>
                Lot Size
              </div>
              <span style={{ fontFamily: fonts.data, fontSize: 13, color: colors.textBright }}>
                {parcelLotSize}{" "}
                <span style={{ fontSize: 10, color: colors.textDim }}>sf</span>
              </span>
            </div>
            <div>
              <div style={{
                fontFamily: fonts.label, fontSize: 9, color: colors.textDim,
                textTransform: "uppercase", letterSpacing: "0.5px",
              }}>
                Max Height
              </div>
              <span style={{ fontFamily: fonts.data, fontSize: 13, color: colors.textBright }}>
                {parcelMaxH}{" "}
                <span style={{ fontSize: 10, color: colors.textDim }}>ft</span>
              </span>
            </div>
            {selLand && (
              <div>
                <div style={{
                  fontFamily: fonts.label, fontSize: 9, color: colors.textDim,
                  textTransform: "uppercase", letterSpacing: "0.5px",
                }}>
                  Price
                </div>
                <span style={{ fontFamily: fonts.data, fontSize: 13, color: colors.success }}>
                  {fmtUSD(selLand.price)}
                </span>
              </div>
            )}
          </div>

          <button style={{
            padding:      "7px 0",
            background:   "transparent",
            border:       `1px solid ${colors.accent}`,
            borderRadius: radii.md,
            color:        colors.accent,
            fontFamily:   fonts.label, fontSize: 12, fontWeight: 600,
            cursor:       "pointer", textAlign: "center",
          }}>
            View Zoning Details
          </button>
        </div>
      </div>

      {/* ════════ RIGHT: Feasibility Analysis Panel (40%) ════════ */}
      <div style={{
        flex:          "0 0 40%",
        background:    colors.panel,
        borderLeft:    `1px solid ${colors.panelBorder}`,
        overflowY:     "auto",
        padding:       "24px 24px 32px",
        display:       "flex",
        flexDirection: "column",
        gap:           20,
      }}>

        {/* ── Header ── */}
        <div>
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
          }}>
            <h2 style={{
              margin: 0, fontFamily: fonts.label,
              fontSize: 18, fontWeight: 700, color: colors.textBright,
            }}>
              {projectName} — Feasibility
            </h2>
            <span style={{ color: colors.textDim, cursor: "pointer", fontSize: 18, letterSpacing: 2 }}>
              ...
            </span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 4,
            fontFamily: fonts.data, fontSize: 11, color: colors.textDim,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill={colors.textDim}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            </svg>
            {loc
              ? `${loc.lat.toFixed(4)}° N, ${Math.abs(loc.lng).toFixed(4)}° W`
              : `${DEMO.lat}, ${DEMO.lng}`
            }{" "}
            | CT: {DEMO.ctId} | {totalSF.toLocaleString()} SF · {stories}-story · {style}
          </div>
        </div>

        {/* ── Gauge ── */}
        <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
          <FeasibilityGauge score={displayScore} size={110} />
        </div>

        {/* ── Sub-scores ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <SubScoreBar label="Profitability"   level="High" color={colors.success}   />
            <SubScoreBar label="Market Strength" level="Med"  color={colors.warn}      />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <SubScoreBar label="Risk Profile"   level="Low"  color={colors.secondary} />
            <SubScoreBar label="Infrastructure" level="High" color={colors.success}   />
          </div>
        </div>

        {/* ── Mode Toggle ── */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <ModeToggle
            options={[
              { value: "developer", label: "Developer Mode" },
              { value: "investor",  label: "Investor Mode"  },
            ]}
            active={mode}
            onChange={setMode}
          />
        </div>

        {/* ── Financial Estimates ── */}
        <div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 14,
            fontFamily: fonts.label, fontSize: 13, fontWeight: 700,
            color: colors.textBright,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke={colors.accent} strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="6" x2="12" y2="18" />
              <path d="M9 10a3 3 0 0 1 3-2h0a3 3 0 0 1 0 4H9a3 3 0 0 0 3 4h0a3 3 0 0 0 3-2" />
            </svg>
            Financial Estimates
            {valuation && (
              <span style={{
                marginLeft: "auto", fontSize: 9, fontWeight: 700,
                padding: "2px 7px", borderRadius: radii.sm,
                background: colors.accentDim, color: colors.accent,
                fontFamily: fonts.data, letterSpacing: "0.6px",
              }}>
                LIVE · {nearbyComps.length} COMPS
              </span>
            )}
          </div>

          {/* Land Acquisition — only when a parcel is selected */}
          {selLand && (
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "baseline", marginBottom: 12,
            }}>
              <div>
                <div style={{ fontFamily: fonts.label, fontSize: 12, color: colors.textDim }}>
                  Land Acquisition
                </div>
                <div style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim }}>
                  {selLand.lot_sf.toLocaleString()} SF · {selLand.zoning}
                </div>
              </div>
              <span style={{
                fontFamily: fonts.data, fontSize: 18, fontWeight: 700,
                color: colors.textBright,
              }}>
                {fmtUSD(selLand.price)}
              </span>
            </div>
          )}

          {/* Est. Construction Cost */}
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "baseline", marginBottom: 12,
          }}>
            <div>
              <div style={{ fontFamily: fonts.label, fontSize: 12, color: colors.textDim }}>
                Est. Const. Cost
              </div>
              <div style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textDim }}>
                ${displayCostPSF} / sqft
              </div>
            </div>
            <span style={{
              fontFamily: fonts.data, fontSize: 18, fontWeight: 700,
              color: colors.textBright,
            }}>
              ${displayCost.toLocaleString()}
            </span>
          </div>

          {/* Market Value (ARV) */}
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "baseline", marginBottom: 12,
          }}>
            <div>
              <div style={{ fontFamily: fonts.label, fontSize: 12, color: colors.textDim }}>
                Market Value (ARV)
              </div>
              <div style={{ fontFamily: fonts.data, fontSize: 11, color: colors.success }}>
                {valuation ? `${nearbyComps.length} comps · blended` : `+${DEMO.marketYoy}% YoY`}
              </div>
            </div>
            <span style={{
              fontFamily: fonts.data, fontSize: 18, fontWeight: 700,
              color: colors.textBright,
            }}>
              ${displayARV.toLocaleString()}
            </span>
          </div>

          {/* Net Margin */}
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "baseline",
          }}>
            <div>
              <div style={{ fontFamily: fonts.label, fontSize: 12, color: colors.textDim }}>
                Net Margin
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{
                fontFamily: fonts.data, fontSize: 18, fontWeight: 700,
                color: valuation
                  ? (valuation.margin > 15 ? colors.success
                     : valuation.margin > 5 ? colors.warn
                     : colors.danger)
                  : colors.success,
              }}>
                {displayMargin}%
              </span>
              <div style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>
                {valuation
                  ? `ROI ${valuation.roi.toFixed(1)}%`
                  : `Confidence: +/-${DEMO.marginConfidence}%`
                }
              </div>
            </div>
          </div>

          {/* 3-approach breakdown — only when live valuation is active */}
          {valuation && (
            <div style={{
              marginTop: 12, padding: "10px 12px",
              background: colors.surface,
              border:     `1px solid ${colors.cardBorder}`,
              borderRadius: radii.md,
            }}>
              <div style={{
                fontFamily: fonts.label, fontSize: 9, fontWeight: 700,
                color: colors.textDim, textTransform: "uppercase",
                letterSpacing: "0.8px", marginBottom: 6,
              }}>
                3-Approach Blend
              </div>
              {[
                ["SCA  50%", valuation.scaValue,   colors.secondary],
                ["Cost 30%", valuation.costValue,   "#8b5cf6"],
                ["Inc  20%", valuation.incomeValue, colors.accent],
              ].map(([label, val, col]) => (
                <div key={label} style={{
                  display: "flex", justifyContent: "space-between", marginBottom: 2,
                }}>
                  <span style={{ fontFamily: fonts.data, fontSize: 10, color: colors.textDim }}>
                    {label}
                  </span>
                  <span style={{ fontFamily: fonts.data, fontSize: 10, fontWeight: 600, color: col }}>
                    {fmtK(val)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Monte Carlo Risk ── */}
        <div>
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between", marginBottom: 10,
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: fonts.label, fontSize: 13, fontWeight: 700,
              color: colors.textBright,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke={colors.accent} strokeWidth="2">
                <rect x="3"  y="12" width="4"  height="9"  rx="1" />
                <rect x="10" y="6"  width="4"  height="15" rx="1" />
                <rect x="17" y="3"  width="4"  height="18" rx="1" />
              </svg>
              Monte Carlo Risk
            </div>
            <span style={{
              fontFamily: fonts.label, fontSize: 11,
              color: colors.accent, cursor: "pointer",
            }}>
              Configure
            </span>
          </div>
          <MonteCarloHistogram bars={HISTOGRAM_BARS} />
        </div>

        {/* ── Mandatory legal disclaimer ── */}
        <DisclaimerBanner compact />

        {/* ── Action Buttons ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
          <button style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding:      "10px 0",
            background:   "transparent",
            border:       `1px solid ${colors.cardBorder}`,
            borderRadius: radii.md,
            color:        colors.text,
            fontFamily:   fonts.label, fontSize: 13, fontWeight: 600,
            cursor:       "pointer",
          }}>
            <span style={{ fontSize: 14 }}>+</span> Add to Comparison
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding:      "10px 0",
              background:   saving ? "rgba(0,212,255,0.12)" : "rgba(0,212,255,0.08)",
              border:       `1px solid ${saveStatus === "ok" ? colors.success : saveStatus === "err" ? colors.danger : colors.accent}`,
              borderRadius: radii.md,
              color:        saveStatus === "ok" ? colors.success : saveStatus === "err" ? colors.danger : colors.accent,
              fontFamily:   fonts.label, fontSize: 13, fontWeight: 700,
              cursor:       saving ? "default" : "pointer", textAlign: "center",
              letterSpacing: "0.3px", transition: "all 0.2s",
            }}
          >
            {saving ? "Saving…" : saveStatus === "ok" ? "✓ Saved" : saveStatus === "err" ? "Save Failed" : "Save Project"}
          </button>

          <button style={{
            padding:      "12px 0",
            background:   colors.accent,
            border:       "none",
            borderRadius: radii.md,
            color:        colors.bg,
            fontFamily:   fonts.label, fontSize: 14, fontWeight: 700,
            cursor:       "pointer", textAlign: "center",
            letterSpacing: "0.3px",
          }}>
            Generate PDF Report
          </button>
        </div>
      </div>
    </div>
  );
}
