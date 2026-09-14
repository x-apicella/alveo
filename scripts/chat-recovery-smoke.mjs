import 'dotenv/config';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';

const sql = postgres(process.env.ALVEO_DATABASE_URL, { max: 3 });
const base = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const subject = `alveo-chat-recovery-${crypto.randomUUID()}`;
let serverId;
let reader;
const request = (path, cookie, data) => fetch(base + path, { method: data ? 'POST' : 'GET',
  headers: { cookie, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined,
  signal: AbortSignal.timeout(15_000), redirect: 'manual' });
try {
  // Exercise upgrade ordering with populated old-schema data. The deliberately
  // rolled-back transaction removes the entire isolated schema and its objects.
  const rollback = new Error('rollback migration fixture');
  const migration = await readFile(new URL('../drizzle/0001_open_beast.sql', import.meta.url), 'utf8');
  await assert.rejects(sql.begin(async tx => {
    const schemaName = 'chat_upgrade_' + crypto.randomUUID().replaceAll('-', '');
    await tx`CREATE SCHEMA ${sql(schemaName)}`;
    await tx`SELECT set_config('search_path', ${schemaName}, true)`;
    await tx`CREATE TABLE messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel_id uuid NOT NULL,
      author_id uuid NOT NULL, content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
    await tx`INSERT INTO messages (channel_id, author_id, content, created_at) VALUES
      (${crypto.randomUUID()}, ${crypto.randomUUID()}, 'later', '2026-02-01'),
      (${crypto.randomUUID()}, ${crypto.randomUUID()}, 'earlier', '2026-01-01')`;
    for (const statement of migration.split('--> statement-breakpoint')) await tx.unsafe(statement);
    const rows = await tx`SELECT content FROM messages ORDER BY sequence`;
    assert.deepEqual(rows.map(row => row.content), ['earlier', 'later']);
    const [next] = await tx`INSERT INTO messages (channel_id, author_id, content) VALUES
      (${crypto.randomUUID()}, ${crypto.randomUUID()}, 'new') RETURNING sequence::text`;
    assert.ok(BigInt(next.sequence) > 2n);
    throw rollback;
  }), error => error === rollback);

  const token = await new SignJWT({ name: 'Chat recovery check' }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject).setAudience('alveo').setIssuer(process.env.DND_AUTH_ISSUER || 'alveo-smoke')
    .setExpirationTime('5m').sign(new TextEncoder().encode(process.env.DND_AUTH_SHARED_SECRET));
  const login = await request(`/api/auth/sso?token=${encodeURIComponent(token)}`, '');
  assert.equal(login.status, 307);
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const created = await request('/api/servers', cookie, { name: subject });
  serverId = (await created.json()).server.id;
  const [channel] = await sql`SELECT id FROM channels WHERE server_id = ${serverId} AND kind = 'text'`;
  const [user] = await sql`SELECT id FROM users WHERE external_id = ${subject}`;
  const path = `/api/channels/${channel.id}/messages`;
  const body = { content: 'retry-safe message', clientId: crypto.randomUUID() };
  const retries = await Promise.all([request(path, cookie, body), request(path, cookie, body)]);
  assert.deepEqual(retries.map(response => response.status).sort(), [200, 201]);
  const [one, two] = await Promise.all(retries.map(response => response.json()));
  assert.equal(one.message.id, two.message.id);
  assert.equal((await request(path, cookie, { ...body, content: 'different payload' })).status, 409);
  assert.equal((await request(path + '?cursor=invalid', cookie)).status, 400);
  assert.equal((await request(path + '?before=-1', cookie)).status, 400);
  assert.equal((await request(path + '?cursor=0&before=1', cookie)).status, 400);

  // A single timestamp across more than two replay pages must not drop any row.
  const fixtures = Array.from({ length: 451 }, (_, i) => ({ channel_id: channel.id, author_id: user.id,
    content: `collision-${i}`, created_at: '2026-01-01T00:00:00.123456Z' }));
  await sql`INSERT INTO messages ${sql(fixtures)}`;
  const expected = await sql`SELECT id, sequence::text FROM messages WHERE channel_id = ${channel.id} ORDER BY sequence`;
  let cursor = '0';
  const forward = [];
  let more = true;
  while (more) {
    const page = await (await request(path + '?cursor=' + cursor, cookie)).json();
    forward.push(...page.messages.map(message => message.id));
    cursor = page.nextCursor;
    more = page.hasMore;
  }
  assert.deepEqual(forward, expected.map(message => message.id));
  let page = await (await request(path, cookie)).json();
  let history = page.messages;
  while (page.hasMore) {
    page = await (await request(path + '?before=' + page.nextCursor, cookie)).json();
    history = [...page.messages, ...history];
  }
  assert.deepEqual(history.map(message => message.id), forward);

  // Use the second app instance in CI. The header must override the stale URL.
  const response = await fetch(`${process.env.SMOKE_EVENTS_URL || base}/api/channels/${channel.id}/events?cursor=0`, {
    headers: { cookie, 'Last-Event-ID': one.message.sequence }, signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200);
  reader = response.body.getReader();
  const received = [];
  let buffer = '';
  while (received.length < 451) {
    const chunk = await reader.read();
    assert.equal(chunk.done, false);
    buffer += new TextDecoder().decode(chunk.value);
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = event.split('\n').find(line => line.startsWith('data: '));
      if (!data) continue;
      const messages = JSON.parse(data.slice(6)).messages;
      assert.ok(event.includes(`id: ${messages.at(-1).sequence}`));
      received.push(...messages.map(message => message.id));
    }
  }
  assert.deepEqual(received, expected.slice(1).map(message => message.id));
  await reader.cancel(); reader = undefined;

  // Block the first transaction after its insert. The second channel insert
  // cannot allocate a replay position and commit ahead of it.
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let inserted;
  const ready = new Promise(resolve => { inserted = resolve; });
  const first = sql.begin(async tx => {
    const [row] = await tx`INSERT INTO messages (channel_id, author_id, content) VALUES (${channel.id}, ${user.id}, 'first transaction') RETURNING sequence::text`;
    inserted();
    await gate;
    return row;
  });
  await ready;
  let secondCommitted = false;
  const second = sql`INSERT INTO messages (channel_id, author_id, content) VALUES (${channel.id}, ${user.id}, 'second transaction') RETURNING sequence::text`
    .then(rows => { secondCommitted = true; return rows[0]; });
  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(secondCommitted, false);
  } finally { release(); }
  const [firstRow, secondRow] = await Promise.all([first, second]);
  assert.ok(BigInt(firstRow.sequence) < BigInt(secondRow.sequence));
  console.log('PASS concurrent retry idempotency, cursor validation, 451 timestamp collisions, full history, cross-instance SSE resume and commit ordering');
} finally {
  await reader?.cancel().catch(() => {});
  if (serverId) await sql`DELETE FROM servers WHERE id = ${serverId} AND name = ${subject}`;
  await sql`DELETE FROM users WHERE external_id = ${subject}`;
  await sql.end({ timeout: 2 });
}
