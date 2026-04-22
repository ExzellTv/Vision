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
