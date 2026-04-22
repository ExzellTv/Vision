import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { colors, fonts, radii, card } from "../../theme/tokens";
import { projectsApi } from "../../services/api";
import { useProject } from "../../hooks/useProjectStore";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import House3D from "../../components/3d/House3D";

const CATEGORY_COLOR = {
  SITEWORK:   "#a78bfa",
  FOUNDATION: "#f59e0b",
  STRUCTURE:  "#3b82f6",
  MEP:        "#ec4899",
  ENCLOSURE:  "#14b8a6",
  FINISHES:   "#2ed573",
  CLOSEOUT:   "#00d4ff",
};

const fmtCost = (v) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString()}`;
};

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

const ROOM_COLORS = {
  bedroom: "rgba(59,130,246,0.35)",
  bathroom: "rgba(16,185,129,0.35)",
  kitchen: "rgba(245,158,11,0.35)",
  living: "rgba(139,92,246,0.35)",
  dining: "rgba(236,72,153,0.35)",
  garage: "rgba(107,114,128,0.35)",
};

function FloorPlanMini({ floorPlan }) {
  if (!floorPlan?.rooms?.length) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.4, fontSize: "0.75rem" }}>
      [Blueprint Layer]
    </div>
  );
  const PAD = 12;
  const SIZE = 270;
  const scaleX = (SIZE - PAD * 2) / floorPlan.width;
  const scaleY = (SIZE - PAD * 2) / floorPlan.depth;
  const scale = Math.min(scaleX, scaleY);
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: "100%", height: "100%" }}>
      {floorPlan.rooms.map((r, i) => {
        const x = PAD + r.x * scale;
        const y = PAD + r.y * scale;
        const w = r.w * scale;
        const h = r.h * scale;
        const fill = ROOM_COLORS[r.type] ?? "rgba(255,255,255,0.1)";
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} fill={fill} stroke="rgba(255,255,255,0.3)" strokeWidth="1" rx="2" />
            {w > 28 && h > 14 && (
              <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle"
                fill="rgba(255,255,255,0.75)" fontSize="8"
                fontFamily="'Manrope', sans-serif" fontWeight="600">
                {r.label || r.type}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function MiniMap({ address, location }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const query = location ? `${location.city}, ${location.state}, US` : address;
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`)
      .then(r => r.json())
      .then(results => {
        const lat = parseFloat(results[0]?.lat ?? 32.7767);
        const lon = parseFloat(results[0]?.lon ?? -96.7970);
        const map = L.map(mapRef.current, {
          center: [lat, lon], zoom: 13,
          zoomControl: false, attributionControl: false,
          dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
        L.marker([lat, lon]).addTo(map);
        mapInstanceRef.current = map;
      })
      .catch(() => {});
    return () => { mapInstanceRef.current?.remove(); mapInstanceRef.current = null; };
  }, [address, location]);

  return <div ref={mapRef} style={{ height: "120px", borderRadius: radii.md, overflow: "hidden", border: `1px solid ${colors.cardBorder}` }} />;
}

