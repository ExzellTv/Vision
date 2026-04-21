/**
 * LeafletMap — live map component for the Analysis Hub.
 *
 * Renders inside the 60% left panel of FeasibilityDashboard. All Leaflet
 * lifecycle is delegated to useLeafletMap. This component owns:
 *  - layer visibility state (showComps, showLand)
 *  - tile type state (activeLayer)
 *  - comp listing filter state (compFilters, filterOpen)
 *
 * Props flowing down from FeasibilityDashboard (land filter lifted state):
 *  - landFilters        → controlled land filter object
 *  - onLandFiltersChange → setter for land filter (allows import model to set minLotSf)
 *  - draggable position state for the layers menu and filter panel
 *  - the map container ref passed to the hook
 *  - all overlay UI rendered as React elements
 *
 * Props flowing up to FeasibilityDashboard:
 *  - onLocChange  → sets loc (analysis pin)
 *  - onLandSelect → sets selLand (selected parcel)
 *  - onRadiusChange → sets radius for comp search
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { colors, fonts, radii } from "../../theme/tokens";
import { useLeafletMap } from "./useLeafletMap";

// ── Filter defaults ────────────────────────────────────────────────────────

const COMP_FILTER_DEFAULT = {
  minPrice: "", maxPrice: "",
  minSf:    "", maxSf:    "",
  minPsf:   "", maxPsf:   "",
  minBeds:  "",
  propertyType: "",
};

const LAND_FILTER_DEFAULT = {
  minPrice: "", maxPrice: "",
  minLotSf: "", maxLotSf: "",
  status:   "",
  zoning:   "",
  maxDom:   "",
};

// ── Filter functions (pure) ────────────────────────────────────────────────

function applyCompFilters(list, f) {
  return list.filter((c) => {
    if (f.minPrice     && c.sale_price   < +f.minPrice)       return false;
    if (f.maxPrice     && c.sale_price   > +f.maxPrice)       return false;
    if (f.minSf        && c.sf           < +f.minSf)          return false;
    if (f.maxSf        && c.sf           > +f.maxSf)          return false;
    if (f.minPsf       && c.price_per_sf < +f.minPsf)         return false;
    if (f.maxPsf       && c.price_per_sf > +f.maxPsf)         return false;
    if (f.minBeds      && c.bedrooms     < +f.minBeds)        return false;
    if (f.propertyType && c.property_type !== f.propertyType)  return false;
    return true;
  });
}

function applyLandFilters(list, f) {
  return list.filter((l) => {
    if (f.minPrice && l.price  < +f.minPrice) return false;
    if (f.maxPrice && l.price  > +f.maxPrice) return false;
    if (f.minLotSf && l.lot_sf < +f.minLotSf) return false;
    if (f.maxLotSf && l.lot_sf > +f.maxLotSf) return false;
    if (f.status   && l.status  !== f.status)  return false;
    if (f.zoning   && l.zoning  !== f.zoning)  return false;
    if (f.maxDom   && l.days_on_market != null && l.days_on_market > +f.maxDom) return false;
    return true;
  });
}

function countActiveFilters(filters) {
  return Object.values(filters).filter((v) => v !== "").length;
}

// ── Button style factories ────────────────────────────────────────────────

const overlayPill = (active, activeColor = colors.accent) => ({
  display:        "flex",
  alignItems:     "center",
  gap:            5,
  padding:        "5px 10px",
  borderRadius:   radii.md,
  border:         `1px solid ${active ? activeColor : colors.cardBorder}`,
  background:     active ? `${activeColor}18` : "rgba(26,34,51,0.88)",
  color:          active ? activeColor : colors.textDim,
  fontSize:       9,
  fontWeight:     700,
  letterSpacing:  "0.8px",
  cursor:         "pointer",
  fontFamily:     fonts.label,
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  transition:     "border-color 0.15s, color 0.15s, background 0.15s",
});

const zoomBtn = {
  width:          32,
  height:         32,
  display:        "flex",
  alignItems:     "center",
  justifyContent: "center",
  background:     "rgba(26,34,51,0.88)",
  border:         `1px solid ${colors.cardBorder}`,
  borderRadius:   radii.md,
  color:          colors.text,
  fontSize:       17,
  fontWeight:     500,
  cursor:         "pointer",
  fontFamily:     fonts.data,
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  lineHeight:     1,
};

const DropdownDivider = () => (
  <div style={{ height: 1, background: colors.cardBorder, margin: "4px 0" }} />
);

// ── Loading spinner ───────────────────────────────────────────────────────

function MapSpinner() {
  useEffect(() => {
    if (document.getElementById("vmap-spin-kf")) return;
    const s = document.createElement("style");
    s.id = "vmap-spin-kf";
    s.textContent = "@keyframes vmapSpin { to { transform: rotate(360deg); } }";
    document.head.appendChild(s);
  }, []);
  return (
    <div style={{
      width: 36, height: 36,
      border: "3px solid rgba(255,255,255,0.08)",
      borderTopColor: "#3b82f6",
      borderRadius: "50%",
      animation: "vmapSpin 0.75s linear infinite",
    }} />
  );
}

// ── Grip handle icon ──────────────────────────────────────────────────────

function GripIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <circle cx="2" cy="2" r="1.1" />
      <circle cx="5" cy="2" r="1.1" />
      <circle cx="8" cy="2" r="1.1" />
      <circle cx="2" cy="5" r="1.1" />
      <circle cx="5" cy="5" r="1.1" />
      <circle cx="8" cy="5" r="1.1" />
      <circle cx="2" cy="8" r="1.1" />
      <circle cx="5" cy="8" r="1.1" />
      <circle cx="8" cy="8" r="1.1" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export default function LeafletMap({
  loc,
  onLocChange,
  onLandSelect,
  radius,
  onRadiusChange,
  radiusEnabled,
  onRadiusEnabledChange,
  nearbyComps,
  comps,
  land,
  landFilters,         // controlled by FeasibilityDashboard
  onLandFiltersChange, // setter provided by FeasibilityDashboard
  onCitySearch,        // (city, state) → triggers live HasData fetch
  mapLoading,          // boolean — true while city search is in-flight
  searchCentroid,      // { lat, lng } | null — re-center map after search
}) {
  const mapRef = useRef(null);

  // ── Layer visibility ──────────────────────────────────────────────────
  const [showComps, setShowComps] = useState(true);
  const [showLand,  setShowLand]  = useState(true);

  // ── Filter state ──────────────────────────────────────────────────────
  // compFilters is local; landFilters is lifted to FeasibilityDashboard
  const [compFilters, setCompFilters] = useState(COMP_FILTER_DEFAULT);
  const [filterOpen,  setFilterOpen]  = useState(null); // null | "comp" | "land"
  const filterPanelRef = useRef(null);

  // ── Filter panel drag ─────────────────────────────────────────────────
  const [filterPos, setFilterPos] = useState({ top: 12, left: 210 });
  const dragState = useRef(null); // null | { x0, y0, left0, top0 }

  useEffect(() => {
    const onMove = (e) => {
      const d = dragState.current;
      if (!d) return;
      setFilterPos({ left: d.left0 + (e.clientX - d.x0), top: d.top0 + (e.clientY - d.y0) });
    };
    const onUp = () => { dragState.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startFilterDrag = (e, currentPos) => {
    if (e.button !== 0) return;
    dragState.current = { x0: e.clientX, y0: e.clientY, left0: currentPos.left, top0: currentPos.top };
    e.preventDefault();
  };

  // ── Unique select options from live data ──────────────────────────────
  const compPropTypes = useMemo(
    () => [...new Set((comps ?? []).map((c) => c.property_type).filter(Boolean))].sort(),
    [comps]
  );
  const landStatuses = useMemo(
    () => [...new Set((land ?? []).map((l) => l.status).filter(Boolean))].sort(),
    [land]
  );
  const landZonings = useMemo(
    () => [...new Set((land ?? []).map((l) => l.zoning).filter((v) => v && v !== "N/A"))].sort(),
    [land]
  );

  // ── Filtered datasets ─────────────────────────────────────────────────
  const filteredComps = useMemo(
    () => applyCompFilters(comps ?? [], compFilters),
    [comps, compFilters]
  );
  const filteredNearbyComps = useMemo(
    () => applyCompFilters(nearbyComps ?? [], compFilters),
    [nearbyComps, compFilters]
  );
  const filteredLand = useMemo(
    () => applyLandFilters(land ?? [], landFilters),
    [land, landFilters]
  );

  const compFilterCount = countActiveFilters(compFilters);
  const landFilterCount = countActiveFilters(landFilters);

  // ── Close filter panel on outside click ──────────────────────────────
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e) => {
      if (
        filterPanelRef.current && !filterPanelRef.current.contains(e.target) &&
        dropdownRef.current    && !dropdownRef.current.contains(e.target) &&
        !(mapRef.current       &&  mapRef.current.contains(e.target))
      ) {
        setFilterOpen(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterOpen]);

  // ── Layers dropdown open/close ────────────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // ── Tile layer ────────────────────────────────────────────────────────
  const [activeLayer, setActiveLayer] = useState(
    () => localStorage.getItem("vmap_theme") || "satellite"
  );
  const handleLayerChange = (key) => {
    setActiveLayer(key);
    localStorage.setItem("vmap_theme", key);
  };

  // ── Leaflet hook ──────────────────────────────────────────────────────
  const { mapI } = useLeafletMap({
    mapRef,
    loc,
    onLocChange,
    onLandSelect,
    nearbyComps: filteredNearbyComps,
    comps:       filteredComps,
    land:        filteredLand,
    radius,
    radiusEnabled,
    showComps,
    showLand,
    activeLayer,
  });

  // ── Detect when Leaflet finishes initialising (mapI.current becomes non-null) ─
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    if (mapReady) return;
    const id = setInterval(() => {
      if (mapI?.current) { setMapReady(true); clearInterval(id); }
    }, 50);
    return () => clearInterval(id);
  }, [mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-center map when centroid changes after a city search ──────────
  useEffect(() => {
    if (!searchCentroid || !mapReady || !mapI?.current) return;
    mapI.current.setView([searchCentroid.lat, searchCentroid.lng], 12, { animate: true });
  }, [searchCentroid, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shared input styles for filter panel ─────────────────────────────
  const inputS = {
    width:        "100%",
    background:   "rgba(13,17,23,0.8)",
    border:       `1px solid ${colors.cardBorder}`,
    borderRadius: 4,
    color:        colors.text,
    fontFamily:   fonts.data,
    fontSize:     10,
    padding:      "3px 6px",
    outline:      "none",
    boxSizing:    "border-box",
  };
  const labelS = {
    fontFamily:    fonts.label,
    fontSize:      9,
    color:         colors.textDim,
    fontWeight:    700,
    letterSpacing: "0.6px",
    textTransform: "uppercase",
    marginBottom:  3,
    display:       "block",
  };

  return (
    <div style={{ position: "absolute", inset: 0 }}>

      {/* ── Leaflet popup + global CSS ── */}
      <style>{`
        .vmap-popup .leaflet-popup-content-wrapper {
          background:    ${colors.cardSurface};
          border:        1px solid ${colors.cardBorder};
          border-radius: 8px;
          box-shadow:    0 4px 24px rgba(0,0,0,0.5);
          color:         ${colors.text};
        }
        .vmap-popup .leaflet-popup-content  { margin: 12px 14px; }
        .vmap-popup .leaflet-popup-tip      { background: ${colors.cardSurface}; }
        .vmap-popup-body  { font-family: 'Inter', sans-serif; min-width: 180px; }
        .vmap-popup-price { font-size: 16px; font-weight: 700; color: ${colors.textBright}; margin-bottom: 5px; }
        .vmap-popup-address { font-size: 11px; color: ${colors.textDim}; margin-bottom: 5px; }
        .vmap-popup-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; font-size: 11px; }
        .vmap-popup-grid span { color: ${colors.textDim}; }
        .vmap-popup-grid b    { color: ${colors.textBright}; font-family: 'JetBrains Mono', monospace; }
        .leaflet-control-attribution {
          background: rgba(13,17,23,0.75) !important;
          color: ${colors.textDim} !important;
          font-size: 9px !important;
        }
        .leaflet-control-attribution a { color: ${colors.textDim} !important; }
        @keyframes vMapPulse {
          0%   { transform: scale(1);   opacity: 0.7; }
          100% { transform: scale(2.2); opacity: 0;   }
        }
        @keyframes vDropFadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        .vmap-select option { background: #1a2233; color: #e2e8f0; }
      `}</style>

      {/* ── Map canvas ── */}
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

      {/* ── Map loading overlay ── */}
      {mapLoading && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 1000,
          background: "rgba(10,14,23,0.78)",
          backdropFilter: "blur(4px)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 14,
        }}>
          <MapSpinner />
          <span style={{ color: "#e2e8f0", fontSize: 13, fontFamily: fonts.mono, letterSpacing: "0.04em" }}>
            Loading map data…
          </span>
        </div>
      )}

      {/* ── Tile-type toggles — top-right (fixed, no drag needed) ── */}
      <div style={{
        position: "absolute", top: 12, right: 12, zIndex: 400,
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        {[
          ["dark",      "DARK"],
          ["satellite", "SAT"],
          ["standard",  "OSM"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => handleLayerChange(key)}
            style={overlayPill(activeLayer === key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Map Legend — always visible, top-left ── */}
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 400 }}>
        <div style={{
          background:     "rgba(26,34,51,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border:         `1px solid ${colors.cardBorder}`,
          borderRadius:   radii.lg,
          padding:        "12px 14px",
          minWidth:       185,
        }}>
          {/* Comparables legend */}
          <div style={{
            fontFamily: fonts.label, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.7px", color: colors.textDim,
            textTransform: "uppercase", marginBottom: 8,
          }}>
            Comp $/SF
          </div>
          {[
            [colors.success, "< $207",     "Below Market"],
            [colors.warn,    "$207–$212",  "At Market"],
            [colors.danger,  "≥ $212",     "Above Market"],
          ].map(([col, range, label]) => (
            <div key={range} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: col, flexShrink: 0 }} />
              <span style={{ fontFamily: fonts.data, fontSize: 12, color: col, fontWeight: 700, minWidth: 60 }}>
                {range}
              </span>
              <span style={{ fontFamily: fonts.label, fontSize: 11, color: colors.textDim }}>
                {label}
              </span>
            </div>
          ))}

          {/* Divider */}
          <div style={{ height: 1, background: colors.cardBorder, margin: "10px 0" }} />

          {/* Land legend */}
          <div style={{
            fontFamily: fonts.label, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.7px", color: colors.textDim,
            textTransform: "uppercase", marginBottom: 8,
          }}>
            Land Listings
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 12, height: 12, borderRadius: "2px",
              background: "#8b5cf6", flexShrink: 0,
              transform: "rotate(45deg)",
            }} />
            <span style={{ fontFamily: fonts.label, fontSize: 11, color: colors.textDim }}>
              Vacant / Available Parcel
            </span>
          </div>
        </div>
      </div>

      {/* ── Filter Panel — draggable ── */}
      {filterOpen && (
        <div
          ref={filterPanelRef}
          style={{
            position:         "absolute",
            top:              filterPos.top,
            left:             filterPos.left,
            zIndex:           410,
            width:            240,
            background:       "rgba(26,34,51,0.97)",
            backdropFilter:   "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border:           `1px solid ${colors.cardBorder}`,
            borderRadius:     radii.lg,
            boxShadow:        "0 8px 32px rgba(0,0,0,0.55)",
            animation:        "vDropFadeIn 0.14s ease",
            userSelect:       "none",
            WebkitUserSelect: "none",
          }}
        >
          {/* Drag handle header */}
          <div
            onMouseDown={(e) => startFilterDrag(e, filterPos)}
            style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              padding:        "9px 12px 8px",
              cursor:         "grab",
              borderBottom:   `1px solid ${colors.cardBorder}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {/* Grip dots in header */}
              <span style={{ color: colors.textDim, lineHeight: 0, opacity: 0.6 }}>
                <GripIcon />
              </span>
              <span style={{
                fontFamily:    fonts.label,
                fontSize:      10,
                fontWeight:    700,
                color:         filterOpen === "land" ? colors.warn : colors.accent,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
              }}>
                {filterOpen === "land" ? "Land" : "Comp"} Filters
              </span>
            </div>
            {/* Close button — stopPropagation so it doesn't start a drag */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setFilterOpen(null)}
              style={{
                background: "transparent", border: "none",
                color:      colors.textDim, fontSize: 15, lineHeight: 1,
                cursor:     "pointer", padding: "0 2px", fontFamily: fonts.data,
              }}
              title="Close"
            >
              ×
            </button>
          </div>

          {/* Filter fields */}
          <div style={{
            padding:       "10px 12px",
            display:       "flex",
            flexDirection: "column",
            gap:           10,
            // Allow the panel to scroll if it grows tall
            maxHeight:     420,
            overflowY:     "auto",
          }}>

            {filterOpen === "comp" ? (
              <>
                {/* Sale Price */}
                <div>
                  <label style={labelS}>Sale Price ($)</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                    <input type="number" min={0} placeholder="Min" style={inputS}
                           value={compFilters.minPrice}
                           onChange={(e) => setCompFilters((f) => ({ ...f, minPrice: e.target.value }))} />
                    <input type="number" min={0} placeholder="Max" style={inputS}
                           value={compFilters.maxPrice}
                           onChange={(e) => setCompFilters((f) => ({ ...f, maxPrice: e.target.value }))} />
                  </div>
                </div>

                {/* Interior Size */}
                <div>
                  <label style={labelS}>Size (SF)</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                    <input type="number" min={0} placeholder="Min" style={inputS}
                           value={compFilters.minSf}
                           onChange={(e) => setCompFilters((f) => ({ ...f, minSf: e.target.value }))} />
                    <input type="number" min={0} placeholder="Max" style={inputS}
                           value={compFilters.maxSf}
                           onChange={(e) => setCompFilters((f) => ({ ...f, maxSf: e.target.value }))} />
                  </div>
                </div>

                {/* Price / SF */}
                <div>
                  <label style={labelS}>Price / SF</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                    <input type="number" min={0} placeholder="Min" style={inputS}
                           value={compFilters.minPsf}
                           onChange={(e) => setCompFilters((f) => ({ ...f, minPsf: e.target.value }))} />
                    <input type="number" min={0} placeholder="Max" style={inputS}
                           value={compFilters.maxPsf}
                           onChange={(e) => setCompFilters((f) => ({ ...f, maxPsf: e.target.value }))} />
                  </div>
                </div>

                {/* Min Bedrooms */}
                <div>
                  <label style={labelS}>Min Bedrooms</label>
                  <input type="number" min={0} max={10} placeholder="Any" style={inputS}
                         value={compFilters.minBeds}
                         onChange={(e) => setCompFilters((f) => ({ ...f, minBeds: e.target.value }))} />
                </div>

                {/* Property Type */}
                {compPropTypes.length > 0 && (
                  <div>
                    <label style={labelS}>Property Type</label>
                    <select
                      className="vmap-select"
                      style={{ ...inputS, cursor: "pointer" }}
                      value={compFilters.propertyType}
                      onChange={(e) => setCompFilters((f) => ({ ...f, propertyType: e.target.value }))}
                    >
                      <option value="">All types</option>
                      {compPropTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Land Price */}
                <div>
                  <label style={labelS}>Price ($)</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                    <input type="number" min={0} placeholder="Min" style={inputS}
                           value={landFilters.minPrice}
                           onChange={(e) => onLandFiltersChange((f) => ({ ...f, minPrice: e.target.value }))} />
                    <input type="number" min={0} placeholder="Max" style={inputS}
                           value={landFilters.maxPrice}
                           onChange={(e) => onLandFiltersChange((f) => ({ ...f, maxPrice: e.target.value }))} />
                  </div>
                </div>

                {/* Lot Size */}
                <div>
                  <label style={labelS}>Lot Size (SF)</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                    <input type="number" min={0} placeholder="Min" style={inputS}
                           value={landFilters.minLotSf}
                           onChange={(e) => onLandFiltersChange((f) => ({ ...f, minLotSf: e.target.value }))} />
                    <input type="number" min={0} placeholder="Max" style={inputS}
                           value={landFilters.maxLotSf}
                           onChange={(e) => onLandFiltersChange((f) => ({ ...f, maxLotSf: e.target.value }))} />
                  </div>
                </div>

                {/* Status */}
                {landStatuses.length > 0 && (
                  <div>
                    <label style={labelS}>Status</label>
                    <select
                      className="vmap-select"
                      style={{ ...inputS, cursor: "pointer" }}
                      value={landFilters.status}
                      onChange={(e) => onLandFiltersChange((f) => ({ ...f, status: e.target.value }))}
                    >
                      <option value="">All statuses</option>
                      {landStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}

                {/* Zoning */}
                {landZonings.length > 0 && (
                  <div>
                    <label style={labelS}>Zoning</label>
                    <select
                      className="vmap-select"
                      style={{ ...inputS, cursor: "pointer" }}
                      value={landFilters.zoning}
                      onChange={(e) => onLandFiltersChange((f) => ({ ...f, zoning: e.target.value }))}
                    >
                      <option value="">All zones</option>
                      {landZonings.map((z) => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                )}

                {/* Max Days on Market */}
                <div>
                  <label style={labelS}>Max Days on Market</label>
                  <input type="number" min={0} placeholder="Any" style={inputS}
                         value={landFilters.maxDom}
                         onChange={(e) => onLandFiltersChange((f) => ({ ...f, maxDom: e.target.value }))} />
                </div>
              </>
            )}
          </div>

          {/* Footer — count + clear */}
          <div style={{
            borderTop:      `1px solid ${colors.cardBorder}`,
            padding:        "8px 12px",
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "center",
          }}>
            <span style={{ fontFamily: fonts.data, fontSize: 9, color: colors.textDim }}>
              {filterOpen === "comp"
                ? `${filteredComps.length} / ${(comps ?? []).length} comps`
                : `${filteredLand.length} / ${(land ?? []).length} listings`}
            </span>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() =>
                filterOpen === "comp"
                  ? setCompFilters(COMP_FILTER_DEFAULT)
                  : onLandFiltersChange(LAND_FILTER_DEFAULT)
              }
              style={{
                fontFamily:    fonts.label,
                fontSize:      9,
                fontWeight:    700,
                letterSpacing: "0.5px",
                color:         filterOpen === "land" ? colors.warn : colors.accent,
                background:    "transparent",
                border:        "none",
                cursor:        "pointer",
                padding:       "2px 0",
                textTransform: "uppercase",
              }}
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* ── Zoom controls — right side, vertically centred ── */}
      <div style={{
        position: "absolute", right: 12, top: "50%",
        transform: "translateY(-50%)",
        zIndex: 400, display: "flex", flexDirection: "column", gap: 4,
      }}>
        <button onClick={() => mapI.current?.zoomIn()}  style={zoomBtn} title="Zoom in">+</button>
        <button onClick={() => mapI.current?.zoomOut()} style={zoomBtn} title="Zoom out">−</button>
        <button
          onClick={() => mapI.current?.setView([32.7767, -96.797], 12)}
          style={{ ...zoomBtn, marginTop: 4, fontSize: 13 }}
          title="Reset view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke={colors.accent} strokeWidth="2" strokeLinecap="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11" />
          </svg>
        </button>
      </div>

      {/* ── Radius slider + toggle — bottom-right ── */}
      <div style={{
        position:       "absolute",
        bottom:         20,
        right:          12,
        zIndex:         400,
        background:     "rgba(26,34,51,0.88)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border:         `1px solid ${colors.cardBorder}`,
        borderRadius:   radii.md,
        padding:        "8px 12px",
        width:          168,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 6,
        }}>
          <span style={{
            fontSize: 9, color: colors.textDim, fontWeight: 700,
            letterSpacing: "0.8px", fontFamily: fonts.label, textTransform: "uppercase",
          }}>
            Radius
          </span>
          <button
            onClick={() => onRadiusEnabledChange(!radiusEnabled)}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          4,
              padding:      "2px 7px",
              borderRadius: radii.sm,
              border:       `1px solid ${radiusEnabled ? colors.accent : colors.cardBorder}`,
              background:   radiusEnabled ? `${colors.accent}18` : "transparent",
              color:        radiusEnabled ? colors.accent : colors.textDim,
              fontSize:     8,
              fontWeight:   700,
              fontFamily:   fonts.label,
              cursor:       "pointer",
              letterSpacing: "0.6px",
              textTransform: "uppercase",
              transition:   "all 0.15s ease",
            }}
          >
            {radiusEnabled ? "ON" : "OFF"}
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{
            fontSize: 10, color: radiusEnabled ? colors.accent : colors.textDim,
            fontWeight: 700, fontFamily: fonts.data,
            transition: "color 0.15s ease",
          }}>
            {radiusEnabled ? `${radius.toFixed(1)} mi` : "All comps"}
          </span>
        </div>

        <input
          type="range"
          min={0.1} max={2} step={0.1}
          value={radius}
          disabled={!radiusEnabled}
          onChange={(e) => onRadiusChange(parseFloat(e.target.value))}
          style={{
            width:       "100%",
            accentColor: radiusEnabled ? colors.accent : colors.cardBorder,
            cursor:      radiusEnabled ? "pointer" : "not-allowed",
            margin:      0,
            opacity:     radiusEnabled ? 1 : 0.4,
            transition:  "opacity 0.15s ease",
          }}
        />
      </div>

      {/* ── "No location" hint ── */}
      {!loc && (
        <div style={{
          position:       "absolute",
          bottom:         70,
          left:           "50%",
          transform:      "translateX(-50%)",
          zIndex:         400,
          background:     "rgba(26,34,51,0.92)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border:         `1px solid ${colors.cardBorder}`,
          borderRadius:   radii.lg,
          padding:        "8px 18px",
          display:        "flex",
          alignItems:     "center",
          gap:            8,
          pointerEvents:  "none",
          whiteSpace:     "nowrap",
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
               stroke={colors.accent} strokeWidth="2" strokeLinecap="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span style={{
            fontFamily: fonts.label, fontSize: 11,
            color: colors.textDim, fontWeight: 500,
          }}>
            Click the map or select a land listing to begin analysis
          </span>
        </div>
      )}
    </div>
  );
}
