/**
 * planGeometry — interval math + rectilinear polygon utilities for deriving
 * exterior/interior wall segments from a set of axis-aligned room rectangles.
 *
 * Used by buildHouseGeometry.js to support non-rectangular footprints
 * (L, T, U, +). The algorithm is the standard "rectilinear polygon union via
 * edge XOR" — at each horizontal line y=Y, the wall exists where rooms cover
 * the segment on exactly one side (exterior) or both sides (interior).
 *
 * Attribution: same approach used in CGAL's 2D polygon-set operations and in
 * the `polygon-clipping` npm package for rectilinear inputs. Kept inline so
 * we don't add a new dependency for a ~100-line algorithm.
 */

const EPS = 1e-6;

// ── Interval helpers — all operate on sorted non-overlapping [start, end] arrays. ──

/** Merge overlapping/touching intervals into a sorted, disjoint array. */
export function intervalUnion(intervals) {
  if (intervals.length === 0) return [];
  const sorted = intervals.map(x => x.slice()).sort((a, b) => a[0] - b[0]);
  const out = [sorted[0].slice()];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur[0] <= last[1] + EPS) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      out.push(cur.slice());
    }
  }
  return out;
}

/** Intersection of two disjoint-sorted interval sets. */
export function intervalIntersection(a, b) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i][0], b[j][0]);
    const e = Math.min(a[i][1], b[j][1]);
    if (s + EPS < e) out.push([s, e]);
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return out;
}

/** Set difference a - b (sorted-disjoint inputs → sorted-disjoint output). */
export function intervalDifference(a, b) {
  const out = [];
  for (const [s, e] of a) {
    let segs = [[s, e]];
    for (const [bs, be] of b) {
      const next = [];
      for (const [ss, ee] of segs) {
        if (be <= ss + EPS || bs >= ee - EPS) {
          next.push([ss, ee]);
        } else {
          if (bs > ss + EPS) next.push([ss, bs]);
          if (be < ee - EPS) next.push([be, ee]);
        }
      }
      segs = next;
    }
    out.push(...segs);
  }
  return out;
}

/** Symmetric difference (XOR): (a - b) ∪ (b - a). */
export function intervalXor(a, b) {
  return intervalUnion([...intervalDifference(a, b), ...intervalDifference(b, a)]);
}

// ── Wall classification ──────────────────────────────────────────────────────

/**
 * Classify walls for a set of axis-aligned rooms {x, y, w, h}.
 *
 * Returns two arrays of wall segments:
 *   exterior: where rooms cover only one side of the line → outward-facing wall.
 *   interior: where rooms cover both sides → wall between two rooms.
 *
 * Each wall segment is { axis, at, from, to, side } where:
 *   axis  ∈ 'h' | 'v'   — horizontal (const y) or vertical (const x)
 *   at    : number       — the y (for 'h') or x (for 'v') the wall sits on
 *   from  : number       — start along its span axis (x for 'h', y for 'v')
 *   to    : number       — end along its span axis
 *   side  ∈ 'top'|'bottom'|'left'|'right' (for exterior) — which way the wall faces
 *           Interior walls use 'interior'.
 *
 * Coordinate convention matches the floor plan: y increases downward (top=0).
 */
