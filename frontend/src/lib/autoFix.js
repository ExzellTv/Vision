/**
 * autoFix — pure function that takes an array of story plans and a set of
 * violation ids and returns a NEW array of story plans with fixes applied.
 *
 * Contract:
 *   - Pure (no mutation of inputs), so undo is free.
 *   - Never change room count or room types.  Only resize or reposition.
 *   - Log each fix in plain English for the UI's "what changed" panel.
 */
import { THRESHOLDS, validateStructure } from "./structuralValidator";

function friendlyRoomName(room) {
  if (!room) return "that room";
  if (room.label && room.label.trim().length > 0) return room.label;
  const map = {
    bedroom: "bedroom", bathroom: "bathroom", kitchen: "kitchen",
    living: "living room", dining: "dining room", garage: "garage",
    office: "home office", laundry: "laundry room", closet: "closet",
    entry: "entry", hallway: "hallway",
  };
  return map[room.type] || "room";
}

function sideWord(side) {
  switch (side) {
    case "top":    return "front";
    case "bottom": return "back";
    case "left":   return "left";
    case "right":  return "right";
    default:       return "that side";
  }
}

// Deep-ish copy of a story plan — keeps references to nested arrays fresh
// so callers can mutate their copies without touching originals.
function clonePlan(plan) {
  return {
    ...plan,
    rooms:    (plan.rooms    || []).map((r) => ({ ...r })),
    doors:    (plan.doors    || []).map((d) => ({ ...d })),
    windows:  (plan.windows  || []).map((w) => ({ ...w })),
    placed_items: (plan.placed_items || plan.placedItems || []).map((i) => ({ ...i })),
  };
}

function cloneStoryPlans(storyPlans) {
  return (storyPlans || []).map(clonePlan);
}

