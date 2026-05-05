import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { colors, fonts, radii } from "../../theme/tokens";
import useBreakpoint from "../../hooks/useBreakpoint";

const KEY_PREFIX = "vision:tour:";
const PAD = 8;        // spotlight padding around the target
const GAP = 16;       // gap between target and tip card
const TIP_W = 340;    // desktop tooltip width

/**
 * GuidedTour — multi-step spotlight walkthrough. Replaces FirstTimeHint.
 *
 * Each step targets a real DOM element via a CSS selector, dims the rest of
 * the screen, draws an animated arrow at the target, and shows a tooltip
 * card with title/body + Back/Next/Skip controls. Auto-scrolls the target
 * into view. If a step has no `target`, the card centers like a modal.
 *
 * Usage:
 *   <GuidedTour
 *     storageKey="develop"
 *     title="Floor Plan Studio"
 *     steps={[
 *       { target: '[data-tour="library"]', title: "Component Library",
 *         body: "Drag any tile onto the canvas to add it.", placement: "right" },
 *       { target: '[data-tour="canvas"]', title: "The canvas",
 *         body: "Each square is half a foot.", placement: "left" },
 *       { title: "You're ready", body: "Hit Continue when you're done." },
 *     ]}
 *   />
 *
 *   // Replay anywhere:
 *   window.dispatchEvent(new CustomEvent("vision:tour:replay", { detail: "develop" }));
 *
 * Add `data-tour="..."` attributes to elements you want spotlighted.
 */
