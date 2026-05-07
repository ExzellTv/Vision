import { useState } from "react";
import { colors, fonts, radii } from "../../theme/tokens";
import useBreakpoint from "../../hooks/useBreakpoint";

// DEMO MODE: Mock user when Clerk is unavailable
const DEMO_USER = {
  fullName: "Demo User",
  firstName: "Demo",
  lastName: "User",
  username: "demo_vision",
  primaryEmailAddress: { emailAddress: "demo@vision.app" },
  createdAt: new Date("2025-01-15").toISOString(),
  imageUrl: null,
  passwordEnabled: true,
  twoFactorEnabled: false,
  externalAccounts: [
    { id: "google-1", provider: "google", emailAddress: "demo@gmail.com" },
  ],
};

// In demo mode (no Clerk), just return null
function useClerkSafe() {
  return { user: null, clerk: null };
}

// ── Reusable row inside a card ────────────────────────────────────────────

function SettingRow({ label, value, mono = false, last = false, isMobile = false }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 0",
        borderBottom: last ? "none" : `1px solid ${colors.panelBorder}`,
        gap: 16,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: colors.textDim,
          fontFamily: fonts.label,
          flexShrink: 0,
          minWidth: isMobile ? 100 : 140,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 14,
          color: value ? colors.textBright : colors.textDim,
          fontFamily: mono ? fonts.data : fonts.label,
          fontStyle: value ? "normal" : "italic",
          textAlign: "right",
          wordBreak: "break-all",
        }}
      >
        {value || "—"}
      </span>
    </div>
  );
}

// ── Section card wrapper ──────────────────────────────────────────────────

function Card({ title, subtitle, children }) {
  return (
    <div
      style={{
        background: colors.cardSurface,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: radii.xl,
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      {(title || subtitle) && (
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${colors.panelBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            {title && (
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.textBright, fontFamily: fonts.label }}>
                {title}
              </div>
            )}
            {subtitle && (
              <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2, fontFamily: fonts.label }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ padding: "0 20px" }}>{children}</div>
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────

function Pill({ green, children }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        fontFamily: fonts.label,
        background: green ? colors.successDim : colors.warnDim,
        color: green ? colors.success : colors.warn,
        border: `1px solid ${green ? "rgba(46,213,115,0.25)" : "rgba(255,159,67,0.25)"}`,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: green ? colors.success : colors.warn }} />
      {children}
    </span>
  );
}

// ── Action button ─────────────────────────────────────────────────────────

function ActionBtn({ onClick, children, danger = false, fullWidth = false }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: fullWidth ? "10px 0" : "8px 18px",
        width: fullWidth ? "100%" : undefined,
        background: danger
          ? hov ? colors.dangerDim : "transparent"
          : hov ? colors.accentDim : "transparent",
        border: `1px solid ${danger ? "rgba(255,71,87,0.3)" : "rgba(0,212,255,0.25)"}`,
        borderRadius: radii.lg,
        color: danger ? colors.danger : colors.accent,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: fonts.label,
        cursor: "pointer",
        letterSpacing: "0.04em",
        transition: "background 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ── Sidebar tab button ────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon, label, isMobile = false }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: isMobile ? "center" : "flex-start",
        gap: isMobile ? 6 : 10,
        width: isMobile ? "auto" : "100%",
        flex: isMobile ? 1 : undefined,
        padding: isMobile ? "12px 8px" : "10px 14px",
        background: active ? "rgba(0,212,255,0.08)" : hov ? "rgba(255,255,255,0.03)" : "transparent",
        border: "none",
        borderRadius: isMobile ? 0 : radii.lg,
        borderLeft: isMobile ? "none" : (active ? `2px solid ${colors.accent}` : "2px solid transparent"),
        borderBottom: isMobile ? (active ? `2px solid ${colors.accent}` : "2px solid transparent") : "none",
        color: active ? colors.accent : hov ? colors.text : colors.textDim,
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        fontFamily: fonts.label,
        cursor: "pointer",
        textAlign: "center",
        transition: "all 0.13s",
        marginBottom: isMobile ? 0 : 2,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ opacity: active ? 1 : 0.6 }}>{icon}</span>
      {label}
    </button>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────

const Icons = {
  profile: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 13c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  security: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 1.5L2 4v4c0 3 2.5 5.5 5.5 6.5C10.5 13.5 13 11 13 8V4L7.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5 7.5l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  connections: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="3" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="3" r="2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 7.5h2.5M7.5 7.5L10 3.8M7.5 7.5L10 11.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
};

// ── Tab content ───────────────────────────────────────────────────────────

