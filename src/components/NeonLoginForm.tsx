"use client";

import { useActionState, useState } from "react";
import { neonLogin } from "@/app/login/actions";

export function NeonLoginForm() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [state, action, pending] = useActionState(neonLogin, { error: "" });
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="mode" value={mode} />
      <input type={mode === "sign-up" ? "text" : "hidden"} name="name" required={mode === "sign-up"} maxLength={64} aria-label="Display name" placeholder="Display name" className="rounded-md bg-panel px-3 py-2" />
      <input type="email" name="email" required autoComplete="email" aria-label="Email" placeholder="Email" className="rounded-md bg-panel px-3 py-2" />
      <input type="password" name="password" required minLength={8} maxLength={128} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} aria-label="Password" placeholder="Password" className="rounded-md bg-panel px-3 py-2" />
      {state.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
      <button disabled={pending} className="rounded-md bg-accent px-4 py-2 disabled:opacity-50">{pending ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}</button>
      <button type="button" disabled={pending} onClick={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")} className="text-sm underline">{mode === "sign-up" ? "Already have an account? Sign in" : "Create an account"}</button>
    </form>
  );
}
