import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { colors, fonts, radii } from "../../theme/tokens";
import { projectsApi } from "../../services/api";

/* ── Relative-time helper (local to this module) ─────────────────────────── */
function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ago`;
  if (h >= 1) return `${h}h ago`;
  if (m >= 1) return `${m}m ago`;
  return "just now";
}

/* ── ImportModelModal ─────────────────────────────────────────────────────── */
export default function ImportModelModal({ onImport, onClose }) {
  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [hoverId,  setHoverId]  = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await projectsApi.list();
      setProjects(list || []);
    } catch (err) {
      setError(err.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  // Fetch on mount
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key dismisses
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const modal = (
    /* Backdrop — click outside to close */
    <div
      onClick={onClose}
      style={{
        position:       "fixed",
        inset:          0,
        background:     "rgba(0,0,0,0.72)",
        zIndex:         1000,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
      }}
    >
      {/* Card — stopPropagation so clicks inside don't close */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:    colors.cardSurface,
          border:        `1px solid ${colors.cardBorder}`,
          borderRadius:  radii.xl,
          width:         480,
          maxHeight:     520,
          display:       "flex",
          flexDirection: "column",
          overflow:      "hidden",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display:        "flex",
          alignItems:     "flex-start",
          justifyContent: "space-between",
          padding:        "16px 20px 14px",
          borderBottom:   `1px solid ${colors.cardBorder}`,
          flexShrink:     0,
        }}>
          <div>
            <div style={{
              fontFamily: fonts.label, fontSize: 15, fontWeight: 700,
              color:      colors.textBright,
            }}>
              Import Project Model
            </div>
            <div style={{
              fontFamily: fonts.label, fontSize: 11, color: colors.textDim,
              marginTop:  3,
            }}>
              Select a project to import its specs into the analysis
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background:  "transparent",
              border:      "none",
              color:       colors.textDim,
              fontSize:    20,
              cursor:      "pointer",
              padding:     "0 4px",
              lineHeight:  1,
              fontFamily:  fonts.data,
              marginTop:   2,
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: "auto" }}>

          {/* Loading state */}
          {loading && (
            <div style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              padding:        "52px 0",
              fontFamily:     fonts.label,
              fontSize:       12,
              color:          colors.textDim,
            }}>
              Loading projects…
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div style={{
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              justifyContent: "center",
              padding:        "44px 24px",
              gap:            12,
            }}>
              <div style={{
                fontFamily: fonts.label, fontSize: 12,
                color:      colors.danger, textAlign: "center",
              }}>
                {error}
              </div>
              <button
                onClick={load}
                style={{
                  padding:      "7px 18px",
                  background:   "transparent",
                  border:       `1px solid ${colors.accent}`,
                  borderRadius: radii.md,
                  color:        colors.accent,
                  fontFamily:   fonts.label, fontSize: 12, fontWeight: 600,
                  cursor:       "pointer",
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && projects.length === 0 && (
            <div style={{
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              justifyContent: "center",
              padding:        "52px 24px",
              gap:            8,
              textAlign:      "center",
            }}>
              <div style={{
                fontFamily: fonts.label, fontSize: 13, fontWeight: 600,
                color:      colors.textBright,
              }}>
                No saved projects found
              </div>
              <div style={{
                fontFamily: fonts.label, fontSize: 11, color: colors.textDim,
                maxWidth:   290, lineHeight: 1.65,
              }}>
                Create a project in the Develop tab first, then return here to import it.
              </div>
            </div>
          )}

          {/* Project list */}
          {!loading && !error && projects.map((proj) => {
            const gp       = proj.generate_params || {};
            const hasSF    = Boolean(gp.targetSF);
            const isHovered = hoverId === proj.id;

            return (
              <div
                key={proj.id}
                onClick={() => onImport(proj)}
                onMouseEnter={() => setHoverId(proj.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "space-between",
                  padding:        "12px 20px",
                  borderBottom:   `1px solid ${colors.cardBorder}`,
                  cursor:         "pointer",
                  background:     isHovered ? colors.surfaceHover : "transparent",
                  transition:     "background 0.12s ease",
                  opacity:        hasSF ? 1 : 0.5,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Project name */}
                  <div style={{
                    fontFamily:   fonts.label, fontSize: 13, fontWeight: 600,
                    color:        colors.textBright,
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace:   "nowrap",
                    marginBottom: 3,
                  }}>
                    {proj.name || "Untitled Project"}
                  </div>
                  {/* Specs line */}
                  <div style={{
                    fontFamily: fonts.data, fontSize: 10, color: colors.textDim,
                  }}>
                    {hasSF
                      ? `${gp.targetSF.toLocaleString()} SF · ${gp.bedrooms ?? "—"}bd / ${gp.bathrooms ?? "—"}ba · ${gp.stories ?? 1}-story`
                      : "No parameters — will use current project specs"
                    }
                  </div>
                </div>
                {/* Relative timestamp */}
                <div style={{
                  fontFamily: fonts.data, fontSize: 9,
                  color:      colors.textDim,
                  marginLeft: 16, flexShrink: 0,
                  textAlign:  "right",
                }}>
                  {timeAgo(proj.updated_at)}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div style={{
          borderTop:  `1px solid ${colors.cardBorder}`,
          padding:    "12px 20px",
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              width:        "100%",
              padding:      "9px 0",
              background:   "transparent",
              border:       `1px solid ${colors.cardBorder}`,
              borderRadius: radii.md,
              color:        colors.textDim,
              fontFamily:   fonts.label, fontSize: 13, fontWeight: 600,
              cursor:       "pointer",
              transition:   "border-color 0.12s",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