function ProfileTab({ user, openManage, isMobile }) {
  const displayName = user?.fullName || user?.firstName || "—";
  const firstName = user?.firstName || "";
  const lastName = user?.lastName || "";
  const email = user?.primaryEmailAddress?.emailAddress || "—";
  const username = user?.username || "—";
  const createdAt = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "—";
  const avatarUrl = user?.imageUrl;
  const initials = displayName
    .split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      {/* Avatar + identity */}
      <Card title="Identity">
        <div
          style={{
            display: "flex",
            alignItems: isMobile ? "flex-start" : "center",
            gap: 20,
            padding: "20px 0",
            borderBottom: `1px solid ${colors.panelBorder}`,
            flexDirection: isMobile ? "column" : "row",
          }}
        >
          {/* Top row: avatar + name info + desktop button */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, width: "100%" }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: `2px solid ${colors.cardBorder}`,
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#fff",
                  border: `2px solid ${colors.cardBorder}`,
                  flexShrink: 0,
                  fontFamily: fonts.label,
                }}
              >
                {initials}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: colors.textBright, fontFamily: fonts.label, letterSpacing: "-0.2px" }}>
                {displayName}
              </div>
              <div style={{ fontSize: 13, color: colors.textDim, marginTop: 3, fontFamily: fonts.label }}>
                {email}
              </div>
              <div style={{ fontSize: 11, color: colors.textDim, marginTop: 6, fontFamily: fonts.label, opacity: 0.7 }}>
                Member since {createdAt}
              </div>
            </div>
            {/* Desktop: button inline in the row */}
            {!isMobile && <ActionBtn onClick={openManage}>Edit Profile</ActionBtn>}
          </div>
          {/* Mobile: full-width button below */}
          {isMobile && <ActionBtn onClick={openManage} fullWidth>Edit Profile</ActionBtn>}
        </div>
        <SettingRow label="First Name" value={firstName} isMobile={isMobile} />
        <SettingRow label="Last Name" value={lastName} isMobile={isMobile} />
        <SettingRow label="Username" value={username} mono isMobile={isMobile} />
        <SettingRow label="Email Address" value={email} mono last isMobile={isMobile} />
      </Card>
    </>
  );
}

function SecurityTab({ user, openManage, isMobile }) {
  const hasPw = user?.passwordEnabled;
  const mfaEnabled = user?.twoFactorEnabled;

  return (
    <>
      <Card title="Password" subtitle="Manage your account password">
        <div style={{
          display: "flex",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: isMobile ? "flex-start" : "space-between",
          flexDirection: isMobile ? "column" : "row",
          gap: isMobile ? 12 : 0,
          padding: "16px 0"
        }}>
          <div>
            <div style={{ fontSize: 14, color: colors.textBright, fontFamily: fonts.label, fontWeight: 500 }}>
              {hasPw ? "Password set" : "No password set"}
            </div>
            <div style={{ fontSize: 11, color: colors.textDim, marginTop: 3, fontFamily: fonts.label }}>
              {hasPw ? "Your account uses password authentication." : "Sign in via a connected provider only."}
            </div>
          </div>
          <ActionBtn onClick={openManage}>{hasPw ? "Change Password" : "Set Password"}</ActionBtn>
        </div>
      </Card>

      <Card title="Two-Factor Authentication" subtitle="Add an extra layer of security">
        <div style={{
          display: "flex",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: isMobile ? "flex-start" : "space-between",
          flexDirection: isMobile ? "column" : "row",
          gap: isMobile ? 12 : 0,
          padding: "16px 0"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, color: colors.textBright, fontFamily: fonts.label, fontWeight: 500, marginBottom: 4 }}>
                Authenticator app
              </div>
              <Pill green={mfaEnabled}>{mfaEnabled ? "Enabled" : "Disabled"}</Pill>
            </div>
          </div>
          <ActionBtn onClick={openManage}>{mfaEnabled ? "Manage 2FA" : "Enable 2FA"}</ActionBtn>
        </div>
      </Card>

      <Card title="Active Sessions" subtitle="Devices currently signed in to your account">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0" }}>
          <div>
            <div style={{ fontSize: 14, color: colors.textBright, fontFamily: fonts.label, fontWeight: 500 }}>
              Current session
            </div>
            <div style={{ fontSize: 11, color: colors.textDim, marginTop: 3, fontFamily: fonts.label }}>
              This device &bull; Active now
            </div>
          </div>
          <Pill green>Active</Pill>
        </div>
      </Card>
    </>
  );
}

