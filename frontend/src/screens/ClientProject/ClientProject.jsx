import { useParams, useNavigate } from "react-router-dom";
import { colors, fonts, radii, card } from "../../theme/tokens";

// Mock Projects Database
const mockProjectsDatabase = {
  "1": {
    name: "The Martinez Home",
    address: "4821 Elm Creek Dr, Dallas TX",
    status: "On Track",
    phase: "Framing",
    progress: 70,
    client: "Rosa Martinez",
    cost: {
      budget: 1200000,
      spent: 840000,
      breakdown: [
        { label: "Foundation & Framing", value: 350000, percentage: 41, color: "#3b82f6" },
        { label: "Materials & Finishes", value: 240000, percentage: 29, color: "#10b981" },
        { label: "Labor & Subcontractors", value: 180000, percentage: 21, color: "#f59e0b" },
        { label: "Permits & Fees", value: 70000, percentage: 9, color: "#8b5cf6" },
      ]
    },
    feasibility: { score: 92, zoning: "Approved", environmental: "Clear", structural: "Verified" },
    timeline: [
      { phase: "Planning & Permits", status: "completed", date: "Oct 2025" },
      { phase: "Site Prep & Foundation", status: "completed", date: "Nov 2025" },
      { phase: "Framing & Roof", status: "active", date: "Dec 2025" },
      { phase: "Plumbing & Electrical", status: "pending", date: "Jan 2026" },
      { phase: "Lockup & Finishes", status: "pending", date: "Mar 2026" }
    ]
  },
  "2": {
    name: "The Chen Residence",
    address: "910 Lakeview Blvd, Austin TX",
    status: "Delayed",
    phase: "Foundation",
    progress: 40,
    client: "David Chen",
    cost: {
      budget: 1500000,
      spent: 600000,
      breakdown: [
        { label: "Foundation & Framing", value: 400000, percentage: 66, color: "#3b82f6" },
        { label: "Materials & Finishes", value: 100000, percentage: 16, color: "#10b981" },
        { label: "Labor & Subcontractors", value: 80000, percentage: 13, color: "#f59e0b" },
        { label: "Permits & Fees", value: 20000, percentage: 5, color: "#8b5cf6" },
      ]
    },
    feasibility: { score: 85, zoning: "Approved", environmental: "Pending", structural: "Verified" },
    timeline: [
      { phase: "Planning & Permits", status: "completed", date: "Sep 2025" },
      { phase: "Site Prep & Foundation", status: "active", date: "Dec 2025" },
      { phase: "Framing & Roof", status: "pending", date: "Feb 2026" },
      { phase: "Plumbing & Electrical", status: "pending", date: "Apr 2026" },
      { phase: "Lockup & Finishes", status: "pending", date: "Jun 2026" }
    ]
  },
  "3": {
    name: "The Patel Build",
    address: "332 Sunrise Ranch Rd, Plano TX",
    status: "On Track",
    phase: "Finishing",
    progress: 90,
    client: "Priya Patel",
    cost: {
      budget: 950000,
      spent: 855000,
      breakdown: [
        { label: "Foundation & Framing", value: 250000, percentage: 29, color: "#3b82f6" },
        { label: "Materials & Finishes", value: 400000, percentage: 46, color: "#10b981" },
        { label: "Labor & Subcontractors", value: 150000, percentage: 17, color: "#f59e0b" },
        { label: "Permits & Fees", value: 55000, percentage: 8, color: "#8b5cf6" },
      ]
    },
    feasibility: { score: 98, zoning: "Approved", environmental: "Clear", structural: "Verified" },
    timeline: [
      { phase: "Planning & Permits", status: "completed", date: "Jan 2025" },
      { phase: "Site Prep & Foundation", status: "completed", date: "Mar 2025" },
      { phase: "Framing & Roof", status: "completed", date: "Jun 2025" },
      { phase: "Plumbing & Electrical", status: "completed", date: "Aug 2025" },
      { phase: "Lockup & Finishes", status: "active", date: "Dec 2025" }
    ]
  }
};

