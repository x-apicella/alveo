#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const composeFiles = ['-f', 'deploy/vps/compose.yaml', '-f', 'deploy/vps/release.compose.yaml'];
const digestPattern = /^ghcr\.io\/x-apicella\/alveo@sha256:[a-f0-9]{64}$/;

export async function smoke(base, credentials, request = fetch) {
  const check = async (path, init = {}) => {
    const response = await request(base + path, {
      ...init, redirect: 'manual', signal: AbortSignal.timeout(8000),
    });
    if (response.status !== 200) throw new Error('Release smoke failed');
    return response;
  };
  const health = await check('/api/health');
  if ((await health.json()).status !== 'ready') throw new Error('Readiness failed');
  await check('/login');
  const headers = { cookie: credentials.cookie };
  const history = await check(`/api/channels/${credentials.textChannelId}/messages`, { headers });
  if (!Array.isArray((await history.json()).messages)) throw new Error('Chat smoke failed');
  const media = await check('/api/livekit/token', {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ channelId: credentials.voiceChannelId }),
  });
  const result = await media.json();
  if (typeof result.token !== 'string' || !result.token || typeof result.url !== 'string' || !result.url.startsWith('wss://')) {
    throw new Error('Media token smoke failed');
  }
}

export function readCredentials(path) {
  if ((statSync(path).mode & 0o077) !== 0) throw new Error('Smoke credentials must have mode 600');
  const value = JSON.parse(readFileSync(path, 'utf8'));
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (typeof value.cookie !== 'string' || !/^alveo_session=[^;\s]+$/.test(value.cookie) ||
      !uuid.test(value.textChannelId) || !uuid.test(value.voiceChannelId)) {
    throw new Error('Invalid smoke credentials');
  }
  return value;
}

// Exposed dependencies let tests exercise failure and recovery without production access.
export async function release({ image, revision, schemaCompatible }, io) {
  if (!digestPattern.test(image) || !/^[a-f0-9]{40}$/.test(revision) || !schemaCompatible) {
    throw new Error('Supply a GHCR digest, full commit SHA, and --schema-compatible after migration review');
  }
  await io.lock();
  let previous;
  let switched = false;
  const record = { revision, image, startedAt: new Date().toISOString(), result: 'preflight-failed' };
  try {
    previous = await io.currentImage();
    if (!/^sha256:[a-f0-9]{64}$/.test(previous)) throw new Error('Bootstrap an existing app before using release tooling');
    record.previousImage = previous;
    // Fail before any changes if the dedicated smoke account is stale or misconfigured.
    await io.healthy();
    await io.pull(image);
    if (await io.revision(image) !== revision) throw new Error('Image revision does not match the requested commit');
    switched = true; // Even a failing Compose command may have replaced the container.
    await io.activate(image);
    await io.healthy();
    record.result = 'deployed';
    await io.saveCurrent({ image, revision, previousImage: previous });
  } catch {
    if (switched) {
      try {
        await io.activate(previous);
        await io.healthy();
        record.result = 'rolled-back';
      } catch {
        record.result = 'rollback-failed';
      }
    }
    // Neither upstream error text nor HTTP bodies are safe release-log content.
    throw new Error(`Release failed: ${record.result}`);
  } finally {
    try { await io.record({ ...record, completedAt: new Date().toISOString() }); }
    finally { await io.unlock(); }
  }
}

async function main() {
  process.chdir(fileURLToPath(new URL('..', import.meta.url)));
  const [image, revision, compatibility] = process.argv.slice(2);
  const credentials = readCredentials('.deploy/release-smoke.json');
  const directory = '.deploy/releases';
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const command = (args, imageRef = image) => {
    const result = spawnSync('docker', args, {
      env: { ...process.env, ALVEO_RELEASE_IMAGE: imageRef },
      encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 * 1024,
    });
    if (result.status !== 0) throw new Error('Docker release operation failed');
    return result.stdout.trim();
  };
  const atomic = (name, value) => {
    const path = `${directory}/${name}`;
    writeFileSync(path + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    renameSync(path + '.tmp', path);
  };
  await release({ image, revision, schemaCompatible: compatibility === '--schema-compatible' }, {
    lock() {
      mkdirSync(`${directory}/lock`, { mode: 0o700 });
      writeFileSync(`${directory}/lock/owner.json`, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { mode: 0o600 });
    },
    unlock() { rmSync(`${directory}/lock`, { recursive: true }); },
    currentImage() {
      const container = command(['compose', ...composeFiles, 'ps', '-q', 'app']);
      if (!container || container.includes('\n')) throw new Error('Expected one existing app container');
      return command(['inspect', '--format', '{{.Image}}', container]);
    },
    pull(imageRef) { command(['pull', imageRef]); },
    revision(imageRef) { return command(['image', 'inspect', '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}', imageRef]); },
    activate(imageRef) {
      command(['compose', ...composeFiles, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'app'], imageRef);
    },
    async healthy() {
      for (let attempt = 0; attempt < 30; attempt++) {
        try { await smoke('http://127.0.0.1:3000', credentials); return; }
        catch { if (attempt < 29) await new Promise(r => setTimeout(r, 2000)); }
      }
      throw new Error('Release health gates failed');
    },
    saveCurrent(value) { atomic('current.json', value); },
    record(value) { atomic(`${Date.now()}-${revision}.json`, value); },
  });
  console.log('App release passed readiness, login, authenticated chat and media-token checks.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Release did not complete. Inspect the sanitized .deploy/releases record and recovery runbook.');
    process.exitCode = 1;
  });
}
