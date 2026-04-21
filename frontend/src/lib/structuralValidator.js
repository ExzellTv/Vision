/**
 * structuralValidator — feasibility checks on a multi-story floor plan.
 *
 * Consumes the story-plans array the project store holds.  Each element is
 * a floor plan object with rooms[], width, depth.  Returns a list of
 * Violation objects with plain-English messages an architect would say out
 * loud.  No coordinates, no raw measurements in the prose.
 *
 * Unit note: the codebase stores plan dimensions in feet.  The upstream
 * spec uses meters for its thresholds, so we convert once here.
 */

// Threshold constants — computed from the spec's meter values so we can
// tweak the spec in one place.  m² → ft² uses 10.7639.
const M_TO_FT = 3.28084;
const M2_TO_SF = 10.7639;

export const THRESHOLDS = {
  MAX_CANTILEVER_FT:     2.5 * M_TO_FT,      // ~8.2 ft
  CANTILEVER_SAFE_FT:    2.4 * M_TO_FT,      // ~7.87 ft (auto-fix target)
  MAX_FLOOR2_RATIO:      1.40,
  SAFE_FLOOR2_RATIO:     1.35,
  MIN_FLOOR1_SF_MULTI:   30 * M2_TO_SF,      // ~323 sf
  SAFE_FLOOR1_SF_MULTI:  35 * M2_TO_SF,      // ~377 sf
  MIN_ROOM_DIM_FT:       1.8 * M_TO_FT,      // ~5.91 ft
  SAFE_ROOM_DIM_FT:      2.0 * M_TO_FT,      // ~6.56 ft
  MIN_TOTAL_SF:          40   * M2_TO_SF,    // ~430 sf
  MAX_TOTAL_SF:          1000 * M2_TO_SF,    // ~10764 sf
  PILLAR_SPACING_FT:     3.5 * M_TO_FT,      // ~11.5 ft
  PILLAR_BASE_FT:        0.3 * M_TO_FT,      // ~0.98 ft
};

// ── Friendly helpers for violation prose ─────────────────────────────────
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

function sideLabel(side) {
  // side is one of "top" | "bottom" | "left" | "right" in plan-space.
  // Plan Y points down, so "top" is the north edge in the viewer.
  switch (side) {
    case "top":    return "front";
    case "bottom": return "back";
    case "left":   return "left";
    case "right":  return "right";
    default:       return "one side";
  }
}

// ── Geometry helpers (AABB over each story) ──────────────────────────────
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
  if (!rooms) return 0;
  return rooms.reduce((s, r) => s + (r.w || 0) * (r.h || 0), 0);
}

