import { createContext, useContext, useState } from "react";

const BuilderContext = createContext(null);

const INITIAL_PROJECTS = [
  // Active Projects
  {
    id: "1",
    name: "The Martinez Home",
    address: "4821 Elm Creek Dr, Dallas TX",
    status: "On Track",
    statusTone: "success",
    progress: 70,
    progressTone: "secondary",
    phase: "Framing",
    client: "Rosa Martinez",
    cost: { budget: 1200000, spent: 840000 },
    feasibility: { score: 92, zoning: "Approved" },
  },
  {
    id: "2",
    name: "The Chen Residence",
    address: "910 Lakeview Blvd, Austin TX",
    status: "Delayed",
    statusTone: "warn",
    progress: 40,
    progressTone: "warn",
    phase: "Foundation",
    client: "David Chen",
    cost: { budget: 1500000, spent: 600000 },
    feasibility: { score: 85, zoning: "Approved" },
  },
  {
    id: "3",
    name: "The Patel Build",
    address: "332 Sunrise Ranch Rd, Plano TX",
    status: "On Track",
    statusTone: "success",
    progress: 90,
    progressTone: "accent",
    phase: "Finishing",
    client: "Priya Patel",
    cost: { budget: 950000, spent: 855000 },
    feasibility: { score: 98, zoning: "Approved" },
  },
  // Incoming Requests
  {
    id: "4",
    name: "The Williams Property",
    address: "88 Creekstone Pass, Houston TX",
    status: "New Request",
    client: "Marcus Williams",
    cost: { budget: 850000 },
    feasibility: { score: 88, zoning: "Pending" },
  },
  {
    id: "req-1",
    name: "Riverside Modern Array",
    address: "122 Riverfront Way, Austin TX",
    status: "New Request",
    client: "Julia Vance",
    cost: { budget: 2100000 },
    feasibility: { score: 95, zoning: "Approved" },
  },
  {
    id: "req-2",
    name: "Green Valley Build",
    address: "4401 Old Pine Trl, Spring TX",
    status: "New Request",
    client: "Nathan Hsieh",
    cost: { budget: 700000 },
    feasibility: { score: 72, zoning: "Pending Review" },
  },
  {
    id: "req-3",
    name: "Lakefront Cabin Setup",
    address: "710 Waterside Cir, Waco TX",
    status: "New Request",
    client: "Emma Stone",
    cost: { budget: 550000 },
    feasibility: { score: 81, zoning: "Approved" },
  },
  {
    id: "req-4",
    name: "Dallas Downtown ADU",
    address: "3912 Main St, Dallas TX",
    status: "New Request",
    client: "Terrence Pierce",
    cost: { budget: 280000 },
    feasibility: { score: 64, zoning: "Requires Variance" },
  },
  {
    id: "req-5",
    name: "Suburban Custom Extension",
    address: "800 Cedar Ln, Round Rock TX",
    status: "New Request",
    client: "Olivia Bennett",
    cost: { budget: 450000 },
    feasibility: { score: 90, zoning: "Approved" },
  },
];

export function BuilderProvider({ children }) {
  const [projects, setProjects] = useState(INITIAL_PROJECTS);

  const approveRequest = (id) => {
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.id === id) {
          return {
            ...proj,
            status: "On Track",
            statusTone: "success",
            progress: 0,
            progressTone: "secondary",
            phase: "Planning",
            cost: { ...proj.cost, spent: 0 },
          };
        }
        return proj;
      })
    );
  };

  const denyRequest = (id) => {
    setProjects((prev) => prev.filter((proj) => proj.id !== id));
  };

  return (
    <BuilderContext.Provider value={{ projects, approveRequest, denyRequest }}>
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
