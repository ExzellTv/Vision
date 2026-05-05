import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
// import { useUser } from "@clerk/clerk-react"; // DEMO MODE: Clerk disabled
import { colors, fonts, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import { mapApi, projectsApi } from "../../services/api";
import { computeNearbyComps, runValuation } from "../FeasibilityDashboard/valuationEngine";
import NewProjectModal from "../../components/shared/NewProjectModal";
import HomeownerProjectModal from "../../components/shared/HomeownerProjectModal";
import HelpTip from "../../components/shared/HelpTip";
import GuidedTour from "../../components/shared/GuidedTour";
import { useUserType } from "../../context/UserTypeContext";
import useBreakpoint from "../../hooks/useBreakpoint";

/* ── Detect project type from name for thumbnail silhouette ── */
function detectProjectType(name = "") {
  const src = name.toLowerCase();
  if (/bridge|pier|cable|span|truss/.test(src)) return "bridge";
  if (/tower|high.?rise|skyscraper/.test(src)) return "tower";
  if (/mixed.?use|commercial|retail|office/.test(src)) return "mixed";
  if (/residential|house|home|single.?family|duplex/.test(src)) return "residential";
  return "generic";
}

/* ── Silhouette SVGs (compact) ── */
function ResidentialSil() {
  return (
    <g opacity="0.13" fill="#3b82f6" stroke="#3b82f6" strokeWidth="0.5">
      <rect x="68" y="78" width="104" height="52" fill="#3b82f6" opacity="0.08" stroke="#3b82f6" strokeWidth="0.8" strokeOpacity="0.3" />
      <polygon points="58,78 120,38 182,78" fill="#3b82f6" opacity="0.1" stroke="#3b82f6" strokeWidth="0.8" strokeOpacity="0.4" />
      <rect x="32" y="95" width="42" height="35" fill="#3b82f6" opacity="0.06" stroke="#3b82f6" strokeWidth="0.7" strokeOpacity="0.25" />
      <polygon points="25,95 53,72 81,95" fill="#3b82f6" opacity="0.08" stroke="#3b82f6" strokeWidth="0.7" strokeOpacity="0.3" />
      <rect x="82" y="88" width="18" height="14" rx="1" fill="none" stroke="#3b82f6" strokeWidth="0.7" opacity="0.35" />
      <rect x="140" y="88" width="18" height="14" rx="1" fill="none" stroke="#3b82f6" strokeWidth="0.7" opacity="0.35" />
      <rect x="108" y="102" width="24" height="28" rx="1" fill="none" stroke="#3b82f6" strokeWidth="0.7" opacity="0.3" />
      <line x1="20" y1="130" x2="220" y2="130" stroke="#3b82f6" strokeWidth="0.6" opacity="0.2" />
    </g>
  );
}
function TowerSil() {
  return (
    <g opacity="0.13" fill="#3b82f6" stroke="#3b82f6" strokeWidth="0.5">
      <rect x="88" y="20" width="64" height="110" fill="#3b82f6" opacity="0.07" stroke="#3b82f6" strokeWidth="0.8" strokeOpacity="0.3" />
      <polygon points="120,8 130,20 110,20" fill="#3b82f6" opacity="0.1" stroke="#3b82f6" strokeWidth="0.7" strokeOpacity="0.35" />
      <rect x="60" y="55" width="28" height="75" fill="#3b82f6" opacity="0.06" stroke="#3b82f6" strokeWidth="0.7" strokeOpacity="0.25" />
      <rect x="152" y="55" width="28" height="75" fill="#3b82f6" opacity="0.06" stroke="#3b82f6" strokeWidth="0.7" strokeOpacity="0.25" />
      {[30, 50, 70, 90, 110].map((y, i) => (
        <line key={i} x1="88" y1={y} x2="152" y2={y} stroke="#3b82f6" strokeWidth="0.4" opacity="0.2" />
      ))}
      <line x1="16" y1="130" x2="224" y2="130" stroke="#3b82f6" strokeWidth="0.6" opacity="0.2" />
    </g>
  );
}
function MixedSil() {
  return (
    <g opacity="0.13" fill="#3b82f6" stroke="#3b82f6" strokeWidth="0.5">
      <rect x="24" y="60" width="52" height="70" fill="#3b82f6" opacity="0.07" stroke="#3b82f6" strokeWidth="0.8" strokeOpacity="0.3" />
      <rect x="88" y="28" width="64" height="102" fill="#3b82f6" opacity="0.08" stroke="#3b82f6" strokeWidth="0.9" strokeOpacity="0.35" />
      <rect x="164" y="50" width="52" height="80" fill="#3b82f6" opacity="0.07" stroke="#3b82f6" strokeWidth="0.8" strokeOpacity="0.3" />
      <line x1="16" y1="130" x2="224" y2="130" stroke="#3b82f6" strokeWidth="0.6" opacity="0.2" />
    </g>
  );
}
function GenericSil({ seed = 0 }) {
  return (
    <g opacity="0.13" stroke="#3b82f6" strokeWidth="0.9" fill="none">
      <rect x={60 + seed * 4} y="30" width="80" height="55" opacity="0.3" />
      <rect x={160 + seed * 2} y="50" width="60" height="40" opacity="0.3" />
      <rect x="30" y={70 + seed * 2} width="50" height="35" opacity="0.3" />
      <line x1="16" y1="130" x2="224" y2="130" opacity="0.2" />
    </g>
  );
}

const ROOM_COLORS = {
  bedroom: "#3b82f6",
  bathroom: "#06b6d4",
  kitchen: "#f59e0b",
  living: "#8b5cf6",
  dining: "#ec4899",
  garage: "#6b7280",
  office: "#10b981",
};

/* ── Mini floor plan SVG thumbnail ── */
function FloorPlanMini({ floorPlan }) {
  const rooms = floorPlan?.rooms || [];
  if (!rooms.length) return null;

  const W = 240, H = 130, PAD = 8;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  rooms.forEach((r) => {
    const rx = r.x ?? 0, ry = r.y ?? 0;
    const rw = r.w ?? r.width ?? 10, rh = r.h ?? r.depth ?? 10;
    minX = Math.min(minX, rx); minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx + rw); maxY = Math.max(maxY, ry + rh);
  });
  const fw = maxX - minX || 1, fh = maxY - minY || 1;
  const scale = Math.min((W - PAD * 2) / fw, (H - PAD * 2) / fh);
  const ox = PAD + ((W - PAD * 2) - fw * scale) / 2;
  const oy = PAD + ((H - PAD * 2) - fh * scale) / 2;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}
      style={{ position: "absolute", inset: 0 }} preserveAspectRatio="xMidYMid meet">
      {rooms.map((r, i) => {
        const rx = ((r.x ?? 0) - minX) * scale + ox;
        const ry = ((r.y ?? 0) - minY) * scale + oy;
        const rw = (r.w ?? r.width ?? 10) * scale;
        const rh = (r.h ?? r.depth ?? 10) * scale;
        const col = ROOM_COLORS[(r.type || "").toLowerCase()] || "#3b82f6";
        return (
          <rect key={i} x={rx} y={ry} width={rw} height={rh}
            fill={col} fillOpacity="0.1" stroke={col} strokeWidth="0.8" strokeOpacity="0.45" rx="0.5" />
        );
      })}
    </svg>
  );
}

