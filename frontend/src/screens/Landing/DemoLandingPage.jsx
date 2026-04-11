import { useNavigate } from "react-router-dom";
import { useUserType } from "../../context/UserTypeContext";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  // Light side (Homeowner)
  lightBg: "#f5f5f5",
  lightText: "#1a1a2e",
  lightTextDim: "#6b7280",
  // Dark side (Builder)
  darkBg: "#0d1117",
  darkGridLine: "rgba(255,255,255,0.04)",
  darkText: "#f0f6ff",
  darkTextDim: "#8b9db8",
  // Accent
  accent: "#3b82f6",
  // Fonts
  serif: "'DM Serif Display', Georgia, serif",
  sans: "'Inter', sans-serif",
};

// ─── Home/Location Pin Icon ───────────────────────────────────────────────────
function HomeIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      {/* Location pin outline */}
      <path
        d="M24 4C17.373 4 12 9.373 12 16c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z"
        stroke={C.lightText}
        strokeWidth="2"
        fill="none"
      />
      {/* House inside pin */}
      <path
        d="M24 10l-6 5v7h4v-4h4v4h4v-7l-6-5z"
        stroke={C.lightText}
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Compass/Drafting Icon ────────────────────────────────────────────────────
function BuilderIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      {/* Compass/divider tool */}
      <path
        d="M24 8L24 14"
        stroke={C.darkText}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="24" cy="14" r="2" stroke={C.darkText} strokeWidth="1.5" fill="none" />
      <path
        d="M24 16L16 40"
        stroke={C.darkText}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M24 16L32 40"
        stroke={C.darkText}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Cross bar */}
      <path
        d="M18 28L30 28"
        stroke={C.darkText}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Grid background for dark side ────────────────────────────────────────────
function GridBackground() {
  const lines = [];
  const spacing = 60;

  // Vertical lines
  for (let i = 0; i <= 20; i++) {
    lines.push(
      <line
        key={`v${i}`}
        x1={i * spacing}
        y1="0"
        x2={i * spacing}
        y2="100%"
        stroke={C.darkGridLine}
        strokeWidth="1"
      />
    );
  }

  // Horizontal lines
  for (let i = 0; i <= 20; i++) {
    lines.push(
      <line
        key={`h${i}`}
        x1="0"
        y1={i * spacing}
        x2="100%"
        y2={i * spacing}
        stroke={C.darkGridLine}
        strokeWidth="1"
      />
    );
  }

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {lines}
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DemoLandingPage() {
  const navigate = useNavigate();
  const { setHomeowner, setBuilder } = useUserType();

  const handleHomeownerClick = () => {
    setHomeowner();
    navigate("/dashboard");
  };

  const handleBuilderClick = () => {
    setBuilder();
    navigate("/projects");
  };

  const styles = {
    container: {
      display: "flex",
      width: "100vw",
      height: "100vh",
      overflow: "hidden",
    },
    // Logo at top center
    logo: {
      position: "absolute",
      top: 24,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 10,
      fontFamily: C.serif,
      fontStyle: "italic",
      fontSize: 24,
      fontWeight: 400,
      color: C.darkText,
      letterSpacing: "0.02em",
    },
    // Left side - Homeowner
    leftSide: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: C.lightBg,
      position: "relative",
    },
    // Right side - Builder
    rightSide: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: C.darkBg,
      position: "relative",
    },
    // Content wrapper
    content: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 24,
      zIndex: 1,
    },
    // "I'M A" label
    label: {
      fontFamily: C.serif,
      fontStyle: "italic",
      fontSize: 14,
      fontWeight: 400,
      letterSpacing: "0.15em",
      textTransform: "uppercase",
    },
    // Main title
    title: {
      fontFamily: C.serif,
      fontSize: "clamp(48px, 6vw, 72px)",
      fontWeight: 400,
      letterSpacing: "-0.02em",
      margin: 0,
      lineHeight: 1,
    },
    // Icon container
    iconContainer: {
      marginTop: 8,
      marginBottom: 8,
    },
    // Button base
    button: {
      padding: "16px 48px",
      fontSize: 13,
      fontWeight: 600,
      fontFamily: C.sans,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      border: "none",
      borderRadius: 4,
      cursor: "pointer",
      transition: "transform 0.2s, box-shadow 0.2s",
    },
    // Light button (for homeowner side)
    buttonLight: {
      background: C.lightText,
      color: C.lightBg,
    },
    // Accent button (for builder side)
    buttonAccent: {
      background: C.accent,
      color: "#fff",
    },
  };

  return (
    <div style={styles.container}>
      {/* Center logo */}
      <div style={styles.logo}>Vision</div>

      {/* Left side - Homeowner */}
      <div style={styles.leftSide}>
        <div style={styles.content}>
          <span style={{ ...styles.label, color: C.lightTextDim }}>I'm a</span>
          <h1 style={{ ...styles.title, color: C.lightText }}>Homeowner</h1>
          <div style={styles.iconContainer}>
            <HomeIcon />
          </div>
          <button
            style={{ ...styles.button, ...styles.buttonLight }}
            onClick={handleHomeownerClick}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            See My Vision
          </button>
        </div>
      </div>

      {/* Right side - Builder */}
      <div style={styles.rightSide}>
        <GridBackground />
        <div style={styles.content}>
          <span style={{ ...styles.label, color: C.darkTextDim }}>I'm a</span>
          <h1 style={{ ...styles.title, color: C.darkText }}>Builder</h1>
          <div style={styles.iconContainer}>
            <BuilderIcon />
          </div>
          <button
            style={{ ...styles.button, ...styles.buttonAccent }}
            onClick={handleBuilderClick}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(59,130,246,0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            View Projects
          </button>
        </div>
      </div>
    </div>
  );
}
