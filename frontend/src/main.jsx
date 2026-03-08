import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import App from "./App";
import { setTokenGetter } from "./services/api";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in frontend/.env");
}

// Wire Clerk's getToken into the API service so every request gets a Bearer token.
function TokenWirer() {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenGetter(getToken);
  }, [getToken]);
  return null;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <TokenWirer />
      <App />
    </ClerkProvider>
  </React.StrictMode>
);
