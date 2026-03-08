import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { colors, fonts, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";
import { projectsApi } from "../../services/api";

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
    title: "Structural Lab",
    description: "Engineering simulation, code compliance, and internal structural stress testing.",
    path: "/structural",
    iconBg: "linear-gradient(135deg, #0d5e5e 0%, #0891b2 100%)",
    cardBg: "linear-gradient(160deg, #091818 0%, #0c2222 50%, #0e2a2a 100%)",
    Pattern: StructuralPattern,
    Icon: () => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L18 17H2L10 2Z" stroke="white" strokeWidth="1.5" fill="none" opacity="0.9" />
        <line x1="10" y1="6" x2="10" y2="17" stroke="white" strokeWidth="1" opacity="0.6" />
        <line x1="6.5" y1="11" x2="13.5" y2="11" stroke="white" strokeWidth="1" opacity="0.6" />
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
];

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { setProjectName, setGenerateParams, resetProject } = useProject();
  const [showModal, setShowModal] = useState(false);
  const [recentProjects, setRecentProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  useEffect(() => {
    projectsApi.list()
      .then((data) => setRecentProjects(data || []))
      .catch(() => setRecentProjects([]))
      .finally(() => setProjectsLoading(false));
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
      style: "Ranch",
      garage: "2-car",
      openFloorPlan: true,
    });
    navigate("/develop");
  };

  return (
    <div
      style={{
        background: colors.bg,
        height: "100%",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        fontFamily: fonts.label,
      }}
    >
      {/* Hero */}
      <div
        style={{
          margin: "24px 32px 0",
          background: colors.cardSurface,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: radii.xl,
          padding: "32px 36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 700,
            color: colors.textBright,
            letterSpacing: "-0.3px",
          }}
        >
          Good morning, Alex
        </h1>
        <button
          onClick={() => { resetProject(); navigate("/develop", { state: { newProject: true } }); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
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
      <div style={{ padding: "28px 32px 0" }}>
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {MODULES.map((mod) => (
            <ModuleCard
              key={mod.path}
              mod={mod}
              navigate={navigate}
              onLaunch={mod.path === "/develop" ? () => setShowModal(true) : undefined}
            />
          ))}
        </div>
      </div>

      {/* Recent Analysis */}
      <div style={{ padding: "28px 32px 0" }}>
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
              Recent Analysis
            </span>
          </div>
          <button
            onClick={() => navigate("/executive")}
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
          {projectsLoading ? (
            <div style={{ padding: "20px", textAlign: "center", color: colors.textDim, fontSize: 12, fontFamily: fonts.data }}>
              Loading projects...
            </div>
          ) : recentProjects.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: colors.textDim, fontSize: 12, fontFamily: fonts.data }}>
              No projects yet — create one to get started.
            </div>
          ) : (
            recentProjects.map((p) => (
              <RecentRow key={p.id} project={p} navigate={navigate} />
            ))
          )}
        </div>
      </div>

      {/* New Project Modal */}
      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onGenerate={handleGenerate}
        />
      )}

      {/* Footer */}
      <div
        style={{
          margin: "28px 32px 24px",
          marginTop: "auto",
          paddingTop: 28,
          padding: "14px 20px",
          background: colors.panel,
          border: `1px solid ${colors.panelBorder}`,
          borderRadius: radii.lg,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: colors.success,
                boxShadow: `0 0 6px ${colors.success}`,
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontFamily: fonts.data,
                color: colors.text,
                letterSpacing: "0.6px",
              }}
            >
              SYSTEM OPERATIONAL
            </span>
          </div>
          <div style={{ width: 1, height: 14, background: colors.panelBorder }} />
          <span
            style={{
              fontSize: 11,
              fontFamily: fonts.data,
              color: colors.textDim,
              letterSpacing: "0.6px",
            }}
          >
            AI ENGINE: V4.2.0-STABLE
          </span>
        </div>
        <span style={{ fontSize: 11, fontFamily: fonts.data, color: colors.textDim }}>
          © 2024 Vision AI Platform — Proprietary Intelligence Hub
        </span>
      </div>
    </div>
  );
}

function ModuleCard({ mod, navigate, onLaunch }) {
  const { Pattern, Icon } = mod;
  const handleClick = onLaunch || (() => navigate(mod.path));
  return (
    <div
      onClick={handleClick}
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
      {/* Graphic area */}
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

      {/* Content area */}
      <div style={{ padding: "0 20px 20px", position: "relative" }}>
        {/* Icon badge overlapping graphic/content boundary */}
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
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: colors.textBright,
            marginBottom: 8,
          }}
        >
          {mod.title}
        </div>
        <div
          style={{
            fontSize: 12,
            color: colors.textDim,
            lineHeight: 1.65,
            marginBottom: 16,
          }}
        >
          {mod.description}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
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

