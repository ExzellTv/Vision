import { createContext, useContext, useState, useCallback } from "react";

/**
 * Shared project state across all Tier 1 screens.
 * Whatever is generated in the Develop tab persists through Edit,
 * Feasibility, Structural, Executive, and Schedule.
 */
const ProjectContext = createContext(null);

/* ── Normalize API variant to canvas format ── */
function normalizeVariant(v, params) {
  if (!v) return v;
  // Already in local format (has .w on rooms)
  if (v.rooms?.[0]?.w !== undefined) return v;

  const dims = v.dimensions || {};
  const rooms = (v.rooms || []).map((r) => ({
    type: mapRoomType(r.type, r.label),
    label: r.label || r.type,
    x: r.x ?? 0,
    y: r.y ?? 0,
    w: r.width ?? r.w ?? 10,
    h: r.depth ?? r.h ?? 10,
    bearing: r.bearing || inferBearing(r, dims),
  }));

  return {
    id: v.id || `v-${Date.now()}`,
    width: dims.footprint_width ?? Math.max(...rooms.map((r) => r.x + r.w), 40),
    depth: dims.footprint_depth ?? Math.max(...rooms.map((r) => r.y + r.h), 40),
    rooms,
    doors: v.doors || [],
    windows: v.windows || [],
    walls: v.walls || [],
    totalSF: dims.total_sf ?? rooms.reduce((s, r) => s + r.w * r.h, 0),
    score: v.score ?? 0,
    stories: params?.stories ?? 1,
    style: params?.style ?? "Ranch",
    score_breakdown: v.score_breakdown,
    perimeter: dims.perimeter,
  };
}

/* Map API room types to canvas color keys */
function mapRoomType(type, label = "") {
  const t = (type || "").toLowerCase();
  const l = (label || "").toLowerCase();
  if (t === "master" || t === "master_bedroom") {
    if (l.includes("bath")) return "bathroom";
    return "bedroom";
  }
  if (t === "secondary" || t === "secondary_bedroom") return "bedroom";
  if (t === "master_bathroom" || t === "bathroom") return "bathroom";
  if (t === "garage_2car" || t === "garage_1car" || t === "garage") return "garage";
  if (t === "living_room" || t === "living") return "living";
  if (t === "dining_room" || t === "dining") return "dining";
  if (t === "kitchen") return "kitchen";
  if (t === "hallway" || t === "hall") return "hallway";
  if (t === "closet") return "closet";
  if (t === "laundry") return "laundry";
  if (t === "entry") return "entry";
  return t;
}

/* Infer bearing walls: exterior edges are bearing */
function inferBearing(room, dims) {
  const fpW = dims.footprint_width || 999;
  const fpD = dims.footprint_depth || 999;
  const x = room.x ?? 0;
  const y = room.y ?? 0;
  const w = room.width ?? room.w ?? 0;
  const h = room.depth ?? room.h ?? 0;
  return [
    y < 1,                    // top
    x + w >= fpW - 1,         // right
    y + h >= fpD - 1,         // bottom
    x < 1,                    // left
  ];
}

export function ProjectProvider({ children }) {
  // Core shared state
  const [projectName, setProjectName] = useState("New Project");
  const [floorPlan, setFloorPlanRaw] = useState(null);       // active normalized variant (story 1)
  const [allVariants, setAllVariantsRaw] = useState([]);      // all generated variants
  const [generateParams, setGenerateParams] = useState(null); // params used to generate
  const [storyPlans, setStoryPlansRaw] = useState([]);        // one floor plan per story
  const [foundationType, setFoundationType] = useState("slab");
  const [materialType, setMaterialType] = useState("wood");
  const [materials, setMaterials] = useState([]);             // 7-layer material selections
  const [maxStep, setMaxStep] = useState(0);                  // furthest step reached (0-5)

  /* Wrap setters to normalize API data */
  const setFloorPlan = useCallback((plan) => {
    setFloorPlanRaw((prev) => normalizeVariant(plan, generateParams) ?? prev);
  }, [generateParams]);

  const setAllVariants = useCallback((variants, params) => {
    if (params) setGenerateParams(params);
    const normalized = (variants || []).map((v) => normalizeVariant(v, params));
    setAllVariantsRaw(normalized);
    if (normalized.length > 0) {
      setFloorPlanRaw(normalized[0]);
    }
  }, []);

  const selectVariant = useCallback((index) => {
    setFloorPlanRaw((prev) => {
      const v = allVariants[index];
      return v ?? prev;
    });
  }, [allVariants]);

  // storyPlans setter — saves one floor plan per story and syncs floorPlan to story 1
  const setStoryPlans = useCallback((plans) => {
    const arr = plans || [];
    setStoryPlansRaw(arr);
    if (arr.length > 0) setFloorPlanRaw(arr[0]);
  }, []);

  /* Derived values used across screens */
  const totalSF = floorPlan?.totalSF || generateParams?.targetSF || 2200;
  const stories = storyPlans.length > 0 ? storyPlans.length : (floorPlan?.stories || generateParams?.stories || 1);
  const footprintWidth = floorPlan?.width || 44;
  const footprintDepth = floorPlan?.depth || 50;

  const value = {
    projectName, setProjectName,
    floorPlan, setFloorPlan,
    allVariants, setAllVariants,
    selectVariant,
    generateParams, setGenerateParams,
    storyPlans, setStoryPlans,
    foundationType, setFoundationType,
    materialType, setMaterialType,
    materials, setMaterials,
    maxStep, setMaxStep,
    // Derived
    totalSF, stories, footprintWidth, footprintDepth,
    normalizeVariant,
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within <ProjectProvider>");
  return ctx;
}

export { normalizeVariant, mapRoomType };
