/**
 * PlanHouse — renders a 3D house from the user's actual floor plan JSON,
 * with optional multi-story stacking.
 *
 * Single-story flow: pass `plan`.
 * Multi-story flow:  pass `stories` (array of per-story floor plans). Each
 *                    story is rendered at y = i * STORY_HEIGHT_WORLD.
 *
 * Multi-story details:
 *   - All stories share the same origin, computed from the combined bounding
 *     box of every story's rooms, so an upper story that is smaller or offset
 *     stays in its actual plan position instead of being re-centered.
 *   - Foundation is emitted only on story 0.
 *   - Topmost story gets the gable roof (via buildRoof).
 *   - Any lower story emits a flat partial roof over rectangles NOT covered
 *     by the story above — so if upstairs is smaller, the exposed downstairs
 *     ceiling still has a roof.
 */
import { useEffect, useMemo } from "react";
import { coerceVisionFloorPlan, validateFloorPlan } from "../../lib/floorPlanSchema";
import {
  buildHouseGeometry,
  disposeHouseGeometry,
  computeSharedCenter,
  computeUncoveredByUpperStory,
  STORY_HEIGHT_WORLD,
} from "../../lib/buildHouseGeometry";
import { generatePillars } from "../../lib/structuralSupport";

function coerceAndValidate(rawPlan) {
  if (!rawPlan) return null;
  const coerced = coerceVisionFloorPlan(rawPlan);
  if (!coerced || !coerced.rooms || coerced.rooms.length === 0) return null;
  const result = validateFloorPlan(coerced);
  return result.success ? result.data : coerced;
}

export default function PlanHouse({
  plan, stories, wallColor, roofColor,
  showRoof = true, showPillars = true,
  // `layerProgress` is either null (render everything) or a Record<string, number in [0, 1]>
  // mapping geometry-layer tag → how much of that layer is "built". 1 = every mesh in
  // the layer is shown; 0 (or missing) = none are shown. Values in between reveal the
  // first ceil(N * progress) meshes in emission order, so within a construction phase
  // the user sees walls/roof pieces/etc. pop in piece-by-piece.
  layerProgress = null,
}) {
  // Normalize into an array of valid story plans. `stories` wins if provided.
  const validStories = useMemo(() => {
    const raw = Array.isArray(stories) && stories.length > 0 ? stories : (plan ? [plan] : []);
    return raw.map(coerceAndValidate).filter(Boolean);
  }, [plan, stories]);

  // Build geometry once per story. A shared center keeps every story aligned
  // to the same origin so offsets between stories survive into the 3D view.
  const storyItems = useMemo(() => {
    if (validStories.length === 0) return [];
    const sharedCenter = computeSharedCenter(validStories);
    const top = validStories.length - 1;

    return validStories.map((story, i) => {
      const nextStory = i < top ? validStories[i + 1] : null;
      const partialRoofRects = (showRoof && nextStory)
        ? computeUncoveredByUpperStory(story.rooms, nextStory.rooms)
        : null;

      // Pillars only emit on story 0, supporting whatever 2nd floor sits above.
      const pillars = (i === 0 && nextStory)
        ? generatePillars(story, nextStory, story.style, story.wallHeight || 9)
        : null;

      try {
        return buildHouseGeometry(story, {
          includeFoundation: i === 0,
          includeRoof: showRoof && i === top,
          partialRoofRects,
          sharedCenter,
          wallColor,
          roofColor,
          pillars,
          showPillars,
        });
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[Vision] buildHouseGeometry failed:", err);
        return [];
      }
    });
  }, [validStories, wallColor, roofColor, showRoof, showPillars]);

  // Dispose geometry on plan change / unmount to avoid GPU memory leaks.
  useEffect(() => {
    return () => storyItems.forEach((items) => disposeHouseGeometry(items));
  }, [storyItems]);

  if (validStories.length === 0 || storyItems.length === 0) return null;

  // Per-layer staged reveal. When `layerProgress` is null the whole house renders
  // unchanged. When it is an object, each layer's meshes are shown in emission order
  // up to ceil(count * progress) — so mid-phase you see part of the walls up, part of
  // the roof installed, etc. A layer missing from the map is hidden entirely.
  const filterItems = (items) => {
    if (!layerProgress || typeof layerProgress !== "object") return items;
    // Bucket the item indices per layer so we can compute a reveal cutoff per layer.
    const byLayer = new Map();
    items.forEach((it, i) => {
      if (!byLayer.has(it.layer)) byLayer.set(it.layer, []);
      byLayer.get(it.layer).push(i);
    });
    const keep = new Set();
    byLayer.forEach((indices, layer) => {
      const p = Math.max(0, Math.min(1, layerProgress[layer] ?? 0));
      if (p <= 0) return;
      const n = Math.min(indices.length, Math.ceil(indices.length * p));
      for (let k = 0; k < n; k++) keep.add(indices[k]);
    });
    return items.filter((_, i) => keep.has(i));
  };

  return (
    <>
      {storyItems.map((items, storyIdx) => (
        <group key={storyIdx} position={[0, storyIdx * STORY_HEIGHT_WORLD, 0]}>
          {filterItems(items).map((item) => (
            <primitive key={item.name} object={item.mesh} />
          ))}
        </group>
      ))}
    </>
  );
}

/** Whether a given plan (or story list) has enough structure to drive PlanHouse. */
export function planIsRenderable(plan, stories) {
  const list = Array.isArray(stories) && stories.length > 0 ? stories : [plan];
  return list.some((p) => {
    if (!p) return false;
    const coerced = coerceVisionFloorPlan(p);
    return !!(coerced && coerced.rooms && coerced.rooms.length > 0);
  });
}
