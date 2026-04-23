import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUserType } from "../../context/UserTypeContext";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  lightBg: "#fafafa",
  lightText: "#0f172a",
  lightTextDim: "#64748b",
  darkBg: "#0d1117",
  darkGridLine: "rgba(0,212,255,0.04)",
  darkText: "#f0f6ff",
  darkTextDim: "#64748b",
  accent: "#3b82f6",
  cyan: "#00d4ff",
  serif: "'DM Serif Display', Georgia, serif",
  sans: "'Inter', -apple-system, sans-serif",
  mono: "'JetBrains Mono', monospace",
};

// ─── Animated grid for builder side ──────────────────────────────────────────
function AnimatedGrid() {
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <defs>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke={C.darkGridLine} strokeWidth="1" />
        </pattern>
        <radialGradient id="gridFade" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="gridMask">
          <rect width="100%" height="100%" fill="url(#gridFade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" mask="url(#gridMask)" />
    </svg>
  );
}

// ─── Floating blueprint annotation marks ─────────────────────────────────────
function BlueprintAnnotations() {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* Dimension line top */}
      <div style={{
        position: "absolute", top: "18%", right: "12%",
        display: "flex", alignItems: "center", gap: 6, opacity: 0.12,
      }}>
        <div style={{ width: 40, height: 1, background: C.cyan }} />
        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.cyan }}>24'-0"</span>
        <div style={{ width: 40, height: 1, background: C.cyan }} />
      </div>
      {/* Corner mark */}
      <div style={{
        position: "absolute", bottom: "22%", left: "10%", opacity: 0.08,
      }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M0 32V0h32" stroke={C.cyan} strokeWidth="1.5" />
          <circle cx="0" cy="0" r="2" fill={C.cyan} />
        </svg>
      </div>
      {/* Scale indicator */}
      <div style={{
        position: "absolute", bottom: "10%", right: "8%",
        display: "flex", alignItems: "center", gap: 4, opacity: 0.1,
      }}>
        <span style={{ fontFamily: C.mono, fontSize: 8, color: C.cyan, letterSpacing: "0.1em" }}>
          SCALE 1:100
        </span>
      </div>
    </div>
  );
}

// ─── Subtle dot pattern for homeowner side ───────────────────────────────────
function DotPattern() {
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <defs>
        <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.8" fill="rgba(15,23,42,0.06)" />
        </pattern>
        <radialGradient id="dotFade" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="dotMask">
          <rect width="100%" height="100%" fill="url(#dotFade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" mask="url(#dotMask)" />
    </svg>
  );
}

// ─── Home icon ───────────────────────────────────────────────────────────────
function HomeIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <path
        d="M22 4C16.477 4 12 8.477 12 14c0 7.5 10 20 10 20s10-12.5 10-20c0-5.523-4.477-10-10-10z"
        stroke={C.lightText}
        strokeWidth="1.5"
        fill="none"
        opacity="0.7"
      />
      <path
        d="M22 10l-5 4v6h3.5v-3.5h3v3.5H27v-6l-5-4z"
        stroke={C.lightText}
        strokeWidth="1.2"
        fill="none"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  );
}

// ─── Builder compass icon ────────────────────────────────────────────────────
function BuilderIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <path d="M22 6v6" stroke={C.darkText} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <circle cx="22" cy="12" r="2" stroke={C.darkText} strokeWidth="1.2" fill="none" opacity="0.7" />
      <path d="M22 14L15 36" stroke={C.darkText} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <path d="M22 14L29 36" stroke={C.darkText} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <path d="M17 25h10" stroke={C.darkText} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

// ─── Animated entrance wrapper ───────────────────────────────────────────────
function FadeIn({ delay = 0, children }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {children}
    </div>
  );
}

