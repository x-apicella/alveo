"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Channel } from "@/db/schema";
import type { MessageView } from "@/lib/data";
import { mergeMessages } from "@/lib/message-cursor";

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
  const bodyRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const historyAnchor = useRef<{ height: number; top: number } | null>(null);
  const pendingSend = useRef<{ content: string; clientId: string } | null>(null);
  const [hasOlder, setHasOlder] = useState(initialMessages.length === 50);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderBusy = useRef(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const olderCursor = useRef<string | undefined>(initialMessages[0]?.sequence);

  // The page keys this component by channel id, so state resets on navigation.
  // An empty channel must replay from before the subscription starts. Otherwise
  // a first message sent while EventSource connects can be permanently missed.
  const initialCursor = initialMessages.at(-1)?.sequence ?? "0";

  // Live updates over Server-Sent Events, backed by Postgres NOTIFY.
  useEffect(() => {
    const url = `/api/channels/${channel.id}/events?cursor=${initialCursor}`;
    const es = new EventSource(url);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      const { messages: incoming } = JSON.parse(ev.data) as { messages: MessageView[] };
      setMessages((prev) => mergeMessages(prev, incoming));
    };
    return () => es.close();
  }, [channel.id, initialCursor]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (body && historyAnchor.current) {
      body.scrollTop = historyAnchor.current.top + body.scrollHeight - historyAnchor.current.height;
      historyAnchor.current = null;
    } else if (nearBottom.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function loadOlder() {
    if (olderBusy.current || !olderCursor.current) return;
    olderBusy.current = true;
    setLoadingOlder(true);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/channels/${channel.id}/messages?before=${olderCursor.current}`);
      if (!response.ok) throw new Error();
      const page: { messages: MessageView[]; hasMore: boolean; nextCursor: string | null } = await response.json();
      const body = bodyRef.current;
      if (body && page.messages.length) historyAnchor.current = { height: body.scrollHeight, top: body.scrollTop };
      olderCursor.current = page.nextCursor ?? undefined;
      setMessages(prev => mergeMessages(prev, page.messages));
      setHasOlder(page.hasMore);
    } catch { setHistoryError("Could not load older messages. Try again."); }
    finally { olderBusy.current = false; setLoadingOlder(false); }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sendingRef.current) return;
    if (pendingSend.current?.content !== content) pendingSend.current = { content, clientId: crypto.randomUUID() };
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const response = await fetch(`/api/channels/${channel.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingSend.current),
      });
      if (!response.ok) {
        setSendError(response.status === 401
          ? "Your session expired. Copy your draft before signing in again."
          : "Could not confirm delivery. Your draft is saved here; retry to confirm the same message.");
        return;
      }
      const { message }: { message: MessageView } = await response.json();
      setMessages(prev => mergeMessages(prev, [message]));
      pendingSend.current = null;
      nearBottom.current = true;
      setDraft("");
    } catch {
      setSendError("Connection lost. Your draft is saved here; retry to confirm the same message.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <>
      <header className="channel-heading"><span className="channel-symbol" aria-hidden="true">#</span><span className="truncate">{channel.name}</span><span className="ml-auto text-xs font-normal text-gray-400">Text channel</span></header>
      {!connected && <p role="status" className="px-4 py-2 text-sm opacity-70">Connecting to live chat… New messages may be delayed.</p>}
      <div className="chat-body" ref={bodyRef} onScroll={() => {
        const body = bodyRef.current;
        if (body) nearBottom.current = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
      }}>
        {hasOlder && <button type="button" className="mb-4 text-sm text-accent disabled:opacity-50" disabled={loadingOlder} onClick={loadOlder}>
          {loadingOlder ? "Loading older messages…" : "Load older messages"}
        </button>}
        {historyError && <p role="alert" className="text-sm text-red-400">{historyError}</p>}
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
          {sending ? "Sending…" : sendError ? "Retry send" : "Send"}
        </button>
        </div>
      </form>
    </>
  );
}