function Label({ children }) {
  return (
    <div style={{
      fontFamily: fonts.label,
      fontSize: 10,
      fontWeight: 600,
      color: colors.textDim,
      letterSpacing: "0.1em",
      marginBottom: 10,
      textTransform: "uppercase",
    }}>
      {children}
    </div>
  );
}

function NewProjectModal({ onClose, onGenerate }) {
  const [projectName, setProjectNameLocal] = useState("");
  const [targetSF, setTargetSF] = useState(2450);
  const [bedrooms, setBedrooms] = useState(3);
  const [bathrooms, setBathrooms] = useState(2);
  const [stories, setStories] = useState(2);

  const pct = ((targetSF - 1500) / (5000 - 1500)) * 100;

  const BtnGroup = ({ options, value, onChange }) => (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            padding: "10px 4px",
            borderRadius: radii.lg,
            border: `1px solid ${value === opt.value ? colors.secondary : colors.cardBorder}`,
            background: value === opt.value ? "rgba(59,130,246,0.2)" : colors.bg,
            color: value === opt.value ? colors.secondary : colors.text,
            fontFamily: fonts.label,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <style>{`
        .vision-modal-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 4px;
          border-radius: 2px;
          background: linear-gradient(to right, #3b82f6 0%, #3b82f6 ${pct}%, #2a3548 ${pct}%, #2a3548 100%);
          outline: none;
          cursor: pointer;
        }
        .vision-modal-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          border: 2px solid #3b82f6;
          cursor: pointer;
          box-shadow: 0 0 0 4px rgba(59,130,246,0.2);
        }
        .vision-modal-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          border: 2px solid #3b82f6;
          cursor: pointer;
          box-shadow: 0 0 0 4px rgba(59,130,246,0.2);
        }
      `}</style>

      {/* Backdrop */}
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
        {/* Modal Card */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#111827",
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: "16px",
            padding: "40px 44px",
            width: 496,
            maxWidth: "92vw",
            position: "relative",
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              background: "none",
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: radii.md,
              color: colors.textDim,
              cursor: "pointer",
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            ✕
          </button>

          {/* Step badge row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
            <span style={{
              fontFamily: fonts.label,
              fontSize: 11,
              fontWeight: 700,
              color: "white",
              background: colors.secondary,
              borderRadius: "4px",
              padding: "3px 10px",
              letterSpacing: "0.06em",
              flexShrink: 0,
            }}>
              STEP 1
            </span>
            <div style={{ flex: 1, height: 1, background: colors.cardBorder }} />
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              color: colors.textDim,
              letterSpacing: "0.1em",
              fontFamily: fonts.label,
              flexShrink: 0,
            }}>
              PROJECT PARAMETERS
            </span>
          </div>

          {/* Heading */}
          <h2 style={{
            margin: "0 0 28px",
            fontSize: 30,
            fontWeight: 700,
            color: colors.textBright,
            letterSpacing: "-0.4px",
            lineHeight: 1.2,
          }}>
            Create New Development
          </h2>

          {/* Project Name */}
          <div style={{ marginBottom: 26 }}>
            <Label>Project Name</Label>
            <input
              value={projectName}
              onChange={(e) => setProjectNameLocal(e.target.value)}
              placeholder="e.g. Skyline Residence A-1"
              style={{
                width: "100%",
                padding: "12px 16px",
                background: colors.bg,
                border: `1px solid ${colors.cardBorder}`,
                borderRadius: radii.lg,
                color: colors.text,
                fontFamily: fonts.label,
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.target.style.borderColor = colors.secondary)}
              onBlur={(e) => (e.target.style.borderColor = colors.cardBorder)}
            />
          </div>

          {/* Target SF */}
          <div style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <Label>Target Square Footage</Label>
              <span style={{ fontFamily: fonts.data, fontSize: 22, fontWeight: 700, color: colors.secondary, lineHeight: 1 }}>
                {targetSF.toLocaleString()}
                <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 3, color: colors.secondary }}>sf</span>
              </span>
            </div>
            <input
              type="range"
              className="vision-modal-slider"
              min={1500}
              max={5000}
              step={50}
              value={targetSF}
              onChange={(e) => setTargetSF(Number(e.target.value))}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7 }}>
              <span style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.data }}>1,500 SF</span>
              <span style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.data }}>5,000 SF</span>
            </div>
          </div>

          {/* Bedrooms + Bathrooms */}
          <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Label>Bedrooms</Label>
              <BtnGroup
                options={[{value:1,label:"1"},{value:2,label:"2"},{value:3,label:"3"},{value:4,label:"4"},{value:5,label:"5+"}]}
                value={bedrooms}
                onChange={setBedrooms}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Label>Bathrooms</Label>
              <BtnGroup
                options={[{value:1,label:"1"},{value:2,label:"2"},{value:3,label:"3"},{value:4,label:"4+"}]}
                value={bathrooms}
                onChange={setBathrooms}
              />
            </div>
          </div>

          {/* Stories */}
          <div style={{ marginBottom: 32 }}>
            <Label>Stories</Label>
            <BtnGroup
              options={[{value:1,label:"1"},{value:2,label:"2"}]}
              value={stories}
              onChange={setStories}
            />
          </div>

          {/* CTA */}
          <button
            onClick={() => onGenerate({ projectName, targetSF, bedrooms, bathrooms, stories })}
            style={{
              width: "100%",
              padding: "15px",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              border: "none",
              borderRadius: radii.lg,
              color: "white",
              fontFamily: fonts.label,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "0 4px 20px rgba(37,99,235,0.45)",
            }}
          >
            Generate Initial Floor Plan
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L9.2 5.8L14 7L9.2 8.2L8 13L6.8 8.2L2 7L6.8 5.8L8 1Z" fill="white"/>
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}

