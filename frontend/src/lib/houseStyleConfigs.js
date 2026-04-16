/**
 * houseStyleConfigs — data-driven exterior configs per house style.
 *
 * Each config controls roof form, overhang depth, material palette,
 * porch/canopy presence, and accent colors.  The geometry builder reads
 * these values at render time — no magic numbers in the render path.
 *
 * Keys match the style strings emitted by generateLocalFloorPlan:
 *   "Modern" | "Ranch" | "Colonial" | "Craftsman" | "Mediterranean"
 */

export const STYLE_CONFIGS = {
  Modern: {
    roofType: "flat",                 // flat membrane cap
    roofPitch: 0.02,                  // near-zero drainage slope
    roofOverhang: 0.06,              // minimal overhang (world units)
    porchDepthFt: 0,                 // no porch
    entryCanopy: { depthFt: 4, heightFt: 8.5 }, // thin flat slab over front door
    materials: {
      wallColor:        "#F2F2F0",   // smooth white plaster
      roofColor:        "#1A1A1A",   // dark flat membrane
      trimColor:        "#111111",   // black trim
      windowFrameColor: "#111111",   // black window frames
      doorFrameColor:   "#222222",
    },
    wallRoughness: 0.5,
    roofRoughness: 0.35,
    roofMetalness: 0.05,
  },

  Ranch: {
    roofType: "gable",
    roofPitch: 5 / 12,               // moderate 5:12 (22.6 deg)
    roofOverhang: 0.22,              // wide overhangs
    porchDepthFt: 6,                 // full-width front porch
    entryCanopy: null,               // porch replaces canopy
    materials: {
      wallColor:        "#D4C5A9",   // warm beige siding
      roofColor:        "#3D3D3D",   // dark asphalt shingle
      trimColor:        "#FFFFFF",   // white trim
      windowFrameColor: "#FFFFFF",
      doorFrameColor:   "#4a3728",
    },
    wallRoughness: 0.85,
    roofRoughness: 0.8,
    roofMetalness: 0.1,
  },

  Colonial: {
    roofType: "gable",
    roofPitch: 8 / 12,               // steep 8:12 (33.7 deg)
    roofOverhang: 0.10,              // restrained overhangs
    porchDepthFt: 0,
    entryCanopy: { depthFt: 3, heightFt: 8 }, // formal pediment canopy
    materials: {
      wallColor:        "#C4A98C",   // warm brick/stone
      roofColor:        "#2A2A2A",   // dark asphalt shingle
      trimColor:        "#FFFFFF",
      windowFrameColor: "#FFFFFF",
      doorFrameColor:   "#3a2a1a",
    },
    wallRoughness: 0.78,
    roofRoughness: 0.8,
    roofMetalness: 0.1,
  },

  Craftsman: {
    roofType: "gable",
    roofPitch: 6 / 12,               // moderate-steep 6:12
    roofOverhang: 0.30,              // deep bracketed overhangs
    porchDepthFt: 5,                 // covered entry porch
    entryCanopy: null,               // porch replaces canopy
    materials: {
      wallColor:        "#8B7355",   // earthy brown siding
      roofColor:        "#4A3728",   // dark brown shingle
      trimColor:        "#5A4838",
      windowFrameColor: "#3A2A1A",
      doorFrameColor:   "#2a1a0a",
    },
    wallRoughness: 0.92,
    roofRoughness: 0.85,
    roofMetalness: 0.08,
  },

  Mediterranean: {
    roofType: "hip",                  // four-slope hip roof
    roofPitch: 3 / 12,               // low 3:12 (14 deg)
    roofOverhang: 0.18,              // moderate overhangs
    porchDepthFt: 0,
    entryCanopy: { depthFt: 3.5, heightFt: 9 }, // arched entry recess
    materials: {
      wallColor:        "#E8D5B0",   // warm stucco
      roofColor:        "#C4622D",   // terracotta clay tile
      trimColor:        "#F0E8D0",
      windowFrameColor: "#8B7355",
      doorFrameColor:   "#6B5335",
    },
    wallRoughness: 0.93,
    roofRoughness: 0.7,
    roofMetalness: 0.05,
  },
};

/** Look up a config by name. Falls back to Ranch (most "neutral" style). */
export function getStyleConfig(styleName) {
  return STYLE_CONFIGS[styleName] || STYLE_CONFIGS.Ranch;
}
