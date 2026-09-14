import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatPanel } from '../../src/components/ChatPanel';

const author = { id: 'user', username: 'Friend', avatarUrl: null };
const message = sequence => ({ id: `message-${sequence}`, sequence: String(sequence), content: `Message ${sequence}`, createdAt: '2026-01-01T00:00:00Z', author });
let events;
let attempts = [];
let fail = true;
let historyFails = true;
window.EventSource = class {
  constructor(url) {
    const connection = { url, close() {} };
    events = connection;
    queueMicrotask(() => connection.onopen?.());
    return connection;
  }
};
window.fetch = async (url, options) => {
  if (options?.method === 'POST') {
    const body = JSON.parse(options.body);
    attempts.push(body);
    if (fail) { fail = false; throw new Error('lost acknowledgement'); }
    return Response.json({ message: { ...message(101), content: body.content } });
  }
  if (historyFails) { historyFails = false; return new Response('', { status: 503 }); }
  return Response.json({ messages: Array.from({ length: 50 }, (_, i) => message(i + 1)), hasMore: false, nextCursor: '1' });
};
window.fixture = {
  attempts: () => attempts,
  incoming() { events.onmessage({ data: JSON.stringify({ messages: [message(102), message(101), message(102)] }) }); },
  connection(value) { if (value) events.onopen(); else events.onerror(); },
  url: () => events?.url,
};
createRoot(document.getElementById('root')).render(<ChatPanel channel={{ id: 'channel', name: 'general', kind: 'text' }}
  currentUserId="user" initialMessages={Array.from({ length: 50 }, (_, i) => message(i + 51))} />);
