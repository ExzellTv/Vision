/**
 * PlanHouse — renders a 3D house from the user's actual floor plan JSON.
 *
 * Bridges the pure-Three.js geometry builder (src/lib/buildHouseGeometry.js)
 * into React Three Fiber. Unlike the parametric HouseCSG path, this component:
 *   - Reads the validated plan (rooms, walls, windows, doors)
 *   - Produces per-room floor slabs, interior walls at real room boundaries,
 *     exterior walls with true window/door cutouts (not painted-on frames)
 *   - Places window panes (glass transmission material) inside the cutouts
 *   - Updates automatically when the plan changes
 *
 * Open-source lineage: the wall-cutout approach follows react-planner's
 * "hole" pattern and blueprint3d's wall-segment split. We keep the
 * geometry build in vanilla Three.js so it's testable in isolation.
 */
import { useEffect, useMemo } from "react";
import { coerceVisionFloorPlan, validateFloorPlan } from "../../lib/floorPlanSchema";
import { buildHouseGeometry, disposeHouseGeometry } from "../../lib/buildHouseGeometry";

export default function PlanHouse({ plan }) {
  // Validate + coerce incoming plan. Returns null if unusable; caller
  // should render a fallback in that case.
  const validPlan = useMemo(() => {
    if (!plan) return null;
    const coerced = coerceVisionFloorPlan(plan);
    if (!coerced || !coerced.rooms || coerced.rooms.length === 0) return null;
    const result = validateFloorPlan(coerced);
    return result.success ? result.data : coerced;
  }, [plan]);

  // Build geometry once per plan. Dispose on change / unmount to avoid
  // GPU memory leaks (geometry + materials both released).
  const items = useMemo(() => {
    if (!validPlan) return [];
    try {
      return buildHouseGeometry(validPlan);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[Vision] buildHouseGeometry failed:", err);
      return [];
    }
  }, [validPlan]);

  useEffect(() => {
    return () => disposeHouseGeometry(items);
  }, [items]);

  if (!validPlan || items.length === 0) return null;

  return (
    <group>
      {items.map((item) => (
        <primitive key={item.name} object={item.mesh} />
      ))}
    </group>
  );
}

/** Whether a given plan object has enough structure to drive PlanHouse. */
export function planIsRenderable(plan) {
  if (!plan) return false;
  const coerced = coerceVisionFloorPlan(plan);
  return !!(coerced && coerced.rooms && coerced.rooms.length > 0);
}