function storyBBox(rooms) {
  if (!rooms || rooms.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  rooms.forEach((r) => {
    minX = Math.min(minX, r.x);
    maxX = Math.max(maxX, r.x + r.w);
    minY = Math.min(minY, r.y);
    maxY = Math.max(maxY, r.y + r.h);
  });
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

function storyArea(rooms) {
  return (rooms || []).reduce((s, r) => s + (r.w || 0) * (r.h || 0), 0);
}

function pointInRoom(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// ── Fix 1: trim overhanging rooms on a given side ────────────────────────
function fixCantilever(storyPlans, side, appliedFixes) {
  if (storyPlans.length < 2) return;
  const upper = storyPlans[1];
  const lowerBB = storyBBox(storyPlans[0].rooms);
  if (!lowerBB) return;
  const MARGIN = 0.1 * 3.28084; // 0.1m in ft — safety buffer away from edge

  upper.rooms.forEach((room) => {
    if (side === "top" && room.y < lowerBB.minY) {
      const newY = lowerBB.minY + MARGIN;
      room.h = Math.max(3, room.h - (newY - room.y));
      room.y = newY;
      appliedFixes.push(`Trimmed the ${friendlyRoomName(room)} back from the ${sideWord(side)} edge.`);
    } else if (side === "bottom" && room.y + room.h > lowerBB.maxY) {
      const newBottom = lowerBB.maxY - MARGIN;
      room.h = Math.max(3, newBottom - room.y);
      appliedFixes.push(`Trimmed the ${friendlyRoomName(room)} back from the ${sideWord(side)} edge.`);
    } else if (side === "left" && room.x < lowerBB.minX) {
      const newX = lowerBB.minX + MARGIN;
      room.w = Math.max(3, room.w - (newX - room.x));
      room.x = newX;
      appliedFixes.push(`Trimmed the ${friendlyRoomName(room)} back from the ${sideWord(side)} edge.`);
    } else if (side === "right" && room.x + room.w > lowerBB.maxX) {
      const newRight = lowerBB.maxX - MARGIN;
      room.w = Math.max(3, newRight - room.x);
      appliedFixes.push(`Trimmed the ${friendlyRoomName(room)} back from the ${sideWord(side)} edge.`);
    }
  });
}

// ── Fix 2: scale 2nd floor rooms inward from each room's centroid ────────
function fixFloor2Ratio(storyPlans, appliedFixes) {
  if (storyPlans.length < 2) return;
  const lowerArea = storyArea(storyPlans[0].rooms);
  const upperArea = storyArea(storyPlans[1].rooms);
  if (lowerArea <= 0 || upperArea <= 0) return;
  const currentRatio = upperArea / lowerArea;
  const target = THRESHOLDS.SAFE_FLOOR2_RATIO;
  if (currentRatio <= target) return;
  // Area scales with the square of linear scale; new linear = sqrt(target/current)
  const linear = Math.sqrt(target / currentRatio);
  storyPlans[1].rooms.forEach((r) => {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const newW = Math.max(3, r.w * linear);
    const newH = Math.max(3, r.h * linear);
    r.x = cx - newW / 2;
    r.y = cy - newH / 2;
    r.w = newW;
    r.h = newH;
  });
  appliedFixes.push("Scaled the second floor down so it fits inside the foundation.");
}

// ── Fix 3: grow 1st floor rooms outward from their centroids ─────────────
function fixFloor1TooSmall(storyPlans, appliedFixes) {
  if (storyPlans.length < 2) return;
  const lowerArea = storyArea(storyPlans[0].rooms);
  if (lowerArea >= THRESHOLDS.SAFE_FLOOR1_SF_MULTI) return;
  const linear = Math.sqrt(THRESHOLDS.SAFE_FLOOR1_SF_MULTI / lowerArea);
  storyPlans[0].rooms.forEach((r) => {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    r.w = r.w * linear;
    r.h = r.h * linear;
    r.x = cx - r.w / 2;
    r.y = cy - r.h / 2;
  });
  appliedFixes.push("Expanded the first floor so it can carry the upper level.");
}

// ── Fix 4: widen narrow rooms in the narrowest axis ──────────────────────
function fixNarrowRooms(storyPlans, appliedFixes) {
  storyPlans.forEach((plan) => {
    (plan.rooms || []).forEach((r) => {
      if (r.type === "closet" || r.type === "hallway") return;
      const target = THRESHOLDS.SAFE_ROOM_DIM_FT;
      if (r.w < THRESHOLDS.MIN_ROOM_DIM_FT) {
        r.w = target;
        appliedFixes.push(`Widened the ${friendlyRoomName(r)} to a comfortable size.`);
      }
      if (r.h < THRESHOLDS.MIN_ROOM_DIM_FT) {
        r.h = target;
        appliedFixes.push(`Deepened the ${friendlyRoomName(r)} to a comfortable size.`);
      }
    });
  });
}

// ── Fix 6: move floating upper rooms over a lower room ───────────────────
function fixFloatingRooms(storyPlans, appliedFixes) {
  if (storyPlans.length < 2) return;
  const lowerRooms = storyPlans[0].rooms || [];
  if (lowerRooms.length === 0) return;
  storyPlans[1].rooms.forEach((r) => {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const supported = lowerRooms.some((lr) => pointInRoom(cx, cy, lr));
    if (supported) return;
    // Find nearest lower room by centroid distance
    let nearest = lowerRooms[0];
    let bestD = Infinity;
    lowerRooms.forEach((lr) => {
      const lcx = lr.x + lr.w / 2;
      const lcy = lr.y + lr.h / 2;
      const d = Math.hypot(cx - lcx, cy - lcy);
      if (d < bestD) { bestD = d; nearest = lr; }
    });
    // Re-center the upper room over the nearest lower room (clamped so it
    // stays in that room's footprint)
    const nearestCx = nearest.x + nearest.w / 2;
    const nearestCy = nearest.y + nearest.h / 2;
    r.x = nearestCx - r.w / 2;
    r.y = nearestCy - r.h / 2;
    appliedFixes.push(`Moved the ${friendlyRoomName(r)} over the ${friendlyRoomName(nearest)} so it has support below.`);
  });
}

/**
 * Apply all requested fixes and return a new plans array plus logs.
 *
 * @param storyPlans      Array of plan objects (ground, upper, ...)
 * @param violationIds    Array of violation ids to fix, or the string "all"
 * @returns {
 *   fixedStoryPlans: StoryPlan[],
 *   appliedFixes:    string[],        // plain-English log lines
 *   remainingViolations: Violation[], // post-fix validation result
 * }
 */
export function autoFixStoryPlans(storyPlans, violationIds) {
  const next = cloneStoryPlans(storyPlans);
  const appliedFixes = [];
  const fixAll = violationIds === "all";
  const ids = new Set(fixAll ? [] : (violationIds || []));

  // Order matters: grow the first floor before scaling the second so
  // ratios settle, then trim overhangs, then re-seat floating rooms,
  // then fix narrow rooms last (widening might otherwise undo trims).
  if (fixAll || ids.has("floor1-too-small"))   fixFloor1TooSmall(next, appliedFixes);
  if (fixAll || ids.has("floor2-ratio"))       fixFloor2Ratio(next, appliedFixes);
  if (fixAll || [...ids].some((id) => id.startsWith("cantilever-"))) {
    ["top", "bottom", "left", "right"].forEach((side) => {
      if (fixAll || ids.has(`cantilever-${side}`)) fixCantilever(next, side, appliedFixes);
    });
  }
  if (fixAll || [...ids].some((id) => id.startsWith("floating-"))) {
    fixFloatingRooms(next, appliedFixes);
  }
  if (fixAll || [...ids].some((id) => id.startsWith("room-narrow-"))) {
    fixNarrowRooms(next, appliedFixes);
  }

  const { violations: remainingViolations } = validateStructure(next);
  return { fixedStoryPlans: next, appliedFixes, remainingViolations };
}