function ConnectionsTab({ user, openManage, isMobile }) {
  const accounts = user?.externalAccounts || [];

  const PROVIDER_META = {
    google: { label: "Google", color: "#4285F4" },
    github: { label: "GitHub", color: "#f1f5f9" },
    apple: { label: "Apple", color: "#f1f5f9" },
    microsoft: { label: "Microsoft", color: "#00a1f1" },
    facebook: { label: "Facebook", color: "#1877f2" },
  };

  return (
    <>
      <Card
        title="Connected Accounts"
        subtitle="OAuth providers linked to your Vision account"
      >
        {accounts.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: colors.textDim, fontSize: 13, fontFamily: fonts.label }}>
            No connected accounts
          </div>
        ) : (
          accounts.map((acct, i) => {
            const meta = PROVIDER_META[acct.provider] || { label: acct.provider, color: colors.accent };
            return (
              <div
                key={acct.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 0",
                  borderBottom: i < accounts.length - 1 ? `1px solid ${colors.panelBorder}` : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${colors.cardBorder}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: meta.color,
                      fontFamily: fonts.data,
                      flexShrink: 0,
                    }}
                  >
                    {meta.label.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.textBright, fontFamily: fonts.label }}>
                      {meta.label}
                    </div>
                    <div style={{ fontSize: 11, color: colors.textDim, fontFamily: fonts.label, marginTop: 1 }}>
                      {acct.emailAddress || acct.username || "Connected"}
                    </div>
                  </div>
                </div>
                <Pill green>Connected</Pill>
              </div>
            );
          })
        )}
        <div style={{ paddingBottom: 16, paddingTop: accounts.length > 0 ? 12 : 0 }}>
          <ActionBtn onClick={openManage}>Manage Connections</ActionBtn>
        </div>
      </Card>
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────

const TABS = [
  { id: "profile", label: "Profile", icon: Icons.profile },
  { id: "security", label: "Security", icon: Icons.security },
  { id: "connections", label: "Connections", icon: Icons.connections },
];

export default function SettingsScreen() {
  const { user: clerkUser, clerk } = useClerkSafe();
  const user = clerkUser || DEMO_USER;
  const [tab, setTab] = useState("profile");
  const isMobile = useBreakpoint(768);

  function openManage() {
    if (clerk?.openUserProfile) {
      clerk.openUserProfile();
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        height: "100%",
        background: colors.bg,
        overflow: "hidden",
        overflowX: "hidden",
        fontFamily: fonts.label,
      }}
    >
      {/* Sidebar / mobile tab bar */}
      <div
        style={{
          width: isMobile ? "100%" : 220,
          flexShrink: 0,
          borderRight: isMobile ? "none" : `1px solid ${colors.panelBorder}`,
          borderBottom: isMobile ? `1px solid ${colors.panelBorder}` : "none",
          padding: isMobile ? "0 8px" : "28px 16px",
          display: "flex",
          flexDirection: isMobile ? "row" : "column",
          gap: isMobile ? 0 : 2,
          overflowX: isMobile ? "auto" : "visible",
        }}
      >
        {!isMobile && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: colors.textDim,
              paddingLeft: 14,
              marginBottom: 10,
              fontFamily: fonts.label,
            }}
          >
            Settings
          </div>
        )}
        {TABS.map((t) => (
          <TabBtn
            key={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
            icon={t.icon}
            label={t.label}
            isMobile={isMobile}
          />
        ))}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: isMobile ? "16px 16px" : "28px 32px",
        }}
      >
        <div style={{ maxWidth: 680, width: "100%" }}>
          {/* Page header */}
          <div style={{ marginBottom: 24 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                color: colors.textBright,
                fontFamily: fonts.label,
                letterSpacing: "-0.3px",
              }}
            >
              {TABS.find((t) => t.id === tab)?.label}
            </h1>
            <p
              style={{
                margin: "5px 0 0",
                fontSize: 13,
                color: colors.textDim,
                fontFamily: fonts.label,
              }}
            >
              {tab === "profile" && "Your personal information and identity."}
              {tab === "security" && "Password, two-factor auth, and active sessions."}
              {tab === "connections" && "OAuth providers linked to your account."}
            </p>
          </div>

          {tab === "profile" && <ProfileTab user={user} openManage={openManage} isMobile={isMobile} />}
          {tab === "security" && <SecurityTab user={user} openManage={openManage} isMobile={isMobile} />}
          {tab === "connections" && <ConnectionsTab user={user} openManage={openManage} isMobile={isMobile} />}
        </div>
      </div>
    </div>
  );
}
