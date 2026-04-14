import { colors, fonts, radii, card } from "../../theme/tokens";
import { useNavigate } from "react-router-dom";

import { useBuilderStore } from "../../context/BuilderContext";


const statusStyles = {
  success: {
    background: colors.successDim,
    color: colors.success,
    borderColor: "rgba(46, 213, 115, 0.35)",
  },
  warn: {
    background: colors.warnDim,
    color: colors.warn,
    borderColor: "rgba(255, 159, 67, 0.35)",
  },
  accent: {
    background: colors.accentDim,
    color: colors.accent,
    borderColor: "rgba(0, 212, 255, 0.35)",
  },
};

const progressTones = {
  secondary: colors.secondary,
  warn: colors.warn,
  accent: colors.accent,
};

function ProgressCircle({ percentage, tone }) {
  const progressColor = progressTones[tone] || colors.secondary;

  return (
    <div
      style={{
        background: `conic-gradient(${progressColor} ${percentage}%, ${colors.panelBorder} 0)`,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        width: "4rem",
        height: "4rem",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: "80%",
          height: "80%",
          background: colors.cardSurface,
          borderRadius: "50%",
        }}
      />
      <span
        style={{
          position: "relative",
          zIndex: 10,
          fontFamily: fonts.data,
          fontWeight: 700,
          color: colors.textBright,
          fontSize: 12,
        }}
      >
        {percentage}%
      </span>
    </div>
  );
}

function ProjectCard({ project }) {
  const badgeStyle = statusStyles[project.statusTone] || statusStyles.accent;
  const navigate = useNavigate();

  return (
    <div
      style={{
        ...card,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "24px",
        aspectRatio: "1 / 1",
        position: "relative",
        transition: "transform 0.3s ease, box-shadow 0.3s ease",
        padding: 28,
        borderRadius: radii.lg,
        background: `linear-gradient(160deg, ${colors.panel} 0%, ${colors.cardSurface} 100%)`,
        borderColor: colors.cardBorder,
        boxShadow: "0 14px 30px rgba(7, 10, 15, 0.06)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 20px 40px rgba(0, 212, 255, 0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "0 14px 30px rgba(7, 10, 15, 0.06)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <h3 style={{ color: colors.textBright, letterSpacing: "-0.01em", fontSize: "1.25rem", margin: 0, fontWeight: "bold" }}>
            {project.name}
          </h3>
          <p style={{ color: colors.textDim, fontSize: "0.875rem", margin: 0 }}>
            {project.address}
          </p>
        </div>
        <span
          style={{
            ...badgeStyle,
            border: `1px solid ${badgeStyle.borderColor}`,
            borderRadius: radii.md,
            fontSize: "10px",
            fontWeight: "bold",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "4px 8px",
          }}
        >
          {project.status}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "24px", margin: "auto 0" }}>
        <ProgressCircle percentage={project.progress} tone={project.progressTone} />
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ color: colors.textDim, fontSize: "0.75rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Current phase
          </span>
          <span style={{ color: colors.textBright, fontSize: "1.125rem", fontWeight: "bold" }}>
            {project.phase}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(20, 27, 45, 0.55)",
          borderRadius: radii.md,
          padding: "12px 14px",
        }}
      >
        <span style={{ color: colors.textDim, fontSize: "0.875rem" }}>
          Client: <span style={{ color: colors.textBright }}>{project.client}</span>
        </span>
        {project.status === "New Request" ? (
          <button
            style={{
              color: colors.textDim,
              background: "rgba(255, 255, 255, 0.05)",
              borderRadius: radii.md,
              border: "none",
              padding: "8px 16px",
              fontSize: "0.875rem",
              fontWeight: "bold",
              cursor: "not-allowed",
            }}
          >
            Review Request
          </button>
        ) : (
          <button
            onClick={() => navigate(`/client-project/${project.id}`)}
            style={{
              color: colors.textBright,
              background: "rgba(0, 212, 255, 0.16)",
              borderRadius: radii.md,
              border: "none",
              padding: "8px 16px",
              fontSize: "0.875rem",
              fontWeight: "bold",
              cursor: "pointer",
              transition: "background 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(0, 212, 255, 0.24)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(0, 212, 255, 0.16)";
            }}
          >
            View project
          </button>
        )}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { projects } = useBuilderStore();
  const activeProjects = projects.filter((p) => p.status !== "New Request");
  const pendingRequests = projects.filter((p) => p.status === "New Request");


  return (
    <div
      className="relative w-full"
      style={{
        background: colors.bgGradient,
        fontFamily: "'Manrope', sans-serif",
        color: colors.text,
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(900px 340px at 15% -10%, rgba(0,212,255,0.08) 0%, transparent 65%), radial-gradient(700px 280px at 90% 0%, rgba(59,130,246,0.1) 0%, transparent 70%)",
        }}
      />

      {/* Main */}
      <main style={{
        position: "relative",
        zIndex: 1,
        margin: "0 auto",
        width: "100%",
        maxWidth: "1180px",
        padding: "32px 24px"
      }}>
        {/* Title */}
        <div
          style={{
            marginBottom: "36px",
            background: "rgba(13, 17, 23, 0.42)",
            borderRadius: radii.lg,
            padding: "22px 24px",
            backdropFilter: "blur(22px)",
          }}
        >
          <h1
            style={{
              margin: "0 0 8px 0",
              fontSize: "2.25rem",
              color: colors.textBright,
              letterSpacing: "-0.02em",
              fontFamily: "'Newsreader', serif",
              fontWeight: 500,
            }}
          >
            My Projects
          </h1>
          <p style={{ margin: 0, fontSize: "1.125rem", color: colors.textDim, fontFamily: "'Manrope', sans-serif" }}>
            Active builds and client requests
          </p>
        </div>

        {/* Stats Row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
          marginBottom: "40px"
        }}>
          {[
            { label: "Active projects", value: activeProjects.length },
            { label: "Pending requests", value: pendingRequests.length },
            { label: "Completed builds", value: 41 },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                ...card,
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                padding: 24,
                borderRadius: radii.lg,
                background: `linear-gradient(160deg, ${colors.panel} 0%, ${colors.surface} 100%)`,
                borderColor: colors.cardBorder,
                boxShadow: "0 14px 30px rgba(7, 10, 15, 0.06)",
              }}
            >
              <span style={{ color: colors.textDim, fontSize: "0.875rem", fontWeight: 500 }}>
                {stat.label}
              </span>
              <span style={{ color: colors.textBright, fontFamily: fonts.data, fontSize: "2.25rem", fontWeight: "bold" }}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        {/* Project Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "28px",
          paddingBottom: "32px"
        }}>
          {activeProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </main>
    </div>
  );
}