import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProjectProvider } from "./hooks/useProjectStore";
import NavBar from "./components/shared/NavBar";
import Dashboard from "./screens/Dashboard/Dashboard";
import FloorPlanEditor from "./screens/FloorPlanEditor/FloorPlanEditor";
import LayerEditor from "./screens/LayerEditor/LayerEditor";
import FeasibilityDashboard from "./screens/FeasibilityDashboard/FeasibilityDashboard";
import StructuralIntelligence from "./screens/StructuralIntelligence/StructuralIntelligence";
import ExecutiveView from "./screens/ExecutiveView/ExecutiveView";
import ScheduleTimeline from "./screens/ScheduleTimeline/ScheduleTimeline";

export default function App() {
  return (
    <BrowserRouter>
    <ProjectProvider>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <NavBar />
        <main style={{ flex: 1, overflow: "hidden" }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/develop" element={<FloorPlanEditor />} />
            <Route path="/edit" element={<LayerEditor />} />
            <Route path="/feasibility" element={<FeasibilityDashboard />} />
            <Route path="/structural" element={<StructuralIntelligence />} />
            <Route path="/executive" element={<ExecutiveView />} />
            <Route path="/schedule" element={<ScheduleTimeline />} />
          </Routes>
        </main>
      </div>
    </ProjectProvider>
    </BrowserRouter>
  );
}
