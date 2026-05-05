import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { colors, fonts } from "../../theme/tokens";
import { projectsApi, builderRequestsApi } from "../../services/api";
import { BUILDERS, SPECIALTIES } from "../../data/builders";
import BuilderProfileModal from "../../components/shared/BuilderProfileModal";
import { useProject } from "../../hooks/useProjectStore";
import HelpTip from "../../components/shared/HelpTip";
import FirstTimeHint from "../../components/shared/FirstTimeHint";
import { useUserType } from "../../context/UserTypeContext";

const C = {
  bg: colors.bg,
  card: "#1a2233",
  cardBorder: "#2a3548",
  accent: "#00d4ff",
  textBright: "#f0f6ff",
  text: "#8b9db8",
  textDim: "#4a5568",
  success: "#2ed573",
  secondary: "#3b82f6",
};

// Returns { ready: bool, reasons: string[] } for a project
function getProjectReadiness(proj) {
  const reasons = [];
  const fp = proj.floor_plan || proj.floorPlan;
  if (!fp?.rooms?.length) reasons.push("No floor plan generated");
  if (proj.plot?.lat == null || proj.plot?.lng == null) reasons.push("No plot selected");
  return { ready: reasons.length === 0, reasons };
}

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

function RequestModal({ builder, onClose }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // selected = project the user clicked; confirmed = request was sent
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(null);  // project id currently being submitted
  const [confirmed, setConfirmed] = useState(null);    // project id successfully sent
  const [submitError, setSubmitError] = useState(null);
  const [sentProjectIds, setSentProjectIds] = useState(new Set());

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

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    builderRequestsApi.list()
      .then((reqs) => {
        const ids = new Set(
          reqs
            .filter((r) => String(r.builder_id) === String(builder.id))
            .map((r) => r.project_id)
        );
        setSentProjectIds(ids);
      })
      .catch(() => { });
  }, [builder.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        if (selected && !confirmed) { setSelected(null); return; }
        onClose();
      }
    };
    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [onClose, selected, confirmed]);

  // ── Detail view (after picking a project) ──────────────────────────────────
  const ROOM_TYPES = new Set(["bedroom", "bathroom", "kitchen", "living", "dining", "garage", "hallway", "closet", "laundry", "entry", "stair", "office"]);

  const DetailView = ({ proj }) => {
    const gp = proj.generate_params || {};
    const fp = proj.floor_plan || proj.floorPlan || {};
    const allItems = fp.rooms || [];
    const rooms = allItems.filter(r => r.isRoom === true || ROOM_TYPES.has((r.type || "").toLowerCase()));
    const bedrooms = rooms.filter((r) => r.type?.toLowerCase().includes("bed")).length || gp.bedrooms || "—";
    const bathrooms = gp.bathrooms || "—";
    const computedSF = rooms.reduce((s, r) => s + (r.w || r.width || 0) * (r.h || r.height || r.depth || 0), 0);
    const totalSF = fp.totalSF || computedSF || gp.targetSF || "—";
    const stories = gp.stories || 1;
    const style = gp.style || "—";
    const budget = gp.budget?.max ?? gp.budget?.min;
    const landCost = proj.plot?.price;
    const totalCost = budget && landCost ? budget + landCost : null;
    // Physical address from saved plot; fallback to city/state from location
    const physicalAddress = proj.plot?.address || null;
    const cityState = proj.location ? `${proj.location.city}, ${proj.location.state}` : null;
    const displayAddress = physicalAddress || cityState;

    const stats = [
      { label: "Size", value: totalSF !== "—" ? `${Number(totalSF).toLocaleString()} SF` : "—" },
      { label: "Bedrooms", value: bedrooms },
      { label: "Bathrooms", value: bathrooms },
      { label: "Stories", value: stories },
      { label: "Style", value: style },
      { label: "Construction Budget", value: budget ? `$${Number(budget).toLocaleString()}` : "—" },
      { label: "Land Cost", value: landCost ? `$${Number(landCost).toLocaleString()}` : "—" },
      { label: "Total Est. Cost", value: totalCost ? `$${Number(totalCost).toLocaleString()}` : "—" },
    ];

    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* Back + title */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "18px 24px 14px", borderBottom: `1px solid ${C.cardBorder}`, flexShrink: 0,
        }}>
          <button
            onClick={() => setSelected(null)}
            style={{
              background: "transparent", border: `1px solid ${C.cardBorder}`, borderRadius: 6,
              color: C.text, fontSize: 13, cursor: "pointer", padding: "4px 10px",
              fontFamily: fonts.label, display: "flex", alignItems: "center", gap: 5,
            }}
          >
            ← Back
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.textBright, fontFamily: fonts.label }}>
              {proj.name || "Untitled Project"}
            </div>
            {displayAddress && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.text, marginTop: 3, fontFamily: fonts.label }}>
                <svg width="9" height="12" viewBox="0 0 10 12" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M5 0C2.79 0 1 1.79 1 4c0 3 4 8 4 8s4-5 4-8c0-2.21-1.79-4-4-4Z" fill={C.secondary} />
                  <circle cx="5" cy="4" r="1.5" fill="rgba(10,18,32,0.9)" />
                </svg>
                {displayAddress}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.textDim, fontSize: 22, cursor: "pointer", lineHeight: 1 }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Stats grid */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 12, fontFamily: fonts.label }}>
              Project Details
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {stats.map(({ label, value }) => (
                <div key={label} style={{
                  background: "rgba(0,0,0,0.25)", border: `1px solid ${C.cardBorder}`,
                  borderRadius: 8, padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 10, color: C.textDim, fontFamily: fonts.label, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.textBright, fontFamily: fonts.label }}>
                    {String(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Floor plan rooms */}
          {rooms.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10, fontFamily: fonts.label }}>
                Floor Plan — {rooms.length} Rooms
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {rooms.map((r, i) => (
                  <div key={i} style={{
                    padding: "5px 10px", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
                    borderRadius: 6, fontSize: 12, color: C.secondary, fontFamily: fonts.label,
                  }}>
                    {r.name || r.type || `Room ${i + 1}`}
                    {r.width && r.depth ? ` · ${r.width}×${r.depth}` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plot status */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", borderRadius: 8,
            background: proj.plot?.lat != null ? "rgba(46,213,115,0.07)" : "rgba(255,159,67,0.07)",
            border: `1px solid ${proj.plot?.lat != null ? "rgba(46,213,115,0.2)" : "rgba(255,159,67,0.2)"}`,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: proj.plot?.lat != null ? C.success : "#ff9f43",
            }} />
            <span style={{ fontSize: 13, fontFamily: fonts.label, color: proj.plot?.lat != null ? C.success : "#ff9f43", fontWeight: 600 }}>
              {proj.plot?.lat != null ? "Plot location saved" : "No plot selected"}
            </span>
          </div>

          {/* Sending to builder summary */}
          <div style={{
            padding: "14px 16px", background: "rgba(0,212,255,0.05)", border: `1px solid rgba(0,212,255,0.15)`,
            borderRadius: 8,
          }}>
            <div style={{ fontSize: 11, color: C.textDim, fontFamily: fonts.label, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.6px" }}>
              Sending to
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.textBright, fontFamily: fonts.label }}>
              {builder.name}
            </div>
            <div style={{ fontSize: 12, color: C.text, fontFamily: fonts.label, marginTop: 2 }}>
              {builder.company} · {builder.specialty}
            </div>
          </div>
        </div>

        {/* Footer — confirm button */}
        <div style={{ borderTop: `1px solid ${C.cardBorder}`, padding: "16px 24px", flexShrink: 0 }}>
          {confirmed === proj.id ? (
            <div style={{
              padding: "12px 16px", background: "rgba(46,213,115,0.1)", border: "1px solid rgba(46,213,115,0.25)",
              borderRadius: 8, fontSize: 14, color: C.success, fontFamily: fonts.label, textAlign: "center", fontWeight: 600,
            }}>
              ✓ Request sent! {builder.name} will review your project.
            </div>
          ) : sentProjectIds.has(proj.id) ? (
            <div style={{
              padding: "12px 16px", background: "rgba(139,157,184,0.07)", border: `1px solid ${C.cardBorder}`,
              borderRadius: 8, fontSize: 14, color: C.text, fontFamily: fonts.label, textAlign: "center", fontWeight: 600,
            }}>
              Already requested — choose a different builder to send again
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {submitError && (
                <div style={{ fontSize: 12, color: "#ff4757", fontFamily: fonts.label, textAlign: "center" }}>
                  {submitError}
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setSelected(null)}
                  disabled={submitting === proj.id}
                  style={{
                    flex: 1, padding: "11px 0", background: "transparent",
                    border: `1px solid ${C.cardBorder}`, borderRadius: 8,
                    color: C.textDim, fontSize: 13, fontWeight: 600,
                    cursor: submitting === proj.id ? "default" : "pointer", fontFamily: fonts.label,
                    opacity: submitting === proj.id ? 0.5 : 1,
                  }}
                >
                  Back
                </button>
                <button
                  disabled={submitting === proj.id}
                  onClick={async () => {
                    setSubmitting(proj.id);
                    setSubmitError(null);
                    try {
                      const gp = proj.generate_params || {};
                      const budget = gp.budget?.max ?? gp.budget?.min ?? null;
                      const address = proj.plot?.address ||
                        (proj.location ? `${proj.location.city}, ${proj.location.state}` : null);
                      await builderRequestsApi.create({
                        project_id: proj.id,
                        project_name: proj.name || "Untitled Project",
                        builder_id: builder.id,
                        builder_name: builder.name,
                        builder_company: builder.company,
                        budget,
                        address,
                      });
                      setConfirmed(proj.id);
                      setSentProjectIds((prev) => new Set([...prev, proj.id]));
                    } catch (e) {
                      setSubmitError(e.message || "Failed to send request. Please try again.");
                    } finally {
                      setSubmitting(null);
                    }
                  }}
                  style={{
                    flex: 1, padding: "11px 0",
                    background: submitting === proj.id ? "rgba(59,130,246,0.5)" : "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                    border: "none", borderRadius: 8,
                    color: "#fff", fontSize: 14, fontWeight: 700,
                    cursor: submitting === proj.id ? "default" : "pointer", fontFamily: fonts.label,
                    letterSpacing: "0.2px", transition: "background 0.15s",
                  }}
                >
                  {submitting === proj.id ? "Sending…" : "Send Request →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── List view (pick a project) ─────────────────────────────────────────────
  const modal = (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.76)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <button
        aria-label="Close dialog"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "transparent", border: "none", cursor: "default" }}
      />
      <dialog
        open
        style={{
          position: "relative",
          background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14,
          width: 620, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden",
          padding: 0, margin: 0,
        }}
      >
        {selected ? <DetailView proj={selected} /> : (
          <>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "flex-start", justifyContent: "space-between",
              padding: "20px 24px 16px", borderBottom: `1px solid ${C.cardBorder}`, flexShrink: 0,
            }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.textBright, fontFamily: fonts.label }}>
                  Choose a Project
                </div>
                <div style={{ fontSize: 12, color: C.text, marginTop: 4, fontFamily: fonts.label }}>
                  Requesting <span style={{ color: C.textBright, fontWeight: 600 }}>{builder.name}</span> — select the project you want to build
                </div>
              </div>
              <button
                onClick={onClose}
                style={{ background: "transparent", border: "none", color: C.textDim, fontSize: 24, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}
              >×</button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              {loading && (
                <div style={{ padding: "60px 0", textAlign: "center", fontSize: 13, color: C.textDim, fontFamily: fonts.label }}>
                  Loading projects…
                </div>
              )}
              {!loading && error && (
                <div style={{ padding: "40px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: "#ff4757", marginBottom: 12, fontFamily: fonts.label }}>{error}</div>
                  <button onClick={load} style={{ padding: "7px 18px", background: "transparent", border: `1px solid ${C.accent}`, borderRadius: 6, color: C.accent, fontSize: 12, cursor: "pointer", fontFamily: fonts.label }}>
                    Retry
                  </button>
                </div>
              )}
              {!loading && !error && projects.length === 0 && (
                <div style={{ padding: "60px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.textBright, marginBottom: 8, fontFamily: fonts.label }}>No saved projects</div>
                  <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.65, fontFamily: fonts.label }}>
                    Create a project in the Develop tab first, then return here to send it.
                  </div>
                </div>
              )}
              {!loading && !error && projects.map((proj) => {
                const { ready, reasons } = getProjectReadiness(proj);
                const gp = proj.generate_params || {};
                const fp = proj.floor_plan || proj.floorPlan || {};
                const rooms = fp.rooms || [];
                const listComputedSF = rooms.reduce((s, r) => s + (r.w || r.width || 0) * (r.h || r.height || r.depth || 0), 0);
                const listSF = fp.totalSF || listComputedSF || gp.targetSF;
                const isSent = confirmed === proj.id;
                return (
                  <div
                    key={proj.id}
                    style={{
                      padding: "16px 24px", borderBottom: `1px solid ${C.cardBorder}`,
                      opacity: ready ? 1 : 0.55,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                      {/* Left: project info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: C.textBright, fontFamily: fonts.label }}>
                            {proj.name || "Untitled Project"}
                          </div>
                          <div style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: fonts.label,
                            background: ready ? "rgba(46,213,115,0.1)" : "rgba(255,159,67,0.1)",
                            border: `1px solid ${ready ? "rgba(46,213,115,0.25)" : "rgba(255,159,67,0.25)"}`,
                            color: ready ? C.success : "#ff9f43",
                            flexShrink: 0,
                          }}>
                            {ready ? "READY" : "INCOMPLETE"}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: C.text, fontFamily: fonts.label, marginBottom: ready ? 0 : 8 }}>
                          {listSF ? `${Number(listSF).toLocaleString()} SF` : "—"}
                          {gp.bedrooms ? ` · ${gp.bedrooms} bd` : ""}
                          {gp.bathrooms ? ` / ${gp.bathrooms} ba` : ""}
                          {gp.stories ? ` · ${gp.stories}-story` : ""}
                          {rooms.length > 0 ? ` · ${rooms.length} rooms` : ""}
                        </div>
                        {!ready && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {reasons.map((r) => (
                              <div key={r} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ff9f43", flexShrink: 0 }} />
                                <span style={{ fontSize: 11, color: "#ff9f43", fontFamily: fonts.label }}>{r}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right: actions */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, color: C.textDim, fontFamily: fonts.label }}>{timeAgo(proj.updated_at)}</div>
                        {isSent || sentProjectIds.has(proj.id) ? (
                          <div style={{
                            padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                            fontFamily: fonts.label, color: isSent ? C.success : C.text,
                            background: isSent ? "rgba(46,213,115,0.1)" : "rgba(139,157,184,0.07)",
                            border: `1px solid ${isSent ? "rgba(46,213,115,0.25)" : C.cardBorder}`,
                          }}>
                            {isSent ? "✓ Sent" : "Already Requested"}
                          </div>
                        ) : (
                          <button
                            onClick={() => setSelected(proj)}
                            style={{
                              padding: "6px 14px", background: "transparent",
                              border: `1px solid ${C.cardBorder}`, borderRadius: 6,
                              color: C.text, fontSize: 12, cursor: "pointer", fontFamily: fonts.label,
                            }}
                          >
                            View Details →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ borderTop: `1px solid ${C.cardBorder}`, padding: "14px 24px", flexShrink: 0 }}>
              <button
                onClick={onClose}
                style={{
                  width: "100%", padding: "10px 0", background: "transparent",
                  border: `1px solid ${C.cardBorder}`, borderRadius: 8,
                  color: C.textDim, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: fonts.label,
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );

  return createPortal(modal, document.body);
}

export default function Browse() {
  const navigate = useNavigate();
  const { ragViolations } = useProject();
  const { isHomeowner } = useUserType();
  const hasComplianceIssues = ragViolations?.length > 0;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("All Specialties");
  const [sortBy, setSortBy] = useState("distance");
  const [requestBuilder, setRequestBuilder] = useState(null);
  const [profileBuilder, setProfileBuilder] = useState(null);

  const filteredBuilders = BUILDERS
    .filter((b) => {
      const matchesSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.location.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSpecialty = selectedSpecialty === "All Specialties" || b.specialty === selectedSpecialty;
      return matchesSearch && matchesSpecialty;
    })
    .sort((a, b) => {
      if (sortBy === "distance") return Number.parseFloat(a.distance) - Number.parseFloat(b.distance);
      if (sortBy === "rating") return b.rating - a.rating;
      if (sortBy === "projects") return b.projectsCompleted - a.projectsCompleted;
      return 0;
    });

  return (
    <div
      style={{
        height: "100%",
        background: C.bg,
        padding: "32px",
        overflowY: "auto",
        fontFamily: fonts.label,
      }}
    >
      {isHomeowner && (
        <FirstTimeHint
          storageKey="browse"
          title="Pick your builder"
          steps={[
            { text: "Browse local residential builders. Each card shows their specialty, completed projects, and a verification badge if Vision has checked their license." },
            { text: "Tap View Profile for details, or Send Request to share your floor plan and get a quote — they'll see your project automatically." },
            { text: "Use the filters at the top to narrow by specialty (custom, modular, eco, etc.) or sort by distance and experience." },
          ]}
        />
      )}
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 32,
              fontWeight: 800,
              color: C.textBright,
              letterSpacing: "-0.5px",
              lineHeight: 1.1,
            }}
          >
            Browse Builders
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 14,
              color: C.textDim,
            }}
          >
            Find trusted residential builders near you in the Dallas area
          </p>
        </div>
      </div>

      {/* Search/Filter bar */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
          padding: "16px 20px",
          background: C.card,
          border: `1px solid ${C.cardBorder}`,
          borderRadius: 10,
          flexWrap: "wrap",
        }}
      >
        {/* Search input */}
        <div style={{ flex: 1, minWidth: 240, position: "relative" }}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}
          >
            <circle cx="7" cy="7" r="5" stroke={C.text} strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke={C.text} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search builders, companies, or locations..."
            style={{
              width: "100%",
              padding: "10px 14px 10px 38px",
              background: "rgba(0,0,0,0.3)",
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 6,
              color: C.textBright,
              fontSize: 13,
              fontFamily: fonts.label,
              outline: "none",
            }}
          />
        </div>

        {/* Specialty filter */}
        <select
          value={selectedSpecialty}
          onChange={(e) => setSelectedSpecialty(e.target.value)}
          style={{
            padding: "10px 14px",
            background: "rgba(0,0,0,0.3)",
            border: `1px solid ${C.cardBorder}`,
            borderRadius: 6,
            color: C.text,
            fontSize: 13,
            fontFamily: fonts.label,
            cursor: "pointer",
          }}
        >
          {SPECIALTIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{
            padding: "10px 14px",
            background: "rgba(0,0,0,0.3)",
            border: `1px solid ${C.cardBorder}`,
            borderRadius: 6,
            color: C.text,
            fontSize: 13,
            fontFamily: fonts.label,
            cursor: "pointer",
          }}
        >
          <option value="distance">Nearest First</option>
          <option value="rating">Highest Rated</option>
          <option value="projects">Most Projects</option>
        </select>
      </div>

      {/* Results count */}
      <div style={{ marginBottom: 16, fontSize: 13, color: C.textDim }}>
        Showing {filteredBuilders.length} builders
      </div>

      {/* Builders list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {filteredBuilders.map((builder) => (
          <div
            key={builder.id}
            style={{
              display: "flex",
              gap: 20,
              padding: "24px",
              background: C.card,
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 12,
              transition: "border-color 0.2s",
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 12,
                background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 700,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              {builder.initials}
            </div>

            {/* Info */}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: C.textBright }}>
                  {builder.name}
                </h3>
                {builder.verified && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 8px",
                      background: "rgba(46,213,115,0.1)",
                      border: "1px solid rgba(46,213,115,0.25)",
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      color: C.success,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2 2 4-4" stroke={C.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    VERIFIED
                  </div>
                )}
                {isHomeowner && builder.verified && (
                  <HelpTip
                    size={11}
                    title="Verified builder"
                    body="Vision has checked this builder's license, insurance, and at least three completed projects. It's a baseline trust signal — still worth interviewing them yourself."
                  />
                )}
              </div>

              <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>
                {builder.company}
              </div>

              <p style={{ margin: "0 0 12px", fontSize: 13, color: C.textDim, lineHeight: 1.5 }}>
                {builder.description}
              </p>

              {/* Tags */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {builder.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      padding: "4px 10px",
                      background: "rgba(59,130,246,0.1)",
                      border: "1px solid rgba(59,130,246,0.2)",
                      borderRadius: 4,
                      fontSize: 11,
                      color: C.secondary,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Stats row */}
              <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1l1.5 3.5L12 5l-2.5 2.5.5 3.5L7 9.5 4 11l.5-3.5L2 5l3.5-.5L7 1z" fill="#fbbf24" />
                  </svg>
                  <span style={{ color: C.textBright, fontWeight: 600 }}>{builder.rating}</span>
                  <span style={{ color: C.textDim }}>({builder.reviews} reviews)</span>
                </div>
                <div style={{ color: C.textDim }}>
                  <span style={{ color: C.text, fontWeight: 500 }}>{builder.projectsCompleted}</span> projects completed
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, color: C.textDim }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1C4.067 1 2.5 2.567 2.5 4.5 2.5 7 6 11 6 11s3.5-4 3.5-6.5C9.5 2.567 7.933 1 6 1z" stroke={C.text} strokeWidth="1.2" />
                    <circle cx="6" cy="4.5" r="1.5" stroke={C.text} strokeWidth="1.2" />
                  </svg>
                  {builder.distance}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
              <button
                onClick={() => setRequestBuilder(builder)}
                style={{
                  padding: "12px 24px",
                  background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(59,130,246,0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1L2 4v7h10V4L7 1zM5 11V7h4v4H5z" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Request
              </button>
              <button
                onClick={() => setProfileBuilder(builder)}
                style={{
                  padding: "12px 24px",
                  background: "transparent",
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 8,
                  color: C.text,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = C.accent;
                  e.currentTarget.style.color = C.textBright;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = C.cardBorder;
                  e.currentTarget.style.color = C.text;
                }}
              >
                View Profile
              </button>
            </div>
          </div>
        ))}
      </div>

      {requestBuilder && (
        <RequestModal
          builder={requestBuilder}
          onClose={() => setRequestBuilder(null)}
        />
      )}

      {profileBuilder && (
        <BuilderProfileModal
          builder={profileBuilder}
          onClose={() => setProfileBuilder(null)}
          onRequest={(b) => setRequestBuilder(b)}
        />
      )}
    </div>
  );
}