// ─── Side panel component ────────────────────────────────────────────────────
function SidePanel({ dark, icon, label, title, subtitle, buttonText, buttonStyle, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: dark ? C.darkBg : C.lightBg,
        position: "relative",
        cursor: "default",
      }}
    >
      {dark ? (
        <>
          <AnimatedGrid />
          <BlueprintAnnotations />
        </>
      ) : (
        <DotPattern />
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, zIndex: 1 }}>
        <FadeIn delay={dark ? 200 : 100}>
          <span style={{
            fontFamily: C.sans,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: dark ? C.darkTextDim : C.lightTextDim,
          }}>
            {label}
          </span>
        </FadeIn>
        <FadeIn delay={dark ? 300 : 200}>
          <h1 style={{
            fontFamily: C.serif,
            fontSize: "clamp(44px, 5.5vw, 68px)",
            fontWeight: 400,
            letterSpacing: "-0.02em",
            margin: 0,
            lineHeight: 1,
            color: dark ? C.darkText : C.lightText,
          }}>
            {title}
          </h1>
        </FadeIn>
        <FadeIn delay={dark ? 400 : 300}>
          <div style={{ marginTop: -4, marginBottom: 4 }}>{icon}</div>
        </FadeIn>
        <FadeIn delay={dark ? 450 : 350}>
          <p style={{
            fontFamily: C.sans,
            fontSize: 13,
            color: dark ? C.darkTextDim : C.lightTextDim,
            margin: 0,
            textAlign: "center",
            maxWidth: 240,
            lineHeight: 1.6,
          }}>
            {subtitle}
          </p>
        </FadeIn>
        <FadeIn delay={dark ? 550 : 450}>
          <button
            onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
              marginTop: 8,
              padding: "14px 44px",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: C.sans,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              transform: hov ? "translateY(-2px)" : "translateY(0)",
              boxShadow: hov ? buttonStyle.hoverShadow : "none",
              transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s ease",
              ...buttonStyle.base,
            }}
          >
            {buttonText}
          </button>
        </FadeIn>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DemoLandingPage() {
  const navigate = useNavigate();
  const { setHomeowner, setBuilder } = useUserType();
  const [logoVisible, setLogoVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLogoVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", overflow: "hidden" }}>
      {/* Center logo */}
      <div
        style={{
          position: "absolute",
          top: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
          opacity: logoVisible ? 1 : 0,
          transition: "opacity 0.8s ease 0.1s",
        }}
      >
        <span style={{ fontFamily: C.serif, fontSize: 48, letterSpacing: "-0.02em" }}>
          <span style={{ color: C.lightText }}>Vis</span><span style={{ color: C.darkText }}>ion</span>
        </span>
      </div>

      {/* Bottom center credit */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          fontFamily: C.mono,
          fontSize: 9,
          letterSpacing: "0.15em",
          color: "rgba(148,163,184,0.4)",
          textTransform: "uppercase",
          opacity: logoVisible ? 1 : 0,
          transition: "opacity 1s ease 0.8s",
        }}
      >
        Red Bull Basement 2025
      </div>

      {/* Divider line */}
      <div style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: "50%",
        width: 1,
        background: "linear-gradient(180deg, transparent 10%, rgba(148,163,184,0.15) 50%, transparent 90%)",
        zIndex: 5,
      }} />

      {/* Left — Homeowner */}
      <SidePanel
        dark={false}
        icon={<HomeIcon />}
        label="I'm a"
        title="Homeowner"
        subtitle="Visualize your dream home with AI-powered design and cost intelligence"
        buttonText="See My Vision"
        buttonStyle={{
          base: { background: C.lightText, color: C.lightBg },
          hoverShadow: "0 8px 28px rgba(15,23,42,0.2)",
        }}
        onClick={() => { setHomeowner(); navigate("/dashboard"); }}
      />

      {/* Right — Builder */}
      <SidePanel
        dark
        icon={<BuilderIcon />}
        label="I'm a"
        title="Builder"
        subtitle="Professional feasibility analysis, structural engineering, and project management"
        buttonText="View Projects"
        buttonStyle={{
          base: { background: C.accent, color: "#fff" },
          hoverShadow: "0 8px 28px rgba(59,130,246,0.45)",
        }}
        onClick={() => { setBuilder(); navigate("/builderdashboard"); }}
      />
    </div>
  );
}