export default function GuidedTour({
  storageKey,
  title,
  steps = [],
  accent = colors.accent,
  autoStart = true,
  onClose,
}) {
  const isMobile = useBreakpoint(640);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);   // target rect or null = centered
  const [tipPos, setTipPos] = useState({ top: 0, left: 0, placement: "bottom" });
  const tipRef = useRef(null);

  /* ── Open on first visit ── */
  useEffect(() => {
    if (!autoStart) return;
    try {
      const seen = localStorage.getItem(KEY_PREFIX + storageKey);
      if (!seen) {
        const id = setTimeout(() => { setIdx(0); setOpen(true); }, 350);
        return () => clearTimeout(id);
      }
    } catch { /* ignore */ }
  }, [storageKey, autoStart]);

  /* ── Replay listener ── */
  useEffect(() => {
    const handler = (e) => {
      if (!e?.detail || e.detail === storageKey) {
        setIdx(0); setOpen(true);
      }
    };
    globalThis.addEventListener("vision:tour:replay", handler);
    return () => globalThis.removeEventListener("vision:tour:replay", handler);
  }, [storageKey]);

  const current = steps[idx] || null;

  /* ── Find target & measure ── */
  const measure = useCallback(() => {
    if (!current) return;
    if (!current.target) { setRect(null); return; }
    const el = document.querySelector(current.target);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [current]);

  /* ── On step change: scroll into view, then measure ── */
  // If a step's target isn't in the DOM, the step still shows — just centered
  // like the intro/outro modal. Tours never auto-advance: the user clicks Next.
  useEffect(() => {
    if (!open || !current) return;
    if (current.target) {
      const el = document.querySelector(current.target);
      if (el?.scrollIntoView) {
        try { el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); } catch { /* ignore */ }
      }
      // Measure now AND after the scroll settles
      measure();
      const t1 = setTimeout(measure, 200);
      const t2 = setTimeout(measure, 500);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    } else {
      setRect(null);
    }
  }, [open, idx, current, measure]);

  /* ── Reposition on resize/scroll ── */
  useEffect(() => {
    if (!open) return;
    const onChange = () => measure();
    globalThis.addEventListener("resize", onChange);
    globalThis.addEventListener("scroll", onChange, true);
    return () => {
      globalThis.removeEventListener("resize", onChange);
      globalThis.removeEventListener("scroll", onChange, true);
    };
  }, [open, measure]);

  /* ── Compute tooltip placement ── */
  useLayoutEffect(() => {
    if (!open || !tipRef.current) return;
    const tip = tipRef.current.getBoundingClientRect();
    const vw = globalThis.innerWidth;
    const vh = globalThis.innerHeight;

    if (!rect) {
      // Centered (no target)
      setTipPos({
        top: Math.max(16, (vh - tip.height) / 2),
        left: Math.max(16, (vw - tip.width) / 2),
        placement: "center",
      });
      return;
    }

    // Mobile: dock to top or bottom of viewport based on which half the target is in
    if (isMobile) {
      const targetMidY = rect.top + rect.height / 2;
      const placement = targetMidY > vh / 2 ? "top-sheet" : "bottom-sheet";
      const top = placement === "top-sheet" ? 12 : vh - tip.height - 12;
      setTipPos({ top, left: 16, placement });
      return;
    }

    // Desktop placement preference + fallback
    const desired = current?.placement || "auto";
    const room = {
      bottom: vh - (rect.top + rect.height) - GAP - 16,
      top:    rect.top - GAP - 16,
      right:  vw - (rect.left + rect.width) - GAP - 16,
      left:   rect.left - GAP - 16,
    };
    const fits = {
      bottom: room.bottom > tip.height,
      top:    room.top > tip.height,
      right:  room.right > tip.width,
      left:   room.left > tip.width,
    };
    let placement = desired;
    if (desired === "auto" || !fits[desired]) {
      placement = fits.bottom ? "bottom"
        : fits.top ? "top"
        : fits.right ? "right"
        : fits.left ? "left"
        : "bottom";
    }

    let top, left;
    if (placement === "bottom") {
      top = rect.top + rect.height + GAP;
      left = rect.left + rect.width / 2 - tip.width / 2;
    } else if (placement === "top") {
      top = rect.top - GAP - tip.height;
      left = rect.left + rect.width / 2 - tip.width / 2;
    } else if (placement === "right") {
      top = rect.top + rect.height / 2 - tip.height / 2;
      left = rect.left + rect.width + GAP;
    } else {
      top = rect.top + rect.height / 2 - tip.height / 2;
      left = rect.left - GAP - tip.width;
    }
    top = Math.max(16, Math.min(top, vh - tip.height - 16));
    left = Math.max(16, Math.min(left, vw - tip.width - 16));
    setTipPos({ top, left, placement });
  }, [open, idx, rect, isMobile, current]);

  /* ── Controls ── */
  const last = idx === steps.length - 1;
  const finish = useCallback(() => {
    try { localStorage.setItem(KEY_PREFIX + storageKey, "1"); } catch { /* ignore */ }
    setOpen(false);
    setIdx(0);
    onClose?.();
  }, [storageKey, onClose]);
  const next = useCallback(
    () => (last ? finish() : setIdx((i) => Math.min(i + 1, steps.length - 1))),
    [last, finish, steps.length]
  );
  const back = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  /* ── Keyboard nav: Esc closes, ←/→ navigate steps ── */
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [open, next, back, finish]);

  if (!open || !current) return null;

  /* ── Spotlight rect (with padding, clamped) ── */
  const sp = rect && {
    top:    Math.max(0, rect.top - PAD),
    left:   Math.max(0, rect.left - PAD),
    width:  rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  };

  /* ── Tip-card arrow notch ── */
  const arrowNotch = (() => {
    if (!sp || tipPos.placement === "center") return null;
    if (tipPos.placement === "top-sheet" || tipPos.placement === "bottom-sheet") return null;
    const tipR = tipRef.current?.getBoundingClientRect();
    if (!tipR) return null;
    if (tipPos.placement === "bottom" || tipPos.placement === "top") {
      const x = Math.max(20, Math.min(rect.left + rect.width / 2 - tipPos.left, tipR.width - 20));
      return { x, side: tipPos.placement };
    }
    const y = Math.max(20, Math.min(rect.top + rect.height / 2 - tipPos.top, tipR.height - 20));
    return { y, side: tipPos.placement };
  })();

  /* ── Arrow finger pointing at target ── */
  const fingerArrow = (() => {
    if (!sp) return null;
    if (tipPos.placement === "center") return null;
    if (tipPos.placement === "top-sheet" || tipPos.placement === "bottom-sheet") return null;
    const cx = sp.left + sp.width / 2;
    const cy = sp.top + sp.height / 2;
    if (tipPos.placement === "bottom") {
      // Arrow above tip, pointing down at target's bottom edge
      return { left: cx - 14, top: sp.top + sp.height + 4, rotate: 0, anim: "gt-bounce-y" };
    }
    if (tipPos.placement === "top") {
      return { left: cx - 14, top: sp.top - 32, rotate: 180, anim: "gt-bounce-y" };
    }
    if (tipPos.placement === "right") {
      return { left: sp.left + sp.width + 4, top: cy - 14, rotate: -90, anim: "gt-bounce-x" };
    }
    return { left: sp.left - 32, top: cy - 14, rotate: 90, anim: "gt-bounce-x" };
  })();

  const tipWidth = isMobile ? "calc(100vw - 32px)" : TIP_W;
  const dim = "rgba(0,0,0,0.62)";

  const overlay = (
    <div style={{ position: "fixed", inset: 0, zIndex: 1300, animation: "gt-fade 0.18s ease-out" }}>
      {/* Dim mask: 4 divs around the spotlight (lets clicks pass through inside the cutout) */}
      {sp ? (
        <>
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: sp.top, background: dim }} />
          <div style={{ position: "fixed", top: sp.top + sp.height, left: 0, right: 0, bottom: 0, background: dim }} />
          <div style={{ position: "fixed", top: sp.top, height: sp.height, left: 0, width: sp.left, background: dim }} />
          <div style={{ position: "fixed", top: sp.top, height: sp.height, left: sp.left + sp.width, right: 0, background: dim }} />
          {/* Highlight ring */}
          <div style={{
            position: "fixed",
            top: sp.top, left: sp.left, width: sp.width, height: sp.height,
            border: `2px solid ${accent}`,
            borderRadius: 10,
            pointerEvents: "none",
            animation: "gt-glow 1.6s ease-in-out infinite",
          }} />
        </>
      ) : (
        // Centered step — full backdrop
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }} />
      )}

      {/* Animated finger arrow pointing at target (desktop, sided placement) */}
      {fingerArrow && (
        <div style={{
          position: "fixed",
          top: fingerArrow.top, left: fingerArrow.left,
          width: 28, height: 28,
          pointerEvents: "none",
          animation: `${fingerArrow.anim} 1.2s ease-in-out infinite`,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
            style={{ transform: `rotate(${fingerArrow.rotate}deg)`, filter: `drop-shadow(0 2px 8px ${accent})` }}>
            <path d="M12 22V4M5 11l7-7 7 7"
              stroke={accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
              fill={`${accent}22`} />
          </svg>
        </div>
      )}

      {/* Tooltip card */}
      <div
        ref={tipRef}
        role="dialog"
        aria-label={`${title} tutorial step ${idx + 1} of ${steps.length}`}
        style={{
          position: "fixed",
          top: tipPos.top, left: tipPos.left,
          width: tipWidth, maxWidth: "calc(100vw - 32px)",
          background: colors.cardSurface,
          border: `1px solid ${accent}55`,
          borderRadius: radii.xl,
          color: colors.text,
          fontFamily: fonts.label,
          boxShadow: `0 24px 70px rgba(0,0,0,0.6), 0 0 0 1px ${accent}25`,
          animation: "gt-pop 0.22s cubic-bezier(0.2,1.2,0.4,1)",
        }}
      >
        {arrowNotch && <TipNotch at={arrowNotch} />}

        {/* Header */}
        <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${colors.cardBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontSize: 10, fontWeight: 700, letterSpacing: "0.85px",
              textTransform: "uppercase", color: accent,
              minWidth: 0,
            }}>
              <SparkIcon color={accent} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {title} · Step {idx + 1} / {steps.length}
              </span>
            </span>
            <button
              onClick={finish}
              aria-label="Skip tour"
              title="Skip tour"
              style={{
                background: "none", border: "none", color: colors.textDim,
                cursor: "pointer", padding: "2px 4px", lineHeight: 1,
                fontSize: 14, fontWeight: 600, fontFamily: fonts.label,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = colors.textBright)}
              onMouseLeave={(e) => (e.currentTarget.style.color = colors.textDim)}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: colors.textBright, lineHeight: 1.3 }}>
            {current.title}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "12px 16px 14px", fontSize: 13, lineHeight: 1.6, color: colors.text }}>
          {current.body}
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 16px 14px",
          borderTop: `1px solid ${colors.cardBorder}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          flexWrap: "wrap",
        }}>
          {/* Progress dots */}
          <div style={{ display: "flex", gap: 5, flex: 1, minWidth: 0, alignItems: "center" }}>
            {steps.map((s, i) => {
              const dotKey = `${storageKey}-dot-${s.title || i}`;
              let dotOpacity;
              if (i === idx) dotOpacity = 1;
              else if (i < idx) dotOpacity = 0.6;
              else dotOpacity = 0.45;
              return (
                <button
                  key={dotKey}
                  type="button"
                  aria-label={`Jump to step ${i + 1}`}
                  onClick={() => setIdx(i)}
                  style={{
                    width: i === idx ? 22 : 6,
                    height: 6,
                    borderRadius: 3,
                    background: i <= idx ? accent : colors.cardBorder,
                    opacity: dotOpacity,
                    transition: "width 0.2s ease, background 0.2s ease, opacity 0.2s ease",
                    cursor: "pointer",
                    flexShrink: 0,
                    border: "none",
                    padding: 0,
                  }}
                />
              );
            })}
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {idx > 0 && (
              <button
                onClick={back}
                style={{
                  padding: "7px 12px",
                  borderRadius: radii.md,
                  border: `1px solid ${colors.cardBorder}`,
                  background: "transparent",
                  color: colors.text,
                  fontSize: 12, fontWeight: 600,
                  fontFamily: fonts.label,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.cardBorder; }}
              >
                ← Back
              </button>
            )}
            <button
              onClick={next}
              autoFocus
              style={{
                padding: "7px 16px",
                borderRadius: radii.md,
                border: "none",
                background: `linear-gradient(135deg, ${accent}, #0099cc)`,
                color: "#0d1117",
                fontSize: 12, fontWeight: 700,
                fontFamily: fonts.label,
                cursor: "pointer",
                boxShadow: `0 4px 14px ${accent}55`,
                letterSpacing: "0.3px",
              }}
            >
              {last ? "Got it →" : "Next →"}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes gt-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gt-pop  {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes gt-glow {
          0%, 100% { box-shadow: 0 0 0 4px ${accent}33, 0 0 24px ${accent}55; }
          50%      { box-shadow: 0 0 0 6px ${accent}55, 0 0 38px ${accent}aa; }
        }
        @keyframes gt-bounce-y {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(6px); }
        }
        @keyframes gt-bounce-x {
          0%, 100% { transform: translateX(0); }
          50%      { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );

  return createPortal(overlay, document.body);
}

