import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageStream } from '../src/lib/message-stream.ts';
import { parseMessageCursor, mergeMessages } from '../src/lib/message-cursor.ts';

test('cursor validation and merging retain bigint precision and remove duplicates', () => {
  assert.equal(parseMessageCursor('9223372036854775807'), '9223372036854775807');
  for (const bad of ['', '-1', '01', '1.2', '1\ninjected', '9223372036854775808']) assert.throws(() => parseMessageCursor(bad));
  const a = { id: 'a', sequence: '9007199254740993' };
  const b = { id: 'b', sequence: '9007199254740992' };
  assert.deepEqual(mergeMessages([a], [a, b, b]), [b, a]);
});

test('SSE drains more than 200 missed messages with event IDs and backpressure', async () => {
  const seen = [];
  let queries = 0;
  let removed = 0;
  const stream = createMessageStream({ cursor: '0', signal: new AbortController().signal,
    subscribe: async () => () => removed++,
    read: async cursor => {
      queries++;
      const start = Number(cursor);
      return { messages: Array.from({ length: Math.min(200, 451 - start) }, (_, i) => ({ sequence: String(start + i + 1) })), hasMore: start + 200 < 451 };
    },
  });
  const reader = stream.getReader();
  try {
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(queries, 0, 'no unbounded eager backlog buffering');
    while (seen.length < 451) {
      const text = new TextDecoder().decode((await reader.read()).value);
      if (!text.startsWith('id:')) continue;
      const data = JSON.parse(text.split('data: ')[1]);
      assert.ok(text.startsWith(`id: ${data.messages.at(-1).sequence}\n`));
      seen.push(...data.messages.map(message => message.sequence));
    }
    assert.equal(new Set(seen).size, 451);
    assert.equal(seen.at(-1), '451');
  } finally { await reader.cancel(); }
  assert.equal(removed, 1);
});

test('database polling delivers when LISTEN setup fails and no notification arrives', async () => {
  let available = false;
  const reader = createMessageStream({ cursor: '0', signal: new AbortController().signal, pollMs: 10,
    subscribe: async () => { throw new Error('LISTEN unavailable'); },
    read: async cursor => ({ messages: available && cursor === '0' ? [{ sequence: '1' }] : [], hasMore: false }),
  }).getReader();
  try {
    await reader.read();
    available = true;
    let text = '';
    while (!text.includes('id: 1')) text = new TextDecoder().decode((await reader.read()).value);
    assert.ok(text.includes('"sequence":"1"'));
  } finally { await reader.cancel(); }
});

test('query failure ends the stream and a new request resumes without a poisoned promise chain', async () => {
  let removed = 0;
  const reader = createMessageStream({ cursor: '42', signal: new AbortController().signal,
    subscribe: async () => () => removed++,
    read: async () => { throw new Error('query disconnected'); },
  }).getReader();
  await reader.read();
  await assert.rejects(reader.read(), /interrupted/);
  assert.equal(removed, 1);
  const next = createMessageStream({ cursor: '42', signal: new AbortController().signal,
    subscribe: async () => () => {},
    read: async cursor => ({ messages: cursor === '42' ? [{ sequence: '43' }] : [], hasMore: false }),
  }).getReader();
  try {
    await next.read();
    assert.match(new TextDecoder().decode((await next.read()).value), /id: 43/);
  } finally { await next.cancel(); }
});

test('cancelling before subscription setup completes removes the late subscription', async () => {
  let finish;
  let removed = 0;
  const reader = createMessageStream({ cursor: '0', signal: new AbortController().signal,
    subscribe: () => new Promise(resolve => { finish = resolve; }),
    read: async () => ({ messages: [], hasMore: false }),
  }).getReader();
  await reader.cancel();
  finish(() => removed++);
  await Promise.resolve();
  assert.equal(removed, 1);
});