export function classifyWalls(rooms) {
  if (!rooms || rooms.length === 0) return { exterior: [], interior: [] };

  // Collect unique Y and X values from room edges.
  const ys = new Set();
  const xs = new Set();
  rooms.forEach(r => {
    ys.add(r.y);
    ys.add(r.y + r.h);
    xs.add(r.x);
    xs.add(r.x + r.w);
  });

  const exterior = [];
  const interior = [];

  // Horizontal walls at each unique Y.
  for (const Y of ys) {
    const aboveIntervals = []; // rooms whose bottom edge is AT Y (room spans [y_a, Y] vertically, i.e., Y is room.y + room.h)
    const belowIntervals = []; // rooms whose top edge is AT Y (room spans [Y, y_b], i.e., Y is room.y)
    rooms.forEach(r => {
      if (Math.abs(r.y + r.h - Y) < EPS) aboveIntervals.push([r.x, r.x + r.w]);
      if (Math.abs(r.y - Y) < EPS) belowIntervals.push([r.x, r.x + r.w]);
    });
    const above = intervalUnion(aboveIntervals);
    const below = intervalUnion(belowIntervals);
    // Exterior: rooms on exactly one side (XOR).
    intervalXor(above, below).forEach(([s, e]) => {
      // Face direction: if rooms are above, wall faces down (south) → side='bottom'.
      // If rooms are below, wall faces up (north) → side='top'.
      const roomsAbove = intervalIntersection(above, [[s, e]]).length > 0;
      exterior.push({
        axis: "h", at: Y, from: s, to: e,
        side: roomsAbove ? "bottom" : "top",
      });
    });
    // Interior: rooms on both sides (AND).
    intervalIntersection(above, below).forEach(([s, e]) => {
      interior.push({ axis: "h", at: Y, from: s, to: e, side: "interior" });
    });
  }

  // Vertical walls at each unique X.
  for (const X of xs) {
    const leftIntervals = [];  // rooms whose right edge is AT X (room spans [x_l, X])
    const rightIntervals = []; // rooms whose left edge is AT X (room spans [X, x_r])
    rooms.forEach(r => {
      if (Math.abs(r.x + r.w - X) < EPS) leftIntervals.push([r.y, r.y + r.h]);
      if (Math.abs(r.x - X) < EPS) rightIntervals.push([r.y, r.y + r.h]);
    });
    const left = intervalUnion(leftIntervals);
    const right = intervalUnion(rightIntervals);
    intervalXor(left, right).forEach(([s, e]) => {
      const roomsLeft = intervalIntersection(left, [[s, e]]).length > 0;
      exterior.push({
        axis: "v", at: X, from: s, to: e,
        side: roomsLeft ? "right" : "left",
      });
    });
    intervalIntersection(left, right).forEach(([s, e]) => {
      interior.push({ axis: "v", at: X, from: s, to: e, side: "interior" });
    });
  }

  return { exterior, interior };
}

/**
 * Decompose a rectilinear footprint (union of room rectangles) into a minimal
 * set of non-overlapping rectangles that tile the footprint.
 *
 * Algorithm: horizontal-strip decomposition + vertical merge.
 *   1. For each unique Y band between consecutive room edges, compute the
 *      X-intervals covered by rooms that span that band → set of rects.
 *   2. Merge rectangles that share X-range and are vertically adjacent.
 *
 * Good enough for roof generation on L/T/U/+ footprints. Not a true minimum
 * rectangle cover (NP-hard in general), but optimal for the footprint shapes
 * produced by this app's plans.
 *
 * Returns an array of { x, y, w, h } in plan coords.
 */
export function decomposeFootprintRects(rooms) {
  if (!rooms || rooms.length === 0) return [];

  const ys = Array.from(new Set(rooms.flatMap(r => [r.y, r.y + r.h])))
    .sort((a, b) => a - b);

  const strips = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const yTop = ys[i];
    const yBot = ys[i + 1];
    if (yBot - yTop < EPS) continue;

    const roomsInStrip = rooms.filter(
      r => r.y <= yTop + EPS && r.y + r.h >= yBot - EPS
    );
    if (roomsInStrip.length === 0) continue;

    const xIntervals = intervalUnion(
      roomsInStrip.map(r => [r.x, r.x + r.w])
    );
    xIntervals.forEach(([xStart, xEnd]) => {
      strips.push({ x: xStart, y: yTop, w: xEnd - xStart, h: yBot - yTop });
    });
  }

  // Merge strips that share x,w and are vertically adjacent.
  const merged = [];
  const used = new Set();
  for (let i = 0; i < strips.length; i++) {
    if (used.has(i)) continue;
    const cur = { ...strips[i] };
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < strips.length; j++) {
        if (i === j || used.has(j)) continue;
        const o = strips[j];
        if (
          Math.abs(o.x - cur.x) < EPS &&
          Math.abs(o.w - cur.w) < EPS &&
          Math.abs(cur.y + cur.h - o.y) < EPS
        ) {
          cur.h += o.h;
          used.add(j);
          changed = true;
        }
      }
    }
    used.add(i);
    merged.push(cur);
  }
  return merged;
}

/**
 * For a given rectangle in a set of rectilinear rectangles, report which of
 * its four edges are shared with another rectangle (i.e. their spans overlap
 * along the shared axis). Used by roof generation to suppress overhangs on
 * edges where two roof sections meet — the two roofs then join cleanly at a
 * valley instead of overlapping across the boundary.
 *
 * Returns { n: bool, s: bool, e: bool, w: bool } where n is the rect's min-Y
 * edge, s is max-Y, w is min-X, e is max-X.
 */
