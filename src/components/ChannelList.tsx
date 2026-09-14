"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import type { Channel, Server } from "@/db/schema";
import { InviteManager } from "./InviteManager";

export function ChannelList({ server, channels, isOwner }: { server: Server; channels: Channel[]; isOwner: boolean }) {
  const { channelId } = useParams<{ channelId?: string }>();
  const router = useRouter();
  const [adding, setAdding] = useState<"text" | "voice" | null>(null);
  const [name, setName] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId: server.id, name, kind: adding }),
    });
    if (res.ok) {
      const { channel } = await res.json();
      setAdding(null);
      setName("");
      router.push(`/s/${server.id}/c/${channel.id}`);
      router.refresh();
    }
  }

  const group = (kind: Channel["kind"], label: string) => (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-2 pt-3 pb-1 text-xs uppercase tracking-wide opacity-60">
        <span>{label}</span>
        <button type="button" onClick={() => setAdding(kind)} aria-label={`New ${kind} channel`} title={`New ${kind} channel`}>
          +
        </button>
      </div>
      {channels
        .filter((c) => c.kind === kind)
        .map((c) => (
          <Link
            key={c.id}
            href={`/s/${server.id}/c/${c.id}`}
            aria-current={c.id === channelId ? "page" : undefined}
            className={`channel-link ${
              c.id === channelId ? "is-active" : ""
            }`}
          >
            <span className="channel-symbol" aria-hidden="true">{kind === "text" ? "#" : "♬"}</span>
            {c.name}
          </Link>
        ))}
      {adding === kind && (
        <form onSubmit={create} className="px-2 pt-1">
          <input
            autoFocus
            className="w-full rounded-md bg-panel-2 px-2 py-1 text-sm"
            placeholder={`${kind} channel name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(null)}
            required
          />
        </form>
      )}
    </div>
  );

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-2">
      {group("text", "Text channels")}
      {group("voice", "Voice channels")}
      {isOwner && <InviteManager key={server.id} serverId={server.id} />}
      <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="my-3 px-2 text-xs underline opacity-70">Privacy policy</Link>
    </div>
  );
}
