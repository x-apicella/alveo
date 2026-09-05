"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DevLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Login failed");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-white/10 p-4">
      <p className="text-xs uppercase tracking-wide opacity-60">Development login</p>
      <input
        className="rounded-md bg-panel px-3 py-2"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        minLength={2}
        required
      />
      <button className="rounded-md bg-panel-2 px-3 py-2 hover:bg-white/10" type="submit">
        Sign in
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
