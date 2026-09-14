import 'dotenv/config';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';

const sql = postgres(process.env.ALVEO_DATABASE_URL, { max: 3 });
const base = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const secondary = process.env.SMOKE_EVENTS_URL || base;
const run = `alveo-invites-${crypto.randomUUID()}`;
const subjects = Array.from({ length: 6 }, (_, i) => `${run}-${i}`);
const serverIds = [];
const request = (path, cookie, method = 'GET', body, host = base) => fetch(host + path, {
  method, headers: { cookie, 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
  redirect: 'manual', signal: AbortSignal.timeout(15_000),
});
async function login(subject) {
  const token = await new SignJWT({ name: 'Invite check' }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject).setAudience('alveo').setIssuer(process.env.DND_AUTH_ISSUER || 'alveo-smoke')
    .setExpirationTime('5m').sign(new TextEncoder().encode(process.env.DND_AUTH_SHARED_SECRET));
  const response = await request(`/api/auth/sso?token=${encodeURIComponent(token)}`, '');
  assert.equal(response.status, 307);
  return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
}
try {
  const cookies = await Promise.all(subjects.map(login));
  for (const cookie of cookies.slice(0, 2)) {
    const response = await request('/api/servers', cookie, 'POST', { name: run });
    assert.equal(response.status, 201);
    serverIds.push((await response.json()).server.id);
  }
  const endpoint = `/api/servers/${serverIds[0]}/invites`;
  const make = async (maxUses = 1) => {
    const response = await request(endpoint, cookies[0], 'POST', { expiresInHours: 1, maxUses });
    assert.equal(response.status, 201);
    return (await response.json()).invite;
  };
  const redeem = (invite, cookie, host = base) => request(`/api/invites/${invite.code}`, cookie, 'POST', undefined, host);
  assert.equal((await request(endpoint, '')).status, 401);
  assert.equal((await request(endpoint, cookies[1])).status, 404);
  assert.equal((await request(endpoint, cookies[0], 'POST', { expiresInHours: 0, maxUses: 0 })).status, 400);
  const single = await make();
  assert.equal((await request(`/invite/${single.code}`, cookies[5])).status, 200, 'invite preview renders');
  const [previewMembership] = await sql`SELECT count(*)::int AS count FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.server_id = ${serverIds[0]} AND u.external_id = ${subjects[5]}`;
  assert.equal(previewMembership.count, 0, 'GET does not join');
  const races = await Promise.all([redeem(single, cookies[2]), redeem(single, cookies[3], secondary)]);
  assert.deepEqual(races.map(response => response.status).sort(), [200, 404], 'one final slot across instances');
  const winner = races[0].status === 200 ? cookies[2] : cookies[3];
  const loser = races[0].status === 200 ? cookies[3] : cookies[2];
  assert.equal((await redeem(single, winner, secondary)).status, 200, 'member retry remains idempotent');
  const [usage] = await sql`SELECT uses FROM invites WHERE id = ${single.id}`;
  assert.equal(usage.uses, 1);
  assert.equal((await request(endpoint, winner)).status, 403, 'member cannot list links');
  assert.equal((await request(endpoint, winner, 'POST', { expiresInHours: 1, maxUses: 1 })).status, 403);
  assert.equal((await request(endpoint, winner, 'DELETE', { inviteId: single.id })).status, 403);
  const [foreign] = await sql`SELECT id FROM invites WHERE server_id = ${serverIds[1]}`;
  assert.equal((await request(endpoint, cookies[0], 'DELETE', { inviteId: foreign.id })).status, 404);
  assert.equal((await request(endpoint, cookies[0], 'DELETE', { inviteId: single.id })).status, 200);
  assert.equal((await redeem(single, loser, secondary)).status, 404);
  assert.equal((await redeem(single, winner)).status, 404, 'revocation checked even on member retries');
  const expiring = await make();
  await sql`UPDATE invites SET expires_at = clock_timestamp() - interval '1 second' WHERE id = ${expiring.id}`;
  assert.equal((await redeem(expiring, loser)).status, 404);
  const retry = await make(2);
  const retries = await Promise.all([redeem(retry, loser), redeem(retry, loser, secondary)]);
  assert.deepEqual(retries.map(response => response.status), [200, 200]);
  const [retryUsage] = await sql`SELECT uses FROM invites WHERE id = ${retry.id}`;
  assert.equal(retryUsage.uses, 1, 'concurrent retries charge once');
  const [legacy] = await sql`SELECT invite_code FROM servers WHERE id = ${serverIds[0]}`;
  await sql`UPDATE invites SET revoked_at = clock_timestamp() WHERE code = ${legacy.invite_code}`;
  assert.equal((await redeem({ code: legacy.invite_code }, cookies[4])).status, 404, 'no persistent-code fallback');

  // Run the actual upgrade against an isolated old server fixture and roll it back.
  const migration = await readFile(new URL('../drizzle/0002_aromatic_absorbing_man.sql', import.meta.url), 'utf8');
  const rollback = new Error('rollback invite fixture');
  await assert.rejects(sql.begin(async tx => {
    const name = 'invite_upgrade_' + crypto.randomUUID().replaceAll('-', '');
    await tx`CREATE SCHEMA ${sql(name)}`;
    await tx`SELECT set_config('search_path', ${name}, true)`;
    await tx`CREATE TABLE servers (id uuid PRIMARY KEY, invite_code text NOT NULL)`;
    await tx`INSERT INTO servers VALUES (${serverIds[0]}, 'old-link')`;
    for (const statement of migration.split('--> statement-breakpoint')) {
      await tx.unsafe(statement.replaceAll('"public"."servers"', `"${name}"."servers"`));
    }
    const [legacyInvite] = await tx`SELECT code, max_uses, uses, expires_at > now() AS valid FROM invites`;
    assert.deepEqual(legacyInvite, { code: 'old-link', max_uses: null, uses: 0, valid: true });
    throw rollback;
  }), error => error === rollback);
  console.log('PASS invite ownership/isolation, expiration, revocation, legacy upgrade, concurrent capacity and retries');
} catch (error) {
  console.error('FAIL invite smoke:', error instanceof assert.AssertionError ? error.message : 'request or database error');
  process.exitCode = 1;
} finally {
  if (serverIds.length) await sql`DELETE FROM servers WHERE id IN ${sql(serverIds)} AND name = ${run}`;
  await sql`DELETE FROM users WHERE external_id IN ${sql(subjects)}`;
  await sql.end({ timeout: 2 });
}
