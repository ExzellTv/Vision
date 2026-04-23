/**
 * Compliance Auto-Fix — pure function, mirrors autoFix.js pattern.
 * Takes current placedItems and backend-generated patches, returns
 * fixed items + changelog. No mutation of input.
 */

/**
 * Apply room-dimension patches from the /compliance/fix endpoint.
 *
 * @param {Array} placedItems - current floor plan items (rooms, furniture, openings)
 * @param {Array} patches - from Cerebras: [{room_id, room_name, field, new_w, new_h, reason, code_reference}]
 * @returns {{ fixedItems: Array, appliedFixes: string[], skipped: string[] }}
 */
export function applyCompliancePatches(placedItems, patches) {
  const fixed = placedItems.map((item) => ({ ...item }));
  const appliedFixes = [];
  const skipped = [];

  for (const patch of patches) {
    // First try exact ID match, then fall back to type/name match
    // (Cerebras may return a room_name like "bedroom" instead of a UUID)
    let idx = fixed.findIndex(
      (item) => item.id === patch.room_id || item.id === String(patch.room_id)
    );
    if (idx === -1 && patch.room_name) {
      const nameKey = patch.room_name.toLowerCase().replace(/\s+/g, "");
      idx = fixed.findIndex((item) => {
        const t = (item.type || "").toLowerCase();
        const n = (item.name || item.label || "").toLowerCase().replace(/\s+/g, "");
        return t === nameKey || n.includes(nameKey) || nameKey.includes(t);
      });
    }

    if (idx === -1) {
      skipped.push(`${patch.room_name || patch.room_id}: room not found in current plan`);
      continue;
    }

    const room = { ...fixed[idx] };
    const prevW = room.w || room.width || 0;
    const prevH = room.h || room.depth || room.height || 0;

    if (patch.field === "w" || patch.field === "both") {
      room.w = patch.new_w;
      if (room.width !== undefined) room.width = patch.new_w;
    }
    if (patch.field === "h" || patch.field === "both") {
      room.h = patch.new_h;
      if (room.depth !== undefined) room.depth = patch.new_h;
      if (room.height !== undefined) room.height = patch.new_h;
    }

    fixed[idx] = room;

    const ref = patch.code_reference ? ` [${patch.code_reference}]` : "";
    appliedFixes.push(
      `${patch.room_name || room.name || room.type}: ${prevW}×${prevH}ft → ${patch.new_w ?? prevW}×${patch.new_h ?? prevH}ft — ${patch.reason}${ref}`
    );
  }

  return { fixedItems: fixed, appliedFixes, skipped };
}

const IRC_MINS = {
  bedroom:  { minW: 7,  minH: 7,  minArea: 70  },
  bathroom: { minW: 5,  minH: 5,  minArea: 25  },
  kitchen:  { minW: 7,  minH: 7,  minArea: 50  },
  living:   { minW: 10, minH: 10, minArea: 120 },
  dining:   { minW: 8,  minH: 8,  minArea: 64  },
  office:   { minW: 7,  minH: 7,  minArea: 49  },
  laundry:  { minW: 5,  minH: 5,  minArea: 25  },
  garage:   { minW: 10, minH: 20, minArea: 200 },
  hallway:  { minW: 3,  minH: 3,  minArea: 0   },
  closet:   { minW: 2,  minH: 2,  minArea: 0   },
  entry:    { minW: 4,  minH: 4,  minArea: 0   },
};

const TYPE_ALIAS = {
  master: "bedroom",
  master_bedroom: "bedroom",
  secondary: "bedroom",
  secondary_bedroom: "bedroom",
  bedroom_master: "bedroom",
  bedroom_secondary: "bedroom",
  master_bath: "bathroom",
  master_bathroom: "bathroom",
  half_bath: "bathroom",
  powder_room: "bathroom",
  living_room: "living",
  family_room: "living",
  dining_room: "dining",
  utility: "laundry",
  mud_room: "laundry",
  garage_1car: "garage",
  garage_2car: "garage",
  garage_3car: "garage",
};

