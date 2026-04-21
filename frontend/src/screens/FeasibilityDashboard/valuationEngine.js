/**
 * Valuation Engine — Analysis Hub
 *
 * Pure computation module: geospatial math, 3-approach blended valuation
 * (Sales Comparison, Cost, Income), and number formatters.
 * No React dependencies. Mirrors the pattern of backend/app/services/market_model.py.
 */

// ── Valuation constants ───────────────────────────────────────────────────
export const BUILD_COST_PSF  = 185;   // $/SF new construction (Dallas mid-range, 2026)
const GRM             = 15;    // Gross Rent Multiplier (used for income approach baseline)
const ADJ_SIZE_PSF    = 35;    // $/SF size adjustment (realistic paired-sales estimate)
const ADJ_AGE_PY      = 800;   // $ per year age adjustment
const ADJ_AGE_MAX_YRS = 20;    // cap age contribution at 20 years
const ADJ_BED         = 15000; // $ per bedroom difference
const ADJ_BATH        = 12000; // $ per bathroom difference
const ADJ_LOT_PSF     = 3.50;  // $/SF lot size adjustment
const W_SCA           = 0.50;  // SCA weight (at full comp confidence)
const W_COST          = 0.30;  // Cost approach weight (at full comp confidence)
const W_INCOME        = 0.20;  // Income approach weight (at full comp confidence)
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
 * When `radiusEnabled` is false, returns ALL comps sorted by distance.
 * Returns an empty array when loc is null.
 */
export function computeNearbyComps(loc, radius, comps, radiusEnabled = true) {
  if (!loc) return [];
  const withDist = comps
    .filter((c) => c.lat != null && c.lng != null && c.sf > 0)
    .map((c) => ({ ...c, _dist: haversine(loc.lat, loc.lng, c.lat, c.lng) }))
    .sort((a, b) => a._dist - b._dist);

  if (!radiusEnabled) return withDist;
  return withDist.filter((c) => c._dist <= radius);
}

// ── Outlier rejection — removes distressed/non-arm's-length sales ────────
function rejectOutliers(comps) {
  if (comps.length < 3) return comps;
  const prices = [...comps].map((c) => c.sale_price).sort((a, b) => a - b);
  const mid    = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return comps.filter((c) => c.sale_price >= median * 0.40 && c.sale_price <= median * 2.20);
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
  const cleanedComps = rejectOutliers(nearbyComps.slice(0, 10));
  const compResults  = cleanedComps.slice(0, 7).map((c) => {
    const dist     = haversine(loc.lat, loc.lng, c.lat, c.lng);
    const cSf      = c.sf || subjectSF;
    const cYear    = c.year_built || SUBJECT_YEAR;
    const cBeds    = c.bedrooms ?? subjectBeds;
    const cBaths   = c.bathrooms ?? subjectBaths;
    const cLotSf   = c.lot_sf || lotSf;
    const adjSize  = (subjectSF    - cSf)    * ADJ_SIZE_PSF;
    const yrDiff   = Math.min(SUBJECT_YEAR - cYear, ADJ_AGE_MAX_YRS);
    const adjAge   = yrDiff * ADJ_AGE_PY;
    const adjBed   = (subjectBeds  - cBeds)  * ADJ_BED;
    const adjBath  = (subjectBaths - cBaths) * ADJ_BATH;
    const adjLot   = (lotSf        - cLotSf) * ADJ_LOT_PSF;
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

  // 3. Income Approach — rent derived from local comp price-per-SF (rent-to-value rule)
  const sortedPricePSF = compResults.length
    ? compResults.map((r) => r.adjusted / subjectSF).sort((a, b) => a - b)
    : [BUILD_COST_PSF * 1.15];
  const medianPricePSF  = sortedPricePSF[Math.floor(sortedPricePSF.length / 2)];
  const dynamicRentPSF  = Math.max(0.80, Math.min(1.60, medianPricePSF * 0.006));
  const monthlyRent     = subjectSF * dynamicRentPSF;
  const annualRent      = monthlyRent * 12;
  const incomeValue     = annualRent * GRM;

  // 4. Blended ARV — shift toward cost approach when few comps (more stable)
  const compConfidence = Math.min(compResults.length / 5, 1); // 0 comps→0, 5+→1
  const wSca    = 0.30 + 0.20 * compConfidence;  // 0.30 → 0.50
  const wCost   = 0.45 - 0.15 * compConfidence;  // 0.45 → 0.30
  const wIncome = 0.25 - 0.05 * compConfidence;  // 0.25 → 0.20
  const blended = wSca * scaValue + wCost * costValue + wIncome * incomeValue;

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
  const norm = (val, lo, hi) => Math.max(0, Math.min(1, (val - lo) / (hi - lo)));

  // Infrastructure score — multi-factor: land price, lot size, market freshness, topography, utilities
  let infraScore = 50;
  if (landPrice > 0) {
    infraScore += 10;                                                               // defined acquisition price
    if (lotSf >= 5000) infraScore += 10;                                           // adequate lot size
    if (selLand?.days_on_market != null && selLand.days_on_market < 30) infraScore += 10; // fresh listing
    if (selLand?.topography === "Level") infraScore += 10;                         // flat topography
    if (selLand?.utilities && selLand.utilities !== "Unknown") infraScore += 10;   // known utilities
  }
  infraScore = Math.min(infraScore, 100);

  const feasScore = Math.min(
    Math.round(
      (0.30 * norm(margin, 0, 35) +
       0.25 * norm(compResults.length, 0, 15) +
       0.25 * (1 - cv) +
       0.20 * norm(infraScore, 0, 100)) * 100
    ),
    100
  );

  // Sub-score levels derived from real comp data — used for UI display bars
  const profitabilityLevel  = margin > 20 ? "High" : margin > 8 ? "Med" : "Low";
  const marketStrengthLevel =
    compResults.length >= 8 && cv < 0.10 ? "High" :
    compResults.length >= 3 && cv < 0.20 ? "Med"  : "Low";
  // Risk is inverse: low CV + healthy margin → low risk (good)
  const riskLevel           = cv < 0.08 && margin > 15 ? "Low" : cv < 0.15 || margin > 5 ? "Med" : "High";
  const infrastructureLevel = infraScore >= 70 ? "High" : infraScore >= 55 ? "Med" : "Low";

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
    cv,
    infraScore,
    profitabilityLevel,
    marketStrengthLevel,
    riskLevel,
    infrastructureLevel,
  };
}

// ── Number formatters ─────────────────────────────────────────────────────

export const fmt    = (n) => n?.toLocaleString("en-US") ?? "–";
export const fmtUSD = (n) => "$" + fmt(Math.round(n));
export const fmtK   = (n) =>
  n >= 1_000_000 ? "$" + (n / 1_000_000).toFixed(2) + "M" : "$" + (n / 1_000).toFixed(0) + "K";
export const fmtS   = (n) => (n >= 0 ? "+" : "") + "$" + fmt(Math.abs(Math.round(n)));
export const pct    = (n) => n.toFixed(1) + "%";
