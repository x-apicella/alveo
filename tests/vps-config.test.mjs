import test from 'node:test';
import assert from 'node:assert/strict';
import { configs } from '../scripts/prepare-vps.mjs';

const input = {
  ALVEO_DATABASE_URL: 'postgres://test:test@pool.example/test',
  ALVEO_DATABASE_DIRECT_URL: 'postgres://test:test@direct.example/test',
  NEON_AUTH_URL: 'https://auth.example/auth',
  LIVEKIT_API_KEY: 'cloud-key', LIVEKIT_API_SECRET: 'cloud-secret',
  SESSION_SECRET: 'local-secret', OVH_APPLICATION_SECRET: 'never-deploy',
};
test('VPS configuration isolates credentials and preserves only needed services', () => {
  const { app, livekit } = configs(input);
  assert.equal(app.ALVEO_DATABASE_URL, input.ALVEO_DATABASE_URL);
  assert.equal(app.OVH_APPLICATION_SECRET, undefined);
  assert.notEqual(app.LIVEKIT_API_SECRET, input.LIVEKIT_API_SECRET);
  assert.notEqual(app.SESSION_SECRET, input.SESSION_SECRET);
  assert.equal(livekit.keys[app.LIVEKIT_API_KEY], app.LIVEKIT_API_SECRET);
  assert.equal(app.ALLOW_DEV_LOGIN, 'false');
  assert.throws(() => configs({ ...input, NEON_AUTH_URL: '' }), /NEON_AUTH_URL/);
  assert.throws(() => configs({ ...input, DND_APP_LOGIN_URL: 'value\nINJECTED=yes' }), /Multiline/);
});
test('website and TURN share public TLS without exposing app or Redis', () => {
  const { caddy, livekit } = configs(input);
  const routes = caddy.apps.layer4.servers.main.routes;
  assert.equal(routes.find(r => r.match[0].tls.sni[0] === 'turn.alveo.chat').handle[1].upstreams[0].dial[0], `127.0.0.1:${livekit.turn.tls_port}`);
  assert.equal(livekit.turn.external_tls, true);
  assert.deepEqual(caddy.apps.http.servers.app.listen, ['127.0.0.1:8080']);
  assert.equal(caddy.apps.http.servers.app.routes[0].handle[0].headers.request.set['X-Forwarded-Proto'][0], 'https');
});
