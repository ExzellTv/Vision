/**
 * FloorPlanViewer — Smplrspace interactive 2D/3D floor plan embed.
 *
 * Smplrspace's JS SDK is viewer-only — there's no in-browser edit API.
 * This component:
 *   - Loads smplr.js lazily via @smplrspace/smplr-loader.
 *   - Instantiates smplr.Space and calls startViewer() with configurable camera mode.
 *   - Switches between 2D and 3D via space.setMode() when the prop changes
 *     (no full re-mount required).
 *   - Exposes captureScreenshot() via ref using the native takeScreenshotToString(),
 *     falling back to html2canvas on the container if the native API fails.
 *
 * To actually edit the floor plan, open app.smplrspace.com in a new tab
 * (the HouseViewer provides that link).
 */
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { loadSmplrJs } from "@smplrspace/smplr-loader";
import html2canvas from "html2canvas";
import { colors, fonts } from "../theme/tokens";

let _idCounter = 0;
const nextId = () => `smplr-container-${++_idCounter}`;

const maskToken = (t) => (t ? `${t.slice(0, 6)}…${t.slice(-4)}` : "(none)");

const FloorPlanViewer = forwardRef(function FloorPlanViewer(
  { spaceId, clientToken, onViewerReady, cameraMode = "3d" },
  ref
) {
  const containerIdRef = useRef(nextId());
  const containerRef = useRef(null);
  const spaceRef = useRef(null);
  const readyRef = useRef(false);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");

  // Screenshot — prefer the native API (returns a data URL), fall back to html2canvas.
  const captureScreenshot = useCallback(async () => {
    const space = spaceRef.current;
    const container = containerRef.current;

    if (space && typeof space.takeScreenshotToString === "function") {
      try {
        return await space.takeScreenshotToString({ mode: "full-viewer" });
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[Vision] takeScreenshotToString failed, falling back", err);
      }
    }

    if (!container) return null;
    const canvas = await html2canvas(container, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
    });
    return canvas.toDataURL("image/png");
  }, []);

  useImperativeHandle(ref, () => ({ captureScreenshot }), [captureScreenshot]);

  useEffect(() => {
    if (!spaceId || !clientToken) {
      setStatus("error");
      setErrorMsg(
        clientToken
          ? "Missing VITE_SMPLR_SPACE_ID"
          : "Missing VITE_SMPLR_CLIENT_TOKEN"
      );
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setErrorMsg("");
    readyRef.current = false;

    if (import.meta.env.DEV) {
      console.log("[Vision] Smplrspace init — spaceId:", spaceId, "token:", maskToken(clientToken));
    }

    loadSmplrJs("esm")
      .then((smplr) => {
        if (cancelled) return;
        const space = new smplr.Space({
          spaceId,
          clientToken,
          containerId: containerIdRef.current,
        });
        spaceRef.current = space;

        space.startViewer({
          preview: true,
          loadingMessage: "Loading floor plan…",
          mode: cameraMode,
          allowModeChange: true,
          onReady: () => {
            if (cancelled) return;
            readyRef.current = true;
            setStatus("ready");
            if (onViewerReady) onViewerReady(space);
          },
          onError: (err) => {
            if (cancelled) return;
            setStatus("error");
            setErrorMsg(typeof err === "string" ? err : (err?.message || "Viewer crashed"));
            if (import.meta.env.DEV) console.error("[Vision] Smplrspace error:", err);
          },
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(err?.message || "Failed to load Smplrspace");
        if (import.meta.env.DEV) console.error("[Vision] loadSmplrJs failed:", err);
      });

    return () => {
      cancelled = true;
      const space = spaceRef.current;
      if (space) {
        try {
          if (typeof space.remove === "function") space.remove();
          else if (typeof space.destroy === "function") space.destroy();
        } catch (err) {
          if (import.meta.env.DEV) console.warn("[Vision] Smplrspace cleanup warning:", err);
        }
        spaceRef.current = null;
      }
    };
    // cameraMode intentionally excluded — mode changes are applied via setMode below
    // without re-initializing the viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, clientToken, onViewerReady]);

  // Live 2D/3D switching once the viewer is ready.
  useEffect(() => {
    const space = spaceRef.current;
    if (!readyRef.current || !space || typeof space.setMode !== "function") return;
    try {
      space.setMode(cameraMode);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[Vision] setMode failed", err);
    }
  }, [cameraMode, status]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 500 }}>
      <div
        id={containerIdRef.current}
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 500,
          background: colors.panel,
          borderRadius: 6,
          overflow: "hidden",
        }}
      />

      {status === "loading" && (
        <Overlay>
          <Spinner />
          <span style={{ fontSize: 13, color: colors.textDim, fontFamily: fonts.label }}>
            Loading floor plan…
          </span>
        </Overlay>
      )}

      {status === "error" && (
        <Overlay>
          <div style={{
            maxWidth: 360, textAlign: "center",
            padding: "18px 22px", borderRadius: 8,
            border: `1px solid ${colors.danger}`,
            background: colors.dangerDim,
            fontFamily: fonts.label,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.danger, marginBottom: 6 }}>
              Floor plan viewer error
            </div>
            <div style={{ fontSize: 12, color: colors.text }}>{errorMsg}</div>
          </div>
        </Overlay>
      )}
    </div>
  );
});

function Overlay({ children }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 12,
      background: "rgba(13,17,23,0.75)",
      backdropFilter: "blur(4px)",
      pointerEvents: "none",
    }}>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <>
      <svg width="28" height="28" viewBox="0 0 28 28" style={{ animation: "smplr-spin 1s linear infinite" }}>
        <circle cx="14" cy="14" r="10" stroke={colors.accent} strokeWidth="2.5"
                fill="none" strokeDasharray="40" strokeDashoffset="12" strokeLinecap="round" />
      </svg>
      <style>{`@keyframes smplr-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

export default FloorPlanViewer;
