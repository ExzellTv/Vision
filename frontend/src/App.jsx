import { createBrowserRouter, RouterProvider, Outlet, useNavigate } from "react-router-dom";
// import { SignedIn, SignedOut, AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import { ProjectProvider, useProject } from "./hooks/useProjectStore";
import { UserTypeProvider, useUserType } from "./context/UserTypeContext";
import NavBar from "./components/shared/NavBar";
// import LandingPage from "./screens/Landing/LandingPage";
import DemoLandingPage from "./screens/Landing/DemoLandingPage";
import Dashboard from "./screens/Dashboard/Dashboard";
import FloorPlanEditor from "./screens/FloorPlanEditor/FloorPlanEditor";
import LayerEditor from "./screens/LayerEditor/LayerEditor";
import FeasibilityDashboard from "./screens/FeasibilityDashboard/FeasibilityDashboard";
// import StructuralIntelligence from "./screens/StructuralIntelligence/StructuralIntelligence"; // DEMO: Integrated into 3D house build
import ExecutiveView from "./screens/ExecutiveView/ExecutiveView";
import ScheduleTimeline from "./screens/ScheduleTimeline/ScheduleTimeline";
// import LoginScreen from "./screens/Auth/LoginScreen";
import ProjectsScreen from "./screens/Projects/ProjectsScreen";
import SettingsScreen from "./screens/Settings/SettingsScreen";
import Browse from "./screens/Browse/Browse";
import Chat from "./screens/Chat/Chat";
import House3DPreview from "./screens/House3DPreview/House3DPreview";

/* Auth guard — DISABLED FOR DEMO — shows login when signed out, renders child routes when signed in */
// function AuthGuard() {
//   return (
//     <>
//       <SignedOut><LoginScreen /></SignedOut>
//       <SignedIn><Outlet /></SignedIn>
//     </>
//   );
// }

/* Main layout — project store + navbar + page outlet */
function MainLayout() {
  return (
    <ProjectProvider>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <NavBar />
        <main style={{ flex: 1, overflow: "hidden" }}>
          <Outlet />
        </main>
      </div>
    </ProjectProvider>
  );
}

/* Guard — requires an active project (selected from Projects screen) */
function RequireProject({ children }) {
  const { projectId } = useProject();
  const navigate = useNavigate();

  if (!projectId) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          background: "#0d1117",
          fontFamily: "'Inter', sans-serif",
          gap: 0,
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M6 6h8l6 6v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" stroke="#3b82f6" strokeWidth="1.5" fill="none" />
            <path d="M14 6v6h6" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M9 17h10M9 20h6" stroke="#3b82f6" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
          </svg>
        </div>

        <h2
          style={{
            margin: "0 0 10px",
            fontSize: 22,
            fontWeight: 700,
            color: "#f1f5f9",
            letterSpacing: "-0.3px",
          }}
        >
          No project selected
        </h2>
        <p
          style={{
            margin: "0 0 32px",
            fontSize: 14,
            color: "#64748b",
            textAlign: "center",
            maxWidth: 340,
            lineHeight: 1.6,
          }}
        >
          Please select or create a project first before accessing this section.
        </p>

        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => navigate("/projects")}
            style={{
              padding: "11px 24px",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 14px rgba(37,99,235,0.4)",
            }}
          >
            Go to Projects
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            style={{
              padding: "11px 24px",
              background: "transparent",
              border: "1px solid #2a3548",
              borderRadius: 8,
              color: "#94a3b8",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return children;
}

/* Guard — floor plan editing is homeowner-only; builders view & analyze client projects */
function RequireHomeowner({ children }) {
  const navigate = useNavigate();
  const { isBuilder } = useUserType();

  if (isBuilder) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          background: "#0d1117",
          fontFamily: "'Inter', sans-serif",
          gap: 0,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect x="7" y="13" width="14" height="10" rx="2" stroke="#f59e0b" strokeWidth="1.5" fill="none" />
            <path d="M10 13V9a4 4 0 0 1 8 0v4" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="14" cy="18" r="1.5" fill="#f59e0b" />
          </svg>
        </div>

        <h2
          style={{
            margin: "0 0 10px",
            fontSize: 22,
            fontWeight: 700,
            color: "#f1f5f9",
            letterSpacing: "-0.3px",
          }}
        >
          Floor Plan Editing Not Available
        </h2>
        <p
          style={{
            margin: "0 0 32px",
            fontSize: 14,
            color: "#64748b",
            textAlign: "center",
            maxWidth: 360,
            lineHeight: 1.6,
          }}
        >
          As a builder, you can view and analyze client projects but cannot edit
          the floor plan. Ask your client to make floor plan changes.
        </p>

        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => navigate("/preview3d")}
            style={{
              padding: "11px 24px",
              background: "linear-gradient(135deg, #d97706, #b45309)",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 14px rgba(217,119,6,0.4)",
            }}
          >
            View 3D Model
          </button>
          <button
            onClick={() => navigate("/projects")}
            style={{
              padding: "11px 24px",
              background: "transparent",
              border: "1px solid #2a3548",
              borderRadius: 8,
              color: "#94a3b8",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return children;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <DemoLandingPage />,
  },
  // DEMO MODE: Auth routes disabled
  // {
  //   path: "/login",
  //   element: <LoginScreen />,
  // },
  // {
  //   path: "/sso-callback",
  //   element: <AuthenticateWithRedirectCallback />,
  // },
  // DEMO MODE: AuthGuard bypassed — all routes accessible
  {
    element: <MainLayout />,
    children: [
      { path: "dashboard", element: <Dashboard /> },
      { path: "projects", element: <ProjectsScreen /> },
      { path: "browse", element: <Browse /> },
      { path: "chat", element: <Chat /> },
      // Internal project routes (accessed within project flow)
      { path: "develop", element: <RequireHomeowner><FloorPlanEditor /></RequireHomeowner> },
      { path: "preview3d", element: <House3DPreview /> },
      { path: "edit", element: <LayerEditor /> },
      { path: "feasibility", element: <FeasibilityDashboard /> },
      // { path: "structural", element: <StructuralIntelligence /> }, // DEMO: Integrated into 3D house
      { path: "executive", element: <ExecutiveView /> },
      { path: "schedule", element: <RequireProject><ScheduleTimeline /></RequireProject> },
      { path: "settings", element: <SettingsScreen /> },
    ],
  },
]);

export default function App() {
  return (
    <UserTypeProvider>
      <RouterProvider router={router} />
    </UserTypeProvider>
  );
}

