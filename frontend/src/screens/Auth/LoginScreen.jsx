import { useState } from "react";
import { useSignIn, useSignUp } from "@clerk/clerk-react";

// ── Icons ───────────────────────────────────────────────────────────────────

function VisionLogo() {
  return (
    <img
      src="/VisionLogo.png"
      alt="Vision"
      style={{ height: 80, width: "auto", objectFit: "contain", marginBottom: 24 }}
    />
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.6 7.3-17.3z" />
      <path fill="#34A853" d="M24 48c6.5 0 12-2.2 16-5.9l-7.9-6c-2.2 1.5-5 2.3-8.1 2.3-6.2 0-11.5-4.2-13.4-9.9H2.4v6.2C6.4 42.5 14.7 48 24 48z" />
      <path fill="#FBBC05" d="M10.6 28.5c-.5-1.5-.8-3-.8-4.5s.3-3 .8-4.5v-6.2H2.4C.9 16.5 0 20.1 0 24s.9 7.5 2.4 10.7l8.2-6.2z" />
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.9 2.3 30.4 0 24 0 14.7 0 6.4 5.5 2.4 13.3l8.2 6.2C12.5 13.7 17.8 9.5 24 9.5z" />
    </svg>
  );
}

// ── Shared input style ───────────────────────────────────────────────────────

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  background: "#0d1526",
  border: "1px solid #1e3048",
  borderRadius: 8,
  color: "#c8d0e0",
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "'Inter', sans-serif",
  transition: "border-color 0.15s",
};

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  color: "#5a6580",
  marginBottom: 8,
  fontFamily: "'Inter', sans-serif",
};

// ── Main component ───────────────────────────────────────────────────────────

