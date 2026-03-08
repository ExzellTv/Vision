/**
 * Static Dallas zoning district polygons for the Analysis Hub map.
 * Comparable sales and land listings are fetched live from MongoDB —
 * no hardcoded fixture data needed for those.
 */

// ── Dallas zoning districts with polygon boundaries ───────────────────────
// Polygons are [lat, lng] pairs defining each zone boundary.
export const ZONING_DISTRICTS = [
  {
    id: "R-7.5", name: "R-7.5(A) Single Family",
    color: "#2ed573", fillOpacity: 0.10,
    max_height_ft: 36, far: 0.45, lot_coverage_pct: 45,
    front_setback: 25, side_setback: 5, rear_setback: 5,
    description: "Standard single-family. Min 7,500 SF lots.",
    polygon: [[32.800, -96.815], [32.800, -96.780], [32.818, -96.780], [32.818, -96.815], [32.800, -96.815]],
  },
  {
    id: "R-10", name: "R-10(A) Large Lot",
    color: "#3b82f6", fillOpacity: 0.10,
    max_height_ft: 36, far: 0.40, lot_coverage_pct: 40,
    front_setback: 30, side_setback: 8, rear_setback: 8,
    description: "Large-lot single-family. Min 10,000 SF.",
    polygon: [[32.835, -96.810], [32.835, -96.775], [32.855, -96.775], [32.855, -96.810], [32.835, -96.810]],
  },
  {
    id: "MF-2", name: "MF-2(A) Multifamily",
    color: "#ff9f43", fillOpacity: 0.10,
    max_height_ft: 36, far: 0.75, lot_coverage_pct: 60,
    front_setback: 15, side_setback: 10, rear_setback: 15,
    description: "Medium-density multifamily.",
    polygon: [[32.818, -96.800], [32.818, -96.770], [32.835, -96.770], [32.835, -96.800], [32.818, -96.800]],
  },
  {
    id: "PD", name: "PD Planned Dev",
    color: "#a855f7", fillOpacity: 0.10,
    max_height_ft: 54, far: 0.80, lot_coverage_pct: 55,
    front_setback: 20, side_setback: 5, rear_setback: 10,
    description: "Planned development district.",
    polygon: [[32.818, -96.770], [32.818, -96.740], [32.840, -96.740], [32.840, -96.770], [32.818, -96.770]],
  },
  {
    id: "TH-3", name: "TH-3(A) Townhouse",
    color: "#00d4ff", fillOpacity: 0.10,
    max_height_ft: 36, far: 0.60, lot_coverage_pct: 55,
    front_setback: 15, side_setback: 0, rear_setback: 5,
    description: "Townhouse district. Zero lot line.",
    polygon: [[32.800, -96.780], [32.800, -96.755], [32.818, -96.755], [32.818, -96.780], [32.800, -96.780]],
  },
  {
    id: "D-1", name: "D(A) Duplex",
    color: "#ff4757", fillOpacity: 0.10,
    max_height_ft: 36, far: 0.50, lot_coverage_pct: 45,
    front_setback: 25, side_setback: 5, rear_setback: 5,
    description: "Duplex residential.",
    polygon: [[32.840, -96.800], [32.840, -96.775], [32.855, -96.775], [32.855, -96.800], [32.840, -96.800]],
  },
];
