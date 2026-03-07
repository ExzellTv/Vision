/**
 * LeafletMap — live map component for the Analysis Hub.
 *
 * Renders inside the 60% left panel of FeasibilityDashboard. All Leaflet
 * lifecycle is delegated to useLeafletMap. This component owns only:
 *  - layer visibility state (showComps, showZoning, showLand)
 *  - tile type state (activeLayer)
 *  - the map container ref passed to the hook
 *  - the zoom + layer toggle UI rendered as React elements
 *
 * Props flowing up to FeasibilityDashboard:
 *  - onLocChange  → sets loc (analysis pin)
 *  - onLandSelect → sets selLand (selected parcel)
 *  - onRadiusChange → sets radius for comp search
 */

import { useState, useRef } from "react";
import { colors, fonts, radii } from "../../theme/tokens";
import { useLeafletMap } from "./useLeafletMap";

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

// ── Component ─────────────────────────────────────────────────────────────
export default function LeafletMap({
  loc,
  onLocChange,
  onLandSelect,
  radius,
  onRadiusChange,
  nearbyComps,
}) {
  const mapRef = useRef(null);

  // Map-internal state — does not need to live in FeasibilityDashboard
  const [showComps,   setShowComps]   = useState(true);
  const [showZoning,  setShowZoning]  = useState(true);
  const [showLand,    setShowLand]    = useState(true);
  const [activeLayer, setActiveLayer] = useState("dark");

  const { mapI } = useLeafletMap({
    mapRef,
    loc,
    onLocChange,
    onLandSelect,
    nearbyComps,
    radius,
    showComps,
    showZoning,
    showLand,
    activeLayer,
  });

  return (
    <div style={{ position: "absolute", inset: 0 }}>

      {/* ── Leaflet popup + tooltip overrides (dark theme) ── */}
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
        .vmap-zone-tip { background: transparent !important; border: none !important;
                         box-shadow: none !important; font-weight: 700; font-size: 10px; }
        .vmap-zone-tip::before { display: none; }
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
      `}</style>

      {/* ── Map canvas (Leaflet mounts here) ── */}
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

      {/* ── Tile-type toggles — top-left, below FeasibilityDashboard's overlays ── */}
      <div style={{
        position: "absolute", top: 96, left: 12, zIndex: 400,
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        {[
          ["dark",     "DARK"],
          ["satellite","SAT"],
          ["standard", "OSM"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveLayer(key)}
            style={overlayPill(activeLayer === key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Data-layer toggles — below tile toggles ── */}
      <div style={{
        position: "absolute", top: 210, left: 12, zIndex: 400,
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        {[
          ["COMPS",  showComps,  setShowComps,  colors.success],
          ["ZONES",  showZoning, setShowZoning, colors.secondary],
          ["LAND",   showLand,   setShowLand,   "#8b5cf6"],
        ].map(([label, active, set, accentCol]) => (
          <button
            key={label}
            onClick={() => set((v) => !v)}
            style={overlayPill(active, accentCol)}
          >
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: active ? accentCol : colors.cardBorder,
              flexShrink: 0,
            }} />
            {label}
          </button>
        ))}
      </div>

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

      {/* ── Radius slider — bottom-right ── */}
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
        width:          148,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{
            fontSize: 9, color: colors.textDim, fontWeight: 700,
            letterSpacing: "0.8px", fontFamily: fonts.label, textTransform: "uppercase",
          }}>
            Radius
          </span>
          <span style={{
            fontSize: 10, color: colors.accent, fontWeight: 700,
            fontFamily: fonts.data,
          }}>
            {radius.toFixed(1)} mi
          </span>
        </div>
        <input
          type="range"
          min={0.1} max={2} step={0.1}
          value={radius}
          onChange={(e) => onRadiusChange(parseFloat(e.target.value))}
          style={{ width: "100%", accentColor: colors.accent, cursor: "pointer", margin: 0 }}
        />
      </div>

      {/* ── "No location" instruction hint ── */}
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
