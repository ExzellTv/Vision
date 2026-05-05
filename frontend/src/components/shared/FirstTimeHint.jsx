import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { colors, fonts, radii } from "../../theme/tokens";
import useBreakpoint from "../../hooks/useBreakpoint";

const KEY_PREFIX = "vision:tutorial:";

/**
 * FirstTimeHint — non-blocking welcome card shown once per screen on first visit.
 * Persists "seen" state in localStorage. Use for screens where the homeowner needs
 * a quick orientation (Floor Plan Editor, Layer Editor, Feasibility, etc.).
 *
 * Props:
 *   storageKey — unique screen id (e.g. "develop", "feasibility")
 *   title      — heading
 *   steps      — array of { icon?: ReactNode, text: string }
 *   accent     — color override (default cyan)
 */
export default function FirstTimeHint({ storageKey, title, steps = [], accent = colors.accent }) {
  const isMobile = useBreakpoint(640);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(KEY_PREFIX + storageKey);
      if (!seen) setTimeout(() => setOpen(true), 350);
    } catch { /* ignore */ }
  }, [storageKey]);

  const dismiss = () => {
    try { localStorage.setItem(KEY_PREFIX + storageKey, "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  if (!open) return null;

  const card = (
    <div
      onClick={dismiss}
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 20,
        animation: "fth-fade 0.2s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.cardSurface,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: isMobile ? `${radii.xl} ${radii.xl} 0 0` : radii.xl,
          width: "100%",
          maxWidth: 460,
          padding: isMobile ? "20px 18px 22px" : "24px",
          color: colors.text,
          fontFamily: fonts.label,
          boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
          animation: isMobile ? "fth-slide 0.28s ease-out" : "fth-pop 0.24s ease-out",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: `linear-gradient(135deg, ${accent}, ${colors.secondary})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 16, flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l2.39 4.84L20 8l-4 3.9.94 5.5L12 14.77l-4.94 2.6L8 11.9 4 8l5.61-1.16L12 2z" />
            </svg>
          </div>
          <h3 style={{
            margin: 0, color: colors.textBright, fontSize: 16, fontWeight: 700,
            letterSpacing: 0.2,
          }}>{title}</h3>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          {steps.map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: "rgba(0,212,255,0.12)",
                border: `1px solid ${accent}55`,
                color: accent, fontSize: 11, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginTop: 1,
              }}>{i + 1}</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: colors.text }}>
                {step.text}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={dismiss}
          style={{
            width: "100%", padding: "11px 16px",
            borderRadius: radii.md, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            color: "#fff", fontWeight: 600, fontSize: 13,
            fontFamily: fonts.label,
            boxShadow: "0 4px 16px rgba(37,99,235,0.35)",
          }}
        >Got it, let's go</button>
      </div>
      <style>{`
        @keyframes fth-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fth-pop  { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes fth-slide{ from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );

  return createPortal(card, document.body);
}
