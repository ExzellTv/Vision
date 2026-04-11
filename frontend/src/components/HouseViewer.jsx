/**
 * HouseViewer — Top-level component tying 3D model + photorealistic AI render.
 *
 * Layout: split-panel (3D left, render result right) on desktop,
 *         stacked on mobile.
 *
 * Flow: floor plan JSON → validate → HouseScene (interactive 3D)
 *       → "Generate Render" → screenshot → MyArchitectAI → result
 */
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { colors, fonts, radii, card } from "../theme/tokens";
import { coerceVisionFloorPlan, validateFloorPlan } from "../lib/floorPlanSchema";
import { renderWithAI, RENDER_STYLES } from "../lib/myArchitectAI";
import HouseScene from "./HouseScene";

export default function HouseViewer({ floorPlanJson }) {
  const sceneRef = useRef();
  const [style, setStyle] = useState("modern exterior");
  const [rendering, setRendering] = useState(false);
  const [renderResult, setRenderResult] = useState(null);
  const [error, setError] = useState(null);

  // Validate + coerce floor plan
  const plan = useMemo(() => {
    if (!floorPlanJson) return null;
    const coerced = coerceVisionFloorPlan(floorPlanJson);
    if (!coerced) return null;
    const result = validateFloorPlan(coerced);
    if (result.success) {
      if (import.meta.env.DEV) {
        console.log("[Vision] Floor plan schema:", JSON.stringify(result.data, null, 2));
      }
      return result.data;
    }
    // Use coerced even if validation is partial
    console.warn("[Vision] Using coerced plan despite validation issues");
    return coerced;
  }, [floorPlanJson]);

  const handleGenerateRender = useCallback(async () => {
    if (!sceneRef.current) return;
    setRendering(true);
    setError(null);
    setRenderResult(null);

    try {
      const screenshot = sceneRef.current.captureScreenshot(1024, 1024);
      if (!screenshot) throw new Error("Failed to capture screenshot");

      const result = await renderWithAI(screenshot, style);
      setRenderResult(result);
    } catch (err) {
      setError(err.message || "Render failed");
    } finally {
      setRendering(false);
    }
  }, [style]);

  if (!plan) {
    return (
      <div style={{
        height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        background: colors.bg, color: colors.textDim, fontFamily: fonts.label, fontSize: 14,
      }}>
        No floor plan data available.
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", height: "100%", width: "100%",
      background: colors.bg, fontFamily: fonts.label, overflow: "hidden",
      flexDirection: "row",
    }}>

      {/* ── Left: Interactive 3D Model ── */}
      <div style={{ flex: "1 1 60%", position: "relative", minHeight: 400 }}>
        <HouseScene ref={sceneRef} plan={plan} />

        {/* Info overlay */}
        <div style={{
          position: "absolute", top: 12, left: 12,
          background: "rgba(13,17,23,0.85)", backdropFilter: "blur(8px)",
          border: `1px solid ${colors.cardBorder}`, borderRadius: 8,
          padding: "10px 14px", zIndex: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.textBright }}>
            {plan.style || "Floor Plan"} — {plan.totalSF?.toLocaleString()} SF
          </div>
          <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>
            {plan.rooms?.length} rooms | {Math.round(plan.width)}' x {Math.round(plan.depth)}' | {plan.stories} story
          </div>
        </div>
      </div>

      {/* ── Right: AI Render Panel ── */}
      <div style={{
        flex: "0 0 40%", minWidth: 320, maxWidth: 500,
        borderLeft: `1px solid ${colors.panelBorder}`,
        background: colors.panel, padding: "20px",
        display: "flex", flexDirection: "column", gap: 16,
        overflowY: "auto",
      }}>
        {/* Header */}
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.textBright }}>
            AI Photorealistic Render
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: colors.textDim }}>
            Capture the 3D view and transform it into a photorealistic visualization.
          </p>
        </div>

        {/* Style selector */}
        <div>
          <label style={{
            display: "block", fontSize: 10, fontWeight: 600, color: colors.textDim,
            textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6,
          }}>
            Architectural Style
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {RENDER_STYLES.map(s => (
              <button
                key={s.key}
                onClick={() => setStyle(s.key)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: `1px solid ${style === s.key ? colors.accent : colors.cardBorder}`,
                  background: style === s.key ? colors.accentDim : "transparent",
                  color: style === s.key ? colors.accent : colors.text,
                  fontSize: 11, fontWeight: 500, fontFamily: fonts.label,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerateRender}
          disabled={rendering}
          style={{
            padding: "12px 0",
            background: rendering
              ? colors.cardSurface
              : `linear-gradient(135deg, ${colors.accent}, #0099cc)`,
            border: "none",
            borderRadius: radii.md,
            color: rendering ? colors.textDim : colors.bg,
            fontSize: 13, fontWeight: 700, fontFamily: fonts.label,
            cursor: rendering ? "not-allowed" : "pointer",
            letterSpacing: "0.3px",
            transition: "box-shadow 0.2s",
          }}
          onMouseEnter={e => !rendering && (e.currentTarget.style.boxShadow = `0 4px 20px rgba(0,212,255,0.3)`)}
          onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
        >
          {rendering ? (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: "spin 1s linear infinite" }}>
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="20" strokeDashoffset="5" />
              </svg>
              Rendering...
            </span>
          ) : "Generate Photorealistic Render"}
        </button>

        {/* Error state */}
        {error && (
          <div style={{
            ...card, padding: "12px 16px",
            border: `1px solid rgba(255,71,87,0.3)`,
            background: colors.dangerDim,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: colors.danger, marginBottom: 4 }}>
              Render Failed
            </div>
            <div style={{ fontSize: 11, color: colors.text }}>{error}</div>
            <button
              onClick={handleGenerateRender}
              style={{
                marginTop: 8, padding: "6px 14px",
                background: "transparent", border: `1px solid ${colors.danger}`,
                borderRadius: 6, color: colors.danger,
                fontSize: 11, fontWeight: 600, fontFamily: fonts.label,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Render result */}
        {renderResult && (
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            {renderResult.demo && (
              <div style={{
                padding: "6px 12px", background: colors.warnDim,
                borderBottom: `1px solid rgba(255,159,67,0.2)`,
                fontSize: 10, color: colors.warn, fontWeight: 600,
                textAlign: "center",
              }}>
                DEMO MODE — Set VITE_MYARCHITECTAI_API_KEY for real renders
              </div>
            )}
            <img
              src={renderResult.url}
              alt="AI Photorealistic Render"
              style={{
                width: "100%", height: "auto", display: "block",
                filter: renderResult.demo ? "saturate(1.2) contrast(1.05)" : "none",
              }}
            />
          </div>
        )}

        {/* Placeholder when no render yet */}
        {!renderResult && !rendering && !error && (
          <div style={{
            ...card, padding: "40px 20px",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 12, textAlign: "center",
          }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" opacity="0.3">
              <rect x="4" y="4" width="32" height="32" rx="4" stroke={colors.textDim} strokeWidth="2" />
              <circle cx="14" cy="16" r="4" stroke={colors.textDim} strokeWidth="1.5" />
              <path d="M4 30l10-8 6 5 6-10 10 13" stroke={colors.textDim} strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 12, color: colors.textDim }}>
              Rotate the 3D model to your desired angle, then click Generate.
            </span>
          </div>
        )}

        {/* Loading skeleton */}
        {rendering && (
          <div style={{
            ...card, padding: 0, overflow: "hidden",
            height: 280, position: "relative",
          }}>
            <div style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(110deg, ${colors.cardSurface} 8%, ${colors.surfaceHover} 18%, ${colors.cardSurface} 33%)`,
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite",
            }} />
            <style>{`@keyframes shimmer { to { background-position: -200% 0; } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
      </div>
    </div>
  );
}
