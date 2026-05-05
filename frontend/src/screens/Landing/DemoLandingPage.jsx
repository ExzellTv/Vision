import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUserType } from "../../context/UserTypeContext";
import useBreakpoint from "../../hooks/useBreakpoint";

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
function AnimatedGrid({ isMobile = false }) {
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
        <pattern id="grid" width={isMobile ? 48 : 60} height={isMobile ? 48 : 60} patternUnits="userSpaceOnUse">
          <path d={`M ${isMobile ? 48 : 60} 0 L 0 0 0 ${isMobile ? 48 : 60}`} fill="none" stroke={C.darkGridLine} strokeWidth="1" />
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
function BlueprintAnnotations({ isMobile = false }) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* Dimension line top */}
      <div style={{
        position: "absolute", top: isMobile ? "12%" : "18%", right: isMobile ? "8%" : "12%",
        display: "flex", alignItems: "center", gap: isMobile ? 4 : 6, opacity: isMobile ? 0.08 : 0.12,
      }}>
        <div style={{ width: isMobile ? 26 : 40, height: 1, background: C.cyan }} />
        <span style={{ fontFamily: C.mono, fontSize: isMobile ? 7 : 9, color: C.cyan }}>24'-0"</span>
        <div style={{ width: isMobile ? 26 : 40, height: 1, background: C.cyan }} />
      </div>
      {/* Corner mark */}
      <div style={{
        position: "absolute", bottom: isMobile ? "14%" : "22%", left: isMobile ? "8%" : "10%", opacity: isMobile ? 0.06 : 0.08,
      }}>
        <svg width={isMobile ? 24 : 32} height={isMobile ? 24 : 32} viewBox="0 0 32 32" fill="none">
          <path d="M0 32V0h32" stroke={C.cyan} strokeWidth="1.5" />
          <circle cx="0" cy="0" r="2" fill={C.cyan} />
        </svg>
      </div>
      {/* Scale indicator */}
      <div style={{
        position: "absolute", bottom: isMobile ? "8%" : "10%", right: isMobile ? "7%" : "8%",
        display: "flex", alignItems: "center", gap: 4, opacity: isMobile ? 0.07 : 0.1,
      }}>
        <span style={{ fontFamily: C.mono, fontSize: isMobile ? 7 : 8, color: C.cyan, letterSpacing: "0.1em" }}>
          SCALE 1:100
        </span>
      </div>
    </div>
  );
}

// ─── Subtle dot pattern for homeowner side ───────────────────────────────────
function DotPattern({ isMobile = false }) {
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <defs>
        <pattern id="dots" width={isMobile ? 20 : 24} height={isMobile ? 20 : 24} patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.8" fill={`rgba(15,23,42,${isMobile ? "0.04" : "0.06"})`} />
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
function HomeIcon({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
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
function BuilderIcon({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
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
function SidePanel({ dark, icon, label, title, subtitle, buttonText, buttonStyle, onClick, isMobile = false }) {
  const [hov, setHov] = useState(false);
  const showHover = !isMobile && hov;
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: isMobile ? (dark ? "#101826" : "#ffffff") : (dark ? C.darkBg : C.lightBg),
        position: "relative",
        cursor: "default",
        width: isMobile ? "100%" : undefined,
        minHeight: isMobile ? 250 : undefined,
        padding: isMobile ? "24px 20px" : undefined,
        overflow: "hidden",
        borderRadius: isMobile ? 8 : undefined,
        border: isMobile ? `1px solid ${dark ? "#1d2d46" : "rgba(15,23,42,0.08)"}` : undefined,
        boxShadow: isMobile
          ? (dark ? "0 18px 40px rgba(2,6,23,0.26)" : "0 18px 40px rgba(15,23,42,0.08)")
          : undefined,
      }}
    >
      {dark ? (
        <>
          <AnimatedGrid isMobile={isMobile} />
          <BlueprintAnnotations isMobile={isMobile} />
        </>
      ) : (
        <DotPattern isMobile={isMobile} />
      )}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: isMobile ? 14 : 20,
        zIndex: 1,
        width: "100%",
        maxWidth: isMobile ? 300 : undefined,
        minWidth: 0,
      }}>
        <FadeIn delay={dark ? 200 : 100}>
          <span style={{
            fontFamily: C.sans,
            fontSize: isMobile ? 10 : 11,
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
            fontSize: isMobile ? "clamp(34px, 10vw, 42px)" : "clamp(44px, 5.5vw, 68px)",
            fontWeight: 400,
            letterSpacing: "-0.02em",
            margin: 0,
            lineHeight: 1,
            color: dark ? C.darkText : C.lightText,
            textAlign: "center",
          }}>
            {title}
          </h1>
        </FadeIn>
        <FadeIn delay={dark ? 400 : 300}>
          <div style={{ marginTop: isMobile ? -2 : -4, marginBottom: isMobile ? 0 : 4 }}>{icon}</div>
        </FadeIn>
        <FadeIn delay={dark ? 450 : 350}>
          <p style={{
            fontFamily: C.sans,
            fontSize: isMobile ? 12 : 13,
            color: dark ? C.darkTextDim : C.lightTextDim,
            margin: 0,
            textAlign: "center",
            maxWidth: isMobile ? 260 : 240,
            minWidth: 0,
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
              padding: isMobile ? "14px 20px" : "14px 44px",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: C.sans,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              transform: showHover ? "translateY(-2px)" : "translateY(0)",
              boxShadow: showHover ? buttonStyle.hoverShadow : "none",
              transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s ease",
              width: isMobile ? "100%" : undefined,
              maxWidth: isMobile ? 260 : undefined,
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
  const isMobile = useBreakpoint(768);

  useEffect(() => {
    const t = setTimeout(() => setLogoVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      width: isMobile ? "100%" : "100vw",
      height: isMobile ? "auto" : "100vh",
      minHeight: "100vh",
      overflowX: "hidden",
      overflowY: isMobile ? "auto" : "hidden",
      padding: isMobile ? "16px" : 0,
      position: "relative",
      boxSizing: "border-box",
      background: isMobile ? "#f8fafc" : undefined,
      gap: isMobile ? 18 : 0,
    }}>
      {isMobile ? (
        <>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              paddingTop: 8,
              paddingBottom: 6,
              opacity: logoVisible ? 1 : 0,
              transition: "opacity 0.8s ease 0.1s",
              textAlign: "center",
            }}
          >
            <span style={{ fontFamily: C.serif, fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1 }}>
              <span style={{ color: C.lightText }}>Vis</span><span style={{ color: C.darkBg }}>ion</span>
            </span>
            <p style={{
              margin: "12px 0 0",
              maxWidth: 280,
              fontFamily: C.sans,
              fontSize: 13,
              lineHeight: 1.6,
              color: "#64748b",
            }}>
              Choose your workspace to get started.
            </p>
          </div>

          <div style={{
            width: "100%",
            maxWidth: 420,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}>
            <SidePanel
              dark={false}
              isMobile
              icon={<HomeIcon size={38} />}
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

            <SidePanel
              dark
              isMobile
              icon={<BuilderIcon size={38} />}
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

          <div
            style={{
              textAlign: "center",
              paddingTop: 2,
              paddingBottom: 8,
              fontFamily: C.mono,
              fontSize: 9,
              letterSpacing: "0.15em",
              color: "rgba(100,116,139,0.72)",
              textTransform: "uppercase",
              opacity: logoVisible ? 1 : 0,
              transition: "opacity 1s ease 0.8s",
            }}
          >
            Red Bull Basement 2025
          </div>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
