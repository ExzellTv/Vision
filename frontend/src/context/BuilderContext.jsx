import { createContext, useContext, useState, useEffect } from "react";
import { builderRequestsApi } from "../services/api";

const BuilderContext = createContext(null);

const BUILDER_CACHE_KEY = "vision:builder";
const BUILDER_CACHE_SCHEMA = 2; // increment whenever the cached shape changes

function readBuilderCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(BUILDER_CACHE_KEY));
    // Discard if missing, wrong schema version, or any entry lacks a valid project id
    if (!raw || raw._v !== BUILDER_CACHE_SCHEMA) return null;
    const projects = raw.projects ?? [];
    // Validate every cached entry has an id that looks like a real MongoDB ObjectId
    const valid = projects.every((p) => typeof p.id === "string" && /^[a-f0-9]{24}$/.test(p.id));
    return valid ? projects : null;
  } catch { return null; }
}

function writeBuilderCache(projects) {
  try {
    localStorage.setItem(BUILDER_CACHE_KEY, JSON.stringify({ _v: BUILDER_CACHE_SCHEMA, projects }));
  } catch { /* quota */ }
}

export function BuilderProvider({ children }) {
  const [projects, setProjects] = useState(() => readBuilderCache() ?? []);

  const fetchApiProjects = () => {
    Promise.all([builderRequestsApi.allPending(), builderRequestsApi.allApproved()])
      .then(([pending, approved]) => {
        const pendingMapped = pending.map((req) => ({
          id: req.project_id,
          requestId: req.id,
          name: req.project_name,
          address: req.address || "",
          client: "Homeowner",
          status: "New Request",
          cost: { budget: req.budget || 0 },
          feasibility: { score: 0, zoning: "Pending" },
          progress: 0,
          progressTone: "secondary",
        }));

        const approvedMapped = approved.map((req) => ({
          id: req.project_id,
          requestId: req.id,
          name: req.project_name,
          address: req.address || "",
          client: "Homeowner",
          status: "On Track",
          statusTone: "success",
          progress: 0,
          progressTone: "secondary",
          phase: "Planning",
          cost: { budget: req.budget || 0, spent: 0 },
          feasibility: { score: 0, zoning: "Pending" },
        }));

        // DB is the source of truth — rebuild state entirely from API response.
        // Cache is only used for instant first paint; it never overrides live data.
        const next = [...approvedMapped, ...pendingMapped];
        writeBuilderCache(approvedMapped);
        setProjects(next);
      })
      .catch(() => {});
  };

  useEffect(() => { fetchApiProjects(); }, []);

  const approveRequest = (id) => {
    setProjects((prev) => {
      const next = prev.map((proj) => {
        if (proj.id !== id) return proj;
        builderRequestsApi.updateStatus(proj.requestId || id, "approved").catch(() => {});
        return {
          ...proj,
          status: "On Track",
          statusTone: "success",
          progress: 0,
          progressTone: "secondary",
          phase: "Planning",
          cost: { ...proj.cost, spent: 0 },
        };
      });
      // Persist only active projects to cache immediately after approval
      writeBuilderCache(next.filter((p) => p.status !== "New Request"));
      return next;
    });
  };

  const denyRequest = (id) => {
    setProjects((prev) => {
      const proj = prev.find((p) => p.id === id);
      if (proj) builderRequestsApi.updateStatus(proj.requestId || id, "denied").catch(() => {});
      const next = prev.filter((p) => p.id !== id);
      writeBuilderCache(next.filter((p) => p.status !== "New Request"));
      return next;
    });
  };

  return (
    <BuilderContext.Provider value={{ projects, approveRequest, denyRequest, refreshProjects: fetchApiProjects }}>
      {children}
    </BuilderContext.Provider>
  );
}

export function useBuilderStore() {
  const context = useContext(BuilderContext);
  if (!context) {
    throw new Error("useBuilderStore must be used within a BuilderProvider");
  }
  return context;
}