const MANUAL_REVIEW_KEYWORDS = [
  "egress",
  "window",
  "setback",
  "zoning",
  "fire",
  "separation",
  "permit",
  "stair",
  "smoke",
  "sprinkler",
];

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeKey(value = "") {
  return String(value).toLowerCase().trim().replace(/[\s-]+/g, "_");
}

function roomType(room) {
  const raw = normalizeKey(room?.type || room?.roomType || room?.label || room?.name || "");
  return TYPE_ALIAS[raw] || raw;
}

function roomLabel(room) {
  return room?.label || room?.name || room?.type || "Room";
}

function roomW(room) {
  return asNumber(room?.w ?? room?.width ?? room?.width_ft, 0);
}

function roomH(room) {
  return asNumber(room?.h ?? room?.depth ?? room?.height ?? room?.depth_ft, 0);
}

function roomFixId(room, storyIndex, roomIndex) {
  return String(room?.id ?? `story-${storyIndex + 1}-room-${roomIndex + 1}`);
}

function roomArea(room) {
  return roomW(room) * roomH(room);
}

function planRooms(plan) {
  return Array.isArray(plan?.rooms) ? plan.rooms : [];
}

function planWidth(plan, rooms) {
  const maxRoomX = rooms.length > 0
    ? Math.max(...rooms.map((r) => asNumber(r.x, 0) + roomW(r)))
    : 0;
  return asNumber(plan?.width, maxRoomX || 40);
}

function planDepth(plan, rooms) {
  const maxRoomY = rooms.length > 0
    ? Math.max(...rooms.map((r) => asNumber(r.y, 0) + roomH(r)))
    : 0;
  return asNumber(plan?.depth, maxRoomY || 40);
}

function setRoomSize(room, w, h) {
  room.w = w;
  room.h = h;
  if (room.width !== undefined) room.width = w;
  if (room.depth !== undefined) room.depth = h;
  if (room.height !== undefined) room.height = h;
}

function syncPlacedItems(plan, rooms) {
  if (!Array.isArray(plan?.placed_items)) return plan?.placed_items;

  const usedRoomIdxs = new Set();
  return plan.placed_items.map((item) => {
    if (!item.isRoom) return item;

    let matchIdx = rooms.findIndex((r, idx) =>
      !usedRoomIdxs.has(idx) &&
      item.id !== undefined &&
      r.id !== undefined &&
      String(r.id) === String(item.id)
    );

    if (matchIdx === -1) {
      matchIdx = rooms.findIndex((r, idx) =>
        !usedRoomIdxs.has(idx) &&
        r.type === item.type &&
        (r.label === item.label || r.label === item.name)
      );
    }

    if (matchIdx === -1) {
      const itemLabel = (item.label || item.name || "").toLowerCase();
      matchIdx = rooms.findIndex((r, idx) =>
        !usedRoomIdxs.has(idx) &&
        r.type === item.type &&
        (r.label || "").toLowerCase() === itemLabel
      );
    }

    if (matchIdx === -1) {
      let bestDist = Infinity;
      rooms.forEach((r, idx) => {
        if (usedRoomIdxs.has(idx) || r.type !== item.type) return;
        const d = Math.hypot((asNumber(r.x, 0) - asNumber(item.x, 0)) || 0, (asNumber(r.y, 0) - asNumber(item.y, 0)) || 0);
        if (d < bestDist) {
          bestDist = d;
          matchIdx = idx;
        }
      });
    }

    if (matchIdx === -1) return item;

    usedRoomIdxs.add(matchIdx);
    const m = rooms[matchIdx];
    return {
      ...item,
      x: asNumber(m.x, 0),
      y: asNumber(m.y, 0),
      w: roomW(m),
      h: roomH(m),
      width: roomW(m),
      depth: roomH(m),
    };
  });
}

