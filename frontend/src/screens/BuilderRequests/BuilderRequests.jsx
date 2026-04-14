import { useState } from "react";
import { colors, fonts, radii, card } from "../../theme/tokens";
import { useBuilderStore } from "../../context/BuilderContext";

function WidgetCard({ title, children, style = {} }) {
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
      <h3 style={{ margin: "0 0 16px 0", fontSize: "1rem", color: colors.textBright, fontWeight: "bold", letterSpacing: "-0.01em" }}>
        {title}
      </h3>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function RequestExpansion({ project }) {
  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div style={{ padding: "24px", background: "rgba(0,0,0,0.2)", borderTop: `1px solid ${colors.cardBorder}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
        
        {/* Architecture Placeholder */}
        <WidgetCard title="3D & Plan Overview">
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
        <WidgetCard title="Estimated Financial Setup">
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Proposed Budget</div>
            <div style={{ fontSize: "1.75rem", color: colors.textBright, fontWeight: "bold", fontFamily: fonts.data }}>{formatCurrency(project.cost?.budget || 800000)}</div>
          </div>
          <div style={{ fontSize: "0.875rem", color: colors.textDim, lineHeight: 1.5 }}>
            Client has requested preliminary approval. Cost breakdown will become available in the dashboard tracking once the project schedule begins.
          </div>
        </WidgetCard>

        {/* Feasibility Scan */}
        <WidgetCard title="Feasibility Scan">
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
          <h1 style={{ margin: "0 0 8px 0", fontSize: "2rem", color: colors.textBright, fontFamily: "'Newsreader', serif", fontWeight: 500 }}>
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
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                style={{
                  ...card,
                  borderRadius: radii.md,
                  background: "rgba(13, 17, 23, 0.4)",
                  border: expandedId === req.id ? `1px solid ${colors.accent}` : `1px solid ${colors.cardBorder}`,
                  overflow: "hidden",
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
                  <RequestExpansion project={req} />
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
