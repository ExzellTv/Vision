import { useNavigate } from "react-router-dom";
import { colors, fonts, radii } from "../../theme/tokens";

function Sparkline({ data, color }) {
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

const RECENT = [
  {
    name: "Oak Lawn Residential Hub",
    time: "2h ago",
    acres: 4.2,
    cost: 142,
    score: 94,
    scoreColor: colors.accent,
    data: [60, 72, 65, 80, 75, 88, 94],
    path: "/feasibility",
  },
  {
    name: "Victory Park Mixed-Use",
    time: "1d ago",
    acres: 1.8,
    cost: 210,
    score: 82,
    scoreColor: colors.accent,
    data: [70, 68, 75, 72, 80, 79, 82],
    path: "/feasibility",
  },
  {
    name: "Deep Ellum Warehouse",
    time: "3d ago",
    acres: 0.9,
    cost: 95,
    score: 41,
    scoreColor: colors.textDim,
    data: [65, 60, 55, 50, 48, 44, 41],
    path: "/feasibility",
  },
];

export default function Dashboard() {
  const navigate = useNavigate();

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
          onClick={() => navigate("/develop")}
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
            <ModuleCard key={mod.path} mod={mod} navigate={navigate} />
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
          {RECENT.map((p, i) => (
            <RecentRow key={i} project={p} navigate={navigate} />
          ))}
        </div>
      </div>

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

function ModuleCard({ mod, navigate }) {
  const { Pattern, Icon } = mod;
  return (
    <div
      onClick={() => navigate(mod.path)}
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
            navigate(mod.path);
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

function RecentRow({ project: p, navigate }) {
  return (
    <div
      onClick={() => navigate(p.path)}
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
          }}
        >
          {p.name}
        </div>
        <div style={{ fontSize: 11, color: colors.textDim, fontFamily: fonts.data }}>
          Analyzed {p.time} • {p.acres} Acres
        </div>
      </div>

      {/* Cost */}
      <div style={{ textAlign: "right", marginRight: 8, flexShrink: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: colors.textBright,
            fontFamily: fonts.data,
          }}
        >
          ${p.cost}/SF
        </div>
        <div
          style={{
            fontSize: 9,
            color: colors.textDim,
            letterSpacing: "0.6px",
            textTransform: "uppercase",
          }}
        >
          Est. Acq. Cost
        </div>
      </div>

      {/* Score */}
      <div style={{ textAlign: "center", flexShrink: 0, minWidth: 44 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: p.scoreColor,
            fontFamily: fonts.data,
            lineHeight: 1,
          }}
        >
          {p.score}
        </div>
        <div
          style={{
            fontSize: 9,
            color: colors.textDim,
            letterSpacing: "0.6px",
            textTransform: "uppercase",
          }}
        >
          Score
        </div>
      </div>

      {/* Sparkline */}
      <div style={{ flexShrink: 0 }}>
        <Sparkline data={p.data} color={p.scoreColor} />
      </div>
    </div>
  );
}
