/**
 * useLeafletMap — Leaflet lifecycle hook for the Analysis Hub.
 *
 * Manages all imperative Leaflet operations (map init, tile layer switching,
 * marker layers, polygon overlays, property marker, radius circle) in a single
 * custom hook. Pattern mirrors useStructuralViewport in StructuralIntelligence.jsx.
 *
 * Returns { mapI } — the Leaflet map instance ref, so the component can call
 * mapI.current.zoomIn() etc. without owning the lifecycle.
 */

import { useRef, useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { colors } from "../../theme/tokens";
import { haversine } from "./valuationEngine";

// ── Tile providers ────────────────────────────────────────────────────────
const TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors, © <a href="https://carto.com/" target="_blank">CARTO</a>';

const TILES = {
  dark:      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  standard:  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
};

// ── Marker color helpers ──────────────────────────────────────────────────
function compColor(psf) {
  if (psf < 207) return colors.success;
  if (psf < 212) return colors.warn;
  return colors.danger;
}

function landStatusColor(status) {
  if (status === "New")           return colors.accent;
  if (status === "Price Reduced") return colors.warn;
  return "#8b5cf6";
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useLeafletMap({
  mapRef,
  loc,
  onLocChange,
  onLandSelect,
  nearbyComps,
  comps,
  land,
  radius,
  radiusEnabled,
  showComps,
  showLand,
  activeLayer,
}) {
  // Use live data from props — empty array when data hasn't loaded yet
  const allComps = comps ?? [];
  const allLand  = land  ?? [];

  // Leaflet instance refs — never stored in state to avoid re-renders
  const mapI     = useRef(null);
  const tileL    = useRef(null);
  const markersL = useRef(null);
  const landL    = useRef(null);
  const propM    = useRef(null);
  const radC     = useRef(null);

  // Stable callback refs — always up-to-date without being in effect deps
  const onLocChangeRef  = useRef(onLocChange);
  const onLandSelectRef = useRef(onLandSelect);
  onLocChangeRef.current  = onLocChange;
  onLandSelectRef.current = onLandSelect;

  // ── Effect 1: Map initialisation (runs once) ──────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapI.current) return;

    const map = L.map(mapRef.current, {
      center:           [32.7767, -96.797],
      zoom:             12,
      zoomControl:      false,
      attributionControl: true,
    });

    tileL.current = L.tileLayer(TILES.dark, {
      maxZoom:     19,
      attribution: TILE_ATTRIBUTION,
    }).addTo(map);

    markersL.current = L.layerGroup().addTo(map);
    landL.current    = L.layerGroup().addTo(map);

    // Map click → set analysis location, deselect any land parcel
    map.on("click", (e) => {
      onLocChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
      onLandSelectRef.current(null);
    });

    mapI.current = map;

    // Ensure tile grid fills the container after DOM stabilises
    setTimeout(() => map.invalidateSize(), 120);

    return () => {
      map.remove();
      mapI.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 2: Tile layer switch ────────────────────────────────────────
  useEffect(() => {
    if (!mapI.current || !tileL.current) return;
    mapI.current.removeLayer(tileL.current);
    tileL.current = L.tileLayer(TILES[activeLayer] || TILES.dark, {
      maxZoom:     19,
      attribution: TILE_ATTRIBUTION,
    }).addTo(mapI.current);
  }, [activeLayer]);

  // ── Effect 3: Property marker + radius circle ─────────────────────────
  useEffect(() => {
    if (!mapI.current) return;

    if (propM.current) { mapI.current.removeLayer(propM.current); propM.current = null; }
    if (radC.current)  { mapI.current.removeLayer(radC.current);  radC.current  = null; }
    if (!loc) return;

    propM.current = L.marker([loc.lat, loc.lng], {
      icon: L.divIcon({
        className: "",
        iconSize:   [28, 28],
        iconAnchor: [14, 14],
        html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;position:relative">
          <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${colors.accent};background:${colors.accentDim};animation:vMapPulse 2s ease-out infinite"></div>
          <div style="width:10px;height:10px;background:${colors.accent};border:2px solid #0d1117;border-radius:50%;z-index:2"></div>
        </div>`,
      }),
    }).addTo(mapI.current);

    // Only draw the radius circle when radius is enabled
    if (radiusEnabled) {
      radC.current = L.circle([loc.lat, loc.lng], {
        radius:      radius * 1609.34,
        color:       colors.accent,
        fillColor:   colors.accent,
        fillOpacity: 0.05,
        weight:      1.5,
        dashArray:   "6 4",
      }).addTo(mapI.current);
    }
  }, [loc, radius, radiusEnabled]);

  // ── Effect 4: Comparable sale markers ────────────────────────────────
  useEffect(() => {
    if (!markersL.current) return;
    markersL.current.clearLayers();
    if (!showComps) return;

    // When a location is pinned, nearbyComps is already filtered by the
    // valuation engine (respects radiusEnabled). When no location is
    // pinned, show all comps.
    const compsToRender = loc ? nearbyComps : allComps;

    compsToRender.forEach((c) => {
      if (c.lat == null || c.lng == null) return;
      const col = compColor(c.price_per_sf);
      const m   = L.marker([c.lat, c.lng], {
        icon: L.divIcon({
          className: "",
          iconSize:   [22, 22],
          iconAnchor: [11, 11],
          html: `<div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center">
            <div style="width:10px;height:10px;background:${col};border:2px solid #1a2233;border-radius:50%"></div>
          </div>`,
        }),
      });
      m.bindPopup(
        `<div class="vmap-popup-body">
          <div class="vmap-popup-price">$${c.sale_price.toLocaleString()}</div>
          ${c.address ? `<div class="vmap-popup-address">${c.address}</div>` : ""}
          <div class="vmap-popup-grid">
            <span>$/SF</span><b>$${c.price_per_sf.toFixed(0)}</b>
            <span>Size</span><b>${c.sf.toLocaleString()} SF</b>
            <span>Bd/Ba</span><b>${c.bedrooms}/${c.bathrooms}</b>
            <span>Year</span><b>${c.year_built}</b>
          </div>
          ${c.url
            ? `<a href="${c.url}" target="_blank" rel="noopener noreferrer"
                  style="display:inline-block;margin-top:6px;font-size:10px;color:${colors.accent};text-decoration:none;font-weight:600;">
                  View on Redfin ↗
               </a>`
            : ""}
        </div>`,
        { className: "vmap-popup" }
      );
      m.addTo(markersL.current);
    });
  }, [nearbyComps, allComps, showComps, loc]);

  // ── Effect 5: Land parcel markers ────────────────────────────────────
  useEffect(() => {
    if (!landL.current) return;
    landL.current.clearLayers();
    if (!showLand) return;

    allLand.forEach((lot) => {
      const sc = landStatusColor(lot.status);
      const m  = L.marker([lot.lat, lot.lng], {
        icon: L.divIcon({
          className: "",
          iconSize:   [26, 26],
          iconAnchor: [13, 13],
          html: `<div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center">
            <div style="width:14px;height:14px;background:${sc}22;border:2.5px solid ${sc};border-radius:3px;transform:rotate(45deg)"></div>
          </div>`,
        }),
      });

      const psfLand = lot.lot_sf > 0 ? "$" + (lot.price / lot.lot_sf).toFixed(2) : "N/A";
      const urlLink = lot.url
        ? `<a href="${lot.url}" target="_blank" rel="noopener noreferrer"
              style="display:inline-block;margin-top:6px;font-size:10px;color:${colors.accent};text-decoration:none;font-weight:600;">
              View on Redfin ↗
           </a>`
        : "";
      m.bindPopup(
        `<div class="vmap-popup-body">
          <div class="vmap-popup-price">$${lot.price.toLocaleString()}</div>
          <div class="vmap-popup-address">${lot.address}</div>
          <div class="vmap-popup-grid">
            <span>Lot</span><b>${lot.lot_sf > 0 ? lot.lot_sf.toLocaleString() + " SF" : "N/A"}</b>
            <span>Zone</span><b>${lot.zoning}</b>
            <span>$/SF</span><b>${psfLand}</b>
            <span>Status</span><b>${lot.status}</b>
          </div>
          ${urlLink}
        </div>`,
        { className: "vmap-popup" }
      );

      // Clicking a land marker selects it and pins the analysis location
      m.on("click", () => {
        onLandSelectRef.current(lot);
        onLocChangeRef.current({ lat: lot.lat, lng: lot.lng });
        mapI.current?.setView([lot.lat, lot.lng], 15);
      });

      m.addTo(landL.current);
    });
  }, [showLand, allLand]); // eslint-disable-line react-hooks/exhaustive-deps

  return { mapI };
}
