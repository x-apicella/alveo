import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNames, nextState, notify, httpProbe, mediaProbe } from '../scripts/monitor.mjs';

const healthy = Object.fromEntries(checkNames.map(name => [name, 'pass']));
test('three consecutive failures alert once; recovery needs two successes', () => {
  let state;
  const failed = { ...healthy, app: 'fail' };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const next = nextState(state, failed);
    assert.equal(next.events.length, attempt === 3 ? 1 : 0);
    state = next.state;
  }
  state.checks.app.notified = true;
  let next = nextState(state, failed);
  assert.deepEqual(next.events, []);
  next = nextState(next.state, healthy);
  assert.deepEqual(next.events, []);
  next = nextState(next.state, healthy);
  assert.deepEqual(next.events, [{ name: 'app', event: 'recovery' }]);
  next.state.checks.app.notified = false;
  assert.deepEqual(nextState(next.state, healthy).events, []);
});

test('failed delivery retries, short failures do not alert, and missing media is not healthy', () => {
  let state;
  for (let i = 0; i < 3; i++) state = nextState(state, { ...healthy, media: 'unconfigured' }).state;
  assert.deepEqual(nextState(state, { ...healthy, media: 'unconfigured' }).events, [{ name: 'media', event: 'failure' }]);
  state = nextState(undefined, { ...healthy, app: 'fail' }).state;
  state = nextState(state, healthy).state;
  assert.equal(nextState(state, { ...healthy, app: 'fail' }).events.length, 0);
});

test('notifications contain only fixed check names/events and reject redirects or insecure endpoints', async () => {
  const events = [{ name: 'app', event: 'failure' }];
  let captured;
  const request = async (url, init) => { captured = init; return new Response(null, { status: 204 }); };
  assert.equal(await notify(events, 'https://alerts.example.invalid/private', request), true);
  assert.deepEqual(JSON.parse(captured.body), { text: 'Alveo monitoring: app failure' });
  assert.equal(captured.redirect, 'error');
  assert.equal(await notify(events, 'http://alerts.example.invalid', request), false);
  assert.equal(await notify(events, undefined, request), false);
  assert.equal(await notify(events, 'https://alerts.example.invalid', async () => { throw new Error('secret'); }), false);
});

test('HTTP readiness validates the body and never follows redirects', async () => {
  assert.equal(await httpProbe('https://example.invalid', true, async (url, init) => {
    assert.equal(init.redirect, 'error');
    return Response.json({ status: 'ready' });
  }), 'pass');
  assert.equal(await httpProbe('https://example.invalid', true, async () => Response.json({ status: 'unavailable' })), 'fail');
  assert.equal(await httpProbe('https://example.invalid', false, async () => new Response(null, { status: 302 })), 'fail');
  assert.equal(await httpProbe('https://example.invalid', true, async () => { throw new Error(); }), 'fail');
});

test('media check is explicitly unknown until configured and does not use a shell', async () => {
  assert.equal(await mediaProbe(undefined), 'unconfigured');
  assert.equal(await mediaProbe('echo success'), 'fail');
});