/* ── Project thumbnail used in RecentRow ── */
function ProjectThumb({ project, index }) {
  const fp = project?.floor_plan;
  const hasFp = fp?.rooms?.length > 0;
  const type = detectProjectType(project?.name || "");
  const silhouetteMap = {
    residential: <ResidentialSil />,
    tower: <TowerSil />,
    mixed: <MixedSil />,
    generic: <GenericSil seed={index} />,
    bridge: <GenericSil seed={index + 3} />,
  };
  const silhouette = silhouetteMap[type] || <GenericSil seed={index} />;
  const gridId = `dg-${index}`;

  return (
    <div style={{
      position: "relative",
      width: 72,
      height: 52,
      flexShrink: 0,
      background: "linear-gradient(160deg, #090f1c 0%, #0b1628 55%, #0d1a30 100%)",
      border: `1px solid ${colors.cardBorder}`,
      borderRadius: radii.md,
      overflow: "hidden",
    }}>
      {/* Blueprint grid */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} preserveAspectRatio="none">
        <defs>
          <pattern id={gridId} width="14" height="14" patternUnits="userSpaceOnUse">
            <path d="M 14 0 L 0 0 0 14" fill="none" stroke="#3b82f6" strokeWidth="0.25" opacity="0.2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${gridId})`} />
      </svg>
      {hasFp ? (
        <FloorPlanMini floorPlan={fp} />
      ) : (
        <svg width="100%" height="100%" viewBox="0 0 240 140"
          style={{ position: "absolute", inset: 0 }} preserveAspectRatio="xMidYMid meet">
          {silhouette}
        </svg>
      )}
    </div>
  );
}

