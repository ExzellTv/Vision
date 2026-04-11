/**
 * HouseViewerPage — Route wrapper for /house-viewer.
 * Renders HouseViewer with the current project's floor plan or demo data.
 */
import { useProject } from "../../hooks/useProjectStore";
import HouseViewer from "../../components/HouseViewer";

export default function HouseViewerPage() {
  const { floorPlan } = useProject();
  return <HouseViewer floorPlanJson={floorPlan} />;
}
