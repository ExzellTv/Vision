import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { DEMO_PROJECT } from "../data/demoProject";

/**
 * Shared project state across all Tier 1 screens.
 * Whatever is generated in the Develop tab persists through Edit,
 * Feasibility, Structural, Executive, and Schedule.
 */
const ProjectContext = createContext(null);

/* ── localStorage persistence ─────────────────────────────────────────────── */
const PERSIST_KEY = "vision:project:v1";

function readPersistedProject() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Restore if we have a floor plan OR a saved project location.
    if (!parsed?.floorPlan?.rooms?.length && !parsed?.projectLocation) return null;
    return parsed;
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[Vision] Failed to read persisted project:", err);
    return null;
  }
}

function writePersistedProject(project) {
  try {
    // Persist as soon as we have a location OR a floor plan — whichever comes first.
    // This ensures projectLocation survives navigation before a floor plan is generated.
    if (!project?.floorPlan?.rooms?.length && !project?.projectLocation) return;
    localStorage.setItem(PERSIST_KEY, JSON.stringify(project));
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[Vision] Failed to persist project:", err);
  }
}

function clearPersistedProject() {
  try {
    localStorage.removeItem(PERSIST_KEY);
  } catch {
    /* ignore */
  }
}

/* ── Normalize API variant to canvas format ── */
function normalizeVariant(v, params) {
  if (!v) return v;
  const dims = v.dimensions || {};
  const normalizeCanvasItem = (item) => ({
    ...item,
    x: item.x ?? 0,
    y: item.y ?? 0,
    w: item.width ?? item.w ?? 10,
    h: item.depth ?? item.h ?? 10,
  });
  const rooms = (v.rooms || []).map((r) => ({
    ...normalizeCanvasItem(r),
    type: mapRoomType(r.type, r.label),
    label: r.label || r.type,
    bearing: r.bearing || inferBearing(r, dims),
  }));
  const restoredPlacedItems = Array.isArray(v.placed_items) ? v.placed_items.map(normalizeCanvasItem) : [];
  const placedItems = restoredPlacedItems.length > 0 && !restoredPlacedItems.some((item) => item.isRoom)
    ? [
        ...rooms.map((room, i) => ({ id: room.id || `room-${v.id || "plan"}-${i}`, isRoom: true, ...room })),
        ...restoredPlacedItems,
      ]
    : restoredPlacedItems;
  const measuredWidth = rooms.length > 0 ? Math.max(...rooms.map((r) => (r.x ?? 0) + (r.w ?? 0))) : 40;
  const measuredDepth = rooms.length > 0 ? Math.max(...rooms.map((r) => (r.y ?? 0) + (r.h ?? 0))) : 40;

  return {
    ...v,
    id: v.id || `v-${Date.now()}`,
    width: v.width ?? dims.footprint_width ?? measuredWidth,
    depth: v.depth ?? dims.footprint_depth ?? measuredDepth,
    rooms,
    doors: v.doors || [],
    windows: v.windows || [],
    walls: v.walls || [],
    placed_items: placedItems,
    totalSF: v.totalSF ?? dims.total_sf ?? rooms.reduce((s, r) => s + r.w * r.h, 0),
    score: v.score ?? 0,
    stories: v.stories ?? params?.stories ?? 1,
    style: v.style ?? params?.style ?? "Ranch",
    score_breakdown: v.score_breakdown,
    perimeter: v.perimeter ?? dims.perimeter,
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

/* ── Default building context for structural intelligence ── */
const DEFAULT_BUILDING_CONTEXT = {
  span_ft: 24,
  stories: 2,
  total_sf: 2200,
  foundation_type: "slab_on_grade",
  framing_material: "Wood SPF",
  section: "W14x22",
  Ix_in4: 199,
  Sx_in3: 29.0,
  Zx_in3: 33.2,
  Fy_ksi: 50,
  dead_load_psf: 25,
  live_load_psf: 40,
  snow_load_psf: 5,
  max_moment_kip_ft: 18.4,
  max_shear_kips: 12.2,
  max_deflection_in: 0.78,
  footing_area_ft2: 4.0,
  total_reaction_lbs: 8500,
  story_drift_ratio: 0.018,
  sci_score: 6.2,
};

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
  const [projectId, setProjectId] = useState(null);           // MongoDB _id after first save
  const [buildingContext, setBuildingContextRaw] = useState(DEFAULT_BUILDING_CONTEXT);
  const [savedSchedule, setSavedSchedule] = useState(null);   // persisted schedule from MongoDB
  const [projectLocation, setProjectLocation] = useState(null); // { city, state } — set at project creation, never touched by FloorPlanEditor
  const [ragViolations, setRagViolations] = useState([]);      // RAG compliance violations from StructuralIntelligence
  const [ragChecked, setRagChecked] = useState(false);         // true once compliance check has run for current plan
  const [ragAllResolved, setRagAllResolved] = useState(false); // true once user resolved all compliance issues
  const [demoLoaded, setDemoLoaded] = useState(false);        // prevent double-load

  const setBuildingContext = useCallback((updates) => {
    setBuildingContextRaw((prev) => ({ ...prev, ...updates }));
  }, []);

  /* Auto-load on first mount:
   *   1. If user has a persisted plan in localStorage → restore it.
   *   2. Otherwise → load the demo project so gallery visitors see a house. */
  useEffect(() => {
    if (demoLoaded) return;
    setDemoLoaded(true);

    const saved = readPersistedProject();
    const src = saved || DEMO_PROJECT;
    const srcParams = src.generateParams || null;
    const normalizedStoryPlans = (src.storyPlans || []).map((p) => normalizeVariant(p, srcParams));
    const normalizedFloorPlan = normalizeVariant(src.floorPlan, srcParams) || normalizedStoryPlans[0] || null;

    setProjectName(src.projectName || "New Project");
    setFloorPlanRaw(normalizedFloorPlan);
    setStoryPlansRaw(normalizedStoryPlans);
    setGenerateParams(srcParams);
    setMaterials(src.materials || []);
    setBuildingContextRaw({ ...DEFAULT_BUILDING_CONTEXT, ...(src.buildingContext || {}) });
    setMaxStep(src === DEMO_PROJECT ? 5 : (src.maxStep ?? 5));
    setProjectLocation(src.projectLocation || null);
    if (saved?.projectId) setProjectId(saved.projectId);
    if (saved?.ragViolations) setRagViolations(saved.ragViolations);
    if (saved?.ragChecked) setRagChecked(saved.ragChecked);
    if (saved?.ragAllResolved) setRagAllResolved(saved.ragAllResolved);
  }, [demoLoaded]);

  /* Persist user's plan whenever it changes — so hard-refresh doesn't revert
   * to the demo. Skips until the first mount has loaded initial state. */
  useEffect(() => {
    if (!demoLoaded) return;
    writePersistedProject({
      projectName,
      floorPlan,
      storyPlans,
      generateParams,
      materials,
      buildingContext,
      maxStep,
      projectLocation,
      projectId,
      ragViolations,
      ragChecked,
      ragAllResolved,
    });
  }, [demoLoaded, projectName, floorPlan, storyPlans, generateParams, materials, buildingContext, maxStep, projectLocation, projectId, ragViolations, ragChecked, ragAllResolved]);

  /* Force an immediate localStorage write — used when the caller has just
   * queued a state update (e.g. setStoryPlans) but wants the new values
   * persisted right now rather than waiting for the next useEffect cycle.
   * Pass the changed keys in `overrides`; everything else comes from the
   * current closure snapshot. */
  const persistNow = useCallback((overrides = {}) => {
    writePersistedProject({
      projectName,
      floorPlan,
      storyPlans,
      generateParams,
      materials,
      buildingContext,
      projectId,
      maxStep,
      projectLocation,
      ragViolations,
      ragChecked,
      ragAllResolved,
      ...overrides,
    });
  }, [projectName, floorPlan, storyPlans, generateParams, materials, buildingContext, maxStep, projectLocation, projectId, ragViolations, ragChecked, ragAllResolved]);

  /* Reset entire project state for a clean "new project" flow */
  const resetProject = useCallback(() => {
    clearPersistedProject();
    setProjectName("New Project");
    setFloorPlanRaw(null);
    setAllVariantsRaw([]);
    setGenerateParams(null);
    setStoryPlansRaw([]);
    setFoundationType("slab");
    setMaterialType("wood");
    setMaterials([]);
    setMaxStep(0);
    setProjectId(null);
    setBuildingContextRaw(DEFAULT_BUILDING_CONTEXT);
    setSavedSchedule(null);
    setProjectLocation(null);
    setRagViolations([]);
    setRagChecked(false);
    setRagAllResolved(false);
  }, []);

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
    const arr = (plans || []).map((p) => normalizeVariant(p, generateParams));
    setStoryPlansRaw(arr);
    if (arr.length > 0) setFloorPlanRaw(arr[0]);
  }, [generateParams]);

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
    projectId, setProjectId,
    buildingContext, setBuildingContext,
    savedSchedule, setSavedSchedule,
    projectLocation, setProjectLocation,
    ragViolations, setRagViolations,
    ragChecked, setRagChecked,
    ragAllResolved, setRagAllResolved,
    resetProject,
    persistNow,
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
