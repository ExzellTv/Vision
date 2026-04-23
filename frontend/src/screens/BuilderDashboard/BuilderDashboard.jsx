import { useEffect, useState } from "react";
import { colors, fonts, radii, card } from "../../theme/tokens";
import { useNavigate } from "react-router-dom";

import { useBuilderStore } from "../../context/BuilderContext";
import { projectsApi } from "../../services/api";

function derivePhaseAndProgress(schedule) {
  if (!schedule?.phases?.length) return { phase: "Planning", progress: 0 };
  const phases = schedule.phases;
  const completed = phases.filter(p => p.status === "complete").length;
  const active = phases.find(p => p.status === "active");
  const progress = Math.round((completed / phases.length) * 100);
  const phase = active?.name ?? (completed === phases.length ? "Complete" : "Planning");
  return { phase, progress };
}


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

function ProjectCard({ project, onFinish }) {
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
          <div style={{ display: "flex", gap: "8px" }}>
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
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0, 212, 255, 0.24)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0, 212, 255, 0.16)"; }}
            >
              View project
            </button>
            {project.progress >= 10 && (() => {
              const done = project.progress >= 100;
              return (
                <button
                  onClick={(e) => { if (!done) return; e.stopPropagation(); onFinish(project.id, project.name); }}
                  disabled={!done}
                  title={done ? "Mark project as complete" : `Project must be 100% complete (currently ${project.progress}%)`}
                  style={{
                    color: done ? "#4ade80" : "#4b5563",
                    background: done ? "rgba(74, 222, 128, 0.12)" : "rgba(255,255,255,0.03)",
                    borderRadius: radii.md,
                    border: `1px solid ${done ? "rgba(74, 222, 128, 0.3)" : "rgba(255,255,255,0.08)"}`,
                    padding: "8px 14px",
                    fontSize: "0.875rem",
                    fontWeight: "bold",
                    cursor: done ? "pointer" : "not-allowed",
                    transition: "background 0.3s ease",
                  }}
                  onMouseEnter={(e) => { if (done) e.currentTarget.style.background = "rgba(74, 222, 128, 0.22)"; }}
                  onMouseLeave={(e) => { if (done) e.currentTarget.style.background = "rgba(74, 222, 128, 0.12)"; }}
                >
                  Finish
                </button>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { projects, refreshProjects, finishProject } = useBuilderStore();
  const [scheduleMap, setScheduleMap] = useState({});
  const [confirmFinish, setConfirmFinish] = useState(null);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    projectsApi.completedCount().then((d) => setCompletedCount(d.count ?? 0)).catch(() => {});
  }, []);

  const activeProjects = projects.filter((p) => p.status !== "New Request");
  const pendingRequests = projects.filter((p) => p.status === "New Request");

  useEffect(() => { refreshProjects(); }, []);

  // Fetch schedules for active projects to derive real phase/progress
  useEffect(() => {
    const mongoIds = activeProjects
      .map(p => p.id)
      .filter(id => /^[a-f\d]{24}$/i.test(id));
    if (!mongoIds.length) return;
    Promise.all(mongoIds.map(id => projectsApi.getPublic(id).catch(() => null)))
      .then(results => {
        const map = {};
        results.forEach((p, i) => {
          if (p) map[mongoIds[i]] = derivePhaseAndProgress(p.schedule);
        });
        setScheduleMap(map);
      });
  }, [activeProjects.length]);


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
              margin: 0,
              fontSize: 32,
              fontWeight: 800,
              color: colors.textBright,
              letterSpacing: "-0.5px",
              lineHeight: 1.1,
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
            { label: "Completed builds", value: completedCount },
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
          {activeProjects.map((project) => {
            const sched = scheduleMap[project.id];
            const enriched = sched ? { ...project, phase: sched.phase, progress: sched.progress } : project;
            return (
              <ProjectCard
                key={project.id}
                project={enriched}
                onFinish={(id, name) => setConfirmFinish({ id, name })}
              />
            );
          })}
        </div>
      </main>

      {/* Finish Project confirmation modal */}
      {confirmFinish && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(7, 10, 15, 0.75)",
            backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setConfirmFinish(null)}
        >
          <div
            style={{
              background: "linear-gradient(160deg, #0d1117 0%, #111827 100%)",
              border: "1px solid rgba(74, 222, 128, 0.25)",
              borderRadius: radii.lg,
              padding: "36px 40px",
              maxWidth: 420,
              width: "90%",
              boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 12px 0", color: "#f0fdf4", fontFamily: "'Newsreader', serif", fontWeight: 500, fontSize: "1.5rem" }}>
              Mark as complete?
            </h2>
            <p style={{ margin: "0 0 28px 0", color: "#9ca3af", fontSize: "0.95rem", lineHeight: 1.6 }}>
              <strong style={{ color: "#e5e7eb" }}>{confirmFinish.name}</strong> will be marked as a completed build and removed from your active projects. The project data is preserved in the system.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmFinish(null)}
                style={{
                  padding: "10px 20px", borderRadius: radii.md,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "transparent", color: "#9ca3af",
                  fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  finishProject(confirmFinish.id);
                  setCompletedCount((n) => n + 1);
                  setConfirmFinish(null);
                }}
                style={{
                  padding: "10px 24px", borderRadius: radii.md,
                  border: "1px solid rgba(74, 222, 128, 0.4)",
                  background: "rgba(74, 222, 128, 0.15)", color: "#4ade80",
                  fontSize: "0.875rem", fontWeight: 700, cursor: "pointer",
                }}
              >
                Yes, finish project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}