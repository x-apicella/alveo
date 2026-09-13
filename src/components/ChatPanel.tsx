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
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const sendingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // The page keys this component by channel id, so state resets on navigation.
  // An empty channel must replay from before the subscription starts. Otherwise
  // a first message sent while EventSource connects can be permanently missed.
  const initialCursor = initialMessages.at(-1)?.createdAt ?? "1970-01-01T00:00:00.000Z";

  // Live updates over Server-Sent Events, backed by Postgres NOTIFY.
  useEffect(() => {
    const url = `/api/channels/${channel.id}/events${
      initialCursor ? `?after=${encodeURIComponent(initialCursor)}` : ""
    }`;
    const es = new EventSource(url);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
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
    if (!content || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const response = await fetch(`/api/channels/${channel.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        setSendError(response.status === 401
          ? "Your session expired. Copy your draft before signing in again."
          : "Could not confirm delivery. Your draft is saved here; check the chat before retrying.");
        return;
      }
      setDraft("");
    } catch {
      setSendError("Connection lost. Delivery is uncertain; check the chat before retrying. Your draft is saved here.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <>
      <header className="channel-heading"><span className="channel-symbol" aria-hidden="true">#</span><span className="truncate">{channel.name}</span><span className="ml-auto text-xs font-normal text-gray-400">Text channel</span></header>
      {!connected && <p role="status" className="px-4 py-2 text-sm opacity-70">Connecting to live chat… New messages may be delayed.</p>}
      <div className="chat-body">
        {messages.length === 0 && (
          <div className="chat-welcome honeycomb"><span className="welcome-hash" aria-hidden="true">#</span><h2>Welcome to #{channel.name}</h2><p>This is the start of your conversation. Say hello to the hive.</p></div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="message-row"><span className="avatar" aria-hidden="true">{m.author.username.slice(0, 2).toUpperCase()}</span><div className="message-content">
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
            <div className="whitespace-pre-wrap break-words">{m.content}</div></div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="composer">
        {sendError && <p role="alert" id="send-error" className="mb-2 text-sm text-red-400">{sendError}</p>}
        <div className="flex gap-2">
        <input
          className="w-full rounded-lg bg-panel px-4 py-3 outline-none focus:ring-1 focus:ring-accent"
          placeholder={`Message #${channel.name}`}
          value={draft}
          aria-label={`Message #${channel.name}`}
          aria-describedby={sendError ? "send-error" : undefined}
          readOnly={sending}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={4000}
        />
        <button type="submit" disabled={sending || !draft.trim()} className="rounded-lg bg-accent px-4 disabled:opacity-50">
          {sending ? "Sending…" : "Send"}
        </button>
        </div>
      </form>
    </>
  );
}