function RecentRow({ project: p, navigate }) {
  const params = p.generate_params || {};
  const sf = params.targetSF ? params.targetSF.toLocaleString() : null;
  const beds = params.bedrooms ?? null;
  const baths = params.bathrooms ?? null;
  const stories = params.stories ?? null;
  const updated = timeAgo(p.updated_at);

  return (
    <div
      onClick={() => navigate("/develop", { state: { projectId: p.id } })}
      onMouseEnter={(e) => (e.currentTarget.style.background = colors.surfaceHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = colors.cardSurface)}
      style={{
        background: colors.cardSurface,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: radii.lg,
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        cursor: "pointer",
        transition: "background 0.15s ease",
        marginBottom: 2,
      }}
    >
      {/* File icon */}
      <div
        style={{
          width: 36,
          height: 36,
          flexShrink: 0,
          background: colors.surface,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: radii.md,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="3" y="2" width="10" height="12" rx="1" stroke={colors.textDim} strokeWidth="1.2" fill="none" />
          <line x1="5" y1="6" x2="11" y2="6" stroke={colors.textDim} strokeWidth="0.8" />
          <line x1="5" y1="8.5" x2="11" y2="8.5" stroke={colors.textDim} strokeWidth="0.8" />
          <line x1="5" y1="11" x2="9" y2="11" stroke={colors.textDim} strokeWidth="0.8" />
        </svg>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: colors.textBright,
            marginBottom: 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {p.name}
        </div>
        <div style={{ fontSize: 11, color: colors.textDim, fontFamily: fonts.data }}>
          Updated {updated}{beds !== null ? ` • ${beds}BD / ${baths}BA` : ""}
        </div>
      </div>

      {/* SF */}
      {sf && (
        <div style={{ textAlign: "right", marginRight: 8, flexShrink: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: colors.textBright,
              fontFamily: fonts.data,
            }}
          >
            {sf}
          </div>
          <div
            style={{
              fontSize: 9,
              color: colors.textDim,
              letterSpacing: "0.6px",
              textTransform: "uppercase",
            }}
          >
            Sq Ft
          </div>
        </div>
      )}

      {/* Stories */}
      {stories !== null && (
        <div style={{ textAlign: "center", flexShrink: 0, minWidth: 36 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: colors.accent,
              fontFamily: fonts.data,
              lineHeight: 1,
            }}
          >
            {stories}
          </div>
          <div
            style={{
              fontSize: 9,
              color: colors.textDim,
              letterSpacing: "0.6px",
              textTransform: "uppercase",
            }}
          >
            {stories === 1 ? "Story" : "Stories"}
          </div>
        </div>
      )}

      {/* Arrow */}
      <div style={{ flexShrink: 0, color: colors.textDim, fontSize: 16 }}>›</div>
    </div>
  );
}
