import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { colors, fonts } from "../../theme/tokens";
import { useUserType } from "../../context/UserTypeContext";
import { useBuilderStore } from "../../context/BuilderContext";
import { chatApi } from "../../services/api";

const CHAT_SEEN_KEY_HO = "vision:chat:last_seen:homeowner";
const CHAT_SEEN_KEY_BD = "vision:chat:last_seen:builder";

const LOGO = "/SpecialLogo.png";

const HOMEOWNER_LINKS = [
  { label: "Dashboard", path: "/dashboard", match: ["/dashboard"] },
  { label: "Projects", path: "/projects", match: ["/projects", "/develop", "/edit", "/preview3d", "/schedule", "/feasibility", "/executive"] },
  { label: "Browse", path: "/browse", match: ["/browse"] },
  { label: "Chat", path: "/chat", match: ["/chat"] },
];

const BUILDER_LINKS = [
  { label: "Dashboard", path: "/builderdashboard", match: ["/builderdashboard"] },
  { label: "Requests", path: "/builderrequests", match: ["/builderrequests"] },
  { label: "Chat", path: "/builderchat", match: ["/builderchat"] },
  { label: "Reviews", path: "/builderreviews", match: ["/builderreviews"] },
];

export default function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isHomeowner, isBuilder, clearUserType } = useUserType();
  const { projects: builderProjects = [] } = useBuilderStore();
  const pendingCount = builderProjects.filter(p => p.status === "New Request").length;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(false);
  const dropdownRef = useRef(null);
  const chatPollRef = useRef(null);

  const isActive = (link) => link.match.includes(location.pathname);

  const chatPath = isBuilder ? "/builderchat" : "/chat";
  const onChatPage = location.pathname === chatPath;
  const seenKey = isBuilder ? CHAT_SEEN_KEY_BD : CHAT_SEEN_KEY_HO;

  // Clear dot the moment user lands on their chat page
  useEffect(() => {
    if (onChatPage) setChatUnread(false);
  }, [onChatPage]);

  // Poll every 10s when off chat page — compare server timestamps only
  useEffect(() => {
    if (onChatPage) return;
    const check = async () => {
      try {
        const convs = await chatApi.listConversations();
        const lastSeenMs = parseInt(localStorage.getItem(seenKey) || "0", 10);
        const latestMsgMs = convs.reduce((max, c) => {
          const t = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
          return t > max ? t : max;
        }, 0);
        setChatUnread(latestMsgMs > 0 && latestMsgMs > lastSeenMs);
      } catch (_) {}
    };
    check();
    chatPollRef.current = setInterval(check, 10000);
    return () => clearInterval(chatPollRef.current);
  }, [onChatPage, seenKey]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const displayName = isHomeowner ? "Homeowner" : isBuilder ? "Builder" : "Demo User";
  const displayEmail = isHomeowner ? "Designing your dream home" : isBuilder ? "Professional builder mode" : "demo@vision.app";
  const initials = isHomeowner ? "HO" : isBuilder ? "BD" : "DU";

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 52,
        padding: "0 28px",
        background: "rgba(13,17,23,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: `1px solid ${colors.panelBorder}`,
        fontFamily: fonts.label,
        flexShrink: 0,
        zIndex: 100,
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
          minWidth: 110,
        }}
      >
        <img
          src={LOGO}
          alt="Vision"
          style={{ height: 26, width: "auto", objectFit: "contain", display: "block" }}
          onError={(e) => {
            e.target.style.display = "none";
            e.target.parentElement.insertAdjacentHTML("beforeend",
              `<span style="font-family:'DM Serif Display',Georgia,serif;font-style:italic;font-size:18px;color:${colors.textBright};letter-spacing:0.02em">Vision</span>`
            );
          }}
        />
      </div>

      {/* Nav links */}
      <div style={{ display: "flex", alignItems: "stretch", height: "100%", gap: 2 }}>
        {(isBuilder ? BUILDER_LINKS : HOMEOWNER_LINKS).map((link) => {
          const active = isActive(link);
          return (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              style={{
                background: "none",
                border: "none",
                borderBottom: active ? `2px solid ${colors.accent}` : "2px solid transparent",
                padding: "0 16px",
                color: active ? colors.textBright : colors.textDim,
                fontFamily: fonts.label,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                letterSpacing: "0.2px",
                transition: "color 0.2s ease, border-color 0.2s ease",
                marginBottom: -1,
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.color = colors.text;
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.color = colors.textDim;
              }}
            >
              <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                {link.label}
                {link.label === "Requests" && pendingCount > 0 && (
                  <span style={{
                    position: "absolute", top: -6, right: -10,
                    width: 7, height: 7, borderRadius: "50%",
                    background: "#ef4444",
                    boxShadow: "0 0 6px rgba(239,68,68,0.7)",
                  }} />
                )}
                {link.label === "Chat" && chatUnread && (
                  <span style={{
                    position: "absolute", top: -6, right: -10,
                    width: 7, height: 7, borderRadius: "50%",
                    background: "#ef4444",
                    boxShadow: "0 0 6px rgba(239,68,68,0.7)",
                  }} />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* User profile */}
      <div
        ref={dropdownRef}
        style={{ position: "relative", minWidth: 110, display: "flex", justifyContent: "flex-end" }}
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
            <div style={{ fontSize: 12, fontWeight: 600, color: colors.textBright, lineHeight: 1.3 }}>
              {displayName}
            </div>
            <div style={{
              fontSize: 10,
              color: colors.textDim,
              letterSpacing: "0.3px",
              lineHeight: 1.3,
              maxWidth: 150,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {displayEmail}
            </div>
          </div>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "#fff",
              border: `2px solid ${colors.cardBorder}`,
              flexShrink: 0,
              fontFamily: fonts.label,
            }}
          >
            {initials}
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            style={{
              flexShrink: 0,
              transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
              opacity: 0.4,
            }}
          >
            <path d="M2 4l4 4 4-4" stroke={colors.textDim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Dropdown */}
        {dropdownOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              background: colors.cardSurface,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: 10,
              minWidth: 200,
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              zIndex: 9999,
              overflow: "hidden",
              animation: "fadeIn 0.15s ease",
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${colors.cardBorder}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.textBright }}>{displayName}</div>
              <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>{displayEmail}</div>
            </div>

            <button
              onClick={() => { navigate("/settings"); setDropdownOpen(false); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "11px 16px",
                background: "none",
                border: "none",
                color: colors.text,
                fontSize: 13,
                fontFamily: fonts.label,
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="2" stroke={colors.textDim} strokeWidth="1.3" />
                <path d="M7 1v1M7 12v1M1 7h1M12 7h1M2.9 2.9l.7.7M10.4 10.4l.7.7M2.9 11.1l.7-.7M10.4 3.6l.7-.7" stroke={colors.textDim} strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              Account Settings
            </button>

            <div style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
              <button
                onClick={() => { clearUserType(); navigate("/"); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "11px 16px",
                  background: "none",
                  border: "none",
                  color: colors.danger,
                  fontSize: 13,
                  fontFamily: fonts.label,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,71,87,0.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2M9 10l3-3-3-3M12 7H5" stroke={colors.danger} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
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
