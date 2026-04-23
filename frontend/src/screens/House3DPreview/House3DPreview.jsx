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

  const handleUndoFix = useCallback(() => {
    if (!undoSnapshot) return;
    project.setStoryPlans(undoSnapshot);
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
        {(blockingViolations.length > 0 || showFixBanner || warningViolations.length > 0) && (
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