function resolveOverlaps(rooms) {
  for (let iter = 0; iter < 30; iter++) {
    let moved = false;
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i];
        const b = rooms[j];
        const ox = Math.min(asNumber(a.x, 0) + roomW(a), asNumber(b.x, 0) + roomW(b)) - Math.max(asNumber(a.x, 0), asNumber(b.x, 0));
        const oy = Math.min(asNumber(a.y, 0) + roomH(a), asNumber(b.y, 0) + roomH(b)) - Math.max(asNumber(a.y, 0), asNumber(b.y, 0));
        if (ox > 0.1 && oy > 0.1) {
          moved = true;
          if (ox <= oy) b.x = asNumber(b.x, 0) + ox;
          else b.y = asNumber(b.y, 0) + oy;
        }
      }
    }
    if (!moved) break;
  }
}

function scaleBackToFootprint(rooms, origW, origD) {
  if (rooms.length === 0) return;
  const bboxW = Math.max(...rooms.map((r) => asNumber(r.x, 0) + roomW(r)));
  const bboxD = Math.max(...rooms.map((r) => asNumber(r.y, 0) + roomH(r)));

  if (bboxW <= origW * 1.02 && bboxD <= origD * 1.02) return;

  const sx = bboxW > origW ? origW / bboxW : 1;
  const sy = bboxD > origD ? origD / bboxD : 1;
  const scale = Math.min(sx, sy);
  if (scale >= 0.99) return;

  rooms.forEach((r) => {
    const mins = IRC_MINS[roomType(r)];
    const scaledW = Math.round(roomW(r) * scale * 10) / 10;
    const scaledH = Math.round(roomH(r) * scale * 10) / 10;
    const safeToScale = !mins ||
      (scaledW >= mins.minW && scaledH >= mins.minH && scaledW * scaledH >= (mins.minArea || 0));

    if (safeToScale) {
      r.x = Math.round(asNumber(r.x, 0) * scale * 10) / 10;
      r.y = Math.round(asNumber(r.y, 0) * scale * 10) / 10;
      setRoomSize(r, scaledW, scaledH);
    }
  });
}

function finalizePlan(plan, rooms, origW, origD) {
  resolveOverlaps(rooms);
  scaleBackToFootprint(rooms, origW, origD);

  const finalW = rooms.length > 0
    ? Math.max(...rooms.map((r) => asNumber(r.x, 0) + roomW(r)))
    : planWidth(plan, rooms);
  const finalD = rooms.length > 0
    ? Math.max(...rooms.map((r) => asNumber(r.y, 0) + roomH(r)))
    : planDepth(plan, rooms);
  const totalSF = rooms.reduce((sum, r) => sum + roomArea(r), 0);
  const placedItems = syncPlacedItems(plan, rooms);

  return {
    ...plan,
    rooms,
    ...(placedItems !== undefined ? { placed_items: placedItems } : {}),
    width: Math.round(finalW * 10) / 10,
    depth: Math.round(finalD * 10) / 10,
    totalSF: Math.round(totalSF),
  };
}

function moveRoomsAfterGrowth(rooms, growthMap) {
  growthMap.forEach(({ dw, dh, oldRight, oldBottom }, i) => {
    rooms.forEach((other, j) => {
      if (j === i) return;
      if (dw > 0 && asNumber(other.x, 0) >= oldRight - 0.5) {
        other.x = asNumber(other.x, 0) + dw;
      }
      if (dh > 0 && asNumber(other.y, 0) >= oldBottom - 0.5) {
        other.y = asNumber(other.y, 0) + dh;
      }
    });
  });
}

