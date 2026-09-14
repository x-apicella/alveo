import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appOrigin, sameOrigin, trustedFrame, captureAllowed, capabilities } from '../desktop/policy.mjs';

test('packaged desktop always uses production; development overrides are loopback only', () => {
  assert.equal(appOrigin('http://127.0.0.1:8123', true), 'https://alveo.chat');
  assert.equal(appOrigin('http://127.0.0.1:8123', false), 'http://127.0.0.1:8123');
  for (const url of ['https://evil.test', 'http://127.0.0.1.evil.test', 'file:///tmp/index.html', 'http://user@127.0.0.1', 'http://127.0.0.1/path']) {
    assert.throws(() => appOrigin(url, false));
  }
});

test('navigation rejects lookalike hosts, credentials, wrong ports and dangerous protocols', () => {
  const origin = 'https://alveo.chat';
  assert.equal(sameOrigin(origin + '/invite/code', origin), true);
  for (const url of ['https://alveo.chat.evil.test', 'https://alveo.chat@evil.test', 'https://user@alveo.chat', 'https://alveo.chat:444', 'http://alveo.chat', 'javascript:alert(1)', 'file:///tmp/file']) {
    assert.equal(sameOrigin(url, origin), false);
  }
});

test('capture requires the live top frame, exact origin and a user gesture', () => {
  const frame = { url: 'https://alveo.chat/s/room' };
  const contents = { mainFrame: frame, isDestroyed: () => false };
  const request = { frame, securityOrigin: 'https://alveo.chat', userGesture: true, videoRequested: true };
  assert.equal(captureAllowed(request, contents, 'https://alveo.chat'), true);
  for (const override of [{ frame: null }, { frame: { ...frame } }, { userGesture: false }, { videoRequested: false }, { securityOrigin: 'https://evil.test' }]) {
    assert.equal(captureAllowed({ ...request, ...override }, contents, 'https://alveo.chat'), false);
  }
  assert.equal(trustedFrame(frame, { ...contents, isDestroyed: () => true }, 'https://alveo.chat'), false);
  frame.url = 'https://evil.test';
  assert.equal(captureAllowed(request, contents, 'https://alveo.chat'), false);
});

test('capability contract does not claim unsupported isolated or system audio', () => {
  assert.equal(capabilities.video, true);
  assert.equal(capabilities.applicationAudio, false);
  assert.equal(capabilities.independentAudio, false);
  assert.equal(capabilities.systemAudio, false);
});
