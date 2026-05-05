import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { colors, fonts, card, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import FeasibilityGauge from "../../components/shared/FeasibilityGauge";
import StatusBadge from "../../components/shared/StatusBadge";

import LeafletMap from "./LeafletMap";
import { computeNearbyComps, runValuation, fmtK, fmtUSD, BUILD_COST_PSF } from "./valuationEngine";
import { generateFeasibilityPDF } from "./pdfReport";
import { mapApi, projectsApi } from "../../services/api";
import useBreakpoint from "../../hooks/useBreakpoint";

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
        fontFamily: fonts.label, fontSize: 12, color: colors.textDim,
        whiteSpace: "nowrap", minWidth: 80,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: 5, borderRadius: 3,
        background: colors.cardBorder, overflow: "hidden",
      }}>
        <div style={{
          width:      level === "High" ? "85%" : level === "Med" ? "55%" : "30%",
          height:     "100%",
          borderRadius: 3,
          background: color,
          transition: "width 0.4s ease",
        }} />
      </div>
      <span style={{
        fontFamily: fonts.data, fontSize: 12, fontWeight: 600,
        color, minWidth: 32, textAlign: "right",
      }}>
        {level}
      </span>
    </div>
  );
}

/* ── Main screen ─────────────────────────────────────────────────────────── */
export default function FeasibilityDashboard() {
  const project = useProject();
  const navigate = useNavigate();
  const isMobile = useBreakpoint(768);
  const [mobileTab, setMobileTab] = useState("map");

  // ── Live map data — populated when user searches a city ──
  const [liveComps,   setLiveComps]   = useState([]);
  const [liveLand,    setLiveLand]    = useState([]);
  const [marketStats, setMarketStats] = useState(null);
  const [mapLoading,  setMapLoading]  = useState(false);
  const [searchCity,  setSearchCity]  = useState(null); // { city, state }

  // Fire whenever the user submits a city search.
  // If the backend returns empty data (scrape in progress), polls every 10s
  // until data arrives — map updates automatically without any user interaction.
  useEffect(() => {
    if (!searchCity) return;
    let cancelled = false;
    let pollTimer = null;

    setMapLoading(true);

    const fetchData = (isPolling = false) => {
      mapApi.searchByCity(searchCity.city, searchCity.state)
        .then((data) => {
          if (cancelled) return;
          const hasData = (data?.comparables?.length ?? 0) > 0 || (data?.land?.length ?? 0) > 0;
          console.info(
            `[FeasibilityDashboard] City search "${searchCity.city}, ${searchCity.state}": ` +
            `${data?.comparables?.length ?? 0} comps, ${data?.land?.length ?? 0} land`
          );
          setLiveComps(data?.comparables ?? []);
          setLiveLand(data?.land ?? []);
          if (data?.centroid) setSearchCentroid(data.centroid);

          if (hasData) {
            // Data is ready — stop loading overlay
            setMapLoading(false);
          } else {
            // Scrape still in progress — poll again in 10s, keep overlay up
            pollTimer = setTimeout(() => { if (!cancelled) fetchData(true); }, 10000);
          }
        })
        .catch((err) => {
          console.warn('[FeasibilityDashboard] City search failed:', err?.message || err);
          if (!cancelled) { setLiveComps([]); setLiveLand([]); setMapLoading(false); }
        });
    };

    fetchData();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [searchCity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Centroid returned by the search — used to re-center the map
  const [searchCentroid, setSearchCentroid] = useState(null);

  // ── Map / analysis state ──────────────────────────────────────────────
  const [loc,     setLoc]     = useState(null);  // pinned map location
  const [selLand, setSelLand] = useState(null);  // selected vacant land parcel
  const [radius,  setRadius]  = useState(0.75);  // comp search radius (miles)
  const [radiusEnabled, setRadiusEnabled] = useState(true); // radius toggle

  // ── Select Plot state ────────────────────────────────────────────────────
  const [plotSaved,    setPlotSaved]    = useState(false);
  const [plotSaving,   setPlotSaving]   = useState(false);
  const [dbProject, setDbProject] = useState(null);

  // Fetch full project from DB on mount — used for readiness check and plot auto-restore
  useEffect(() => {
    if (!project.projectId) return;
    projectsApi.getPublic(project.projectId)
      .then((p) => setDbProject(p))
      .catch(() => {});
  }, [project.projectId]);

  // Reset saved state when user picks a different parcel
  useEffect(() => { setPlotSaved(false); }, [selLand]);

  const handleCitySearch = useCallback((city, state) => {
    setSearchCity({ city, state });
    setLoc(null);
    setSelLand(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-search from project location (stored separately, never wiped) ─
  const locationKey = project?.projectLocation
    ? `${project.projectLocation.city},${project.projectLocation.state}`
    : null;
  useEffect(() => {
    if (!locationKey) return;
    const [city, state] = locationKey.split(",");
    handleCitySearch(city, state);
  }, [locationKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [landFilters, setLandFilters] = useState(LAND_FILTER_DEFAULT);

  // ── Project-derived subject-property specs ────────────────────────────
  // Base values from the active project store
  const storeSF      = project.totalSF || 2200;
  const storeStories = project.stories || 1;
  const storeBeds    = project.floorPlan?.rooms?.filter((r) => r.type === "bedroom").length  || 3;
  const storeBaths   = project.floorPlan?.rooms?.filter((r) => r.type === "bathroom").length || 2;
  const style        = project.floorPlan?.style || "traditional";
  const projectName  = project.projectName || "New Project";

  const isReadyToBuild = dbProject != null &&
    (dbProject.floor_plan?.rooms?.length > 0) &&
    (dbProject.plot?.lat != null && dbProject.plot?.lng != null);

  const totalSF   = storeSF;
  const stories   = storeStories;
  const bedrooms  = storeBeds;
  const bathrooms = storeBaths;

  // Auto-set minimum lot size filter from the active project's footprint
  useEffect(() => {
    const gp = project.generateParams || {};
    let footprintSF;
    if (gp.lotWidth && gp.lotDepth)           footprintSF = gp.lotWidth * gp.lotDepth;
    else if (project.totalSF && project.stories) footprintSF = project.totalSF / project.stories;
    else if (project.totalSF)                 footprintSF = project.totalSF;
    else return;
    const minLotSf = Math.max(Math.ceil(footprintSF * 1.75), 3000).toString();
    setLandFilters((prev) => ({ ...prev, minLotSf }));
  }, [project.totalSF, project.stories, project.generateParams]);

  // Auto-restore saved plot once land data has loaded (fires after city search completes)
  useEffect(() => {
    if (!project.projectId || !liveLand.length || selLand) return;
    projectsApi.getPublic(project.projectId)
      .then((p) => {
        if (!p.plot?.lat || !p.plot?.lng) return;
        setSelLand(p.plot);
        setLoc({ lat: p.plot.lat, lng: p.plot.lng });
        setPlotSaved(true);
      })
      .catch(() => {});
  }, [liveLand]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived analysis values ───────────────────────────────────────────
  const nearbyComps = useMemo(
    () => computeNearbyComps(loc, radius, liveComps, radiusEnabled),
    [loc, radius, liveComps, radiusEnabled]
  );

  const valuation = useMemo(
    () => runValuation(loc, selLand, nearbyComps, totalSF, bedrooms, bathrooms),
    [loc, selLand, nearbyComps, totalSF, bedrooms, bathrooms]
  );


  // ── Select Plot handler ──────────────────────────────────────────────────
  const handleSelectPlot = useCallback(async () => {
    if (!selLand || !project.projectId) return;
    setPlotSaving(true);
    try {
      const savedPlot = {
        address: selLand.address,
        lat:     selLand.lat ?? loc?.lat,
        lng:     selLand.lng ?? loc?.lng,
        price:   selLand.price,
        lot_sf:  selLand.lot_sf,
        zoning:  selLand.zoning,
        url:     selLand.url ?? null,
      };
      await projectsApi.update(project.projectId, { plot: savedPlot });
      setPlotSaved(true);
      setDbProject((prev) => prev ? { ...prev, plot: savedPlot } : prev);
    } catch (_) {
      // silently fail — no UX disruption
    } finally {
      setPlotSaving(false);
    }
  }, [selLand, project.projectId, loc]);

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
  const locationText = loc
    ? `${loc.lat.toFixed(4)}° N, ${Math.abs(loc.lng).toFixed(4)}° W`
    : `${DEMO.lat}, ${DEMO.lng}`;

  const analysisPanel = (
    <div style={{
      flex:          isMobile ? "1 1 auto" : "0 0 30%",
      minWidth:      0,
      background:    colors.panel,
      borderLeft:    isMobile ? "none" : `1px solid ${colors.panelBorder}`,
      borderTop:     isMobile ? `1px solid ${colors.panelBorder}` : "none",
      overflowY:     "auto",
      overflowX:     "hidden",
      padding:       isMobile ? "18px 16px 24px" : "24px 24px 32px",
      display:       "flex",
      flexDirection: "column",
      gap:           isMobile ? 16 : 20,
      position:      "relative",
    }}>
      {mapLoading && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 100,
          background: "rgba(10,14,23,0.85)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "all",
        }}>
          <span style={{ color: "#94a3b8", fontSize: 13, fontFamily: "monospace", letterSpacing: "0.04em" }}>
            Analyzing market data…
          </span>
        </div>
      )}

      {!isMobile && (
        <div>
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
          }}>
            <h2 style={{
              margin: 0, fontFamily: fonts.label,
              fontSize: 22, fontWeight: 700, color: colors.textBright,
            }}>
              {projectName} — Feasibility
            </h2>
            <button
              onClick={() => navigate(-1)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "transparent", border: `1px solid ${colors.cardBorder}`,
                borderRadius: 6, color: colors.textDim, fontSize: 12,
                fontFamily: fonts.label, fontWeight: 600, padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              ← Back
            </button>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 4,
            fontFamily: fonts.data, fontSize: 13, color: colors.textDim,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill={colors.textDim}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            </svg>
            {locationText} | CT: {DEMO.ctId} | {totalSF.toLocaleString()} SF · {stories}-story · {style}
          </div>
        </div>
      )}

      {isMobile && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingBottom: 2,
        }}>
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            color: colors.textDim,
            fontFamily: fonts.data,
            fontSize: 12,
            lineHeight: 1.5,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill={colors.textDim} style={{ flexShrink: 0, marginTop: 3 }}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            </svg>
            <span>
              {locationText}
              <br />
              CT: {DEMO.ctId} | {totalSF.toLocaleString()} SF · {stories}-story · {style}
            </span>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", padding: isMobile ? "0 0 2px" : "4px 0" }}>
        <FeasibilityGauge score={displayScore} size={isMobile ? 96 : 110} />
      </div>

      <div style={{
        background: colors.surface,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: radii.md,
        padding: isMobile ? "12px" : "12px 14px",
      }}>
        <div style={{
          fontFamily: fonts.label, fontSize: 12, fontWeight: 700,
          color: colors.textDim, textTransform: "uppercase",
          letterSpacing: "0.8px", marginBottom: 12,
        }}>
          How Your Score Is Calculated
        </div>
        {[
          {
            label: "Sales Comparison",
            weight: "50%",
            color: colors.secondary,
            desc: "Recent nearby home sales — the heaviest factor, reflecting what buyers actually paid.",
          },
          {
            label: "Cost Approach",
            weight: "30%",
            color: "#8b5cf6",
            desc: "Estimated cost to build from scratch, anchoring value to real construction costs.",
          },
          {
            label: "Income Approach",
            weight: "20%",
            color: colors.accent,
            desc: "Projected rental or resale return, gauging investment potential.",
          },
        ].map(({ label, weight, color, desc }) => (
          <div key={label} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 3 }}>
              <span style={{ fontFamily: fonts.label, fontSize: isMobile ? 12 : 13, fontWeight: 700, color }}>
                {label}
              </span>
              <span style={{
                fontFamily: fonts.data, fontSize: 12, fontWeight: 700,
                color, background: `${color}18`, borderRadius: 3,
                padding: "2px 7px", flexShrink: 0,
              }}>
                {weight}
              </span>
            </div>
            <p style={{
              margin: 0, fontFamily: fonts.label, fontSize: 12,
              color: colors.textDim, lineHeight: 1.55,
            }}>
              {desc}
            </p>
          </div>
        ))}
      </div>

      {valuation && (
        <div style={{
          padding: isMobile ? "10px 12px" : "10px 12px",
          background: colors.surface,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: radii.md,
        }}>
          <div style={{
            fontFamily: fonts.label, fontSize: 12, fontWeight: 700,
            color: colors.textDim, textTransform: "uppercase",
            letterSpacing: "0.8px", marginBottom: 8,
          }}>
            3-Approach Blend
          </div>
          {[
            ["SCA  50%", valuation.scaValue,   colors.secondary],
            ["Cost 30%", valuation.costValue,   "#8b5cf6"],
            ["Inc  20%", valuation.incomeValue, colors.accent],
          ].map(([label, val, col]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 12 }}>
              <span style={{ fontFamily: fonts.data, fontSize: 12, color: colors.textDim }}>
                {label}
              </span>
              <span style={{ fontFamily: fonts.data, fontSize: 12, fontWeight: 600, color: col, textAlign: "right" }}>
                {fmtK(val)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12 }}>
          <SubScoreBar label="Profitability"   level={valuation ? valuation.profitabilityLevel : "High"}  color={valuation ? (valuation.profitabilityLevel === "High" ? colors.success : valuation.profitabilityLevel === "Med" ? colors.warn : colors.danger) : colors.success} />
          <SubScoreBar label="Market Strength" level={valuation ? valuation.marketStrengthLevel : "Med"} color={valuation ? (valuation.marketStrengthLevel === "High" ? colors.success : valuation.marketStrengthLevel === "Med" ? colors.warn : colors.danger) : colors.warn} />
        </div>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12 }}>
          <SubScoreBar label="Risk Profile"   level={valuation ? valuation.riskLevel : "Low"}           color={valuation ? (valuation.riskLevel === "Low" ? colors.secondary : valuation.riskLevel === "Med" ? colors.warn : colors.danger) : colors.secondary} />
          <SubScoreBar label="Infrastructure" level={valuation ? valuation.infrastructureLevel : "High"} color={valuation ? (valuation.infrastructureLevel === "High" ? colors.success : valuation.infrastructureLevel === "Med" ? colors.warn : colors.danger) : colors.success} />
        </div>
      </div>

      <div>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 14,
          fontFamily: fonts.label, fontSize: isMobile ? 14 : 15, fontWeight: 700,
          color: colors.textBright, flexWrap: "wrap",
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
              marginLeft: isMobile ? 0 : "auto", fontSize: 9, fontWeight: 700,
              padding: "2px 7px", borderRadius: radii.sm,
              background: colors.accentDim, color: colors.accent,
              fontFamily: fonts.data, letterSpacing: "0.6px",
            }}>
              LIVE · {nearbyComps.length} COMPS
            </span>
          )}
          {!valuation && marketStats && (
            <span style={{
              marginLeft: isMobile ? 0 : "auto", fontSize: 9, fontWeight: 700,
              padding: "2px 7px", borderRadius: radii.sm,
              background: "rgba(46,213,115,0.12)", color: colors.success,
              fontFamily: fonts.data, letterSpacing: "0.6px",
            }}>
              DB · {marketStats.comparables?.count || 0} COMPS · {marketStats.land?.count || 0} LAND
            </span>
          )}
        </div>

        {selLand && (
          <div style={{ marginBottom: 12 }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "baseline", gap: 12,
            }}>
              <div>
                <div style={{ fontFamily: fonts.label, fontSize: 14, color: colors.textDim }}>
                  Land Acquisition
                </div>
                <div style={{ fontFamily: fonts.data, fontSize: 12, color: colors.textDim }}>
                  {selLand.lot_sf.toLocaleString()} SF · {selLand.zoning}
                </div>
              </div>
              <span style={{
                fontFamily: fonts.data, fontSize: isMobile ? 18 : 20, fontWeight: 700,
                color: colors.textBright, textAlign: "right",
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

        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "baseline", marginBottom: 12, gap: 12,
        }}>
          <div>
            <div style={{ fontFamily: fonts.label, fontSize: 14, color: colors.textDim }}>
              Est. Const. Cost
            </div>
            <div style={{ fontFamily: fonts.data, fontSize: 12, color: colors.textDim }}>
              ${displayCostPSF} / sqft
            </div>
          </div>
          <span style={{
            fontFamily: fonts.data, fontSize: isMobile ? 18 : 20, fontWeight: 700,
            color: colors.textBright, textAlign: "right",
          }}>
            ${displayCost.toLocaleString()}
          </span>
        </div>

        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "baseline", marginBottom: 12, gap: 12,
        }}>
          <div>
            <div style={{ fontFamily: fonts.label, fontSize: 14, color: colors.textDim }}>
              Market Value (ARV)
            </div>
            <div style={{ fontFamily: fonts.data, fontSize: 12, color: colors.success }}>
              {valuation ? `${nearbyComps.length} comps · blended` : `+${DEMO.marketYoy}% YoY`}
            </div>
          </div>
          <span style={{
            fontFamily: fonts.data, fontSize: isMobile ? 18 : 20, fontWeight: 700,
            color: colors.textBright, textAlign: "right",
          }}>
            ${displayARV.toLocaleString()}
          </span>
        </div>

        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "baseline", gap: 12,
        }}>
          <div>
            <div style={{ fontFamily: fonts.label, fontSize: 14, color: colors.textDim }}>
              Net Margin
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{
              fontFamily: fonts.data, fontSize: isMobile ? 18 : 20, fontWeight: 700,
              color: valuation
                ? (valuation.margin > 15 ? colors.success
                   : valuation.margin > 5 ? colors.warn
                   : colors.danger)
                : colors.success,
            }}>
              {displayMargin}%
            </span>
            <div style={{ fontFamily: fonts.data, fontSize: 12, color: colors.textDim }}>
              {valuation
                ? `ROI ${valuation.roi.toFixed(1)}%`
                : `Confidence: +/-${DEMO.marginConfidence}%`
              }
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto", paddingTop: isMobile ? 6 : 0 }}>
        <button
          onClick={() => isReadyToBuild && navigate("/browse")}
          disabled={!isReadyToBuild}
          title={!isReadyToBuild ? "Complete all project steps to enable" : ""}
          style={{
            padding: "12px 0",
            background: isReadyToBuild
              ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
              : colors.surface,
            border: `1px solid ${isReadyToBuild ? "transparent" : colors.cardBorder}`,
            borderRadius: radii.md,
            color: isReadyToBuild ? "#fff" : colors.textDim,
            fontFamily: fonts.label, fontSize: 14, fontWeight: 700,
            cursor: isReadyToBuild ? "pointer" : "not-allowed",
            textAlign: "center", letterSpacing: "0.3px",
            opacity: isReadyToBuild ? 1 : 0.5,
            transition: "all 0.2s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M2 17c0-3 2.5-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="14" cy="6" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.7" />
            <path d="M14 10c2 0 4 1.2 4 3" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.7" />
          </svg>
          Choose Builders
        </button>
        {!isReadyToBuild && (
          <p style={{
            margin: "-4px 0 0", fontFamily: fonts.label,
            fontSize: 10, color: colors.textDim,
            textAlign: "center", letterSpacing: "0.03em",
          }}>
            Complete all project steps to unlock
          </p>
        )}

        {selLand && project.projectId && (
          <button
            onClick={handleSelectPlot}
            disabled={plotSaving || plotSaved}
            style={{
              padding:      "12px 0",
              background:   plotSaved ? colors.successDim : "transparent",
              border:       `1px solid ${plotSaved ? colors.success : colors.secondary}`,
              borderRadius: radii.md,
              color:        plotSaved ? colors.success : colors.secondary,
              fontFamily:   fonts.label, fontSize: 14, fontWeight: 700,
              cursor:       plotSaved || plotSaving ? "default" : "pointer",
              textAlign:    "center", letterSpacing: "0.3px",
              opacity:      plotSaving ? 0.6 : 1,
              transition:   "all 0.2s",
            }}
          >
            {plotSaved ? "✓ Plot Selected" : plotSaving ? "Saving…" : "Select Plot"}
          </button>
        )}

        <button
          onClick={() =>
            generateFeasibilityPDF({
              projectName,
              loc,
              selLand,
              valuation,
              nearbyComps,
              totalSF,
              stories,
              bedrooms,
              bathrooms,
              style,
              marketStats,
              demoScore:     DEMO.score,
              demoCostPSF:   DEMO.costPerSf,
              demoMargin:    DEMO.margin,
              demoARV:       DEMO.marketValue,
              demoTotalCost: DEMO.totalCost,
            })
          }
          style={{
            padding:      "12px 0",
            background:   colors.accent,
            border:       "none",
            borderRadius: radii.md,
            color:        colors.bg,
            fontFamily:   fonts.label, fontSize: 14, fontWeight: 700,
            cursor:       "pointer", textAlign: "center",
            letterSpacing: "0.3px",
          }}
        >
          Generate PDF Report
        </button>
      </div>
    </div>
  );

  return (
    <div style={{
      display:    "flex",
      flexDirection: isMobile ? "column" : "row",
      width:      "100%",
      height:     "100%",         // fills <main flex:1> — must NOT be 100vh
      background: colors.bg,
      fontFamily: fonts.label,
      color:      colors.text,
      overflow:   "hidden",
      overflowX:  "hidden",
    }}>
      {isMobile && (
        <div style={{
          padding: "16px 16px 12px",
          borderBottom: `1px solid ${colors.panelBorder}`,
          background: colors.bg,
          flexShrink: 0,
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}>
            <h2 style={{
              margin: 0,
              fontFamily: fonts.label,
              fontSize: 20,
              fontWeight: 700,
              color: colors.textBright,
              minWidth: 0,
            }}>
              {projectName} — Feasibility
            </h2>
            <button
              onClick={() => navigate(-1)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "transparent", border: `1px solid ${colors.cardBorder}`,
                borderRadius: 6, color: colors.textDim, fontSize: 12,
                fontFamily: fonts.label, fontWeight: 600, padding: "4px 10px",
                cursor: "pointer", flexShrink: 0,
              }}
            >
              ← Back
            </button>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            background: colors.surface,
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: radii.lg,
            padding: 4,
          }}>
            {[
              ["map", "Map"],
              ["analysis", "Analysis"],
            ].map(([key, label]) => {
              const active = mobileTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setMobileTab(key)}
                  style={{
                    padding: "10px 0",
                    borderRadius: radii.md,
                    border: "none",
                    background: active ? colors.accent : "transparent",
                    color: active ? colors.bg : colors.textDim,
                    fontFamily: fonts.label,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(!isMobile || mobileTab === "map") && (
        <div style={{
          flex:       isMobile ? "1 1 auto" : "0 0 70%",
          position:   "relative",
          background: colors.bg,
          overflow:   "hidden",
          minHeight:  0,
        }}>
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
            onCitySearch={handleCitySearch}
            mapLoading={mapLoading}
            searchCentroid={searchCentroid}
            isMobile={isMobile}
          />

          {selLand && (
            <div style={{
              position: "absolute",
              bottom: isMobile ? 16 : 20,
              left: 16,
              right: isMobile ? 16 : "auto",
              zIndex: 800,
              ...card,
              padding:              isMobile ? "12px 14px" : "14px 18px",
              minWidth:             isMobile ? 0 : 240,
              maxWidth:             isMobile ? "none" : 320,
              display:              "flex",
              flexDirection:        "column",
              gap:                  isMobile ? 8 : 10,
              background:           "rgba(26,34,51,0.96)",
              backdropFilter:       "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
                <span style={{
                  fontFamily: fonts.data, fontSize: 13, fontWeight: 700,
                  color: colors.textBright,
                  overflowWrap: "anywhere",
                  lineHeight: 1.45,
                  flex: 1,
                  minWidth: 0,
                }}>
                  {selLand.address}
                </span>
                <StatusBadge status={parcelStatus} />
              </div>

              <span style={{ fontFamily: fonts.label, fontSize: 11, color: colors.textDim, lineHeight: 1.4 }}>
                {parcelType}
              </span>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
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
      )}

      {(!isMobile || mobileTab === "analysis") && analysisPanel}
    </div>
  );
}