function Sparkline({ data, color }) {
  if (!data?.length) {
    return <div style={{ width: 80, height: 32 }} aria-hidden="true" />;
  }
  const w = 80, h = 32;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NetworkPattern() {
  return (
    <svg
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      preserveAspectRatio="xMidYMid slice"
    >
      <g opacity="0.12" stroke={colors.accent} strokeWidth="0.8" fill="none">
        <circle cx="60" cy="40" r="3" fill={colors.accent} stroke="none" />
        <circle cx="185" cy="28" r="3" fill={colors.accent} stroke="none" />
        <circle cx="285" cy="58" r="3" fill={colors.accent} stroke="none" />
        <circle cx="125" cy="92" r="3" fill={colors.accent} stroke="none" />
        <circle cx="245" cy="82" r="3" fill={colors.accent} stroke="none" />
        <circle cx="28" cy="98" r="2" fill={colors.accent} stroke="none" />
        <circle cx="320" cy="32" r="2" fill={colors.accent} stroke="none" />
        <line x1="60" y1="40" x2="185" y2="28" />
        <line x1="185" y1="28" x2="285" y2="58" />
        <line x1="185" y1="28" x2="125" y2="92" />
        <line x1="285" y1="58" x2="245" y2="82" />
        <line x1="60" y1="40" x2="28" y2="98" />
        <line x1="125" y1="92" x2="245" y2="82" />
        <line x1="285" y1="58" x2="320" y2="32" />
      </g>
    </svg>
  );
}

function StructuralPattern() {
  return (
    <svg
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      preserveAspectRatio="xMidYMid slice"
    >
      <g opacity="0.1" stroke="#22d3ee" strokeWidth="0.8" fill="none">
        <line x1="50" y1="120" x2="155" y2="22" />
        <line x1="155" y1="22" x2="260" y2="120" />
        <line x1="38" y1="120" x2="278" y2="120" strokeWidth="1.5" />
        <line x1="155" y1="120" x2="155" y2="22" />
        <line x1="50" y1="120" x2="102" y2="71" />
        <line x1="260" y1="120" x2="208" y2="71" />
        <rect x="135" y="88" width="40" height="32" />
      </g>
    </svg>
  );
}

function GridPattern() {
  const opacities = [0.6, 1, 0.8, 0.5, 1, 0.7, 0.9, 0.4, 1, 0.7, 0.6, 0.8, 1, 0.5, 0.7, 0.9, 0.6, 0.4];
  const cells = [
    [40, 20], [95, 20], [150, 20], [205, 20], [260, 20], [315, 20],
    [40, 52], [95, 52], [150, 52], [205, 52], [260, 52], [315, 52],
    [40, 84], [95, 84], [150, 84], [205, 84], [260, 84], [315, 84],
  ];
  return (
    <svg
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill={colors.secondary}>
        {cells.map(([x, y], i) => (
          <rect key={i} x={x} y={y} width={40} height={24} rx="2" opacity={opacities[i] * 0.08} />
        ))}
      </g>
    </svg>
  );
}

const MODULES = [
  {
    title: "Floor Plan Studio",
    description: "Interactive 2D/3D planning, furniture optimization, and massing studies.",
    path: "/develop",
    iconBg: "linear-gradient(135deg, #1e4a8c 0%, #2563a8 100%)",
    cardBg: "linear-gradient(160deg, #0c1624 0%, #0e1e35 50%, #111f3a 100%)",
    Pattern: NetworkPattern,
    Icon: () => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="13" width="14" height="4" rx="1" fill="white" opacity="0.9" />
        <rect x="5" y="8.5" width="10" height="4" rx="1" fill="white" opacity="0.7" />
        <rect x="7" y="4" width="6" height="4" rx="1" fill="white" opacity="0.5" />
      </svg>
    ),
  },
  {
    title: "Analysis Hub",
    description: "Geospatial site feasibility, Dallas GIS layers, and land aggregation tools.",
    path: "/feasibility",
    iconBg: "linear-gradient(135deg, #1a3575 0%, #1d4ed8 100%)",
    cardBg: "linear-gradient(160deg, #0c1525 0%, #0f1e38 50%, #111f40 100%)",
    Pattern: GridPattern,
    Icon: () => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="3" width="6" height="6" rx="1" fill="white" opacity="0.9" />
        <rect x="11" y="3" width="6" height="6" rx="1" fill="white" opacity="0.6" />
        <rect x="3" y="11" width="6" height="6" rx="1" fill="white" opacity="0.6" />
        <rect x="11" y="11" width="6" height="6" rx="1" fill="white" opacity="0.9" />
      </svg>
    ),
  },
  {
    title: "Browse Builders",
    description: "Find trusted residential builders near you, view profiles, and connect directly.",
    path: "/browse",
    iconBg: "linear-gradient(135deg, #0d5e5e 0%, #0891b2 100%)",
    cardBg: "linear-gradient(160deg, #091818 0%, #0c2222 50%, #0e2a2a 100%)",
    Pattern: StructuralPattern,
    Icon: () => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="8" cy="7" r="3" stroke="white" strokeWidth="1.5" fill="none" opacity="0.9" />
        <path d="M2 17c0-3 2.5-5 6-5s6 2 6 5" stroke="white" strokeWidth="1.5" fill="none" opacity="0.9" />
        <circle cx="14" cy="6" r="2" stroke="white" strokeWidth="1.2" fill="none" opacity="0.6" />
        <path d="M14 10c2 0 4 1.2 4 3" stroke="white" strokeWidth="1.2" fill="none" opacity="0.6" />
      </svg>
    ),
  },
];

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeFeasibilityScore(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = typeof value === "number"
    ? value
    : Number(String(value).match(/-?\d+(\.\d+)?/)?.[0]);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric > 0 && numeric <= 1 ? numeric * 100 : numeric);
}

