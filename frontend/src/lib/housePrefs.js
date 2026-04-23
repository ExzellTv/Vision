/**
 * Shared 3D-house color/material resolution.
 *
 * A single source of truth for wall/roof colors so every screen that renders
 * <House3D> (FloorPlanEditor preview, House3DPreview, ScheduleTimeline,
 * ClientProject) shows identical colors.
 *
 * Resolution order, highest priority first:
 *   1. localStorage prefs written by House3DPreview's color pickers
 *   2. Explicit per-project material color fields (MongoDB)
 *   3. Material-preset color keyed by material name
 *   4. Hard-coded fallbacks
 */

const PREFS_KEY = "vision:3d-prefs:v1";

// Mirrors MATERIAL_PRESETS in components/3d/House3D.jsx — kept in sync manually.
// These are the canonical default colors for each material option on /preview3d.
const WALL_PRESETS = {
  vinyl:  "#e8e2da",
  brick:  "#8b4513",
  stone:  "#8a9bb0",
  stucco: "#f5f0e8",
  wood:   "#8b6f47",
};
const ROOF_PRESETS = {
  asphaltShingle: "#3a3a3a",
  metalRoof:      "#5a6570",
  tile:           "#8b4513",
  slate:          "#4a5568",
};

// MongoDB "material" strings → preset key (LayerEditor writes human-readable
// names like "Vinyl", "Brick", etc.; House3D expects the preset keys).
const WALL_NAME_TO_KEY = {
  "Vinyl": "vinyl", "Brick": "brick", "Stone": "stone",
  "Stucco": "stucco", "Wood": "wood",
};
const ROOF_NAME_TO_KEY = {
  "Metal": "metalRoof", "Tile": "tile", "Slate": "slate",
  "Asphalt": "asphaltShingle", "Shingle": "asphaltShingle",
};

const DEFAULT_WALL_MATERIAL = "vinyl";
const DEFAULT_ROOF_MATERIAL = "asphaltShingle";
const DEFAULT_WALL_COLOR = WALL_PRESETS[DEFAULT_WALL_MATERIAL];
const DEFAULT_ROOF_COLOR = ROOF_PRESETS[DEFAULT_ROOF_MATERIAL];

export function read3DPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) ?? {}; }
  catch { return {}; }
}

export function write3DPrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }
  catch { /* quota — ignore */ }
}

/**
 * Resolve the final wall/roof color + material-preset key for a given project.
 *
 * @param {object} sources - any of these may be omitted:
 *   - materials: array from `project.materials` (LayerEditor output)
 *   - wallMaterial: override material key (e.g. "vinyl")
 *   - roofMaterial: override material key (e.g. "asphaltShingle")
 *   - wallColor / roofColor: explicit hex overrides
 * @returns {{ wallColor, roofColor, wallMaterial, roofMaterial }}
 */
export function resolveHouseColors({
  materials = null,
  wallMaterial: wallMatIn = null,
  roofMaterial: roofMatIn = null,
  wallColor: wallColorIn = null,
  roofColor: roofColorIn = null,
} = {}) {
  const prefs = read3DPrefs();

  // ── Wall ─────────────────────────────────────────────────────────────────
  // Prefer an explicit layer-6 "paint" color from the project materials,
  // then layer-5 cladding color. These are what the user picks in LayerEditor.
  const wallMatEntry = materials?.[5];
  const paintEntry   = materials?.[6];
  const wallMaterial =
    wallMatIn
    || prefs.wallMaterial
    || WALL_NAME_TO_KEY[wallMatEntry?.material]
    || DEFAULT_WALL_MATERIAL;
  const wallColor =
    wallColorIn
    || prefs.wallColor
    || paintEntry?.wallColor
    || wallMatEntry?.color
    || WALL_PRESETS[wallMaterial]
    || DEFAULT_WALL_COLOR;

  // ── Roof ─────────────────────────────────────────────────────────────────
  // LayerEditor's roof layer is index 7 (color palette / roof color); the
  // physical roof material comes from the roof-material selection at index 6
  // in some older shapes, so we look in both spots.
  const roofEntry     = materials?.[7];
  const roofMatEntry  = materials?.[6];
  const roofMaterial =
    roofMatIn
    || prefs.roofMaterial
    || ROOF_NAME_TO_KEY[
         Object.keys(ROOF_NAME_TO_KEY).find(
           (k) => roofEntry?.material?.includes(k) || roofMatEntry?.material?.includes(k)
         )
       ]
    || DEFAULT_ROOF_MATERIAL;
  const roofColor =
    roofColorIn
    || prefs.roofColor
    || roofEntry?.roofColor
    || roofMatEntry?.roofColor
    || ROOF_PRESETS[roofMaterial]
    || DEFAULT_ROOF_COLOR;

  return { wallColor, roofColor, wallMaterial, roofMaterial };
}

export { WALL_PRESETS, ROOF_PRESETS, PREFS_KEY };
