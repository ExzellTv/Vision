import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
// import { useUser } from "@clerk/clerk-react"; // DEMO MODE: Clerk disabled
import { colors, fonts, radii } from "../../theme/tokens";
import { projectsApi, floorplanApi } from "../../services/api";
import { useProject } from "../../hooks/useProjectStore";
import NewProjectModal from "../../components/shared/NewProjectModal";
import HomeownerProjectModal from "../../components/shared/HomeownerProjectModal";
import HelpTip from "../../components/shared/HelpTip";
import FirstTimeHint from "../../components/shared/FirstTimeHint";
import { useUserType } from "../../context/UserTypeContext";

// Accepted structural-model extensions for the import card
const IMPORT_ACCEPT = ".dxf,.dwg,.rvt,.3dm,.ifc,.skp";

/* ── helpers ── */
function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d  ago`;
  if (h >= 1) return `${h}h  ago`;
  if (m >= 1) return `${m}m  ago`;
  return "just now";
}

/* ── Detect project type from name/notes for silhouette selection ── */
function detectProjectType(name = "", notes = "") {
  const src = (name + " " + notes).toLowerCase();
  if (/bridge|pier|cable|span|truss/.test(src)) return "bridge";
  if (/tower|high.?rise|skyscraper|high rise/.test(src)) return "tower";
  if (/mixed.?use|commercial|retail|office/.test(src)) return "mixed";
  if (/residential|house|home|single.?family|duplex/.test(src)) return "residential";
  return "generic";
}

/* ── Architectural silhouette SVGs ── */
function ResidentialSilhouette() {
  return (
    <g opacity="0.13" fill="#3b82f6" stroke="#3b82f6" strokeWidth="0.5">
      {/* Main structure */}
      <rect x="68" y="78" width="104" height="52" fill="#3b82f6" opacity="0.08" />
      <rect x="68" y="78" width="104" height="52" fill="none" stroke="#3b82f6" strokeWidth="0.8" opacity="0.3" />
      {/* Roof */}
      <polygon points="58,78 120,38 182,78" fill="#3b82f6" opacity="0.1" stroke="#3b82f6" strokeWidth="0.8" strokeOpacity="0.4" />
      {/* Garage */}
      <rect x="32" y="95" width="42" height="35" fill="#3b82f6" opacity="0.06" stroke="#3b82f6" strokeWidth="0.7" strokeOpacity="0.25" />
      <polygon points="25,95 53,72 81,95" fill="#3b82f6" opacity="0.08" stroke="#3b82f6" strokeWidth="0.7" strokeOpacity="0.3" />
      {/* Windows */}
      <rect x="82" y="88" width="18" height="14" rx="1" fill="none" stroke="#3b82f6" strokeWidth="0.7" opacity="0.35" />
      <rect x="140" y="88" width="18" height="14" rx="1" fill="none" stroke="#3b82f6" strokeWidth="0.7" opacity="0.35" />
      {/* Door */}
      <rect x="108" y="102" width="24" height="28" rx="1" fill="none" stroke="#3b82f6" strokeWidth="0.7" opacity="0.3" />
      {/* Chimney */}
      <rect x="145" y="44" width="10" height="22" fill="#3b82f6" opacity="0.1" stroke="#3b82f6" strokeWidth="0.6" strokeOpacity="0.3" />
      {/* Ground line */}
      <line x1="20" y1="130" x2="220" y2="130" stroke="#3b82f6" strokeWidth="0.6" opacity="0.2" />
      {/* Grid lines in bg */}
      <line x1="20" y1="50" x2="20" y2="130" stroke="#3b82f6" strokeWidth="0.3" opacity="0.12" />
      <line x1="220" y1="50" x2="220" y2="130" stroke="#3b82f6" strokeWidth="0.3" opacity="0.12" />
    </g>
  );
}

function TowerSilhouette() {
  return (
    <g opacity="0.13" fill="#3b82f6" stroke="#3b82f6" strokeWidth="0.5">
      {/* Main tower */}
      <rect x="88" y="20" width="64" height="110" fill="#3b82f6" opacity="0.07" stroke="#3b82f6" strokeWidth="0.8" strokeOpacity="0.3" />
      {/* Tower spire */}
      <polygon points="120,8 130,20 110,20" fill="#3b82f6" opacity="0.1" stroke="#3b82f6" strokeWidth="0.7" strokeOpacity="0.35" />
      {/* Wing left */}
      <rect x="60" y="55" width="28" height="75" fill="#3b82f6" opacity="0.06" stroke="#3b82f6" strokeWidth="0.7" strokeOpacity="0.25" />
      {/* Wing right */}
      <rect x="152" y="55" width="28" height="75" fill="#3b82f6" opacity="0.06" stroke="#3b82f6" strokeWidth="0.7" strokeOpacity="0.25" />
      {/* Floor lines */}
      {[30, 40, 50, 60, 70, 80, 90, 100, 110].map((y, i) => (
        <line key={i} x1="88" y1={y} x2="152" y2={y} stroke="#3b82f6" strokeWidth="0.4" opacity="0.2" />
      ))}
      {/* Windows pattern */}
      {[25, 35, 45, 55, 65, 75, 85, 95, 105].map((y, i) => (
        <g key={i}>
          <rect x="95" y={y} width="8" height="7" rx="0.5" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.22" />
          <rect x="108" y={y} width="8" height="7" rx="0.5" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.22" />
          <rect x="121" y={y} width="8" height="7" rx="0.5" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.22" />
          <rect x="135" y={y} width="8" height="7" rx="0.5" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.18" />
        </g>
      ))}
      {/* Ground */}
      <rect x="40" y="130" width="160" height="6" rx="1" fill="#3b82f6" opacity="0.06" stroke="#3b82f6" strokeWidth="0.6" strokeOpacity="0.2" />
      <line x1="20" y1="136" x2="220" y2="136" stroke="#3b82f6" strokeWidth="0.6" opacity="0.18" />
    </g>
  );
}

function MixedUseSilhouette() {
  return (
    <g opacity="0.13" fill="#3b82f6" stroke="#3b82f6" strokeWidth="0.5">
      {/* Left building */}
      <rect x="24" y="60" width="52" height="70" fill="#3b82f6" opacity="0.07" stroke="#3b82f6" strokeWidth="0.8" strokeOpacity="0.3" />
      {/* Left rooftop units */}
      <rect x="30" y="52" width="14" height="8" fill="#3b82f6" opacity="0.08" stroke="#3b82f6" strokeWidth="0.5" strokeOpacity="0.3" />
      <rect x="52" y="48" width="18" height="12" fill="#3b82f6" opacity="0.08" stroke="#3b82f6" strokeWidth="0.5" strokeOpacity="0.3" />
      {/* Centre building - tallest */}
      <rect x="88" y="28" width="64" height="102" fill="#3b82f6" opacity="0.08" stroke="#3b82f6" strokeWidth="0.9" strokeOpacity="0.35" />
      {/* Centre top feature */}
      <rect x="100" y="18" width="40" height="10" fill="#3b82f6" opacity="0.06" stroke="#3b82f6" strokeWidth="0.6" strokeOpacity="0.25" />
      {/* Right building */}
      <rect x="164" y="50" width="52" height="80" fill="#3b82f6" opacity="0.07" stroke="#3b82f6" strokeWidth="0.8" strokeOpacity="0.3" />
      {/* Windows — centre */}
      {[35, 47, 59, 71, 83, 95, 107].map((y, i) => (
        <g key={i}>
          <rect x="95" y={y} width="10" height="8" rx="0.5" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.22" />
          <rect x="111" y={y} width="10" height="8" rx="0.5" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.22" />
          <rect x="127" y={y} width="10" height="8" rx="0.5" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.22" />
          <rect x="143" y={y} width="10" height="8" rx="0.5" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.18" />
        </g>
      ))}
      {/* Windows — left */}
      {[66, 78, 90, 102, 114].map((y, i) => (
        <g key={i}>
          <rect x="31" y={y} width="9" height="7" rx="0.5" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.2" />
          <rect x="46" y={y} width="9" height="7" rx="0.5" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.2" />
          <rect x="61" y={y} width="9" height="7" rx="0.5" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.2" />
        </g>
      ))}
      {/* Ground */}
      <line x1="16" y1="130" x2="224" y2="130" stroke="#3b82f6" strokeWidth="0.6" opacity="0.2" />
    </g>
  );
}

function BridgeSilhouette() {
  return (
    <g opacity="0.13" fill="#3b82f6" stroke="#3b82f6" strokeWidth="0.5">
      {/* Deck */}
      <rect x="16" y="90" width="208" height="10" rx="1" fill="#3b82f6" opacity="0.1" stroke="#3b82f6" strokeWidth="0.8" strokeOpacity="0.4" />
      {/* Left tower */}
      <rect x="54" y="28" width="14" height="72" fill="#3b82f6" opacity="0.1" stroke="#3b82f6" strokeWidth="0.8" strokeOpacity="0.35" />
      <rect x="50" y="24" width="22" height="8" rx="1" fill="#3b82f6" opacity="0.12" stroke="#3b82f6" strokeWidth="0.7" strokeOpacity="0.4" />
      {/* Right tower */}
      <rect x="172" y="28" width="14" height="72" fill="#3b82f6" opacity="0.1" stroke="#3b82f6" strokeWidth="0.8" strokeOpacity="0.35" />
      <rect x="168" y="24" width="22" height="8" rx="1" fill="#3b82f6" opacity="0.12" stroke="#3b82f6" strokeWidth="0.7" strokeOpacity="0.4" />
      {/* Main cables */}
      <path d="M61,28 Q120,68 179,28" fill="none" stroke="#3b82f6" strokeWidth="0.9" opacity="0.3" />
      {/* Hanger cables — left span */}
      {[70, 80, 90, 100, 110].map((x, i) => {
        const ty = 28 + (x - 61) * (x - 179) * -0.004;
        return <line key={i} x1={x} y1={ty} x2={x} y2="90" stroke="#3b82f6" strokeWidth="0.5" opacity="0.2" />;
      })}
      {/* Hanger cables — right span */}
      {[130, 140, 150, 160, 170].map((x, i) => {
        const ty = 28 + (x - 61) * (x - 179) * -0.004;
        return <line key={i} x1={x} y1={ty} x2={x} y2="90" stroke="#3b82f6" strokeWidth="0.5" opacity="0.2" />;
      })}
      {/* Cross bracing on towers */}
      <line x1="54" y1="55" x2="68" y2="67" stroke="#3b82f6" strokeWidth="0.5" opacity="0.2" />
      <line x1="68" y1="55" x2="54" y2="67" stroke="#3b82f6" strokeWidth="0.5" opacity="0.2" />
      <line x1="172" y1="55" x2="186" y2="67" stroke="#3b82f6" strokeWidth="0.5" opacity="0.2" />
      <line x1="186" y1="55" x2="172" y2="67" stroke="#3b82f6" strokeWidth="0.5" opacity="0.2" />
      {/* Piers below deck */}
      <rect x="58" y="100" width="6" height="30" fill="#3b82f6" opacity="0.1" stroke="#3b82f6" strokeWidth="0.6" strokeOpacity="0.25" />
      <rect x="176" y="100" width="6" height="30" fill="#3b82f6" opacity="0.1" stroke="#3b82f6" strokeWidth="0.6" strokeOpacity="0.25" />
      {/* Water line */}
      <line x1="16" y1="130" x2="224" y2="130" stroke="#3b82f6" strokeWidth="0.5" opacity="0.15" />
      <line x1="16" y1="134" x2="224" y2="134" stroke="#3b82f6" strokeWidth="0.3" opacity="0.1" />
    </g>
  );
}

function GenericSilhouette({ seed = 0 }) {
  const lines = [
    { x1: 20 + seed * 3, y1: 30, x2: 120 + seed * 2, y2: 80 },
    { x1: 80, y1: 10 + seed * 2, x2: 200 + seed, y2: 60 },
    { x1: 30, y1: 110, x2: 250 + seed * 2, y2: 40 + seed },
    { x1: 150 + seed, y1: 90, x2: 280, y2: 130 },
  ];
  const rects = [
    { x: 60 + seed * 4, y: 30, w: 80, h: 55 },
    { x: 160 + seed * 2, y: 50, w: 60, h: 40 },
    { x: 30, y: 70 + seed * 2, w: 50, h: 35 },
  ];
  return (
    <g opacity="0.13" stroke="#3b82f6" strokeWidth="0.9" fill="none">
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} opacity="0.3" />
      ))}
      {lines.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} opacity="0.2" />
      ))}
      <circle cx={100 + seed * 2} cy={65 + seed} r={16} opacity="0.2" />
      <line x1={100 + seed * 2} y1={49 + seed} x2={100 + seed * 2} y2={81 + seed} opacity="0.2" />
      <line x1={84 + seed * 2} y1={65 + seed} x2={116 + seed * 2} y2={65 + seed} opacity="0.2" />
    </g>
  );
}

/* ── Mini floor plan renderer from MongoDB floor_plan data ── */
function FloorPlanThumb({ floorPlan }) {
  if (!floorPlan || !floorPlan.rooms?.length) return null;

  const rooms = floorPlan.rooms || [];
  const W = 240, H = 130, PAD = 10;

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  rooms.forEach((r) => {
    const rx = r.x ?? 0, ry = r.y ?? 0;
    const rw = r.w ?? r.width ?? 10, rh = r.h ?? r.depth ?? 10;
    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx + rw);
    maxY = Math.max(maxY, ry + rh);
  });

  const fw = maxX - minX || 1;
  const fh = maxY - minY || 1;
  const scale = Math.min((W - PAD * 2) / fw, (H - PAD * 2) / fh);
  const ox = PAD + ((W - PAD * 2) - fw * scale) / 2;
  const oy = PAD + ((H - PAD * 2) - fh * scale) / 2;

  const ROOM_COLORS = {
    bedroom: "#3b82f6",
    bathroom: "#06b6d4",
    kitchen: "#f59e0b",
    living: "#8b5cf6",
    dining: "#ec4899",
    garage: "#6b7280",
    office: "#10b981",
    default: "#3b82f6",
  };

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{ position: "absolute", inset: 0 }}
      preserveAspectRatio="xMidYMid meet"
    >
      {rooms.map((r, i) => {
        const rx = ((r.x ?? 0) - minX) * scale + ox;
        const ry = ((r.y ?? 0) - minY) * scale + oy;
        const rw = (r.w ?? r.width ?? 10) * scale;
        const rh = (r.h ?? r.depth ?? 10) * scale;
        const type = (r.type || "default").toLowerCase();
        const col = ROOM_COLORS[type] || ROOM_COLORS.default;
        return (
          <g key={i}>
            <rect x={rx} y={ry} width={rw} height={rh} fill={col} fillOpacity="0.07" stroke={col} strokeWidth="0.8" strokeOpacity="0.4" rx="0.5" />
          </g>
        );
      })}
    </svg>
  );
}

/* ── Card thumbnail: floor plan if available, else silhouette ── */
function CardGraphic({ project, index, onDelete }) {
  const fp = project.floor_plan;
  const type = detectProjectType(project.name, project.notes);

  const silhouette = {
    residential: <ResidentialSilhouette />,
    tower: <TowerSilhouette />,
    mixed: <MixedUseSilhouette />,
    bridge: <BridgeSilhouette />,
    generic: <GenericSilhouette seed={index} />,
  }[type] || <GenericSilhouette seed={index} />;

  const hasFp = fp && fp.rooms && fp.rooms.length > 0;

  return (
    <div
      style={{
        position: "relative",
        height: 220,
        background: "linear-gradient(160deg, #090f1c 0%, #0b1628 55%, #0d1a30 100%)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Blueprint grid overlay */}
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id={`grid-${index}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#3b82f6" strokeWidth="0.25" opacity="0.18" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grid-${index})`} />
      </svg>

      {/* Silhouette or floor plan */}
      {hasFp ? (
        <FloorPlanThumb floorPlan={fp} />
      ) : (
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 240 140"
          style={{ position: "absolute", inset: 0 }}
          preserveAspectRatio="xMidYMid meet"
        >
          {silhouette}
        </svg>
      )}

      {/* Location badge — top left */}
      {project.location?.city && (
        <div style={{
          position: "absolute",
          top: 10,
          left: 10,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          background: "rgba(10,18,32,0.78)",
          border: "1px solid rgba(59,130,246,0.25)",
          borderRadius: 4,
          padding: "3px 9px",
          fontSize: 10,
          fontFamily: fonts.label,
          color: colors.secondary,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}>
          <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
            <path d="M5 0C2.79 0 1 1.79 1 4c0 3 4 8 4 8s4-5 4-8c0-2.21-1.79-4-4-4Z" fill={colors.secondary} />
            <circle cx="5" cy="4" r="1.5" fill="rgba(10,18,32,0.9)" />
          </svg>
          {project.location.city}, {project.location.state}
        </div>
      )}

      {/* Trashcan — top right */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(project); }}
        title="Delete"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "rgba(10,18,32,0.7)",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 4,
          color: colors.danger,
          cursor: "pointer",
          padding: "4px 6px",
          display: "flex",
          alignItems: "center",
          opacity: 0.75,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.75")}
      >
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
          <path d="M2 3h8M5 3V2h2v1M4.5 5v4M7.5 5v4M3 3l.5 7h5l.5-7"
            stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
    </div>
  );
}