function scoreColor(score) {
  return score == null ? colors.textDim : score >= 75 ? colors.accent : score >= 50 ? colors.warn : colors.textDim;
}

function scoreSparkline(score) {
  if (score == null) return null;
  const base = Math.max(20, score - 28);
  return Array.from({ length: 7 }, (_, i) => Math.round(base + (score - base) * (i / 6)));
}

function projectSpecs(p) {
  const fp = p.floor_plan || {};
  const gp = p.generate_params || {};
  const rooms = fp.rooms || [];
  return {
    totalSF: fp.totalSF || gp.targetSF || 2200,
    bedrooms: rooms.filter((r) => r.type === "bedroom").length || gp.beds || gp.bedrooms || 3,
    bathrooms: rooms.filter((r) => r.type === "bathroom").length || gp.baths || gp.bathrooms || 2,
  };
}

async function computeLegacyPlotScore(p, marketCache) {
  const plotLat = firstPresent(p.plot?.lat, p.plot?.latitude);
  const plotLng = firstPresent(p.plot?.lng, p.plot?.longitude);
  if (plotLat == null || plotLng == null) return null;

  const city = p.location?.city || p.generate_params?.city || "Dallas";
  const state = p.location?.state || p.generate_params?.state || "TX";
  const cacheKey = `${city},${state}`.toLowerCase();
  if (!marketCache.has(cacheKey)) {
    marketCache.set(cacheKey, mapApi.searchByCity(city, state).catch(() => null));
  }

  const market = await marketCache.get(cacheKey);
  const comps = market?.comparables || [];
  const loc = { lat: Number(plotLat), lng: Number(plotLng) };
  const nearbyComps = computeNearbyComps(loc, 0.75, comps, true);
  const { totalSF, bedrooms, bathrooms } = projectSpecs(p);
  const valuation = runValuation(loc, p.plot, nearbyComps, totalSF, bedrooms, bathrooms);
  return valuation?.feasScore ?? null;
}

