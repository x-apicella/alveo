#!/usr/bin/env node
import { connect } from 'node:tls';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function httpProbe(url, ready = false, request = fetch) {
  try {
    const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (response.status !== 200) return 'fail';
    if (ready && (await response.json()).status !== 'ready') return 'fail';
    await response.body?.cancel().catch(() => {});
    return 'pass';
  } catch { return 'fail'; }
}

export function tlsProbe(host) {
  return new Promise(resolveProbe => {
    let settled = false;
    const finish = status => {
      if (settled) return;
      settled = true; socket.destroy(); resolveProbe(status);
    };
    const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: true }, () => {
      const expires = Date.parse(socket.getPeerCertificate().valid_to);
      finish(socket.authorized && Number.isFinite(expires) && expires - Date.now() > 14 * 86400000 ? 'pass' : 'fail');
    });
    socket.setTimeout(10000, () => finish('fail'));
    socket.on('error', () => finish('fail'));
  });
}

export async function mediaProbe(command) {
  if (!command) return 'unconfigured';
  if (!isAbsolute(command)) return 'fail';
  return new Promise(resolveProbe => {
    // This is an operator-owned executable, never a command from the network.
    // Its output may contain tokens, so neither stdout nor stderr is retained.
    const child = spawn(command, [], { shell: false, stdio: 'ignore', timeout: 45000, killSignal: 'SIGKILL' });
    child.once('error', () => resolveProbe('fail'));
    child.once('exit', code => resolveProbe(code === 0 ? 'pass' : 'fail'));
  });
}

export const checkNames = ['app', 'livekit', 'appTls', 'livekitTls', 'turnTls', 'media'];

export function nextState(previous, checks, now = new Date().toISOString()) {
  const state = { version: 1, checkedAt: now, checks: {} };
  const events = [];
  for (const name of checkNames) {
    const status = checks[name];
    if (!['pass', 'fail', 'unconfigured'].includes(status)) throw new Error('Invalid probe result');
    const prior = previous?.checks?.[name] ?? {};
    const failures = status === 'pass' ? 0 : Math.min(3, (Number.isInteger(prior.failures) ? prior.failures : 0) + 1);
    const successes = status === 'pass' ? Math.min(2, (Number.isInteger(prior.successes) ? prior.successes : 0) + 1) : 0;
    const notified = prior.notified === true;
    state.checks[name] = { status, failures, successes, notified };
    if (failures >= 3 && !notified) events.push({ name, event: 'failure' });
    if (successes >= 2 && notified) events.push({ name, event: 'recovery' });
  }
  return { state, events };
}

export async function notify(events, webhook, request = fetch) {
  if (!events.length) return true;
  if (!webhook) return false;
  try {
    const url = new URL(webhook);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const text = 'Alveo monitoring: ' + events.map(event => `${event.name} ${event.event}`).join(', ');
    const response = await request(url, { method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(10000) });
    await response.body?.cancel().catch(() => {});
    return response.ok;
  } catch { return false; }
}

export async function main() {
  const directory = resolve(process.env.MONITOR_STATE_DIR || '.deploy/monitor');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = resolve(directory, 'lock');
  await mkdir(lock, { mode: 0o700 });
  try {
    let previous;
    try { previous = JSON.parse(await readFile(resolve(directory, 'state.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Monitor state unreadable'); }
    const values = await Promise.all([
      httpProbe('https://alveo.chat/api/health', true), httpProbe('https://livekit.alveo.chat/'),
      tlsProbe('alveo.chat'), tlsProbe('livekit.alveo.chat'), tlsProbe('turn.alveo.chat'),
      mediaProbe(process.env.MONITOR_MEDIA_CHECK),
    ]);
    const { state, events } = nextState(previous, Object.fromEntries(checkNames.map((name, i) => [name, values[i]])));
    const delivered = await notify(events, process.env.MONITOR_WEBHOOK_URL);
    if (delivered) for (const event of events) state.checks[event.name].notified = event.event === 'failure';
    await writeFile(resolve(directory, 'state.json.tmp'), JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    await rename(resolve(directory, 'state.json.tmp'), resolve(directory, 'state.json'));
    console.log(JSON.stringify({ checkedAt: state.checkedAt, checks: Object.fromEntries(checkNames.map(name => [name, state.checks[name].status])),
      pendingNotifications: delivered ? 0 : events.length }));
    if (values.some(value => value !== 'pass') || !delivered) process.exitCode = 1;
  } finally { await rm(lock, { recursive: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Monitor failed; inspect configuration, state permissions and lock ownership.'); process.exitCode = 1; });
}
