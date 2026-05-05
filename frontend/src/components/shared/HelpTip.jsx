import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colors, fonts, radii } from "../../theme/tokens";
import useBreakpoint from "../../hooks/useBreakpoint";

/**
 * HelpTip — compact "?" info icon that opens a small popover (desktop)
 * or a centered bottom-sheet (mobile). Built for homeowner self-service:
 * use it to demystify domain terms (IRR, MEP, zoning, "score", etc.).
 *
 * Props:
 *   title    — short label shown bold at the top
 *   body     — explanation text or React node
 *   size     — icon size in px (default 14)
 *   tone     — "info" (default cyan) | "warn" (amber) | "muted"
 *   inline   — render inline (default true). Set false to use as block.
 *   align    — popover anchor: "auto" | "left" | "right" | "center"
 *   children — optional trigger override (replaces default icon)
 */
export default function HelpTip({
  title,
  body,
  size = 14,
  tone = "info",
  inline = true,
  align = "auto",
  children,
}) {
  const isMobile = useBreakpoint(640);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, placement: "bottom" });
  const reactId = useId();
  const popoverId = `helptip-${reactId}`;

  const toneColor =
    tone === "warn" ? colors.warn : tone === "muted" ? colors.textDim : colors.accent;
  const toneBg =
    tone === "warn" ? "rgba(255,159,67,0.12)" :
    tone === "muted" ? "rgba(90,101,128,0.18)" :
    "rgba(0,212,255,0.12)";
  const toneBorder =
    tone === "warn" ? "rgba(255,159,67,0.45)" :
    tone === "muted" ? "rgba(90,101,128,0.45)" :
    "rgba(0,212,255,0.45)";

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) setOpen(false);
    };
    globalThis.addEventListener("keydown", onKey);
    globalThis.addEventListener("mousedown", onDown);
    globalThis.addEventListener("touchstart", onDown);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
      globalThis.removeEventListener("mousedown", onDown);
      globalThis.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  // Position popover (desktop only)
  useLayoutEffect(() => {
    if (!open || isMobile || !triggerRef.current || !popoverRef.current) return;
    const t = triggerRef.current.getBoundingClientRect();
    const p = popoverRef.current.getBoundingClientRect();
    const margin = 8;
    let placement = "bottom";
    let top = t.bottom + margin;
    if (top + p.height > window.innerHeight - 8) {
      top = t.top - p.height - margin;
      placement = "top";
    }
    let left;
    if (align === "left") left = t.left;
    else if (align === "right") left = t.right - p.width;
    else if (align === "center") left = t.left + t.width / 2 - p.width / 2;
    else left = t.left + t.width / 2 - p.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8));
    setPos({ top, left, placement });
  }, [open, isMobile, align]);

  const triggerStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: size + 4,
    height: size + 4,
    minWidth: size + 4,
    borderRadius: "50%",
    background: toneBg,
    border: `1px solid ${toneBorder}`,
    color: toneColor,
    cursor: "pointer",
    padding: 0,
    fontFamily: fonts.label,
    fontSize: Math.max(9, size - 4),
    fontWeight: 700,
    lineHeight: 1,
    transition: "transform 0.12s ease, background 0.15s ease",
    flexShrink: 0,
    verticalAlign: "middle",
    transform: open ? "scale(1.08)" : "scale(1)",
  };

  const wrapperStyle = inline
    ? { display: "inline-flex", alignItems: "center", gap: 6, verticalAlign: "middle" }
    : { display: "flex", alignItems: "center", gap: 6 };

  const trigger = children ? (
    <span
      ref={triggerRef}
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
      aria-describedby={open ? popoverId : undefined}
    >
      {children}
    </span>
  ) : (
    <button
      ref={triggerRef}
      type="button"
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      aria-label={`Help: ${title || "more info"}`}
      aria-expanded={open}
      aria-describedby={open ? popoverId : undefined}
      style={triggerStyle}
    >
      ?
    </button>
  );

  const popoverInner = (
    <div
      id={popoverId}
      role="tooltip"
      style={{
        background: colors.cardSurface,
        border: `1px solid ${toneBorder}`,
        borderRadius: radii.lg,
        padding: "12px 14px",
        color: colors.text,
        fontFamily: fonts.label,
        fontSize: 12.5,
        lineHeight: 1.5,
        boxShadow: "0 12px 36px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,212,255,0.05)",
        maxWidth: isMobile ? "min(420px, calc(100vw - 32px))" : 280,
        width: isMobile ? "min(420px, calc(100vw - 32px))" : "auto",
      }}
    >
      {title && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
          color: toneColor, fontWeight: 700, fontSize: 11,
          letterSpacing: 0.6, textTransform: "uppercase",
        }}>
          <span style={{
            width: 14, height: 14, borderRadius: "50%",
            background: toneBg, border: `1px solid ${toneBorder}`,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, color: toneColor,
          }}>i</span>
          <span>{title}</span>
        </div>
      )}
      <div style={{ color: colors.text }}>{body}</div>
      {isMobile && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            marginTop: 12, width: "100%",
            padding: "8px 12px", borderRadius: radii.md,
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            border: "none", color: "#fff",
            fontWeight: 600, fontSize: 12, cursor: "pointer",
            fontFamily: fonts.label,
          }}
        >Got it</button>
      )}
    </div>
  );

  const popover = open && (
    isMobile ? (
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed", inset: 0, zIndex: 1100,
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16,
        }}
      >
        <div ref={popoverRef} onClick={(e) => e.stopPropagation()}>
          {popoverInner}
        </div>
      </div>
    ) : (
      <div
        ref={popoverRef}
        style={{
          position: "fixed",
          top: pos.top, left: pos.left,
          zIndex: 1100,
          animation: "helptip-fade 0.14s ease-out",
        }}
      >
        {popoverInner}
      </div>
    )
  );

  return (
    <>
      <span style={wrapperStyle}>{trigger}</span>
      {popover && createPortal(popover, document.body)}
      <style>{`
        @keyframes helptip-fade {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
