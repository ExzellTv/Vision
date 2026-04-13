/**
 * HouseViewerPage — /house-viewer route.
 * Smplrspace interactive floor plan + MyArchitectAI photorealistic render.
 */
import HouseViewer from "../../components/HouseViewer";
import { colors, fonts } from "../../theme/tokens";

export default function HouseViewerPage() {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%", background: colors.bg,
    }}>
      <div style={{
        padding: "16px 24px",
        borderBottom: `1px solid ${colors.panelBorder}`,
        background: colors.panel,
      }}>
        <h1 style={{
          margin: 0, fontSize: 18, fontWeight: 700,
          color: colors.textBright, fontFamily: fonts.label,
          letterSpacing: "-0.2px",
        }}>
          Vision — Home Preview
        </h1>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <HouseViewer />
      </div>
    </div>
  );
}
