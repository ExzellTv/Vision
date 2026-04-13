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

function coerceAndValidate(rawPlan) {
  if (!rawPlan) return null;
  const coerced = coerceVisionFloorPlan(rawPlan);
  if (!coerced || !coerced.rooms || coerced.rooms.length === 0) return null;
  const result = validateFloorPlan(coerced);
  return result.success ? result.data : coerced;
}

export default function PlanHouse({ plan, stories, wallColor, roofColor }) {
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
      const partialRoofRects = nextStory
        ? computeUncoveredByUpperStory(story.rooms, nextStory.rooms)
        : null;

      try {
        return buildHouseGeometry(story, {
          includeFoundation: i === 0,
          includeRoof: i === top,
          partialRoofRects,
          sharedCenter,
          wallColor,
          roofColor,
        });
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[Vision] buildHouseGeometry failed:", err);
        return [];
      }
    });
  }, [validStories, wallColor, roofColor]);

  // Dispose geometry on plan change / unmount to avoid GPU memory leaks.
  useEffect(() => {
    return () => storyItems.forEach((items) => disposeHouseGeometry(items));
  }, [storyItems]);

  if (validStories.length === 0 || storyItems.length === 0) return null;

  return (
    <>
      {storyItems.map((items, storyIdx) => (
        <group key={storyIdx} position={[0, storyIdx * STORY_HEIGHT_WORLD, 0]}>
          {items.map((item) => (
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
