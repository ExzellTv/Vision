import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#0d1117",
  surface: "#111827",
  card: "#141b2d",
  cardBorder: "#1e2d45",
  accent: "#00d4ff",
  accentDim: "rgba(0,212,255,0.12)",
  accentGlow: "rgba(0,212,255,0.06)",
  secondary: "#3b82f6",
  textBright: "#f0f6ff",
  text: "#8b9db8",
  textDim: "#4a5568",
  success: "#2ed573",
  warn: "#ff9f43",
  mono: "'JetBrains Mono', monospace",
  sans: "'Inter', sans-serif",
  serif: "'DM Serif Display', Georgia, serif",
};

// ─── Dot-grid background pattern ─────────────────────────────────────────────
const DOT_BG = {
  backgroundImage: `radial-gradient(circle, rgba(30,45,69,0.8) 1px, transparent 1px)`,
  backgroundSize: "32px 32px",
};

// ─── Hero mockup — pure SVG/CSS app preview ───────────────────────────────────
function AppPreview() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "100%",
        aspectRatio: "16/9",
        background: C.card,
        border: `1px solid ${C.cardBorder}`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.08)",
      }}
    >
      {/* Window chrome */}
      <div
        style={{
          height: 36,
          background: "#0d1421",
          borderBottom: `1px solid ${C.cardBorder}`,
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          gap: 6,
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.8 }} />
        ))}
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#1a2233",
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 4,
              padding: "3px 16px",
              fontSize: 10,
              color: C.textDim,
              fontFamily: C.mono,
            }}
          >
            vision.app / feasibility
          </div>
        </div>
      </div>

      {/* App body */}
      <div style={{ display: "flex", height: "calc(100% - 36px)" }}>
        {/* Sidebar */}
        <div
          style={{
            width: 48,
            background: "#0a0f1a",
            borderRight: `1px solid ${C.cardBorder}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "14px 0",
            gap: 12,
          }}
        >
          {[C.accent, C.secondary, C.text, C.text, C.text].map((c, i) => (
            <div
              key={i}
              style={{
                width: 24,
                height: 24,
                borderRadius: 5,
                background: i === 0 ? C.accentDim : "rgba(30,45,69,0.5)",
                border: `1px solid ${i === 0 ? "rgba(0,212,255,0.3)" : C.cardBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: 2, background: c, opacity: i === 0 ? 1 : 0.4 }} />
            </div>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: 12, overflow: "hidden" }}>
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, marginBottom: 2 }}>FEASIBILITY SCORE</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.accent, fontFamily: C.mono, lineHeight: 1 }}>87.4</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["IRR", "NOI", "CAP"].map((l) => (
                <div
                  key={l}
                  style={{
                    padding: "3px 8px",
                    background: C.accentDim,
                    border: `1px solid rgba(0,212,255,0.2)`,
                    borderRadius: 4,
                    fontSize: 8,
                    color: C.accent,
                    fontFamily: C.mono,
                  }}
                >
                  {l}
                </div>
              ))}
            </div>
          </div>

          {/* Mini chart bars */}
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 48, marginBottom: 10 }}>
            {[55, 70, 45, 85, 60, 90, 75, 50, 80, 65, 88, 72].map((h, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${h}%`,
                  background: i === 9
                    ? `linear-gradient(180deg, ${C.accent} 0%, rgba(0,212,255,0.3) 100%)`
                    : `rgba(59,130,246,${0.2 + (h / 100) * 0.4})`,
                  borderRadius: "2px 2px 0 0",
                  border: i === 9 ? `1px solid rgba(0,212,255,0.4)` : "none",
                }}
              />
            ))}
          </div>

          {/* Metric cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
            {[
              { label: "Total Cost", val: "$2.4M", c: C.text },
              { label: "Market Val", val: "$3.1M", c: C.success },
              { label: "ROI", val: "29.2%", c: C.warn },
            ].map(({ label, val, c }) => (
              <div
                key={label}
                style={{
                  background: "#0d1421",
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 5,
                  padding: "6px 7px",
                }}
              >
                <div style={{ fontSize: 7, color: C.textDim, fontFamily: C.mono, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: c, fontFamily: C.mono }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Map placeholder */}
          <div
            style={{
              marginTop: 8,
              height: 58,
              background: "#0a1520",
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 5,
              overflow: "hidden",
              position: "relative",
            }}
          >
            {/* Grid lines */}
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: `${20 * i}%`,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: "rgba(30,45,69,0.8)",
                }}
              />
            ))}
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${12.5 * i}%`,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: "rgba(30,45,69,0.8)",
                }}
              />
            ))}
            {/* Dots for parcels */}
            {[
              { x: 20, y: 35, c: C.accent, s: 6 },
              { x: 40, y: 55, c: C.secondary, s: 4 },
              { x: 60, y: 30, c: C.success, s: 5 },
              { x: 75, y: 60, c: C.warn, s: 4 },
              { x: 85, y: 40, c: C.accent, s: 3 },
            ].map(({ x, y, c, s }, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${x}%`,
                  top: `${y}%`,
                  width: s,
                  height: s,
                  borderRadius: "50%",
                  background: c,
                  boxShadow: `0 0 ${s * 2}px ${c}`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            ))}
            <div
              style={{
                position: "absolute",
                bottom: 5,
                right: 7,
                fontSize: 7,
                color: C.textDim,
                fontFamily: C.mono,
              }}
            >
              Dallas, TX — 47 parcels
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Feature cards data ───────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1" stroke={C.accent} strokeWidth="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1" stroke={C.accent} strokeWidth="1.5" opacity=".5" />
        <rect x="3" y="14" width="7" height="7" rx="1" stroke={C.accent} strokeWidth="1.5" opacity=".5" />
        <rect x="14" y="14" width="7" height="7" rx="1" stroke={C.accent} strokeWidth="1.5" opacity=".3" />
      </svg>
    ),
    title: "AI Floor Plans",
    desc: "Generate optimized residential layouts in seconds. Import or sketch — the engine adapts to your lot constraints automatically.",
    tag: "DEVELOP",
    tagColor: C.accent,
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <path d="M12 2L2 7l10 5 10-5-10-5Z" stroke={C.secondary} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M2 17l10 5 10-5" stroke={C.secondary} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M2 12l10 5 10-5" stroke={C.secondary} strokeWidth="1.5" strokeLinecap="round" opacity=".5" />
      </svg>
    ),
    title: "7-Layer Cost Engine",
    desc: "Real-time material costing across foundation, framing, envelope, MEP, finishes, site work, and soft costs — updated as you edit.",
    tag: "EDIT",
    tagColor: C.secondary,
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <path d="M3 12h18M3 6h18M3 18h18" stroke={C.warn} strokeWidth="1.5" strokeLinecap="round" opacity=".5" />
        <rect x="8" y="4" width="4" height="4" rx="1" fill={C.warn} opacity=".8" />
        <rect x="14" y="10" width="4" height="4" rx="1" fill={C.warn} opacity=".5" />
        <rect x="6" y="16" width="4" height="4" rx="1" fill={C.warn} opacity=".3" />
      </svg>
    ),
    title: "Schedule Builder",
    desc: "Define 5-phase construction timelines with dependencies, resource allocation, and critical path — Gantt-style, no spreadsheets needed.",
    tag: "SCHEDULE",
    tagColor: C.warn,
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <path d="M12 2a7 7 0 1 0 7 7" stroke={C.success} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M13 2.05A7 7 0 0 1 19 8" stroke={C.success} strokeWidth="1.5" strokeLinecap="round" opacity=".4" />
        <circle cx="12" cy="9" r="2" fill={C.success} opacity=".7" />
        <path d="M8 20h8M10 17l2 3 2-3" stroke={C.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".6" />
      </svg>
    ),
    title: "Feasibility Analytics",
    desc: "Full pro-forma analysis — IRR, cap rate, NOI, DSCR, equity multiple. Stress-tested Monte Carlo risk simulations across 1,000 runs.",
    tag: "ANALYZE",
    tagColor: C.success,
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7z" stroke="#a78bfa" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M3 14h7v7H3z" stroke="#a78bfa" strokeWidth="1.5" strokeLinejoin="round" opacity=".4" />
      </svg>
    ),
    title: "Structural Intelligence",
    desc: "Closed-form AISC LRFD analysis — 7 W-shapes, 6 ASCE 7-22 load combos, deflection, shear, and seismic drift checks. SCI 0–10 score.",
    tag: "INTELLIGENT",
    tagColor: "#a78bfa",
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" stroke="#f472b6" strokeWidth="1.5" opacity=".4" />
        <path d="M12 6v6l4 2" stroke="#f472b6" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4.5 12H3M21 12h-1.5M12 4.5V3M12 21v-1.5" stroke="#f472b6" strokeWidth="1.2" strokeLinecap="round" opacity=".4" />
      </svg>
    ),
    title: "Executive Reports",
    desc: "One-click executive dashboards with market comparables, valuation models, and risk summaries — ready for investor presentations.",
    tag: "REPORT",
    tagColor: "#f472b6",
  },
];

// ─── Workflow steps ───────────────────────────────────────────────────────────
const WORKFLOW = [
  {
    num: "01",
    label: "DEVELOP",
    title: "Generate your floor plan",
    desc: "AI-assisted plan generation from lot dimensions. Drag rooms, set setbacks, define program — all in a browser-based editor.",
    color: C.accent,
  },
  {
    num: "02",
    label: "EDIT",
    title: "Configure every layer",
    desc: "Drill into each of 7 building layers. Select materials, swap structural systems, and watch your cost model update in real time.",
    color: C.secondary,
  },
  {
    num: "03",
    label: "SCHEDULE",
    title: "Build the timeline",
    desc: "Map construction phases, set durations, assign resources. Identify critical path constraints before breaking ground.",
    color: C.warn,
  },
  {
    num: "04",
    label: "ANALYZE",
    title: "Run feasibility",
    desc: "Pro-forma, risk simulation, and market valuation in one click. Export executive-ready reports for lenders and investors.",
    color: C.success,
  },
];

// ─── Stats ────────────────────────────────────────────────────────────────────
const STATS = [
  { value: "7", suffix: "", label: "Building layers analyzed per plan" },
  { value: "1K", suffix: "+", label: "Monte Carlo risk simulations" },
  { value: "100", suffix: "+", label: "Dallas market comparables" },
  { value: "6", suffix: "", label: "ASCE 7-22 load combinations" },
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const heroH1Ref = useRef(null);
  const heroSubRef = useRef(null);
  const heroCTARef = useRef(null);
  const workflowRef = useRef(null);
  const featuresRef = useRef(null);
  const statsRef = useRef(null);
  const ctaRef = useRef(null);
  const [activeWorkflow, setActiveWorkflow] = useState(0);
  const [hoveredCard, setHoveredCard] = useState(null);

  // ── Hero entrance ──
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(heroH1Ref.current, { y: 40, opacity: 0, duration: 1.0 })
        .from(heroSubRef.current, { y: 24, opacity: 0, duration: 0.7 }, "-=0.5")
        .from(heroCTARef.current, { y: 20, opacity: 0, duration: 0.6 }, "-=0.4");
    });
    return () => ctx.revert();
  }, []);

  // ── Scroll reveals ──
  useEffect(() => {
    const ctx = gsap.context(() => {
      // Workflow section
      gsap.from(".workflow-item", {
        x: -30,
        opacity: 0,
        duration: 0.6,
        stagger: 0.15,
        ease: "power2.out",
        scrollTrigger: {
          trigger: workflowRef.current,
          start: "top 75%",
        },
      });

      // Feature cards
      gsap.from(".feature-card", {
        y: 40,
        opacity: 0,
        duration: 0.55,
        stagger: 0.1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: featuresRef.current,
          start: "top 80%",
        },
      });

      // Stats
      gsap.from(".stat-item", {
        y: 30,
        opacity: 0,
        duration: 0.6,
        stagger: 0.12,
        ease: "power2.out",
        scrollTrigger: {
          trigger: statsRef.current,
          start: "top 80%",
        },
      });

      // Section headings
      gsap.utils.toArray(".section-heading").forEach((el) => {
        gsap.from(el, {
          y: 30,
          opacity: 0,
          duration: 0.7,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 85%" },
        });
      });

      // CTA section
      gsap.from(".cta-inner", {
        scale: 0.96,
        opacity: 0,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: { trigger: ctaRef.current, start: "top 80%" },
      });
    });

    return () => ctx.revert();
  }, []);

  // Auto-cycle workflow tabs
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveWorkflow((p) => (p + 1) % WORKFLOW.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // ── Styles ──
  const s = {
    page: {
      background: C.bg,
      minHeight: "100vh",
      fontFamily: C.sans,
      color: C.text,
      overflowX: "hidden",
    },
    // Nav
    nav: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      height: 60,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 48px",
      background: "rgba(13,17,23,0.85)",
      backdropFilter: "blur(16px)",
      borderBottom: "1px solid rgba(30,45,69,0.6)",
    },
    navLogo: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      cursor: "pointer",
    },
    navLinks: {
      display: "flex",
      alignItems: "center",
      gap: 32,
    },
    navLink: {
      fontSize: 13,
      fontWeight: 500,
      color: C.text,
      cursor: "pointer",
      background: "none",
      border: "none",
      fontFamily: C.sans,
      transition: "color 0.15s",
      padding: 0,
    },
    navCTAs: {
      display: "flex",
      alignItems: "center",
      gap: 10,
    },
    btnOutline: {
      padding: "8px 18px",
      background: "transparent",
      border: `1px solid ${C.cardBorder}`,
      borderRadius: 6,
      color: C.text,
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
      fontFamily: C.sans,
      transition: "border-color 0.15s, color 0.15s",
    },
    btnPrimary: {
      padding: "8px 20px",
      background: C.accent,
      border: "none",
      borderRadius: 6,
      color: "#000",
      fontSize: 13,
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: C.sans,
      letterSpacing: "0.01em",
      boxShadow: "0 0 20px rgba(0,212,255,0.3)",
      transition: "box-shadow 0.2s, transform 0.15s",
    },
    // Hero
    hero: {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "140px 48px 120px",
      position: "relative",
      overflow: "hidden",
    },
    heroGlow: {
      position: "absolute",
      top: "5%",
      left: "50%",
      transform: "translateX(-50%)",
      width: 700,
      height: 700,
      background: "radial-gradient(circle, rgba(0,212,255,0.05) 0%, transparent 65%)",
      pointerEvents: "none",
    },
    heroGlow2: {
      position: "absolute",
      bottom: "5%",
      right: "15%",
      width: 500,
      height: 500,
      background: "radial-gradient(circle, rgba(59,130,246,0.04) 0%, transparent 70%)",
      pointerEvents: "none",
    },
    heroInner: {
      maxWidth: 740,
      margin: "0 auto",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
    },
    heroTag: {
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      padding: "5px 12px",
      background: C.accentDim,
      border: `1px solid rgba(0,212,255,0.25)`,
      borderRadius: 20,
      marginBottom: 24,
    },
    heroTagDot: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: C.accent,
      boxShadow: `0 0 6px ${C.accent}`,
    },
    heroTagText: {
      fontSize: 11,
      fontWeight: 600,
      color: C.accent,
      letterSpacing: "0.08em",
      fontFamily: C.mono,
    },
    heroH1: {
      fontFamily: C.serif,
      fontSize: "clamp(46px, 7vw, 88px)",
      lineHeight: 1.06,
      letterSpacing: "-0.01em",
      margin: "0 0 28px",
      fontWeight: 400,
    },
    heroAccent: {
      background: `linear-gradient(90deg, ${C.accent} 0%, #60a5fa 100%)`,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
    },
    heroSub: {
      fontSize: 17,
      lineHeight: 1.7,
      color: C.text,
      margin: "0 0 44px",
      maxWidth: 460,
      textAlign: "center",
    },
    heroCTAs: {
      display: "flex",
      gap: 14,
      alignItems: "center",
    },
    btnHeroPrimary: {
      padding: "14px 32px",
      background: C.textBright,
      border: "none",
      borderRadius: 40,
      color: C.bg,
      fontSize: 15,
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: C.sans,
      letterSpacing: "0.01em",
      transition: "opacity 0.2s, transform 0.15s",
    },
    btnHeroSecondary: {
      padding: "12px 18px",
      background: "transparent",
      border: "none",
      color: C.text,
      fontSize: 14,
      cursor: "pointer",
      fontFamily: C.sans,
      display: "flex",
      alignItems: "center",
      gap: 8,
      transition: "color 0.15s",
    },
    // Section layout
    section: {
      maxWidth: 1200,
      margin: "0 auto",
      padding: "0 48px",
    },
    sectionPad: {
      padding: "100px 0",
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: 600,
      color: C.accent,
      fontFamily: C.sans,
      marginBottom: 12,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
    },
    sectionTitle: {
      fontFamily: C.serif,
      fontSize: "clamp(28px, 3.5vw, 48px)",
      fontWeight: 400,
      color: C.textBright,
      lineHeight: 1.15,
      letterSpacing: "-0.01em",
      margin: 0,
    },
    sectionSub: {
      fontSize: 17,
      color: C.text,
      lineHeight: 1.65,
      marginTop: 14,
      maxWidth: 560,
    },
  };

  return (
    <div style={s.page}>
      {/* ── Navigation ── */}
      <nav style={s.nav}>
        <div style={s.navLogo} onClick={() => navigate("/")}>
          <img src="/VisionLogo.png" alt="Vision" style={{ height: 28, width: "auto", objectFit: "contain" }} />
        </div>
        <div style={s.navLinks}>
          {["Features", "Workflow", "Intelligence", "Pricing"].map((lbl) => (
            <button key={lbl} style={s.navLink}>
              {lbl}
            </button>
          ))}
        </div>
        <div style={s.navCTAs}>
          <button style={s.btnOutline} onClick={() => navigate("/login")}>
            Sign in
          </button>
          <button
            style={s.btnPrimary}
            onClick={() => navigate("/login")}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 0 30px rgba(0,212,255,0.5)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 0 20px rgba(0,212,255,0.3)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            Get started
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section ref={heroRef} style={s.hero}>
        <div style={s.heroGlow} />
        <div style={s.heroInner}>
          {/* Headline */}
          <h1 ref={heroH1Ref} style={s.heroH1}>
            <span style={{ display: "block", color: C.textBright }}>Real Estate,</span>
            <span style={{ display: "block", fontStyle: "italic", color: C.text }}>built for Dallas.</span>
          </h1>

          {/* Subtext */}
          <p ref={heroSubRef} style={s.heroSub}>
            Develop, edit, schedule.
          </p>

          {/* CTAs */}
          <div ref={heroCTARef} style={s.heroCTAs}>
            <button
              style={s.btnHeroPrimary}
              onClick={() => navigate("/login")}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              Get started
            </button>
            <button
              style={s.btnHeroSecondary}
              onMouseEnter={(e) => (e.currentTarget.style.color = C.textBright)}
              onMouseLeave={(e) => (e.currentTarget.style.color = C.text)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" opacity=".5" />
                <path d="M6.5 5.5l4 2.5-4 2.5V5.5z" fill="currentColor" />
              </svg>
              Watch demo
            </button>
          </div>
        </div>
      </section>

      {/* ── Stats band ── */}
      <div
        ref={statsRef}
        style={{
          borderTop: `1px solid ${C.cardBorder}`,
          borderBottom: `1px solid ${C.cardBorder}`,
          padding: "40px 48px",
          background: "#0a0f1a",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 0,
          }}
        >
          {STATS.map(({ value, suffix, label }, i) => (
            <div
              key={i}
              className="stat-item"
              style={{
                textAlign: "center",
                padding: "0 24px",
                borderRight: i < STATS.length - 1 ? `1px solid ${C.cardBorder}` : "none",
              }}
            >
              <div
                style={{
                  fontSize: 38,
                  fontWeight: 800,
                  fontFamily: C.mono,
                  color: C.accent,
                  lineHeight: 1,
                  marginBottom: 8,
                }}
              >
                {value}
                <span style={{ fontSize: 22 }}>{suffix}</span>
              </div>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Workflow section ── */}
      <section style={{ ...s.sectionPad, background: C.bg, ...DOT_BG }}>
        <div ref={workflowRef} style={s.section}>
          {/* Heading */}
          <div className="section-heading" style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={s.sectionLabel}>The workflow</div>
            <h2 style={s.sectionTitle}>
              Four steps to build
              <br />
              <span style={{ color: C.accent }}>anything.</span>
            </h2>
          </div>

          {/* Workflow grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 0,
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {WORKFLOW.map((step, i) => (
              <div
                key={i}
                className="workflow-item"
                onClick={() => setActiveWorkflow(i)}
                style={{
                  padding: "32px 28px",
                  background:
                    activeWorkflow === i
                      ? `linear-gradient(180deg, rgba(${step.color === C.accent ? "0,212,255" : step.color === C.secondary ? "59,130,246" : step.color === C.warn ? "255,159,67" : "46,213,115"},0.07) 0%, transparent 100%)`
                      : C.card,
                  borderRight: i < WORKFLOW.length - 1 ? `1px solid ${C.cardBorder}` : "none",
                  cursor: "pointer",
                  transition: "background 0.3s",
                  position: "relative",
                }}
              >
                {/* Active indicator */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: activeWorkflow === i ? step.color : "transparent",
                    transition: "background 0.3s",
                    boxShadow: activeWorkflow === i ? `0 0 12px ${step.color}` : "none",
                  }}
                />
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: C.mono,
                    color: activeWorkflow === i ? step.color : C.textDim,
                    letterSpacing: "0.1em",
                    marginBottom: 12,
                    transition: "color 0.3s",
                  }}
                >
                  {step.num} — {step.label}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: activeWorkflow === i ? C.textBright : C.text,
                    marginBottom: 10,
                    lineHeight: 1.3,
                    transition: "color 0.3s",
                  }}
                >
                  {step.title}
                </div>
                <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature cards ── */}
      <section
        style={{
          ...s.sectionPad,
          background: "#070c14",
        }}
      >
        <div ref={featuresRef} style={s.section}>
          <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 48 }}>
            <div>
              <div style={s.sectionLabel}>Capabilities</div>
              <h2 style={s.sectionTitle}>
                Everything you need
                <br />
                to build with confidence.
              </h2>
            </div>
            <p style={{ ...s.sectionSub, maxWidth: 340, marginTop: 0 }}>
              From lot acquisition to investor report — a complete development intelligence suite.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
              background: C.cardBorder,
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="feature-card"
                onMouseEnter={() => setHoveredCard(i)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{
                  padding: "32px 28px",
                  background:
                    hoveredCard === i
                      ? `linear-gradient(145deg, #0f1625 0%, #141b2d 100%)`
                      : "#0a0f1a",
                  transition: "background 0.25s",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {hoveredCard === i && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 1,
                      background: `linear-gradient(90deg, transparent, ${f.tagColor}66, transparent)`,
                    }}
                  />
                )}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: `rgba(${f.tagColor === C.accent ? "0,212,255" : f.tagColor === C.secondary ? "59,130,246" : f.tagColor === C.warn ? "255,159,67" : f.tagColor === C.success ? "46,213,115" : f.tagColor === "#a78bfa" ? "167,139,250" : "244,114,182"},0.08)`,
                    border: `1px solid rgba(${f.tagColor === C.accent ? "0,212,255" : f.tagColor === C.secondary ? "59,130,246" : f.tagColor === C.warn ? "255,159,67" : f.tagColor === C.success ? "46,213,115" : f.tagColor === "#a78bfa" ? "167,139,250" : "244,114,182"},0.15)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 18,
                  }}
                >
                  {f.icon}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: C.textBright,
                    }}
                  >
                    {f.title}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: C.mono,
                      color: f.tagColor,
                      background: `rgba(${f.tagColor === C.accent ? "0,212,255" : f.tagColor === C.secondary ? "59,130,246" : "255,159,67"},0.1)`,
                      border: `1px solid rgba(${f.tagColor === C.accent ? "0,212,255" : f.tagColor === C.secondary ? "59,130,246" : "255,159,67"},0.2)`,
                      padding: "2px 6px",
                      borderRadius: 3,
                      letterSpacing: "0.08em",
                    }}
                  >
                    {f.tag}
                  </span>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.65, color: C.textDim, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product showcase ── */}
      <section
        style={{
          ...s.sectionPad,
          background: C.bg,
          borderTop: `1px solid ${C.cardBorder}`,
        }}
      >
        <div style={s.section}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 72,
              alignItems: "center",
            }}
          >
            {/* Left — text */}
            <div className="section-heading">
              <div style={s.sectionLabel}>Built for speed</div>
              <h2 style={{ ...s.sectionTitle, marginBottom: 18 }}>
                From lot to
                <br />
                <span style={{ color: C.accent }}>bankable project.</span>
              </h2>
              <p style={{ ...s.sectionSub, maxWidth: 420 }}>
                Stop switching between spreadsheets, CAD tools, and cost estimators.
                Vision gives you a unified workspace — from first sketch to final pro forma.
              </p>
              <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { label: "Real-time cost feedback", sub: "Every material change reflects instantly across all 7 layers" },
                  { label: "AI-assisted layouts", sub: "Generate compliant floor plans from lot dimensions in seconds" },
                  { label: "Investor-ready exports", sub: "One-click executive reports with market comparables and risk analysis" },
                ].map(({ label, sub }) => (
                  <div key={label} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: C.accentDim,
                        border: `1px solid rgba(0,212,255,0.3)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l2.5 2.5L9 1" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.textBright, marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.5 }}>{sub}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                style={{ ...s.btnHeroPrimary, marginTop: 36, display: "inline-block" }}
                onClick={() => navigate("/login")}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                Start your first project →
              </button>
            </div>

            {/* Right — structural intelligence preview */}
            <div
              style={{
                background: C.card,
                border: `1px solid ${C.cardBorder}`,
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
              }}
            >
              {/* Header bar */}
              <div
                style={{
                  padding: "14px 20px",
                  borderBottom: `1px solid ${C.cardBorder}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "#0d1421",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: C.accent,
                    boxShadow: `0 0 8px ${C.accent}`,
                  }}
                />
                <span style={{ fontSize: 11, fontFamily: C.mono, color: C.text }}>
                  Structural Intelligence — W18x46 analysis
                </span>
              </div>
              <div style={{ padding: 20 }}>
                {/* SCI score */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 20,
                    padding: "14px 16px",
                    background: "#070c14",
                    border: `1px solid ${C.cardBorder}`,
                    borderRadius: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, marginBottom: 4 }}>STRUCTURAL COMPLEXITY INDEX</div>
                    <div style={{ fontSize: 32, fontWeight: 800, fontFamily: C.mono, color: C.accent, lineHeight: 1 }}>7.8</div>
                    <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, marginTop: 2 }}>/ 10.0</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, marginBottom: 4 }}>METHOD</div>
                    <div style={{ fontSize: 11, color: C.success, fontFamily: C.mono }}>Analytical</div>
                    <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, marginTop: 4 }}>CONVERGENCE</div>
                    <div style={{ fontSize: 11, color: C.success, fontFamily: C.mono }}>Exact</div>
                  </div>
                </div>

                {/* Compliance checks */}
                <div style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, marginBottom: 10 }}>CODE COMPLIANCE CHECKS</div>
                {[
                  { check: "Flexural Capacity", status: "PASS", ratio: "0.71", color: C.success },
                  { check: "Shear Capacity", status: "PASS", ratio: "0.48", color: C.success },
                  { check: "Deflection L/360", status: "PASS", ratio: "0.82", color: C.success },
                  { check: "Seismic Drift", status: "PASS", ratio: "0.61", color: C.success },
                  { check: "Wind Uplift", status: "WARN", ratio: "0.93", color: C.warn },
                  { check: "Soil Bearing", status: "PASS", ratio: "0.55", color: C.success },
                ].map(({ check, status, ratio, color }) => (
                  <div
                    key={check}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "7px 0",
                      borderBottom: `1px solid rgba(30,45,69,0.5)`,
                    }}
                  >
                    <span style={{ fontSize: 11, color: C.text }}>{check}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 10, fontFamily: C.mono, color: C.textDim }}>{ratio}</span>
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: C.mono,
                          color,
                          background: `rgba(${color === C.success ? "46,213,115" : "255,159,67"},0.1)`,
                          border: `1px solid rgba(${color === C.success ? "46,213,115" : "255,159,67"},0.25)`,
                          padding: "2px 7px",
                          borderRadius: 3,
                          letterSpacing: "0.05em",
                        }}
                      >
                        {status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section
        ref={ctaRef}
        style={{
          ...s.sectionPad,
          background: "#070c14",
          borderTop: `1px solid ${C.cardBorder}`,
        }}
      >
        <div style={s.section}>
          <div
            className="cta-inner"
            style={{
              textAlign: "center",
              padding: "72px 48px",
              background: `radial-gradient(ellipse at center, rgba(0,212,255,0.05) 0%, transparent 70%)`,
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 16,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Corner accents */}
            {[
              { top: 0, left: 0, borderTop: `1px solid ${C.accent}`, borderLeft: `1px solid ${C.accent}` },
              { top: 0, right: 0, borderTop: `1px solid ${C.accent}`, borderRight: `1px solid ${C.accent}` },
              { bottom: 0, left: 0, borderBottom: `1px solid ${C.accent}`, borderLeft: `1px solid ${C.accent}` },
              { bottom: 0, right: 0, borderBottom: `1px solid ${C.accent}`, borderRight: `1px solid ${C.accent}` },
            ].map((corner, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  width: 24,
                  height: 24,
                  ...corner,
                  opacity: 0.5,
                }}
              />
            ))}

            <h2
              style={{
                fontFamily: C.serif,
                fontSize: "clamp(32px, 4vw, 56px)",
                fontWeight: 400,
                color: C.textBright,
                letterSpacing: "-0.01em",
                lineHeight: 1.15,
                margin: "0 0 18px",
              }}
            >
              Ready to analyze your
              <br />
              <span style={{ fontStyle: "italic", color: C.text }}>first project?</span>
            </h2>
            <p style={{ fontSize: 17, color: C.text, maxWidth: 480, margin: "0 auto 4px" }}>
              Join developers using Vision to analyze Dallas parcels faster, model costs accurately, and back every decision with data.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 32 }}>
              <button
                style={{ ...s.btnHeroPrimary, fontSize: 16, padding: "15px 36px" }}
                onClick={() => navigate("/login")}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                Start for free →
              </button>
              <button
                style={{ ...s.btnHeroSecondary, fontSize: 15, padding: "15px 28px" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.textBright)}
                onMouseLeave={(e) => (e.currentTarget.style.color = C.text)}
              >
                View documentation
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          borderTop: `1px solid ${C.cardBorder}`,
          padding: "40px 48px",
          background: "#070c14",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img src="/VisionLogo.png" alt="Vision" style={{ height: 22, opacity: 0.6 }} />
          </div>
          <div style={{ display: "flex", gap: 28 }}>
            {["Privacy", "Terms", "Docs", "Contact"].map((l) => (
              <span
                key={l}
                style={{ fontSize: 12, color: C.textDim, cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.text)}
                onMouseLeave={(e) => (e.currentTarget.style.color = C.textDim)}
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
