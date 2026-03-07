import { useNavigate, useLocation } from "react-router-dom";
import { colors, fonts } from "../../theme/tokens";

const NAV_LINKS = [
  { label: "Dashboard", path: "/", match: ["/"] },
  {
    label: "Projects",
    path: "/develop",
    match: ["/develop", "/edit", "/schedule"],
  },
  {
    label: "Analysis",
    path: "/feasibility",
    match: ["/feasibility"],
  },
  {
    label: "Intelligence",
    path: "/structural",
    match: ["/structural", "/executive"],
  },
];

function EyeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle
        cx="11"
        cy="11"
        r="10"
        fill="rgba(0,212,255,0.12)"
        stroke={colors.accent}
        strokeWidth="1.2"
      />
      <ellipse cx="11" cy="11" rx="5" ry="3" stroke={colors.accent} strokeWidth="1.2" fill="none" />
      <circle cx="11" cy="11" r="2" fill={colors.accent} />
    </svg>
  );
}

export default function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (link) => link.match.includes(location.pathname);

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 56,
        padding: "0 32px",
        background: colors.bg,
        borderBottom: `1px solid ${colors.panelBorder}`,
        fontFamily: fonts.label,
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        onClick={() => navigate("/")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          minWidth: 120,
        }}
      >
        <EyeIcon />
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: colors.textBright,
            letterSpacing: "0.3px",
          }}
        >
          Vision
        </span>
      </div>

      {/* Nav links */}
      <div style={{ display: "flex", alignItems: "stretch", height: "100%", gap: 0 }}>
        {NAV_LINKS.map((link) => {
          const active = isActive(link);
          return (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              style={{
                background: "none",
                border: "none",
                borderBottom: active ? `2px solid ${colors.accent}` : "2px solid transparent",
                padding: "0 18px",
                color: active ? colors.textBright : colors.textDim,
                fontFamily: fonts.label,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                letterSpacing: "0.1px",
                transition: "color 0.15s ease, border-color 0.15s ease",
                marginBottom: "-1px",
              }}
            >
              {link.label}
            </button>
          );
        })}
      </div>

      {/* User profile */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 120,
          justifyContent: "flex-end",
        }}
      >
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textBright, lineHeight: 1.3 }}>
            Alex Sterling
          </div>
          <div
            style={{
              fontSize: 10,
              color: colors.textDim,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              lineHeight: 1.3,
            }}
          >
            Sr. Developer
          </div>
        </div>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color: "#fff",
            border: `2px solid ${colors.cardBorder}`,
            flexShrink: 0,
          }}
        >
          AS
        </div>
      </div>
    </nav>
  );
}
