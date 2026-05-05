import { useState } from "react";
import { colors, fonts, radii, card } from "../../theme/tokens";
import { useBuilderStore } from "../../context/BuilderContext";
import GuidedTour from "../../components/shared/GuidedTour";
import HelpTip from "../../components/shared/HelpTip";
import { useUserType } from "../../context/UserTypeContext";

function WidgetCard({ title, help, children, style = {} }) {
  return (
    <div
      style={{
        ...card,
        display: "flex",
        flexDirection: "column",
        background: `linear-gradient(160deg, ${colors.panel} 0%, ${colors.surface} 100%)`,
        borderColor: colors.cardBorder,
        borderRadius: radii.md,
        boxShadow: "0 14px 30px rgba(7, 10, 15, 0.06)",
        padding: "20px",
        height: "100%",
        ...style
      }}
    >
      <h3 style={{ margin: "0 0 16px 0", fontSize: "1rem", color: colors.textBright, fontWeight: "bold", letterSpacing: "-0.01em", display: "inline-flex", alignItems: "center", gap: 6 }}>
        {title}
        {help && <HelpTip size={12} title={title} body={help} />}
      </h3>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function RequestExpansion({ project, tourFirst }) {
  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div data-tour={tourFirst ? "request-expansion" : undefined} style={{ padding: "24px", background: "rgba(0,0,0,0.2)", borderTop: `1px solid ${colors.cardBorder}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>

        {/* Architecture Placeholder */}
        <WidgetCard
          title="3D & Plan Overview"
          help="A read-only preview of the home the client designed in Vision — the 3D massing model and the top-down floor plan. Use this to scope the build before you commit."
        >
           <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
             <div style={{ background: "rgba(10, 15, 26, 0.6)", borderRadius: radii.md, height: "140px", border: `1px solid ${colors.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", color: colors.textDim }}>
               [Interactive Model]
             </div>
             <div style={{ background: "rgba(10, 15, 26, 0.6)", borderRadius: radii.md, height: "140px", border: `1px solid ${colors.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", color: colors.textDim, backgroundImage: "linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)", backgroundSize: "10px 10px" }}>
               <span style={{ background: "rgba(0,0,0,0.7)", padding: "4px 8px", borderRadius: "10px" }}>[Floorplan]</span>
             </div>
           </div>
        </WidgetCard>

        {/* Financial Setup */}
        <WidgetCard
          title="Estimated Financial Setup"
          help="Vision's pre-feasibility estimate of total project cash — land, construction, soft costs, and a contingency buffer. Treat as a starting point for your own bid; not binding."
        >
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Proposed Budget</div>
            <div style={{ fontSize: "1.75rem", color: colors.textBright, fontWeight: "bold", fontFamily: fonts.data }}>{formatCurrency(project.cost?.budget || 800000)}</div>
          </div>
          <div style={{ fontSize: "0.875rem", color: colors.textDim, lineHeight: 1.5 }}>
            Client has requested preliminary approval. Cost breakdown will become available in the dashboard tracking once the project schedule begins.
          </div>
        </WidgetCard>

        {/* Feasibility Scan */}
        <WidgetCard
          title="Feasibility Scan"
          help="A 0–100 buildability + market score Vision auto-runs at request time. It blends nearby comparable sales (50%), cost-to-rebuild (30%), and projected resale/rental income (20%). Above 70 is a green light."
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
            <div style={{ width: "60px", height: "60px", borderRadius: "50%", border: `4px solid ${colors.success}`, display: "flex", alignItems: "center", justifyContent: "center", color: colors.success, fontSize: "1.25rem", fontWeight: "bold", fontFamily: fonts.data }}>
              {project.feasibility?.score || 85}
            </div>
            <div>
              <div style={{ color: colors.textBright, fontWeight: "bold", fontSize: "1rem" }}>System Reviewed</div>
              <div style={{ fontSize: "0.875rem" }}>Auto-analysis complete</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "rgba(0,0,0,0.2)", borderRadius: radii.md }}>
            <span style={{ color: colors.textDim, fontSize: "0.875rem" }}>Zoning Status</span>
            <span style={{ color: project.feasibility?.zoning === 'Approved' ? colors.success : colors.warn, fontWeight: "bold", fontSize: "0.875rem" }}>
              {project.feasibility?.zoning || 'Pending'}
            </span>
          </div>
        </WidgetCard>
        
      </div>
    </div>
  );
}

export default function BuilderRequests() {
  const { projects, approveRequest, denyRequest } = useBuilderStore();
  const { isBuilder } = useUserType();
  const [expandedId, setExpandedId] = useState(null);

  const pendingRequests = projects.filter((p) => p.status === "New Request");

  const handleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div
      style={{
        background: colors.bgGradient,
        fontFamily: "'Manrope', sans-serif",
        color: colors.text,
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        position: "relative",
      }}
    >
      {isBuilder && (
        <GuidedTour
          storageKey="builder-requests"
          title="Inbound Requests"
          steps={[
            {
              title: "Triage incoming work",
              body: (
                <>
                  Every request a Vision client sends to you lands here. We&rsquo;ll show you the
                  approve/deny flow and how to read the auto-generated feasibility &amp; financial preview
                  before you commit.
                </>
              ),
            },
            {
              target: '[data-tour="request-row"]',
              placement: "bottom",
              title: "One row per request",
              body: (
                <>
                  Header shows project name, client, and address. Click anywhere on the row to expand
                  the full preview. The chevron at the right also flips to indicate state.
                </>
              ),
              optional: true,
            },
            {
              target: '[data-tour="approve-btn"]',
              placement: "left",
              title: "Approve / Deny",
              body: (
                <>
                  <b>Approve</b> moves the request into your <i>Active projects</i> list and notifies
                  the client. <b>Deny</b> archives the request &mdash; no message is sent automatically, so
                  follow up manually if needed.
                </>
              ),
              optional: true,
            },
            {
              target: '[data-tour="request-expansion"]',
              placement: "top",
              title: "What you get before approving",
              body: (
                <>
                  The expanded panel shows the client&rsquo;s 3D model + floor plan, their proposed budget,
                  and Vision&rsquo;s feasibility scan (zoning, market viability). Use it to scope before you
                  say yes.
                </>
              ),
              optional: true,
            },
            {
              title: "Need a deeper look?",
              body: (
                <>
                  Approve the request to unlock the full <b>Client Project</b> hub &mdash; live schedule
                  tracking, financial breakdown, structural QA, and a direct message thread.
                </>
              ),
            },
          ]}
        />
      )}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "radial-gradient(1000px 400px at 50% 0%, rgba(20,27,45,0.4) 0%, transparent 60%)",
        }}
      />

      <main style={{ position: "relative", zIndex: 1, margin: "0 auto", width: "100%", maxWidth: "1100px", padding: "40px 24px" }}>
        
        <div style={{ marginBottom: "40px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: 32,
              fontWeight: 800,
              color: colors.textBright,
              letterSpacing: "-0.5px",
              lineHeight: 1.1,
            }}
          >
            Inbound Client Requests
          </h1>
          <p style={{ margin: 0, fontSize: "1rem", color: colors.textDim }}>
            Review and approve new construction project requests from clients.
          </p>
        </div>

        {pendingRequests.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", background: "rgba(13,17,23,0.4)", borderRadius: radii.lg, border: `1px dashed ${colors.cardBorder}` }}>
             <h3 style={{ color: colors.textBright, margin: "0 0 8px 0" }}>No new requests</h3>
             <p style={{ color: colors.textDim, margin: 0 }}>You're all caught up! All pending requests have been processed.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {pendingRequests.map((req, reqIdx) => (
              <div
                key={req.id}
                data-tour={reqIdx === 0 ? "request-row" : undefined}
                style={{
                  ...card,
                  borderRadius: radii.md,
                  background: "rgba(13, 17, 23, 0.4)",
                  border: expandedId === req.id ? `1px solid ${colors.accent}` : `1px solid ${colors.cardBorder}`,
                  overflow: "visible",
                  transition: "border-color 0.2s ease",
                }}
              >
                {/* Header Row */}
                <div
                  onClick={() => handleExpand(req.id)}
                  style={{
                    padding: "20px 24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    background: expandedId === req.id ? "rgba(0, 212, 255, 0.03)" : "transparent"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>
                      📥
                    </div>
                    <div>
                      <div style={{ fontSize: "1.125rem", fontWeight: "bold", color: colors.textBright, marginBottom: 2 }}>{req.name}</div>
                      <div style={{ fontSize: "0.875rem", color: colors.textDim }}>Client: {req.client} • {req.address}</div>
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <div style={{ display: "flex", gap: "8px" }} onClick={(e) => e.stopPropagation()}>
                       <button
                         onClick={() => approveRequest(req.id)}
                         data-tour={reqIdx === 0 ? "approve-btn" : undefined}
                         style={{ padding: "8px 16px", background: colors.successDim, border: `1px solid rgba(46, 213, 115, 0.35)`, borderRadius: radii.md, color: colors.success, fontWeight: "bold", cursor: "pointer", transition: "all 0.2s" }}
                       >
                         Approve
                       </button>
                       <button
                         onClick={() => denyRequest(req.id)}
                         style={{ padding: "8px 16px", background: "transparent", border: `1px solid ${colors.cardBorder}`, borderRadius: radii.md, color: colors.textDim, fontWeight: "bold", cursor: "pointer", transition: "all 0.2s" }}
                       >
                         Deny
                       </button>
                    </div>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.textDim} strokeWidth="2" style={{ transform: expandedId === req.id ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                </div>

                {/* Expanded Area */}
                {expandedId === req.id && (
                  <RequestExpansion project={req} tourFirst={reqIdx === 0} />
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
