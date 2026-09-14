"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function JoinInvite({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="flex flex-col gap-4">
    <h1>Join this server</h1>
    <p>Accept this invitation to become a member.</p>
    <button disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try {
        const response = await fetch(`/api/invites/${encodeURIComponent(code)}`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not join server");
        router.push(`/s/${data.server.id}`); router.refresh();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Could not join server");
      } finally { setBusy(false); }
    }}>{busy ? "Joining…" : "Join server"}</button>
    <p role="alert">{error}</p>
  </div>;
}
