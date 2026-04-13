/**
 * DEMO PROJECT CACHE — Red Bull Basement National Finals
 *
 * Hand-crafted 2,400 SF modern ranch for the demo gallery.
 * Layout: 60' x 40' bounding box, zero gaps, zero overlaps.
 * 3 bed / 2.5 bath + office, 2-car garage, open-concept living.
 *
 * Grid verification:
 *   Bounding box: 60 x 40 = 2,400 sqft
 *   Total room area: 2,400 sqft (100% coverage)
 *   Overlaps: 0
 *   Gaps: 0
 */

// ── Room layout (feet, origin top-left) ──────────────────────────────────────
const rooms = [
  // ── Front row (y=0 → y=20) ──
  { type: "living",   label: "Great Room",        x: 0,   y: 0,  w: 20, h: 20 },  // 400 SF
  { type: "kitchen",  label: "Kitchen",           x: 20,  y: 0,  w: 14, h: 12 },  // 168 SF
  { type: "dining",   label: "Dining Room",       x: 20,  y: 12, w: 14, h: 8  },  // 112 SF
  { type: "entry",    label: "Entry",             x: 34,  y: 0,  w: 6,  h: 12 },  //  72 SF
  { type: "bathroom", label: "Powder Room",       x: 34,  y: 12, w: 6,  h: 8  },  //  48 SF
  { type: "garage",   label: "2-Car Garage",      x: 40,  y: 0,  w: 20, h: 20 },  // 400 SF

  // ── Back row (y=20 → y=40) ──
  { type: "bedroom",  label: "Master Bedroom",    x: 0,   y: 20, w: 16, h: 14 },  // 224 SF
  { type: "closet",   label: "Walk-in Closet",    x: 0,   y: 34, w: 10, h: 6  },  //  60 SF
  { type: "bathroom", label: "Master Bath",       x: 10,  y: 34, w: 6,  h: 6  },  //  36 SF
  { type: "hallway",  label: "Hallway",           x: 16,  y: 20, w: 4,  h: 20 },  //  80 SF
  { type: "bedroom",  label: "Bedroom 2",         x: 20,  y: 20, w: 14, h: 10 },  // 140 SF
  { type: "bedroom",  label: "Bedroom 3",         x: 20,  y: 30, w: 14, h: 10 },  // 140 SF
  { type: "bathroom", label: "Bathroom",          x: 34,  y: 20, w: 12, h: 10 },  // 120 SF
  { type: "laundry",  label: "Laundry",           x: 34,  y: 30, w: 12, h: 10 },  // 120 SF
  { type: "office",   label: "Home Office",       x: 46,  y: 20, w: 14, h: 20 },  // 280 SF
];

const fpWidth = 60;
const fpDepth = 40;

// ── Exterior windows (no overlaps with doors, verified) ──────────────────────
// Schema convention: y=0 is top (north), y=fpDepth is bottom (south).
// side "top"    → wall at y=0          side "bottom" → wall at y=fpDepth
// side "left"   → wall at x=0          side "right"  → wall at x=fpWidth
const windows = [
  // Front wall (y=0, side="top") — entry + garage door are on this wall
  { x: 8,  y: 0,       width: 5, height: 4, side: "top" },      // Great Room left
  { x: 16, y: 0,       width: 4, height: 4, side: "top" },      // Great Room right
  { x: 25, y: 0,       width: 4, height: 4, side: "top" },      // Kitchen
  // Back wall (y=fpDepth, side="bottom") — patio door is on this wall
  { x: 10, y: fpDepth, width: 5, height: 4, side: "bottom" },   // Master Bedroom
  { x: 24, y: fpDepth, width: 5, height: 4, side: "bottom" },   // Bedroom 2
  { x: 32, y: fpDepth, width: 4, height: 4, side: "bottom" },   // Bedroom 3
  { x: 52, y: fpDepth, width: 5, height: 4, side: "bottom" },   // Office
  // Left wall
  { x: 0,  y: 8,       width: 5, height: 4, side: "left" },     // Great Room
  { x: 0,  y: 26,      width: 5, height: 4, side: "left" },     // Master
  // Right wall
  { x: fpWidth, y: 8,  width: 5, height: 3, side: "right" },    // Garage
  { x: fpWidth, y: 28, width: 5, height: 4, side: "right" },    // Office
];

// ── Exterior doors (no overlaps with windows, verified) ──────────────────────
const doors = [
  { x: 36, y: 0,       width: 3.5, side: "top",    isExterior: true },  // Front door (entry at 34-40)
  { x: 48, y: 0,       width: 9,   side: "top",    isExterior: true },  // Garage door (garage at 40-60)
  { x: 3,  y: fpDepth, width: 6,   side: "bottom", isExterior: true },  // Back patio slider
];

// ── Materials (7-layer system) ───────────────────────────────────────────────
const materials = [
  { layer: "foundation", material: "Post-Tension Slab",          cost_per_sf: 12.50, option_index: 0 },
  { layer: "framing",    material: "Wood SPF 2x6",               cost_per_sf: 8.75,  option_index: 0 },
  { layer: "sheathing",  material: "ZIP System R-Sheathing",     cost_per_sf: 5.20,  option_index: 1 },
  { layer: "insulation", material: "Closed-Cell Spray Foam",     cost_per_sf: 4.80,  option_index: 2 },
  { layer: "drywall",    material: "5/8\" Type X",                cost_per_sf: 2.90,  option_index: 0 },
  { layer: "cladding",   material: "Fiber Cement (HardiePlank)", cost_per_sf: 9.50,  option_index: 1 },
  { layer: "paint",      material: "Sherwin-Williams Duration",  cost_per_sf: 1.80,  option_index: 0 },
];

// ── Building context for structural intelligence ─────────────────────────────
const buildingContext = {
  span_ft: 20,
  stories: 1,
  total_sf: 2400,
  foundation_type: "slab_on_grade",
  framing_material: "Wood SPF",
  section: "W16x31",
  Ix_in4: 375,
  Sx_in3: 47.2,
  Zx_in3: 54.0,
  Fy_ksi: 50,
  dead_load_psf: 25,
  live_load_psf: 40,
  snow_load_psf: 5,
  max_moment_kip_ft: 26.8,
  max_shear_kips: 14.6,
  max_deflection_in: 0.52,
  footing_area_ft2: 4.0,
  total_reaction_lbs: 10200,
  story_drift_ratio: 0.008,
  sci_score: 4.8,
};

// ── Generate params (what the user "asked for") ──────────────────────────────
const generateParams = {
  targetSF: 2400,
  bedrooms: 3,
  bathrooms: 2.5,
  stories: 1,
  lotWidth: 80,
  lotDepth: 120,
  style: "Modern Ranch",
  garage: "2-car",
  openFloorPlan: true,
};

// ── Floor plan (normalized format matching useProjectStore) ───────────────────
const floorPlan = {
  id: "demo-showcase-v1",
  width: fpWidth,
  depth: fpDepth,
  rooms,
  doors,
  windows,
  walls: [],
  totalSF: 2400,
  score: 0.94,
  stories: 1,
  style: "Modern Ranch",
  score_breakdown: {
    space_efficiency: 0.96,
    adjacency_satisfaction: 0.92,
    proportion_score: 0.95,
  },
  perimeter: 2 * (fpWidth + fpDepth),
};

// ── Assembled demo project ───────────────────────────────────────────────────
export const DEMO_PROJECT = {
  projectName: "Lakewood Modern Ranch",
  floorPlan,
  storyPlans: [floorPlan],
  generateParams,
  materials,
  buildingContext,
};