function findPatchTarget(plans, patch) {
  const patchId = patch?.room_id !== undefined ? String(patch.room_id) : "";
  const patchName = normalizeKey(patch?.room_name || patch?.name || "");

  for (let storyIndex = 0; storyIndex < plans.length; storyIndex++) {
    const rooms = planRooms(plans[storyIndex]);
    for (let roomIndex = 0; roomIndex < rooms.length; roomIndex++) {
      const r = rooms[roomIndex];
      if (patchId && roomFixId(r, storyIndex, roomIndex) === patchId) {
        return { storyIndex, roomIndex };
      }
    }
  }

  if (!patchName) return null;

  for (let storyIndex = 0; storyIndex < plans.length; storyIndex++) {
    const rooms = planRooms(plans[storyIndex]);
    for (let roomIndex = 0; roomIndex < rooms.length; roomIndex++) {
      const r = rooms[roomIndex];
      const type = normalizeKey(roomType(r));
      const label = normalizeKey(roomLabel(r));
      if (type === patchName || label.includes(patchName) || patchName.includes(type)) {
        return { storyIndex, roomIndex };
      }
    }
  }

  return null;
}

export function buildComplianceRooms(storyPlans = []) {
  return (storyPlans || []).flatMap((plan, storyIndex) =>
    planRooms(plan).map((room, roomIndex) => {
      const width = roomW(room);
      const depth = roomH(room);
      const type = roomType(room);
      const label = roomLabel(room);
      const id = roomFixId(room, storyIndex, roomIndex);

      return {
        id,
        room_id: id,
        room_name: label,
        type,
        label,
        floor: storyIndex + 1,
        width_ft: width,
        depth_ft: depth,
        area_sf: Math.round(width * depth),
      };
    })
  );
}

export function buildComplianceContext(storyPlans = [], location = null, generateParams = {}) {
  const rooms = buildComplianceRooms(storyPlans);
  const totalSF = rooms.reduce((sum, room) => sum + asNumber(room.area_sf, 0), 0);

  return {
    location: location?.city && location?.state
      ? { city: location.city, state: location.state }
      : undefined,
    ceiling_height_ft: generateParams?.ceilingHeight || 9,
    rooms,
    total_sf: totalSF,
    stories: storyPlans.length || generateParams?.stories || 1,
    generate_params: generateParams || {},
  };
}

export function applyCompliancePatchesToStoryPlans(storyPlans = [], patches = []) {
  const fixedPlans = (storyPlans || []).map((plan) => ({
    ...plan,
    rooms: planRooms(plan).map((room) => ({ ...room })),
    placed_items: Array.isArray(plan?.placed_items) ? plan.placed_items.map((item) => ({ ...item })) : plan?.placed_items,
  }));
  const appliedFixes = [];
  const skipped = [];
  const growthByStory = new Map();

  for (const patch of patches || []) {
    const target = findPatchTarget(fixedPlans, patch);
    if (!target) {
      skipped.push(`${patch?.room_name || patch?.room_id || "Unknown room"}: room not found in current plan`);
      continue;
    }

    const plan = fixedPlans[target.storyIndex];
    const room = plan.rooms[target.roomIndex];
    const prevW = roomW(room);
    const prevH = roomH(room);
    let nextW = prevW;
    let nextH = prevH;
    const field = patch?.field || "both";

    if ((field === "w" || field === "both") && patch?.new_w !== undefined) {
      nextW = Math.max(prevW, asNumber(patch.new_w, prevW));
    }
    if ((field === "h" || field === "both") && patch?.new_h !== undefined) {
      nextH = Math.max(prevH, asNumber(patch.new_h, prevH));
    }

    if (nextW === prevW && nextH === prevH) continue;

    setRoomSize(room, nextW, nextH);

    const storyGrowth = growthByStory.get(target.storyIndex) || new Map();
    storyGrowth.set(target.roomIndex, {
      dw: nextW - prevW,
      dh: nextH - prevH,
      oldRight: asNumber(room.x, 0) + prevW,
      oldBottom: asNumber(room.y, 0) + prevH,
    });
    growthByStory.set(target.storyIndex, storyGrowth);

    const ref = patch?.code_reference ? ` [${patch.code_reference}]` : "";
    const reason = patch?.reason ? ` — ${patch.reason}` : "";
    appliedFixes.push(`${patch?.room_name || roomLabel(room)}: ${prevW}×${prevH}ft → ${nextW}×${nextH}ft${reason}${ref}`);
  }

  const finalizedPlans = fixedPlans.map((plan, storyIndex) => {
    const rooms = planRooms(plan);
    const origW = planWidth(storyPlans[storyIndex], planRooms(storyPlans[storyIndex]));
    const origD = planDepth(storyPlans[storyIndex], planRooms(storyPlans[storyIndex]));
    const growth = growthByStory.get(storyIndex);
    if (growth) moveRoomsAfterGrowth(rooms, growth);
    return finalizePlan(plan, rooms, origW, origD);
  });

  return { fixedStoryPlans: finalizedPlans, appliedFixes, skipped };
}

