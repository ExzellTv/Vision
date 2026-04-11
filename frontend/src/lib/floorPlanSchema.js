/**
 * Floor Plan JSON Schema — Zod validation + types
 *
 * This is the canonical schema for Vision's floor plan data.
 * The backend outputs this format, and all 3D components consume it.
 *
 * Coordinate system: origin top-left, x = right, y = down, units = feet
 * 3D conversion: 1 foot = 0.1 Three.js units (scale factor 0.3048 for meters)
 */
import { z } from "zod";

// ── Room schema ──────────────────────────────────────────────────────────────
export const RoomSchema = z.object({
  id: z.string().optional(),
  type: z.enum([
    "bedroom", "bathroom", "kitchen", "living", "dining",
    "garage", "hallway", "closet", "laundry", "entry", "office",
  ]),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  floor: z.number().int().min(0).default(0),
  bearing: z.array(z.boolean()).length(4).optional(), // [top, right, bottom, left]
});

// ── Wall schema ──────────────────────────────────────────────────────────────
export const WallSchema = z.object({
  id: z.string().optional(),
  start: z.tuple([z.number(), z.number()]),
  end: z.tuple([z.number(), z.number()]),
  thickness: z.number().positive().default(0.65), // ~8" in feet
  height: z.number().positive().optional(),
  floor: z.number().int().min(0).default(0),
  isExterior: z.boolean().default(false),
});

// ── Opening (door/window) schema ─────────────────────────────────────────────
export const OpeningSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["door", "window"]),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive().optional(),
  side: z.enum(["top", "bottom", "left", "right"]),
  sillHeight: z.number().min(0).optional(), // windows only
  isExterior: z.boolean().default(true),
});

// ── Complete floor plan schema ───────────────────────────────────────────────
export const FloorPlanSchema = z.object({
  id: z.string(),
  width: z.number().positive(),   // footprint width (feet)
  depth: z.number().positive(),   // footprint depth (feet)
  totalSF: z.number().positive(),
  stories: z.number().int().min(1).default(1),
  wallHeight: z.number().positive().default(9), // feet (2.7m)
  rooms: z.array(RoomSchema).min(1),
  walls: z.array(WallSchema).default([]),
  windows: z.array(OpeningSchema).default([]),
  doors: z.array(OpeningSchema).default([]),
  score: z.number().min(0).max(1).optional(),
  style: z.string().optional(),
  perimeter: z.number().optional(),
});

/**
 * Validate a raw floor plan JSON object.
 * Returns { success: true, data } or { success: false, error }.
 */
export function validateFloorPlan(json) {
  const result = FloorPlanSchema.safeParse(json);
  if (!result.success) {
    console.warn("[Vision] Floor plan validation failed:", result.error.format());
  }
  return result;
}

/**
 * Coerce the internal Vision format (from useProjectStore) into the schema.
 * Adds default IDs, infers wall height, etc.
 */
export function coerceVisionFloorPlan(fp) {
  if (!fp || !fp.rooms?.length) return null;
  return {
    id: fp.id || `fp-${Date.now()}`,
    width: fp.width || 40,
    depth: fp.depth || 30,
    totalSF: fp.totalSF || fp.rooms.reduce((s, r) => s + (r.w || 0) * (r.h || 0), 0),
    stories: fp.stories || 1,
    wallHeight: 9,
    rooms: fp.rooms.map((r, i) => ({
      id: r.id || `room-${i}`,
      type: r.type || "living",
      label: r.label || r.type || "Room",
      x: r.x ?? 0,
      y: r.y ?? 0,
      w: r.w ?? r.width ?? 10,
      h: r.h ?? r.depth ?? 10,
      floor: r.floor ?? 0,
      bearing: r.bearing,
    })),
    walls: fp.walls || [],
    windows: (fp.windows || []).map((w, i) => ({
      id: w.id || `win-${i}`,
      type: "window",
      x: w.x ?? 0,
      y: w.y ?? 0,
      width: w.width || 3,
      height: w.height || 4,
      side: w.side || "bottom",
      sillHeight: w.sillHeight ?? 3,
      isExterior: true,
    })),
    doors: (fp.doors || []).map((d, i) => ({
      id: d.id || `door-${i}`,
      type: "door",
      x: d.x ?? 0,
      y: d.y ?? 0,
      width: d.width || 3,
      height: d.height || 7,
      side: d.side || "bottom",
      isExterior: d.isExterior !== false,
    })),
    score: fp.score,
    style: fp.style,
    perimeter: fp.perimeter,
  };
}
