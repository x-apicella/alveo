import 'dotenv/config';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

const base = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const run = 'alveo-smoke-' + randomUUID();
const sql = postgres(process.env.ALVEO_DATABASE_URL, { max: 1, connect_timeout: 8 });
const subjects = [run + '-owner', run + '-guest'];
let serverId;
let events;
async function request(path, cookie, body) {
  return fetch(base + path, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual', signal: AbortSignal.timeout(10000) });
}
async function login(subject) {
  const token = await new SignJWT({ name: 'Integration check' }).setProtectedHeader({ alg: 'HS256' }).setSubject(subject).setAudience('alveo').setIssuer(process.env.DND_AUTH_ISSUER || 'alveo-smoke').setIssuedAt().setExpirationTime('2m').sign(new TextEncoder().encode(process.env.DND_AUTH_SHARED_SECRET));
  const response = await request('/api/auth/sso?token=' + encodeURIComponent(token));
  assert.equal(response.status, 307, 'SSO redirect');
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie.includes('alveo_session='), 'SSO creates a session');
  return cookie;
}
try {
  assert.equal((await request('/api/health')).status, 200, 'database readiness');
  assert.equal((await request('/api/servers')).status, 401, 'anonymous access denied');
  const owner = await login(subjects[0]);
  const guest = await login(subjects[1]);
  const created = await request('/api/servers', owner, { name: run });
  assert.equal(created.status, 201, 'server creation');
  const { server } = await created.json(); serverId = server.id;
  const channels = await sql`SELECT id, kind FROM channels WHERE server_id = ${serverId}`;
  const text = channels.find(channel => channel.kind === 'text').id;
  const voice = channels.find(channel => channel.kind === 'voice').id;
  assert.equal((await request(`/api/channels/${text}/messages`, guest)).status, 404, 'nonmember isolation');
  assert.equal((await request(`/api/invites/${server.inviteCode}`, guest, {})).status, 200, 'invite join');
  events = new AbortController();
  const response = await fetch(`${process.env.SMOKE_EVENTS_URL || base}/api/channels/${text}/events`, { headers: { cookie: guest }, signal: events.signal });
  assert.equal(response.status, 200, 'SSE connects');
  const reader = response.body.getReader();
  const payload = 'live delivery ' + run;
  assert.equal((await request(`/api/channels/${text}/messages`, owner, { content: payload })).status, 201, 'message accepted');
  const timeout = setTimeout(() => events.abort(), 10000);
  try {
    let data = '';
    while (!data.includes(payload)) {
      const part = await reader.read();
      assert.equal(part.done, false, 'SSE remains open');
      data += new TextDecoder().decode(part.value);
    }
  } finally { clearTimeout(timeout); events.abort(); }
  const messages = await request(`/api/channels/${text}/messages`, guest);
  assert.ok((await messages.json()).messages.some(message => message.content === payload), 'history persisted');
  const media = await request('/api/livekit/token', owner, { channelId: voice });
  assert.equal(media.status, process.env.LIVEKIT_API_KEY ? 200 : 503, 'media token or explicit missing-service response');
  const logout = await request('/api/auth/logout', owner, {});
  assert.equal(logout.status, 303, 'logout');
  console.log('PASS authenticated SSO, two users, server/invite, membership isolation, realtime SSE, message history, media configuration response, logout');
} catch (error) {
  console.error('FAIL application smoke:', error instanceof assert.AssertionError ? error.message : 'request or service error');
  process.exitCode = 1;
} finally {
  events?.abort();
  if (serverId) await sql`DELETE FROM servers WHERE id = ${serverId} AND name = ${run}`;
  await sql`DELETE FROM users WHERE external_id IN ${sql(subjects)}`;
  await sql.end({ timeout: 2 });
}