// Transform a raw MongoDB project into the shape RecentRow expects
function projectToRow(p) {
  const now = Date.now();
  const ts = p.updated_at || p.created_at;
  const diffMs = ts ? now - new Date(ts).getTime() : 0;
  const diffMins = Math.floor(diffMs / 60000);
  let time;
  if (diffMins < 2) time = "just now";
  else if (diffMins < 60) time = `${diffMins}m ago`;
  else if (diffMins < 1440) time = `${Math.floor(diffMins / 60)}h ago`;
  else time = `${Math.floor(diffMins / 1440)}d ago`;

  const plotLat = firstPresent(p.plot?.lat, p.plot?.latitude);
  const plotLng = firstPresent(p.plot?.lng, p.plot?.longitude);
  const hasPlotLocation = plotLat != null && plotLng != null;
  const rawScore = firstPresent(
    p.plot?.feasibility_score,
    p.plot?.feasibilityScore,
    p.plot?.score,
    p.feasibility?.score,
    p.feasibility_score,
    p.feasibilityScore
  );
  const score = normalizeFeasibilityScore(rawScore);
  const hasSelectedLand = Boolean(p.plot) && Boolean(firstPresent(
    hasPlotLocation ? true : null,
    p.plot?.address,
    p.plot?.price,
    p.plot?.lot_sf,
    p.plot?.lotSize,
    p.plot?.lot_size,
    p.plot?.zoning,
    p.plot?.url,
    score != null ? true : null
  ));
  const lotSF = hasSelectedLand ? firstPresent(p.plot?.lot_sf, p.plot?.lotSize, p.plot?.lot_size) : null;
  const acres = lotSF ? Math.round((lotSF / 43560) * 100) / 100 : null;
  const cost = hasSelectedLand ? (p.plot?.price ?? null) : null;
  const displayScore = hasSelectedLand ? score : null;
  const data = scoreSparkline(displayScore);

  return {
    id: p.id,
    sourceProject: p,
    name: p.name,
    time,
    acres,
    cost,
    score: displayScore,
    scoreColor: scoreColor(displayScore),
    data,
    hasSelectedLand,
    floor_plan: p.floor_plan || null,
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  // DEMO MODE: Mock user instead of Clerk
  // const { user } = useUser();
  const user = { firstName: "Demo" };
  const {
    setProjectName,
    setGenerateParams,
    resetProject,
    setProjectLocation,
    setProjectId,
    setStoryPlans,
    setFloorPlan,
    setBuildingContext,
    setMaterials,
    setSavedSchedule,
  } = useProject();
  const { isHomeowner } = useUserType();
  const [showModal, setShowModal] = useState(false);
  const [recentProjects, setRecentProjects] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const isMobile = useBreakpoint(768);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const ps = await projectsApi.list();
        if (!alive) return;
        const rows = ps.slice(0, 5).map(projectToRow);
        setRecentProjects(rows);
        setRecentLoading(false);

        const marketCache = new Map();
        ps.slice(0, 5).forEach(async (p, i) => {
          const row = rows[i];
          if (!row?.hasSelectedLand) return;

          const refreshedScore = await computeLegacyPlotScore(p, marketCache);
          const normalizedScore = normalizeFeasibilityScore(refreshedScore);
          if (!alive || normalizedScore == null || normalizedScore === row.score) return;

          setRecentProjects((prev) =>
            prev.map((r, j) => j === i ? {
              ...r,
              score: normalizedScore,
              scoreColor: scoreColor(normalizedScore),
              data: scoreSparkline(normalizedScore),
            } : r)
          );

          projectsApi.update(p.id, {
            plot: { ...p.plot, feasibility_score: normalizedScore },
          }).catch(() => {});
        });
      } catch {
        if (alive) setRecentLoading(false);
      }
    };
    load();
    // Poll every 30s so the list stays fresh without a full page reload
    const interval = setInterval(load, 30000);
    return () => { alive = false; clearInterval(interval); };
  }, []);

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
      // Homeowner flow carries extras forward: budget, AI conversation, summary, per-room furniture
      budget: params.budget || null,
      conversationHistory: params.conversationHistory || null,
      aiSummary: params.aiSummary || "",
      aiRooms: params.aiRooms || null,
    });
    setProjectLocation(params.location || null);
    navigate("/develop");
  };

  const activateProjectForFeasibility = (row) => {
    const project = row?.sourceProject;
    if (!project) return;

    resetProject();
    setProjectName(project.name);
    setProjectId(project.id);
    if (project.generate_params) setGenerateParams(project.generate_params);
    if (project.location) setProjectLocation(project.location);
    if (project.materials?.length > 0) setMaterials(project.materials);
    if (project.building_context) setBuildingContext(project.building_context);
    if (project.schedule) setSavedSchedule(project.schedule);
    if (project.story_plans?.length > 0) {
      setStoryPlans(project.story_plans);
    } else if (project.floor_plan) {
      setFloorPlan(project.floor_plan);
    }
    navigate("/feasibility");
  };

  return (
    <div
      style={{
        background: colors.bg,
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: fonts.label,
      }}
    >
      {isHomeowner && (
        <GuidedTour
          storageKey="dashboard"
          title="Welcome to Vision"
          steps={[
            {
              title: "Plan your home, end-to-end",
              body: (
                <>
                  Vision is your home-building cockpit. In the next few seconds we&rsquo;ll point at the
                  parts of this screen that matter, then turn you loose. You can replay this tour any
                  time from <b>Settings &rarr; Replay tutorials</b>.
                </>
              ),
            },
            {
              target: '[data-tour="new-floor-plan"]',
              placement: "bottom",
              title: "Start with one button",
              body: (
                <>
                  Tap <b>New Floor Plan</b> to chat with Vision AI. Tell it how many bedrooms, your
                  budget, and any must-haves &mdash; it drafts a real, buildable home in seconds.
                </>
              ),
            },
            {
              target: '[data-tour="module-launchpad"]',
              placement: "top",
              title: "Two guided modules",
              body: (
                <>
                  Each card opens one part of the journey: <b>Floor Plan Studio</b> for design and
                  <b> Browse Builders</b> when you&rsquo;re ready to talk to a contractor. Walk through
                  them in order on your first project.
                </>
              ),
            },
            {
              target: '[data-tour="floor-plan-module"]',
              placement: "right",
              title: "Floor Plan Studio: where you start",
              body: (
                <>
                  This is your first stop. Draw rooms on a 2D canvas, see them in 3D, and pick
                  materials &mdash; Vision keeps cost &amp; buildability score updated in real time.
                </>
              ),
            },
            {
              target: '[data-tour="recent-projects"]',
              placement: "top",
              title: "Pick up where you left off",
              body: (
                <>
                  Anything you create lands here. Each row shows the score (higher is better) and the
                  rough cost. Click a project to keep editing it.
                </>
              ),
            },
            {
              title: "Tip: look for the little ?'s",
              body: (
                <>
                  Every metric, badge, and finance term has a small <b>?</b> next to it. Tap any of
                  them for a one-sentence, plain-English explanation &mdash; no jargon, no Googling.
                </>
              ),
            },
          ]}
        />
      )}
      {/* Hero */}
      <div
        style={{
          margin: isMobile ? "16px 16px 0" : "24px 32px 0",
          background: colors.cardSurface,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: radii.xl,
          padding: isMobile ? "20px 16px" : "32px 36px",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: isMobile ? "flex-start" : "space-between",
          gap: isMobile ? 12 : 0,
          minWidth: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: isMobile ? 22 : 28,
            fontWeight: 700,
            color: colors.textBright,
            letterSpacing: "-0.3px",
          }}
        >
          {(() => {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
            const name = user?.firstName || user?.username || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "";
            return name ? `${greeting}, ${name}` : greeting;
          })()}
        </h1>
        <button
          onClick={() => setShowModal(true)}
          data-tour="new-floor-plan"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 20px",
            width: isMobile ? "100%" : "auto",
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            border: "none",
            borderRadius: radii.lg,
            color: "#fff",
            fontFamily: fonts.label,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: "0.2px",
            boxShadow: "0 2px 12px rgba(37,99,235,0.4)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1C5.3 1 3.5 3 3.5 5.5C3.5 8.5 7 13 7 13C7 13 10.5 8.5 10.5 5.5C10.5 3 8.7 1 7 1Z"
              stroke="white"
              strokeWidth="1.3"
              fill="none"
            />
            <circle cx="7" cy="5.5" r="1.5" fill="white" />
          </svg>
          New Floor Plan
        </button>
      </div>

      {/* Module Launchpad */}
      <div data-tour="module-launchpad" style={{ padding: isMobile ? "16px 16px 0" : "28px 32px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1L9.8 5.8L15 6.2L11.2 9.6L12.4 15L8 12.2L3.6 15L4.8 9.6L1 6.2L6.2 5.8L8 1Z"
              fill={colors.accent}
            />
          </svg>
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: colors.textBright,
              letterSpacing: "0.1px",
            }}
          >
            Module Launchpad
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : (isHomeowner ? "repeat(2, 1fr)" : "repeat(3, 1fr)"), gap: 16 }}>
          {MODULES.filter((mod) => !(isHomeowner && mod.title === "Analysis Hub")).map((mod) => (
            <ModuleCard
              key={mod.path}
              mod={mod}
              navigate={navigate}
              isMobile={isMobile}
              onLaunch={mod.path === "/develop" ? () => setShowModal(true) : undefined}
              dataTour={mod.path === "/develop" ? "floor-plan-module" : undefined}
            />
          ))}
        </div>
      </div>

      {/* Recent Analysis */}
      <div data-tour="recent-projects" style={{ padding: isMobile ? "16px 16px 0" : "28px 32px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke={colors.accent} strokeWidth="1.5" fill="none" />
              <polyline
                points="8,5 8,8 10,10"
                stroke={colors.accent}
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <span style={{ fontSize: 15, fontWeight: 600, color: colors.textBright }}>
              Recent Projects
            </span>
          </div>
          <button
            onClick={() => navigate("/projects")}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: colors.secondary,
              fontFamily: fonts.label,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            View All Portfolio
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {recentLoading && (
            <div style={{ fontFamily: fonts.data, fontSize: 12, color: colors.textDim, padding: "20px 0", textAlign: "center" }}>
              Loading projects...
            </div>
          )}
          {!recentLoading && recentProjects.length === 0 && (
            <div style={{ fontFamily: fonts.data, fontSize: 12, color: colors.textDim, padding: "20px 0", textAlign: "center" }}>
              No projects yet — create one with New Floor Plan
            </div>
          )}
          {recentProjects.map((p, i) => (
            <RecentRow key={p.id} project={p} index={i} onOpen={activateProjectForFeasibility} isMobile={isMobile} />
          ))}
        </div>
      </div>

      {/* New Project Modal — homeowner gets the AI-chat flow, builder keeps the param form */}
      {showModal && (
        isHomeowner ? (
          <HomeownerProjectModal
            onClose={() => setShowModal(false)}
            onGenerate={(p) => { setShowModal(false); handleGenerate(p); }}
          />
        ) : (
          <NewProjectModal
            onClose={() => setShowModal(false)}
            onGenerate={handleGenerate}
          />
        )
      )}

    </div>
  );
}

