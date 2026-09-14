"use client";

import { useState } from "react";

type Invite = { id: string; code: string; expiresAt: string; maxUses: number | null; uses: number; revokedAt: string | null };

export function InviteManager({ serverId }: { serverId: string }) {
  const [open, setOpen] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [hours, setHours] = useState("24");
  const [uses, setUses] = useState("10");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const endpoint = `/api/servers/${serverId}/invites`;

  async function request(method: string, body?: object, page = 0) {
    const response = await fetch(method === "GET" ? `${endpoint}?offset=${page}` : endpoint, { method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not update invites");
    return data;
  }

  async function update(method: string, body?: object, page = 0) {
    setBusy(true);
    setMessage("");
    try {
      if (method !== "GET") await request(method, body);
      const data = await request("GET", undefined, page);
      setInvites(data.invites); setOffset(page); setHasMore(data.hasMore);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load invites");
    } finally { setBusy(false); }
  }

  return <div className="mt-4 px-2 text-xs">
    <button type="button" onClick={() => { setOpen(!open); if (!open) void update("GET"); }}>Manage invites</button>
    {open && <div className="flex flex-col gap-2 pt-2">
      <form className="flex flex-col gap-2" onSubmit={(event) => {
        event.preventDefault(); void update("POST", { expiresInHours: Number(hours), maxUses: Number(uses) });
      }}>
        <label>Expires in hours<input className="w-full bg-panel-2" type="number" min="1" max="168" required value={hours} onChange={(event) => setHours(event.target.value)} /></label>
        <label>Maximum new members<input className="w-full bg-panel-2" type="number" min="1" max="100" required value={uses} onChange={(event) => setUses(event.target.value)} /></label>
        <button disabled={busy}>Create invite</button>
      </form>
      <p>Revoking a link prevents new joins; existing members keep access.</p>
      {invites.map((invite) => <div key={invite.id} className="rounded bg-panel-2 p-2">
        <p>{invite.uses} / {invite.maxUses ?? "unlimited"} joins</p>
        <p>{invite.revokedAt ? "Revoked" : `Expires ${new Date(invite.expiresAt).toLocaleString()}`}</p>
        {!invite.revokedAt && <div className="flex gap-3">
          <button type="button" disabled={busy} onClick={async () => {
            try { await navigator.clipboard.writeText(`${location.origin}/invite/${invite.code}`); setMessage("Invite copied"); }
            catch { setMessage("Clipboard unavailable. Copy the link below."); }
          }}>Copy link</button>
          <button type="button" disabled={busy} onClick={() => void update("DELETE", { inviteId: invite.id })}>Revoke</button>
        </div>}
        {!invite.revokedAt && <input aria-label="Invite link" readOnly className="w-full bg-panel-2" value={`${typeof location === "undefined" ? "" : location.origin}/invite/${invite.code}`} />}
      </div>)}
      <div className="flex gap-3">
        <button disabled={busy || offset === 0} onClick={() => void update("GET", undefined, Math.max(0, offset - 100))}>Newer</button>
        <button disabled={busy || !hasMore} onClick={() => void update("GET", undefined, offset + 100)}>Older</button>
      </div>
      <p role="status">{message}</p>
    </div>}
  </div>;
}
