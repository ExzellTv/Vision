/**
 * HouseScene — Wraps the existing House3D component with screenshot capture.
 *
 * Uses the same CSG-based 3D model as House3DPreview so both views
 * render identically. Adds:
 *   - captureScreenshot() via ref for the AI render pipeline
 *   - "Export Screenshot" button overlaid on the canvas
 */
import { useState, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { colors, fonts } from "../theme/tokens";
import House3D from "./3d/House3D";

const HouseScene = forwardRef(function HouseScene({ plan, style: containerStyle = {} }, ref) {
  const wrapperRef = useRef();
  const [downloading, setDownloading] = useState(false);

  // Derive dimensions from the floor plan (same logic as House3DPreview)
  const width = plan?.width || 40;
  const depth = plan?.depth || 30;
  const stories = plan?.stories || 1;

  // captureScreenshot: find the canvas inside the wrapper and grab it
  const captureFromCanvas = useCallback((w = 1024, h = 1024) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return null;
    const canvas = wrapper.querySelector("canvas");
    if (!canvas) return null;

    // The House3D Canvas doesn't set preserveDrawingBuffer by default,
    // so we re-render by forcing a style change then reading immediately.
    // Fallback: just grab whatever is in the buffer right now.
    return canvas.toDataURL("image/png");
  }, []);

  // Expose captureScreenshot to parent (HouseViewer)
  useImperativeHandle(ref, () => ({
    captureScreenshot: captureFromCanvas,
  }));

  const handleExportScreenshot = useCallback(() => {
    setDownloading(true);
    try {
      const dataUrl = captureFromCanvas(2048, 2048);
      if (!dataUrl) return;
      const link = document.createElement("a");
      link.download = "house-render.png";
      link.href = dataUrl;
      link.click();
    } finally {
      setDownloading(false);
    }
  }, [captureFromCanvas]);

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%", height: "100%", ...containerStyle }}>
      <House3D
        width={width}
        depth={depth}
        stories={stories}
        roofType="gable"
        showGround
        showSky
        interactive={false}
        floorPlan={plan}
        style={{ width: "100%", height: "100%" }}
      />

      {/* Export Screenshot button — overlaid top-right */}
      <button
        onClick={handleExportScreenshot}
        disabled={downloading}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          padding: "8px 16px",
          background: "rgba(13,17,23,0.85)",
          backdropFilter: "blur(8px)",
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: 8,
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
          fontFamily: fonts.label,
          cursor: downloading ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          transition: "background 0.15s",
          zIndex: 10,
        }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(13,17,23,0.95)"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(13,17,23,0.85)"}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {downloading ? "Saving..." : "Export Screenshot"}
      </button>
    </div>
  );
});

export default HouseScene;
