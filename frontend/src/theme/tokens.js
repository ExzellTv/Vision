/** Vision Design System Tokens — PRD Section 7 */

export const colors = {
  bg: "#0d1117",
  bgGradient: "linear-gradient(180deg, #0d1117 0%, #141b2d 100%)",
  cardSurface: "#1a2233",
  cardBorder: "#2a3548",
  panel: "#0f1420",
  panelBorder: "#1a2236",
  surface: "#141b2d",
  surfaceHover: "#1a2440",

  text: "#c8d0e0",
  textDim: "#5a6580",
  textBright: "#e8ecf4",

  accent: "#00d4ff",
  accentDim: "rgba(0, 212, 255, 0.2)",
  accentGlow: "rgba(0, 212, 255, 0.1)",
  secondary: "#3b82f6",

  warn: "#ff9f43",
  warnDim: "rgba(255, 159, 67, 0.2)",
  danger: "#ff4757",
  dangerDim: "rgba(255, 71, 87, 0.2)",
  success: "#2ed573",
  successDim: "rgba(46, 213, 115, 0.2)",

  // Structural materials
  concrete: "#8a9bb0",
  wood: "#c4956a",
  steel: "#7a8ea0",
  glass: "#a0d2db",

  // Heatmap
  heatLow: "#3b82f6",
  heatMid: "#f59e0b",
  heatHigh: "#ef4444",
};

export const fonts = {
  data: "'JetBrains Mono', 'IBM Plex Mono', monospace",
  label: "'Inter', 'IBM Plex Sans', -apple-system, sans-serif",
};

export const radii = {
  sm: "4px",
  md: "6px",
  lg: "8px",
  xl: "12px",
};

export const card = {
  background: colors.cardSurface,
  border: `1px solid ${colors.cardBorder}`,
  borderRadius: radii.lg,
  padding: "16px",
};

export const DISCLAIMER =
  "Vision provides pre-feasibility estimates for early-stage planning purposes only. " +
  "Structural calculations, cost projections, and financial forecasts are advisory and do not constitute " +
  "licensed engineering analysis, professional design services, or investment advice. " +
  "All structural design must be reviewed and stamped by a licensed Professional Engineer (PE) before construction.";