/* ── Individual project card ── */
function ProjectCard({ project, index, onSelect, onDelete, onEditFloorPlan, onRename, onOpenSchedule, onAssessLocation, isHomeowner }) {
  const [hovered, setHovered] = useState(false);
  const { projectId: activeProjectId, ragViolations } = useProject();
  const hasComplianceIssues = project.id === activeProjectId && ragViolations?.length > 0;

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: colors.cardSurface,
          border: `1px solid ${hovered ? colors.secondary + "55" : colors.cardBorder}`,
          borderRadius: radii.xl,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
          boxShadow: hovered ? "0 4px 24px rgba(59,130,246,0.08)" : "none",
          cursor: "default",
        }}
      >
        <CardGraphic project={project} index={index} onDelete={onDelete} />

        {/* Info area */}
        <div style={{ padding: "18px 20px 0" }}>
          {/* Name + pen */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: colors.textBright, lineHeight: 1.2, flex: 1, minWidth: 0 }}>
              {project.name}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onRename(project); }}
              title="Rename"
              style={{
                background: "none", border: "none",
                color: colors.textDim, cursor: "pointer",
                padding: "2px", borderRadius: 4,
                display: "flex", alignItems: "center", flexShrink: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = colors.textBright)}
              onMouseLeave={(e) => (e.currentTarget.style.color = colors.textDim)}
            >
              <svg width="15" height="15" viewBox="0 0 12 12" fill="none">
                <path d="M8.5 1.5a1.5 1.5 0 0 1 2.12 2.12L4 10.24 1.5 10.5l.26-2.5L8.5 1.5Z"
                  stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" fill="none" />
              </svg>
            </button>
          </div>

          {/* Stats grid */}
          {(() => {
            const fp = project.floor_plan;
            const layers = project.materials?.length ?? 0;
            const ROOM_TYPES = new Set(["bedroom", "bathroom", "kitchen", "living", "dining", "garage", "hallway", "closet", "laundry", "entry", "stair", "office"]);
            const rooms = (fp?.rooms ?? []).filter((r) => r.isRoom === true || ROOM_TYPES.has((r.type || "").toLowerCase())).length;
            const sf = fp?.totalSF || project.generate_params?.targetSF || 0;
            const isReadyToBuild =
              (fp?.rooms?.length > 0) &&
              (project.plot != null && project.plot.lat != null && project.plot.lng != null) &&
              !hasComplianceIssues;
            const dotColor = isReadyToBuild ? "#22c55e" : "#ef4444";
            const badgeLabel = isReadyToBuild ? "Ready to Build" : hasComplianceIssues ? "Compliance Issues" : "Not Ready";
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 0", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: colors.textBright, fontFamily: fonts.data, letterSpacing: "0.04em" }}>
                    {layers} LAYER{layers !== 1 ? "S" : ""}
                  </span>
                  {isHomeowner && (
                    <HelpTip
                      size={12}
                      title="Material layers"
                      body="Each layer is a part of how the house is built — foundation, framing, insulation, drywall, etc. More layers picked = more detailed cost & buildability estimates."
                    />
                  )}
                </div>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: colors.textBright, fontFamily: fonts.data, letterSpacing: "0.04em" }}>
                    {rooms} ROOM{rooms !== 1 ? "S" : ""}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: colors.textBright, fontFamily: fonts.data, letterSpacing: "0.04em" }}>
                    {sf ? Math.round(sf).toLocaleString() : "—"} SF
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: dotColor, fontFamily: fonts.label, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {badgeLabel}
                  </span>
                  {isHomeowner && (
                    <HelpTip
                      size={11}
                      title="What this badge means"
                      body={
                        <div>
                          <div style={{ marginBottom: 6 }}><b style={{ color: "#22c55e" }}>Ready to Build</b> — floor plan saved, location set, and no compliance issues.</div>
                          <div style={{ marginBottom: 6 }}><b style={{ color: "#ef4444" }}>Compliance Issues</b> — code or zoning rules need attention before building.</div>
                          <div><b style={{ color: "#ef4444" }}>Not Ready</b> — you still need to draw a floor plan and pick a building site.</div>
                        </div>
                      }
                    />
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Action buttons */}
        <div style={{ padding: "14px 20px 20px", marginTop: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => onEditFloorPlan(project)}
            style={{
              flex: 1,
              padding: "12px 0",
              background: "transparent",
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: radii.lg,
              color: colors.textBright,
              fontFamily: fonts.label,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "background 0.15s ease, border-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.surfaceHover;
              e.currentTarget.style.borderColor = colors.secondary + "70";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = colors.cardBorder;
            }}
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.1" />
              <path d="M3 4h6M3 6h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
            </svg>
            Edit Floor Plan
          </button>
          <button
            onClick={() => onOpenSchedule(project)}
            style={{
              flex: 1,
              padding: "12px 0",
              background: "transparent",
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: radii.lg,
              color: colors.textBright,
              fontFamily: fonts.label,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "background 0.15s ease, border-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.surfaceHover;
              e.currentTarget.style.borderColor = colors.secondary + "70";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = colors.cardBorder;
            }}
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="2" width="10" height="9" rx="1" stroke="currentColor" strokeWidth="1.1" fill="none" />
              <path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            </svg>
            View Schedule
          </button>
        </div>

        {/* Assess Location — full width */}
        <div style={{ padding: "0 20px 20px", position: "relative" }}>
          {isHomeowner && (
            <div style={{ position: "absolute", top: -2, right: 24, zIndex: 2 }}>
              <HelpTip
                size={12}
                align="right"
                title="Assess Plot of Land"
                body="Open an interactive map to study a piece of land — zoning, lot size, nearby home prices, and a feasibility score. Use this before you commit to a property."
              />
            </div>
          )}
          <button
            onClick={() => onAssessLocation(project)}
            style={{
              width: "100%",
              padding: "12px 0",
              background: "transparent",
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: radii.lg,
              color: colors.textBright,
              fontFamily: fonts.label,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "background 0.15s ease, border-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.surfaceHover;
              e.currentTarget.style.borderColor = colors.secondary + "70";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = colors.cardBorder;
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
              <path d="M7 1C5.3 1 3.5 3 3.5 5.5C3.5 8.5 7 13 7 13C7 13 10.5 8.5 10.5 5.5C10.5 3 8.7 1 7 1Z"
                stroke="currentColor" strokeWidth="1.2" fill="none" />
              <circle cx="7" cy="5.5" r="1.3" fill="currentColor" opacity="0.8" />
            </svg>
            Assess Plot of Land
          </button>
        </div>
      </div>

    </>
  );
}

/* ── Import Structural Model card — click or drop to upload a CAD file ── */
function ImportCard({ onImported }) {
  const inputRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    setResult(null);
    setUploading(true);
    try {
      const res = await floorplanApi.importModel(file);
      setResult({ filename: file.filename || file.name, size: file.size, ...res });
      onImported?.(res);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [onImported]);

  const openPicker = useCallback(() => {
    if (uploading) return;
    inputRef.current?.click();
  }, [uploading]);

  const onInputChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so selecting the same file twice still fires change.
    e.target.value = "";
  }, [handleFile]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onKeyDown = useCallback((e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(); }
  }, [openPicker]);

  const accentBorder = dragging ? colors.secondary : hovered ? colors.secondary + "70" : colors.cardBorder;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openPicker}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      style={{
        border: `2px dashed ${accentBorder}`,
        borderRadius: radii.xl,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "40px 24px",
        minHeight: 290,
        cursor: uploading ? "wait" : "pointer",
        transition: "border-color 0.2s ease, background 0.2s ease",
        background: dragging
          ? "rgba(59,130,246,0.06)"
          : hovered
          ? "rgba(59,130,246,0.03)"
          : "transparent",
        outline: "none",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        onChange={onInputChange}
        style={{ display: "none" }}
      />

      <div
        style={{
          width: 50,
          height: 50,
          borderRadius: "50%",
          background: colors.cardSurface,
          border: `1px solid ${colors.cardBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {uploading ? (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ animation: "spin 1s linear infinite" }}>
            <circle cx="11" cy="11" r="8" stroke={colors.secondary} strokeWidth="2" opacity="0.3" />
            <path d="M11 3a8 8 0 0 1 8 8" stroke={colors.secondary} strokeWidth="2" strokeLinecap="round" />
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M6 5h6l4 4v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" stroke={colors.textDim} strokeWidth="1.2" fill="none" />
            <path d="M12 5v4h4" stroke={colors.textDim} strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M11 12v4M9 14l2-2 2 2" stroke={colors.textDim} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 700, color: colors.textBright, marginBottom: 7 }}>
          {uploading ? "Uploading…" : "Import Structural Model"}
          {!uploading && (
            <HelpTip
              size={12}
              tone="muted"
              title="Already have plans?"
              body="If your architect or builder shared a CAD/Revit file, drop it here and Vision will read the rooms and walls so you don't have to draw it. Most homeowners can skip this and use the Floor Plan Studio instead."
            />
          )}
        </div>
        <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.65, maxWidth: 220 }}>
          {uploading
            ? "Parsing your model…"
            : "Click to browse, or drop a Revit, AutoCAD, or Rhino file (.dxf, .dwg, .rvt, .3dm, .ifc, .skp)"}
        </div>
      </div>

      {result && !uploading && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: 260,
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(46,213,115,0.08)",
            border: "1px solid rgba(46,213,115,0.25)",
            fontSize: 11,
            color: colors.textBright,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, color: "#2ed573", marginBottom: 4 }}>
            ✓ Imported {result.filename}
          </div>
          {result.summary?.entity_count != null && (
            <div style={{ color: colors.textDim, fontFamily: fonts.data }}>
              {result.summary.entity_count.toLocaleString()} entities
              {result.summary.layers?.length ? ` · ${result.summary.layers.length} layers` : ""}
              {result.summary.bounding_box ? ` · ${Math.round(result.summary.bounding_box.width)}×${Math.round(result.summary.bounding_box.height)}` : ""}
            </div>
          )}
          {result.message && !result.summary && (
            <div style={{ color: colors.textDim }}>{result.message}</div>
          )}
        </div>
      )}

      {error && !uploading && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: 260,
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(255,71,87,0.08)",
            border: "1px solid rgba(255,71,87,0.25)",
            fontSize: 11,
            color: "#ff6b7a",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

/* ── Rename modal ── */
function RenameModal({ project, onClose, onConfirm }) {
  const [name, setName] = useState(project.name || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!name.trim()) { setError("Name cannot be empty."); return; }
    setLoading(true);
    try {
      await onConfirm(project, name.trim());
      onClose();
    } catch (e) {
      setError(e.message || "Failed to rename project.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,11,18,0.85)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#111827",
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: 14,
          padding: "36px 40px",
          width: 420,
          maxWidth: "92vw",
        }}
      >
        <h2 style={{ margin: "0 0 18px", fontSize: 20, fontWeight: 700, color: colors.textBright }}>
          Rename Project
        </h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
          autoFocus
          style={{
            width: "100%",
            padding: "11px 14px",
            background: colors.bg,
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: radii.lg,
            color: colors.text,
            fontFamily: fonts.label,
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
            marginBottom: 8,
          }}
          onFocus={(e) => (e.target.style.borderColor = colors.secondary)}
          onBlur={(e) => (e.target.style.borderColor = colors.cardBorder)}
        />
        {error && (
          <div style={{ color: colors.danger, fontSize: 12, marginBottom: 12, fontFamily: fonts.label }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "11px 0",
              background: "transparent",
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: radii.lg,
              color: colors.text,
              fontFamily: fonts.label,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{
              flex: 1,
              padding: "11px 0",
              background: loading ? colors.cardBorder : "linear-gradient(135deg, #2563eb, #1d4ed8)",
              border: "none",
              borderRadius: radii.lg,
              color: "#fff",
              fontFamily: fonts.label,
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Saving…" : "Rename"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Delete confirm modal ── */
function DeleteModal({ project, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);
  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm(project);
    setLoading(false);
    onClose();
  };
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,11,18,0.85)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#111827",
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: 14,
          padding: "36px 40px",
          width: 400,
          maxWidth: "92vw",
        }}
      >
        <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 700, color: colors.textBright }}>
          Delete Project?
        </h2>
        <p style={{ margin: "0 0 28px", fontSize: 13, color: colors.textDim, lineHeight: 1.6 }}>
          <span style={{ color: colors.textBright, fontWeight: 600 }}>{project.name}</span> will be permanently deleted and cannot be recovered.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "11px 0",
              background: "transparent",
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: radii.lg,
              color: colors.text,
              fontFamily: fonts.label,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{
              flex: 1,
              padding: "11px 0",
              background: colors.danger,
              border: "none",
              borderRadius: radii.lg,
              color: "#fff",
              fontFamily: fonts.label,
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main screen ── */
export default function ProjectsScreen() {
  const navigate = useNavigate();
  const { setProjectName, setProjectId, setStoryPlans, setFloorPlan, setGenerateParams, setProjectLocation, resetProject, setBuildingContext, setMaterials, setSavedSchedule } = useProject();
  const { isHomeowner } = useUserType();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await projectsApi.list();
      setProjects(data);
    } catch (e) {
      setError(e.message || "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleSelect = (project) => {
    setProjectName(project.name);
    setProjectId(project.id);
    if (project.generate_params) setGenerateParams(project.generate_params);
    if (project.location) setProjectLocation(project.location);
    // Restore all story plans so the 3D model reflects the correct number of floors
    if (project.story_plans?.length > 0) {
      setStoryPlans(project.story_plans);
      navigate("/edit");
    } else if (project.floor_plan) {
      setFloorPlan(project.floor_plan);
      navigate("/develop");
    } else {
      navigate("/develop");
    }
  };

  const handleNewProject = () => setShowNewModal(true);

  const handleGenerate = (params) => {
    resetProject();
    setProjectName(params.projectName || "New Project");
    setGenerateParams({
      targetSF: params.targetSF,
      bedrooms: params.bedrooms,
      bathrooms: params.bathrooms,
      stories: params.stories,
      lotWidth: 60,
      lotDepth: 120,
      style: params.style || "Ranch",
      garage: params.garage || "2-car",
      openFloorPlan: true,
      budget: params.budget || null,
      conversationHistory: params.conversationHistory || null,
      aiSummary: params.aiSummary || "",
      aiRooms: params.aiRooms || null,
    });
    setProjectLocation(params.location || null);
    navigate("/develop");
  };

  const handleDeleteConfirm = async (project) => {
    try {
      await projectsApi.delete(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (e) {
      setError(e.message || "Failed to delete project.");
    }
  };

  const handleEditFloorPlan = (project) => {
    setProjectName(project.name);
    setProjectId(project.id);
    if (project.generate_params) setGenerateParams(project.generate_params);
    if (project.location) setProjectLocation(project.location);
    if (project.story_plans?.length > 0) {
      setStoryPlans(project.story_plans);
    } else if (project.floor_plan) {
      setFloorPlan(project.floor_plan);
    }
    navigate("/develop");
  };

  const handleOpenSchedule = (project) => {
    setProjectName(project.name);
    setProjectId(project.id);
    if (project.generate_params) setGenerateParams(project.generate_params);
    if (project.floor_plan) setFloorPlan(project.floor_plan);
    if (project.story_plans?.length > 0) setStoryPlans(project.story_plans);
    if (project.materials?.length > 0) setMaterials(project.materials);
    if (project.building_context) setBuildingContext(project.building_context);
    // Restore saved schedule state (startDate + manual overrides)
    if (project.schedule) setSavedSchedule(project.schedule);
    navigate("/schedule");
  };

  const handleAssessLocation = (project) => {
    setProjectName(project.name);
    setProjectId(project.id);
    if (project.generate_params) setGenerateParams(project.generate_params);
    if (project.location) setProjectLocation(project.location);
    if (project.story_plans?.length > 0) {
      setStoryPlans(project.story_plans);
    } else if (project.floor_plan) {
      setFloorPlan(project.floor_plan);
    }
    if (project.materials?.length > 0) setMaterials(project.materials);
    navigate("/feasibility");
  };

  const handleRenameConfirm = async (project, newName) => {
    await projectsApi.update(project.id, { name: newName });
    setProjects((prev) =>
      prev.map((p) => (p.id === project.id ? { ...p, name: newName } : p))
    );
  };

  return (
    <div
      style={{
        background: colors.bg,
        height: "100%",
        overflowY: "auto",
        fontFamily: fonts.label,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {isHomeowner && (
        <FirstTimeHint
          storageKey="projects"
          title="Your homes live here"
          steps={[
            { text: "Each card is one home you're planning. Tap one to keep editing it." },
            { text: "Use the three buttons on a card: Edit Floor Plan to draw rooms, View Schedule to see the build timeline, and Assess Plot of Land to study a building site." },
            { text: "Look for small ? icons throughout — tap any of them for plain-English help." },
          ]}
        />
      )}

      {/* Main content */}
      <div style={{ flex: 1, padding: "36px 40px 0" }}>
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
                color: colors.textBright,
                letterSpacing: "-0.5px",
                lineHeight: 1.1,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              Your Projects
              {isHomeowner && (
                <HelpTip
                  size={14}
                  title="What's a project?"
                  body="A project is one home you're planning. Each project keeps your floor plan, building site, materials, and schedule in one place. Start a new one any time and switch between them freely."
                />
              )}
            </h1>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 14,
                color: colors.textDim,
              }}
            >
              Select a project to view more details.
            </p>
          </div>

          <button
            onClick={handleNewProject}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 20px",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              border: "none",
              borderRadius: radii.lg,
              color: "#fff",
              fontFamily: fonts.label,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 14px rgba(37,99,235,0.45)",
              flexShrink: 0,
              transition: "box-shadow 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(37,99,235,0.6)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 2px 14px rgba(37,99,235,0.45)")}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v11M1 6.5h11" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New Project
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: colors.textDim,
              fontSize: 14,
              padding: "48px 0",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ animation: "spin 1s linear infinite" }}>
              <circle cx="9" cy="9" r="7" stroke={colors.cardBorder} strokeWidth="2" />
              <path d="M9 2a7 7 0 0 1 7 7" stroke={colors.secondary} strokeWidth="2" strokeLinecap="round" />
            </svg>
            Loading projects…
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              background: colors.dangerDim,
              border: `1px solid ${colors.danger}40`,
              borderRadius: radii.lg,
              padding: "13px 16px",
              color: colors.danger,
              fontSize: 13,
              marginBottom: 24,
            }}
          >
            {error}
          </div>
        )}

        {/* Projects grid */}
        {!loading && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
              gap: 24,
              paddingBottom: 40,
            }}
          >
            {projects.map((project, i) => (
              <ProjectCard
                key={project.id}
                project={project}
                index={i}
                onSelect={handleSelect}
                onDelete={setDeleteTarget}
                onEditFloorPlan={handleEditFloorPlan}
                onRename={setRenameTarget}
                onOpenSchedule={handleOpenSchedule}
                onAssessLocation={handleAssessLocation}
                isHomeowner={isHomeowner}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {deleteTarget && (
        <DeleteModal
          project={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
      {renameTarget && (
        <RenameModal
          project={renameTarget}
          onClose={() => setRenameTarget(null)}
          onConfirm={handleRenameConfirm}
        />
      )}
      {showNewModal && (
        isHomeowner ? (
          <HomeownerProjectModal
            onClose={() => setShowNewModal(false)}
            onGenerate={(p) => { setShowNewModal(false); handleGenerate(p); }}
          />
        ) : (
          <NewProjectModal
            onClose={() => setShowNewModal(false)}
            onGenerate={handleGenerate}
          />
        )
      )}
    </div>
  );
}