export function edgeSharing(rect, allRects) {
  const share = { n: false, s: false, e: false, w: false };
  for (const o of allRects) {
    if (o === rect) continue;
    const xOverlap = o.x + o.w > rect.x + EPS && o.x < rect.x + rect.w - EPS;
    const yOverlap = o.y + o.h > rect.y + EPS && o.y < rect.y + rect.h - EPS;
    if (Math.abs(o.y + o.h - rect.y) < EPS && xOverlap) share.n = true;
    if (Math.abs(rect.y + rect.h - o.y) < EPS && xOverlap) share.s = true;
    if (Math.abs(o.x + o.w - rect.x) < EPS && yOverlap) share.w = true;
    if (Math.abs(rect.x + rect.w - o.x) < EPS && yOverlap) share.e = true;
  }
  return share;
}

/**
 * For a cross-gable roof (a rect whose ridge was rotated 90° to face a
 * neighbor), compute how far to extend each of its sides *past* the shared
 * edge. Result: the gable's tip sits on the neighbor's ridge line, so the
 * two roofs meet peak-to-peak (the standard ridge-to-ridge junction).
 *
 * Returns { n, s, e, w } in feet — extension distances to add to each side.
 *
 * Math: the neighbor's ridge runs along its longer dimension; it sits at
 * the neighbor's center along its shorter dimension. So the gable of this
 * rect (which faces the shared edge) needs to extend by `neighborShortDim/2`
 * past its own wall to reach that ridge line.
 */
export function crossGableExtensions(rect, shares, rects, ridgeAlongX) {
  const ext = { n: 0, s: 0, e: 0, w: 0 };
  const naturalRidgeAlongX = rect.w >= rect.h;
  const wasRotated = ridgeAlongX !== naturalRidgeAlongX;
  if (!wasRotated) return ext;

  const findNeighbor = (side) => rects.find(o => {
    if (o === rect) return false;
    const xOv = o.x + o.w > rect.x + EPS && o.x < rect.x + rect.w - EPS;
    const yOv = o.y + o.h > rect.y + EPS && o.y < rect.y + rect.h - EPS;
    if (side === "n") return Math.abs(o.y + o.h - rect.y) < EPS && xOv;
    if (side === "s") return Math.abs(rect.y + rect.h - o.y) < EPS && xOv;
    if (side === "w") return Math.abs(o.x + o.w - rect.x) < EPS && yOv;
    return Math.abs(rect.x + rect.w - o.x) < EPS && yOv; // e
  });

  (["n", "s", "e", "w"]).forEach(side => {
    if (!shares[side]) return;
    const nb = findNeighbor(side);
    if (!nb) return;
    ext[side] = Math.min(nb.w, nb.h) / 2; // feet
  });
  return ext;
}

/**
 * Find the exterior wall segment that actually fits a given opening, else null.
 *
 *   opening.side  ∈ 'top'|'bottom'|'left'|'right'  — the side the user picked
 *   opening.x, y  — position of the opening center in plan coords
 *   opening.width — span along the wall
 *
 * Strict: the opening must fall inside a wall whose coordinate matches
 * (within tolerance) the opening's position. Returns null otherwise —
 * callers should drop the opening, which silently removes stale openings
 * that no longer correspond to any wall after a plan edit.
 */
export function findWallForOpening(walls, opening, tolerance = 0.75) {
  const axis = (opening.side === "top" || opening.side === "bottom") ? "h" : "v";
  const candidates = walls.filter(w => w.axis === axis && w.side === opening.side);
  if (candidates.length === 0) return null;

  // For horizontal walls, span axis is X: opening.x must lie inside [from, to];
  // wall.at is the Y — must be close to opening.y.
  // For vertical walls, span axis is Y: opening.y must lie inside [from, to];
  // wall.at is the X — must be close to opening.x.
  const pos       = axis === "h" ? opening.x : opening.y;
  const wallCoord = axis === "h" ? opening.y : opening.x;
  const halfWidth = (opening.width || 0) / 2;

  // Step 1: walls whose span contains the opening.
  const containing = candidates.filter(
    w => w.from <= pos - halfWidth + EPS && w.to >= pos + halfWidth - EPS
  );
  if (containing.length === 0) return null;

  // Step 2: wall with the nearest `at` coordinate to the opening's cross-axis position.
  containing.sort((a, b) => Math.abs(a.at - wallCoord) - Math.abs(b.at - wallCoord));
  const best = containing[0];

  // Step 3: reject if the nearest wall is still further than tolerance away.
  // This catches openings that belong to a wall that was deleted/moved.
  if (Math.abs(best.at - wallCoord) > tolerance) return null;

  return best;
}
