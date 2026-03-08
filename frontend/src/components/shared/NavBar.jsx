import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUser, useClerk } from "@clerk/clerk-react";
import { colors, fonts } from "../../theme/tokens";

const LOGO = "/VisionLogo.png";

const NAV_LINKS = [
  { label: "Dashboard", path: "/dashboard", match: ["/dashboard"] },
  { label: "Projects", path: "/projects", match: ["/projects"] },
  { label: "Plan", path: "/develop", match: ["/develop"] },
  { label: "Schedule", path: "/schedule", match: ["/schedule"] },
  { label: "Intelligence", path: "/structural", match: ["/structural", "/executive"] },
  { label: "Analysis", path: "/feasibility", match: ["/feasibility"] },
];

export default function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const isActive = (link) => link.match.includes(location.pathname);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const displayName = user?.fullName || user?.firstName || user?.username || "User";
  const displayEmail = user?.primaryEmailAddress?.emailAddress || "";
  const avatarUrl = user?.imageUrl;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

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
        onClick={() => navigate("/dashboard")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          minWidth: 120,
        }}
      >
        <img
          src={LOGO}
          alt="Vision"
          style={{ height: 28, width: "auto", objectFit: "contain", display: "block" }}
        />
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
        ref={dropdownRef}
        style={{ position: "relative", minWidth: 120, display: "flex", justifyContent: "flex-end" }}
      >
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 6px",
            borderRadius: 8,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.textBright, lineHeight: 1.3 }}>
              {displayName}
            </div>
            <div
              style={{
                fontSize: 10,
                color: colors.textDim,
                letterSpacing: "0.4px",
                lineHeight: 1.3,
                maxWidth: 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayEmail}
            </div>
          </div>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                objectFit: "cover",
                border: `2px solid ${colors.cardBorder}`,
                flexShrink: 0,
              }}
            />
          ) : (
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
              {initials}
            </div>
          )}
          {/* Chevron */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            style={{
              flexShrink: 0,
              transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
              opacity: 0.5,
            }}
          >
            <path d="M2 4l4 4 4-4" stroke={colors.textDim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {dropdownOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              background: "#1a2233",
              border: `1px solid #2a3548`,
              borderRadius: 10,
              minWidth: 200,
              boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
              zIndex: 9999,
              overflow: "hidden",
            }}
          >
            {/* User info header */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #2a3548" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{displayName}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{displayEmail}</div>
            </div>

            {/* Menu items */}
            {[
              {
                label: "Account Settings",
                icon: (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="2" stroke="#94a3b8" strokeWidth="1.3" />
                    <path d="M7 1v1M7 12v1M1 7h1M12 7h1M2.9 2.9l.7.7M10.4 10.4l.7.7M2.9 11.1l.7-.7M10.4 3.6l.7-.7" stroke="#94a3b8" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                ),
                action: () => { navigate("/settings"); setDropdownOpen(false); },
              },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "11px 16px",
                  background: "none",
                  border: "none",
                  color: "#c8d0e0",
                  fontSize: 13,
                  fontFamily: fonts.label,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                {item.icon}
                {item.label}
              </button>
            ))}

            <div style={{ borderTop: "1px solid #2a3548" }}>
              <button
                onClick={() => signOut({ redirectUrl: "/" })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "11px 16px",
                  background: "none",
                  border: "none",
                  color: "#ff4757",
                  fontSize: 13,
                  fontFamily: fonts.label,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,71,87,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2M9 10l3-3-3-3M12 7H5" stroke="#ff4757" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
