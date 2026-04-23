import { useEffect } from "react";
import { createPortal } from "react-dom";
import { colors, fonts } from "../../theme/tokens";

const C = {
  card: "#1a2233",
  cardBorder: "#2a3548",
  accent: "#00d4ff",
  textBright: "#f0f6ff",
  text: "#8b9db8",
  textDim: "#4a5568",
  success: "#2ed573",
  secondary: "#3b82f6",
  bg: colors.bg,
};

/**
 * Homeowner-facing builder profile modal.
 * Used by Browse and Chat when a homeowner clicks "View Profile".
 *
 * Props:
 *  - builder: builder object (see data/builders.js)
 *  - onClose: close handler
 *  - onRequest (optional): when provided, renders a "Send a Request" CTA
 *  - onMessage (optional): when provided, renders a "Message Builder" CTA
 */
export default function BuilderProfileModal({ builder, onClose, onRequest, onMessage }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!builder) return null;

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20,
      }}
    >
      <dialog
        open
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative", margin: 0, padding: 0, border: "none",
          background: C.card, borderRadius: 12, width: "100%", maxWidth: 640, maxHeight: "90vh",
          display: "flex", flexDirection: "column", color: C.text, fontFamily: fonts.label,
          overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "24px", borderBottom: `1px solid ${C.cardBorder}`,
          background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(29,78,216,0.02))",
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 14,
            background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, fontWeight: 700, color: "#fff", flexShrink: 0,
          }}>
            {builder.initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.textBright }}>{builder.name}</h2>
              {builder.verified && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
                  background: "rgba(46,213,115,0.1)", border: "1px solid rgba(46,213,115,0.25)",
                  borderRadius: 4, fontSize: 10, fontWeight: 600, color: C.success,
                }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2 2 4-4" stroke={C.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  VERIFIED
                </div>
              )}
            </div>
            {builder.company && <div style={{ fontSize: 13, color: C.text, marginBottom: 2 }}>{builder.company}</div>}
            {builder.location && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.textDim }}>
                <svg width="10" height="12" viewBox="0 0 10 12" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M5 0C2.79 0 1 1.79 1 4c0 3 4 8 4 8s4-5 4-8c0-2.21-1.79-4-4-4Z" fill={C.secondary} />
                  <circle cx="5" cy="4" r="1.5" fill="rgba(10,18,32,0.9)" />
                </svg>
                {builder.location}{builder.distance ? ` · ${builder.distance}` : ""}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: C.textDim, fontSize: 22, cursor: "pointer", lineHeight: 1 }}
            aria-label="Close"
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <div style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: "14px" }}>
              <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Rating</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1l1.5 3.5L12 5l-2.5 2.5.5 3.5L7 9.5 4 11l.5-3.5L2 5l3.5-.5L7 1z" fill="#fbbf24" />
                </svg>
                <span style={{ fontSize: 18, fontWeight: 700, color: C.textBright }}>{builder.rating ?? "—"}</span>
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{builder.reviews ?? 0} reviews</div>
            </div>
            <div style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: "14px" }}>
              <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Projects</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.textBright }}>{builder.projectsCompleted ?? "—"}</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>completed</div>
            </div>
            <div style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: "14px" }}>
              <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Specialty</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.textBright, lineHeight: 1.3 }}>{builder.specialty ?? "—"}</div>
            </div>
          </div>

          {/* About */}
          {builder.description && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>About</div>
              <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.6 }}>{builder.description}</p>
            </div>
          )}

          {/* Tags */}
          {builder.tags?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>Specializations</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {builder.tags.map((tag) => (
                  <span key={tag} style={{
                    padding: "5px 12px", background: "rgba(59,130,246,0.1)",
                    border: "1px solid rgba(59,130,246,0.2)", borderRadius: 4,
                    fontSize: 12, color: C.secondary,
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${C.cardBorder}`, padding: "14px 24px", display: "flex", gap: 10, flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "10px 0", background: "transparent",
              border: `1px solid ${C.cardBorder}`, borderRadius: 8,
              color: C.textDim, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Close
          </button>
          {onMessage && (
            <button
              onClick={() => { onClose(); onMessage(builder); }}
              style={{
                flex: 1, padding: "10px 0", background: "transparent",
                border: `1px solid ${C.secondary}`, borderRadius: 8,
                color: C.secondary, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Message
            </button>
          )}
          {onRequest && (
            <button
              onClick={() => { onClose(); onRequest(builder); }}
              style={{
                flex: 2, padding: "10px 0",
                background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                border: "none", borderRadius: 8,
                color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              Send a Request →
            </button>
          )}
        </div>
      </dialog>
    </div>
  );

  return createPortal(modal, document.body);
}