export function applyMinimumComplianceFixes(storyPlans = []) {
  const appliedFixes = [];

  const fixedStoryPlans = (storyPlans || []).map((plan) => {
    const origRooms = planRooms(plan);
    const origW = planWidth(plan, origRooms);
    const origD = planDepth(plan, origRooms);
    const rooms = origRooms.map((r) => ({ ...r }));
    const growthMap = new Map();

    rooms.forEach((room, roomIndex) => {
      const mins = IRC_MINS[roomType(room)];
      if (!mins) return;

      let w = roomW(room);
      let h = roomH(room);
      const prevW = w;
      const prevH = h;

      if (w < mins.minW) w = mins.minW;
      if (h < mins.minH) h = mins.minH;
      if (mins.minArea > 0 && w * h < mins.minArea) {
        const scale = Math.sqrt(mins.minArea / (w * h));
        w = Math.ceil(w * scale);
        h = Math.ceil(h * scale);
      }

      if (w === prevW && h === prevH) return;

      setRoomSize(room, w, h);
      growthMap.set(roomIndex, {
        dw: w - prevW,
        dh: h - prevH,
        oldRight: asNumber(room.x, 0) + prevW,
        oldBottom: asNumber(room.y, 0) + prevH,
      });
      appliedFixes.push(`Resized ${roomLabel(room)} from ${prevW}×${prevH} ft to ${w}×${h} ft`);
    });

    moveRoomsAfterGrowth(rooms, growthMap);
    return finalizePlan(plan, rooms, origW, origD);
  });

  return { fixedStoryPlans, appliedFixes };
}

function violationText(violation) {
  if (typeof violation === "string") return violation;
  return [
    violation?.name,
    violation?.rule,
    violation?.message,
    violation?.description,
    violation?.explanation,
    violation?.code_reference,
    violation?.location_reference,
  ].filter(Boolean).join(" ");
}

export function collectComplianceViolations(data, ceilingHeightFt = 9) {
  const fromChecks = (data?.checks || []).filter((c) => c.status === "FAIL" || c.status === "WARNING");
  const fromRag = data?.violations || [];
  const seen = new Set();

  return [...fromChecks, ...fromRag].filter((v) => {
    const text = violationText(v);
    const key = `${v?.name || v?.rule || ""}|${text}`;
    if (seen.has(key)) return false;
    seen.add(key);

    if (ceilingHeightFt >= 7 && text.toLowerCase().includes("ceiling")) return false;
    return true;
  });
}

export function filterManualComplianceViolations(violations = [], unfixable = []) {
  const manual = [];
  const seen = new Set();

  function add(v) {
    const explanation = typeof v === "string" ? v : (v?.explanation || v?.message || v?.description || v?.rule || "");
    const item = typeof v === "string"
      ? { name: "Manual Review Required", status: "ADVISORY", explanation }
      : { ...v, status: "ADVISORY", name: v?.name || v?.rule || "Manual Review Required" };
    const key = `${item.name}|${item.explanation || item.message || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    manual.push(item);
  }

  (violations || []).forEach((v) => {
    const text = violationText(v).toLowerCase();
    if (MANUAL_REVIEW_KEYWORDS.some((kw) => text.includes(kw))) add(v);
  });

  (unfixable || []).forEach((v) => {
    const text = violationText(v);
    if (!text || /api key|fix generation failed/i.test(text)) return;
    add(v);
  });

  return manual;
}
