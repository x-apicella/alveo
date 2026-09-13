"use client";

import { useState } from "react";
import { createAuthClient } from "@neondatabase/auth/next";
import { safeRedirectPath } from "@/lib/redirect-path";

const authClient = createAuthClient();

export function GoogleLoginButton({ next = "/" }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setPending(true);
    setError("");
    try {
      const destination = safeRedirectPath(next, window.location.origin);
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: new URL(destination, window.location.origin).href,
        errorCallbackURL: new URL("/login?error=google", window.location.origin).href,
      });
      if (result.error) throw new Error("Google sign-in unavailable");
    } catch {
      setError("Could not start Google sign-in. Please try again or use email.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={signIn} disabled={pending}
        className="rounded-md bg-panel px-4 py-2 font-medium hover:bg-panel-2 disabled:opacity-50">
        {pending ? "Connecting to Google..." : "Continue with Google"}
      </button>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
