import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { colors, fonts, card, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import { useUserType } from "../../context/UserTypeContext";
import House3D from "../../components/3d/House3D";
import { imageApi } from "../../services/api";

const RENDER_STYLES = [
  { key: "modern exterior", label: "Modern" },
  { key: "contemporary",    label: "Contemporary" },
  { key: "traditional",     label: "Traditional" },
  { key: "minimalist",      label: "Minimalist" },
  { key: "luxury",          label: "Luxury" },
  { key: "craftsman",       label: "Craftsman" },
];
import { validateStructure } from "../../lib/structuralValidator";
import { autoFixStoryPlans } from "../../lib/autoFix";
import { read3DPrefs, write3DPrefs, resolveHouseColors } from "../../lib/housePrefs";

/**
 * House3DPreview - Modern 3D house preview screen
 * Uses React Three Fiber for enhanced visualization
 */

const ROOF_TYPES = [
  { key: "gable", label: "Gable" },
  { key: "hip", label: "Hip" },
  { key: "flat", label: "Flat" },
];

const WALL_MATERIALS = [
  { key: "vinyl", label: "Vinyl Siding", color: "#e8e2da" },
  { key: "brick", label: "Brick", color: "#8b4513" },
  { key: "stone", label: "Stone", color: "#8a9bb0" },
  { key: "stucco", label: "Stucco", color: "#f5f0e8" },
  { key: "wood", label: "Wood", color: "#8b6f47" },
];

const ROOF_MATERIALS = [
  { key: "asphaltShingle", label: "Asphalt Shingle", color: "#3a3a3a" },
  { key: "metalRoof", label: "Metal", color: "#5a6570" },
  { key: "tile", label: "Tile", color: "#8b4513" },
  { key: "slate", label: "Slate", color: "#4a5568" },
];

// Most common residential exterior colors (white, cream, beige, gray family).
const COLOR_SWATCHES = [
  { name: "Classic White",  hex: "#F5F0E8" },
  { name: "Cream",          hex: "#EFE6D2" },
  { name: "Warm Beige",     hex: "#D4B896" },
  { name: "Greige",         hex: "#B2A898" },
  { name: "Light Gray",     hex: "#C8CDD4" },
  { name: "Charcoal",       hex: "#3A3E45" },
];


// Shared uppercase label used for each section header in the right panel.
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: colors.textDim,
      marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

export default function House3DPreview() {
  const navigate = useNavigate();
  const project = useProject();
  const { isHomeowner, isBuilder } = useUserType();

  // House configuration — initialised through the shared resolver so prefs
  // from a previous visit win, then project materials, then defaults. This is
  // the same resolution every other <House3D> consumer uses, which keeps the
  // schedule 3D viewer and the builder dashboard in sync with whatever the
  // user picks here.
  const _prefs = read3DPrefs();
  const _initial = resolveHouseColors({ materials: project.materials });
  const [roofType,     setRoofType]     = useState(_prefs.roofType     ?? "gable");
  const [wallMaterial, setWallMaterial] = useState(_initial.wallMaterial);
  const [roofMaterial, setRoofMaterial] = useState(_initial.roofMaterial);
  const [wallColor,    setWallColor]    = useState(_initial.wallColor);
  const [roofColor,    setRoofColor]    = useState(_initial.roofColor);

  // Persist prefs whenever any of them change so every other screen resolves
  // to the same colors on next read.
  useEffect(() => {
    write3DPrefs({ roofType, wallMaterial, roofMaterial, wallColor, roofColor });
  }, [roofType, wallMaterial, roofMaterial, wallColor, roofColor]);
  // Cutaway view: hide the roof (and upper floors optionally) to peek inside.
  const [showRoof, setShowRoof] = useState(true);
  const [focusedStory, setFocusedStory] = useState(null); // null = all stories
  // Structural overlays and validation state.
  const [showPillars, setShowPillars] = useState(true);
  const [undoSnapshot, setUndoSnapshot] = useState(null);    // pre-autofix plans
  const [appliedFixes, setAppliedFixes] = useState([]);      // log after autofix
  const [showFixBanner, setShowFixBanner] = useState(false); // green banner
  const [fixesOpen, setFixesOpen] = useState(false);         // collapsible log
  const [ragNotesOpen, setRagNotesOpen] = useState(false);   // code compliance toggle
  // Environment + drag-to-edit were previously user-toggleable. Both now
  // default on/off so the right panel stays focused on style + color.

  // Screenshot + AI render state
  const viewportRef = useRef(null);
  const [aiStyle, setAiStyle] = useState("modern exterior");
  const [aiRendering, setAiRendering] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);

  const captureScreenshot = useCallback(() => {
    const canvas = viewportRef.current?.querySelector("canvas");
    if (!canvas) return null;
    return canvas.toDataURL("image/png");
  }, []);

  const handleAiRender = useCallback(async () => {
    const screenshot = captureScreenshot();
    if (!screenshot) return;
    setAiRendering(true);
    setAiError(null);
    setAiResult(null);
    try {
      const result = await imageApi.renderWithFlux(screenshot, aiStyle);
      setAiResult(result);
    } catch (err) {
      setAiError(err.message || "Render failed");
    } finally {
      setAiRendering(false);
    }
  }, [captureScreenshot, aiStyle]);

  // Get dimensions from floor plan (footprint dimensions, not lot dimensions)
  // footprintWidth and footprintDepth come from the actual placed rooms
  const width = project.footprintWidth || project.generateParams?.lotWidth || 40;
  const depth = project.footprintDepth || project.generateParams?.lotDepth || 30;
  const stories = project.stories || project.generateParams?.stories || 1;
  const totalSF = project.totalSF || (width * depth * stories);

  // Get the full floor plan with rooms, windows, and doors.
  // storyPlans is the full multi-story array (one plan per story); House3D
  // renders each story stacked via PlanHouse.
  const floorPlan = project.floorPlan;
  const allStoryPlans = project.storyPlans;
  // When the user isolates a single floor, pass only that plan so PlanHouse
  // renders just the interior of that story at ground level.
  const storyPlans = (focusedStory !== null && Array.isArray(allStoryPlans))
    ? [allStoryPlans[focusedStory]].filter(Boolean)
    : allStoryPlans;
  const storyCount = Array.isArray(allStoryPlans) ? allStoryPlans.length : stories;

  // Live structural validation — runs every render but memoized on the
  // plans reference so we don't churn when unrelated UI state flips.
  const validation = useMemo(
    () => validateStructure(allStoryPlans || []),
    [allStoryPlans]
  );
  const blockingViolations = validation.violations.filter((v) => v.severity === "blocking");
  const warningViolations  = validation.violations.filter((v) => v.severity === "warning");
  const canContinue = validation.isValid;

  const handleFixAll = useCallback(() => {
    if (!Array.isArray(allStoryPlans) || allStoryPlans.length === 0) return;
    setUndoSnapshot(allStoryPlans);
    const { fixedStoryPlans, appliedFixes: fixes } = autoFixStoryPlans(allStoryPlans, "all");
    project.setStoryPlans(fixedStoryPlans);
    // Write to localStorage immediately — don't wait for the store's useEffect
    // to fire, in case the user navigates before the next render cycle.
    project.persistNow({ storyPlans: fixedStoryPlans, floorPlan: fixedStoryPlans[0] ?? null });
    setAppliedFixes(fixes);
    setShowFixBanner(true);
    // Auto-hide the success banner after 6s (user can still open "what changed")
    setTimeout(() => setShowFixBanner(false), 6000);
  }, [allStoryPlans, project]);

  const [fixingRag, setFixingRag] = useState(false);
  const handleFixCompliance = useCallback(() => {
    if (!Array.isArray(allStoryPlans) || allStoryPlans.length === 0) return;
    setFixingRag(true);

    try {
      setUndoSnapshot(allStoryPlans);
      const complianceFixes = [];

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

      // Step 1: structural geometry fixes (cantilever, alignment)
      const { fixedStoryPlans: structuralFixed, appliedFixes: structuralFixes } =
        autoFixStoryPlans(allStoryPlans, "all");
      complianceFixes.push(...structuralFixes);

      // Maps raw/variant room types to canonical IRC_MINS keys
      const TYPE_ALIAS = {
        master: "bedroom", master_bedroom: "bedroom",
        secondary: "bedroom", secondary_bedroom: "bedroom",
        bedroom_master: "bedroom", bedroom_secondary: "bedroom",
        master_bath: "bathroom", master_bathroom: "bathroom",
        half_bath: "bathroom", powder_room: "bathroom",
        living_room: "living", family_room: "living",
        dining_room: "dining",
        utility: "laundry", mud_room: "laundry",
        garage_1car: "garage", garage_2car: "garage",
        garage_3car: "garage",
      };

      // Step 2: resize undersized rooms per IRC minimums
      const resizedPlans = structuralFixed.map((plan) => {
        const origW = plan.width  || Math.max(...(plan.rooms || []).map(r => (r.x || 0) + (r.w || 0)), 40);
        const origD = plan.depth  || Math.max(...(plan.rooms || []).map(r => (r.y || 0) + (r.h || 0)), 40);

        // Work on mutable copies so position nudges propagate correctly
        const rooms = (plan.rooms || []).map(r => ({ ...r }));

        // 2a — resize each undersized room; record how much it grew
        const growthMap = new Map(); // index → { dw, dh }
        rooms.forEach((r, i) => {
          const rawType = (r.type || r.label || "").toLowerCase().replace(/[\s\-]+/g, "_");
          const canonical = TYPE_ALIAS[rawType] || rawType;
          const mins = IRC_MINS[canonical];
          if (!mins) return;

          let w = r.w || 0;
          let h = r.h || 0;
          const prevW = w, prevH = h;

          if (w < mins.minW) w = mins.minW;
          if (h < mins.minH) h = mins.minH;
          if (mins.minArea > 0 && w * h < mins.minArea) {
            const s = Math.sqrt(mins.minArea / (w * h));
            w = Math.ceil(w * s);
            h = Math.ceil(h * s);
          }

          if (w !== prevW || h !== prevH) {
            complianceFixes.push(
              `Resized ${r.label || r.type} from ${prevW}×${prevH} ft to ${w}×${h} ft`
            );
            growthMap.set(i, { dw: w - prevW, dh: h - prevH });
          }
          r.w = w; r.h = h; r.width = w; r.depth = h;
        });

        // 2b — push rooms that are in the path of each expanded room
        growthMap.forEach(({ dw, dh }, i) => {
          const grown = rooms[i];
          // original right/bottom edges before growth (room was at grown.x, grown.y with old size)
          const oldRight  = grown.x + (grown.w - (growthMap.get(i)?.dw ?? 0));
          const oldBottom = grown.y + (grown.h - (growthMap.get(i)?.dh ?? 0));

          rooms.forEach((other, j) => {
            if (j === i) return;
            // Room is directly to the right → shift it right by dw
            if (dw > 0 && other.x >= oldRight - 0.5) {
              other.x += dw;
            }
            // Room is directly below → shift it down by dh
            if (dh > 0 && other.y >= oldBottom - 0.5) {
              other.y += dh;
            }
          });
        });

        // 2c — overlap nudge to clean up any remaining collisions (30 iters max)
        for (let iter = 0; iter < 30; iter++) {
          let moved = false;
          for (let i = 0; i < rooms.length; i++) {
            for (let j = i + 1; j < rooms.length; j++) {
              const a = rooms[i], b = rooms[j];
              const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
              const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
              if (ox > 0.1 && oy > 0.1) {
                moved = true;
                if (ox <= oy) b.x += ox;
                else          b.y += oy;
              }
            }
          }
          if (!moved) break;
        }

        // 2d — scale oversized rooms back toward the original footprint
        //      so the house doesn't balloon. IRC-minimum rooms are protected.
        const bboxW = Math.max(...rooms.map(r => r.x + r.w));
        const bboxD = Math.max(...rooms.map(r => r.y + r.h));

        if (bboxW > origW * 1.02 || bboxD > origD * 1.02) {
          const sx = bboxW > origW ? origW / bboxW : 1;
          const sy = bboxD > origD ? origD / bboxD : 1;
          const scale = Math.min(sx, sy);

          if (scale < 0.99) {
            rooms.forEach(r => {
              const rawType = (r.type || "").toLowerCase().replace(/[\s\-]+/g, "_");
              const canonical = TYPE_ALIAS[rawType] || rawType;
              const mins = IRC_MINS[canonical];
              const scaledW = Math.round(r.w * scale * 10) / 10;
              const scaledH = Math.round(r.h * scale * 10) / 10;
              // Only shrink if the room will still meet minimums after scaling
              const safeToScale = !mins ||
                (scaledW >= mins.minW && scaledH >= mins.minH && scaledW * scaledH >= (mins.minArea || 0));
              if (safeToScale) {
                r.x = Math.round(r.x * scale * 10) / 10;
                r.y = Math.round(r.y * scale * 10) / 10;
                r.w = scaledW;
                r.h = scaledH;
                r.width = r.w; r.depth = r.h;
              }
            });
          }
        }

        // Final bounding box — update plan dimensions to actual layout
        const finalW = Math.max(...rooms.map(r => r.x + r.w));
        const finalD = Math.max(...rooms.map(r => r.y + r.h));

        // Step 3: sync placed_items — three-pass matching for robustness
        const usedRoomIdxs = new Set();
        const placedItems = (plan.placed_items || []).map((item) => {
          if (!item.isRoom) return item;

          // Pass 1: type + label exact match
          let matchIdx = rooms.findIndex((r, idx) =>
            !usedRoomIdxs.has(idx) &&
            r.type === item.type &&
            (r.label === item.label || r.label === item.name)
          );
          // Pass 2: type + loose label (case-insensitive)
          if (matchIdx === -1) {
            const itemLabel = (item.label || item.name || "").toLowerCase();
            matchIdx = rooms.findIndex((r, idx) =>
              !usedRoomIdxs.has(idx) &&
              r.type === item.type &&
              (r.label || "").toLowerCase() === itemLabel
            );
          }
          // Pass 3: same type, closest by original position
          if (matchIdx === -1) {
            let bestDist = Infinity;
            rooms.forEach((r, idx) => {
              if (usedRoomIdxs.has(idx) || r.type !== item.type) return;
              const d = Math.hypot((r.x - item.x) || 0, (r.y - item.y) || 0);
              if (d < bestDist) { bestDist = d; matchIdx = idx; }
            });
          }

          if (matchIdx !== -1) {
            usedRoomIdxs.add(matchIdx);
            const m = rooms[matchIdx];
            return { ...item, w: m.w, h: m.h, x: m.x, y: m.y, width: m.w, depth: m.h };
          }
          return item;
        });

        return { ...plan, rooms, placed_items: placedItems, width: finalW, depth: finalD };
      });

      // Step 5: keep manual-only violations visible (egress, zoning, fire)
      const MANUAL_KEYWORDS = ["egress", "window", "setback", "zoning", "fire", "separation", "permit"];
      const manualViolations = (project.ragViolations || []).filter((v) => {
        const text = (v.explanation || v.rule || v.message || "").toLowerCase();
        return MANUAL_KEYWORDS.some((kw) => text.includes(kw));
      }).map((v) => ({ ...v, status: "ADVISORY", name: v.name || "Manual Review Required" }));

      project.setStoryPlans(resizedPlans);
      project.setRagViolations(manualViolations);
      project.setRagChecked(true);
      project.persistNow({
        storyPlans: resizedPlans,
        floorPlan: resizedPlans[0] ?? null,
        ragViolations: manualViolations,
        ragChecked: true,
      });
      setAppliedFixes(complianceFixes);
      setRagNotesOpen(manualViolations.length > 0);
      setShowFixBanner(true);
      setTimeout(() => setShowFixBanner(false), 6000);
    } finally {
      setFixingRag(false);
    }
  }, [allStoryPlans, project]);

  const handleUndoFix = useCallback(() => {
    if (!undoSnapshot) return;
    project.setStoryPlans(undoSnapshot);
    project.setRagChecked(false);
    setUndoSnapshot(null);
    setAppliedFixes([]);
    setShowFixBanner(false);
    setFixesOpen(false);
  }, [undoSnapshot, project]);

  const handleFixOne = useCallback((violationId) => {
    if (!Array.isArray(allStoryPlans) || allStoryPlans.length === 0) return;
    setUndoSnapshot(allStoryPlans);
    const { fixedStoryPlans, appliedFixes: fixes } = autoFixStoryPlans(allStoryPlans, [violationId]);
    project.setStoryPlans(fixedStoryPlans);
    project.persistNow({ storyPlans: fixedStoryPlans, floorPlan: fixedStoryPlans[0] ?? null });
    setAppliedFixes(fixes);
    setShowFixBanner(true);
    setTimeout(() => setShowFixBanner(false), 6000);
  }, [allStoryPlans, project]);

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: colors.bg,
        fontFamily: fonts.label,
        overflow: "hidden",
      }}
    >
      {/* 3D Viewport */}
      <div ref={viewportRef} style={{ flex: 1, position: "relative" }}>
        <House3D
          width={width}
          depth={depth}
          stories={stories}
          roofType={roofType}
          wallMaterial={wallMaterial}
          roofMaterial={roofMaterial}
          wallColor={wallColor}
          roofColor={roofColor}
          showRoof={showRoof}
          showPillars={showPillars}
          showGround
          showSky
          interactive={false}
          floorPlan={floorPlan}
          storyPlans={storyPlans}
          style={{ width: "100%", height: "100%" }}
        />

        {/* Project Info Overlay */}
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            background: "rgba(13, 17, 23, 0.85)",
            backdropFilter: "blur(10px)",
            border: "1px solid #2a3548",
            borderRadius: 10,
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: colors.accent,
                boxShadow: `0 0 8px ${colors.accent}`,
              }}
            />
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: colors.textBright,
              }}
            >
              {project.projectName || "New Home"}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 8,
              fontSize: 12,
              color: colors.textDim,
            }}
          >
            <span>{Math.round(width)}' × {Math.round(depth)}'</span>
            <span>•</span>
            <span>{stories} {stories === 1 ? "Story" : "Stories"}</span>
            <span>•</span>
            <span>{totalSF.toLocaleString()} SF</span>
          </div>
        </div>

        {/* View Controls — cutaway roof + per-floor isolation */}
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "rgba(13, 17, 23, 0.85)",
            backdropFilter: "blur(10px)",
            border: "1px solid #2a3548",
            borderRadius: 10,
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minWidth: 180,
          }}
        >
          <button
            onClick={() => setShowRoof((v) => !v)}
            style={{
              padding: "7px 10px",
              background: showRoof ? "transparent" : `${colors.accent}15`,
              border: `1px solid ${showRoof ? "#2a3548" : colors.accent}`,
              borderRadius: 6,
              color: showRoof ? colors.text : colors.accent,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 6L7 1l6 5v1H1V6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M2 7v5h10V7" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            {showRoof ? "Remove Roof" : "Show Roof"}
          </button>

          {storyCount > 1 && (
            <div>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase", color: colors.textDim, marginBottom: 6,
              }}>
                View Floor
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => setFocusedStory(null)}
                  style={{
                    flex: 1, padding: "6px 4px",
                    background: focusedStory === null ? `${colors.accent}15` : "transparent",
                    border: `1px solid ${focusedStory === null ? colors.accent : "#2a3548"}`,
                    borderRadius: 5,
                    color: focusedStory === null ? colors.accent : colors.text,
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  All
                </button>
                {Array.from({ length: storyCount }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setFocusedStory(i)}
                    style={{
                      flex: 1, padding: "6px 4px",
                      background: focusedStory === i ? `${colors.accent}15` : "transparent",
                      border: `1px solid ${focusedStory === i ? colors.accent : "#2a3548"}`,
                      borderRadius: 5,
                      color: focusedStory === i ? colors.accent : colors.text,
                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Structural supports visibility toggle (bottom-left) */}
        {storyCount > 1 && (
          <button
            onClick={() => setShowPillars((v) => !v)}
            style={{
              position: "absolute",
              bottom: 20,
              left: 20,
              padding: "7px 11px",
              background: showPillars ? `${colors.accent}15` : "rgba(13, 17, 23, 0.7)",
              border: `1px solid ${showPillars ? colors.accent : "#2a3548"}`,
              borderRadius: 6,
              color: showPillars ? colors.accent : colors.textDim,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="1" width="2.5" height="10" stroke="currentColor" strokeWidth="1.1" />
              <rect x="7.5" y="1" width="2.5" height="10" stroke="currentColor" strokeWidth="1.1" />
            </svg>
            {showPillars ? "Supports on" : "Supports off"}
          </button>
        )}

        {/* Navigation Hint */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            right: 20,
            fontSize: 11,
            color: colors.textDim,
            background: "rgba(13, 17, 23, 0.7)",
            padding: "6px 12px",
            borderRadius: 6,
          }}
        >
          Drag to rotate • Scroll to zoom
        </div>

        {/* ── Structural Validation Panel ───────────────────────────────
           Appears below the viewer when blocking violations exist (red
           border) or when a fix was just applied (green banner).  Stays
           inline so the user still sees the house while reading. */}
        {(blockingViolations.length > 0 || showFixBanner || warningViolations.length > 0 || (project.ragViolations ?? []).length > 0) && (
          <div
            style={{
              position: "absolute",
              right: 20,
              bottom: 56,                 // above the nav hint
              width: 380,
              maxWidth: "calc(100% - 40px)",
              maxHeight: "55%",
              overflowY: "auto",
              background: "rgba(13, 17, 23, 0.94)",
              backdropFilter: "blur(8px)",
              border: `1px solid ${
                blockingViolations.length > 0 ? "#7f1d1d" :
                showFixBanner ? "#15803d" :
                "#78350f"
              }`,
              borderLeft: `4px solid ${
                blockingViolations.length > 0 ? "#ef4444" :
                showFixBanner ? "#22c55e" :
                "#f59e0b"
              }`,
              borderRadius: 10,
              padding: "14px 18px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            {/* Success banner */}
            {showFixBanner && blockingViolations.length === 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="9" stroke="#22c55e" strokeWidth="1.6" />
                    <path d="M6 10l3 3 5-6" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#22c55e" }}>
                    Your home has been adjusted and is structurally sound.
                  </span>
                </div>
                {appliedFixes.length > 0 && (
                  <>
                    <button
                      onClick={() => setFixesOpen((v) => !v)}
                      style={{
                        marginTop: 4, padding: "4px 8px",
                        background: "transparent", border: "1px solid #334155",
                        borderRadius: 6, color: colors.textDim,
                        fontSize: 11, cursor: "pointer",
                      }}
                    >
                      {fixesOpen ? "Hide" : "What changed?"}
                    </button>
                    {fixesOpen && (
                      <ul style={{
                        margin: "8px 0 4px 0", paddingLeft: 18,
                        fontSize: 12, color: colors.text, lineHeight: 1.55,
                      }}>
                        {appliedFixes.map((fix, i) => (
                          <li key={i}>{fix}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {undoSnapshot && (
                  <button
                    onClick={handleUndoFix}
                    style={{
                      marginLeft: 8, marginTop: 4, padding: "4px 10px",
                      background: "transparent", border: "1px solid #334155",
                      borderRadius: 6, color: colors.textDim,
                      fontSize: 11, cursor: "pointer",
                    }}
                  >
                    Undo
                  </button>
                )}
              </div>
            )}

            {/* Blocking violations */}
            {blockingViolations.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2L18 17H2L10 2Z" stroke="#ef4444" strokeWidth="1.6" strokeLinejoin="round" />
                    <path d="M10 8v4M10 14.5v0.5" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#fca5a5" }}>
                    A few things to sort out before we can build
                  </span>
                </div>
                <ul style={{
                  margin: "0 0 10px 0", padding: 0, listStyle: "none",
                }}>
                  {blockingViolations.map((v) => (
                    <li key={v.id} style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "8px 0", borderBottom: "1px solid rgba(239,68,68,0.12)",
                      fontSize: 12.5, color: colors.text, lineHeight: 1.5,
                    }}>
                      <span style={{ flex: 1 }}>{v.message}</span>
                      {v.autoFixAvailable && (
                        <button
                          onClick={() => handleFixOne(v.id)}
                          style={{
                            flexShrink: 0, padding: "4px 10px",
                            background: "rgba(59,130,246,0.12)",
                            border: "1px solid rgba(59,130,246,0.4)",
                            borderRadius: 5, color: "#60a5fa",
                            fontSize: 11, fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          Fix this
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {blockingViolations.some((v) => v.autoFixAvailable) && (
                  <button
                    onClick={handleFixAll}
                    style={{
                      padding: "9px 16px",
                      background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                      border: "none", borderRadius: 7,
                      color: "white", fontSize: 13, fontWeight: 600,
                      cursor: "pointer", letterSpacing: "0.2px",
                      boxShadow: "0 4px 16px rgba(37,99,235,0.35)",
                    }}
                  >
                    Fix Everything
                  </button>
                )}
              </div>
            )}

            {/* Warning-only state (no blockers, just heads-ups) */}
            {blockingViolations.length === 0 && !showFixBanner && warningViolations.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2L18 17H2L10 2Z" stroke="#f59e0b" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#fbbf24" }}>Heads up</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: colors.text, lineHeight: 1.5 }}>
                  {warningViolations.map((v) => <li key={v.id}>{v.message}</li>)}
                </ul>
              </div>
            )}

            {/* Code compliance advisory notes from RAG/AI check */}
            {(project.ragViolations ?? []).length > 0 && blockingViolations.length === 0 && (
              <div style={{ marginTop: warningViolations.length > 0 ? 12 : 0 }}>
                <button
                  onClick={() => setRagNotesOpen((v) => !v)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", background: "none", border: "none", cursor: "pointer",
                    padding: 0, marginBottom: ragNotesOpen ? 10 : 0,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="9" stroke="#f59e0b" strokeWidth="1.5" />
                      <path d="M10 6v5M10 14v.5" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#fbbf24" }}>
                      Building Code Review
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: "#f59e0b",
                      background: "rgba(245,158,11,0.15)", padding: "1px 6px", borderRadius: 10,
                    }}>
                      {project.ragViolations.length}
                    </span>
                  </div>
                  <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    style={{ transform: ragNotesOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", opacity: 0.5 }}
                  >
                    <path d="M2 4l4 4 4-4" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {ragNotesOpen && (
                  <>
                    {project.ragViolations.length > 0 && (
                      <button
                        onClick={handleFixCompliance}
                        disabled={fixingRag}
                        style={{
                          width: "100%", padding: "10px 16px", marginBottom: 10,
                          background: fixingRag
                            ? "rgba(251,191,36,0.06)"
                            : "linear-gradient(135deg, rgba(251,191,36,0.2) 0%, rgba(251,191,36,0.1) 100%)",
                          border: fixingRag ? "1px solid rgba(251,191,36,0.15)" : "1px solid rgba(251,191,36,0.4)",
                          borderRadius: 8, color: fixingRag ? "rgba(251,191,36,0.45)" : "#fbbf24",
                          fontSize: 13, fontWeight: 700, cursor: fixingRag ? "default" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                          letterSpacing: "0.02em",
                          boxShadow: fixingRag ? "none" : "0 0 14px rgba(251,191,36,0.15)",
                          transition: "all 0.2s",
                        }}
                      >
                        {fixingRag ? (
                          "Fixing…"
                        ) : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M7 1v6M4 4l3 3 3-3" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M2 10h10" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            ⚡ Resolve All Issues
                          </>
                        )}
                      </button>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {project.ragViolations.map((v, i) => {
                        const isFail = (v.status || "").toUpperCase() === "FAIL";
                        const name = typeof v === "string" ? null : v.name;
                        const explanation = typeof v === "string" ? v : (v.explanation || v.message || v.description || "");
                        return (
                          <div key={i} style={{
                            background: isFail ? "rgba(239,68,68,0.07)" : "rgba(245,158,11,0.07)",
                            border: `1px solid ${isFail ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)"}`,
                            borderRadius: 7, padding: "9px 12px",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: explanation ? 4 : 0 }}>
                              {name && <span style={{ fontSize: 12, fontWeight: 600, color: colors.textBright }}>{name}</span>}
                              <span style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                                color: isFail ? "#ef4444" : "#f59e0b",
                                background: isFail ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
                                padding: "2px 7px", borderRadius: 4,
                              }}>
                                {isFail ? "ACTION NEEDED" : "ADVISORY"}
                              </span>
                            </div>
                            {explanation && <p style={{ margin: 0, fontSize: 12, color: colors.text, lineHeight: 1.55 }}>{explanation}</p>}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 10, lineHeight: 1.5 }}>
                      Return to the floor plan editor to address these items before submitting for permits.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Right Sidebar - Controls */}
      <div
        style={{
          width: 360,
          minWidth: 360,
          maxHeight: "100%",
          background: "#111827",
          borderLeft: "1px solid #2a3548",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #2a3548",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <span style={{ fontSize: 16, fontWeight: 600, color: colors.textBright }}>
              {isHomeowner ? "Your Dream Home" : "Customize"}
            </span>
            {isHomeowner && (
              <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>
                Explore styles and colors
              </div>
            )}
          </div>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: "6px 12px",
              background: "transparent",
              border: "1px solid #2a3548",
              borderRadius: 6,
              color: colors.textDim,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Back
          </button>
        </div>

        {/* Controls */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "16px 24px",
            scrollbarWidth: "thin",
            scrollbarColor: "#2a3548 transparent",
          }}
        >
          {/* Roof Type - Builder only */}
          {isBuilder && (
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: colors.textDim,
                  marginBottom: 10,
                }}
              >
                Roof Style
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {ROOF_TYPES.map((rt) => (
                  <button
                    key={rt.key}
                    onClick={() => setRoofType(rt.key)}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      background: roofType === rt.key ? `${colors.accent}15` : "rgba(26,34,54,0.5)",
                      border: `1px solid ${roofType === rt.key ? colors.accent : "#2a3548"}`,
                      borderRadius: 8,
                      color: roofType === rt.key ? colors.accent : colors.text,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {rt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Wall Material - Builder only */}
          {isBuilder && (
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: colors.textDim,
                  marginBottom: 10,
                }}
              >
                Exterior Material
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {WALL_MATERIALS.map((mat) => (
                  <button
                    key={mat.key}
                    onClick={() => {
                      setWallMaterial(mat.key);
                      setWallColor(mat.color);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      background: wallMaterial === mat.key ? `${colors.accent}10` : "transparent",
                      border: `1px solid ${wallMaterial === mat.key ? colors.accent : "#2a3548"}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 4,
                        background: mat.color,
                        border: "1px solid #2a3548",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        color: wallMaterial === mat.key ? colors.textBright : colors.text,
                      }}
                    >
                      {mat.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Roof Material - Builder only */}
          {isBuilder && (
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: colors.textDim,
                  marginBottom: 10,
                }}
              >
                Roof Material
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {ROOF_MATERIALS.map((mat) => (
                  <button
                    key={mat.key}
                    onClick={() => {
                      setRoofMaterial(mat.key);
                      setRoofColor(mat.color);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      background: roofMaterial === mat.key ? `${colors.accent}10` : "transparent",
                      border: `1px solid ${roofMaterial === mat.key ? colors.accent : "#2a3548"}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 4,
                        background: mat.color,
                        border: "1px solid #2a3548",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        color: roofMaterial === mat.key ? colors.textBright : colors.text,
                      }}
                    >
                      {mat.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Wall Color — single tight row of circular swatches */}
          <div style={{ marginBottom: 20 }}>
            <SectionLabel>Wall Color</SectionLabel>
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}>
              {COLOR_SWATCHES.map((swatch) => {
                const active = wallColor === swatch.hex;
                return (
                  <button
                    key={swatch.hex}
                    onClick={() => setWallColor(swatch.hex)}
                    title={swatch.name}
                    aria-label={swatch.name}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: swatch.hex,
                      border: active
                        ? `2px solid ${colors.accent}`
                        : "1px solid rgba(255,255,255,0.1)",
                      boxShadow: active
                        ? `0 0 0 3px ${colors.bg}, 0 0 0 4px ${colors.accent}`
                        : "none",
                      cursor: "pointer",
                      padding: 0,
                      transition: "box-shadow 0.12s",
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* AI Photorealistic Render */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: colors.textDim, marginBottom: 8,
            }}>
              AI Render
            </div>

            {/* Style selector */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              {RENDER_STYLES.map(s => (
                <button
                  key={s.key}
                  onClick={() => setAiStyle(s.key)}
                  style={{
                    padding: "4px 10px", borderRadius: 5,
                    border: `1px solid ${aiStyle === s.key ? colors.accent : "#2a3548"}`,
                    background: aiStyle === s.key ? `${colors.accent}15` : "transparent",
                    color: aiStyle === s.key ? colors.accent : colors.textDim,
                    fontSize: 10, fontWeight: 500, fontFamily: fonts.label, cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Generate button */}
            <button
              onClick={handleAiRender}
              disabled={aiRendering}
              style={{
                width: "100%", padding: "10px 0",
                background: aiRendering ? "#2a3548" : `linear-gradient(135deg, ${colors.accent}, #0099cc)`,
                border: "none", borderRadius: 8,
                color: aiRendering ? colors.textDim : "#000",
                fontSize: 12, fontWeight: 700, fontFamily: fonts.label,
                cursor: aiRendering ? "not-allowed" : "pointer",
                transition: "box-shadow 0.2s",
              }}
              onMouseEnter={e => !aiRendering && (e.currentTarget.style.boxShadow = `0 4px 16px rgba(0,212,255,0.3)`)}
              onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
            >
              {aiRendering ? "Rendering..." : "Generate AI Render"}
            </button>

            {/* Error */}
            {aiError && (
              <div style={{
                marginTop: 8, padding: "8px 12px", borderRadius: 6,
                background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.25)",
                fontSize: 11, color: colors.danger,
              }}>
                {aiError}
                <button
                  onClick={handleAiRender}
                  style={{
                    display: "block", marginTop: 6, padding: "4px 10px",
                    background: "transparent", border: `1px solid ${colors.danger}`, borderRadius: 4,
                    color: colors.danger, fontSize: 10, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Render result */}
            {aiResult && (
              <div style={{ marginTop: 8, borderRadius: 8, overflow: "hidden", border: "1px solid #2a3548" }}>
                <img
                  src={aiResult.url}
                  alt="AI Render"
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
                <a
                  href={aiResult.url}
                  download="vision-render.png"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "block", padding: "6px 0", textAlign: "center",
                    background: "rgba(0,212,255,0.08)", borderTop: "1px solid #2a3548",
                    fontSize: 10, color: colors.accent, fontWeight: 600, textDecoration: "none",
                  }}
                >
                  Download Render
                </a>
              </div>
            )}

            {/* Loading skeleton */}
            {aiRendering && (
              <div style={{
                marginTop: 8, height: 180, borderRadius: 8, overflow: "hidden",
                background: `linear-gradient(110deg, #1a2233 8%, #1e2a3d 18%, #1a2233 33%)`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s infinite",
              }}>
                <style>{`@keyframes shimmer { to { background-position: -200% 0; } }`}</style>
              </div>
            )}
          </div>

          {/* Homeowner Info & Progress */}
          {isHomeowner && (
            <div style={{ marginTop: 4 }}>
              {/* Progress Steps - compact */}
              <div
                style={{
                  padding: 12,
                  background: "rgba(46, 213, 115, 0.08)",
                  border: "1px solid rgba(46, 213, 115, 0.2)",
                  borderRadius: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" stroke="#2ed573" strokeWidth="1.5" />
                    <path d="M5 8l2 2 4-4" stroke="#2ed573" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#2ed573" }}>Design Complete</span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {["Floor Plan", "3D Preview", "Estimate"].map((step, i) => (
                    <div
                      key={step}
                      style={{
                        flex: 1,
                        padding: "5px 6px",
                        background: i < 2 ? "rgba(46, 213, 115, 0.15)" : "rgba(255,255,255,0.05)",
                        borderRadius: 4,
                        textAlign: "center",
                        fontSize: 9,
                        fontWeight: 600,
                        color: i < 2 ? "#2ed573" : colors.textDim,
                      }}
                    >
                      {i < 2 ? "\u2713 " : ""}{step}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #2a3548",
            display: "flex",
            flexDirection: isHomeowner ? "column" : "row",
            gap: 10,
            flexShrink: 0,
            background: "#111827",
          }}
        >
          <button
            onClick={() => { if (canContinue) navigate("/feasibility"); }}
            disabled={!canContinue}
            title={canContinue ? "" : "Resolve structural issues to continue"}
            style={{
              flex: 1,
              padding: "12px",
              background: canContinue
                ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                : "rgba(37,99,235,0.25)",
              border: "none",
              borderRadius: 8,
              color: canContinue ? "#fff" : "rgba(255,255,255,0.4)",
              fontSize: 13,
              fontWeight: 600,
              cursor: canContinue ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {isHomeowner ? (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                See Cost Estimate
              </>
            ) : (
              "View Feasibility"
            )}
          </button>
          {isBuilder && (
            <button
              onClick={() => navigate("/edit")}
              style={{
                padding: "12px 16px",
                background: "transparent",
                border: "1px solid #2a3548",
                borderRadius: 8,
                color: colors.text,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Advanced
            </button>
          )}
          {isHomeowner && (
            <button
              onClick={() => navigate("/develop")}
              style={{
                padding: "12px 16px",
                background: "transparent",
                border: "1px solid #2a3548",
                borderRadius: 8,
                color: colors.text,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 10l3-3 2 2 4-4 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Edit Floor Plan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
