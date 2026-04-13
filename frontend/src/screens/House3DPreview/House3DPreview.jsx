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

const COLOR_SWATCHES = [
  { name: "Classic White", hex: "#F5F0E8" },
  { name: "Light Gray", hex: "#C8CDD4" },
  { name: "Charcoal", hex: "#3A3E45" },
  { name: "Navy Blue", hex: "#1D3461" },
  { name: "Sage Green", hex: "#7A9E87" },
  { name: "Warm Beige", hex: "#D4B896" },
  { name: "Terracotta", hex: "#C4622D" },
  { name: "Cream", hex: "#FFFDD0" },
];

// Homeowner-friendly style presets that combine colors, roof type, and materials
const STYLE_PRESETS = [
  {
    key: "modern",
    label: "Modern Minimalist",
    description: "Clean lines with a contemporary feel",
    wallColor: "#F5F0E8",
    roofColor: "#3a3a3a",
    roofType: "flat",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    key: "traditional",
    label: "Classic Traditional",
    description: "Timeless elegance with warm tones",
    wallColor: "#D4B896",
    roofColor: "#3a3a3a",
    roofType: "gable",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    key: "craftsman",
    label: "Cozy Craftsman",
    description: "Warm wood tones with character",
    wallColor: "#8b6f47",
    roofColor: "#4a5568",
    roofType: "gable",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    key: "coastal",
    label: "Coastal Retreat",
    description: "Light and airy beach house vibes",
    wallColor: "#C8CDD4",
    roofColor: "#5a6570",
    roofType: "hip",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    key: "mediterranean",
    label: "Mediterranean",
    description: "Warm terracotta with tile roof",
    wallColor: "#f5f0e8",
    roofColor: "#8b4513",
    roofType: "hip",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    key: "bold",
    label: "Bold Statement",
    description: "Make an impression with deep tones",
    wallColor: "#1D3461",
    roofColor: "#3a3a3a",
    roofType: "gable",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
];

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
  const [showEnvironment, setShowEnvironment] = useState(true);
  const [editMode, setEditMode] = useState(false);

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

  const handleExportScreenshot = useCallback(() => {
    const dataUrl = captureScreenshot();
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.download = "house-render.png";
    link.href = dataUrl;
    link.click();
  }, [captureScreenshot]);

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
          showGround={showEnvironment}
          showSky={showEnvironment}
          interactive={editMode}
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

        {/* Export Screenshot button */}
        <button
          onClick={handleExportScreenshot}
          style={{
            position: "absolute", top: 16, right: 16,
            padding: "8px 14px",
            background: "rgba(13,17,23,0.85)", backdropFilter: "blur(8px)",
            border: `1px solid ${colors.cardBorder}`, borderRadius: 8,
            color: "#fff", fontSize: 11, fontWeight: 600, fontFamily: fonts.label,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            transition: "background 0.15s", zIndex: 10,
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(13,17,23,0.95)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(13,17,23,0.85)"}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Export Screenshot
        </button>
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
          {/* Style Presets - Homeowner friendly (compact grid) */}
          {isHomeowner && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: colors.textDim,
                  marginBottom: 8,
                }}
              >
                Choose Your Style
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    onClick={() => applyStylePreset(preset)}
                    style={{
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      padding: "10px 8px",
                      background: selectedStyle === preset.key ? `${colors.accent}15` : "rgba(26,34,54,0.4)",
                      border: `1px solid ${selectedStyle === preset.key ? colors.accent : "#2a3548"}`,
                      borderRadius: 8,
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {/* Color preview - small house icon */}
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 0 }}>
                      <div
                        style={{
                          width: 20,
                          height: 24,
                          background: preset.wallColor,
                          border: "1px solid rgba(255,255,255,0.15)",
                          borderRadius: "2px 2px 0 0",
                        }}
                      />
                      <div
                        style={{
                          width: 0,
                          height: 0,
                          borderLeft: "12px solid transparent",
                          borderRight: "12px solid transparent",
                          borderBottom: `10px solid ${preset.roofColor}`,
                          marginBottom: 24,
                          marginLeft: -22,
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: selectedStyle === preset.key ? colors.accent : colors.textBright,
                        lineHeight: 1.2,
                      }}
                    >
                      {preset.label}
                    </div>
                    {selectedStyle === preset.key && (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ position: "absolute", top: 4, right: 4 }}>
                        <circle cx="8" cy="8" r="8" fill={colors.accent} />
                        <path d="M5 8l2 2 4-4" stroke="#0d1117" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ))}
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

          {/* Color Palette - Available to all */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: colors.textDim,
                marginBottom: 8,
              }}
            >
              Wall Color
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 6,
              }}
            >
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch.hex}
                  onClick={() => setWallColor(swatch.hex)}
                  title={swatch.name}
                  style={{
                    width: "100%",
                    aspectRatio: "1",
                    borderRadius: 6,
                    background: swatch.hex,
                    border: wallColor === swatch.hex
                      ? `2px solid ${colors.accent}`
                      : "1px solid #2a3548",
                    cursor: "pointer",
                    transition: "transform 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                />
              ))}
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

          {/* Edit Mode Toggle */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={() => setEditMode(!editMode)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                background: editMode ? "rgba(59, 130, 246, 0.15)" : "transparent",
                border: `1px solid ${editMode ? "#3b82f6" : "#2a3548"}`,
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M10.5 1.5l2 2-8 8H2.5v-2l8-8z"
                    stroke={editMode ? "#3b82f6" : colors.textDim}
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span style={{ fontSize: 12, color: editMode ? "#3b82f6" : colors.text }}>
                  Edit Mode
                </span>
              </div>
              <div
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  background: editMode ? "#3b82f6" : "#2a3548",
                  position: "relative",
                  transition: "background 0.2s",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 2,
                    left: editMode ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 0.2s",
                  }}
                />
              </div>
            </button>
            {editMode && (
              <div style={{ fontSize: 10, color: colors.textDim, marginTop: 6, paddingLeft: 4 }}>
                Drag windows and door to reposition
              </div>
            )}
          </div>

          {/* Environment Toggle */}
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setShowEnvironment(!showEnvironment)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                background: showEnvironment ? `${colors.accent}10` : "transparent",
                border: `1px solid ${showEnvironment ? colors.accent : "#2a3548"}`,
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 12, color: colors.text }}>Show Environment</span>
              <div
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  background: showEnvironment ? colors.accent : "#2a3548",
                  position: "relative",
                  transition: "background 0.2s",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 2,
                    left: showEnvironment ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 0.2s",
                  }}
                />
              </div>
            </button>
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
