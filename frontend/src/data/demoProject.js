/**
 * DEMO PROJECT CACHE — Red Bull Basement National Finals
 *
 * A hand-crafted 2,400 SF modern ranch showcasing the full Vision platform.
 * This project auto-loads so demo gallery visitors see a beautiful 3D house
 * immediately without needing to generate anything.
 *
 * Layout: open-concept ranch, 3 bed / 2.5 bath, 2-car garage
 * Footprint: 60' wide x 44' deep  (2,400 SF ground floor)
 */

// ── Room layout (2D coordinates in feet, origin top-left) ────────────────────
const rooms = [
  // Great room / open concept living (front-left)
  { type: "living",   label: "Great Room",        x: 0,   y: 0,   w: 22, h: 18 },
  // Kitchen + island (front-center)
  { type: "kitchen",  label: "Kitchen",           x: 22,  y: 0,   w: 16, h: 14 },
  // Dining (front-right of kitchen)
  { type: "dining",   label: "Dining Room",       x: 22,  y: 14,  w: 16, h: 10 },
  // Master suite (back-left)
  { type: "bedroom",  label: "Master Bedroom",    x: 0,   y: 18,  w: 16, h: 16 },
  // Master bath (back, adjacent to master)
  { type: "bathroom", label: "Master Bath",       x: 16,  y: 18,  w: 10, h: 10 },
  // Master closet
  { type: "closet",   label: "Walk-in Closet",    x: 16,  y: 28,  w: 10, h: 6  },
  // Hallway (center spine)
  { type: "hallway",  label: "Hallway",           x: 26,  y: 24,  w: 4,  h: 16 },
  // Bedroom 2 (back-right)
  { type: "bedroom",  label: "Bedroom 2",         x: 30,  y: 24,  w: 14, h: 10 },
  // Bedroom 3 (back-right)
  { type: "bedroom",  label: "Bedroom 3",         x: 30,  y: 34,  w: 14, h: 10 },
  // Guest bath (between bedrooms)
  { type: "bathroom", label: "Bathroom",          x: 44,  y: 24,  w: 8,  h: 10 },
  // Laundry
  { type: "laundry",  label: "Laundry",           x: 44,  y: 34,  w: 8,  h: 10 },
  // 2-car garage (far right)
  { type: "garage",   label: "2-Car Garage",      x: 52,  y: 0,   w: 20, h: 24 },
  // Entry / foyer
  { type: "entry",    label: "Entry",             x: 38,  y: 0,   w: 14, h: 8  },
  // Powder room (half bath near entry)
  { type: "bathroom", label: "Powder Room",       x: 38,  y: 8,   w: 8,  h: 6  },
];

// Compute bounding box
const fpWidth = Math.max(...rooms.map(r => r.x + r.w));   // 72
const fpDepth = Math.max(...rooms.map(r => r.y + r.h));   // 44

// ── Exterior windows (side = which exterior wall) ────────────────────────────
const windows = [
  // Front wall (bottom edge → side "bottom")
  { x: 8,  y: 0,  width: 6, height: 4, side: "bottom" },   // Great room left
  { x: 16, y: 0,  width: 4, height: 4, side: "bottom" },   // Great room right
  { x: 28, y: 0,  width: 5, height: 4, side: "bottom" },   // Kitchen
  // Back wall (top edge → side "top")
  { x: 12, y: fpDepth, width: 5, height: 4, side: "top" }, // Master (clear of patio door at 2-8)
  { x: 36, y: fpDepth, width: 5, height: 4, side: "top" }, // Bedroom 2
  { x: 48, y: fpDepth, width: 4, height: 4, side: "top" }, // Bedroom 3
  // Left wall
  { x: 0,  y: 8,  width: 5, height: 4, side: "left" },     // Great room
  { x: 0,  y: 26, width: 5, height: 4, side: "left" },     // Master
  // Right wall
  { x: fpWidth, y: 10, width: 5, height: 3, side: "right" }, // Garage
];

// ── Exterior doors (positioned to avoid window overlap) ──────────────────────
const doors = [
  { x: 40, y: 0, width: 3.5, side: "bottom", isExterior: true },   // Front door (entry room x=38, centered)
  { x: 60, y: 0, width: 9,   side: "bottom", isExterior: true },   // Garage door (garage x=52, centered)
  { x: 3,  y: fpDepth, width: 6, side: "top", isExterior: true },  // Back patio door
];

// ── Materials (7-layer system) ───────────────────────────────────────────────
const materials = [
  { layer: "foundation", material: "Post-Tension Slab",     cost_per_sf: 12.50, option_index: 0 },
  { layer: "framing",    material: "Wood SPF 2x6",          cost_per_sf: 8.75,  option_index: 0 },
  { layer: "sheathing",  material: "ZIP System R-Sheathing", cost_per_sf: 5.20,  option_index: 1 },
  { layer: "insulation", material: "Closed-Cell Spray Foam", cost_per_sf: 4.80,  option_index: 2 },
  { layer: "drywall",    material: "5/8\" Type X",           cost_per_sf: 2.90,  option_index: 0 },
  { layer: "cladding",   material: "Fiber Cement (HardiePlank)", cost_per_sf: 9.50,  option_index: 1 },
  { layer: "paint",      material: "Sherwin-Williams Duration", cost_per_sf: 1.80,  option_index: 0 },
];

// ── Building context for structural intelligence ─────────────────────────────
const buildingContext = {
  span_ft: 22,
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