function WidgetCard({ title, children, style = {} }) {
  return (
    <div
      style={{
        ...card,
        display: "flex",
        flexDirection: "column",
        background: `linear-gradient(160deg, ${colors.panel} 0%, ${colors.surface} 100%)`,
        borderColor: colors.cardBorder,
        borderRadius: radii.lg,
        boxShadow: "0 14px 30px rgba(7, 10, 15, 0.06)",
        padding: "24px",
        height: "100%",
        ...style
      }}
    >
      <h3 style={{ margin: "0 0 20px 0", fontSize: "1.125rem", color: colors.textBright, fontWeight: "bold", letterSpacing: "-0.01em" }}>
        {title}
      </h3>
      <div style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

export default function ClientProject() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Map ID to correct fake data
  const project = mockProjectsDatabase[id];

  if (!project) {
    return (
      <div style={{ background: colors.bgGradient, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: colors.textBright }}>
        <h2>Project not found or is currently marked as a new request.</h2>
        <button onClick={() => navigate('/builderdashboard')} style={{ padding: "10px 20px", marginLeft: "20px", background: colors.secondary, color: "#fff", border: "none", borderRadius: radii.md, cursor: "pointer" }}>Back</button>
      </div>
    );
  }

  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div
      style={{
        background: colors.bgGradient,
        fontFamily: "'Manrope', sans-serif",
        color: colors.textDim,
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        position: "relative"
      }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "radial-gradient(1200px 400px at 50% -10%, rgba(59,130,246,0.12) 0%, transparent 60%)",
        }}
      />

      <main style={{ position: "relative", zIndex: 1, margin: "0 auto", width: "100%", maxWidth: "1280px", padding: "32px 24px 64px" }}>
        
        {/* Header Section */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "32px" }}>
          <div>
            <button
              onClick={() => navigate('/builderdashboard')}
              style={{
                background: "transparent",
                border: "none",
                color: colors.secondary,
                cursor: "pointer",
                padding: 0,
                fontSize: "0.875rem",
                fontWeight: 600,
                marginBottom: "16px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              ← Back to Dashboard
            </button>
            <h1 style={{ margin: "0 0 8px 0", fontSize: "2.5rem", color: colors.textBright, fontFamily: "'Newsreader', serif", fontWeight: 500, letterSpacing: "-0.02em" }}>
              {project.name}
            </h1>
            <p style={{ margin: 0, fontSize: "1.125rem" }}>
              Client: <span style={{ color: colors.textBright }}>{project.client}</span> • {project.address}
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
             <button style={{ padding: "10px 20px", background: "rgba(255,255,255,0.05)", border: `1px solid ${colors.cardBorder}`, borderRadius: radii.md, color: colors.textBright, fontWeight: "bold", cursor: "pointer" }}>
               Generate Report
             </button>
             <button 
               onClick={() => navigate('/builderchat', { state: { client: { name: project.client, initials: project.client.split(' ').map(n=>n[0]).join('') } } })} 
               style={{ padding: "10px 20px", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", borderRadius: radii.md, color: "#fff", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 14px rgba(37,99,235,0.4)" }}
             >
               Message Client
             </button>
          </div>
        </div>

        {/* Overview Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "24px", marginBottom: "24px" }}>
          
          {/* 3D Home & Floorplan Overview */}
          <div style={{ gridColumn: "1 / -1" }}>
            <WidgetCard title="Architecture & Model Overview" style={{ padding: "32px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "24px" }}>
                 {/* 3D Preview Placeholder */}
                 <div style={{ background: "rgba(10, 15, 26, 0.6)", borderRadius: radii.md, height: "300px", border: `1px solid ${colors.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 16, left: 16, background: "rgba(0,0,0,0.6)", padding: "4px 12px", borderRadius: 20, fontSize: "0.75rem", fontWeight: "bold", color: colors.textBright }}>Interactive 3D Model</div>
                    <div style={{ opacity: 0.4, textAlign: "center" }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.secondary} strokeWidth="1.5" style={{ marginBottom: "12px" }}>
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                      </svg>
                      <br/>[WebGL Canvas Rendered Here]
                    </div>
                 </div>
                 {/* Floor Plan Placeholder */}
                 <div style={{ background: "rgba(10, 15, 26, 0.6)", borderRadius: radii.md, height: "300px", border: `1px solid ${colors.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 16, left: 16, background: "rgba(0,0,0,0.6)", padding: "4px 12px", borderRadius: 20, fontSize: "0.75rem", fontWeight: "bold", color: colors.textBright }}>Floorplan Top-Down</div>
                    <div style={{ opacity: 0.15, width: "80%", height: "80%", backgroundImage: "linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)", backgroundSize: "20px 20px" }}></div>
                    <div style={{ position: "absolute", opacity: 0.4, textAlign: "center" }}>
                       <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.textBright} strokeWidth="1.5" style={{ marginBottom: "12px" }}>
                         <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                         <line x1="3" y1="9" x2="21" y2="9" />
                         <line x1="9" y1="21" x2="9" y2="9" />
                       </svg>
                       <br/>[Blueprint Layer]
                    </div>
                 </div>
              </div>
            </WidgetCard>
          </div>

          {/* Schedule */}
          <WidgetCard title="Construction Schedule">
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
               {project.timeline.map((item, i) => (
                 <div key={i} style={{ display: "flex", gap: "16px" }}>
                   {/* Timeline icon line */}
                   <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "24px" }}>
                     <div style={{ 
                       width: "16px", height: "16px", borderRadius: "50%", 
                       background: item.status === "completed" ? colors.success : item.status === "active" ? colors.secondary : "transparent",
                       border: `2px solid ${item.status === 'pending' ? colors.cardBorder : 'transparent'}`
                     }} />
                     {i < project.timeline.length - 1 && <div style={{ width: "2px", flex: 1, background: item.status === "completed" ? colors.success : colors.cardBorder, margin: "4px 0" }} />}
                   </div>
                   {/* Content */}
                   <div style={{ paddingBottom: i < project.timeline.length - 1 ? 16 : 0, opacity: item.status === 'pending' ? 0.5 : 1 }}>
                     <div style={{ color: colors.textBright, fontWeight: "bold", fontSize: "1rem", lineHeight: 1 }}>{item.phase}</div>
                     <div style={{ color: item.status === 'active' ? colors.textBright : colors.textDim, fontSize: "0.875rem", marginTop: 4 }}>
                       {item.status.charAt(0).toUpperCase() + item.status.slice(1)} • {item.date}
                     </div>
                   </div>
                 </div>
               ))}
            </div>
          </WidgetCard>

          {/* Cost Breakdown */}
          <WidgetCard title="Financial Breakdown">
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "0.875rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Total Budget</div>
              <div style={{ fontSize: "2rem", color: colors.textBright, fontWeight: "bold", fontFamily: fonts.data }}>{formatCurrency(project.cost.budget)}</div>
              <div style={{ color: colors.success, fontSize: "0.875rem", fontWeight: 600, marginTop: 4 }}>
                {formatCurrency(project.cost.spent)} spent to date
              </div>
            </div>

            {/* Bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {project.cost.breakdown.map((item, i) => (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.875rem" }}>
                    <span style={{ color: colors.textBright }}>{item.label}</span>
                    <span style={{ fontWeight: "bold", fontFamily: fonts.data }}>{formatCurrency(item.value)}</span>
                  </div>
                  <div style={{ height: "6px", width: "100%", background: "rgba(255,255,255,0.05)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ width: `${item.percentage}%`, height: "100%", background: item.color, borderRadius: "3px" }} />
                  </div>
                </div>
              ))}
            </div>
          </WidgetCard>

          {/* Feasibility & Location */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <WidgetCard title="Feasibility Scan">
              <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "24px" }}>
                <div style={{ width: "80px", height: "80px", borderRadius: "50%", border: `6px solid ${colors.success}`, display: "flex", alignItems: "center", justifyContent: "center", color: colors.success, fontSize: "1.75rem", fontWeight: "bold", fontFamily: fonts.data }}>
                  {project.feasibility.score}
                </div>
                <div>
                  <div style={{ color: colors.textBright, fontWeight: "bold", fontSize: "1.125rem", marginBottom: 4 }}>High Viability</div>
                  <div style={{ fontSize: "0.875rem" }}>Based on automated lot & structural checks</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {[['Zoning', project.feasibility.zoning], ['Environmental', project.feasibility.environmental], ['Structural QA', project.feasibility.structural]].map(([lbl, val], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "rgba(0,0,0,0.2)", borderRadius: radii.md }}>
                    <span style={{ color: colors.textDim, fontSize: "0.875rem" }}>{lbl}</span>
                    <span style={{ color: colors.success, fontWeight: "bold", fontSize: "0.875rem" }}>{val}</span>
                  </div>
                ))}
              </div>
            </WidgetCard>
            
            <WidgetCard style={{ justifySelf: "stretch" }}>
               {/* Location mini map wrapper */}
               <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ color: colors.textBright, fontWeight: "bold", fontSize: "1.125rem" }}>Site Location</div>
                  <div style={{ height: "120px", background: "rgba(10, 15, 26, 0.8)", borderRadius: radii.md, border: `1px solid ${colors.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", backgroundImage: "radial-gradient(ellipse at center, rgba(59,130,246,0.15) 0%, transparent 70%)" }}>
                     <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "1.5rem", marginBottom: 4 }}>📍</div>
                        <div style={{ fontSize: "0.75rem", fontWeight: "bold", letterSpacing: "0.05em", textTransform: "uppercase" }}>{project.address}</div>
                     </div>
                  </div>
               </div>
            </WidgetCard>
          </div>

        </div>
      </main>
    </div>
  );
}