export default function LoginScreen() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup" | "verify"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusField, setFocusField] = useState(null);

  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();

  async function handleGoogleAuth() {
    if (!signInLoaded) return;
    setError("");
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: `${window.location.origin}/sso-callback`,
        redirectUrlComplete: "/",
      });
    } catch (err) {
      setError(err.errors?.[0]?.message || "Google sign-in failed");
    }
  }

  async function handleSignIn(e) {
    e.preventDefault();
    if (!signInLoaded) return;
    setLoading(true);
    setError("");
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await setSignInActive({ session: result.createdSessionId });
      }
    } catch (err) {
      setError(err.errors?.[0]?.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    if (!signUpLoaded) return;
    setLoading(true);
    setError("");
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setMode("verify");
    } catch (err) {
      setError(err.errors?.[0]?.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    if (!signUpLoaded) return;
    setLoading(true);
    setError("");
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setSignUpActive({ session: result.createdSessionId });
      }
    } catch (err) {
      setError(err.errors?.[0]?.message || "Invalid verification code");
    } finally {
      setLoading(false);
    }
  }

  const isSignIn = mode === "signin";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0b1120",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        background: "#0f1929",
        borderRadius: 20,
        border: "1px solid #1a2d45",
        padding: "40px 36px 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>

        {/* Logo */}
        <VisionLogo />

        {/* Heading */}
        <h1 style={{
          margin: "0 0 8px",
          fontSize: 26,
          fontWeight: 700,
          color: "#f0f4ff",
          letterSpacing: "-0.3px",
          textAlign: "center",
        }}>
          {mode === "verify" ? "Check your email" : "Welcome to Vision"}
        </h1>

        {/* Subtitle */}
        <p style={{
          margin: "0 0 28px",
          fontSize: 15,
          color: "#6b7a99",
          textAlign: "center",
          lineHeight: 1.5,
        }}>
          {mode === "verify"
            ? `We sent a 6-digit code to ${email}`
            : "The intelligent property management engine."}
        </p>

        {/* ── Verify mode ─────────────────────────────────── */}
        {mode === "verify" && (
          <form onSubmit={handleVerify} style={{ width: "100%" }}>
            <label style={labelStyle}>VERIFICATION CODE</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="000000"
              style={{
                ...inputStyle,
                marginBottom: 20,
                borderColor: focusField === "code" ? "#3b82f6" : "#1e3048",
                letterSpacing: "0.3em",
                fontSize: 20,
                textAlign: "center",
              }}
              onFocus={() => setFocusField("code")}
              onBlur={() => setFocusField(null)}
            />
            {error && <ErrorMsg text={error} />}
            <SubmitButton loading={loading} label="Verify Email →" />
            <FooterLink
              text="Wrong email?"
              linkText="Go back"
              onClick={() => { setMode("signup"); setError(""); }}
            />
          </form>
        )}

        {/* ── Sign-in / Sign-up mode ───────────────────────── */}
        {mode !== "verify" && (
          <>
            {/* Google button */}
            <button
              type="button"
              onClick={handleGoogleAuth}
              style={{
                width: "100%",
                padding: "13px 20px",
                background: "#131e30",
                border: "1px solid #1e3048",
                borderRadius: 10,
                color: "#c8d0e0",
                fontSize: 15,
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                marginBottom: 20,
                transition: "background 0.15s, border-color 0.15s",
                fontFamily: "'Inter', sans-serif",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "#1a2540";
                e.currentTarget.style.borderColor = "#2a3f5c";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "#131e30";
                e.currentTarget.style.borderColor = "#1e3048";
              }}
            >
              <GoogleIcon />
              Continue with Google
            </button>

            {/* OR divider */}
            <div style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
            }}>
              <div style={{ flex: 1, height: 1, background: "#1a2d45" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#3d4f6a", letterSpacing: "0.1em" }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "#1a2d45" }} />
            </div>

            {/* Form */}
            <form onSubmit={isSignIn ? handleSignIn : handleSignUp} style={{ width: "100%" }}>
              {/* Email */}
              <label style={labelStyle}>EMAIL ADDRESS</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
                style={{
                  ...inputStyle,
                  marginBottom: 16,
                  borderColor: focusField === "email" ? "#3b82f6" : "#1e3048",
                }}
                onFocus={() => setFocusField("email")}
                onBlur={() => setFocusField(null)}
              />

              {/* Password */}
              <label style={labelStyle}>PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  ...inputStyle,
                  marginBottom: 20,
                  borderColor: focusField === "password" ? "#3b82f6" : "#1e3048",
                }}
                onFocus={() => setFocusField("password")}
                onBlur={() => setFocusField(null)}
              />

              {error && <ErrorMsg text={error} />}

              <SubmitButton
                loading={loading}
                label={isSignIn ? "Sign In →" : "Create Account →"}
              />
            </form>

            {/* Footer link */}
            {isSignIn ? (
              <FooterLink
                text="Don't have an account?"
                linkText="Start a 14-day trial"
                onClick={() => { setMode("signup"); setError(""); }}
              />
            ) : (
              <FooterLink
                text="Already have an account?"
                linkText="Sign in"
                onClick={() => { setMode("signin"); setError(""); }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────

function SubmitButton({ loading, label }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: "100%",
        padding: "14px 20px",
        background: loading ? "#1d4ed8" : "#2563eb",
        border: "none",
        borderRadius: 10,
        color: "#fff",
        fontSize: 16,
        fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
        marginBottom: 20,
        transition: "background 0.15s",
        fontFamily: "'Inter', sans-serif",
        opacity: loading ? 0.75 : 1,
      }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#1d4ed8"; }}
      onMouseLeave={e => { if (!loading) e.currentTarget.style.background = "#2563eb"; }}
    >
      {loading ? "Please wait…" : label}
    </button>
  );
}

function ErrorMsg({ text }) {
  return (
    <div style={{
      padding: "10px 14px",
      background: "rgba(239,68,68,0.1)",
      border: "1px solid rgba(239,68,68,0.25)",
      borderRadius: 8,
      color: "#f87171",
      fontSize: 13,
      marginBottom: 16,
      fontFamily: "'Inter', sans-serif",
    }}>
      {text}
    </div>
  );
}

function FooterLink({ text, linkText, onClick }) {
  return (
    <p style={{ margin: 0, fontSize: 14, color: "#5a6580", textAlign: "center" }}>
      {text}{" "}
      <span
        onClick={onClick}
        style={{ color: "#3b82f6", cursor: "pointer", fontWeight: 500 }}
        onMouseEnter={e => e.currentTarget.style.color = "#60a5fa"}
        onMouseLeave={e => e.currentTarget.style.color = "#3b82f6"}
      >
        {linkText}
      </span>
    </p>
  );
}
