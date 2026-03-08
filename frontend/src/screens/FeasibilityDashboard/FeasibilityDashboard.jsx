import { useState, useMemo, useEffect, useCallback } from "react";
import { colors, fonts, card, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import FeasibilityGauge from "../../components/shared/FeasibilityGauge";
import StatusBadge from "../../components/shared/StatusBadge";

import LeafletMap from "./LeafletMap";
import ImportModelModal from "./ImportModelModal";
import { computeNearbyComps, runValuation, fmtK, fmtUSD, BUILD_COST_PSF } from "./valuationEngine";
import { mapApi, projectsApi } from "../../services/api";

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

/* ── Land filter default — mirrors LeafletMap's LAND_FILTER_DEFAULT ── */
const LAND_FILTER_DEFAULT = {
  minPrice: "", maxPrice: "",
  minLotSf: "", maxLotSf: "",
  status:   "",
  zoning:   "",
  maxDom:   "",
};

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

/* ── Main screen ─────────────────────────────────────────────────────────── */
export default function FeasibilityDashboard() {
  const project = useProject();

  // ── Live MongoDB data — starts empty, filled on mount from API ──
  const [liveComps, setLiveComps] = useState([]);
  const [liveLand,  setLiveLand]  = useState([]);
  const [marketStats, setMarketStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      mapApi.getComparables(),
      mapApi.getLandListings(),
      mapApi.getMarketStats(),
    ])
      .then(([comps, land, stats]) => {
        if (cancelled) return;
        console.info(`[FeasibilityDashboard] MongoDB data loaded: ${comps?.length ?? 0} comps, ${land?.length ?? 0} land listings`);
        if (comps?.length)  setLiveComps(comps);
        if (land?.length)   setLiveLand(land);
        if (stats)          setMarketStats(stats);
      })
      .catch((err) => {
        console.warn('[FeasibilityDashboard] MongoDB fetch failed — map will be empty:', err?.message || err);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Map / analysis state ──────────────────────────────────────────────
  const [loc,     setLoc]     = useState(null);  // pinned map location
  const [selLand, setSelLand] = useState(null);  // selected vacant land parcel
  const [radius,  setRadius]  = useState(0.75);  // comp search radius (miles)
  const [radiusEnabled, setRadiusEnabled] = useState(true); // radius toggle

  // ── Import Model state ───────────────────────────────────────────────
  const [importedModel,   setImportedModel]   = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [landFilters,     setLandFilters]     = useState(LAND_FILTER_DEFAULT);

  // ── Project-derived subject-property specs ────────────────────────────
  // Base values from the active project store
  const storeSF      = project.totalSF || 2200;
  const storeStories = project.stories || 1;
  const storeBeds    = project.floorPlan?.rooms?.filter((r) => r.type === "bedroom").length  || 3;
  const storeBaths   = project.floorPlan?.rooms?.filter((r) => r.type === "bathroom").length || 2;
  const style        = project.floorPlan?.style || "traditional";
  const projectName  = project.projectName || "New Project";

  // Override with imported model if present — does NOT mutate useProjectStore
  const totalSF   = importedModel?.generate_params?.targetSF  ?? storeSF;
  const stories   = importedModel?.generate_params?.stories   ?? storeStories;
  const bedrooms  = importedModel?.generate_params?.bedrooms  ?? storeBeds;
  const bathrooms = importedModel?.generate_params?.bathrooms ?? storeBaths;

  // ── Derived analysis values ───────────────────────────────────────────
  const nearbyComps = useMemo(
    () => computeNearbyComps(loc, radius, liveComps, radiusEnabled),
    [loc, radius, liveComps, radiusEnabled]
  );

  const valuation = useMemo(
    () => runValuation(loc, selLand, nearbyComps, totalSF, bedrooms, bathrooms),
    [loc, selLand, nearbyComps, totalSF, bedrooms, bathrooms]
  );


  // ── Import Model handlers ─────────────────────────────────────────────
  const handleImportModel = useCallback((proj) => {
    setImportedModel(proj);
    setShowImportModal(false);

    // Compute minimum lot size from project footprint + 1.75× setback buffer
    const gp = proj.generate_params || {};
    let footprintSF;
    if (gp.lotWidth && gp.lotDepth)     footprintSF = gp.lotWidth * gp.lotDepth;
    else if (gp.targetSF && gp.stories) footprintSF = gp.targetSF / gp.stories;
    else if (gp.targetSF)               footprintSF = gp.targetSF;
    else                                footprintSF = 2200;

    const minLotSf = Math.max(Math.ceil(footprintSF * 1.75), 3000).toString();
    setLandFilters((prev) => ({ ...prev, minLotSf }));
  }, []);

  const handleClearImport = useCallback(() => {
    setImportedModel(null);
    // Reset only minLotSf — other manual filters are preserved
    setLandFilters((prev) => ({ ...prev, minLotSf: "" }));
  }, []);

  // ── Display values: live valuation when available, DEMO otherwise ─────
  const estTotalCost   = Math.round(BUILD_COST_PSF * totalSF);
  const estMarketValue = Math.round(estTotalCost / (1 - DEMO.margin / 100));

  const displayScore   = valuation ? valuation.feasScore                            : DEMO.score;
  const displayCost    = valuation ? Math.round(valuation.totalInvestment)          : estTotalCost;
  const displayCostPSF = valuation ? Math.round(valuation.totalInvestment / totalSF) : DEMO.costPerSf;
  const displayARV     = valuation ? Math.round(valuation.blended)                  : estMarketValue;
  const displayMargin  = valuation ? valuation.margin.toFixed(1)                    : DEMO.margin;

  // Parcel card — live data when land selected, DEMO data otherwise
  const parcelStatus  = selLand?.status === "Price Reduced" ? "warning" : "active";
  const parcelType    = selLand ? `${selLand.zoning} Zone · ${selLand.topography}` : "";
  const parcelLotSize = selLand ? selLand.lot_sf.toLocaleString("en-US")            : "";

  return (
    <>
    <div style={{
      display:    "flex",
      width:      "100%",
      height:     "100%",         // fills <main flex:1> — must NOT be 100vh
      background: colors.bg,
      fontFamily: fonts.label,
      color:      colors.text,
      overflow:   "hidden",
    }}>

      {/* ════════ LEFT: Live Leaflet Map (70%) ════════ */}
      <div style={{
        flex:       "0 0 70%",
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
          radiusEnabled={radiusEnabled}
          onRadiusEnabledChange={setRadiusEnabled}
          nearbyComps={nearbyComps}
          comps={liveComps}
          land={liveLand}
          landFilters={landFilters}
          onLandFiltersChange={setLandFilters}
        />

        {/* ── Parcel info card — only when a land parcel is selected ── */}
        {selLand && (
          <div style={{
            position: "absolute", bottom: 20, left: 16, zIndex: 800,
            ...card,
            padding:              "14px 18px",
            minWidth:             240,
            display:              "flex",
            flexDirection:        "column",
            gap:                  10,
            background:           "rgba(26,34,51,0.96)",
            backdropFilter:       "blur(12px)",
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
                {selLand.address}
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
                  Price
                </div>
                <span style={{ fontFamily: fonts.data, fontSize: 13, color: colors.success }}>
                  {fmtUSD(selLand.price)}
                </span>
              </div>
            </div>

            {selLand.url && (
              <a
                href={selLand.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display:        "block",
                  padding:        "7px 0",
                  background:     colors.accent,
                  borderRadius:   radii.md,
                  color:          "#fff",
                  fontFamily:     fonts.label, fontSize: 12, fontWeight: 600,
                  cursor:         "pointer", textAlign: "center",
                  textDecoration: "none",
                }}
              >
                View Listing ↗
              </a>
            )}
          </div>
        )}
      </div>

      {/* ════════ RIGHT: Feasibility Analysis Panel (30%) ════════ */}
      <div style={{
        flex:          "0 0 30%",
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
            <SubScoreBar label="Profitability"   level={valuation ? valuation.profitabilityLevel : "High"}  color={valuation ? (valuation.profitabilityLevel === "High" ? colors.success : valuation.profitabilityLevel === "Med" ? colors.warn : colors.danger) : colors.success} />
            <SubScoreBar label="Market Strength" level={valuation ? valuation.marketStrengthLevel : "Med"} color={valuation ? (valuation.marketStrengthLevel === "High" ? colors.success : valuation.marketStrengthLevel === "Med" ? colors.warn : colors.danger) : colors.warn} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <SubScoreBar label="Risk Profile"   level={valuation ? valuation.riskLevel : "Low"}           color={valuation ? (valuation.riskLevel === "Low" ? colors.secondary : valuation.riskLevel === "Med" ? colors.warn : colors.danger) : colors.secondary} />
            <SubScoreBar label="Infrastructure" level={valuation ? valuation.infrastructureLevel : "High"} color={valuation ? (valuation.infrastructureLevel === "High" ? colors.success : valuation.infrastructureLevel === "Med" ? colors.warn : colors.danger) : colors.success} />
          </div>
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
            {!valuation && marketStats && (
              <span style={{
                marginLeft: "auto", fontSize: 9, fontWeight: 700,
                padding: "2px 7px", borderRadius: radii.sm,
                background: "rgba(46,213,115,0.12)", color: colors.success,
                fontFamily: fonts.data, letterSpacing: "0.6px",
              }}>
                DB · {marketStats.comparables?.count || 0} COMPS · {marketStats.land?.count || 0} LAND
              </span>
            )}
          </div>

          {/* Land Acquisition — only when a parcel is selected */}
          {selLand && (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "baseline",
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
              {selLand.url && (
                <a
                  href={selLand.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block", marginTop: 4,
                    fontFamily: fonts.label, fontSize: 10, fontWeight: 600,
                    color: colors.accent, textDecoration: "none",
                  }}
                >
                  View Listing ↗
                </a>
              )}
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

        {/* ── Action Buttons ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>

          {/* Import Model button / active import badge */}
          {importedModel ? (
            <div style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              padding:        "8px 12px",
              background:     colors.accentDim,
              border:         `1px solid ${colors.accent}`,
              borderRadius:   radii.md,
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <span style={{
                  fontFamily:    fonts.label, fontSize: 9, fontWeight: 700,
                  color:         colors.accent, textTransform: "uppercase",
                  letterSpacing: "0.6px", display: "block",
                }}>
                  Using Model
                </span>
                <div style={{
                  fontFamily:   fonts.data, fontSize: 11, color: colors.textBright,
                  marginTop:    2,
                  overflow:     "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  maxWidth:     190,
                }}>
                  {importedModel.name || "Untitled Project"}
                </div>
              </div>
              <button
                onClick={handleClearImport}
                style={{
                  background:  "transparent",
                  border:      "none",
                  color:       colors.textDim,
                  fontSize:    18,
                  cursor:      "pointer",
                  padding:     "0 4px",
                  lineHeight:  1,
                  flexShrink:  0,
                  marginLeft:  8,
                }}
                title="Clear import"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowImportModal(true)}
              style={{
                padding:       "12px 0",
                background:    "transparent",
                border:        `1px solid ${colors.accent}`,
                borderRadius:  radii.md,
                color:         colors.accent,
                fontFamily:    fonts.label, fontSize: 14, fontWeight: 700,
                cursor:        "pointer", textAlign: "center",
                letterSpacing: "0.3px",
              }}
            >
              Import Model
            </button>
          )}

          {/* Generate PDF Report */}
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

    {/* ── Import Model modal ── */}
    {showImportModal && (
      <ImportModelModal
        onImport={handleImportModel}
        onClose={() => setShowImportModal(false)}
      />
    )}
    </>
  );
}
