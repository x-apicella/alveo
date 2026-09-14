import { test } from 'node:test';
import assert from 'node:assert/strict';
import { release, smoke } from '../scripts/release-vps.mjs';

const image = 'ghcr.io/x-apicella/alveo@sha256:' + 'a'.repeat(64);
const previous = 'sha256:' + 'b'.repeat(64);
const revision = 'c'.repeat(40);
const options = { image, revision, schemaCompatible: true };
function fixture(overrides = {}) {
  const calls = [];
  let record;
  const io = {
    lock() { calls.push('lock'); }, unlock() { calls.push('unlock'); },
    currentImage() { return previous; }, pull() { calls.push('pull'); }, revision() { return revision; },
    activate(ref) { calls.push(ref); }, healthy() { calls.push('healthy'); },
    saveCurrent() { calls.push('save'); }, record(value) { record = value; }, ...overrides,
  };
  return { calls, io, record: () => record };
}

test('release verifies the current app and revision, then switches only after pulling', async () => {
  const f = fixture();
  await release(options, f.io);
  assert.deepEqual(f.calls, ['lock', 'healthy', 'pull', image, 'healthy', 'save', 'unlock']);
  assert.equal(f.record().result, 'deployed');
  assert.equal(f.record().previousImage, previous);
});

test('failed health gate restores the immutable previous image and verifies recovery', async () => {
  let health = 0;
  const f = fixture({ healthy() { if (++health === 2) throw new Error('secret upstream body'); } });
  await assert.rejects(release(options, f.io), /rolled-back/);
  assert.equal(health, 3);
  assert.deepEqual(f.calls, ['lock', 'pull', image, previous, 'unlock']);
  assert.equal(f.record().result, 'rolled-back');
  assert.ok(!JSON.stringify(f.record()).includes('secret'));
});

test('partially failed activation also rolls back', async () => {
  const f = fixture({ activate(ref) { f.calls.push(ref); if (ref === image) throw new Error(); } });
  await assert.rejects(release(options, f.io), /rolled-back/);
  assert.ok(f.calls.includes(previous));
});

test('rollback failure is distinct and releases the deployment lock', async () => {
  const f = fixture({ activate() { throw new Error(); } });
  await assert.rejects(release(options, f.io), /rollback-failed/);
  assert.equal(f.record().result, 'rollback-failed');
  assert.equal(f.calls.at(-1), 'unlock');
});

test('stale credentials or a mismatched image cannot change the running app', async () => {
  for (const override of [{ healthy() { throw new Error(); } }, { revision() { return 'd'.repeat(40); } }]) {
    const f = fixture(override);
    await assert.rejects(release(options, f.io), /preflight-failed/);
    assert.ok(!f.calls.includes(image));
    assert.equal(f.calls.at(-1), 'unlock');
  }
});

test('unreviewed migrations and mutable tags are rejected before acquiring the lock', async () => {
  for (const opts of [{ ...options, image: 'ghcr.io/x-apicella/alveo:latest' }, { ...options, schemaCompatible: false }]) {
    const f = fixture();
    await assert.rejects(release(opts, f.io));
    assert.deepEqual(f.calls, []);
  }
});

test('a second deployment cannot unlock the first deployment', async () => {
  const f = fixture({ lock() { throw new Error('busy'); } });
  await assert.rejects(release(options, f.io), /busy/);
  assert.deepEqual(f.calls, []);
});

test('smoke requires authenticated chat and configured media and never follows redirects', async () => {
  const credentials = { cookie: 'alveo_session=private', textChannelId: 'text', voiceChannelId: 'voice' };
  for (const failure of [null, '/login', '/api/channels/text/messages', '/api/livekit/token']) {
    const requests = [];
    const request = async (url, init) => {
      requests.push([url, init]);
      const path = new URL(url).pathname;
      const body = path === '/api/health' ? { status: 'ready' } : path.endsWith('/messages') ? { messages: [] } : { token: 'private', url: 'wss://livekit.example.invalid' };
      return new Response(JSON.stringify(body), { status: path === failure ? 503 : 200 });
    };
    if (failure) await assert.rejects(smoke('http://localhost', credentials, request));
    else await smoke('http://localhost', credentials, request);
    assert.ok(requests.every(([, init]) => init.redirect === 'manual'));
    assert.equal(requests[0][1].headers, undefined);
  }
});
