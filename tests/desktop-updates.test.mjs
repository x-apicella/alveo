import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createDesktopUpdates } from '../desktop/updates.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(answers = []) {
  const updater = new EventEmitter();
  const calls = [];
  const messages = [];
  updater.checkForUpdates = async () => { calls.push('check'); updater.emit('update-available', { version: '0.1.40' }); };
  updater.downloadUpdate = async () => { calls.push('download'); updater.emit('update-downloaded'); };
  updater.quitAndInstall = (...args) => calls.push(['install', ...args]);
  const controller = createDesktopUpdates({
    updater, prepareInstall: () => calls.push('stop-capture'),
    prompt: async options => { messages.push(options); return { response: answers.shift() ?? 0 }; },
  });
  return { updater, calls, messages, controller };
}

test('update checks never download or restart without consent; manual check can reoffer', async () => {
  const f = fixture();
  await f.controller.check(); await tick();
  await f.controller.check(); await tick();
  assert.equal(f.messages.length, 1);
  assert.deepEqual(f.calls, ['check', 'check']);
  await f.controller.check(true); await tick();
  assert.equal(f.messages.length, 2);
  assert.equal(f.updater.autoDownload, false);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  assert.equal(f.updater.allowDowngrade, false);
});

test('download and install need separate consent and release capture before installer', async () => {
  const f = fixture([1, 0, 1]);
  await f.controller.check(); await tick();
  assert.deepEqual(f.calls, ['check', 'download']);
  assert.match(f.messages[1].detail, /ends your current call/);
  await f.controller.check(); await tick();
  assert.deepEqual(f.calls, ['check', 'download']);
  await f.controller.check(true); await tick();
  assert.deepEqual(f.calls, ['check', 'download', 'stop-capture', ['install', false, true]]);
});

test('failed background checks stay quiet; manual errors are sanitized', async () => {
  const f = fixture();
  f.updater.checkForUpdates = async () => {
    f.updater.emit('error', new Error('sensitive network details'));
    throw new Error('sensitive network details');
  };
  await f.controller.check(); await tick();
  assert.equal(f.messages.length, 0);
  await f.controller.check(true); await tick();
  assert.equal(f.messages.length, 1);
  assert.doesNotMatch(JSON.stringify(f.messages), /sensitive/);
});

test('an in-flight download prevents another check', async () => {
  const f = fixture([1, 0]);
  let complete;
  f.updater.downloadUpdate = () => new Promise(resolve => { complete = resolve; f.calls.push('download'); });
  await f.controller.check(); await tick();
  await f.controller.check(true);
  assert.deepEqual(f.calls, ['check', 'download']);
  complete(); await tick();
  await f.controller.check(true); await tick();
  assert.equal(f.calls.filter(x => x === 'check').length, 2);
});
