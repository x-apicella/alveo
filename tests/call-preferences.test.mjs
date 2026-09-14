import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMicrophoneGate, loadCallPreferences } from '../src/lib/call-preferences.ts';

test('a released PTT key cannot be overtaken by a pending microphone enable', async () => {
  let finish;
  const applied = [];
  const gate = createMicrophoneGate(async enabled => {
    applied.push(enabled);
    if (enabled) await new Promise(resolve => { finish = resolve; });
  }, () => assert.fail('unexpected device error'));
  gate.set(true);
  gate.set(false);
  finish();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(applied, [true, false]);
  gate.close();
});

test('leaving during pending microphone permission disables the late result', async () => {
  let finish;
  const applied = [];
  const gate = createMicrophoneGate(async enabled => {
    applied.push(enabled);
    if (enabled) await new Promise(resolve => { finish = resolve; });
  }, () => assert.fail('unexpected device error'));
  gate.set(true);
  gate.close();
  finish();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(applied, [true, false]);
});

test('failed microphone permission can be retried and storage failure is harmless', async () => {
  let failures = 0;
  let attempts = 0;
  const gate = createMicrophoneGate(async () => {
    attempts++;
    if (attempts === 1) throw new Error('denied');
  }, () => failures++);
  gate.set(true);
  await new Promise(resolve => setTimeout(resolve, 0));
  gate.set(true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(failures, 1);
  assert.equal(attempts, 2);
  gate.close();
  assert.deepEqual(loadCallPreferences(), { audio: true, video: false });
});