function SchedulePreviewCard({ schedule, timeline, onViewDetail }) {
  const phases = schedule?.phases;
  const totalWeeks = schedule?.totalWeeks ?? 0;
  const totalCost = phases?.reduce((s, p) => s + (p.cost || 0), 0) ?? 0;
  const activePhase = phases?.find(p => p.status === "active");

  const viewBtn = (
    <button
      onClick={onViewDetail}
      style={{ marginTop: 16, width: "100%", padding: "9px", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", borderRadius: radii.md, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: "0.875rem" }}
    >
      View Full Schedule →
    </button>
  );

  // If no saved schedule, build a default 14-phase skeleton (all planned, 0% done)
  const DEFAULT_PHASES = [
    { name: "Permitting & Site Prep",        durationWeeks: 2, category: "SITEWORK"   },
    { name: "Excavation & Grading",          durationWeeks: 2, category: "SITEWORK"   },
    { name: "Foundation (Form, Pour, Cure)", durationWeeks: 4, category: "FOUNDATION" },
    { name: "Structural Framing",            durationWeeks: 5, category: "STRUCTURE"  },
    { name: "Roofing & Sheathing",           durationWeeks: 3, category: "STRUCTURE"  },
    { name: "Exterior Sheathing & Wrap",     durationWeeks: 2, category: "STRUCTURE"  },
    { name: "Rough MEP (Plumbing, Elec, HVAC)", durationWeeks: 4, category: "MEP"    },
    { name: "Insulation",                    durationWeeks: 2, category: "ENCLOSURE"  },
    { name: "Drywall (Hang, Tape, Finish)",  durationWeeks: 3, category: "ENCLOSURE"  },
    { name: "Exterior Cladding & Siding",    durationWeeks: 3, category: "FINISHES"   },
    { name: "Interior Finish Carpentry",     durationWeeks: 3, category: "FINISHES"   },
    { name: "Paint & Interior Finish",       durationWeeks: 2, category: "FINISHES"   },
    { name: "Fixtures, Trim & Final MEP",    durationWeeks: 2, category: "CLOSEOUT"   },
    { name: "Final Inspection & Punch List", durationWeeks: 1, category: "CLOSEOUT"   },
  ];
  const PREVIEW_CATEGORY_COLOR = {
    SITEWORK: "#a78bfa", FOUNDATION: "#f59e0b", STRUCTURE: "#3b82f6",
    MEP: "#ec4899", ENCLOSURE: "#14b8a6", FINISHES: "#2ed573", CLOSEOUT: "#00d4ff",
  };
  const effectivePhases = phases?.length ? phases : (() => {
    const start = new Date();
    let cursor = new Date(start);
    return DEFAULT_PHASES.map((cfg, i) => {
      const s = new Date(cursor);
      cursor.setDate(cursor.getDate() + cfg.durationWeeks * 7);
      return {
        id: i + 1, name: cfg.name, category: cfg.category,
        durationWeeks: cfg.durationWeeks, cost: 0,
        startDate: s.toISOString(), endDate: new Date(cursor).toISOString(),
        status: "planned",
        layerColor: PREVIEW_CATEGORY_COLOR[cfg.category],
      };
    });
  })();
  const effectiveTotalWeeks = schedule?.totalWeeks ?? effectivePhases.reduce((s, p) => s + p.durationWeeks, 0);
  const effectiveStartDate  = schedule?.startDate ?? new Date().toISOString();

  // Rich Gantt preview — mirrors ScheduleTimeline visual style
  const completedCount = effectivePhases.filter(p => p.status === "complete").length;
  const overallPct = Math.round((completedCount / effectivePhases.length) * 100);

  // Date helpers
  const projectStart = new Date(effectiveStartDate);
  const lastPhase = effectivePhases[effectivePhases.length - 1];
  const completionDate = lastPhase?.endDate ? new Date(lastPhase.endDate) : null;
  const fmtShort = (d) => d instanceof Date && !isNaN(d)
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  // Today-marker position as % of total weeks
  const TODAY = new Date();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const todayWeek = effectiveTotalWeeks > 0
    ? Math.max(0, Math.min(effectiveTotalWeeks, (TODAY - projectStart) / msPerWeek))
    : 0;
  const todayPct = effectiveTotalWeeks > 0 ? (todayWeek / effectiveTotalWeeks) * 100 : 0;

  // Per-phase bar offsets using cumulative week positions
  const phaseOffsets = effectivePhases.map((_, i) =>
    effectivePhases.slice(0, i).reduce((s, p) => s + (p.durationWeeks || 0), 0)
  );

  // Progress gauge (same SVG logic as ScheduleTimeline's ProgressGauge)
  const gaugeSize = 72;
  const sw = gaugeSize * 0.10;
  const r = (gaugeSize - sw) / 2;
  const circ = 2 * Math.PI * r;
  const gaugeColor = overallPct < 40 ? "#ef4444" : overallPct < 70 ? "#f59e0b" : "#2ed573";
  const dashOff = circ * (1 - overallPct / 100);

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", background: `linear-gradient(160deg, ${colors.panel} 0%, ${colors.surface} 100%)`, borderColor: colors.cardBorder, borderRadius: radii.lg, boxShadow: "0 14px 30px rgba(7,10,15,0.06)", padding: "20px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: "0 0 2px 0", fontSize: "1rem", color: colors.textBright, fontWeight: 700, letterSpacing: "-0.01em", fontFamily: fonts.label }}>Construction Schedule</h3>
          <span style={{ fontSize: 11, color: colors.textDim, fontFamily: fonts.label }}>{fmtShort(projectStart)} → {fmtShort(completionDate)}</span>
        </div>
        {/* Progress gauge */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ position: "relative", width: gaugeSize, height: gaugeSize }}>
            <svg width={gaugeSize} height={gaugeSize} viewBox={`0 0 ${gaugeSize} ${gaugeSize}`} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={gaugeSize/2} cy={gaugeSize/2} r={r} fill="none" stroke={colors.cardBorder} strokeWidth={sw} />
              <circle cx={gaugeSize/2} cy={gaugeSize/2} r={r} fill="none" stroke={gaugeColor} strokeWidth={sw}
                strokeDasharray={circ} strokeDashoffset={dashOff} strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.6s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: fonts.data, fontSize: gaugeSize * 0.22, fontWeight: 700, color: gaugeColor, lineHeight: 1 }}>{overallPct}%</span>
            </div>
          </div>
          <span style={{ fontFamily: fonts.label, fontSize: 9, color: colors.textDim }}>Overall Progress</span>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14, padding: "10px 12px", background: "rgba(0,0,0,0.2)", borderRadius: radii.md }}>
        {[
          { label: "Est. Cost", value: fmtCost(totalCost), color: colors.textBright },
          { label: "Duration", value: `${Math.round(effectiveTotalWeeks)} wks`, color: colors.textBright },
          { label: "Phases Done", value: `${completedCount}/${effectivePhases.length}`, color: colors.success },
        ].map(s => (
          <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 600, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.6px" }}>{s.label}</span>
            <span style={{ fontFamily: fonts.data, fontSize: 13, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* ── Category legend ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {Object.entries(CATEGORY_COLOR).map(([cat, col]) => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: col, opacity: 0.85 }} />
            <span style={{ fontFamily: fonts.label, fontSize: 9, color: colors.textDim, letterSpacing: "0.4px" }}>{cat}</span>
          </div>
        ))}
      </div>

      {/* ── Gantt rows (scrollable) ── */}
      <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1, marginBottom: 14 }}>
        {effectivePhases.map((ph, i) => {
          const isDone   = ph.status === "complete";
          const isActive = ph.status === "active";
          const barColor = PREVIEW_CATEGORY_COLOR[ph.category] ?? ph.layerColor ?? "#64748b";
          const leftPct  = effectiveTotalWeeks > 0 ? (phaseOffsets[i] / effectiveTotalWeeks) * 100 : 0;
          const widthPct = effectiveTotalWeeks > 0 ? Math.max(0.8, (ph.durationWeeks / effectiveTotalWeeks) * 100) : 0;
          return (
            <div key={ph.id} style={{
              display: "flex", alignItems: "center", gap: 6, minHeight: 26, padding: "3px 6px",
              borderRadius: 4,
              background: isActive ? "rgba(0,212,255,0.05)" : isDone ? "rgba(46,213,115,0.03)" : "transparent",
              borderLeft: isActive ? `2px solid ${colors.accent}` : isDone ? `2px solid ${colors.success}` : "2px solid transparent",
            }}>

              {/* Status mark — ✓ / ▶ / ○ */}
              <div style={{
                width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isDone ? "rgba(46,213,115,0.18)" : isActive ? "rgba(0,212,255,0.15)" : "transparent",
                border: `1.5px solid ${isDone ? colors.success : isActive ? colors.accent : colors.cardBorder}`,
              }}>
                {isDone && (
                  <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                    <path d="M1 3L3 5L7 1" stroke={colors.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {isActive && (
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: colors.accent }} />
                )}
              </div>

              {/* Activity ID */}
              <span style={{ fontFamily: fonts.data, fontSize: 9, color: colors.textDim, width: 20, flexShrink: 0, textAlign: "right" }}>
                A{String(ph.id).padStart(2, "0")}
              </span>

              {/* Phase name */}
              <span style={{
                fontFamily: fonts.label, fontSize: 10, width: 115, flexShrink: 0,
                color: isDone ? colors.textDim : isActive ? colors.accent : colors.text,
                fontWeight: isActive ? 700 : 400,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                textDecoration: isDone ? "line-through" : "none",
                textDecorationColor: colors.success,
              }}>
                {ph.name}
              </span>

              {/* Bar track */}
              <div style={{ flex: 1, position: "relative", height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  position: "absolute", left: `${leftPct}%`, width: `${widthPct}%`, height: "100%",
                  background: isDone
                    ? `linear-gradient(90deg,${barColor}77,${barColor}bb)`
                    : isActive
                      ? `linear-gradient(90deg,${barColor},${barColor}cc)`
                      : barColor,
                  borderRadius: 3,
                  opacity: isDone ? 0.6 : isActive ? 1 : 0.3,
                }} />
                {/* Today amber line */}
                {todayPct > 0 && todayPct < 100 && (
                  <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 2, background: "#f59e0b", opacity: 0.9 }} />
                )}
              </div>

              {/* Duration */}
              <span style={{ fontFamily: fonts.data, fontSize: 9, color: colors.textDim, width: 20, flexShrink: 0, textAlign: "right" }}>
                {ph.durationWeeks}w
              </span>

              {/* Cost */}
              <span style={{ fontFamily: fonts.data, fontSize: 9, color: isDone ? colors.success : isActive ? colors.accent : colors.textDim, width: 34, flexShrink: 0, textAlign: "right" }}>
                {ph.cost > 0 ? fmtCost(ph.cost) : ""}
              </span>
            </div>
          );
        })}
      </div>

      {viewBtn}
    </div>
  );
}

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
  const location = useLocation();
  const { setProjectId } = useProject();

  const [project, setProject] = useState(mockProjectsDatabase[id] ?? null);
  const [loading, setLoading] = useState(!mockProjectsDatabase[id]);

  useEffect(() => {
    if (mockProjectsDatabase[id]) return;
    if (!/^[a-f\d]{24}$/i.test(id)) { setLoading(false); return; }
    projectsApi.getPublic(id)
      .then((p) => {
        const budget = p.generate_params?.budget?.max ?? p.generate_params?.budget?.min ?? 0;
        const totalSF = p.floor_plan?.totalSF || p.generate_params?.targetSF || 2200;
        const rawMaterials = p.materials || [];
        const LAYER_COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#f97316","#84cc16"];
        const scaledMaterials = rawMaterials
          .filter(m => m.cost > 0)
          .map(m => ({ ...m, scaledCost: Math.round(m.cost * (totalSF / 1000)) }));
        const matTotal = scaledMaterials.reduce((s, m) => s + m.scaledCost, 0);
        const breakdown = scaledMaterials.length > 0
          ? scaledMaterials.map((m, i) => ({
              label: m.name,
              value: m.scaledCost,
              percentage: matTotal > 0 ? Math.round(m.scaledCost / matTotal * 100) : 0,
              color: LAYER_COLORS[i % LAYER_COLORS.length],
            }))
          : [
              { label: "Foundation & Framing",   value: Math.round(budget * 0.35), percentage: 35, color: "#3b82f6" },
              { label: "Materials & Finishes",   value: Math.round(budget * 0.30), percentage: 30, color: "#10b981" },
              { label: "Labor & Subcontractors", value: Math.round(budget * 0.25), percentage: 25, color: "#f59e0b" },
              { label: "Permits & Fees",         value: Math.round(budget * 0.10), percentage: 10, color: "#8b5cf6" },
            ];
        const WALL_MAP = { "Vinyl": "vinyl", "Brick": "brick", "Stone": "stone", "Stucco": "stucco", "Wood": "wood" };
        const ROOF_MAP = { "Metal": "metalRoof", "Tile": "tile", "Slate": "slate" };
        const wallMat = rawMaterials.find(m => m.name === "Exterior Cladding");
        const roofMat = rawMaterials.find(m => m.name === "Roof");
        const wallMaterial = WALL_MAP[wallMat?.material] ?? "vinyl";
        const roofMaterial = Object.entries(ROOF_MAP).find(([k]) => roofMat?.material?.includes(k))?.[1] ?? "asphaltShingle";
        setProject({
          name: p.name,
          address: p.location ? `${p.location.city}, ${p.location.state}` : "Location TBD",
          location: p.location ?? null,
          status: "New Request",
          phase: "Planning",
          progress: 0,
          client: "Homeowner",
          cost: {
            budget: matTotal > 0 ? matTotal : budget,
            spent: 0,
            breakdown,
          },
          feasibility: { score: 0, zoning: "Pending", environmental: "Pending", structural: "Pending" },
          timeline: [
            { phase: "Planning & Permits",      status: "active",  date: "TBD" },
            { phase: "Site Prep & Foundation",  status: "pending", date: "TBD" },
            { phase: "Framing & Roof",          status: "pending", date: "TBD" },
            { phase: "Plumbing & Electrical",   status: "pending", date: "TBD" },
            { phase: "Lockup & Finishes",       status: "pending", date: "TBD" },
          ],
          _floorPlan: p.floor_plan ?? null,
          _storyPlans: p.story_plans ?? [],
          _wallMaterial: wallMaterial,
          _roofMaterial: roofMaterial,
          _schedule: p.schedule ?? null,
          _plot:     p.plot ?? null,
        });
      })
      .catch(() => setProject(null))
      .finally(() => setLoading(false));
  }, [id]);

  // Refetch schedule whenever the builder navigates back to this page (e.g. from ScheduleTimeline)
  const isMongoId = (str) => /^[a-f\d]{24}$/i.test(str);
  useEffect(() => {
    if (!isMongoId(id)) return; // skip demo/hardcoded projects with non-ObjectId IDs
    projectsApi.getPublic(id)
      .then((p) => {
        setProject((prev) => prev ? { ...prev, _schedule: p.schedule ?? null, _plot: p.plot ?? null } : prev);
      })
      .catch(() => {});
  }, [location.key, id]);

  if (loading) return (
    <div style={{ background: colors.bgGradient, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: colors.textBright }}>
      Loading project…
    </div>
  );

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
             <button
               onClick={() => navigate(-1)}
               style={{ padding: "10px 20px", background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: radii.md, color: colors.textDim, fontWeight: "bold", cursor: "pointer", transition: "all 0.15s" }}
               onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#00d4ff"; e.currentTarget.style.color = "#00d4ff"; }}
               onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = colors.textDim; }}
             >
               ← Back
             </button>
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
                 {/* 3D Model — real data if available, placeholder for hardcoded */}
                 {project._floorPlan ? (
                   <div style={{ borderRadius: radii.md, height: "300px", overflow: "hidden", border: `1px solid ${colors.cardBorder}`, position: "relative" }}>
                     <div style={{ position: "absolute", top: 16, left: 16, zIndex: 1, background: "rgba(0,0,0,0.6)", padding: "4px 12px", borderRadius: 20, fontSize: "0.75rem", fontWeight: "bold", color: colors.textBright }}>Interactive 3D Model</div>
                     <House3D
                       width={project._floorPlan.width}
                       depth={project._floorPlan.depth}
                       stories={project._floorPlan.stories || 1}
                       floorPlan={project._floorPlan}
                       storyPlans={project._storyPlans}
                       wallMaterial={project._wallMaterial || "vinyl"}
                       roofMaterial={project._roofMaterial || "asphaltShingle"}
                       interactive={false}
                       showGround={true}
                       showSky={true}
                       style={{ width: "100%", height: "100%" }}
                     />
                   </div>
                 ) : (
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
                 )}
                 {/* Floor Plan — real SVG if available, placeholder for hardcoded */}
                 {project._floorPlan ? (
                   <div style={{ background: "rgba(10, 15, 26, 0.6)", borderRadius: radii.md, height: "300px", border: `1px solid ${colors.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                     <div style={{ position: "absolute", top: 16, left: 16, zIndex: 1, background: "rgba(0,0,0,0.6)", padding: "4px 12px", borderRadius: 20, fontSize: "0.75rem", fontWeight: "bold", color: colors.textBright }}>Floorplan Top-Down</div>
                     <FloorPlanMini floorPlan={project._floorPlan} />
                   </div>
                 ) : (
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
                 )}
              </div>
            </WidgetCard>
          </div>

          {/* Schedule */}
          <SchedulePreviewCard
            schedule={project._schedule ?? null}
            timeline={project.timeline}
            onViewDetail={() => {
              if (!mockProjectsDatabase[id]) setProjectId(id);
              navigate("/schedule");
            }}
          />

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
              {(() => {
                const plot = project._plot;
                const hasPlot = plot?.lat != null && plot?.lng != null;
                const score = hasPlot ? 82 : 0;
                const viabilityLabel = hasPlot ? "High Viability" : "Not Yet Assessed";
                const viabilityNote  = hasPlot ? "Based on selected lot & structural checks" : "No lot selected yet";
                const ringColor = hasPlot ? colors.success : colors.textDim;
                const zoning      = plot?.zoning    ?? "Pending";
                const environmental = hasPlot ? "Clear"    : "Pending";
                const structuralQA  = hasPlot ? "Verified" : "Pending";
                const rowColor = (val) => val === "Pending" ? colors.warn : colors.success;
                return (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "24px" }}>
                      <div style={{ width: "80px", height: "80px", borderRadius: "50%", border: `6px solid ${ringColor}`, display: "flex", alignItems: "center", justifyContent: "center", color: ringColor, fontSize: "1.75rem", fontWeight: "bold", fontFamily: fonts.data }}>
                        {score}
                      </div>
                      <div>
                        <div style={{ color: colors.textBright, fontWeight: "bold", fontSize: "1.125rem", marginBottom: 4 }}>{viabilityLabel}</div>
                        <div style={{ fontSize: "0.875rem" }}>{viabilityNote}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {[["Zoning", zoning], ["Environmental", environmental], ["Structural QA", structuralQA]].map(([lbl, val], i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "rgba(0,0,0,0.2)", borderRadius: radii.md }}>
                          <span style={{ color: colors.textDim, fontSize: "0.875rem" }}>{lbl}</span>
                          <span style={{ color: rowColor(val), fontWeight: "bold", fontSize: "0.875rem" }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </WidgetCard>
            
            <WidgetCard style={{ justifySelf: "stretch" }}>
               <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ color: colors.textBright, fontWeight: "bold", fontSize: "1.125rem" }}>Site Location</div>
                  <MiniMap
                    address={project._plot?.address ?? project.address}
                    location={project._plot ? { city: project._plot.address, state: "" } : (project.location ?? null)}
                  />
                  {project._plot && (
                    <div style={{ padding: "8px 12px", background: colors.surface, borderRadius: radii.md, border: `1px solid ${colors.cardBorder}` }}>
                      <div style={{ fontFamily: fonts.label, fontSize: 9, fontWeight: 700, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>
                        Selected Plot
                      </div>
                      <div style={{ fontFamily: fonts.data, fontSize: 11, color: colors.textBright, marginBottom: 6 }}>
                        {project._plot.address}
                      </div>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {project._plot.lot_sf && (
                          <span style={{ fontFamily: fonts.label, fontSize: 10, color: colors.textDim }}>{project._plot.lot_sf.toLocaleString()} sf</span>
                        )}
                        {project._plot.zoning && (
                          <span style={{ fontFamily: fonts.label, fontSize: 10, color: colors.textDim }}>{project._plot.zoning}</span>
                        )}
                        {project._plot.price && (
                          <span style={{ fontFamily: fonts.label, fontSize: 10, color: colors.success }}>${(project._plot.price / 1000).toFixed(0)}K</span>
                        )}
                      </div>
                      {project._plot.url && (
                        <a href={project._plot.url} target="_blank" rel="noopener noreferrer"
                           style={{ fontFamily: fonts.label, fontSize: 10, color: colors.accent, textDecoration: "none", display: "block", marginTop: 6 }}>
                          View Listing ↗
                        </a>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => navigate("/feasibility")}
                    style={{ padding: "8px 16px", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", border: "none", borderRadius: radii.md, color: "#fff", fontWeight: "bold", cursor: "pointer", fontSize: "0.875rem", width: "100%" }}
                  >
                    View Full Analysis →
                  </button>
               </div>
            </WidgetCard>
          </div>

        </div>
      </main>
    </div>
  );
}
