"use client";

import { useEffect, useRef, useState } from "react";
import type { Channel } from "@/db/schema";
import type { MessageView } from "@/lib/data";

export function ChatPanel({
  channel,
  initialMessages,
  currentUserId,
}: {
  channel: Channel;
  initialMessages: MessageView[];
  currentUserId: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // The page keys this component by channel id, so state resets on navigation.
  const initialCursor = initialMessages.at(-1)?.createdAt;

  // Live updates over Server-Sent Events, backed by Postgres NOTIFY.
  useEffect(() => {
    const url = `/api/channels/${channel.id}/events${
      initialCursor ? `?after=${encodeURIComponent(initialCursor)}` : ""
    }`;
    const es = new EventSource(url);
    es.onmessage = (ev) => {
      const { messages: incoming } = JSON.parse(ev.data) as { messages: MessageView[] };
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
      });
    };
    return () => es.close();
  }, [channel.id, initialCursor]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    await fetch(`/api/channels/${channel.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  }

  return (
    <>
      <header className="border-b border-black/30 px-4 py-3 font-semibold"># {channel.name}</header>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="opacity-50 text-sm">Nothing here yet. Say hello.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="py-1">
            <span
              className={`mr-2 text-sm font-semibold ${
                m.author.id === currentUserId ? "text-accent" : ""
              }`}
            >
              {m.author.username}
            </span>
            <span className="text-xs opacity-40">
              {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <div className="whitespace-pre-wrap break-words">{m.content}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="p-3">
        <input
          className="w-full rounded-lg bg-panel px-4 py-3 outline-none focus:ring-1 focus:ring-accent"
          placeholder={`Message #${channel.name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={4000}
        />
      </form>
    </>
  );
}
