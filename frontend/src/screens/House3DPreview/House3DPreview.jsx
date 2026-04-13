import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { colors, fonts, card, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import { useUserType } from "../../context/UserTypeContext";
import House3D from "../../components/3d/House3D";
import { renderWithAI, RENDER_STYLES } from "../../lib/myArchitectAI";

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

// Homeowner-friendly style presets that combine colors, roof type, and materials
// Four main home styles — picking one updates wall color, roof color, and
// roof type together. Colors are sampled from the most common US exterior palettes.
const STYLE_PRESETS = [
  {
    key: "modern",
    label: "Modern",
    wallColor: "#F5F0E8",
    roofColor: "#3A3E45",
    roofType: "flat",
  },
  {
    key: "traditional",
    label: "Traditional",
    wallColor: "#D4B896",
    roofColor: "#3A3E45",
    roofType: "gable",
  },
  {
    key: "craftsman",
    label: "Craftsman",
    wallColor: "#B2A898",
    roofColor: "#4a5568",
    roofType: "gable",
  },
  {
    key: "coastal",
    label: "Coastal",
    wallColor: "#C8CDD4",
    roofColor: "#5a6570",
    roofType: "hip",
  },
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

  // House configuration state
  const [roofType, setRoofType] = useState("gable");
  const [wallMaterial, setWallMaterial] = useState("vinyl");
  const [roofMaterial, setRoofMaterial] = useState("asphaltShingle");
  const [selectedStyle, setSelectedStyle] = useState(null);

  // Apply style preset
  const applyStylePreset = (preset) => {
    setSelectedStyle(preset.key);
    setWallColor(preset.wallColor);
    setRoofColor(preset.roofColor);
    setRoofType(preset.roofType);
  };
  const [wallColor, setWallColor] = useState("#e8e2da");
  const [roofColor, setRoofColor] = useState("#3a3a3a");
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
      const result = await renderWithAI(screenshot, aiStyle);
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
  const storyPlans = project.storyPlans;

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
          {/* Style Presets — minimal horizontal chips with twin color swatches */}
          {isHomeowner && (
            <div style={{ marginBottom: 20 }}>
              <SectionLabel>Style</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {STYLE_PRESETS.map((preset) => {
                  const active = selectedStyle === preset.key;
                  return (
                    <button
                      key={preset.key}
                      onClick={() => applyStylePreset(preset)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        background: active ? `${colors.accent}10` : "transparent",
                        border: `1px solid ${active ? colors.accent : "#1f2937"}`,
                        borderRadius: 8,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "border-color 0.12s, background 0.12s",
                      }}
                    >
                      <div style={{ display: "flex", flexShrink: 0 }}>
                        <div style={{
                          width: 16, height: 22,
                          background: preset.wallColor,
                          borderRadius: "3px 0 0 3px",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }} />
                        <div style={{
                          width: 16, height: 22,
                          background: preset.roofColor,
                          borderRadius: "0 3px 3px 0",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderLeft: "none",
                        }} />
                      </div>
                      <span style={{
                        fontSize: 13,
                        fontWeight: active ? 600 : 500,
                        color: active ? colors.accent : colors.textBright,
                        letterSpacing: "-0.1px",
                      }}>
                        {preset.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
                {aiResult.demo && (
                  <div style={{
                    padding: "4px 8px", background: "rgba(255,159,67,0.1)",
                    borderBottom: "1px solid rgba(255,159,67,0.2)",
                    fontSize: 9, color: colors.warn, fontWeight: 600, textAlign: "center",
                  }}>
                    DEMO — Set API key for real renders
                  </div>
                )}
                <img
                  src={aiResult.url}
                  alt="AI Render"
                  style={{
                    width: "100%", height: "auto", display: "block",
                    filter: aiResult.demo ? "saturate(1.2) contrast(1.05)" : "none",
                  }}
                />
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
            onClick={() => navigate("/feasibility")}
            style={{
              flex: 1,
              padding: "12px",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
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
