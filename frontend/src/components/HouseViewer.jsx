/**
 * HouseViewer — Smplrspace floor plan + AI photorealistic render.
 *
 * Left/top: FloorPlanViewer (interactive Smplrspace 2D/3D, read-only).
 * Right/bottom: MyArchitectAI render of the captured view.
 *
 * To edit the floor plan, users navigate in-app to /develop (FloorPlanEditor).
 * Smplrspace's JS SDK is viewer-only and their hosted editor lives behind
 * Auth0, which refuses iframe embedding — so everything stays native.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { colors, fonts, radii, card } from "../theme/tokens";
import { renderWithAI, RENDER_STYLES } from "../lib/myArchitectAI";
import FloorPlanViewer from "./FloorPlanViewer";

export default function HouseViewer({ spaceId, clientToken }) {
  const resolvedSpaceId = spaceId || import.meta.env.VITE_SMPLR_SPACE_ID || "";
  const resolvedToken = clientToken || import.meta.env.VITE_SMPLR_CLIENT_TOKEN || "";

  const navigate = useNavigate();
  const viewerRef = useRef(null);
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < 900 : false
  );
  const [cameraMode, setCameraMode] = useState("3d"); // "2d" | "3d"
  const [style, setStyle] = useState("modern exterior");
  const [rendering, setRendering] = useState(false);
  const [renderResult, setRenderResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleGenerateRender = useCallback(async () => {
    if (!viewerRef.current) return;
    setRendering(true);
    setError(null);
    setRenderResult(null);
    try {
      const screenshot = await viewerRef.current.captureScreenshot();
      if (!screenshot) throw new Error("Failed to capture screenshot");
      const result = await renderWithAI(screenshot, style);
      setRenderResult(result);
    } catch (err) {
      setError(err?.message || "Render failed");
    } finally {
      setRendering(false);
    }
  }, [style]);

  const goToEditor = useCallback(() => {
    navigate("/develop");
  }, [navigate]);

  const configMissing = !resolvedSpaceId || !resolvedToken;

  return (
    <div style={{
      display: "flex",
      flexDirection: isNarrow ? "column" : "row",
      height: "100%", width: "100%",
      background: colors.bg, fontFamily: fonts.label, overflow: "hidden",
    }}>
      {/* ── Floor plan viewer ── */}
      <div style={{
        flex: isNarrow ? "1 1 55%" : "1 1 60%",
        position: "relative",
        minHeight: isNarrow ? 320 : 500,
        borderBottom: isNarrow ? `1px solid ${colors.panelBorder}` : "none",
      }}>
        {configMissing ? (
          <ConfigMissing
            missingToken={!resolvedToken}
            missingSpace={!resolvedSpaceId}
          />
        ) : (
          <FloorPlanViewer
            ref={viewerRef}
            spaceId={resolvedSpaceId}
            clientToken={resolvedToken}
            cameraMode={cameraMode}
          />
        )}

        {/* 2D / 3D camera toggle — top-left */}
        <div style={{
          position: "absolute", top: 12, left: 12, zIndex: 20,
          display: "flex", gap: 4, padding: 4,
          background: "rgba(13,17,23,0.85)", backdropFilter: "blur(8px)",
          border: `1px solid ${colors.cardBorder}`, borderRadius: 8,
        }}>
          {[
            { key: "2d", label: "2D" },
            { key: "3d", label: "3D" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setCameraMode(opt.key)}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "none",
                background: cameraMode === opt.key ? colors.accentDim : "transparent",
                color: cameraMode === opt.key ? colors.accent : colors.text,
                fontSize: 11, fontWeight: 600, fontFamily: fonts.label,
                cursor: "pointer",
                letterSpacing: "0.3px",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Edit Floor Plan — navigates in-app to /develop */}
        {!configMissing && (
          <button
            onClick={goToEditor}
            style={{
              position: "absolute", top: 12, right: 12, zIndex: 20,
              padding: "8px 14px",
              background: "rgba(13,17,23,0.85)",
              backdropFilter: "blur(8px)",
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: 8,
              color: colors.textBright,
              fontSize: 11, fontWeight: 600, fontFamily: fonts.label,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              letterSpacing: "0.3px",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 9.5 2 11l1.5-.5L10 4 8 2 1.5 8.5 1 9.5Z"
                    stroke="currentColor" strokeWidth="1.2"
                    strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            Edit Floor Plan
          </button>
        )}
      </div>

      {/* ── AI render panel ── */}
      <div style={{
        flex: isNarrow ? "1 1 45%" : "0 0 40%",
        minWidth: isNarrow ? undefined : 320,
        maxWidth: isNarrow ? undefined : 500,
        borderLeft: isNarrow ? "none" : `1px solid ${colors.panelBorder}`,
        background: colors.panel, padding: 20,
        display: "flex", flexDirection: "column", gap: 16,
        overflowY: "auto",
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.textBright }}>
            AI Photorealistic Render
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: colors.textDim }}>
            Orient the floor plan, then generate a photorealistic exterior.
          </p>
        </div>

        <div>
          <label style={{
            display: "block", fontSize: 10, fontWeight: 600, color: colors.textDim,
            textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6,
          }}>
            Architectural Style
          </label>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            style={{
              width: "100%", padding: "8px 10px",
              background: colors.cardSurface,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: radii.md,
              color: colors.text, fontSize: 13, fontFamily: fonts.label,
              cursor: "pointer",
            }}
          >
            {RENDER_STYLES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleGenerateRender}
          disabled={rendering || configMissing}
          style={{
            padding: "12px 0",
            background: rendering || configMissing
              ? colors.cardSurface
              : `linear-gradient(135deg, ${colors.accent}, #0099cc)`,
            border: "none",
            borderRadius: radii.md,
            color: rendering || configMissing ? colors.textDim : colors.bg,
            fontSize: 13, fontWeight: 700, fontFamily: fonts.label,
            cursor: rendering || configMissing ? "not-allowed" : "pointer",
            letterSpacing: "0.3px",
          }}
        >
          {rendering ? "Rendering…" : "Generate Render"}
        </button>

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

        {rendering && <RenderSkeleton />}

        {renderResult && !rendering && (
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
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </div>
        )}

        {!renderResult && !rendering && !error && (
          <div style={{
            ...card, padding: "40px 20px",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 12, textAlign: "center",
          }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" opacity="0.3">
              <rect x="4" y="4" width="32" height="32" rx="4" stroke={colors.textDim} strokeWidth="2" />
              <path d="M4 30l10-8 6 5 6-10 10 13" stroke={colors.textDim} strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 12, color: colors.textDim }}>
              Rotate the floor plan to your desired angle, then click Generate.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function RenderSkeleton() {
  return (
    <div style={{
      ...card, padding: 0, overflow: "hidden",
      height: 280, position: "relative",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(110deg, ${colors.cardSurface} 8%, ${colors.surfaceHover} 18%, ${colors.cardSurface} 33%)`,
        backgroundSize: "200% 100%",
        animation: "hv-shimmer 1.5s infinite",
      }} />
      <style>{`@keyframes hv-shimmer { to { background-position: -200% 0; } }`}</style>
    </div>
  );
}

function ConfigMissing({ missingToken, missingSpace }) {
  const missing = [
    missingToken && "VITE_SMPLR_CLIENT_TOKEN",
    missingSpace && "VITE_SMPLR_SPACE_ID",
  ].filter(Boolean);

  return (
    <div style={{
      height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        maxWidth: 420, padding: 20,
        border: `1px solid ${colors.warn}`,
        borderRadius: radii.md,
        background: colors.warnDim,
        fontFamily: fonts.label,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.warn, marginBottom: 6 }}>
          Smplrspace configuration missing
        </div>
        <div style={{ fontSize: 12, color: colors.text, lineHeight: 1.5 }}>
          Set the following in <code style={{ color: colors.accent }}>frontend/.env</code>:
          <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
            {missing.map((v) => <li key={v} style={{ fontFamily: fonts.data }}>{v}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
