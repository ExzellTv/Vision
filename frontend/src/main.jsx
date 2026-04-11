import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { setTokenGetter } from "./services/api";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// ── DEMO MODE: Run without Clerk when key is absent ──────────────────────────
if (PUBLISHABLE_KEY) {
  // Full Clerk auth flow
  import("@clerk/clerk-react").then(({ ClerkProvider, useAuth }) => {
    function TokenWirer() {
      const { getToken } = useAuth();
      useEffect(() => {
        setTokenGetter(getToken);
      }, [getToken]);
      return null;
    }

    function Root() {
      return (
        <React.StrictMode>
          <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
            <TokenWirer />
            <App />
          </ClerkProvider>
        </React.StrictMode>
      );
    }

    ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
  });
} else {
  // Demo mode — no Clerk, no auth, full access
  console.info("[Vision] Running in DEMO MODE — Clerk auth disabled");
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