function pointInRoom(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/**
 * Find how far (in feet) the upper story extends past the lower story on
 * each side.  Uses AABB approximation — a proper polygon clip would give
 * per-vertex overhangs; this is good enough for the demo.  If polygon-
 * clipping is installed later, replace this with real containment math.
 */
function computeCantileverBySide(lowerBBox, upperBBox) {
  if (!lowerBBox || !upperBBox) return { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    top:    Math.max(0, lowerBBox.minY - upperBBox.minY),
    bottom: Math.max(0, upperBBox.maxY - lowerBBox.maxY),
    left:   Math.max(0, lowerBBox.minX - upperBBox.minX),
    right:  Math.max(0, upperBBox.maxX - lowerBBox.maxX),
  };
}

// ── Individual checks ────────────────────────────────────────────────────
function checkCantilever(storyPlans, violations) {
  if (storyPlans.length < 2) return;
  const lower = storyPlans[0];
  const upper = storyPlans[1];
  const lowerBB = storyBBox(lower.rooms);
  const upperBB = storyBBox(upper.rooms);
  const over = computeCantileverBySide(lowerBB, upperBB);
  Object.entries(over).forEach(([side, overhangFt]) => {
    if (overhangFt > THRESHOLDS.MAX_CANTILEVER_FT) {
      // Find affected upper rooms on that side.
      const affected = upper.rooms.filter((r) => {
        if (side === "top")    return r.y < lowerBB.minY;
        if (side === "bottom") return r.y + r.h > lowerBB.maxY;
        if (side === "left")   return r.x < lowerBB.minX;
        if (side === "right")  return r.x + r.w > lowerBB.maxX;
        return false;
      });
      violations.push({
        id: `cantilever-${side}`,
        severity: "blocking",
        message: `Your second floor extends too far past the first floor on the ${sideLabel(side)} side, so we'd need a foundation wall below it to support that.`,
        affectedRoomIds: affected.map((r) => r.id).filter(Boolean),
        autoFixAvailable: true,
        autoFixDescription: "Trim the overhanging rooms back to a safe depth.",
      });
    }
  });
}

function checkFloor2Ratio(storyPlans, violations) {
  if (storyPlans.length < 2) return;
  const lowerArea = storyArea(storyPlans[0].rooms);
  const upperArea = storyArea(storyPlans[1].rooms);
  if (lowerArea <= 0) return;
  const ratio = upperArea / lowerArea;
  if (ratio > THRESHOLDS.MAX_FLOOR2_RATIO) {
    violations.push({
      id: "floor2-ratio",
      severity: "warning",
      message: `Your second floor is notably larger than your first floor — worth reviewing proportions, but still buildable.`,
      affectedRoomIds: (storyPlans[1].rooms || []).map((r) => r.id).filter(Boolean),
      autoFixAvailable: true,
      autoFixDescription: "Scale the second floor down to better match the foundation.",
    });
  }
}

function checkMinFloor1ForMultiStory(storyPlans, violations) {
  if (storyPlans.length < 2) return;
  const lowerArea = storyArea(storyPlans[0].rooms);
  if (lowerArea < THRESHOLDS.MIN_FLOOR1_SF_MULTI) {
    violations.push({
      id: "floor1-too-small",
      severity: "blocking",
      message: `Your first floor is too small to carry a second story safely.`,
      affectedRoomIds: (storyPlans[0].rooms || []).map((r) => r.id).filter(Boolean),
      autoFixAvailable: true,
      autoFixDescription: "Grow the first floor to a supportable size.",
    });
  }
}

function checkRoomMinDimensions(storyPlans, violations) {
  storyPlans.forEach((plan, storyIdx) => {
    (plan.rooms || []).forEach((room) => {
      if (room.type === "closet" || room.type === "hallway") return; // these are expected to be thin
      const minDim = Math.min(room.w, room.h);
      if (minDim < THRESHOLDS.MIN_ROOM_DIM_FT) {
        const floorLabel = storyPlans.length > 1 ? (storyIdx === 0 ? " on the first floor" : " on the second floor") : "";
        violations.push({
          id: `room-narrow-${storyIdx}-${room.id || room.label || Math.random().toString(36).slice(2, 6)}`,
          severity: "warning",
          message: `The ${friendlyRoomName(room)}${floorLabel} is on the narrow side — may be tight for daily use.`,
          affectedRoomIds: room.id ? [room.id] : [],
          autoFixAvailable: true,
          autoFixDescription: "Widen it to a comfortable size.",
        });
      }
    });
  });
}

function checkTotalArea(storyPlans, violations) {
  const total = storyPlans.reduce((s, plan) => s + storyArea(plan.rooms), 0);
  if (total < THRESHOLDS.MIN_TOTAL_SF) {
    violations.push({
      id: "total-too-small",
      severity: "blocking",
      message: `This home is smaller than a buildable residence. It needs more floor space to function as a home.`,
      affectedRoomIds: [],
      autoFixAvailable: false,
      autoFixDescription: "",
    });
  } else if (total > THRESHOLDS.MAX_TOTAL_SF) {
    violations.push({
      id: "total-too-large",
      severity: "warning",
      message: `This home is larger than a typical residential build. It's still buildable, but expect commercial-scale costs.`,
      affectedRoomIds: [],
      autoFixAvailable: false,
      autoFixDescription: "",
    });
  }
}

function checkFloatingRooms(storyPlans, violations) {
  if (storyPlans.length < 2) return;
  const lowerRooms = storyPlans[0].rooms || [];
  const upperRooms = storyPlans[1].rooms || [];
  upperRooms.forEach((room) => {
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    const supported = lowerRooms.some((lower) => pointInRoom(cx, cy, lower));
    if (!supported) {
      violations.push({
        id: `floating-${room.id || room.label || Math.random().toString(36).slice(2, 6)}`,
        severity: "warning",
        message: `The ${friendlyRoomName(room)} on the second floor may need additional support below — review framing plan.`,
        affectedRoomIds: room.id ? [room.id] : [],
        autoFixAvailable: true,
        autoFixDescription: "Move it over a first-floor room so it has clear support below.",
      });
    }
  });
}

// ── Main export ──────────────────────────────────────────────────────────
/**
 * Validate the full multi-story plan.  `storyPlans` is the array held on
 * the project store — index 0 is the ground floor.
 *
 * Returns:
 *   {
 *     isValid: boolean,        // true when no blocking violations remain
 *     violations: Violation[], // blocking + warning, in check order
 *   }
 */
export function validateStructure(storyPlans) {
  const violations = [];
  const plans = Array.isArray(storyPlans) ? storyPlans.filter(Boolean) : [];
  if (plans.length === 0) {
    return { isValid: true, violations: [] };
  }

  checkCantilever(plans, violations);
  checkFloor2Ratio(plans, violations);
  checkMinFloor1ForMultiStory(plans, violations);
  checkRoomMinDimensions(plans, violations);
  checkTotalArea(plans, violations);
  checkFloatingRooms(plans, violations);

  const isValid = !violations.some((v) => v.severity === "blocking");
  return { isValid, violations };
}
