"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateServerForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (res.ok) {
      const { server } = await res.json();
      router.push(`/s/${server.id}`);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg bg-panel p-4">
      <h3 className="font-medium">Create a server</h3>
      <input
        className="rounded-md bg-panel-2 px-3 py-2"
        placeholder="Server name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <button disabled={busy} className="rounded-md bg-accent px-3 py-2 disabled:opacity-50">
        Create
      </button>
    </form>
  );
}

export function JoinServerForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Accept either a bare code or a full invite link.
    const trimmed = code.trim().split("/").pop() ?? "";
    const res = await fetch(`/api/invites/${encodeURIComponent(trimmed)}`, { method: "POST" });
    if (!res.ok) {
      setError("Invite not found");
      return;
    }
    const { server } = await res.json();
    router.push(`/s/${server.id}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg bg-panel p-4">
      <h3 className="font-medium">Join with an invite</h3>
      <input
        className="rounded-md bg-panel-2 px-3 py-2"
        placeholder="Invite code or link"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
      />
      <button className="rounded-md bg-panel-2 px-3 py-2 hover:bg-white/10">Join</button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
