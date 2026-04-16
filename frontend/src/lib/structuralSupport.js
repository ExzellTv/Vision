/**
 * structuralSupport — pillar generator for cantilevered upper stories.
 *
 * When the 2nd floor footprint extends past the 1st floor, those overhangs
 * need visible structural support.  This module finds where the upper
 * story is unsupported and returns a list of pillar placements in plan
 * coords (feet).  buildHouseGeometry converts those to world units.
 *
 * Algorithm — AABB approximation (per-side overhang bands):
 *   1. Compute AABBs for both stories.
 *   2. For each side, check if the upper AABB extends past the lower AABB.
 *   3. Along the extended edge, place pillars at max ~11.5ft spacing
 *      (3.5m, standard residential structural span).
 *   4. Pillars are positioned just inside the upper-story edge so they
 *      read as supporting it, and sit on the ground plane (y = 0).
 *
 * This falls back to bounding boxes instead of polygon clipping because
 * `polygon-clipping` isn't in package.json.  If it gets installed later,
 * the per-side bands below should be replaced with a proper set-difference
 * of the upper polygon minus the lower polygon, edge-walked to place
 * pillars along the unsupported perimeter.
 */
import { THRESHOLDS } from "./structuralValidator";

const INSET_FT = 0.5;   // pillar sits 0.5 ft inboard of the upper-floor edge

function bbox(rooms) {
  if (!rooms || rooms.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  rooms.forEach((r) => {
    minX = Math.min(minX, r.x);
    maxX = Math.max(maxX, r.x + r.w);
    minY = Math.min(minY, r.y);
    maxY = Math.max(maxY, r.y + r.h);
  });
  return { minX, maxX, minY, maxY };
}

function geometryTypeForStyle(style) {
  switch (style) {
    case "Craftsman":     return "tapered";    // tapered cylinder
    case "Mediterranean": return "stucco";     // square with slight top flare
    case "Modern":
    case "Ranch":
    case "Colonial":
    default:              return "square";     // clean square post
  }
}

/**
 * Place pillars along a single span.  `axisFt` is the fixed coordinate
 * (the edge line), `fromFt`/`toFt` are the span bounds along the sweep
 * axis.  Returns {xFt, yFt} centers in plan coords.
 *
 * Endpoints are inset by ~PILLAR_BASE so corner pillars don't overlap
 * with the house wall meeting at the corner.
 */
function pillarsAlongEdge(axisFt, fromFt, toFt, isHorizontal) {
  const spacing = THRESHOLDS.PILLAR_SPACING_FT;
  const endInset = THRESHOLDS.PILLAR_BASE_FT * 0.75;
  const a = fromFt + endInset;
  const b = toFt   - endInset;
  const span = b - a;
  if (span <= 0) return [];
  const count = Math.max(1, Math.ceil(span / spacing)) + 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const pos = a + span * t;
    out.push(isHorizontal
      ? { xFt: pos,   yFt: axisFt }
      : { xFt: axisFt, yFt: pos });
  }
  return out;
}

/**
 * Generate pillar placements for the cantilevered edges of `upper` that
 * overhang `lower`.
 *
 * @param lower Story plan (ground floor)
 * @param upper Story plan (2nd floor) or null
 * @param style Selected house style (drives pillar geometry family)
 * @param wallHeightFt Height of the 1st floor walls, in feet
 * @returns PillarPlacement[]
 *   {
 *     xFt, yFt:       center position in plan coords
 *     heightFt:       pillar height in feet (= 1st floor wall height)
 *     baseSizeFt:     square base size, in feet
 *     geometry:       "square" | "tapered" | "stucco"
 *   }
 */
export function generatePillars(lower, upper, style, wallHeightFt = 9) {
  if (!lower || !upper) return [];
  const L = bbox(lower.rooms);
  const U = bbox(upper.rooms);
  if (!L || !U) return [];

  const geometry = geometryTypeForStyle(style);
  const baseSize = THRESHOLDS.PILLAR_BASE_FT;
  const placements = [];

  // Top edge — upper extends above (smaller Y) the lower
  if (U.minY < L.minY) {
    const axis = U.minY + INSET_FT;
    const span = pillarsAlongEdge(axis, Math.max(U.minX, L.minX - 0), Math.min(U.maxX, L.maxX), true);
    // Actually span should cover the overhanging x-range, which is
    // wherever upper extends past lower's footprint AT THE OVERHANG depth.
    // Simpler heuristic: run pillars along the full overhang edge.
    const overhangSpan = pillarsAlongEdge(axis, U.minX, U.maxX, true);
    overhangSpan.forEach((p) => placements.push(p));
  }

  // Bottom edge — upper extends below (larger Y) the lower
  if (U.maxY > L.maxY) {
    const axis = U.maxY - INSET_FT;
    pillarsAlongEdge(axis, U.minX, U.maxX, true).forEach((p) => placements.push(p));
  }

  // Left edge — upper extends left (smaller X)
  if (U.minX < L.minX) {
    const axis = U.minX + INSET_FT;
    pillarsAlongEdge(axis, U.minY, U.maxY, false).forEach((p) => placements.push(p));
  }

  // Right edge
  if (U.maxX > L.maxX) {
    const axis = U.maxX - INSET_FT;
    pillarsAlongEdge(axis, U.minY, U.maxY, false).forEach((p) => placements.push(p));
  }

  // De-duplicate (corner placements can land in two edge passes).
  const seen = new Set();
  const unique = placements.filter((p) => {
    const key = `${Math.round(p.xFt * 10)}_${Math.round(p.yFt * 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.map((p, i) => ({
    id: `pillar-${i}`,
    xFt: p.xFt,
    yFt: p.yFt,
    heightFt: wallHeightFt,
    baseSizeFt: baseSize,
    geometry,
  }));
}