function ModuleCard({ mod, navigate, onLaunch, isMobile, dataTour }) {
  const { Pattern, Icon } = mod;
  const handleClick = onLaunch || (() => navigate(mod.path));

  if (isMobile) {
    return (
      <div
        onClick={handleClick}
        data-tour={dataTour}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${colors.accent}60`)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = colors.cardBorder)}
        style={{
          background: colors.cardSurface,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: radii.xl,
          padding: "14px",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          cursor: "pointer",
          transition: "border-color 0.2s ease",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            background: mod.iconBg,
            borderRadius: radii.lg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
          }}
        >
          <Icon />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.textBright, marginBottom: 4 }}>
            {mod.title}
          </div>
          <div style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.5, marginBottom: 8 }}>
            {mod.description}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleClick(); }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: colors.accent,
              fontFamily: fonts.label,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.8px",
              cursor: "pointer",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Launch Module →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      data-tour={dataTour}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${colors.accent}60`)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = colors.cardBorder)}
      style={{
        background: colors.cardSurface,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: radii.xl,
        overflow: "hidden",
        cursor: "pointer",
        transition: "border-color 0.2s ease",
      }}
    >
      <div
        style={{
          position: "relative",
          height: 160,
          background: mod.cardBg,
          overflow: "hidden",
        }}
      >
        <Pattern />
      </div>
      <div style={{ padding: "0 20px 20px", position: "relative" }}>
        <div
          style={{
            width: 44,
            height: 44,
            background: mod.iconBg,
            borderRadius: radii.lg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: -22,
            marginBottom: 14,
            boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
          }}
        >
          <Icon />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: colors.textBright, marginBottom: 8 }}>
          {mod.title}
        </div>
        <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.65, marginBottom: 16 }}>
          {mod.description}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleClick(); }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: colors.accent,
            fontFamily: fonts.label,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.8px",
            cursor: "pointer",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Launch Module →
        </button>
      </div>
    </div>
  );
}

