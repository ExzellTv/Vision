/**
 * Valuation Engine — Analysis Hub
 *
 * Pure computation module: geospatial math, 3-approach blended valuation
 * (Sales Comparison, Cost, Income), and number formatters.
 * No React dependencies. Mirrors the pattern of backend/app/services/market_model.py.
 */

// ── Valuation constants ───────────────────────────────────────────────────
const BUILD_COST_PSF  = 165;   // $/SF new construction
const RENT_PSF        = 1.15;  // $/SF/month rental estimate
const GRM             = 15;    // Gross Rent Multiplier
const ADJ_SIZE_PSF    = 125;   // $/SF size adjustment
const ADJ_AGE_PY      = 1200;  // $ per year age adjustment
const ADJ_BED         = 15000; // $ per bedroom difference
const ADJ_BATH        = 12000; // $ per bathroom difference
const ADJ_LOT_PSF     = 3.50;  // $/SF lot size adjustment
const W_SCA           = 0.50;  // SCA weight
const W_COST          = 0.30;  // Cost approach weight
const W_INCOME        = 0.20;  // Income approach weight
const SUBJECT_YEAR    = 2026;

// ── Geospatial helpers ────────────────────────────────────────────────────

/**
 * Haversine distance between two lat/lng points, in miles.
 */
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Point-in-polygon test (ray casting) to find which zoning district
 * contains the given coordinate. Returns the matching district or null.
 */
export function getZone(lat, lng, zoningDistricts) {
  for (const z of zoningDistricts) {
    let inside = false;
    const p = z.polygon;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [yi, xi] = p[i];
      const [yj, xj] = p[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    if (inside) return z;
  }
  return null;
}

/**
 * Filter and sort comparable sales within `radius` miles of `loc`.
 * Returns an empty array when loc is null.
 */
export function computeNearbyComps(loc, radius, comps) {
  if (!loc) return [];
  return comps
    .filter((c) => haversine(loc.lat, loc.lng, c.lat, c.lng) <= radius)
    .sort(
      (a, b) =>
        haversine(loc.lat, loc.lng, a.lat, a.lng) -
        haversine(loc.lat, loc.lng, b.lat, b.lng)
    );
}

// ── Full blended valuation (SCA + Cost + Income) ─────────────────────────

/**
 * Run the 3-approach blended valuation for a proposed development.
 *
 * @param {object|null} loc          - { lat, lng } of the selected site
 * @param {object|null} selLand      - selected vacant land parcel (or null)
 * @param {Array}       nearbyComps  - pre-filtered comparable sales
 * @param {number}      subjectSF    - subject property square footage
 * @param {number}      subjectBeds  - subject property bedroom count
 * @param {number}      subjectBaths - subject property bathroom count
 * @returns {object|null}            - valuation result, or null if insufficient data
 */
export function runValuation(loc, selLand, nearbyComps, subjectSF, subjectBeds, subjectBaths) {
  if (!loc || !nearbyComps.length) return null;

  const lotSf     = selLand?.lot_sf || 6500;
  const landPrice = selLand?.price  || 0;

  // 1. Sales Comparison Approach — inverse-distance weighted adjusted comps
  const compResults = nearbyComps.slice(0, 7).map((c) => {
    const dist     = haversine(loc.lat, loc.lng, c.lat, c.lng);
    const adjSize  = (subjectSF    - c.sf)        * ADJ_SIZE_PSF;
    const adjAge   = (SUBJECT_YEAR - c.year_built) * ADJ_AGE_PY;
    const adjBed   = (subjectBeds  - c.bedrooms)   * ADJ_BED;
    const adjBath  = (subjectBaths - c.bathrooms)  * ADJ_BATH;
    const adjLot   = (lotSf        - c.lot_sf)     * ADJ_LOT_PSF;
    const totalAdj = adjSize + adjAge + adjBed + adjBath + adjLot;
    const adjusted = c.sale_price + totalAdj;
    const weight   = 1 / Math.max(dist, 0.01);
    return { ...c, dist, adjSize, adjAge, adjBed, adjBath, adjLot, totalAdj, adjusted, weight };
  });

  const totalWeight = compResults.reduce((s, r) => s + r.weight, 0);
  const scaValue    = compResults.reduce((s, r) => s + r.adjusted * r.weight, 0) / totalWeight;

  // 2. Cost Approach — land + new construction, no depreciation
  const buildCost = subjectSF * BUILD_COST_PSF;
  const costValue = landPrice + buildCost;

  // 3. Income Approach — GRM method
  const monthlyRent = subjectSF * RENT_PSF;
  const annualRent  = monthlyRent * 12;
  const incomeValue = annualRent * GRM;

  // 4. Blended ARV
  const blended = W_SCA * scaValue + W_COST * costValue + W_INCOME * incomeValue;

  // 5. Investment metrics
  const totalInvestment = landPrice + buildCost;
  const grossProfit     = blended - totalInvestment;
  const margin          = totalInvestment > 0 ? (grossProfit / blended) * 100 : 0;
  const roi             = totalInvestment > 0 ? (grossProfit / totalInvestment) * 100 : 0;

  // 6. Feasibility score (0–100)
  const adjValues = compResults.map((r) => r.adjusted);
  const adjMean   = adjValues.reduce((a, b) => a + b, 0) / adjValues.length;
  const cv =
    Math.sqrt(adjValues.reduce((s, v) => s + (v - adjMean) ** 2, 0) / adjValues.length) /
    adjMean;
  const norm        = (val, lo, hi) => Math.max(0, Math.min(1, (val - lo) / (hi - lo)));
  const infraScore  = landPrice > 0 ? 60 : 50;
  const feasScore   = Math.min(
    Math.round(
      (0.30 * norm(margin, 0, 35) +
       0.25 * norm(compResults.length, 0, 15) +
       0.25 * (1 - cv) +
       0.20 * norm(infraScore, 0, 100)) * 100
    ),
    100
  );

  return {
    compResults,
    scaValue,
    buildCost,
    costValue,
    monthlyRent,
    annualRent,
    incomeValue,
    blended,
    totalInvestment,
    grossProfit,
    margin,
    roi,
    feasScore,
    landPrice,
    lotSf,
  };
}

// ── Number formatters ─────────────────────────────────────────────────────

export const fmt    = (n) => n?.toLocaleString("en-US") ?? "–";
export const fmtUSD = (n) => "$" + fmt(Math.round(n));
export const fmtK   = (n) =>
  n >= 1_000_000 ? "$" + (n / 1_000_000).toFixed(2) + "M" : "$" + (n / 1_000).toFixed(0) + "K";
export const fmtS   = (n) => (n >= 0 ? "+" : "") + "$" + fmt(Math.abs(Math.round(n)));
export const pct    = (n) => n.toFixed(1) + "%";