/* ── Tip-card arrow notch (CSS triangle) ── */
function TipNotch({ at }) {
  const size = 10;
  const fill = colors.cardSurface;
  const base = { position: "absolute", width: 0, height: 0, borderStyle: "solid", pointerEvents: "none" };
  if (at.side === "bottom") {
    return <div style={{
      ...base,
      top: -size, left: at.x - size,
      borderWidth: `0 ${size}px ${size}px ${size}px`,
      borderColor: `transparent transparent ${fill} transparent`,
    }} />;
  }
  if (at.side === "top") {
    return <div style={{
      ...base,
      bottom: -size, left: at.x - size,
      borderWidth: `${size}px ${size}px 0 ${size}px`,
      borderColor: `${fill} transparent transparent transparent`,
    }} />;
  }
  if (at.side === "right") {
    return <div style={{
      ...base,
      top: at.y - size, left: -size,
      borderWidth: `${size}px ${size}px ${size}px 0`,
      borderColor: `transparent ${fill} transparent transparent`,
    }} />;
  }
  return <div style={{
    ...base,
    top: at.y - size, right: -size,
    borderWidth: `${size}px 0 ${size}px ${size}px`,
    borderColor: `transparent transparent transparent ${fill}`,
  }} />;
}

function SparkIcon({ color }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
      <path d="M12 2l2.39 4.84L20 8l-4 3.9.94 5.5L12 14.77l-4.94 2.6L8 11.9 4 8l5.61-1.16L12 2z" />
    </svg>
  );
}