function RecentRow({ project: p, index, onOpen, isMobile }) {
  const acresLabel = p.acres != null ? `${p.acres} Acres` : "N/A";
  const costLabel = p.cost != null
    ? (p.cost >= 1000000 ? `$${(p.cost / 1000000).toFixed(2)}M` : `$${(p.cost / 1000).toFixed(0)}K`)
    : "N/A";
  const scoreLabel = p.score != null ? p.score : "N/A";

  if (isMobile) {
    return (
      <div
        onClick={() => onOpen(p)}
        onMouseEnter={(e) => (e.currentTarget.style.background = colors.surfaceHover)}
        onMouseLeave={(e) => (e.currentTarget.style.background = colors.cardSurface)}
        style={{
          background: colors.cardSurface,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: radii.lg,
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          cursor: "pointer",
          transition: "background 0.15s ease",
          marginBottom: 2,
        }}
      >
        {/* Top row: thumbnail + name/time */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ProjectThumb project={p} index={index} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.textBright, marginBottom: 3 }}>
              {p.name}
            </div>
            <div style={{ fontSize: 11, color: colors.textDim, fontFamily: fonts.data }}>
              Analyzed {p.time} • {acresLabel}
            </div>
          </div>
        </div>
        {/* Bottom strip: cost + score + sparkline */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 8,
            borderTop: `1px solid #1e2d45`,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.textBright, fontFamily: fonts.data }}>
              {costLabel}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: colors.textDim, letterSpacing: "0.6px", textTransform: "uppercase" }}>
              Est. Acq. Cost
              <HelpTip
                size={11}
                title="Estimated acquisition cost"
                body="The saved price of the selected land parcel. It shows N/A until you choose land in Feasibility."
              />
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: p.score != null ? 22 : 18, fontWeight: 700, color: p.scoreColor, fontFamily: fonts.data, lineHeight: 1 }}>
              {scoreLabel}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 9, color: colors.textDim, letterSpacing: "0.6px", textTransform: "uppercase" }}>
              Score
              <HelpTip
                size={11}
                title="Feasibility Score"
                body="0–100 rating of how buildable and cost-efficient your project looks right now. Green is great, amber means tweaks needed, red means major issues to address."
              />
            </div>
          </div>
          <Sparkline data={p.data} color={p.scoreColor} />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onOpen(p)}
      onMouseEnter={(e) => (e.currentTarget.style.background = colors.surfaceHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = colors.cardSurface)}
      style={{
        background: colors.cardSurface,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: radii.lg,
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        cursor: "pointer",
        transition: "background 0.15s ease",
        marginBottom: 2,
      }}
    >
      <ProjectThumb project={p} index={index} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: colors.textBright,
            marginBottom: 3,
          }}
        >
          {p.name}
        </div>
        <div style={{ fontSize: 11, color: colors.textDim, fontFamily: fonts.data }}>
          Analyzed {p.time} • {acresLabel}
        </div>
      </div>
      <div style={{ textAlign: "right", marginRight: 8, flexShrink: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: colors.textBright,
            fontFamily: fonts.data,
          }}
        >
          {costLabel}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 4,
            fontSize: 9,
            color: colors.textDim,
            letterSpacing: "0.6px",
            textTransform: "uppercase",
          }}
        >
          Est. Acq. Cost
          <HelpTip
            size={11}
            align="right"
            title="Estimated acquisition cost"
            body="The saved price of the selected land parcel. It shows N/A until you choose land in Feasibility."
          />
        </div>
      </div>
      <div style={{ textAlign: "center", flexShrink: 0, minWidth: 44 }}>
        <div
          style={{
            fontSize: p.score != null ? 22 : 18,
            fontWeight: 700,
            color: p.scoreColor,
            fontFamily: fonts.data,
            lineHeight: 1,
          }}
        >
          {scoreLabel}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            fontSize: 9,
            color: colors.textDim,
            letterSpacing: "0.6px",
            textTransform: "uppercase",
          }}
        >
          Score
          <HelpTip
            size={11}
            title="Feasibility Score"
            body="0–100 rating of how buildable and cost-efficient your project looks right now. Green is great, amber means tweaks needed, red means major issues to address."
          />
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>
        <Sparkline data={p.data} color={p.scoreColor} />
      </div>
    </div>
  );
}
